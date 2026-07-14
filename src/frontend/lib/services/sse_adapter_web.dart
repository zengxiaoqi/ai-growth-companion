// SSE 流式读取 — Web 平台实现
// 用浏览器原生 fetch() + ReadableStream.getReader() 逐块读取。
// 通过 package:web + dart:js_interop 调用 JS API。
// 如果 fetch SSE 失败（如 Cloudflare HTTP/2 缓冲），自动 fallback 到非流式请求。

import 'dart:convert';
import 'dart:js_interop';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:web/web.dart' as web;

Stream<Map<String, dynamic>> platformFetchSseStream({
  required String url,
  required String method,
  required Map<String, String> headers,
  required Map<String, dynamic> body,
  required Dio dio,
}) async* {
  debugPrint('🔍 [SSE] platformFetchSseStream: $method $url');

  // 尝试 fetch + ReadableStream
  try {
    yield* _fetchSseStream(url: url, method: method, headers: headers, body: body);
    return;
  } catch (e) {
    debugPrint('⚠️ [SSE] stream failed, falling back to non-streaming: $e');
  }

  // Fallback: 非流式请求
  yield* _nonStreamingFallback(url: url, headers: headers, body: body, dio: dio);
}

/// fetch + ReadableStream SSE 流式读取
Stream<Map<String, dynamic>> _fetchSseStream({
  required String url,
  required String method,
  required Map<String, String> headers,
  required Map<String, dynamic> body,
}) async* {
  // 构建 RequestInit
  final init = web.RequestInit(method: method);

  // 设置 headers
  final headerMap = web.Headers();
  for (final entry in headers.entries) {
    headerMap.append(entry.key, entry.value);
  }
  init.headers = headerMap;

  // 设置 body（POST 请求时）
  if (method.toUpperCase() == 'POST' && body.isNotEmpty) {
    init.body = jsonEncode(body).toJS;
  }

  // 发起 fetch 请求
  debugPrint('🔍 [SSE] _fetchSseStream: calling fetch $url...');
  final responsePromise = web.window.fetch(url.toJS, init);
  final web.Response response;
  try {
    response = await responsePromise.toDart;
  } catch (e) {
    debugPrint('⚠️ [SSE] fetch failed: $e');
    throw Exception('fetch failed: $e');
  }

  debugPrint('🔍 [SSE] fetch resolved, status=${response.status}');

  if (!response.ok) {
    final status = response.status;
    final statusText = response.statusText;
    debugPrint('⚠️ [SSE] HTTP $status $statusText');
    yield {'type': 'error', 'message': 'HTTP $status: $statusText'};
    return;
  }

  final readableStream = response.body;
  if (readableStream == null) {
    debugPrint('⚠️ [SSE] response.body is null');
    throw Exception('response.body is null');
  }

  // 获取 reader
  final reader = web.ReadableStreamDefaultReader(readableStream);
  debugPrint('🔍 [SSE] reader created, entering read loop');

  // SSE 解析缓冲
  final lineBuffer = StringBuffer();
  final byteBuffer = <int>[];

  // 超时检测：如果 5 秒内没有收到第一个 chunk，说明 Cloudflare 在缓冲，回退到非流式
  bool gotFirstChunk = false;
  // 记录首 chunk 时间，用于检测"收到 ping 但无实际事件"的情况
  DateTime? firstChunkTime;
  bool gotFirstRealEvent = false;

  while (true) {
    // 对 reader.read() 加 5 秒超时（仅首 chunk）
    final readFuture = reader.read().toDart;
    final result = gotFirstChunk
        ? await readFuture  // 已收到首 chunk 后不再超时
        : await readFuture.timeout(
            const Duration(seconds: 5),
            onTimeout: () => throw Exception('SSE timeout: no data in 5s (CF buffering)'),
          );

    if (result.done) {
      debugPrint('🔍 [SSE] stream done (reader.done=true)');
      break;
    }

    final chunkData = result.value;
    if (chunkData == null) continue;

    if (!gotFirstChunk) {
      gotFirstChunk = true;
      firstChunkTime = DateTime.now();
      debugPrint('🔍 [SSE] first chunk received');
    }

    // 检查是否已收到首 chunk 但长时间无实际事件
    if (!gotFirstRealEvent && firstChunkTime != null) {
      final elapsed = DateTime.now().difference(firstChunkTime);
      if (elapsed.inSeconds > 45) {
        debugPrint('⚠️ [SSE] no real events in 45s after first chunk, aborting');
        yield {'type': 'error', 'message': 'AI响应超时，请稍后重试~'};
        return;
      }
    }

    final uint8List = _jsToUint8List(chunkData);
    if (uint8List == null) {
      debugPrint('⚠️ [SSE] unexpected chunk type: ${chunkData.runtimeType}');
      continue;
    }

    byteBuffer.addAll(uint8List);

    // UTF-8 解码（处理跨 chunk 的多字节字符）
    try {
      final decoded = utf8.decode(byteBuffer, allowMalformed: false);
      byteBuffer.clear();
      lineBuffer.write(decoded);
    } catch (_) {
      continue;
    }

    // 解析完整的 SSE 事件块（以 \n\n 分隔）
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

      // 跳过 ping（注释行，无 data:）
      if (dataLine == null) continue;
      eventName ??= 'message';

      if (!gotFirstRealEvent) {
        gotFirstRealEvent = true;
        debugPrint('🔍 [SSE] first real event: type=$eventName');
      }

      try {
        final data = jsonDecode(dataLine) as Map<String, dynamic>;
        data['type'] = eventName;
        debugPrint('🔍 [SSE] event: type=$eventName, keys=${data.keys.toList()}');
        yield data;
      } catch (_) {
        // Non-JSON data, skip
      }
    }
  }

  if (!gotFirstChunk) {
    // 没收到任何数据，说明 Cloudflare 在缓冲
    throw Exception('No data received from SSE stream (Cloudflare buffering)');
  }

  debugPrint('🔍 [SSE] stream ended, gotFirstRealEvent=$gotFirstRealEvent');
}

