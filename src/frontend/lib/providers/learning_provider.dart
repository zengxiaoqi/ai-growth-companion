import 'package:flutter/material.dart';
import '../services/storage_service.dart';

class LearningProvider extends ChangeNotifier {
  final StorageService _storage;
  
  int _todayMinutes = 0;
  List<String> _completedContents = [];
  
  LearningProvider(this._storage) {
    _loadData();
  }
  
  int get todayMinutes => _todayMinutes;
  List<String> get completedContents => _completedContents;
  
  void _loadData() {
    _todayMinutes = _storage.getTodayMinutes();
    _completedContents = _storage.getCompletedContents();
    notifyListeners();
  }
  
  Future<void> addLearningTime(int minutes) async {
    await _storage.saveTodayMinutes(minutes);
    _todayMinutes = _storage.getTodayMinutes();
    notifyListeners();
  }
  
  Future<void> markContentCompleted(String contentId) async {
    await _storage.addCompletedContent(contentId);
    _completedContents = _storage.getCompletedContents();
    notifyListeners();
  }
  
  bool isContentCompleted(String contentId) {
    return _completedContents.contains(contentId);
  }
}