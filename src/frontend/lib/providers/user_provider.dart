import 'package:flutter/material.dart';
import '../services/storage_service.dart';
import '../services/api_service.dart';

class UserProvider extends ChangeNotifier {
  final StorageService _storage;
  final ApiService? _apiService;

  bool _isLoading = true;
  Map<String, dynamic>? _currentUser;
  String? _selectedMode;

  UserProvider(this._storage, [this._apiService]) {
    _loadUser();
  }

  bool get isLoading => _isLoading;
  bool get isLoggedIn => _currentUser != null;
  Map<String, dynamic>? get currentUser => _currentUser;
  String? get selectedMode => _selectedMode;
  ApiService? get apiService => _apiService;

  void _loadUser() {
    final user = _storage.getUser();
    _currentUser = user;
    _selectedMode = _storage.getSelectedMode();
    _isLoading = false;

    // 恢复 token 到 API 拦截器
    if (_apiService != null) {
      final token = _storage.getToken();
      if (token != null) {
        _apiService!.setToken(token);
      }
    }

    notifyListeners();
  }

  Future<void> login(Map<String, dynamic> userData) async {
    _currentUser = userData;
    await _storage.saveUser(
      userId: userData['id'] is int ? userData['id'] : int.tryParse(userData['id'].toString()) ?? 0,
      userType: userData['type']?.toString() ?? 'child',
      name: userData['name']?.toString() ?? '',
      age: userData['age'] is int ? userData['age'] : int.tryParse(userData['age'].toString()),
      phone: userData['phone']?.toString(),
      parentId: userData['parentId'] is int ? userData['parentId'] : int.tryParse(userData['parentId'].toString()),
    );

    // 注入 token
    if (_apiService != null) {
      final token = _storage.getToken();
      if (token != null) {
        _apiService!.setToken(token);
      }
    }

    notifyListeners();
  }

  Future<void> logout() async {
    await _storage.clearUser();
    _currentUser = null;
    _selectedMode = null;

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
}