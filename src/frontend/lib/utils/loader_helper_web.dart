import 'dart:js' as js;

/// Hide the HTML loading indicator (only used on Flutter Web).
void hideLoader() {
  final loader = js.context['_lingxiLoader'];
  if (loader != null) {
    loader.callMethod('hide');
    loader.callMethod('cancelTimeout');
  }
}