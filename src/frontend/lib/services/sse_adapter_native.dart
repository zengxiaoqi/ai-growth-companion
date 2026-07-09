// SSE 流式读取 — 非 Web 平台实现（Android/iOS）
// 使用 Dio 的 stream responseType 实现真流式 SSE。

import 'dart:convert';

import 'package:dio/dio.dart';

import '../utils/app_logger.dart';

final _log = AppLogger('SseAdapter');

Stream<Map<String, dynamic>> platformFetchSseStream({
  required String url,
  required String method,
  required Map<String, String> headers,
  required Map<String, dynamic> body,
  required Dio dio,
}) async* {
  _log.info('Native SSE: $method $url');

  final response = await dio.request(
    url,
    data: body,
    options: Options(
      method: method,
      headers: headers,
      responseType: ResponseType.stream,
      receiveTimeout: const Duration(seconds: 120),
    ),
  );

  final stream = response.data.stream as Stream<List<int>>;
  final lineBuffer = StringBuffer();
  final byteBuffer = <int>[];

  await for (final chunk in stream) {
    byteBuffer.addAll(chunk);
    try {
      final decoded = utf8.decode(byteBuffer, allowMalformed: false);
      byteBuffer.clear();
      lineBuffer.write(decoded);
    } catch (_) {
      continue;
    }

    while (true) {
      final raw = lineBuffer.toString();
      final eventEnd = raw.indexOf('\n\n');
      if (eventEnd == -1) break;

      final eventBlock = raw.substring(0, eventEnd);
      lineBuffer.clear();
      lineBuffer.write(raw.substring(eventEnd + 2));

      String? eventName;
      String? dataLine;
      for (final line in eventBlock.split('\n')) {
        if (line.startsWith('event:')) {
          eventName = line.substring(6).trim();
        } else if (line.startsWith('data:')) {
          dataLine = line.substring(5).trim();
        }
      }

      if (dataLine == null) continue;
      eventName ??= 'message';

      try {
        final data = jsonDecode(dataLine) as Map<String, dynamic>;
        data['type'] = eventName;
        yield data;
      } catch (_) {}
    }
  }
}
