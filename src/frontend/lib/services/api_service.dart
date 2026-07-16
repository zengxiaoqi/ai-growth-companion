import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show kIsWeb;

import '../utils/app_logger.dart';
import 'api_result.dart';
import 'sse_adapter.dart';

final _log = AppLogger('ApiService');

/// 默认生产环境 API 地址
const String _defaultApiUrl = 'https://lingxi.chataifree.eu.org/api';

/// 动态获取 API base URL
/// - Web: 使用当前页面同源 + /api
/// - 真机 / iOS / 桌面: 统一走 Cloudflare Tunnel 生产地址
/// - Android 模拟器本地开发时，可临时改为 http://10.0.2.2:3001/api
String getApiBaseUrl() {
  if (kIsWeb) {
    // Web 环境：从当前页面 URL 自动构建（同源 API）
    return '/api';
  }

  // 所有非 Web 平台统一走生产域名（真机、模拟器均可访问外网）
  return _defaultApiUrl;
}

class ApiService {
  final Dio _dio;
  String? _token;

  /// 401 过期回调 — 由 main.dart 设置，触发跳转登录页
  static void Function()? onAuthExpired;

  /// 运行时解析的 API base URL（由 getApiBaseUrl() 动态决定）
  static String get baseUrl => getApiBaseUrl();

