import 'dart:async';
import 'package:flutter/material.dart';
import '../models/video_download_models.dart';
import '../services/api_service.dart';
import '../utils/app_logger.dart';

final _log = AppLogger('VideoDownloadProvider');

class VideoDownloadProvider extends ChangeNotifier {
  final ApiService _apiService;

  VideoDownloadProvider(this._apiService);

  // Loading state
  bool _isLoading = false;
  String? _error;

  // Data
  List<VideoDownloadItem> _downloads = [];
  Timer? _pollTimer;

  // Selection state for batch mode
  final Set<int> _selectedIds = {};
  bool _batchMode = false;

  // Getters
  bool get isLoading => _isLoading;
  String? get error => _error;
  List<VideoDownloadItem> get downloads => _downloads;

  List<VideoDownloadItem> get completed =>
      _downloads.where((d) => d.status == 'completed').toList();

  List<VideoDownloadItem> get inProgress =>
      _downloads.where((d) => d.status == 'pending' || d.status == 'downloading').toList();

  List<VideoDownloadItem> get failed =>
      _downloads.where((d) => d.status == 'failed').toList();

  bool get hasInProgress =>
      _downloads.any((d) => d.status == 'pending' || d.status == 'downloading');

  // Selection
  Set<int> get selectedIds => _selectedIds;
  bool get batchMode => _batchMode;
  bool get allSelected =>
      _selectedIds.length == _downloads.where((d) => d.status != 'pending' && d.status != 'downloading').length;
  List<VideoDownloadItem> get selectedItems =>
      _downloads.where((d) => _selectedIds.contains(d.id)).toList();

  bool get hasSelectedCompleted =>
      selectedItems.any((d) => d.status == 'completed');
  bool get hasSelectedFailed =>
      selectedItems.any((d) => d.status == 'failed');

  void enterBatchMode() {
    _batchMode = true;
    _selectedIds.clear();
    notifyListeners();
  }

  void exitBatchMode() {
    _batchMode = false;
    _selectedIds.clear();
    notifyListeners();
  }

  void toggleSelection(int id) {
    if (_selectedIds.contains(id)) {
      _selectedIds.remove(id);
    } else {
      _selectedIds.add(id);
    }
    if (_selectedIds.isEmpty) {
      _batchMode = false;
    }
    notifyListeners();
  }

  void selectAll() {
    _selectedIds.addAll(_downloads.where((d) => d.status != 'pending' && d.status != 'downloading').map((d) => d.id));
    notifyListeners();
  }

  void deselectAll() {
    _selectedIds.clear();
    _batchMode = false;
    notifyListeners();
  }

