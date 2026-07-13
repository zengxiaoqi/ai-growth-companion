import 'package:flutter/material.dart';

import '../../services/tts_service.dart';
import '../../theme/app_theme.dart';

/// 游戏完成页：展示分数、星级和操作按钮。
class GameCompletionScreen extends StatefulWidget {
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
  State<GameCompletionScreen> createState() => _GameCompletionScreenState();
}

class _GameCompletionScreenState extends State<GameCompletionScreen> {
  late final int percent;
  late final int stars;
  late final String speakText;

  void _calculateScores() {
    percent = widget.total <= 0 ? 0 : ((widget.score / widget.total) * 100).round();
    stars = percent >= 100
        ? 3
        : percent >= 70
            ? 2
            : 1;

    final praise = stars == 3
        ? '太棒了！'
        : stars == 2
            ? '不错哦'
            : '继续加油';
    speakText = '游戏完成！得分${widget.score}分，共${widget.total}题，正确率$percent%。$praise';
  }

  Future<void> _speakScore() async {
    await TtsService().speak(speakText);
  }

  @override
  void initState() {
    super.initState();
    _calculateScores();
    // 延迟一小段时间让 UI 先渲染完毕再播报
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _speakScore();
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

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
              color: Colors.white.withValues(alpha: 0.92),
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
                // 标题 + 喇叭按钮（重新朗读）
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Flexible(
                      child: Text(
                        '${widget.title} 完成啦',
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: AppTheme.textColor,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Tooltip(
                      message: '重新朗读',
                      child: IconButton(
                        icon: const Icon(Icons.volume_up_rounded, size: 24),
                        onPressed: _speakScore,
                        color: AppTheme.softPurple,
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  '得分：${widget.score} / ${widget.total}',
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
                    color: AppTheme.softYellow.withValues(alpha: 0.65),
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
                    onPressed: widget.onPlayAgain,
                    icon: const Icon(Icons.replay_rounded),
                    label: const Text('再来一次'),
                  ),
                ),
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: widget.onBack,
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
