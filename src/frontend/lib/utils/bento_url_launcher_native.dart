// Bento 报告 URL 启动器 — 非 Web 平台实现
// 用 url_launcher 的 launchUrl 打开链接。

import 'package:url_launcher/url_launcher.dart';

Future<bool> platformOpenUrl(String url) async {
  final uri = Uri.parse(url);
  if (await canLaunchUrl(uri)) {
    await launchUrl(uri, mode: LaunchMode.externalApplication);
    return true;
  }
  return false;
}