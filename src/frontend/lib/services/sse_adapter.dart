// SSE 流式读取适配器 — 条件导入入口
//
// Web 平台用浏览器原生 fetch + ReadableStream（package:web），
// 非 Web 平台用 Dio 的 stream responseType。
//
// 通过条件导入分离平台代码，避免 package:web / dart:js_interop
// 在 Android/iOS 上编译失败。

import 'package:dio/dio.dart';

import 'sse_adapter_native.dart'
    if (dart.library.js_interop) 'sse_adapter_web.dart';

/// 跨平台 SSE 流式读取入口
Stream<Map<String, dynamic>> fetchSseStream({
  required String url,
  required String method,
  required Map<String, String> headers,
  required Map<String, dynamic> body,
  required Dio dio,
}) {
  return platformFetchSseStream(
    url: url,
    method: method,
    headers: headers,
    body: body,
    dio: dio,
  );
}
