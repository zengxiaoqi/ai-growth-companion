import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// 统一空状态组件，替代各屏幕中 ad-hoc 的空状态 UI。
///
/// 用于展示无数据时的引导提示，包含图标/emoji、标题、副标题、可选操作按钮。
///
/// 示例：暂无课程🌱、暂无成就🏆、暂无消息📭
///
/// ```dart
/// EmptyState(
///   emoji: '📚',
///   title: '暂无课程',
///   subtitle: '快去开启你的学习之旅吧~',
///   actionLabel: '去学习',
///   onAction: () { /* navigate */ },
/// )
/// ```
class EmptyState extends StatelessWidget {
  /// Emoji 字符（优先于 [icon]）
  final String? emoji;

  /// Material Icon（[emoji] 为 null 时使用）
  final IconData? icon;

  /// 标题文本
  final String title;

  /// 副标题/描述文本（可选）
  final String? subtitle;

  /// 操作按钮文本（不为 null 时显示按钮）
  final String? actionLabel;

  /// 操作按钮回调
  final VoidCallback? onAction;

  /// Emoji/图标尺寸（默认 64）
  final double iconSize;

  /// Emoji/图标颜色（默认 [AppTheme.primaryColor]）
  final Color? iconColor;

  /// 内边距
  final EdgeInsetsGeometry padding;

  /// Semantics 语义化标签
  final String? semanticLabel;

  const EmptyState({
    super.key,
    this.emoji,
    this.icon,
    required this.title,
    this.subtitle,
    this.actionLabel,
    this.onAction,
    this.iconSize = 64,
    this.iconColor,
    this.padding = const EdgeInsets.symmetric(horizontal: 32, vertical: 48),
    this.semanticLabel,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: semanticLabel ?? '空状态：$title',
      container: true,
      child: Center(
        child: Padding(
          padding: padding,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // 图标/emoji
              if (emoji != null)
                Text(
                  emoji!,
                  style: TextStyle(fontSize: iconSize),
                  textAlign: TextAlign.center,
                )
              else if (icon != null)
                Icon(
                  icon,
                  size: iconSize,
                  color: iconColor ??
                      AppTheme.textSecondary.withValues(alpha: 0.4),
                ),
              const SizedBox(height: 20),

              // 标题
              Semantics(
                header: true,
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.textColor,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),

              // 副标题
              if (subtitle != null) ...[
                const SizedBox(height: 8),
                Text(
                  subtitle!,
                  style: const TextStyle(
                    fontSize: 14,
                    color: AppTheme.textSecondary,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],

              // 操作按钮
              if (actionLabel != null && onAction != null) ...[
                const SizedBox(height: 24),
                Semantics(
                  button: true,
                  label: actionLabel,
                  child: ElevatedButton(
                    onPressed: onAction,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primaryColor,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 32,
                        vertical: 14,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius:
                            BorderRadius.circular(AppTheme.buttonRadius),
                      ),
                      elevation: 0,
                      textStyle: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    child: Text(actionLabel!),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}