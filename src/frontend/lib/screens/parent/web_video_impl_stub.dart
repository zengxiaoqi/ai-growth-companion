/// Mobile (non-Web) stub for web video player.
/// Does nothing — on mobile, video_player package is used directly.
void initWebVideoPlayer(String viewType, String url, void Function() onError, void Function() onReady) {
  // No-op on mobile
}

/// Mobile (non-Web) stub for browser download.
void triggerBrowserDownload(String url, String filename) {
  // No-op on mobile — downloads handled natively
}
