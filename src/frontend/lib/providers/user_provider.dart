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
    _loadUser();
  }

  bool get isLoading => _isLoading;
  bool get isLoggedIn => _currentUser != null;
  Map<String, dynamic>? get currentUser => _currentUser;
  String? get selectedMode => _selectedMode;
  int? get activeChildId => _activeChildId;
  ApiService? get apiService => _apiService;

  void _loadUser() {
    // 使用微小的 Timer 延迟，确保 SplashScreen 在首帧中渲染
    // Timer 在当前帧 pump 完成后才触发，避免同步切换导致 SplashScreen 跳过
    _loadTimer = Timer(const Duration(milliseconds: 30), () {
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

      // 恢复 token 到 API 拦截器
      if (_apiService != null) {
        final token = _storage.getToken();
        if (token != null) {
          _apiService!.setToken(token);
        }
      }

      notifyListeners();
    });
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

  @override
  void dispose() {
    _loadTimer?.cancel();
    super.dispose();
  }
}