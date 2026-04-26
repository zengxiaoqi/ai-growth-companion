import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// TopBar 操作按钮
class TopBarAction {
  final String key;
  final String label;
  final IconData icon;
  final VoidCallback onTap;
  final bool isDanger;

  const TopBarAction({
    required this.key,
    required this.label,
    required this.icon,
    required this.onTap,
    this.isDanger = false,
  });
}

/// 顶部导航栏组件
/// 支持标题、副标题、返回按钮、右侧操作按钮
class TopBar extends StatelessWidget implements PreferredSizeWidget {
  final String title;
  final String? subtitle;
  final Widget? leftSlot;
  final List<TopBarAction> actions;

  const TopBar({
    super.key,
    required this.title,
    this.subtitle,
    this.leftSlot,
    this.actions = const [],
  });

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.only(
        top: MediaQuery.of(context).padding.top,
      ),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(20)),
        boxShadow: [
          BoxShadow(
            color: AppTheme.primaryColor.withOpacity(0.06),
            blurRadius: 15,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Container(
        height: kToolbarHeight,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: Row(
          children: [
            // 左侧插槽
            if (leftSlot != null) ...[
              leftSlot!,
              const SizedBox(width: 8),
            ],

            // 标题区域
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textColor,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (subtitle != null)
                    Text(
                      subtitle!,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                ],
              ),
            ),

            // 右侧操作按钮
            if (actions.isNotEmpty)
              Row(
                mainAxisSize: MainAxisSize.min,
                children: actions.map((action) {
                  return _ActionButton(action: action);
                }).toList(),
              ),
          ],
        ),
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  final TopBarAction action;

  const _ActionButton({required this.action});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: action.onTap,
      tooltip: action.label,
      icon: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: action.isDanger
              ? Colors.red.shade50
              : AppTheme.backgroundColor,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Icon(
          action.icon,
          size: 20,
          color: action.isDanger ? Colors.red.shade400 : AppTheme.textSecondary,
        ),
      ),
    );
  }
}
