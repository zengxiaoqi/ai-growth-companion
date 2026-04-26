import 'package:dio/dio.dart';

class ApiService {
  final Dio _dio;

  // API 基础地址（本地开发用 localhost）
  static const String baseUrl = 'http://localhost:3000/api';

  ApiService() : _dio = Dio(BaseOptions(
    baseUrl: baseUrl,
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 30),
    headers: {
      'Content-Type': 'application/json',
    },
  )) {
    // 添加拦截器
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        // 添加 Token
        return handler.next(options);
      },
      onError: (error, handler) {
        print('API Error: ${error.message}');
        return handler.next(error);
      },
    ));
  }

  // 公共 Dio 实例访问
  Dio get dio => _dio;

  // 设置认证 Token
  void setToken(String token) {
    _dio.interceptors.removeWhere((i) => i is _AuthInterceptor);
    if (token.isNotEmpty) {
      _dio.interceptors.insert(0, _AuthInterceptor(token));
    }
  }
  
  // 用户相关 API
  Future<Map<String, dynamic>> login(String phone, String password) async {
    try {
      final response = await _dio.post('/auth/login', data: {
        'phone': phone,
        'password': password,
      });
      return response.data;
    } catch (e) {
      return {'error': e.toString()};
    }
  }
  
  Future<Map<String, dynamic>> register(Map<String, dynamic> userData) async {
    try {
      final response = await _dio.post('/auth/register', data: userData);
      return response.data;
    } catch (e) {
      return {'error': e.toString()};
    }
  }
  
  // 内容相关 API
  Future<List<dynamic>> getContents({
    String? ageRange,
    String? domain,
    int page = 1,
    int limit = 20,
  }) async {
    try {
      final response = await _dio.get('/contents', queryParameters: {
        if (ageRange != null) 'age_range': ageRange,
        if (domain != null) 'domain': domain,
        'page': page,
        'limit': limit,
      });
      return response.data['list'] ?? [];
    } catch (e) {
      print('Get contents error: $e');
      return [];
    }
  }
  
  Future<Map<String, dynamic>?> getContentDetail(int contentId) async {
    try {
      final response = await _dio.get('/contents/$contentId');
      return response.data;
    } catch (e) {
      print('Get content detail error: $e');
      return null;
    }
  }
  
  // 学习记录 API
  Future<void> saveLearningRecord(Map<String, dynamic> record) async {
    try {
      await _dio.post('/learning/records', data: record);
    } catch (e) {
      print('Save learning record error: $e');
    }
  }
  
  Future<List<dynamic>> getLearningHistory(int userId, {int limit = 10}) async {
    try {
      final response = await _dio.get('/learning/records', queryParameters: {
        'user_id': userId,
        'limit': limit,
      });
      return response.data['list'] ?? [];
    } catch (e) {
      print('Get learning history error: $e');
      return [];
    }
  }
  
  // 开始学习
  Future<Map<String, dynamic>?> startLearning({
    required int childId,
    required int contentId,
  }) async {
    try {
      final response = await _dio.post('/learning/start', data: {
        'childId': childId,
        'contentId': contentId,
      });
      return response.data;
    } catch (e) {
      print('Start learning error: $e');
      return null;
    }
  }

  // 完成学习
  Future<Map<String, dynamic>?> completeLearning({
    required int recordId,
    int? score,
    int? durationSeconds,
    String? feedback,
  }) async {
    try {
      final response = await _dio.post('/learning/complete/$recordId', data: {
        if (score != null) 'score': score,
        if (durationSeconds != null) 'durationSeconds': durationSeconds,
        if (feedback != null) 'feedback': feedback,
      });
      return response.data;
    } catch (e) {
      print('Complete learning error: $e');
      return null;
    }
  }

  // 获取课程进度
  Future<Map<String, dynamic>?> getLessonProgress({
    required int contentId,
    required int childId,
  }) async {
    try {
      final response = await _dio.get(
        '/learning/lessons/$contentId/progress',
        queryParameters: {'childId': childId},
      );
      return response.data;
    } catch (e) {
      print('Get lesson progress error: $e');
      return null;
    }
  }

  // 完成课程步骤
  Future<Map<String, dynamic>?> completeLessonStep({
    required int contentId,
    required String stepId,
    required int childId,
    int? score,
    int? durationSeconds,
    Map<String, dynamic>? interactionData,
  }) async {
    try {
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
      return response.data;
    } catch (e) {
      print('Complete lesson step error: $e');
      return null;
    }
  }

  // 游戏列表 API
  Future<List<dynamic>> getGameList({String ageRange = '3-4'}) async {
    try {
      final response =
          await _dio.get('/game/list', queryParameters: {'ageRange': ageRange});
      if (response.data is List) {
        return response.data as List<dynamic>;
      }
      return [];
    } catch (e) {
      print('Get game list error: $e');
      return [];
    }
  }

  // 生成游戏数据
  Future<Map<String, dynamic>?> getGameData({
    required String gameId,
    int difficulty = 1,
  }) async {
    try {
      final response = await _dio.get(
        '/game/$gameId',
        queryParameters: {'difficulty': difficulty},
      );
      if (response.data is Map<String, dynamic>) {
        return response.data as Map<String, dynamic>;
      }
      if (response.data is Map) {
        return (response.data as Map)
            .map((k, v) => MapEntry(k.toString(), v));
      }
      return null;
    } catch (e) {
      print('Get game data error: $e');
      return null;
    }
  }

  // 保存游戏结果
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
      if (response.data is Map<String, dynamic>) {
        return response.data as Map<String, dynamic>;
      }
      if (response.data is Map) {
        return (response.data as Map)
            .map((k, v) => MapEntry(k.toString(), v));
      }
      return null;
    } catch (e) {
      print('Save game result error: $e');
      return null;
    }
  }

  // 能力评估 API（返回该用户所有评估记录，按时间倒序）
  Future<List<dynamic>> getAbilityAssessment(int userId) async {
    try {
      final response = await _dio.get('/abilities/$userId');
      if (response.data is List) {
        return response.data as List<dynamic>;
      }
      return [];
    } catch (e) {
      print('Get ability assessment error: $e');
      return [];
    }
  }

  // 能力趋势 API（按周聚合）
  Future<List<dynamic>> getAbilityTrend(int userId, {int weeks = 6}) async {
    try {
      final response = await _dio.get('/report/trend', queryParameters: {
        'userId': userId,
        'weeks': weeks,
      });
      if (response.data is List) {
        return response.data as List<dynamic>;
      }
      return [];
    } catch (e) {
      print('Get ability trend error: $e');
      return [];
    }
  }
  
  // 成就 API
  Future<List<dynamic>> getAchievements(int userId) async {
    try {
      final response = await _dio.get('/achievements', queryParameters: {
        'user_id': userId,
      });
      return response.data['list'] ?? [];
    } catch (e) {
      print('Get achievements error: $e');
      return [];
    }
  }
  
  // 家长孩子列表 API
  Future<List<dynamic>> getChildrenByParent(int parentId) async {
    try {
      final response = await _dio.get('/users/children/$parentId');
      if (response.data is List) {
        return response.data as List<dynamic>;
      }
      return [];
    } catch (e) {
      print('Get parent children error: $e');
      return [];
    }
  }

  // 家长控制 API
  Future<Map<String, dynamic>?> getParentControls(int parentId) async {
    try {
      final response = await _dio.get('/parent/controls/$parentId');
      if (response.data is Map<String, dynamic>) {
        return response.data as Map<String, dynamic>;
      }
      if (response.data is Map) {
        return (response.data as Map).map((k, v) => MapEntry(k.toString(), v));
      }
      return null;
    } catch (e) {
      print('Get parent controls error: $e');
      return null;
    }
  }
  
  Future<void> updateParentControls(int parentId, Map<String, dynamic> controls) async {
    try {
      await _dio.patch('/parent/controls/$parentId', data: controls);
    } catch (e) {
      print('Update parent controls error: $e');
    }
  }

  // 通知 API
  Future<Map<String, dynamic>> getNotifications() async {
    try {
      final response = await _dio.get('/notifications');
      return response.data;
    } catch (e) {
      print('Get notifications error: $e');
      return {};
    }
  }

  Future<void> markNotificationRead(int id) async {
    try {
      await _dio.put('/notifications/$id/read');
    } catch (e) {
      print('Mark notification read error: $e');
    }
  }

  Future<void> markAllNotificationsRead() async {
    try {
      await _dio.put('/notifications/read-all');
    } catch (e) {
      print('Mark all notifications read error: $e');
    }
  }

  // 作业管理 API
  Future<List<dynamic>> getAssignments(int parentId) async {
    try {
      final response = await _dio.get('/assignments/parent/$parentId');
      if (response.data is List) {
        return response.data as List<dynamic>;
      }
      return [];
    } catch (e) {
      print('Get assignments error: $e');
      return [];
    }
  }

  Future<Map<String, dynamic>?> createAssignment(Map<String, dynamic> data) async {
    try {
      final response = await _dio.post('/assignments', data: data);
      if (response.data is Map<String, dynamic>) {
        return response.data as Map<String, dynamic>;
      }
      if (response.data is Map) {
        return (response.data as Map).map((k, v) => MapEntry(k.toString(), v));
      }
      return null;
    } catch (e) {
      print('Create assignment error: $e');
      return null;
    }
  }

  Future<Map<String, dynamic>?> updateAssignment(int id, Map<String, dynamic> data) async {
    try {
      final response = await _dio.patch('/assignments/$id', data: data);
      if (response.data is Map<String, dynamic>) {
        return response.data as Map<String, dynamic>;
      }
      if (response.data is Map) {
        return (response.data as Map).map((k, v) => MapEntry(k.toString(), v));
      }
      return null;
    } catch (e) {
      print('Update assignment error: $e');
      return null;
    }
  }

  Future<bool> deleteAssignment(int id) async {
    try {
      await _dio.delete('/assignments/$id');
      return true;
    } catch (e) {
      print('Delete assignment error: $e');
      return false;
    }
  }

  // 草稿课程 API
  Future<List<dynamic>> getDraftLessons(int childId) async {
    try {
      final response = await _dio.get('/learning/lessons/drafts', queryParameters: {
        'childId': childId,
      });
      if (response.data is List) {
        return response.data as List<dynamic>;
      }
      return [];
    } catch (e) {
      print('Get draft lessons error: $e');
      return [];
    }
  }

  // 成长报告 API（使用已有的 getGrowthReport 方法）

  /// 获取成长报告（别名方法，与 Web 端 API 保持一致）
  Future<Map<String, dynamic>?> getReport({
    required int userId,
    String period = 'weekly',
  }) async {
    return getGrowthReport(userId: userId, period: period);
  }

  // 更新用户信息
  Future<Map<String, dynamic>> updateUser(int userId, Map<String, dynamic> data) async {
    try {
      final response = await _dio.put('/users/$userId', data: data);
      return response.data;
    } catch (e) {
      print('Update user error: $e');
      return {'error': e.toString()};
    }
  }

  // ==================== 课程包相关 API ====================

  /// 生成单节课程包
  Future<Map<String, dynamic>?> generateCoursePack({
    required String topic,
    required int childId,
    String focus = 'mixed',
    int durationMinutes = 20,
    bool includeGame = true,
    bool includeAudio = true,
    bool includeVideo = true,
  }) async {
    try {
      final response = await _dio.post(
        '/ai/course-pack',
        data: {
          'topic': topic,
          'parentPrompt': topic,
          'childId': childId,
          'focus': focus,
          'durationMinutes': durationMinutes,
          'includeGame': includeGame,
          'includeAudio': includeAudio,
          'includeVideo': includeVideo,
        },
      );
      if (response.data is Map<String, dynamic>) {
        return response.data as Map<String, dynamic>;
      }
      if (response.data is Map) {
        return (response.data as Map).map((k, v) => MapEntry(k.toString(), v));
      }
      return null;
    } catch (e) {
      print('Generate course pack error: $e');
      return null;
    }
  }

  /// 获取课程包列表
  Future<List<dynamic>> getCoursePacks(int childId, {int limit = 20}) async {
    try {
      final response = await _dio.get(
        '/ai/course-packs',
        queryParameters: {'childId': childId, 'limit': limit},
      );
      final data = response.data;
      if (data is Map && data['list'] is List) {
        return data['list'] as List<dynamic>;
      }
      if (data is List) {
        return data;
      }
      return [];
    } catch (e) {
      print('Get course packs error: $e');
      return [];
    }
  }

  /// 获取课程包详情
  Future<Map<String, dynamic>?> getCoursePackById(int id) async {
    try {
      final response = await _dio.get('/ai/course-packs/$id');
      if (response.data is Map<String, dynamic>) {
        return response.data as Map<String, dynamic>;
      }
      if (response.data is Map) {
        return (response.data as Map).map((k, v) => MapEntry(k.toString(), v));
      }
      return null;
    } catch (e) {
      print('Get course pack by id error: $e');
      return null;
    }
  }

  /// 导出课程包（简化版，返回成功/失败状态）
  Future<bool> exportCoursePack(int id, {String format = 'bundle_zip'}) async {
    try {
      await _dio.get(
        '/ai/course-packs/$id/export',
        queryParameters: {'format': format},
      );
      return true;
    } catch (e) {
      print('Export course pack error: $e');
      return false;
    }
  }

  // ==================== AI 洞察相关 API ====================

  /// 获取成长报告（含 AI 洞察）
  Future<Map<String, dynamic>?> getGrowthReport({
    required int userId,
    String period = 'weekly',
  }) async {
    try {
      final response = await _dio.get(
        '/report',
        queryParameters: {'userId': userId, 'period': period},
      );
      if (response.data is Map<String, dynamic>) {
        return response.data as Map<String, dynamic>;
      }
      if (response.data is Map) {
        return (response.data as Map).map((k, v) => MapEntry(k.toString(), v));
      }
      return null;
    } catch (e) {
      print('Get growth report error: $e');
      return null;
    }
  }

  // ==================== 紧急呼叫 API ====================

  /// 触发紧急呼叫
  Future<Map<String, dynamic>?> triggerEmergencyCall(int childId) async {
    try {
      final response = await _dio.post('/emergency/trigger', data: {
        'childId': childId,
      });
      if (response.data is Map<String, dynamic>) {
        return response.data as Map<String, dynamic>;
      }
      if (response.data is Map) {
        return (response.data as Map).map((k, v) => MapEntry(k.toString(), v));
      }
      return null;
    } catch (e) {
      print('Trigger emergency call error: $e');
      return {'error': e.toString()};
    }
  }

  // ==================== AI 相关 API ====================

  /// 获取 AI 学习建议
  Future<String?> getAISuggestion({
    required int userId,
    String? ageRange,
  }) async {
    try {
      final response = await _dio.get(
        '/ai/suggestion',
        queryParameters: {
          'userId': userId,
          if (ageRange != null) 'ageRange': ageRange,
        },
      );
      final data = response.data;
      if (data is Map && data['suggestion'] != null) {
        return data['suggestion'].toString();
      }
      return null;
    } catch (e) {
      print('Get AI suggestion error: $e');
      return null;
    }
  }
}

// Token 认证拦截器
class _AuthInterceptor extends Interceptor {
  final String token;
  _AuthInterceptor(this.token);

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    options.headers['Authorization'] = 'Bearer $token';
    handler.next(options);
  }
}
