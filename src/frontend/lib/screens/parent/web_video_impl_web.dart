import 'dart:html' as html;
import 'dart:ui_web' as ui_web;

/// Registers an HTML5 `<video>` element as a Flutter platform view (Web only).
void initWebVideoPlayer(String viewType, String url, void Function() onError, void Function() onReady) {
  ui_web.platformViewRegistry.registerViewFactory(viewType, (int viewId) {
    final video = html.VideoElement()
      ..src = url
      ..style.border = 'none'
      ..style.width = '100%'
      ..style.height = '100%'
      ..controls = true
      ..autoplay = true
      ..setAttribute('playsinline', 'true')
      ..setAttribute('preload', 'auto');

    video.onError.listen((event) => onError());
    return video;
  });
  onReady();
}

/// Triggers a browser save-as download (Web only).
void triggerBrowserDownload(String url, String filename) {
  final anchor = html.AnchorElement(href: url)
    ..setAttribute('download', filename)
    ..style.display = 'none';
  html.document.body?.children.add(anchor);
  anchor.click();
  html.document.body?.children.remove(anchor);
}
