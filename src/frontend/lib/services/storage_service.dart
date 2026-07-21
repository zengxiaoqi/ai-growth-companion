import 'package:shared_preferences/shared_preferences.dart';

class StorageService {
  final SharedPreferences _prefs;
  
  StorageService(this._prefs);
  
  // 用户数据
  static const String keyUserId = 'user_id';
  static const String keyUserType = 'user_type';
  static const String keyUserName = 'user_name';
  static const String keyUserAge = 'user_age';
  static const String keyUserPhone = 'user_phone';
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

  // 模式选择
  static const String keySelectedMode = 'selected_mode';

  // 当前活跃孩子 ID
  static const String keyActiveChildId = 'active_child_id';

  // ── 双端会话持久化（家长端/学生端快速切换） ──
  // 家长会话
  static const String keyParentUserId = 'parent_user_id';
  static const String keyParentUserType = 'parent_user_type';
  static const String keyParentUserName = 'parent_user_name';
  static const String keyParentUserAge = 'parent_user_age';
  static const String keyParentUserPhone = 'parent_user_phone';
  static const String keyParentToken = 'parent_token';

  // 孩子会话
  static const String keyChildUserId = 'child_user_id';
  static const String keyChildUserType = 'child_user_type';
  static const String keyChildUserName = 'child_user_name';
  static const String keyChildUserAge = 'child_user_age';
  static const String keyChildUserPhone = 'child_user_phone';
  static const String keyChildParentId = 'child_parent_id';
  static const String keyChildToken = 'child_token';

  // 当前活跃端（'parent' 或 'child'）
  static const String keyActiveRole = 'active_role';

  // 记住我标志
  static const String keyRememberMe = 'remember_me';

  // 记住我保存的登录凭证
  static const String keyRememberedPhone = 'remembered_phone';
  static const String keyRememberedPassword = 'remembered_password';

  // 孩子端天气卡片城市（默认北京）
  static const String keyWeatherCity = 'weather_city';
  static const String kDefaultWeatherCity = '北京';

  /// 保存天气城市
  Future<void> saveWeatherCity(String city) =>
      _prefs.setString(keyWeatherCity, city);

  /// 获取天气城市（默认北京）
  String getWeatherCity() =>
      _prefs.getString(keyWeatherCity) ?? kDefaultWeatherCity;

