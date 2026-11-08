// 应用内更新下载器 — 平台实现占位（Web 等）
//
// dart:io 不可用的平台上不支持应用内自升级；
// 真正的实现见 app_update_downloader_native.dart。

/// 下载更新 APK（支持断点续传），返回最终 APK 文件路径。
Future<String> downloadUpdateApk({
  required String url,
  required String fileName,
  required int sizeBytes,
  required String sha256,
  required void Function(int percent, int received, int total) onProgress,
}) async {
  throw UnsupportedError('当前平台不支持应用内更新');
}
