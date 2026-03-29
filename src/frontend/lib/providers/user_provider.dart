import 'package:flutter/material.dart';
import '../services/storage_service.dart';

class UserProvider extends ChangeNotifier {
  final StorageService _storage;
  
  bool _isLoading = true;
  Map<String, dynamic>? _currentUser;
  
  UserProvider(this._storage) {
    _loadUser();
  }
  
  bool get isLoading => _isLoading;
  bool get isLoggedIn => _currentUser != null;
  Map<String, dynamic>? get currentUser => _currentUser;
  
  void _loadUser() {
    final user = _storage.getUser();
    _currentUser = user;
    _isLoading = false;
    notifyListeners();
  }
  
  Future<void> login(Map<String, dynamic> userData) async {
    _currentUser = userData;
    await _storage.saveUser(
      userId: userData['id'],
      userType: userData['type'],
      name: userData['name'],
      age: userData['age'],
      parentId: userData['parentId'],
    );
    notifyListeners();
  }
  
  Future<void> logout() async {
    await _storage.clearUser();
    _currentUser = null;
    notifyListeners();
  }
  
  Future<void> updateUserInfo(Map<String, dynamic> info) async {
    if (_currentUser != null) {
      final updatedUser = {..._currentUser!, ...info};
      _currentUser = updatedUser;
      await _storage.saveUser(
        userId: updatedUser['id'] as int,
        userType: updatedUser['type'] as String,
        name: updatedUser['name'] as String,
        age: updatedUser['age'] as int?,
        parentId: updatedUser['parentId'] as int?,
      );
      notifyListeners();
    }
  }
}