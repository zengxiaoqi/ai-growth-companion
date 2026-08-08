// Conditional export: Web uses the real `dart:js` implementation,
// non-web platforms use the empty stub.
export 'loader_helper_stub.dart'
    if (dart.library.html) 'loader_helper_web.dart';