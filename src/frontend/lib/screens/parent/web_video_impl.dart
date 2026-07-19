/// Conditional export: picks the Web implementation on Web, the stub elsewhere.
export 'web_video_impl_stub.dart'
    if (dart.library.html) 'web_video_impl_web.dart';