  /// Load all downloads for the current parent
  Future<void> loadDownloads() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response = await _apiService.dio.get('/video-download');
      final list = response.data as List;
      _downloads = list
          .map((j) => VideoDownloadItem.fromJson(j as Map<String, dynamic>))
          .toList();
      _log.info('Loaded ${_downloads.length} downloads');
      _maybeStartPolling();
    } catch (e) {
      _error = e.toString();
      _log.warning('loadDownloads error: $e');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Create a new download task
  Future<String?> createDownload(String url, {int? childId}) async {
    try {
      final response = await _apiService.dio.post(
        '/video-download',
        data: {'url': url, if (childId != null) 'childId': childId},
      );
      final item = VideoDownloadItem.fromJson(response.data as Map<String, dynamic>);
      _downloads.insert(0, item);
      notifyListeners();
      _maybeStartPolling();
      return null;
    } catch (e) {
      _log.warning('createDownload error: $e');
      return e.toString();
    }
  }

  /// Toggle publish-to-child — now accepts childId and publishes directly
  Future<void> togglePublish(int id, {int? childId}) async {
    try {
      final response = await _apiService.dio.post(
        '/video-download/$id/toggle-publish',
        data: {if (childId != null) 'childId': childId},
      );
      final updated = VideoDownloadItem.fromJson(response.data as Map<String, dynamic>);
      final idx = _downloads.indexWhere((d) => d.id == id);
      if (idx >= 0) {
        _downloads[idx] = updated;
        notifyListeners();
      }
    } catch (e) {
      _log.warning('togglePublish error: $e');
    }
  }

  /// Publish a single item to a child (force publish + set childId)
  Future<void> publishToChild(int id, int childId) async {
    try {
      final response = await _apiService.dio.post(
        '/video-download/$id/toggle-publish',
        data: {'childId': childId},
      );
      final updated = VideoDownloadItem.fromJson(response.data as Map<String, dynamic>);
      // Ensure it's published
      if (!updated.publishedToChild) {
        // Toggle again
        final response2 = await _apiService.dio.post(
          '/video-download/$id/toggle-publish',
          data: {'childId': childId},
        );
        final updated2 = VideoDownloadItem.fromJson(response2.data as Map<String, dynamic>);
        final idx = _downloads.indexWhere((d) => d.id == id);
        if (idx >= 0) {
          _downloads[idx] = updated2;
          notifyListeners();
        }
        return;
      }
      final idx = _downloads.indexWhere((d) => d.id == id);
      if (idx >= 0) {
        _downloads[idx] = updated;
        notifyListeners();
      }
    } catch (e) {
      _log.warning('publishToChild error: $e');
    }
  }

  /// Retry a failed download
  Future<void> retryDownload(int id) async {
    try {
      final response = await _apiService.dio.post('/video-download/$id/retry');
      final updated = VideoDownloadItem.fromJson(response.data as Map<String, dynamic>);
      final idx = _downloads.indexWhere((d) => d.id == id);
      if (idx >= 0) {
        _downloads[idx] = updated;
        notifyListeners();
      }
      _maybeStartPolling();
    } catch (e) {
      _log.warning('retryDownload error: $e');
    }
  }

  /// Cancel a stuck download
  Future<void> cancelDownload(int id) async {
    try {
      final response = await _apiService.dio.post('/video-download/$id/cancel');
      final updated = VideoDownloadItem.fromJson(response.data as Map<String, dynamic>);
      final idx = _downloads.indexWhere((d) => d.id == id);
      if (idx >= 0) {
        _downloads[idx] = updated;
        notifyListeners();
      }
    } catch (e) {
      _log.warning('cancelDownload error: $e');
    }
  }

  /// Re-download a video
  Future<void> reDownload(int id) async {
    try {
      final response = await _apiService.dio.post('/video-download/$id/re-download');
      final updated = VideoDownloadItem.fromJson(response.data as Map<String, dynamic>);
      final idx = _downloads.indexWhere((d) => d.id == id);
      if (idx >= 0) {
        _downloads[idx] = updated;
        notifyListeners();
      }
      _maybeStartPolling();
    } catch (e) {
      _log.warning('reDownload error: $e');
    }
  }

  /// Update source URL for a failed download
  Future<void> updateUrl(int id, String newUrl) async {
    try {
      final response = await _apiService.dio.post(
        '/video-download/$id/update-url',
        data: {'url': newUrl},
      );
      final updated = VideoDownloadItem.fromJson(response.data as Map<String, dynamic>);
      final idx = _downloads.indexWhere((d) => d.id == id);
      if (idx >= 0) {
        _downloads[idx] = updated;
        notifyListeners();
      }
      _maybeStartPolling();
    } catch (e) {
      _log.warning('updateUrl error: $e');
      rethrow;
    }
  }

  /// Delete a download
  Future<void> deleteDownload(int id) async {
    try {
      await _apiService.dio.delete('/video-download/$id');
      _downloads.removeWhere((d) => d.id == id);
      _selectedIds.remove(id);
      notifyListeners();
    } catch (e) {
      _log.warning('deleteDownload error: $e');
    }
  }

  // ============ Batch Operations ============

  /// Batch delete
  Future<void> batchDelete() async {
    final ids = _selectedIds.toList();
    if (ids.isEmpty) return;
    try {
      await _apiService.dio.post('/video-download/batch/delete', data: {'ids': ids});
      _downloads.removeWhere((d) => ids.contains(d.id));
      _selectedIds.clear();
      _batchMode = false;
      notifyListeners();
    } catch (e) {
      _log.warning('batchDelete error: $e');
    }
  }

  /// Batch retry failed downloads
  Future<void> batchRetry() async {
    final ids = _selectedIds.where((id) {
      final item = _downloads.firstWhere((d) => d.id == id, orElse: () => null as VideoDownloadItem);
      return item?.status == 'failed';
    }).toList();
    if (ids.isEmpty) return;
    try {
      final response = await _apiService.dio.post('/video-download/batch/retry', data: {'ids': ids});
      final updatedList = response.data as List;
      for (final j in updatedList) {
        final updated = VideoDownloadItem.fromJson(j as Map<String, dynamic>);
        final idx = _downloads.indexWhere((d) => d.id == updated.id);
        if (idx >= 0) _downloads[idx] = updated;
      }
      _selectedIds.clear();
      _batchMode = false;
      notifyListeners();
      _maybeStartPolling();
    } catch (e) {
      _log.warning('batchRetry error: $e');
    }
  }

  /// Batch publish to a specific child
  Future<void> batchPublish(int childId) async {
    final ids = _selectedIds.where((id) {
      final item = _downloads.firstWhere((d) => d.id == id, orElse: () => null as VideoDownloadItem);
      return item?.status == 'completed';
    }).toList();
    if (ids.isEmpty) return;
    try {
      final response = await _apiService.dio.post(
        '/video-download/batch/toggle-publish',
        data: {'ids': ids, 'childId': childId},
      );
      final updatedList = response.data as List;
      for (final j in updatedList) {
        final updated = VideoDownloadItem.fromJson(j as Map<String, dynamic>);
        final idx = _downloads.indexWhere((d) => d.id == updated.id);
        if (idx >= 0) _downloads[idx] = updated;
      }
      _selectedIds.clear();
      _batchMode = false;
      notifyListeners();
    } catch (e) {
      _log.warning('batchPublish error: $e');
    }
  }

  /// Batch re-download completed items
  Future<void> batchReDownload() async {
    final ids = _selectedIds.where((id) {
      final item = _downloads.firstWhere((d) => d.id == id, orElse: () => null as VideoDownloadItem);
      return item?.status == 'completed';
    }).toList();
    if (ids.isEmpty) return;
    for (final id in ids) {
      try {
        await reDownload(id);
      } catch (e) {
        _log.warning('batchReDownload error for $id: $e');
      }
    }
    _selectedIds.clear();
    _batchMode = false;
    notifyListeners();
  }

  /// Get full video URLs for selected completed items
  List<String> getSelectedVideoUrls() {
    return _selectedIds
        .map((id) => _downloads.firstWhere((d) => d.id == id, orElse: () => null as VideoDownloadItem))
        .where((item) => item?.status == 'completed' && item.filePath != null)
        .map((item) => getVideoUrl(item))
        .toList();
  }

  // ============ Polling ============

  void _maybeStartPolling() {
    if (hasInProgress) {
      _pollTimer?.cancel();
      _pollTimer = Timer.periodic(const Duration(seconds: 3), (_) async {
        if (!hasInProgress) {
          _pollTimer?.cancel();
          _pollTimer = null;
          return;
        }
        try {
          final response = await _apiService.dio.get('/video-download');
          final list = response.data as List;
          _downloads = list
              .map((j) => VideoDownloadItem.fromJson(j as Map<String, dynamic>))
              .toList();
          notifyListeners();
          if (!hasInProgress) {
            _pollTimer?.cancel();
            _pollTimer = null;
          }
        } catch (e) {
          _log.warning('polling error: $e');
        }
      });
    }
  }

  String getVideoUrl(VideoDownloadItem item) {
    if (item.filePath == null) return '';
    final baseUrl = ApiService.baseUrl;
    final origin = baseUrl.replaceAll('/api', '');
    return '$origin${item.filePath}';
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }
}