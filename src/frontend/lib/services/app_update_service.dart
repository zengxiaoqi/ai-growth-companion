// App 内自升级服务：查版本 → 下载（app_update_downloader）→ 拉起安装。
//
// 更新源（双通道，自动回退）：
//   1. 后端代理 /api/app-update/latest（国内快，清单拉不到时后端返回 503）；
//   2. GitHub Release latest.json 直连兜底。
//
// 版本比较只用 versionCode（pubspec.yaml 的 buildNumber），绝不比较
// versionName 字符串 —— "1.10.0" < "1.9.0" 在字符串比较下是真的。
// Web / 非 Android 平台 isSupported 为 false，所有入口自动跳过。

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../utils/app_logger.dart';
import 'api_service.dart' show getApiBaseUrl;
import 'app_update_downloader.dart';

final _log = AppLogger('AppUpdateService');

/// 服务端下发的一个可升级版本
class AppReleaseInfo {
  final int versionCode;
  final String versionName;
  final int sizeBytes;
  final String sha256;
  final String changelog;
  final bool force;
  final String downloadUrl;
  final String fileName;

  const AppReleaseInfo({
    required this.versionCode,
    required this.versionName,
    required this.sizeBytes,
    required this.sha256,
    required this.changelog,
    required this.force,
    required this.downloadUrl,
    required this.fileName,
  });

  /// 兼容两种输入：/latest 响应里的 latest 节点，或 GitHub 的清单本体。
  /// 字段缺失时返回 null，而不是拿半截数据去弹窗。
  static AppReleaseInfo? fromManifest(Map<String, dynamic> m) {
    final code = (m['versionCode'] as num?)?.toInt() ?? 0;
    final url = (m['downloadUrl'] as String?) ?? '';
    if (code <= 0 || url.isEmpty) return null;
    var fileName = (m['fileName'] as String?) ?? '';
    if (fileName.isEmpty) fileName = 'lingxi-companion-$code.apk';
    final minCode = (m['minSupportedCode'] as num?)?.toInt() ?? 0;
    return AppReleaseInfo(
      versionCode: code,
      versionName: (m['versionName'] as String?) ?? '',
      sizeBytes: (m['sizeBytes'] as num?)?.toInt() ?? 0,
      sha256: (m['sha256'] as String?) ?? '',
      changelog: (m['changelog'] as String?) ?? '优化体验与修复已知问题',
      force: m['force'] == true || (minCode > 0 && code <= minCode),
      downloadUrl: url,
      fileName: fileName,
    );
  }

  /// 体积的可读形式，弹窗里告诉用户要下多大
  String get sizeText =>
      sizeBytes <= 0 ? '未知大小' : '${(sizeBytes / 1024 / 1024).toStringAsFixed(1)} MB';
}

class AppUpdateCheckResult {
  final AppReleaseInfo? info; // null = 已是最新
  final String? error; // 环境/网络错误（info 同时为 null 时展示给用户）
  final int currentVersionCode;
  final String currentVersionName;

  const AppUpdateCheckResult({
    required this.info,
    this.error,
    required this.currentVersionCode,
    required this.currentVersionName,
  });

  bool get hasUpdate => info != null && error == null;
}

class AppUpdateService {
  AppUpdateService._();

  static final AppUpdateService instance = AppUpdateService._();

  /// 与 MainActivity.kt 中的 channel 名一致
  static const MethodChannel _channel =
      MethodChannel('com.example.lingxi_companion/app_update');

  static const String _githubRepo = 'zengxiaoqi/ai-growth-companion';

