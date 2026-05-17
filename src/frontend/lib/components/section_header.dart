import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// 统一区块标题组件，替代各屏幕中重复的 Row+emoji+Text 区块标题模式。
///
/// 用于标记内容分区，如"📚 我的课程"、"🏆 成就徽章"、"🎮 推荐游戏"等。
///
/// 基本用法：
/// ```dart
/// SectionHeader(
///   emoji: '📚',
///   title: '我的课程',
///   trailing: Text('3 门课'),
/// )
/// ```
///
/// 点击用法（带展开/收起箭头）：
/// ```dart
/// SectionHeader(
///   emoji: '🔥',
///   title: '热门推荐',
///   onTap: () { /* toggle expand */ },
/// )
/// ```
class SectionHeader extends StatelessWidget {
  /// 标题前的 emoji 图标
  final String emoji;

  /// 标题文本
  final String title;

  /// 标题右侧尾部 widget（如计数、更多按钮等）
  final Widget? trailing;

  /// 整个区块标题的点击回调（如折叠/展开）
  final VoidCallback? onTap;

  /// 左边距（默认水平 0）
  final EdgeInsetsGeometry padding;

  /// Emoji 字号（默认 22）
  final double emojiSize;

  const SectionHeader({
    super.key,
    required this.emoji,
    required this.title,
    this.trailing,
    this.onTap,
    this.padding = EdgeInsets.zero,
    this.emojiSize = 22,
  });

  @override
  Widget build(BuildContext context) {
    final row = Padding(
      padding: padding,
      child: Semantics(
        header: true,
        child: Row(
          children: [
            // Emoji
            Text(emoji, style: TextStyle(fontSize: emojiSize)),
            const SizedBox(width: 8),

            // 标题
            Text(
              title,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: AppTheme.textColor,
              ),
            ),

            const Spacer(),

            // 尾部 widget
            if (trailing != null) trailing!,

            // 可点击时的展开箭头
            if (onTap != null) ...[
              const SizedBox(width: 4),
              Icon(
                Icons.chevron_right_rounded,
                color: AppTheme.textSecondary.withOpacity(0.6),
                size: 22,
              ),
            ],
          ],
        ),
      ),
    );

    if (onTap != null) {
      return InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppTheme.smallRadius),
        child: row,
      );
    }

    return row;
  }
}