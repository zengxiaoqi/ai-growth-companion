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
  String? _activeRole; // 'parent' or 'child' — which side is currently active
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
  String? get activeRole => _activeRole;
  bool get hasCachedChildSession => _storage.getChildSession() != null;
  bool get hasCachedParentSession => _storage.getParentSession() != null;
  int? get activeChildId => _activeChildId;
  ApiService? get apiService => _apiService;

  /// 当前活跃的用户类型（'parent' 或 'child'），基于 activeRole 或 currentUser
  String get activeUserType {
    if (_activeRole != null) return _activeRole!;
    return _currentUser?['type']?.toString() ?? 'child';
  }

  void _loadUser() {
    // 同步从 storage 读取用户状态——不使用 Timer 延迟。
    // 之前用 30ms Timer 是为了让 SplashScreen 在首帧渲染，但这会导致
    // token 在 widget initState 之后才注入 ApiService，引发 401 竞态。
    // 现在 _isLoading 初始为 true，Consumer 首帧会显示 SplashScreen，
    // 这里同步设置完状态后调用 notifyListeners() 触发重建即可。

    // ── 角色切换会话恢复 ──
    // 如果有 activeRole，优先从对应的 session 存储 恢复
    final activeRole = _storage.getActiveRole();
    if (activeRole == 'parent') {
      final parentSession = _storage.getParentSession();
      if (parentSession != null) {
        _currentUser = Map<String, dynamic>.from(parentSession);
        _activeRole = 'parent';
        _selectedMode = 'parent';
        _activeChildId = _storage.getActiveChildId();
        _isLoading = false;
        if (_apiService != null) {
          final token = parentSession['token'] as String?;
          if (token != null && token.isNotEmpty) {
            _apiService!.setToken(token);
            notifyListeners();
            _validateToken();
            return;
          }
        }
        notifyListeners();
        return;
      }
    } else if (activeRole == 'child') {
      final childSession = _storage.getChildSession();
      if (childSession != null) {
        _currentUser = Map<String, dynamic>.from(childSession);
        _activeRole = 'child';
        _selectedMode = 'child';
        _activeChildId = childSession['id'] as int?;
        _isLoading = false;
        if (_apiService != null) {
          final token = childSession['token'] as String?;
          if (token != null && token.isNotEmpty) {
            _apiService!.setToken(token);
            notifyListeners();
            _validateToken();
            return;
          }
        }
        notifyListeners();
        return;
      }
    }

    // ── 常规登录恢复（无角色切换会话时） ──
    final user = _storage.getUser();
    _currentUser = user;
    _selectedMode = _storage.getSelectedMode();
    _activeRole = user != null ? user['type']?.toString() : null;
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
    final userType = userData['type']?.toString() ?? 'child';
    _activeRole = userType;
    _selectedMode = userType;
    notifyListeners();

    // 然后异步持久化（不阻塞 UI 导航）
    try {
      final userId = userData['id'] is int ? userData['id'] : int.tryParse(userData['id'].toString()) ?? 0;
      final name = userData['name']?.toString() ?? '';
      final phone = userData['phone']?.toString();
      final age = userData['age'] is int ? userData['age'] : int.tryParse(userData['age'].toString());
      final parentId = userData['parentId'] is int ? userData['parentId'] : int.tryParse(userData['parentId'].toString());

      await _storage.saveUser(
        userId: userId,
        userType: userType,
        name: name,
        age: age,
        phone: phone,
        parentId: parentId,
      );

      // 保存到对应的角色会话存储
      final token = _storage.getToken();
      if (token != null && token.isNotEmpty) {
        if (userType == 'parent') {
          await _storage.saveParentSession(
            userId: userId,
            name: name,
            phone: phone,
            age: age,
            token: token,
          );
        } else {
          await _storage.saveChildSession(
            userId: userId,
            name: name,
            phone: phone,
            age: age,
            parentId: parentId,
            token: token,
          );
        }
        await _storage.saveActiveRole(userType);
      }

      // 孩子登录时自动设为 activeChildId
      if (userType == 'child') {
        _activeChildId = userId;
        await _storage.saveActiveChildId(userId);
      }

      // 注入 token
      if (_apiService != null) {
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
    _activeRole = null;
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

  // ═══════════════════════════════════════════════════
  //  双端快速切换
  // ═══════════════════════════════════════════════════

  /// 家长端 → 学生端切换（无需认证）
  /// 1. 如果已有缓存的孩子会话，直接恢复（即时切换）
  /// 2. 如果没有缓存会话，调用后端 API 用家长 token 换取孩子 token
  Future<String> switchToChildMode({int? childId}) async {
    if (_apiService == null) return 'API 不可可用';

    // 先检查缓存
    final cachedChild = _storage.getChildSession();
    if (cachedChild != null && childId == null) {
      // 有缓存的孩子会话 — 即时恢复
      _currentUser = Map<String, dynamic>.from(cachedChild);
      _activeRole = 'child';
      _selectedMode = 'child';
      _activeChildId = cachedChild['id'] as int?;
      final token = cachedChild['token'] as String?;
      if (token != null) _apiService!.setToken(token);
      await _storage.saveActiveRole('child');
      notifyListeners();
      return '';
    }

    // 没有缓存 — 调用 API
    final result = await _apiService!.switchToChild(childId: childId);
    if (result.containsKey('error')) {
      return result['error'].toString();
    }

    final user = result['user'] as Map<String, dynamic>? ?? result;
    final token = result['token'] as String?;

    if (token == null) return '切换失败：未获取到 token';

    // 保存孩子端会话
    final userId = user['id'] is int ? user['id'] as int : int.tryParse(user['id']?.toString() ?? '') ?? 0;
    await _storage.saveChildSession(
      userId: userId,
      name: user['name']?.toString() ?? '',
      phone: user['phone']?.toString(),
      age: user['age'] is int ? user['age'] as int : null,
      parentId: user['parentId'] is int ? user['parentId'] as int : int.tryParse(user['parentId']?.toString() ?? ''),
      token: token,
    );

    // 更新当前状态
    _currentUser = Map<String, dynamic>.from(user);
    _currentUser!['token'] = token;
    _activeRole = 'child';
    _selectedMode = 'child';
    _activeChildId = userId;
    _apiService!.setToken(token);
    await _storage.saveActiveRole('child');
    await _storage.saveActiveChildId(userId);

    notifyListeners();
    return '';
  }

  /// 学生端 → 家长端切换（需要家长登录密码认证）
  /// 每次都需要输入密码验证
  Future<String> switchToParentMode(String password) async {
    if (_apiService == null) return 'API 不可可用';

    // 通过孩子 token 调用 switch-to-parent 端点
    // 后端通过 child.parentId 找到家长，再验证家长登录密码

    final result = await _apiService!.switchToParent(password);
    if (result.containsKey('error')) {
      return result['error'].toString();
    }

    final user = result['user'] as Map<String, dynamic>? ?? result;
    final token = result['token'] as String?;

    if (token == null) return '切换失败：未获取到 token';

    // 保存家长端会话
    final userId = user['id'] is int ? user['id'] as int : int.tryParse(user['id']?.toString() ?? '') ?? 0;
    await _storage.saveParentSession(
      userId: userId,
      name: user['name']?.toString() ?? '',
      phone: user['phone']?.toString(),
      age: user['age'] is int ? user['age'] as int : null,
      token: token,
    );

    // 更新当前状态
    _currentUser = Map<String, dynamic>.from(user);
    _currentUser!['token'] = token;
    _activeRole = 'parent';
    _selectedMode = 'parent';
    _apiService!.setToken(token);
    await _storage.saveActiveRole('parent');

    notifyListeners();
    return '';
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