  /// 检查更新专用 Dio：比业务请求更短的超时，检查失败不阻塞任何主流程
  final Dio _checkDio = Dio(BaseOptions(
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 20),
  ));

  /// 应用内更新只在 Android 安装包里有意义
  static bool get isSupported =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  // ── 本机版本 ────────────────────────────────────────────────

  /// 返回 (versionCode, versionName)；通道失败抛异常
  Future<(int, String)> currentVersion() async {
    final res = await _channel.invokeMethod<dynamic>('getVersionInfo');
    final code = (res?['versionCode'] as num?)?.toInt() ?? 0;
    final name = (res?['versionName'] as String?) ?? '';
    return (code, name);
  }

  // ── 查询最新版本 ────────────────────────────────────────────

  /// 检查是否有新版本。查不到/失败一律不抛异常，升级是锦上添花，
  /// 它的失败不能影响主流程。
  Future<AppUpdateCheckResult> check() async {
    int code = 0;
    String name = '';
    try {
      (code, name) = await currentVersion();
    } catch (e) {
      _log.warning('读取本机版本失败: $e');
      return AppUpdateCheckResult(
        info: null,
        error: '无法读取当前版本（应用内更新需要 Android 版）',
        currentVersionCode: 0,
        currentVersionName: '',
      );
    }

    // 1) 后端代理（清单不可用时后端 503 → 走 GitHub 兜底）
    final apiJson = await _fetchJson(
      '${getApiBaseUrl()}/app-update/latest?versionCode=$code',
    );
    if (apiJson != null) {
      if (apiJson['hasUpdate'] == true && apiJson['latest'] is Map) {
        final info = AppReleaseInfo.fromManifest(
          (apiJson['latest'] as Map).cast<String, dynamic>(),
        );
        if (info != null && info.versionCode > code) {
          return AppUpdateCheckResult(
            info: info,
            currentVersionCode: code,
            currentVersionName: name,
          );
        }
      }
      // 后端明确回复（无论是否有更新）→ 它就是权威
      return AppUpdateCheckResult(
        info: null,
        currentVersionCode: code,
        currentVersionName: name,
      );
    }

    // 2) GitHub 直连兜底：releases/latest/download/latest.json 无需鉴权
    final ghJson = await _fetchJson(
      'https://github.com/$_githubRepo/releases/latest/download/latest.json',
    );
    if (ghJson == null) {
      return AppUpdateCheckResult(
        info: null,
        error: '检查更新失败，请检查网络后重试',
        currentVersionCode: code,
        currentVersionName: name,
      );
    }
    final latestMap =
        ghJson['latest'] is Map ? ghJson['latest'] as Map : ghJson;
    final info = AppReleaseInfo.fromManifest(latestMap.cast<String, dynamic>());
    if (info != null && info.versionCode > code) {
      return AppUpdateCheckResult(
        info: info,
        currentVersionCode: code,
        currentVersionName: name,
      );
    }
    return AppUpdateCheckResult(
      info: null,
      currentVersionCode: code,
      currentVersionName: name,
    );
  }

  Future<Map<String, dynamic>?> _fetchJson(String url) async {
    try {
      final resp = await _checkDio.get<Map<String, dynamic>>(
        url,
        options: Options(
          responseType: ResponseType.json,
          followRedirects: true,
          validateStatus: (s) => s != null && s < 400,
        ),
      );
      return resp.data;
    } catch (e) {
      _log.warning('拉取更新信息失败 ($url): $e');
      return null;
    }
  }

  // ── 下载与安装 ──────────────────────────────────────────────

  /// 把相对 downloadUrl（如 /api/app-update/download?...）解析成绝对地址。
  /// 后端下发的路径已含 /api 前缀，需要剥掉 baseUrl 上的 /api 再拼。
  String resolveUrl(String url) {
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    final base = getApiBaseUrl();
    final host = base.endsWith('/api') ? base.substring(0, base.length - 4) : base;
    return url.startsWith('/') ? '$host$url' : '$host/$url';
  }

  /// 下载安装包（断点续传 + SHA-256 校验），返回最终 APK 路径
  Future<String> downloadApk(
    AppReleaseInfo info, {
    required void Function(int percent, int received, int total) onProgress,
  }) {
    return downloadUpdateApk(
      url: resolveUrl(info.downloadUrl),
      fileName: info.fileName,
      sizeBytes: info.sizeBytes,
      sha256: info.sha256,
      onProgress: onProgress,
    );
  }

  /// 拉起系统安装器。返回 'ok' / 'need_permission' / 'failed'
  Future<String> installApk(String path) async {
    try {
      final res = await _channel.invokeMethod<String>(
        'installApk',
        {'path': path},
      );
      return res ?? 'failed';
    } catch (e) {
      _log.warning('拉起安装失败: $e');
      return 'failed';
    }
  }

  Future<bool> canInstallPackages() async {
    try {
      return await _channel.invokeMethod<bool>('canInstallPackages') ?? false;
    } catch (_) {
      return false;
    }
  }

  Future<bool> openInstallPermissionSettings() async {
    try {
      return await _channel.invokeMethod<bool>('openInstallPermissionSettings') ??
          false;
    } catch (_) {
      return false;
    }
  }

  // ── 提示节流：同一版本一天最多提示一次（手动检查不受限） ──────

  static const String _kPromptCode = 'update_prompt_code';
  static const String _kPromptDate = 'update_prompt_date';

  Future<bool> shouldPromptToday(int versionCode) async {
    final prefs = await SharedPreferences.getInstance();
    final today = DateTime.now().toIso8601String().substring(0, 10);
    return (prefs.getInt(_kPromptCode) ?? 0) != versionCode ||
        (prefs.getString(_kPromptDate) ?? '') != today;
  }

  /// 标记"今天已经提示过"（弹窗展示时 / 用户点稍后再说时调用）
  Future<void> markPrompted(int versionCode) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_kPromptCode, versionCode);
    await prefs.setString(
      _kPromptDate,
      DateTime.now().toIso8601String().substring(0, 10),
    );
  }
}
