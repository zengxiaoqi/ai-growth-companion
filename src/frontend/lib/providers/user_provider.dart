import 'dart:async';

import 'package:flutter/material.dart';
import '../services/storage_service.dart';
import '../services/api_service.dart';

class UserProvider extends ChangeNotifier {
  final StorageService _storage;
  final ApiService? _apiService;

  bool _isLoading = true;
  Map<String, dynamic>? _currentUser;
  String? _selectedMode;
  int? _activeChildId;

  Timer? _loadTimer;

  UserProvider(this._storage, [this._apiService]) {
    // 同步加载用户状态（无 Timer 延迟），确保 token 在任何 widget 的
    // initState 之前注入到 ApiService，防止 Flutter Web 刷新时
    // RewardHomeScreen 等页面在 token 设置之前就发出 API 请求 → 401
    _loadUser();
  }

  bool get isLoading => _isLoading;
  bool get isLoggedIn => _currentUser != null;
  Map<String, dynamic>? get currentUser => _currentUser;
  String? get selectedMode => _selectedMode;
  int? get activeChildId => _activeChildId;
  ApiService? get apiService => _apiService;

  void _loadUser() {
    // 同步从 storage 读取用户状态——不使用 Timer 延迟。
    // 之前用 30ms Timer 是为了让 SplashScreen 在首帧渲染，但这会导致
    // token 在 widget initState 之后才注入 ApiService，引发 401 竞态。
    // 现在 _isLoading 初始为 true，Consumer 首帧会显示 SplashScreen，
    // 这里同步设置完状态后调用 notifyListeners() 触发重建即可。
    final user = _storage.getUser();
    _currentUser = user;
    _selectedMode = _storage.getSelectedMode();
    _isLoading = false;

    // 恢复 activeChildId
    _activeChildId = _storage.getActiveChildId();
    // 如果未设置且当前用户是孩子，默认使用当前用户 ID
    if (_activeChildId == null && user != null && user['type'] == 'child') {
      _activeChildId = user['id'] as int?;
    }

    // 注入 token 到 API 拦截器
    if (_apiService != null) {
      final token = _storage.getToken();
      if (token != null && token.isNotEmpty) {
        _apiService!.setToken(token);
        // 先通知 UI 重建——用 storage 中的已保存状态立即显示页面，
        // 不让用户盯着 SplashScreen 等待网络验证
        notifyListeners();
        // 然后异步验证 token 是否仍然有效（可能已过期或后端重启）
        _validateToken();
        return;
      }
    }

    notifyListeners();
  }

  /// 验证当前 token 是否仍然有效（防止过期 token 导致"已登录但无数据"僵尸状态）
  ///
  /// 策略：
  /// - profile 返回数据 → token 有效，更新用户信息
  /// - profile 返回 null（401/403）→ token 确实无效，清除登录态
  /// - 网络错误（超时/断网）→ **不清除登录态**，保留 storage 中的会话让用户稍后重试
  Future<void> _validateToken() async {
    if (_apiService == null) return;
    try {
      final profile = await _apiService!.getProfile();
      if (profile == null) {
        // token 无效或网络错误 → 判断是否真的是 401
        // getProfile 返回 null 有两种情况：401（token 过期）或网络错误
        // 如果 token 还在（没有被 401 拦截器清除），说明是网络错误，不要 logout
        if (_apiService!.token != null && _apiService!.token!.isNotEmpty) {
          debugPrint('[UserProvider] Profile fetch returned null but token still set — likely network error, keeping session');
          notifyListeners();
          return;
        }
        // token 确实被 401 拦截清除了 → 清除登录态
        debugPrint('[UserProvider] Token invalid (401) — logging out');
        await _storage.clearUser();
        _currentUser = null;
        _selectedMode = null;
        _activeChildId = null;
        _apiService!.setToken('');
        notifyListeners();
      } else {
        // token 有效 → 用最新 profile 更新本地用户数据（防止后端用户信息变更）
        if (profile['id'] != null) {
          _currentUser = {
            'id': profile['id'] is int ? profile['id'] : int.tryParse(profile['id'].toString()) ?? 0,
            'type': profile['type']?.toString() ?? 'child',
            'name': profile['name']?.toString() ?? '',
            'age': profile['age'],
            'phone': profile['phone']?.toString(),
            'parentId': profile['parentId'] is int
                ? profile['parentId']
                : int.tryParse(profile['parentId']?.toString() ?? ''),
          };
        }
        notifyListeners();
      }
    } catch (e) {
      debugPrint('[UserProvider] Token validation error: $e');
      // 网络错误不 logout（可能暂时断网），保持登录态让用户重试
      notifyListeners();
    }
  }

