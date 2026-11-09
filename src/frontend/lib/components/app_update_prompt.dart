// App 内更新 UI：更新弹窗 → 下载进度 → 授权引导 → 拉起系统安装器。
//
// 与 senior-anti-fraud-guard 的 AppUpdateUi 对齐的体验：
//  - 启动静默检查（autoCheck）：有新版本才弹窗，同一版本一天最多提示一次；
//  - 手动检查（manualCheck）：无节流，结果一定可见；
//  - 弹窗显示新版本号、体积、更新说明 → 「立即升级」→ 进度（百分比 + 已下载/总量，
//    建议连接 Wi-Fi）→ 下载完自动拉起系统安装界面；
//  - 首次升级需要系统授权：引导用户打开「允许来自此来源的应用」，
//    从设置页返回后自动续接安装，不需要再点一次升级。

import 'package:flutter/material.dart';

import '../services/app_update_service.dart';
import '../theme/app_theme.dart';

class AppUpdatePrompt {
  AppUpdatePrompt._();

  /// 启动后静默检查：有新版本才弹窗，同一版本一天最多提示一次
  static Future<void> autoCheck(BuildContext context) async {
    if (!AppUpdateService.isSupported) return;
    final result = await AppUpdateService.instance.check();
    final info = result.info;
    if (info == null) return;
    if (!await AppUpdateService.instance.shouldPromptToday(info.versionCode)) {
      return;
    }
    await AppUpdateService.instance.markPrompted(info.versionCode);
    if (!context.mounted) return;
    _showUpdateDialog(context, result);
  }

  /// 设置页「检查更新」：无节流，结果一定可见
  static Future<void> manualCheck(BuildContext context) async {
    if (!AppUpdateService.isSupported) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('应用内更新仅支持 Android 版')),
      );
      return;
    }
    final messenger = ScaffoldMessenger.of(context);
    final controller = messenger.showSnackBar(
      const SnackBar(
        content: Text('正在检查更新…'),
        duration: Duration(minutes: 1),
      ),
    );
    final result = await AppUpdateService.instance.check();
    controller.close();
    if (!context.mounted) return;

    if (result.hasUpdate) {
      _showUpdateDialog(context, result);
      return;
    }
    if (result.error != null) {
      _showToast(context, result.error!, AppTheme.errorColor);
      return;
    }
    final name = result.currentVersionName;
    _showToast(
      context,
      name.isEmpty ? '当前已是最新版本' : '当前已是最新版本 v$name',
      AppTheme.successColor,
    );
  }

  static void _showToast(BuildContext context, String message, Color color) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: color,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  static void _showUpdateDialog(
    BuildContext context,
    AppUpdateCheckResult result,
  ) {
    final info = result.info!;
    showDialog<bool>(
      context: context,
      barrierDismissible: !info.force,
      builder: (dialogContext) => PopScope(
        canPop: !info.force,
        child: AlertDialog(
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppTheme.accentColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.system_update_rounded,
                    size: 22, color: AppTheme.successColor),
              ),
              const SizedBox(width: 10),
              const Expanded(child: Text('发现新版本', style: TextStyle(fontSize: 18))),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'v${info.versionName} · ${info.sizeText}',
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.primaryColor,
                ),
              ),
              const SizedBox(height: 10),
              Flexible(
                child: SingleChildScrollView(
                  child: Text(
                    info.changelog,
                    style: const TextStyle(
                        fontSize: 13, color: AppTheme.textColor, height: 1.5),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              const Text(
                '升级完成后会自动重启到新版本，建议连接 Wi-Fi 后下载。',
                style: TextStyle(fontSize: 11, color: AppTheme.textSecondary),
              ),
            ],
          ),
          actions: [
            if (!info.force)
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(),
                child: const Text('稍后再说',
                    style: TextStyle(color: AppTheme.textSecondary)),
              ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primaryColor,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: () {
                Navigator.of(dialogContext).pop();
                showDialog(
                  context: context,
                  barrierDismissible: false,
                  builder: (_) => _UpdateFlowDialog(result),
                );
              },
              child: const Text('立即升级'),
            ),
          ],
        ),
      ),
    );
  }
}

enum _FlowState { downloading, installing, needPermission, launched, failed }

class _UpdateFlowDialog extends StatefulWidget {
  final AppUpdateCheckResult result;

  const _UpdateFlowDialog(this.result);

  @override
  State<_UpdateFlowDialog> createState() => _UpdateFlowDialogState();
}

