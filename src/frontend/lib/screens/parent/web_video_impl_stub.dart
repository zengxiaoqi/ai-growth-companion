import 'package:dio/dio.dart';
import 'package:path_provider/path_provider.dart';

/// Mobile (non-Web) stub for web video player.
/// Does nothing — on mobile, video_player package is used directly.
void initWebVideoPlayer(String viewType, String url, void Function() onError, void Function() onReady) {
  // No-op on mobile
}

/// Mobile (non-Web) stub for browser download.
void triggerBrowserDownload(String url, String filename) {
  // No-op on mobile — use downloadToLocal instead
}

/// Download a file to local storage (Mobile: saves to app documents directory).
Future<void> downloadToLocal(String url, String filename) async {
  final dir = await getApplicationDocumentsDirectory();
  final filePath = '${dir.path}/$filename';
  final dio = Dio();
  await dio.download(url, filePath);
}