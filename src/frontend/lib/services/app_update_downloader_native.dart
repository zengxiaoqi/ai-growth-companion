// 应用内更新下载器 — Android 真机实现
//
// Dio 流式下载 + 断点续传（.part 文件）+ SHA-256 校验（原生通道），
// 下载到应用私有目录（getApplicationSupportDirectory/updates），
// 无需任何存储权限，最终交给 FileProvider 拉起系统安装器。

import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';

import '../utils/app_logger.dart';

final _log = AppLogger('AppUpdateDownloader');

/// 与 MainActivity.kt 中的 channel 名一致
const MethodChannel _channel =
    MethodChannel('com.example.lingxi_companion/app_update');

/// 进度回调节流：几十 MB 的包若每个 chunk 都回调会刷爆 UI
const int _progressStepBytes = 512 * 1024;

Directory? _cachedDir;

Future<Directory> _updateDir() async {
  final cached = _cachedDir;
  if (cached != null) return cached;
  final support = await getApplicationSupportDirectory();
  final dir = Directory('${support.path}${Platform.pathSeparator}updates');
  if (!dir.existsSync()) dir.createSync(recursive: true);
  _cachedDir = dir;
  return dir;
}

int _pctOf(int received, int total) =>
    total > 0 ? (received * 100 / total).clamp(0, 100).toInt() : -1;

/// 下载更新 APK（支持断点续传），返回最终 APK 文件路径。
///
/// - [sha256] 非空时下载完先校验再落名，截断的半成品绝不交给安装器；
/// - 上次下完没安装的完整包会直接复用，不让用户再等一遍；
/// - 失败抛异常，消息为用户可读中文。
Future<String> downloadUpdateApk({
  required String url,
  required String fileName,
  required int sizeBytes,
  required String sha256,
  required void Function(int percent, int received, int total) onProgress,
}) async {
  final dir = await _updateDir();
  final safeName = fileName.replaceAll(RegExp(r'[\\/]'), '_');
  final target = File('${dir.path}${Platform.pathSeparator}$safeName');
  final part = File('${target.path}.part');

  // ── 已有完整包：上次下完没装，直接复用 ──
  if (target.existsSync() && target.lengthSync() > 0) {
    if (sha256.isEmpty || await _sha256Matches(target.path, sha256)) {
      _log.info('本地已有完整安装包，跳过下载: $safeName');
      onProgress(100, target.lengthSync(), target.lengthSync());
      return target.path;
    }
    target.deleteSync();
  }

  // ── 断点续传：.part 的长度就是上次已下载的字节数 ──
  var received = part.existsSync() ? part.lengthSync() : 0;
  if (sizeBytes > 0 && received > sizeBytes) {
    // 换过包，旧的续传点失效
    part.deleteSync();
    received = 0;
  }
  if (sizeBytes > 0 && received >= sizeBytes && received > 0) {
    // 上次其实下完了、只是没来得及改名：直接校验复用
    if (sha256.isEmpty || await _sha256Matches(part.path, sha256)) {
      part.renameSync(target.path);
      _cleanup(dir, keep: target);
      onProgress(100, received, received);
      return target.path;
    }
    part.deleteSync();
    received = 0;
  }

  final dio = Dio(BaseOptions(
    connectTimeout: const Duration(seconds: 30),
    // 读超时是"两次数据之间的等待"，不是整个下载的总时限
    receiveTimeout: const Duration(minutes: 10),
  ));

  var total = sizeBytes;
  var resumed = received > 0;
  ResponseBody body;

  try {
    final resp = await _openStream(dio, url, resumeFrom: resumed ? received : 0);
    if (resp.statusCode == 200 && received > 0) {
      // 服务端忽略了 Range、吐的是整包：已有内容必须作废
      part.writeAsBytesSync(const [], mode: FileMode.write);
      received = 0;
      resumed = false;
    }
    final contentLength = _contentLengthOf(resp);
    total = _resolveTotal(
      statusCode: resp.statusCode,
      contentLength: contentLength,
      received: received,
      sizeBytes: sizeBytes,
    );
    body = resp;
  } catch (e) {
    if (!resumed) rethrow;
    // 续传请求本身失败：清空重来一次（已收字节作废，弱网兜底）
    _log.warning('续传请求失败，改为整包重下: $e');
    part.writeAsBytesSync(const [], mode: FileMode.write);
    received = 0;
    final resp = await _openStream(dio, url, resumeFrom: 0);
    total = _resolveTotal(
      statusCode: resp.statusCode,
      contentLength: _contentLengthOf(resp),
      received: 0,
      sizeBytes: sizeBytes,
    );
    body = resp;
  }

  final raf =
      part.openSync(mode: received > 0 ? FileMode.append : FileMode.write);
  var lastReport = received;
  try {
    onProgress(_pctOf(received, total), received, total);
    await for (final chunk in body.stream) {
      raf.writeFromSync(chunk);
      received += chunk.length;
      if (received - lastReport >= _progressStepBytes) {
        lastReport = received;
        onProgress(_pctOf(received, total), received, total);
      }
    }
  } finally {
    await raf.close();
  }
  onProgress(_pctOf(received, total), received, total);

  // 校验放在 rename 之前：半成品绝不能变成"安装包"
  if (total > 0 && received < total) {
    throw Exception('下载中断（$received/$total 字节），请重试');
  }
  if (sha256.isNotEmpty) {
    if (!await _sha256Matches(part.path, sha256)) {
      part.deleteSync();
      throw Exception('安装包校验失败（网络中断导致文件不完整），请重试');
    }
  }

  part.renameSync(target.path);
  _log.info('安装包下载完成: $safeName（$received 字节）');
  _cleanup(dir, keep: target);
  return target.path;
}