  Future<void> login(Map<String, dynamic> userData) async {
    // 先设置用户并通知 UI，确保护航立即生效
    _currentUser = userData;
    notifyListeners();

    // 然后异步持久化（不阻塞 UI 导航）
    try {
      await _storage.saveUser(
        userId: userData['id'] is int ? userData['id'] : int.tryParse(userData['id'].toString()) ?? 0,
        userType: userData['type']?.toString() ?? 'child',
        name: userData['name']?.toString() ?? '',
        age: userData['age'] is int ? userData['age'] : int.tryParse(userData['age'].toString()),
        phone: userData['phone']?.toString(),
        parentId: userData['parentId'] is int ? userData['parentId'] : int.tryParse(userData['parentId'].toString()),
      );

      // 孩子登录时自动设为 activeChildId
      final userType = userData['type']?.toString() ?? 'child';
      if (userType == 'child') {
        final userId = userData['id'] is int ? userData['id'] : int.tryParse(userData['id'].toString()) ?? 0;
        _activeChildId = userId;
        await _storage.saveActiveChildId(userId);
      }

      // 注入 token
      if (_apiService != null) {
        final token = _storage.getToken();
        if (token != null) {
          _apiService!.setToken(token);
        }
      }
    } catch (e) {
      debugPrint('[UserProvider] login persist error: $e');
    }
  }

  Future<void> logout() async {
    await _storage.clearUser();
    _currentUser = null;
    _selectedMode = null;
    _activeChildId = null;

    if (_apiService != null) {
      _apiService!.setToken('');
    }

    notifyListeners();
  }

  Future<void> setSelectedMode(String mode) async {
    _selectedMode = mode;
    await _storage.saveSelectedMode(mode);
    notifyListeners();
  }

  /// 清除模式选择（用于 type/mode 不匹配时）
  Future<void> clearSelectedMode() async {
    _selectedMode = null;
    await _storage.saveSelectedMode('');
    notifyListeners();
  }

  Future<void> updateUserInfo(Map<String, dynamic> info) async {
    if (_currentUser != null) {
      final updatedUser = {..._currentUser!, ...info};
      _currentUser = updatedUser;
      await _storage.saveUser(
        userId: updatedUser['id'] is int ? updatedUser['id'] : int.tryParse(updatedUser['id'].toString()) ?? 0,
        userType: updatedUser['type']?.toString() ?? 'child',
        name: updatedUser['name']?.toString() ?? '',
        age: updatedUser['age'] is int ? updatedUser['age'] : int.tryParse(updatedUser['age'].toString()),
        phone: updatedUser['phone']?.toString(),
        parentId: updatedUser['parentId'] is int ? updatedUser['parentId'] : int.tryParse(updatedUser['parentId'].toString()),
      );
      notifyListeners();
    }
  }

  /// 设置当前活跃孩子 ID（家长模式下切换孩子时调用）
  Future<void> setActiveChildId(int? id) async {
    _activeChildId = id;
    if (id != null) {
      await _storage.saveActiveChildId(id);
    }
    notifyListeners();
  }

  /// 解析当前应使用的 childId
  /// 1. 优先返回 activeChildId
  /// 2. 孩子账号返回自己的 ID
  /// 3. 家长账号尝试获取第一个孩子
  /// 4. 无法解析时返回 null（调用方应显示提示）
  Future<int?> resolveChildId() async {
    // 1. 已设置 activeChildId
    if (_activeChildId != null) return _activeChildId!;

    // 2. 无登录用户
    if (_currentUser == null) return null;

    final userId = _currentUser!['id'] is int
        ? _currentUser!['id'] as int
        : int.tryParse(_currentUser!['id']?.toString() ?? '');
    final userType = _currentUser!['type']?.toString() ?? 'child';

    // 3. 孩子账号
    if (userType == 'child' && userId != null) {
      _activeChildId = userId;
      return userId;
    }

    // 4. 家长账号：尝试获取第一个孩子
    if (userType == 'parent' && userId != null && _apiService != null) {
      try {
        final children = await _apiService!.getChildrenByParent(userId);
        if (children.isNotEmpty) {
          final firstChild = children.first;
          final childId = firstChild['id'] is int
              ? firstChild['id'] as int
              : int.tryParse(firstChild['id']?.toString() ?? '');
          if (childId != null) {
            await setActiveChildId(childId);
            return childId;
          }
        }
      } catch (e) {
        debugPrint('[UserProvider] resolveChildId error: $e');
      }
    }

    return null;
  }

  @override
  void dispose() {
    _loadTimer?.cancel();
    super.dispose();
  }
}