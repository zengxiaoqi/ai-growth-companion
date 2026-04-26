import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';

/// 游戏完成页：展示分数、星级和操作按钮。
class GameCompletionScreen extends StatelessWidget {
  final String title;
  final int score;
  final int total;
  final VoidCallback onPlayAgain;
  final VoidCallback onBack;

  const GameCompletionScreen({
    super.key,
    required this.title,
    required this.score,
    required this.total,
    required this.onPlayAgain,
    required this.onBack,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final percent = total <= 0 ? 0 : ((score / total) * 100).round();
    final stars = percent >= 100
        ? 3
        : percent >= 70
            ? 2
            : 1;

    return Center(
      child: TweenAnimationBuilder<double>(
        duration: const Duration(milliseconds: 450),
        tween: Tween<double>(begin: 0.85, end: 1),
        curve: Curves.easeOutBack,
        builder: (context, value, child) => Transform.scale(
          scale: value,
          child: child,
        ),
        child: Container(
          margin: const EdgeInsets.all(16),
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: AppTheme.rainbowGradient,
            borderRadius: BorderRadius.circular(24),
            boxShadow: AppTheme.softShadow(AppTheme.softPurple),
          ),
          child: Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.92),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.emoji_events_rounded,
                  size: 64,
                  color: theme.colorScheme.primary,
                ),
                const SizedBox(height: 8),
                Text(
                  '$title 完成啦',
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: AppTheme.textColor,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  '得分：$score / $total',
                  style: theme.textTheme.titleMedium?.copyWith(
                    color: AppTheme.textColor,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: List.generate(3, (index) {
                    final enabled = index < stars;
                    return Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: AnimatedScale(
                        scale: enabled ? 1 : 0.8,
                        duration: Duration(milliseconds: 250 + index * 120),
                        curve: Curves.easeOutBack,
                        child: Icon(
                          Icons.star_rounded,
                          size: 38,
                          color: enabled
                              ? const Color(0xFFFFC928)
                              : Colors.grey.shade300,
                        ),
                      ),
                    );
                  }),
                ),
                const SizedBox(height: 12),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  decoration: BoxDecoration(
                    color: AppTheme.softYellow.withOpacity(0.65),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '正确率：$percent%',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textColor,
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: onPlayAgain,
                    icon: const Icon(Icons.replay_rounded),
                    label: const Text('再来一次'),
                  ),
                ),
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: onBack,
                    icon: const Icon(Icons.arrow_back_rounded),
                    label: const Text('返回课程'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