  // 保存用户信息
  Future<void> saveUser({
    required int userId,
    required String userType,
    required String name,
    int? age,
    String? phone,
    int? parentId,
  }) async {
    await _prefs.setInt(keyUserId, userId);
    await _prefs.setString(keyUserType, userType);
    await _prefs.setString(keyUserName, name);
    if (age != null) await _prefs.setInt(keyUserAge, age);
    if (phone != null) await _prefs.setString(keyUserPhone, phone);
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
      'phone': _prefs.getString(keyUserPhone),
      'parentId': _prefs.getInt(keyParentId),
    };
  }
  
  // 清除用户信息
  Future<void> clearUser() async {
    await _prefs.remove(keyUserId);
    await _prefs.remove(keyUserType);
    await _prefs.remove(keyUserName);
    await _prefs.remove(keyUserAge);
    await _prefs.remove(keyUserPhone);
    await _prefs.remove(keyParentId);
    await _prefs.remove(keyAuthToken);
    await _prefs.remove(keySelectedMode);
    await _prefs.remove(keyActiveChildId);
    await _prefs.remove(keyActiveRole);
    // 注意：不清除 keyRememberMe — 保持记住我复选框状态
    // 如果用户主动登出，由 logout() 显式清除
    await clearParentSession();
    await clearChildSession();
  }
  
  // 保存 Token
  Future<void> saveToken(String token) async {
    await _prefs.setString(keyAuthToken, token);
  }

  // 获取 Token
  String? getToken() {
    return _prefs.getString(keyAuthToken);
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

  // 保存选择的模式（child/parent）
  Future<void> saveSelectedMode(String mode) async {
    await _prefs.setString(keySelectedMode, mode);
  }

  // 获取选择的模式
  String? getSelectedMode() {
    return _prefs.getString(keySelectedMode);
  }

  // 保存当前活跃孩子 ID
  Future<void> saveActiveChildId(int childId) async {
    await _prefs.setInt(keyActiveChildId, childId);
  }

  // 获取当前活跃孩子 ID
  int? getActiveChildId() {
    return _prefs.getInt(keyActiveChildId);
  }

  // ────────────────────────────────────────────────
  //  双端会话持久化（家长端/学生端快速切换）
  // ────────────────────────────────────────────────

  /// 保存家长端会话
  Future<void> saveParentSession({
    required int userId,
    required String name,
    String? phone,
    int? age,
    required String token,
  }) async {
    await _prefs.setInt(keyParentUserId, userId);
    await _prefs.setString(keyParentUserType, 'parent');
    await _prefs.setString(keyParentUserName, name);
    if (phone != null) await _prefs.setString(keyParentUserPhone, phone);
    if (age != null) await _prefs.setInt(keyParentUserAge, age);
    await _prefs.setString(keyParentToken, token);
  }

  /// 保存孩子端会话
  Future<void> saveChildSession({
    required int userId,
    required String name,
    String? phone,
    int? age,
    int? parentId,
    required String token,
  }) async {
    await _prefs.setInt(keyChildUserId, userId);
    await _prefs.setString(keyChildUserType, 'child');
    await _prefs.setString(keyChildUserName, name);
    if (phone != null) await _prefs.setString(keyChildUserPhone, phone);
    if (age != null) await _prefs.setInt(keyChildUserAge, age);
    if (parentId != null) await _prefs.setInt(keyChildParentId, parentId);
    await _prefs.setString(keyChildToken, token);
  }

  /// 获取家长端会话（user + token），无则返回 null
  Map<String, dynamic>? getParentSession() {
    final token = _prefs.getString(keyParentToken);
    final userId = _prefs.getInt(keyParentUserId);
    if (token == null || userId == null) return null;
    return {
      'id': userId,
      'type': 'parent',
      'name': _prefs.getString(keyParentUserName) ?? '',
      'phone': _prefs.getString(keyParentUserPhone),
      'age': _prefs.getInt(keyParentUserAge),
      'token': token,
    };
  }

  /// 获取孩子端会话（user + token），无则返回 null
  Map<String, dynamic>? getChildSession() {
    final token = _prefs.getString(keyChildToken);
    final userId = _prefs.getInt(keyChildUserId);
    if (token == null || userId == null) return null;
    return {
      'id': userId,
      'type': 'child',
      'name': _prefs.getString(keyChildUserName) ?? '',
      'phone': _prefs.getString(keyChildUserPhone),
      'age': _prefs.getInt(keyChildUserAge),
      'parentId': _prefs.getInt(keyChildParentId),
      'token': token,
    };
  }

  /// 获取当前活跃角色
  String? getActiveRole() {
    return _prefs.getString(keyActiveRole);
  }

  /// 设置当前活跃角色
  Future<void> saveActiveRole(String role) async {
    await _prefs.setString(keyActiveRole, role);
  }

  /// 获取记住我标志
  bool getRememberMe() {
    return _prefs.getBool(keyRememberMe) ?? false;
  }

  /// 保存记住我标志
  Future<void> saveRememberMe(bool value) async {
    await _prefs.setBool(keyRememberMe, value);
  }

  /// 保存记住我的登录凭证（手机号 + 密码）
  Future<void> saveCredentials(String phone, String password) async {
    await _prefs.setString(keyRememberedPhone, phone);
    await _prefs.setString(keyRememberedPassword, password);
  }

  /// 获取记住我保存的手机号
  String? getRememberedPhone() {
    return _prefs.getString(keyRememberedPhone);
  }

  /// 获取记住我保存的密码
  String? getRememberedPassword() {
    return _prefs.getString(keyRememberedPassword);
  }

  /// 清除记住我的登录凭证
  Future<void> clearCredentials() async {
    await _prefs.remove(keyRememberedPhone);
    await _prefs.remove(keyRememberedPassword);
  }

  /// 清除家长端会话
  Future<void> clearParentSession() async {
    await _prefs.remove(keyParentUserId);
    await _prefs.remove(keyParentUserType);
    await _prefs.remove(keyParentUserName);
    await _prefs.remove(keyParentUserAge);
    await _prefs.remove(keyParentUserPhone);
    await _prefs.remove(keyParentToken);
  }

  /// 清除孩子端会话
  Future<void> clearChildSession() async {
    await _prefs.remove(keyChildUserId);
    await _prefs.remove(keyChildUserType);
    await _prefs.remove(keyChildUserName);
    await _prefs.remove(keyChildUserAge);
    await _prefs.remove(keyChildUserPhone);
    await _prefs.remove(keyChildParentId);
    await _prefs.remove(keyChildToken);
  }

  // 清除缓存
  Future<void> clearCache() async {
    await _prefs.remove(keyTodayMinutes);
    await _prefs.remove(keyLastDate);
    await _prefs.remove(keyCompletedContents);
    await _prefs.remove(keyDailyLimit);
    await _prefs.remove(keyAllowedDomains);
  }
}