/// 非流式 fallback：用 dio 发普通 POST 请求，返回完整结果
Stream<Map<String, dynamic>> _nonStreamingFallback({
  required String url,
  required Map<String, String> headers,
  required Map<String, dynamic> body,
  required Dio dio,
}) async* {
  // 修复：url 可能是 '/api/ai/chat/stream'，但 dio baseUrl 已是 '/api'
  // 所以只需 '/ai/chat'，避免双前缀 '/api/api/ai/chat'
  final nonStreamUrl = url.replaceAll('/chat/stream', '/chat').replaceFirst('/api', '');
  debugPrint('🔍 [SSE] fallback to non-streaming: $nonStreamUrl (original url was: $url)');

  try {
    final response = await dio.post(
      nonStreamUrl,
      data: body,
      options: Options(
        headers: headers,
        receiveTimeout: const Duration(seconds: 30),
      ),
    );

    debugPrint('🔍 [SSE] fallback response: status=${response.statusCode}');

    final data = response.data;

    // 模拟 SSE 事件序列
    // 先发 thinking（如果有）
    if (data['thinkingContent'] != null && (data['thinkingContent'] as String).isNotEmpty) {
      yield {'type': 'thinking', 'content': data['thinkingContent']};
    }

    // 发 game_data（如果有）
    if (data['gameData'] != null) {
      yield {
        'type': 'game_data',
        'activityType': data['gameData']['type'] ?? 'quiz',
        'gameData': jsonEncode(data['gameData']),
      };
    }

    // 发 token 事件（整段文本作为一个 token）
    final content = data['content'] ?? data['message'] ?? '';
    if (content.isNotEmpty) {
      yield {'type': 'token', 'content': content};
    }

    // 发 done 事件
    yield {
      'type': 'done',
      'sessionId': data['sessionId'] ?? '',
      'wasFiltered': data['wasFiltered'] ?? false,
      'suggestions': data['suggestions'] ?? <String>[],
    };
  } catch (e) {
    debugPrint('⚠️ [SSE] fallback failed: $e');
    yield {'type': 'error', 'message': '请求失败: $e'};
  }
}

/// 将 JSAny 转换为 Uint8List
/// fetch ReadableStream 的 chunk 通常是 Uint8Array
Uint8List? _jsToUint8List(JSAny? value) {
  if (value == null) return null;
  try {
    // 在 JS 编译器上，Uint8Array 就是 Uint8List
    // 在 Wasm 编译器上，需要通过 JSUint8Array 中间转换
    if (value is JSUint8Array) {
      return value.toDart;
    }
    // 尝试通过 JSArrayBuffer
    if (value is JSArrayBuffer) {
      return value.toDart.asUint8List();
    }
    // 最后尝试直接 cast（JS 编译器上 Uint8Array = Uint8List）
    return value as Uint8List;
  } catch (e) {
    debugPrint('⚠️ [SSE] _jsToUint8List conversion failed: $e');
    return null;
  }
}
