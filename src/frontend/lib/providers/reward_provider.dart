import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../models/reward_models.dart';
import '../services/api_service.dart';
import '../utils/app_logger.dart';

final _log = AppLogger('RewardProvider');

class RewardProvider extends ChangeNotifier {
  final ApiService _apiService;

  RewardProvider(this._apiService);

  // 状态
  bool _isLoading = false;
  String? _error;

  // 数据
  List<BehaviorTemplate> _behaviors = [];
  List<PointRecord> _pointRecords = [];
  PointsSummary? _summary;
  List<Gift> _gifts = [];
  List<RedemptionRecord> _redemptions = [];
  List<WeeklyStat> _weeklyStats = [];
  Map<String, dynamic>? _calendarData;
  Map<String, List<PointRecord>> _dayRecordsCache = {};

  // Getters
  bool get isLoading => _isLoading;
  String? get error => _error;
  List<BehaviorTemplate> get behaviors => _behaviors;
  List<PointRecord> get pointRecords => _pointRecords;
  PointsSummary? get summary => _summary;
  List<Gift> get gifts => _gifts;
  List<RedemptionRecord> get redemptions => _redemptions;
  List<WeeklyStat> get weeklyStats => _weeklyStats;
  Map<String, dynamic>? get calendarData => _calendarData;

  /// 今日积分记录
  List<PointRecord> get todayRecords {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    return _pointRecords.where((r) {
      final recordDate = DateTime(r.recordedAt.year, r.recordedAt.month, r.recordedAt.day);
      return recordDate == today;
    }).toList();
  }

  /// 专门加载今日记录（确保打卡面板数据准确）
  Future<void> loadTodayRecords(int childId) async {
    try {
      final now = DateTime.now();
      final today = '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
      final response = await _apiService.dio.get(
        '/reward/calendar/$childId/day',
        queryParameters: {'date': today},
      );
      final List<dynamic> data = response.data;
      final todayRecs = data.map((json) => PointRecord.fromJson(json)).toList();
      
      // 从 _pointRecords 中移除今日记录（避免重复）
      final todayDate = DateTime(now.year, now.month, now.day);
      _pointRecords.removeWhere((r) {
        final recordDate = DateTime(r.recordedAt.year, r.recordedAt.month, r.recordedAt.day);
        return recordDate == todayDate;
      });
      
      // 将今日记录插入到开头
      _pointRecords.insertAll(0, todayRecs);
      
      // 立即通知 UI 更新
      notifyListeners();
      
      _log.info('loadTodayRecords: loaded ${todayRecs.length} records for $today');
    } catch (e) {
      _log.warning('loadTodayRecords error: $e');
    }
  }

  // 分类后的行为
  List<BehaviorTemplate> get dailyBehaviors =>
      _behaviors.where((b) => b.category == 'daily' && b.isEnabled).toList();
  List<BehaviorTemplate> get extraBehaviors =>
      _behaviors.where((b) => b.category == 'extra' && b.isEnabled).toList();
  List<BehaviorTemplate> get negativeBehaviors =>
      _behaviors.where((b) => b.category == 'negative' && b.isEnabled).toList();

  // 分类后的礼品
  List<Gift> get enabledGifts =>
      _gifts.where((g) => g.isEnabled && g.hasStock).toList();

  // ==================== 行为管理 ====================

  Future<void> loadBehaviors(int userId) async {
    _setLoading(true);
    try {
      final response = await _apiService.dio.get('/reward/behaviors/$userId');
      final List<dynamic> data = response.data;
      _behaviors = data.map((json) => BehaviorTemplate.fromJson(json)).toList();
      _error = null;
    } catch (e) {
      _error = '加载行为失败: $e';
      _log.warning('loadBehaviors error: $e');
    } finally {
      _setLoading(false);
    }
  }

  Future<BehaviorTemplate?> createBehavior({
    required int userId,
    required String name,
    required int points,
    String? emoji,
    String? category,
  }) async {
    try {
      final response = await _apiService.dio.post('/reward/behaviors', data: {
        'userId': userId,
        'name': name,
        'points': points,
        'emoji': emoji ?? '⭐',
        'category': category ?? 'extra',
      });
      final behavior = BehaviorTemplate.fromJson(response.data);
      _behaviors.add(behavior);
      notifyListeners();
      return behavior;
    } catch (e) {
      _error = '创建行为失败: $e';
      _log.warning('createBehavior error: $e');
      return null;
    }
  }

  Future<bool> toggleBehavior(int id) async {
    try {
      final response = await _apiService.dio.patch('/reward/behaviors/$id/toggle');
      final updated = BehaviorTemplate.fromJson(response.data);
      final index = _behaviors.indexWhere((b) => b.id == id);
      if (index != -1) {
        _behaviors[index] = updated;
        notifyListeners();
      }
      return true;
    } catch (e) {
      _error = '切换行为状态失败: $e';
      return false;
    }
  }

