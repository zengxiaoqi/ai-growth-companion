import 'dart:async';
import 'package:flutter/material.dart';
import '../models/video_download_models.dart';
import '../services/api_service.dart';
import '../utils/app_logger.dart';

final _log = AppLogger('VideoDownloadProvider');

class VideoDownloadProvider extends ChangeNotifier {
  final ApiService _apiService;

  VideoDownloadProvider(this._apiService);

  // State
  bool _isLoading = false;
  String? _error;

  // Data
  List<VideoDownloadItem> _downloads = [];
  Timer? _pollTimer;

  bool get isLoading => _isLoading;
  String? get error => _error;
  List<VideoDownloadItem> get downloads => _downloads;

  /// Completed downloads
  List<VideoDownloadItem> get completed =>
      _downloads.where((d) => d.status == 'completed').toList();

  /// Pending or downloading (in-progress)
  List<VideoDownloadItem> get inProgress =>
      _downloads.where((d) => d.status == 'pending' || d.status == 'downloading').toList();

  /// Failed
  List<VideoDownloadItem> get failed =>
      _downloads.where((d) => d.status == 'failed').toList();

  /// Whether any downloads are still in progress (for polling)
  bool get hasInProgress =>
      _downloads.any((d) => d.status == 'pending' || d.status == 'downloading');

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

      // Start polling if there are in-progress tasks
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
      final item = VideoDownloadItem.fromJson(
          response.data as Map<String, dynamic>);
      _downloads.insert(0, item);
      notifyListeners();

      // Start polling for status updates
      _maybeStartPolling();
      return null; // success
    } catch (e) {
      _log.warning('createDownload error: $e');
      return e.toString();
    }
  }

  /// Toggle publish-to-child
  Future<void> togglePublish(int id) async {
    try {
      final response = await _apiService.dio.post('/video-download/$id/toggle-publish');
      final updated = VideoDownloadItem.fromJson(
          response.data as Map<String, dynamic>);
      final idx = _downloads.indexWhere((d) => d.id == id);
      if (idx >= 0) {
        _downloads[idx] = updated;
        notifyListeners();
      }
    } catch (e) {
      _log.warning('togglePublish error: $e');
    }
  }

  /// Retry a failed download
  Future<void> retryDownload(int id) async {
    try {
      final response = await _apiService.dio.post('/video-download/$id/retry');
      final updated = VideoDownloadItem.fromJson(
          response.data as Map<String, dynamic>);
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

  /// Cancel a stuck download (pending/downloading → failed)
  Future<void> cancelDownload(int id) async {
    try {
      final response = await _apiService.dio.post('/video-download/$id/cancel');
      final updated = VideoDownloadItem.fromJson(
          response.data as Map<String, dynamic>);
      final idx = _downloads.indexWhere((d) => d.id == id);
      if (idx >= 0) {
        _downloads[idx] = updated;
        notifyListeners();
      }
    } catch (e) {
      _log.warning('cancelDownload error: $e');
    }
  }

  /// Delete a download
  Future<void> deleteDownload(int id) async {
    try {
      await _apiService.dio.delete('/video-download/$id');
      _downloads.removeWhere((d) => d.id == id);
      notifyListeners();
    } catch (e) {
      _log.warning('deleteDownload error: $e');
    }
  }

  /// Auto-poll while downloads are in progress
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

          // Stop polling when no more in-progress
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

  /// Get full video URL for playback
  String getVideoUrl(VideoDownloadItem item) {
    if (item.filePath == null) return '';
    // For web, use relative path (same origin via nginx)
    // For mobile, use the API base URL
    final baseUrl = ApiService.baseUrl;
    // baseUrl ends with /api, so strip it for file paths
    final origin = baseUrl.replaceAll('/api', '');
    return '$origin${item.filePath}';
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }
}
