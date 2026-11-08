// Non-web stub for `dart:html` symbols used in shared UI code.
//
// These files are imported conditionally:
//   import 'web_html_stub.dart' if (dart.library.html) 'dart:html' as html;
// On web the real dart:html is used; on Android/iOS these no-op stubs keep
// the shared code compilable. Runtime web-only code paths are guarded by
// kIsWeb / dart.library.html and never execute the stubs.
//
// Keep the stub surface minimal and aligned with the real dart:html API
// subset used by callers.

/// Minimal stand-in for dart:html File / Blob consumers.
class File {
  final String name;
  File({this.name = ''});
}

class FileUploadInputElement {
  String accept = '';
  bool multiple = false;
  List<File>? files;
  void click() {}
  Stream<dynamic> get onChange => const Stream.empty();
}

class FileReader {
  void readAsDataUrl(dynamic file) {}
  void readAsArrayBuffer(dynamic file) {}
  Stream<dynamic> get onLoadEnd => const Stream.empty();
  dynamic get result => null;
}

class AnchorElement {
  String href;
  String download = '';
  AnchorElement({String? href}) : href = href ?? '';
  void click() {}
}

class CssStyleDeclaration {
  String width = '';
  String height = '';
  String border = '';
  String objectFit = '';
}

class VideoElement {
  String src = '';
  bool controls = false;
  bool autoplay = false;
  final CssStyleDeclaration style = CssStyleDeclaration();
  void remove() {}
}

class _StubHtmlElement {
  void append(dynamic node) {}
}

class _StubHtmlDocument {
  _StubHtmlElement? get body => null;
}

final _StubHtmlDocument document = _StubHtmlDocument();
