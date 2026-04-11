import 'package:shared_preferences/shared_preferences.dart';

class StorageService {
  final SharedPreferences _prefs;
  
  StorageService(this._prefs);
  
  // 用户数据
  static const String keyUserId = 'user_id';
  static const String keyUserType = 'user_type';
  static const String keyUserName = 'user_name';
  static const String keyUserAge = 'user_age';
  static const String keyParentId = 'parent_id';
  
  // 设置
  static const String keyDailyLimit = 'daily_limit';
  static const String keyAllowedDomains = 'allowed_domains';
  
  // 学习进度
  static const String keyTodayMinutes = 'today_minutes';
  static const String keyLastDate = 'last_date';
  static const String keyCompletedContents = 'completed_contents';
  
  // Token
  static const String keyAuthToken = 'auth_token';
  
  // 保存用户信息
  Future<void> saveUser({
    required int userId,
    required String userType,
    required String name,
    int? age,
    int? parentId,
  }) async {
    await _prefs.setInt(keyUserId, userId);
    await _prefs.setString(keyUserType, userType);
    await _prefs.setString(keyUserName, name);
    if (age != null) await _prefs.setInt(keyUserAge, age);
    if (parentId != null) await _prefs.setInt(keyParentId, parentId);
  }
  
  // 获取用户信息
  Map<String, dynamic>? getUser() {
    final userId = _prefs.getInt(keyUserId);
    if (userId == null) return null;
    
    return {
      'id': userId,
      'type': _prefs.getString(keyUserType),
      'name': _prefs.getString(keyUserName),
      'age': _prefs.getInt(keyUserAge),
      'parentId': _prefs.getInt(keyParentId),
    };
  }
  
  // 清除用户信息
  Future<void> clearUser() async {
    await _prefs.remove(keyUserId);
    await _prefs.remove(keyUserType);
    await _prefs.remove(keyUserName);
    await _prefs.remove(keyUserAge);
    await _prefs.remove(keyParentId);
    await _prefs.remove(keyAuthToken);
  }
  
  // 保存学习时长
  Future<void> saveTodayMinutes(int minutes) async {
    final today = DateTime.now().toIso8601String().substring(0, 10);
    final lastDate = _prefs.getString(keyLastDate);
    
    if (lastDate != today) {
      // 新的一天，重置时长
      await _prefs.setInt(keyTodayMinutes, minutes);
      await _prefs.setString(keyLastDate, today);
    } else {
      // 同一天，累加时长
      final current = _prefs.getInt(keyTodayMinutes) ?? 0;
      await _prefs.setInt(keyTodayMinutes, current + minutes);
    }
  }
  
  // 获取今日学习时长
  int getTodayMinutes() {
    final today = DateTime.now().toIso8601String().substring(0, 10);
    final lastDate = _prefs.getString(keyLastDate);
    
    if (lastDate != today) return 0;
    return _prefs.getInt(keyTodayMinutes) ?? 0;
  }
  
  // 保存已完成内容
  Future<void> addCompletedContent(String contentId) async {
    final completed = _prefs.getStringList(keyCompletedContents) ?? [];
    if (!completed.contains(contentId)) {
      completed.add(contentId);
      await _prefs.setStringList(keyCompletedContents, completed);
    }
  }
  
  // 获取已完成内容列表
  List<String> getCompletedContents() {
    return _prefs.getStringList(keyCompletedContents) ?? [];
  }
  
  // 保存设置
  Future<void> saveSetting(String key, dynamic value) async {
    if (value is String) {
      await _prefs.setString(key, value);
    } else if (value is int) {
      await _prefs.setInt(key, value);
    } else if (value is bool) {
      await _prefs.setBool(key, value);
    } else if (value is List) {
      await _prefs.setStringList(key, value.cast<String>());
    }
  }
  
  // 获取设置
  T? getSetting<T>(String key) {
    return _prefs.get(key) as T?;
  }
}