class _UpdateFlowDialogState extends State<_UpdateFlowDialog>
    with WidgetsBindingObserver {
  _FlowState _state = _FlowState.downloading;
  int _received = 0;
  int _total = 0;
  String _error = '';
  String? _apkPath;

  AppReleaseInfo get _info => widget.result.info!;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _download();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // 从「允许安装未知应用」设置页返回 → 自动续接安装，不用再点一次
    if (state == AppLifecycleState.resumed &&
        _state == _FlowState.needPermission) {
      _install();
    }
  }

  Future<void> _download() async {
    setState(() {
      _state = _FlowState.downloading;
      _error = '';
    });
    try {
      final path = await AppUpdateService.instance.downloadApk(
        _info,
        onProgress: (percent, received, total) {
          if (!mounted) return;
          setState(() {
            _received = received;
            _total = total;
          });
        },
      );
      _apkPath = path;
      if (!mounted) return;
      await _install();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _state = _FlowState.failed;
        _error = e.toString().replaceFirst(RegExp(r'^(Exception|DioException):\s*'), '');
      });
    }
  }

  Future<void> _install() async {
    if (_apkPath == null) return;
    setState(() => _state = _FlowState.installing);
    final res = await AppUpdateService.instance.installApk(_apkPath!);
    if (!mounted) return;
    if (res == 'ok') {
      // 系统安装器已拉起；用户切去安装时把进度框收掉
      setState(() => _state = _FlowState.launched);
      Future.delayed(const Duration(milliseconds: 600), () {
        if (mounted && Navigator.of(context).canPop()) {
          Navigator.of(context).pop();
        }
      });
    } else if (res == 'need_permission') {
      setState(() => _state = _FlowState.needPermission);
    } else {
      setState(() {
        _state = _FlowState.failed;
        _error = '无法拉起系统安装器，请重试';
      });
    }
  }

  String get _sizeLine {
    if (_total > 0) {
      return '${(_received / 1024 / 1024).toStringAsFixed(1)} / '
          '${(_total / 1024 / 1024).toStringAsFixed(1)} MB'
          '（${(_received * 100 / _total).clamp(0, 100).toStringAsFixed(0)}%）';
    }
    return '${(_received / 1024 / 1024).toStringAsFixed(1)} MB';
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: _state == _FlowState.failed,
      child: AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(_title, style: const TextStyle(fontSize: 17)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (_state == _FlowState.downloading) ...[
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: LinearProgressIndicator(
                  value: _total > 0 ? (_received / _total).clamp(0.0, 1.0) : null,
                  minHeight: 10,
                  backgroundColor: AppTheme.backgroundColor,
                  valueColor:
                      const AlwaysStoppedAnimation(AppTheme.primaryColor),
                ),
              ),
              const SizedBox(height: 12),
              Text(_sizeLine,
                  style: const TextStyle(
                      fontSize: 13, color: AppTheme.textColor)),
              const SizedBox(height: 6),
              const Text('下载中，建议连接 Wi-Fi…',
                  style: TextStyle(
                      fontSize: 11, color: AppTheme.textSecondary)),
            ] else if (_state == _FlowState.installing) ...[
              const Row(
                children: [
                  SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2.5),
                  ),
                  SizedBox(width: 12),
                  Expanded(child: Text('正在准备安装…', style: TextStyle(fontSize: 13))),
                ],
              ),
            ] else if (_state == _FlowState.needPermission) ...[
              const Text(
                '首次升级需要一次系统授权：请在接下来的页面中打开「允许来自此来源的应用」，'
                '返回后下载好的安装包会自动继续安装。',
                style: TextStyle(fontSize: 13, height: 1.6),
              ),
              const SizedBox(height: 6),
              Text('安装包已就绪：${_info.fileName}',
                  style: const TextStyle(
                      fontSize: 11, color: AppTheme.textSecondary)),
            ] else if (_state == _FlowState.launched) ...[
              const Text('已拉起系统安装器，请在安装界面点击「安装」。',
                  style: TextStyle(fontSize: 13)),
            ] else ...[
              const Icon(Icons.error_outline_rounded,
                  color: AppTheme.errorColor, size: 28),
              const SizedBox(height: 8),
              Text(_error,
                  style: const TextStyle(
                      fontSize: 13, color: AppTheme.errorColor)),
            ],
          ],
        ),
        actions: _actions,
      ),
    );
  }

  String get _title {
    switch (_state) {
      case _FlowState.downloading:
        return '正在下载更新 v${_info.versionName}';
      case _FlowState.installing:
        return '正在准备安装';
      case _FlowState.needPermission:
        return '需要安装授权';
      case _FlowState.launched:
        return '等待安装';
      case _FlowState.failed:
        return '更新失败';
    }
  }

  List<Widget> get _actions {
    switch (_state) {
      case _FlowState.needPermission:
        return [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('取消',
                style: TextStyle(color: AppTheme.textSecondary)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.primaryColor,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: AppUpdateService.instance.openInstallPermissionSettings,
            child: const Text('去设置'),
          ),
        ];
      case _FlowState.failed:
        return [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('关闭',
                style: TextStyle(color: AppTheme.textSecondary)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.primaryColor,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: _download,
            child: const Text('重试'),
          ),
        ];
      default:
        return const [];
    }
  }
}
