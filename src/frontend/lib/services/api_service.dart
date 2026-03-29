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
        // final token = getToken();
        // if (token != null) {
        //   options.headers['Authorization'] = 'Bearer $token';
        // }
        return handler.next(options);
      },
      onError: (error, handler) {
        // 统一错误处理
        print('API Error: ${error.message}');
        return handler.next(error);
      },
    ));
  }
  
  // 公共 Dio 实例访问
  Dio get dio => _dio;
  
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
  
  // 能力评估 API
  Future<Map<String, dynamic>?> getAbilityAssessment(int userId) async {
    try {
      final response = await _dio.get('/ability/assessments', queryParameters: {
        'user_id': userId,
      });
      return response.data;
    } catch (e) {
      print('Get ability assessment error: $e');
      return null;
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
  
  // 家长控制 API
  Future<Map<String, dynamic>?> getParentControls(int parentId) async {
    try {
      final response = await _dio.get('/parent/controls', queryParameters: {
        'parent_id': parentId,
      });
      return response.data;
    } catch (e) {
      print('Get parent controls error: $e');
      return null;
    }
  }
  
  Future<void> updateParentControls(int parentId, Map<String, dynamic> controls) async {
    try {
      await _dio.put('/parent/controls/$parentId', data: controls);
    } catch (e) {
      print('Update parent controls error: $e');
    }
  }
}