  ApiService() : _dio = Dio(BaseOptions(
    baseUrl: getApiBaseUrl(),
    connectTimeout: const Duration(seconds: 30),
    receiveTimeout: const Duration(minutes: 5),
    headers: {
      'Content-Type': 'application/json',
    },
  )) {
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        return handler.next(options);
      },
      onError: (error, handler) {
        _log.warning('API Error: ${error.message}');
        // 全局 401 处理：token 过期/无效 → 触发 auth expired 回调
        if (error.response?.statusCode == 401) {
          _handleAuthExpired();
        }
        return handler.next(error);
      },
    ));
  }

  /// 处理 token 过期：清除 token，触发回调跳转登录页
  ///
  /// 重要保护：如果 _token 为 null/空，说明 token 还未从 storage 恢复
  /// （UserProvider 的 _loadUser 还没执行），此时 401 是预期的——
  /// 请求在 token 注入之前就发出了。不要在这种情况下触发登出。
  void _handleAuthExpired() {
    if (_token == null || _token!.isEmpty) {
      _log.warning('401 received but no token was set — ignoring (initial load race condition)');
      return;
    }
    _log.warning('Auth token expired — triggering logout');
    _token = null;
    _dio.interceptors.removeWhere((i) => i is _AuthInterceptor);
    if (onAuthExpired != null) {
      onAuthExpired!();
    }
  }

  Dio get dio => _dio;

  void setToken(String token) {
    _token = token;
    _dio.interceptors.removeWhere((i) => i is _AuthInterceptor);
    if (token.isNotEmpty) {
      _dio.interceptors.insert(0, _AuthInterceptor(token));
    }
  }

  /// Current auth token for use with HTTP headers (e.g., video player)
  String? get token => _token;

  // ─── API Result helpers ─────────────────────────────────────────────

  static ApiErrorType _mapDioError(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
        return ApiErrorType.networkTimeout;
      default:
        break;
    }
    final statusCode = e.response?.statusCode;
    if (statusCode != null) {
      if (statusCode == 401) return ApiErrorType.unauthorized;
      if (statusCode == 404) return ApiErrorType.notFound;
      if (statusCode >= 500) return ApiErrorType.serverError;
      if (statusCode >= 400) return ApiErrorType.clientError;
    }
    return ApiErrorType.unknown;
  }

  Future<ApiResult<T>> _wrapRequest<T>(Future<T> Function() request) async {
    try {
      final data = await request();
      return ApiSuccess(data);
    } on DioException catch (e) {
      return ApiError<T>(
        e.message ?? '网络请求失败',
        type: _mapDioError(e),
        statusCode: e.response?.statusCode,
      );
    } catch (e) {
      return ApiError<T>(e.toString(), type: ApiErrorType.unknown);
    }
  }

  // ==================== 认证 API ====================

  Future<Map<String, dynamic>> login(String phone, String password) async {
    try {
      final response = await _dio.post('/auth/login', data: {
        'phone': phone,
        'password': password,
      });
      return response.data;
    } on DioException catch (e) {
      // Extract user-friendly error message from API response
      final data = e.response?.data;
      if (data is Map && data['message'] != null) {
        return {'error': data['message'].toString()};
      }
      return {'error': '网络错误，请检查网络后重试'};
    } catch (e) {
      return {'error': '登录失败，请稍后重试'};
    }
  }

  /// 孩子快捷登录（通过6位登录验证码）
  Future<Map<String, dynamic>> childLogin(String loginCode) async {
    try {
      final response = await _dio.post('/auth/child-login', data: {
        'loginCode': loginCode,
      });
      return response.data;
    } on DioException catch (e) {
      final data = e.response?.data;
      if (data is Map && data['message'] != null) {
        return {'error': data['message'].toString()};
      }
      return {'error': '网络错误，请检查网络后重试'};
    } catch (e) {
      return {'error': '登录失败，请稍后重试'};
    }
  }

  Future<Map<String, dynamic>> register(Map<String, dynamic> userData) async {
    try {
      final response = await _dio.post('/auth/register', data: userData);
      return response.data;
    } on DioException catch (e) {
      final data = e.response?.data;
      if (data is Map && data['message'] != null) {
        return {'error': data['message'].toString()};
      }
      return {'error': '网络错误，请检查网络后重试'};
    } catch (e) {
      return {'error': '注册失败，请稍后重试'};
    }
  }

  /// 获取当前登录用户信息
  Future<Map<String, dynamic>?> getProfile() async {
    try {
      final response = await _dio.get('/auth/profile');
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('Get profile error: $e');
      return null;
    }
  }

  /// 家长切换到孩子模式（无需密码验证）
  /// [childId] 可选，指定切换到哪个孩子；不传则自动选第一个
  Future<Map<String, dynamic>> switchToChild({int? childId}) async {
    try {
      final data = <String, dynamic>{};
      if (childId != null) data['childId'] = childId;
      final response = await _dio.post('/auth/switch-to-child', data: data);
      return response.data;
    } on DioException catch (e) {
      final d = e.response?.data;
      if (d is Map && d['message'] != null) {
        return {'error': d['message'].toString()};
      }
      return {'error': '切换失败，请稍后重试'};
    } catch (e) {
      return {'error': '切换失败，请稍后重试'};
    }
  }

  /// 孩子切换到家长模式（需要家长登录密码验证）
  Future<Map<String, dynamic>> switchToParent(String password) async {
    try {
      final response = await _dio.post('/auth/switch-to-parent', data: {'password': password});
      return response.data;
    } on DioException catch (e) {
      final d = e.response?.data;
      if (d is Map && d['message'] != null) {
        return {'error': d['message'].toString()};
      }
      return {'error': '切换失败，请稍后重试'};
    } catch (e) {
      return {'error': '切换失败，请稍后重试'};
    }
  }

  // ==================== 用户 API ====================

  // 获取当前家长的孩子列表（从 token 获取 parentId）
  Future<List<dynamic>> getChildren() async {
    try {
      final response = await _dio.get('/users/children');
      if (response.data is List) {
        return response.data as List<dynamic>;
      }
      return [];
    } catch (e) {
      _log.warning('Get children error: $e');
      return [];
    }
  }

  // 兼容旧接口：通过 parentId 获取孩子列表（内部调用 getChildren）
  Future<List<dynamic>> getChildrenByParent(int parentId) async {
    return getChildren();
  }

  // 添加孩子
  Future<Map<String, dynamic>?> addChild({
    required String name,
    String? phone,
    int? age,
    String? gender,
  }) async {
    try {
      final data = <String, dynamic>{'name': name};
      if (phone != null) data['phone'] = phone;
      if (age != null) data['age'] = age;
      if (gender != null) data['gender'] = gender;
      
      final response = await _dio.post('/users/child', data: data);
      return response.data as Map<String, dynamic>?;
    } catch (e) {
      _log.warning('Add child error: $e');
      return null;
    }
  }

  // 更新孩子信息
  Future<Map<String, dynamic>?> updateChild(int childId, {
    String? name,
    String? phone,
    int? age,
    String? gender,
  }) async {
    try {
      final data = <String, dynamic>{};
      if (name != null) data['name'] = name;
      if (phone != null) data['phone'] = phone;
      if (age != null) data['age'] = age;
      if (gender != null) data['gender'] = gender;
      
      final response = await _dio.put('/users/child/$childId', data: data);
      return response.data as Map<String, dynamic>?;
    } catch (e) {
      _log.warning('Update child error: $e');
      return null;
    }
  }

  // 删除孩子
  Future<bool> deleteChild(int childId) async {
    try {
      final response = await _dio.delete('/users/child/$childId');
      return response.statusCode == 200;
    } catch (e) {
      _log.warning('Delete child error: $e');
      return false;
    }
  }

  Future<Map<String, dynamic>> updateUser(int userId, Map<String, dynamic> data) async {
    try {
      final response = await _dio.put('/users/$userId', data: data);
      return response.data;
    } catch (e) {
      _log.warning('Update user error: $e');
      return {'error': e.toString()};
    }
  }

  Future<Map<String, dynamic>?> getUserById(int userId) async {
    try {
      final response = await _dio.get('/users/$userId');
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('Get user error: $e');
      return null;
    }
  }

  /// 绑定已有孩子账号（需要孩子的登录验证码）
  Future<Map<String, dynamic>?> linkChild(String childPhone, String loginCode) async {
    try {
      final response = await _dio.post('/users/link-child', data: {
        'childPhone': childPhone,
        'loginCode': loginCode,
      });
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('Link child error: $e');
      return null;
    }
  }

  /// 重新生成孩子的登录验证码
  Future<Map<String, dynamic>?> regenerateLoginCode(int childId) async {
    try {
      final response = await _dio.post('/users/child/$childId/regenerate-code');
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('Regenerate loginCode error: $e');
      return null;
    }
  }

  /// 设置自定义登录验证码
  Future<Map<String, dynamic>?> setLoginCode(int childId, String loginCode) async {
    try {
      final response = await _dio.post('/users/child/$childId/set-code', data: {
        'loginCode': loginCode,
      });
      return response.data as Map<String, dynamic>;
    } on DioException catch (e) {
      final data = e.response?.data;
      if (data is Map && data['message'] != null) {
        return {'error': data['message'].toString()};
      }
      return {'error': '网络错误，请稍后重试'};
    } catch (e) {
      _log.warning('Set loginCode error: $e');
      return {'error': '设置失败，请稍后重试'};
    }
  }

  // ==================== 内容 API ====================

  Future<List<dynamic>> getContents({
    String? ageRange,
    String? domain,
    int? childId,
    int page = 1,
    int limit = 20,
  }) async {
    try {
      final response = await _dio.get('/contents', queryParameters: {
        if (ageRange != null) 'age_range': ageRange,
        if (domain != null) 'domain': domain,
        if (childId != null) 'childId': childId,
        'page': page,
        'limit': limit,
      });
      return response.data['list'] ?? [];
    } catch (e) {
      _log.warning('Get contents error: $e');
      return [];
    }
  }

  Future<ApiResult<Map<String, dynamic>>> getContentDetailResult(int contentId) {
    return _wrapRequest(() async {
      final response = await _dio.get('/contents/$contentId');
      return response.data as Map<String, dynamic>;
    });
  }

  Future<Map<String, dynamic>?> getContentDetail(int contentId) async {
    final result = await getContentDetailResult(contentId);
    if (result is ApiSuccess<Map<String, dynamic>>) return result.data;
    _log.warning('Get content detail error: ${(result as ApiError).message}');
    return null;
  }

  // ==================== 学习记录 API ====================

  /// 开始学习
  Future<ApiResult<Map<String, dynamic>>> startLearningResult({
    required int childId,
    required int contentId,
  }) {
    return _wrapRequest(() async {
      final response = await _dio.post('/learning/start', data: {
        'childId': childId,
        'contentId': contentId,
      });
      return response.data as Map<String, dynamic>;
    });
  }

  Future<Map<String, dynamic>?> startLearning({
    required int childId,
    required int contentId,
  }) async {
    final result = await startLearningResult(childId: childId, contentId: contentId);
    if (result is ApiSuccess<Map<String, dynamic>>) return result.data;
    _log.warning('Start learning error: ${(result as ApiError).message}');
    return null;
  }

  /// 完成学习
  Future<ApiResult<Map<String, dynamic>>> completeLearningResult({
    required int recordId,
    int? score,
    int? durationSeconds,
    String? feedback,
  }) {
    return _wrapRequest(() async {
      final response = await _dio.post('/learning/complete/$recordId', data: {
        if (score != null) 'score': score,
        if (durationSeconds != null) 'durationSeconds': durationSeconds,
        if (feedback != null) 'feedback': feedback,
      });
      return response.data as Map<String, dynamic>;
    });
  }

  Future<Map<String, dynamic>?> completeLearning({
    required int recordId,
    int? score,
    int? durationSeconds,
    String? feedback,
  }) async {
    final result = await completeLearningResult(
      recordId: recordId, score: score, durationSeconds: durationSeconds, feedback: feedback,
    );
    if (result is ApiSuccess<Map<String, dynamic>>) return result.data;
    _log.warning('Complete learning error: ${(result as ApiError).message}');
    return null;
  }

  /// 获取学习历史 [FIXED: was /learning/records, now /learning/history/:userId]
  Future<ApiResult<List<dynamic>>> getLearningHistoryResult(int userId, {int limit = 10}) {
    return _wrapRequest(() async {
      final response = await _dio.get('/learning/history/$userId',
          queryParameters: {'limit': limit});
      final data = response.data;
      if (data is List) return data;
      if (data is Map && data['list'] is List) return data['list'] as List<dynamic>;
      return <dynamic>[];
    });
  }

  Future<List<dynamic>> getLearningHistory(int userId, {int limit = 10}) async {
    final result = await getLearningHistoryResult(userId, limit: limit);
    if (result is ApiSuccess<List<dynamic>>) return result.data;
    _log.warning('Get learning history error: ${(result as ApiError).message}');
    return [];
  }

  /// 记录互动学习活动（AI 对话等）
  Future<Map<String, dynamic>?> recordActivity({
    required int childId,
    required String domain,
    required int score,
    int? durationSeconds,
    String? sessionId,
    String? activityType,
    Map<String, dynamic>? interactionData,
    String? topic,
  }) async {
    try {
      final response = await _dio.post('/learning/record-activity', data: {
        'childId': childId,
        'domain': domain,
        'score': score,
        if (durationSeconds != null) 'durationSeconds': durationSeconds,
        if (sessionId != null) 'sessionId': sessionId,
        if (activityType != null) 'activityType': activityType,
        if (interactionData != null) 'interactionData': interactionData,
        if (topic != null) 'topic': topic,
      });
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('Record activity error: $e');
      return null;
    }
  }

  /// 今日学习统计
  Future<Map<String, dynamic>?> getTodayStats(int userId) async {
    try {
      final response = await _dio.get('/learning/today/$userId');
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('Get today stats error: $e');
      return null;
    }
  }

  /// 今日学习统计（含来源分类）
  Future<Map<String, dynamic>?> getTodayStatsDetail(int userId) async {
    try {
      final response = await _dio.get('/learning/today-detail/$userId');
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('Get today detail error: $e');
      return null;
    }
  }

  /// 学习积分历史
  Future<Map<String, dynamic>?> getLearningPoints(int childId, {
    String? domain, String? status, String? from, String? to,
    int page = 1, int limit = 20,
  }) async {
    try {
      final response = await _dio.get('/learning/points/$childId', queryParameters: {
        if (domain != null) 'domain': domain,
        if (status != null) 'status': status,
        if (from != null) 'from': from,
        if (to != null) 'to': to,
        'page': page,
        'limit': limit,
      });
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('Get learning points error: $e');
      return null;
    }
  }

  /// 错题本
  Future<Map<String, dynamic>?> getWrongQuestions(int childId, {
    String? domain, String? status, int page = 1, int limit = 20,
  }) async {
    try {
      final response = await _dio.get('/learning/wrong-questions/$childId',
          queryParameters: {
            if (domain != null) 'domain': domain,
            if (status != null) 'status': status,
            'page': page,
            'limit': limit,
          });
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('Get wrong questions error: $e');
      return null;
    }
  }

  // ═══ 课程步骤进度 ═══

  Future<ApiResult<Map<String, dynamic>>> getLessonProgressResult({
    required int contentId,
    required int childId,
  }) {
    return _wrapRequest(() async {
      final response = await _dio.get(
        '/learning/lessons/$contentId/progress',
        queryParameters: {'childId': childId},
      );
      return response.data as Map<String, dynamic>;
    });
  }

  Future<Map<String, dynamic>?> getLessonProgress({
    required int contentId,
    required int childId,
  }) async {
    final result = await getLessonProgressResult(contentId: contentId, childId: childId);
    if (result is ApiSuccess<Map<String, dynamic>>) return result.data;
    _log.warning('Get lesson progress error: ${(result as ApiError).message}');
    return null;
  }

  Future<ApiResult<Map<String, dynamic>>> completeLessonStepResult({
    required int contentId,
    required String stepId,
    required int childId,
    int? score,
    int? durationSeconds,
    Map<String, dynamic>? interactionData,
  }) {
    return _wrapRequest(() async {
      final response = await _dio.post(
        '/learning/lessons/$contentId/complete-step',
        data: {
          'childId': childId,
          'stepId': stepId,
          if (score != null) 'score': score,
          if (durationSeconds != null) 'durationSeconds': durationSeconds,
          if (interactionData != null) 'interactionData': interactionData,
        },
      );
      return response.data as Map<String, dynamic>;
    });
  }

  Future<Map<String, dynamic>?> completeLessonStep({
    required int contentId,
    required String stepId,
    required int childId,
    int? score,
    int? durationSeconds,
    Map<String, dynamic>? interactionData,
  }) async {
    final result = await completeLessonStepResult(
      contentId: contentId, stepId: stepId, childId: childId,
      score: score, durationSeconds: durationSeconds, interactionData: interactionData,
    );
    if (result is ApiSuccess<Map<String, dynamic>>) return result.data;
    _log.warning('Complete lesson step error: ${(result as ApiError).message}');
    return null;
  }

  // ═══ 课程草稿 / 生成 ═══

  Future<List<dynamic>> getDraftLessons(int childId) async {
    try {
      final response = await _dio.get('/learning/lessons/drafts',
          queryParameters: {'childId': childId});
      if (response.data is List) return response.data as List<dynamic>;
      return [];
    } catch (e) {
      _log.warning('Get draft lessons error: $e');
      return [];
    }
  }

  /// 生成结构化课程 [FIXED: was /lessons/generate, now /learning/lessons/generate]
  Future<Map<String, dynamic>?> generateLesson({
    required String topic,
    required int childId,
    String? domain,
    String focus = 'mixed',
    String ageGroup = '5-6',
    int difficulty = 1,
    int durationMinutes = 20,
    String? parentPrompt,
  }) async {
    try {
      final response = await _dio.post('/learning/lessons/generate', data: {
        'topic': topic,
        'childId': childId,
        if (domain != null) 'domain': domain,
        'focus': focus,
        'ageGroup': ageGroup,
        'difficulty': difficulty,
        'durationMinutes': durationMinutes,
        if (parentPrompt != null) 'parentPrompt': parentPrompt,
      });
      if (response.data is Map<String, dynamic>) return response.data as Map<String, dynamic>;
      if (response.data is Map) return (response.data as Map).map((k, v) => MapEntry(k.toString(), v));
      return null;
    } catch (e) {
      _log.warning('Generate lesson error: $e');
      return null;
    }
  }

  /// 修改课程草稿 [FIXED: was POST /lessons/:id/edit, now PATCH /learning/lessons/:id]
  Future<Map<String, dynamic>?> modifyLesson(int contentId, String modification, {String? stepId}) async {
    try {
      final response = await _dio.patch('/learning/lessons/$contentId', data: {
        'modification': modification,
        if (stepId != null) 'stepId': stepId,
      });
      if (response.data is Map<String, dynamic>) return response.data as Map<String, dynamic>;
      if (response.data is Map) return (response.data as Map).map((k, v) => MapEntry(k.toString(), v));
      return null;
    } catch (e) {
      _log.warning('Modify lesson error: $e');
      return null;
    }
  }

  /// 确认并发布课程 [FIXED: was /lessons/:id/confirm]
  Future<Map<String, dynamic>?> confirmLesson(int contentId, int childId) async {
    try {
      final response = await _dio.post('/learning/lessons/$contentId/confirm', data: {
        'childId': childId,
      });
      if (response.data is Map<String, dynamic>) return response.data as Map<String, dynamic>;
      if (response.data is Map) return (response.data as Map).map((k, v) => MapEntry(k.toString(), v));
      return null;
    } catch (e) {
      _log.warning('Confirm lesson error: $e');
      return null;
    }
  }

  /// 学习计划历史
  Future<Map<String, dynamic>?> getStudyPlans(int childId, {
    String? sourceType, int page = 1, int limit = 20,
  }) async {
    try {
      final response = await _dio.get('/learning/plans/$childId', queryParameters: {
        if (sourceType != null) 'sourceType': sourceType,
        'page': page,
        'limit': limit,
      });
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('Get study plans error: $e');
      return null;
    }
  }

  // ═══ 教学视频 ═══

  Future<Map<String, dynamic>?> createTeachingVideoTask(int lessonId, int childId, {bool force = false}) async {
    try {
      final response = await _dio.post('/learning/lessons/$lessonId/teaching-video/tasks', data: {
        'childId': childId,
        'force': force,
      });
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('Create video task error: $e');
      return null;
    }
  }

  Future<Map<String, dynamic>?> getTeachingVideoTaskStatus(int lessonId, int taskId, int childId) async {
    try {
      final response = await _dio.get(
        '/learning/lessons/$lessonId/teaching-video/tasks/$taskId',
        queryParameters: {'childId': childId},
      );
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('Get video task error: $e');
      return null;
    }
  }

  Future<Map<String, dynamic>?> getVideoStatus(int lessonId, int childId, {int? taskId}) async {
    try {
      final response = await _dio.get(
        '/learning/lessons/$lessonId/video-status',
        queryParameters: {'childId': childId, if (taskId != null) 'taskId': taskId},
      );
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('Get video status error: $e');
      return null;
    }
  }

  /// Get the full video playback URL (token passed separately via httpHeaders)
  String getLessonVideoPlaybackUrl(int lessonId, int childId) {
    // On Flutter Web, the <video> element cannot send Authorization headers.
    // Append the JWT token as a query parameter so the backend can authenticate.
    final base = '$baseUrl/learning/lessons/$lessonId/teaching-video?childId=$childId';
    if (_token != null && _token!.isNotEmpty) {
      return '$base&token=${Uri.encodeComponent(_token!)}';
    }
    return base;
  }

  Future<Map<String, dynamic>?> approveVideo(int lessonId, int childId, bool approved, {String? feedback, int? taskId}) async {
    try {
      final response = await _dio.post('/learning/lessons/$lessonId/video-approve', data: {
        'childId': childId,
        'approved': approved,
        if (feedback != null) 'feedback': feedback,
        if (taskId != null) 'taskId': taskId,
      });
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('Approve video error: $e');
      return null;
    }
  }

  // ═══ 快速视频生成 ═══

  /// 一键生成教学视频（AI 自动生成内容并入队渲染）
  Future<Map<String, dynamic>?> quickGenerateVideo({
    required String topic,
    required String ageGroup,
    required int childId,
    int? durationSec,
    String? style,
    bool force = false,
    String? renderEngine,
  }) async {
    try {
      final response = await _dio.post('/learning/video/quick-generate', data: {
        'topic': topic,
        'ageGroup': ageGroup,
        'childId': childId,
        if (durationSec != null) 'durationSec': durationSec,
        if (style != null) 'style': style,
        'force': force,
        if (renderEngine != null) 'renderEngine': renderEngine,
      });
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('Quick generate video error: $e');
      return null;
    }
  }

  /// 查询快速视频生成任务状态
  Future<Map<String, dynamic>?> getQuickVideoTaskStatus(int contentId, int taskId, int childId) async {
    try {
      final response = await _dio.get(
        '/learning/lessons/$contentId/teaching-video/tasks/$taskId',
        queryParameters: {'childId': childId},
      );
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('Get quick video task status error: $e');
      return null;
    }
  }

  /// 获取快速生成视频的播放 URL
  String getQuickVideoPlaybackUrl(int contentId, int childId, {int? taskId}) {
    final params = 'childId=$childId';
    final withTask = taskId != null ? '$params&taskId=$taskId' : params;
    return '$baseUrl/learning/lessons/$contentId/teaching-video?$withTask';
  }

  // ==================== 游戏 API ====================

  Future<List<dynamic>> getGameList({String ageRange = '3-4'}) async {
    try {
      final response = await _dio.get('/game/list', queryParameters: {'ageRange': ageRange});
      if (response.data is List) return response.data as List<dynamic>;
      return [];
    } catch (e) {
      _log.warning('Get game list error: $e');
      return [];
    }
  }

  Future<Map<String, dynamic>?> getGameData({required String gameId, int difficulty = 1}) async {
    try {
      final response = await _dio.get('/game/$gameId', queryParameters: {'difficulty': difficulty});
      if (response.data is Map<String, dynamic>) return response.data as Map<String, dynamic>;
      if (response.data is Map) return (response.data as Map).map((k, v) => MapEntry(k.toString(), v));
      return null;
    } catch (e) {
      _log.warning('Get game data error: $e');
      return null;
    }
  }

  Future<Map<String, dynamic>?> saveGameResult({
    required int userId,
    required String gameId,
    required int score,
    required int timeSpent,
    required int correctAnswers,
    required int totalQuestions,
  }) async {
    try {
      final response = await _dio.post('/game/result', data: {
        'userId': userId,
        'gameId': gameId,
        'score': score,
        'timeSpent': timeSpent,
        'correctAnswers': correctAnswers,
        'totalQuestions': totalQuestions,
      });
      if (response.data is Map<String, dynamic>) return response.data as Map<String, dynamic>;
      if (response.data is Map) return (response.data as Map).map((k, v) => MapEntry(k.toString(), v));
      return null;
    } catch (e) {
      _log.warning('Save game result error: $e');
      return null;
    }
  }

  Future<Map<String, dynamic>?> getGameLevelInfo(int userId) async {
    try {
      final response = await _dio.get('/game/level/$userId');
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('Get game level error: $e');
      return null;
    }
  }

  // ==================== 能力评估 API ====================

  Future<List<dynamic>> getAbilityAssessment(int userId) async {
    try {
      final response = await _dio.get('/abilities/$userId');
      if (response.data is List) return response.data as List<dynamic>;
      return [];
    } catch (e) {
      _log.warning('Get ability assessment error: $e');
      return [];
    }
  }

  Future<Map<String, dynamic>?> createAbilityAssessment({
    required int userId,
    required String domain,
    required int score,
  }) async {
    try {
      final response = await _dio.post('/abilities', data: {
        'userId': userId,
        'domain': domain,
        'score': score,
      });
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('Create ability error: $e');
      return null;
    }
  }

  // ==================== 报告 API ====================

  Future<Map<String, dynamic>?> getReport({required int userId, String period = 'weekly'}) async {
    return getGrowthReport(userId: userId, period: period);
  }

  Future<Map<String, dynamic>?> getGrowthReport({required int userId, String period = 'weekly'}) async {
    try {
      final response = await _dio.get('/report', queryParameters: {'userId': userId, 'period': period});
      if (response.data is Map<String, dynamic>) return response.data as Map<String, dynamic>;
      if (response.data is Map) return (response.data as Map).map((k, v) => MapEntry(k.toString(), v));
      return null;
    } catch (e) {
      _log.warning('Get growth report error: $e');
      return null;
    }
  }

  Future<List<dynamic>> getAbilityTrend(int userId, {int weeks = 6}) async {
    try {
      final response = await _dio.get('/report/trend', queryParameters: {'userId': userId, 'weeks': weeks});
      if (response.data is List) return response.data as List<dynamic>;
      return [];
    } catch (e) {
      _log.warning('Get ability trend error: $e');
      return [];
    }
  }

  Future<List<dynamic>> getRecentSkills(int userId, {int limit = 3}) async {
    try {
      final response = await _dio.get('/report/recent-skills',
          queryParameters: {'userId': userId, 'limit': limit});
      if (response.data is List) return response.data as List<dynamic>;
      return [];
    } catch (e) {
      _log.warning('Get recent skills error: $e');
      return [];
    }
  }

  // ==================== 成就 API ====================

  /// [FIXED: now uses correct endpoint /achievements/user/:userId]
  Future<List<dynamic>> getAchievements(int userId) async {
    try {
      final response = await _dio.get('/achievements/user/$userId');
      if (response.data is List) return response.data as List<dynamic>;
      return [];
    } catch (e) {
      _log.warning('Get achievements error: $e');
      return [];
    }
  }

  // ==================== 家长控制 API ====================

  Future<Map<String, dynamic>?> getParentControls(int parentId) async {
    try {
      final response = await _dio.get('/parent/controls/$parentId');
      if (response.data is Map<String, dynamic>) return response.data as Map<String, dynamic>;
      if (response.data is Map) return (response.data as Map).map((k, v) => MapEntry(k.toString(), v));
      return null;
    } catch (e) {
      _log.warning('Get parent controls error: $e');
      return null;
    }
  }

  Future<void> updateParentControls(int parentId, Map<String, dynamic> controls) async {
    try {
      await _dio.patch('/parent/controls/$parentId', data: controls);
    } catch (e) {
      _log.warning('Update parent controls error: $e');
    }
  }

  // ==================== 通知 API ====================

  /// [FIXED: was missing userId param]
  Future<Map<String, dynamic>> getNotifications(int userId, {int limit = 20}) async {
    try {
      final response = await _dio.get('/notifications/$userId', queryParameters: {'limit': limit});
      final data = response.data;
      if (data is Map<String, dynamic>) return data;
      if (data is Map) return data.map((k, v) => MapEntry(k.toString(), v));
      return {};
    } catch (e) {
      _log.warning('Get notifications error: $e');
      return {};
    }
  }

  Future<int> getUnreadNotificationCount(int userId) async {
    try {
      final response = await _dio.get('/notifications/$userId/unread-count');
      return response.data['count'] as int? ?? 0;
    } catch (e) {
      _log.warning('Get unread count error: $e');
      return 0;
    }
  }

  /// [FIXED: was PUT /notifications/:id/read, now POST]
  Future<void> markNotificationRead(int id) async {
    try {
      await _dio.post('/notifications/$id/read');
    } catch (e) {
      _log.warning('Mark notification read error: $e');
    }
  }

  /// [FIXED: was PUT /notifications/read-all, now correct POST endpoint]
  Future<void> markAllNotificationsRead(int userId) async {
    try {
      await _dio.post('/notifications/user/$userId/read-all');
    } catch (e) {
      _log.warning('Mark all notifications read error: $e');
    }
  }

  // ==================== 作业管理 API ====================

  Future<List<dynamic>> getAssignmentsByParent(int parentId) async {
    try {
      final response = await _dio.get('/assignments/parent/$parentId');
      if (response.data is List) return response.data as List<dynamic>;
      return [];
    } catch (e) {
      _log.warning('Get assignments error: $e');
      return [];
    }
  }

  Future<List<dynamic>> getAssignmentsByChild(int childId) async {
    try {
      final response = await _dio.get('/assignments/child/$childId');
      if (response.data is List) return response.data as List<dynamic>;
      return [];
    } catch (e) {
      _log.warning('Get child assignments error: $e');
      return [];
    }
  }

  Future<Map<String, dynamic>?> getAssignmentById(int id) async {
    try {
      final response = await _dio.get('/assignments/$id');
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('Get assignment error: $e');
      return null;
    }
  }

  Future<Map<String, dynamic>?> createAssignment(Map<String, dynamic> data) async {
    try {
      final response = await _dio.post('/assignments', data: data);
      if (response.data is Map<String, dynamic>) return response.data as Map<String, dynamic>;
      if (response.data is Map) return (response.data as Map).map((k, v) => MapEntry(k.toString(), v));
      return null;
    } catch (e) {
      _log.warning('Create assignment error: $e');
      return null;
    }
  }

  Future<Map<String, dynamic>?> updateAssignment(int id, Map<String, dynamic> data) async {
    try {
      final response = await _dio.patch('/assignments/$id', data: data);
      if (response.data is Map<String, dynamic>) return response.data as Map<String, dynamic>;
      if (response.data is Map) return (response.data as Map).map((k, v) => MapEntry(k.toString(), v));
      return null;
    } catch (e) {
      _log.warning('Update assignment error: $e');
      return null;
    }
  }

  Future<bool> deleteAssignment(int id) async {
    try {
      await _dio.delete('/assignments/$id');
      return true;
    } catch (e) {
      _log.warning('Delete assignment error: $e');
      return false;
    }
  }

  /// 孩子完成作业
  Future<Map<String, dynamic>?> completeAssignment(int id, int score, {Map<String, dynamic>? resultData}) async {
    try {
      final response = await _dio.post('/assignments/$id/complete', data: {
        'score': score,
        if (resultData != null) 'resultData': resultData,
      });
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('Complete assignment error: $e');
      return null;
    }
  }

  // ==================== 课程包 API ====================

  Future<Map<String, dynamic>?> generateCoursePack({
    required String topic,
    required int childId,
    String focus = 'mixed',
    int durationMinutes = 20,
    bool includeGame = true,
    bool includeAudio = true,
    bool includeVideo = true,
    String? parentPrompt,
  }) async {
    try {
      final response = await _dio.post('/ai/course-pack', data: {
        'topic': topic,
        'parentPrompt': parentPrompt ?? topic,
        'childId': childId,
        'focus': focus,
        'durationMinutes': durationMinutes,
        'includeGame': includeGame,
        'includeAudio': includeAudio,
        'includeVideo': includeVideo,
      });
      if (response.data is Map<String, dynamic>) return response.data as Map<String, dynamic>;
      if (response.data is Map) return (response.data as Map).map((k, v) => MapEntry(k.toString(), v));
      return null;
    } catch (e) {
      _log.warning('Generate course pack error: $e');
      return null;
    }
  }

  Future<List<dynamic>> getCoursePacks(int childId, {int page = 1, int limit = 20}) async {
    try {
      final response = await _dio.get('/ai/course-packs',
          queryParameters: {'childId': childId, 'page': page, 'limit': limit});
      final data = response.data;
      if (data is Map && data['list'] is List) return data['list'] as List<dynamic>;
      if (data is List) return data;
      return [];
    } catch (e) {
      _log.warning('Get course packs error: $e');
      return [];
    }
  }

  Future<Map<String, dynamic>?> getCoursePackById(int id) async {
    try {
      final response = await _dio.get('/ai/course-packs/$id');
      if (response.data is Map<String, dynamic>) return response.data as Map<String, dynamic>;
      if (response.data is Map) return (response.data as Map).map((k, v) => MapEntry(k.toString(), v));
      return null;
    } catch (e) {
      _log.warning('Get course pack by id error: $e');
      return null;
    }
  }

  Future<Map<String, dynamic>?> exportCoursePack(int id, {String format = 'bundle_zip'}) async {
    try {
      final response = await _dio.get('/ai/course-packs/$id/export', queryParameters: {'format': format});
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('Export course pack error: $e');
      return null;
    }
  }

  /// 批量导出课程包
  Future<Map<String, dynamic>?> exportCoursePacksBatch(List<int> ids, {List<String>? formats}) async {
    try {
      final response = await _dio.post('/ai/course-packs/export-batch', data: {
        'ids': ids,
        if (formats != null) 'formats': formats,
      });
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('Batch export error: $e');
      return null;
    }
  }

  /// 课程包版本历史
  Future<List<dynamic>> getCoursePackVersions(int id, {int page = 1, int limit = 20}) async {
    try {
      final response = await _dio.get('/ai/course-packs/$id/versions',
          queryParameters: {'page': page, 'limit': limit});
      if (response.data is List) return response.data as List<dynamic>;
      return [];
    } catch (e) {
      _log.warning('Get versions error: $e');
      return [];
    }
  }

  /// 保存课程包编辑为新版本
  Future<Map<String, dynamic>?> saveCoursePackVersion(int id, {
    String? title,
    Map<String, dynamic>? planContent,
    String? note,
    String? sessionId,
  }) async {
    try {
      final response = await _dio.patch('/ai/course-packs/$id', data: {
        if (title != null) 'title': title,
        if (planContent != null) 'planContent': planContent,
        if (note != null) 'note': note,
        if (sessionId != null) 'sessionId': sessionId,
      });
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('Save version error: $e');
      return null;
    }
  }

  /// 双语润色
  Future<Map<String, dynamic>?> enrichCoursePackBilingual(int id) async {
    try {
      final response = await _dio.post('/ai/course-packs/$id/enrich-bilingual');
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('Enrich bilingual error: $e');
      return null;
    }
  }

  /// 生成一周学习计划
  Future<Map<String, dynamic>?> generateWeeklyPlan({
    required String topic,
    required int childId,
    String? startDate,
  }) async {
    try {
      final response = await _dio.post('/ai/course-packs/generate-weekly', data: {
        'topic': topic,
        'childId': childId,
        if (startDate != null) 'startDate': startDate,
      });
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('Generate weekly plan error: $e');
      return null;
    }
  }

  /// AI 批改
  Future<Map<String, dynamic>?> evaluateAnswer({
    required int contentId,
    required List<dynamic> answers,
    int age = 5,
  }) async {
    try {
      final response = await _dio.post('/ai/evaluate', data: {
        'contentId': contentId,
        'answers': answers,
        'age': age,
      });
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('Evaluate error: $e');
      return null;
    }
  }

  /// AI 生成测验
  Future<Map<String, dynamic>?> generateQuiz({
    required int childId,
    required String topic,
    int count = 5,
  }) async {
    try {
      final response = await _dio.post('/ai/quiz', data: {
        'childId': childId,
        'topic': topic,
        'count': count,
      });
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('Generate quiz error: $e');
      return null;
    }
  }

  /// AI 生成故事
  Future<Map<String, dynamic>?> generateStory({
    required int childId,
    String? theme,
    String ageRange = '3-4',
  }) async {
    try {
      final response = await _dio.post('/ai/story', data: {
        'childId': childId,
        if (theme != null) 'theme': theme,
        'ageRange': ageRange,
      });
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('Generate story error: $e');
      return null;
    }
  }

  // ==================== AI 推荐 & 建议 ====================

  /// [FIXED: was GET /ai/suggestion?userId=, now correct params]
  Future<Map<String, dynamic>?> getAISuggestion({String ageRange = '5-6'}) async {
    try {
      final response = await _dio.get('/ai/suggest', queryParameters: {'ageRange': ageRange});
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('Get AI suggestion error: $e');
      return null;
    }
  }

  /// 垂直领域内容推荐（新版 recommend 端点）
  Future<List<dynamic>> getRecommendations(int userId, {String ageRange = '3-4'}) async {
    try {
      final response = await _dio.get('/recommend', queryParameters: {
        'userId': userId,
        'ageRange': ageRange,
      });
      if (response.data is List) return response.data as List<dynamic>;
      if (response.data is Map && response.data['list'] is List) {
        return response.data['list'] as List<dynamic>;
      }
      return [];
    } catch (e) {
      _log.warning('Get recommendations error: $e');
      return [];
    }
  }

  // ==================== AI 对话 ====================

  Future<Map<String, dynamic>?> sendAIChatMessage(String message, {int? childId, String? sessionId}) async {
    try {
      final response = await _dio.post('/ai/chat', data: {
        'message': message,
        if (childId != null) 'childId': childId,
        if (sessionId != null) 'sessionId': sessionId,
      });
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('AI chat error: $e');
      return null;
    }
  }

  /// AI 对话流式输出（SSE）
  /// 返回一个 `Stream<Map<String, dynamic>>`，每个 event 包含 type 和相关字段。
  /// 事件类型: thinking, tool_start, tool_result, token, game_data, done, error
  ///
  /// 重要：Web 平台通过 [fetchSseStream] 使用浏览器原生 fetch + ReadableStream，
  /// 绕过 Dio Web adapter (XMLHttpRequest) 不支持流式的问题。
  Stream<Map<String, dynamic>> sendAIChatMessageStream(
    String message, {
    int? childId,
    String? sessionId,
  }) {
    // Web: 需要完整路径给 fetch()（Dio 不参与 Web SSE）
    // 非 Web: 只给相对路径，Dio 的 baseUrl 会自动拼接
    final url = kIsWeb
        ? '$baseUrl/ai/chat/stream'
        : '/ai/chat/stream';
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    };
    if (_token != null && _token!.isNotEmpty) {
      headers['Authorization'] = 'Bearer $_token';
    }

    final body = <String, dynamic>{
      'message': message,
      if (childId != null) 'childId': childId,
      if (sessionId != null) 'sessionId': sessionId,
    };

    return fetchSseStream(
      url: url,
      method: 'POST',
      headers: headers,
      body: body,
      dio: _dio,
    );
  }

  Future<List<dynamic>> getAIChatSessions(int userId) async {
    try {
      final response = await _dio.get('/ai/history/sessions', queryParameters: {'childId': userId});
      if (response.data is List) return response.data as List<dynamic>;
      if (response.data is Map && response.data['list'] is List) {
        return response.data['list'] as List<dynamic>;
      }
      return [];
    } catch (e) {
      _log.warning('Get chat sessions error: $e');
      return [];
    }
  }

  Future<List<dynamic>> getAIChatMessages(String sessionId) async {
    try {
      // 传 limit=200 获取更多历史消息（后端最大支持200）
      // 之前不传 limit 导致默认只返回最新50条，大量游戏历史丢失
      final response = await _dio.get('/ai/history/sessions/$sessionId/messages',
          queryParameters: {'limit': 200, 'page': 1});
      if (response.data is List) return response.data as List<dynamic>;
      if (response.data is Map && response.data['list'] is List) {
        return response.data['list'] as List<dynamic>;
      }
      return [];
    } catch (e) {
      _log.warning('Get chat messages error: $e');
      return [];
    }
  }

  // ==================== 紧急求助 API ====================

  Future<Map<String, dynamic>?> triggerEmergencyCall({required int childId}) async {
    try {
      final response = await _dio.post('/emergency/trigger', data: {
        'childId': childId,
      });
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('Emergency call error: $e');
      return null;
    }
  }

  Future<List<dynamic>> getEmergencyHistory(int childId) async {
    try {
      final response = await _dio.get('/emergency/history/$childId');
      if (response.data is List) return response.data as List<dynamic>;
      return [];
    } catch (e) {
      _log.warning('Get emergency history error: $e');
      return [];
    }
  }

  // ==================== 语音 ====================

  /// 删除课程草稿
  Future<bool> deleteLessonDraft(int contentId) async {
    try {
      await _dio.delete('/learning/lessons/$contentId');
      return true;
    } catch (e) {
      _log.warning('Delete lesson draft error: $e');
      return false;
    }
  }

  Future<Map<String, dynamic>?> requestTts(String text, {String voice = 'zh-CN-XiaoxiaoNeural'}) async {
    try {
      final response = await _dio.get('/voice/tts', queryParameters: {
        'text': text,
        'voice': voice,
      });
      return response.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('TTS error: $e');
      return null;
    }
  }

  // ==================== SSE ====================

  String get sseSubscribeUrl => '$baseUrl/sse/subscribe';
}

// ─── Auth Interceptor ─────────────────────────────────────────────────────

class _AuthInterceptor extends Interceptor {
  final String _token;

  _AuthInterceptor(this._token);

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    options.headers['Authorization'] = 'Bearer $_token';
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (err.response?.statusCode == 401) {
      // Token expired — _handleAuthExpired is called by the global onError handler below
      _log.warning('Auth token expired or invalid (interceptor)');
    }
    handler.next(err);
  }
}