import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';

/// Mobile (non-Web) stub for web video player.
/// Does nothing — on mobile, video_player package is used directly.
void initWebVideoPlayer(String viewType, String url, void Function() onError, void Function() onReady) {
  // No-op on mobile
}

/// Mobile (non-Web) stub for browser download.
void triggerBrowserDownload(String url, String filename) {
  // No-op on mobile — use downloadToLocal instead
}

/// Download a file to a user-chosen directory via file picker.
/// On mobile, shows a native directory picker, then downloads the file there.
Future<void> downloadToLocal(String url, String filename) async {
  // Step 1: Let user pick a save directory
  final saveDir = await FilePicker.platform.getDirectoryPath(
    dialogTitle: '选择保存目录',
  );
  if (saveDir == null) {
    // User cancelled
    return;
  }

  // Step 2: Download file directly to the chosen directory
  final filePath = '$saveDir/$filename';
  final dio = Dio();
  await dio.download(url, filePath);
}