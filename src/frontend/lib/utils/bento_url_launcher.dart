// Bento 报告 URL 启动器 — 条件导入入口
//
// Web 平台用 dart:html 的 window.open() 直接打开新标签页，
// 非 Web 平台用 url_launcher 的 launchUrl。
//
// 通过条件导入分离平台代码，避免 url_launcher 在 Web 上
// canLaunchUrl 返回 false 的问题（移动端 Safari 常见）。

import 'bento_url_launcher_native.dart'
    if (dart.library.js_interop) 'bento_url_launcher_web.dart';

/// 跨平台打开 URL，返回是否成功
Future<bool> openBentoUrl(String url) {
  return platformOpenUrl(url);
}