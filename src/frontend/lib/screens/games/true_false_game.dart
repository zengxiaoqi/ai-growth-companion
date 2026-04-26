import 'dart:async';

import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import 'game_completion_screen.dart';

typedef GameFinishedCallback = void Function(Map<String, dynamic> result);

/// 判断题游戏：对/错双按钮，选择后立即反馈。
class TrueFalseGame extends StatefulWidget {
  final Map<String, dynamic> data;
  final VoidCallback onExit;
  final GameFinishedCallback? onFinished;

  const TrueFalseGame({
    super.key,
    required this.data,
    required this.onExit,
    this.onFinished,
  });

  @override
  State<TrueFalseGame> createState() => _TrueFalseGameState();
}

class _TrueFalseGameState extends State<TrueFalseGame> {
  int _currentIndex = 0;
  int _correctCount = 0;
  bool? _selected;
  bool _revealed = false;
  bool _finished = false;
  final List<bool> _answers = <bool>[];

  List<Map<String, dynamic>> get _statements {
    final raw = widget.data['statements'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((s) => s.map((k, v) => MapEntry(k.toString(), v)))
        .where((s) => s['statement'] != null)
        .map((s) {
      final rawValue = s['isCorrect'];
      final isCorrect = rawValue == true || rawValue.toString() == 'true';
      return {
        ...s,
        'isCorrect': isCorrect,
      };
    }).toList();
  }

  void _submit(bool value) {
    if (_revealed) return;
    final current = _statements[_currentIndex];
    final isCorrect = (current['isCorrect'] as bool? ?? false) == value;

    setState(() {
      _selected = value;
      _revealed = true;
      _answers.add(value);
      if (isCorrect) _correctCount += 1;
    });

    Timer(const Duration(milliseconds: 850), () {
      if (!mounted) return;
      if (_currentIndex >= _statements.length - 1) {
        _finish();
      } else {
        setState(() {
          _currentIndex += 1;
          _selected = null;
          _revealed = false;
        });
      }
    });
  }

  void _finish() {
    final result = {
      'score': _correctCount,
      'totalQuestions': _statements.length,
      'correctAnswers': _correctCount,
      'interactionData': {
        'answers': _answers,
      },
    };

    widget.onFinished?.call(result);
    setState(() => _finished = true);
  }

  void _reset() {
    setState(() {
      _currentIndex = 0;
      _correctCount = 0;
      _selected = null;
      _revealed = false;
      _finished = false;
      _answers.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final items = _statements;
    final theme = Theme.of(context);

    if (items.isEmpty) {
      return _TrueFalseEmptyState(
        message: '暂无判断题数据',
        onBack: widget.onExit,
      );
    }

    if (_finished) {
      return GameCompletionScreen(
        title: widget.data['title']?.toString() ?? '判断题游戏',
        score: _correctCount,
        total: items.length,
        onPlayAgain: _reset,
        onBack: widget.onExit,
      );
    }

    final current = items[_currentIndex];
    final answer = current['isCorrect'] as bool? ?? false;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          widget.data['title']?.toString() ?? '判断题游戏',
          style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 10),
        LinearProgressIndicator(
          value: (_currentIndex + 1) / items.length,
          minHeight: 12,
          borderRadius: BorderRadius.circular(999),
          backgroundColor: AppTheme.softMint.withOpacity(0.25),
          color: AppTheme.secondaryColor,
        ),
        const SizedBox(height: 12),
        Text(
          '得分 $_correctCount / ${items.length}',
          style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            boxShadow: AppTheme.softShadow(AppTheme.softBlue),
          ),
          child: Text(
            current['statement']?.toString() ?? '',
            style: theme.textTheme.titleMedium?.copyWith(
              height: 1.45,
              fontWeight: FontWeight.w700,
            ),
            textAlign: TextAlign.center,
          ),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: _judgeButton(
                context: context,
                label: '对',
                icon: Icons.check_rounded,
                color: AppTheme.accentColor,
                selected: _selected == true,
                revealed: _revealed,
                isCorrectChoice: answer,
                onTap: () => _submit(true),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _judgeButton(
                context: context,
                label: '错',
                icon: Icons.close_rounded,
                color: AppTheme.warningColor,
                selected: _selected == false,
                revealed: _revealed,
                isCorrectChoice: !answer,
                onTap: () => _submit(false),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (_revealed)
          AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOut,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: (_selected == answer)
                  ? AppTheme.accentColor.withOpacity(0.15)
                  : AppTheme.warningColor.withOpacity(0.15),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              (_selected == answer) ? '判断正确，真棒！' : '这题答案是“${answer ? '对' : '错'}”哦',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyLarge?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
      ],
    );
  }

  Widget _judgeButton({
    required BuildContext context,
    required String label,
    required IconData icon,
    required Color color,
    required bool selected,
    required bool revealed,
    required bool isCorrectChoice,
    required VoidCallback onTap,
  }) {
    final showSuccess = revealed && isCorrectChoice;
    final showFail = revealed && selected && !isCorrectChoice;

    final borderColor = showSuccess
        ? AppTheme.accentColor
        : showFail
            ? AppTheme.warningColor
            : (selected ? color : Colors.grey.shade300);

    final bgColor = showSuccess
        ? AppTheme.accentColor.withOpacity(0.2)
        : showFail
            ? AppTheme.warningColor.withOpacity(0.2)
            : (selected ? color.withOpacity(0.12) : Colors.white);

    return Material(
      color: bgColor,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: revealed ? null : onTap,
        child: Container(
          height: 130,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: borderColor, width: 2.5),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 38, color: borderColor),
              const SizedBox(height: 8),
              Text(
                label,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: borderColor,
                    ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TrueFalseEmptyState extends StatelessWidget {
  final String message;
  final VoidCallback onBack;

  const _TrueFalseEmptyState({
    required this.message,
    required this.onBack,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.sentiment_neutral_rounded,
            size: 48,
            color: AppTheme.textSecondary,
          ),
          const SizedBox(height: 12),
          Text(message),
          const SizedBox(height: 12),
          FilledButton(onPressed: onBack, child: const Text('返回')),
        ],
      ),
    );
  }
}