  Future<bool> deleteBehavior(int id) async {
    try {
      await _apiService.dio.delete('/reward/behaviors/$id');
      _behaviors.removeWhere((b) => b.id == id);
      notifyListeners();
      return true;
    } catch (e) {
      _error = '删除行为失败: $e';
      return false;
    }
  }

  // ==================== 积分记录 ====================

  Future<void> loadPointRecords(int childId, {int page = 1, int limit = 20, bool append = false}) async {
    _setLoading(true);
    try {
      final response = await _apiService.dio.get(
        '/reward/points/$childId',
        queryParameters: {'page': page, 'limit': limit},
      );
      final data = response.data;
      final List<dynamic> records = data['records'];
      final newRecords = records.map((json) => PointRecord.fromJson(json)).toList();
      if (append) {
        // 追加模式：用于加载更多，去重后追加
        final existingIds = _pointRecords.map((r) => r.id).toSet();
        for (final r in newRecords) {
          if (!existingIds.contains(r.id)) {
            _pointRecords.add(r);
          }
        }
      } else {
        _pointRecords = newRecords;
      }
      _error = null;
    } catch (e) {
      _error = '加载积分记录失败: $e';
      _log.warning('loadPointRecords error: $e');
    } finally {
      _setLoading(false);
    }
  }

  Future<PointRecord?> recordPoints({
    required int childId,
    required String behaviorName,
    required int points,
    int? templateId,
    String? note,
    required int recordedBy,
  }) async {
    try {
      final response = await _apiService.dio.post('/reward/points', data: {
        'childId': childId,
        'templateId': templateId,
        'behaviorName': behaviorName,
        'points': points,
        'note': note,
        'recordedBy': recordedBy,
      });
      final record = PointRecord.fromJson(response.data);
      _pointRecords.insert(0, record);
      _dayRecordsCache.clear(); // 清除日历缓存
      _error = null;
      notifyListeners();
      // 同时刷新汇总、今日记录和日历数据
      final now = DateTime.now();
      await Future.wait([
        loadSummary(childId),
        loadTodayRecords(childId),
        loadCalendarData(childId, year: now.year, month: now.month),
      ]);
      return record;
    } catch (e) {
      // 处理 Dio 异常，提取后端返回的友好消息
      if (e.toString().contains('DioException') && e.toString().contains('409')) {
        // 尝试从响应中提取后端的 message
        try {
          if (e is DioException && e.response?.data != null) {
            final data = e.response!.data;
            if (data is Map && data.containsKey('message')) {
              _error = data['message'].toString();
            } else {
              _error = '今日已打卡该行为，不能重复打卡';
            }
          } else {
            _error = '今日已打卡该行为，不能重复打卡';
          }
        } catch (_) {
          _error = '今日已打卡该行为，不能重复打卡';
        }
      } else {
        _error = '记录积分失败: $e';
      }
      _log.warning('recordPoints error: $e');
      return null;
    }
  }

  Future<bool> deletePointRecord(int id) async {
    try {
      await _apiService.dio.delete('/reward/points/$id');
      _pointRecords.removeWhere((r) => r.id == id);
      notifyListeners();
      return true;
    } catch (e) {
      _error = '删除积分记录失败: $e';
      return false;
    }
  }

  // ==================== 积分汇总 ====================

  Future<void> loadSummary(int childId) async {
    try {
      final response = await _apiService.dio.get('/reward/points/summary/$childId');
      _summary = PointsSummary.fromJson(response.data);
      notifyListeners();
    } catch (e) {
      _log.warning('loadSummary error: $e');
    }
  }

  // ==================== 礼品管理 ====================

  Future<void> loadGifts(int userId) async {
    _setLoading(true);
    try {
      final response = await _apiService.dio.get('/reward/gifts/$userId');
      final List<dynamic> data = response.data;
      _gifts = data.map((json) => Gift.fromJson(json)).toList();
      _error = null;
    } catch (e) {
      _error = '加载礼品失败: $e';
      _log.warning('loadGifts error: $e');
    } finally {
      _setLoading(false);
    }
  }

  Future<Gift?> createGift({
    required int userId,
    required String name,
    required int pointsCost,
    String? emoji,
    String? description,
    String? category,
  }) async {
    try {
      final response = await _apiService.dio.post('/reward/gifts', data: {
        'userId': userId,
        'name': name,
        'pointsCost': pointsCost,
        'emoji': emoji ?? '🎁',
        'description': description,
        'category': category ?? 'other',
      });
      final gift = Gift.fromJson(response.data);
      _gifts.add(gift);
      notifyListeners();
      return gift;
    } catch (e) {
      _error = '创建礼品失败: $e';
      _log.warning('createGift error: $e');
      return null;
    }
  }