Future<ResponseBody> _openStream(
  Dio dio,
  String url, {
  required int resumeFrom,
}) async {
  final resp = await dio.get<ResponseBody>(
    url,
    options: Options(
      headers:
          resumeFrom > 0 ? {'Range': 'bytes=$resumeFrom-'} : null,
      responseType: ResponseType.stream,
      followRedirects: true,
      validateStatus: (s) => s != null && s < 400,
    ),
  );
  // validateStatus 已保证 2xx，data 不会为 null
  return resp.data!;
}

int? _contentLengthOf(ResponseBody body) {
  final value = body.headers.value(Headers.contentLengthHeader);
  return value == null ? null : int.tryParse(value);
}

/// 206 的 content-length 是剩余长度，200 是全量；都拿不到就用清单里的 sizeBytes
int _resolveTotal({
  required int? statusCode,
  required int? contentLength,
  required int received,
  required int sizeBytes,
}) {
  if (statusCode == 206 && contentLength != null && contentLength > 0) {
    return received + contentLength;
  }
  if (contentLength != null && contentLength > 0) return contentLength;
  return sizeBytes;
}

Future<String?> _sha256Of(String path) async {
  try {
    return await _channel.invokeMethod<String>('computeSha256', {'path': path});
  } catch (e) {
    _log.warning('SHA-256 校验通道失败: $e');
    return null;
  }
}

Future<bool> _sha256Matches(String path, String expected) async {
  final actual = await _sha256Of(path);
  if (actual == null) return false;
  return actual.toLowerCase() == expected.toLowerCase();
}

/// 只保留刚下载的那一个包，其余 .apk/.part 一并清掉
void _cleanup(Directory dir, {required File keep}) {
  try {
    for (final entity in dir.listSync()) {
      if (entity.path == keep.path) continue;
      final name = entity.path.split(Platform.pathSeparator).last;
      if (name.endsWith('.apk') || name.endsWith('.part')) {
        entity.deleteSync();
      }
    }
  } catch (e) {
    _log.warning('清理旧安装包失败（不影响本次升级）: $e');
  }
}
