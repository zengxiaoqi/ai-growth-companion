import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../utils/app_logger.dart';

final _log = AppLogger('ContentProvider');

class ContentProvider extends ChangeNotifier {
  final ApiService _apiService;

  ContentProvider(this._apiService);
  
  List<Map<String, dynamic>> _contents = [];
  List<Map<String, dynamic>> _recommendations = [];
  Map<String, dynamic>? _currentContent;
  bool _isLoading = false;
  
  List<Map<String, dynamic>> get contents => _contents;
  List<Map<String, dynamic>> get recommendations => _recommendations;
  Map<String, dynamic>? get currentContent => _currentContent;
  bool get isLoading => _isLoading;
  
  // 加载内容列表
  Future<void> loadContents({String? ageRange, String? domain}) async {
    _isLoading = true;
    notifyListeners();
    
    try {
      final list = await _apiService.getContents(
        ageRange: ageRange,
        domain: domain,
      );
      _contents = list.cast<Map<String, dynamic>>();
    } catch (e) {
      _log.warning('Load contents error: $e');
    }
    
    _isLoading = false;
    notifyListeners();
  }
  
  // 加载推荐内容
  Future<void> loadRecommendations(int userId) async {
    _isLoading = true;
    notifyListeners();
    
    try {
      // 简化处理：直接加载所有内容作为推荐
      final list = await _apiService.getContents(limit: 10);
      _recommendations = list.cast<Map<String, dynamic>>();
    } catch (e) {
      _log.warning('Load recommendations error: $e');
    }
    
    _isLoading = false;
    notifyListeners();
  }
  
  // 加载内容详情
  Future<void> loadContentDetail(int contentId) async {
    _isLoading = true;
    notifyListeners();
    
    try {
      _currentContent = await _apiService.getContentDetail(contentId);
    } catch (e) {
      _log.warning('Load content detail error: $e');
    }
    
    _isLoading = false;
    notifyListeners();
  }
  
  // 筛选内容
  List<Map<String, dynamic>> filterByDomain(String domain) {
    return _contents.where((c) => c['domain'] == domain).toList();
  }
  
  List<Map<String, dynamic>> filterByAgeRange(String ageRange) {
    return _contents.where((c) => c['age_range'] == ageRange).toList();
  }
}