  Future<bool> deleteGift(int id) async {
    try {
      await _apiService.dio.delete('/reward/gifts/$id');
      _gifts.removeWhere((g) => g.id == id);
      notifyListeners();
      return true;
    } catch (e) {
      _error = '删除礼品失败: $e';
      return false;
    }
  }

  // ==================== 兑换管理 ====================

  Future<void> loadRedemptions(int childId) async {
    try {
      final response = await _apiService.dio.get('/reward/redemptions/$childId');
      final List<dynamic> data = response.data;
      _redemptions = data.map((json) => RedemptionRecord.fromJson(json)).toList();
    } catch (e) {
      _log.warning('loadRedemptions error: $e');
    }
  }

  Future<RedemptionRecord?> redeemGift({
    required int childId,
    required int giftId,
    required String giftName,
    required int pointsCost,
  }) async {
    try {
      final response = await _apiService.dio.post('/reward/redemptions', data: {
        'childId': childId,
        'giftId': giftId,
        'giftName': giftName,
        'pointsCost': pointsCost,
      });
      final record = RedemptionRecord.fromJson(response.data);
      _redemptions.insert(0, record);
      notifyListeners();
      // 刷新汇总和积分记录（确保积分扣减反映到界面）
      await Future.wait([
        loadSummary(childId),
        loadPointRecords(childId),
      ]);
      return record;
    } catch (e) {
      _error = '兑换失败: $e';
      _log.warning('redeemGift error: $e');
      return null;
    }
  }

  Future<bool> updateRedemptionStatus(int id, String status, {int? approvedBy}) async {
    try {
      await _apiService.dio.patch('/reward/redemptions/$id', data: {
        'status': status,
        'approvedBy': approvedBy,
      });
      final index = _redemptions.indexWhere((r) => r.id == id);
      if (index != -1) {
        _redemptions[index] = RedemptionRecord.fromJson({
          ..._redemptions[index].toJson(),
          'status': status,
          'approvedBy': approvedBy,
        });
        notifyListeners();
      }
      return true;
    } catch (e) {
      _error = '更新兑换状态失败: $e';
      return false;
    }
  }

  // ==================== 统计 ====================

  Future<void> loadWeeklyStats(int childId) async {
    try {
      final response = await _apiService.dio.get('/reward/stats/weekly/$childId');
      final List<dynamic> data = response.data;
      _weeklyStats = data.map((json) => WeeklyStat.fromJson(json)).toList();
    } catch (e) {
      _log.warning('loadWeeklyStats error: $e');
    }
  }

  // ==================== 日历 ====================

  Future<void> loadCalendarData(int childId, {int? year, int? month}) async {
    try {
      final now = DateTime.now();
      final y = year ?? now.year;
      final m = month ?? now.month;
      final response = await _apiService.dio.get(
        '/reward/calendar/$childId',
        queryParameters: {'year': y, 'month': m},
      );
      _calendarData = response.data;
      notifyListeners();
    } catch (e) {
      _log.warning('loadCalendarData error: $e');
    }
  }

  Future<List<PointRecord>> loadDayRecords(int childId, String date) async {
    try {
      // 先查缓存
      if (_dayRecordsCache.containsKey(date)) {
        return _dayRecordsCache[date]!;
      }
      final response = await _apiService.dio.get(
        '/reward/calendar/$childId/day',
        queryParameters: {'date': date},
      );
      final List<dynamic> data = response.data;
      final records = data.map((json) => PointRecord.fromJson(json)).toList();
      _dayRecordsCache[date] = records;
      return records;
    } catch (e) {
      _log.warning('loadDayRecords error: $e');
      return [];
    }
  }

  void clearDayRecordsCache() {
    _dayRecordsCache.clear();
  }

  // ==================== 种子数据 ====================

  Future<bool> seedDefaultBehaviors(int userId) async {
    try {
      await _apiService.dio.post('/reward/seed/behaviors/$userId');
      await loadBehaviors(userId);
      return true;
    } catch (e) {
      _error = '初始化默认行为失败: $e';
      return false;
    }
  }

  Future<bool> seedDefaultGifts(int userId) async {
    try {
      await _apiService.dio.post('/reward/seed/gifts/$userId');
      await loadGifts(userId);
      return true;
    } catch (e) {
      _error = '初始化默认礼品失败: $e';
      return false;
    }
  }

  // ==================== 辅助方法 ====================

  void _setLoading(bool loading) {
    _isLoading = loading;
    notifyListeners();
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }

  /// 加载所有数据
  Future<void> loadAll({required int userId, required int childId}) async {
    _setLoading(true);
    try {
      await Future.wait([
        loadBehaviors(userId),
        loadPointRecords(childId),
        loadSummary(childId),
        loadGifts(userId),
        loadRedemptions(childId),
        loadWeeklyStats(childId),
      ]);
      _error = null;
    } catch (e) {
      _error = '加载数据失败: $e';
    } finally {
      _setLoading(false);
    }
  }
}
