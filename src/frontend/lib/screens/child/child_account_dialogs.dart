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
  final pinController = TextEditingController();
  bool isSubmitting = false;
  String? errorMsg;

  await showDialog<void>(
    context: context,
    barrierDismissible: true,
    builder: (dialogContext) {
      final palette = ChildThemePalette.of(dialogContext);
      return StatefulBuilder(
        builder: (ctx, setState) {
          return AlertDialog(
            backgroundColor: palette.card,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(24),
            ),
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
                  controller: pinController,
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
                      borderSide:
                          BorderSide(color: AppTheme.primaryColor, width: 2),
                    ),
                  ),
                  autofocus: true,
                  enabled: !isSubmitting,
                ),
                if (errorMsg != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    errorMsg!,
                    style: TextStyle(fontSize: 13, color: Colors.red.shade600),
                  ),
                ],
              ],
            ),
            actions: [
              TextButton(
                onPressed:
                    isSubmitting ? null : () => Navigator.pop(dialogContext),
                child: const Text('取消'),
              ),
              ElevatedButton(
                onPressed: isSubmitting
                    ? null
                    : () async {
                        final pin = pinController.text.trim();
                        if (pin.isEmpty) {
                          setState(() => errorMsg = '请输入家长登录密码');
                          return;
                        }

                        setState(() {
                          isSubmitting = true;
                          errorMsg = null;
                        });

                        final userProvider = ctx.read<UserProvider>();
                        final error =
                            await userProvider.switchToParentMode(pin);

                        if (!dialogContext.mounted) return;

                        if (error.isEmpty) {
                          Navigator.pop(dialogContext);
                          if (!context.mounted) return;
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: const Text('已切换到家长端'),
                              behavior: SnackBarBehavior.floating,
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12)),
                              duration: const Duration(seconds: 1),
                            ),
                          );
                        } else {
                          setState(() {
                            isSubmitting = false;
                            errorMsg = error;
                          });
                        }
                      },
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primaryColor,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                child: isSubmitting
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
        },
      );
    },
  );

  pinController.dispose();
}
