import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../theme/app_theme.dart';
import '../../theme/child_theme.dart';
import '../../providers/user_provider.dart';

/// 孩子端 → 家长端切换（需要家长 PIN）。
///
/// 原来挂在孩子端常驻 TopBar 上；TopBar 去掉后改由「我的」页右上角按钮触发，
/// 所以抽成独立函数，任何页面都能复用。
Future<void> showSwitchToParentDialog(BuildContext context) async {
  // 返回值：true = 已经切换到家长端。
  //
  // 注意：对话框的内容必须由 [_SwitchToParentDialog] 这个 StatefulWidget 自己
  // 持有 TextEditingController 并在 State.dispose 里释放。**不能**在这里
  // `await showDialog(...)` 之后直接 dispose 掉 controller —— showDialog 的
  // future 在 pop 的那一刻就完成，而对话框还要播完退场动画（默认 150ms）才真正
  // 从树上摘掉。这期间它仍会重建（切端时 MaterialApp 主题从孩子皮肤换成
  // parentTheme，整棵树都要重建），TextField 一旦碰到已 dispose 的 controller
  // 就抛 "A TextEditingController was used after being disposed."，随后的
  // Overlay 反激活会连带炸出 framework.dart 的
  // `Failed assertion: '_dependents.isEmpty': is not true.`（红屏就是它）。
  final switched = await showDialog<bool>(
    context: context,
    barrierDismissible: true,
    builder: (_) => const _SwitchToParentDialog(),
  );

  if (switched != true || !context.mounted) return;
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: const Text('已切换到家长端'),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      duration: const Duration(seconds: 1),
    ),
  );
}

class _SwitchToParentDialog extends StatefulWidget {
  const _SwitchToParentDialog();

  @override
  State<_SwitchToParentDialog> createState() => _SwitchToParentDialogState();
}

class _SwitchToParentDialogState extends State<_SwitchToParentDialog> {
  final TextEditingController _pinController = TextEditingController();
  bool _isSubmitting = false;
  String? _errorMsg;

  @override
  void dispose() {
    _pinController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final pin = _pinController.text.trim();
    if (pin.isEmpty) {
      setState(() => _errorMsg = '请输入家长登录密码');
      return;
    }

    setState(() {
      _isSubmitting = true;
      _errorMsg = null;
    });

    final error = await context.read<UserProvider>().switchToParentMode(pin);
    if (!mounted) return;

    if (error.isEmpty) {
      // 先关掉对话框，SnackBar 交给外层（角色已切换，本页可能正在退场）。
      Navigator.pop(context, true);
    } else {
      setState(() {
        _isSubmitting = false;
        _errorMsg = error;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    return AlertDialog(
      backgroundColor: palette.card,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      title: Row(
        children: [
          Icon(Icons.lock_rounded, size: 22, color: palette.pop),
          const SizedBox(width: 8),
          Text('切换到家长端',
              style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: palette.ink)),
        ],
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '请输入家长登录密码',
            style: TextStyle(fontSize: 14, color: palette.ink2),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _pinController,
            keyboardType: TextInputType.visiblePassword,
            textAlign: TextAlign.center,
            obscureText: true,
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: palette.ink,
            ),
            decoration: InputDecoration(
              hintText: '请输入密码',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide: BorderSide(color: AppTheme.primaryColor, width: 2),
              ),
            ),
            autofocus: true,
            enabled: !_isSubmitting,
            onSubmitted: (_) {
              if (!_isSubmitting) _submit();
            },
          ),
          if (_errorMsg != null) ...[
            const SizedBox(height: 12),
            Text(
              _errorMsg!,
              style: TextStyle(fontSize: 13, color: Colors.red.shade600),
            ),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: _isSubmitting ? null : () => Navigator.pop(context),
          child: const Text('取消'),
        ),
        ElevatedButton(
          onPressed: _isSubmitting ? null : _submit,
          style: ElevatedButton.styleFrom(
            backgroundColor: AppTheme.primaryColor,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
          ),
          child: _isSubmitting
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                    color: Colors.white,
                    strokeWidth: 2.5,
                  ),
                )
              : const Text('确认切换'),
        ),
      ],
    );
  }
}
