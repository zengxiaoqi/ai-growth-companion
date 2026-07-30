// Bento 报告 URL 启动器 — Web 平台实现
// 用 dart:html 的 window.open() 直接打开新标签页。
// 在移动端 Safari 上，url_launcher 的 canLaunchUrl() 经常返回 false，
// 而 window.open() 始终可靠。

import 'dart:html' as html;

Future<bool> platformOpenUrl(String url) async {
  html.window.open(url, '_blank');
  return true;
}