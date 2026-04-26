import 'dart:async';

import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import 'game_completion_screen.dart';

typedef GameFinishedCallback = void Function(Map<String, dynamic> result);

/// 选择题游戏：支持题目、四选一、即时反馈与进度。
class QuizGame extends StatefulWidget {
  final Map<String, dynamic> data;
  final VoidCallback onExit;
  final GameFinishedCallback? onFinished;

  const QuizGame({
    super.key,
    required this.data,
    required this.onExit,
    this.onFinished,
  });

  @override
  State<QuizGame> createState() => _QuizGameState();
}

class _QuizGameState extends State<QuizGame> {
  int _currentIndex = 0;
  int _correctCount = 0;
  int? _selectedIndex;
  bool _revealed = false;
  bool _finished = false;
  bool _feedbackCorrect = false;
  final List<int> _answers = <int>[];

  List<Map<String, dynamic>> get _questions {
    final raw = widget.data['questions'];
    if (raw is! List) return const [];

    return raw
        .whereType<Map>()
        .map((q) => q.map((k, v) => MapEntry(k.toString(), v)))
        .where((q) => q['question'] != null && q['options'] is List)
        .map((q) {
      final options = (q['options'] as List)
          .map((e) => e.toString().trim())
          .where((e) => e.isNotEmpty)
          .toList();
      var correctIndex = _toInt(q['correctIndex'] ?? q['correctAnswer']);
      if (correctIndex < 0 || correctIndex >= options.length) {
        final oneBased = correctIndex - 1;
        correctIndex =
            (oneBased >= 0 && oneBased < options.length) ? oneBased : 0;
      }
      return {
        ...q,
        'options': options,
        'correctIndex': correctIndex,
      };
    }).toList();
  }

  int _toInt(dynamic value) {
    final n = int.tryParse(value?.toString() ?? '');
    return n ?? 0;
  }

  void _selectOption(int index) {
    if (_revealed) return;
    final current = _questions[_currentIndex];
    final isCorrect = index == (current['correctIndex'] as int? ?? 0);

    setState(() {
      _selectedIndex = index;
      _revealed = true;
      _feedbackCorrect = isCorrect;
      _answers.add(index);
      if (isCorrect) _correctCount += 1;
    });

    Timer(const Duration(milliseconds: 900), () {
      if (!mounted) return;
      if (_currentIndex >= _questions.length - 1) {
        _completeGame();
      } else {
        setState(() {
          _currentIndex += 1;
          _selectedIndex = null;
          _revealed = false;
        });
      }
    });
  }

  void _completeGame() {
    final result = {
      'score': _correctCount,
      'totalQuestions': _questions.length,
      'correctAnswers': _correctCount,
      'interactionData': {
        'answers': _answers,
      },
    };

    widget.onFinished?.call(result);
    setState(() {
      _finished = true;
    });
  }

  void _resetGame() {
    setState(() {
      _currentIndex = 0;
      _correctCount = 0;
      _selectedIndex = null;
      _revealed = false;
      _finished = false;
      _feedbackCorrect = false;
      _answers.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final questions = _questions;
    final theme = Theme.of(context);

    if (questions.isEmpty) {
      return _EmptyGameState(
        message: '暂无题目数据',
        onBack: widget.onExit,
      );
    }

    if (_finished) {
      return GameCompletionScreen(
        title: widget.data['title']?.toString() ?? '选择题游戏',
        score: _correctCount,
        total: questions.length,
        onPlayAgain: _resetGame,
        onBack: widget.onExit,
      );
    }

    final current = questions[_currentIndex];
    final options = (current['options'] as List).cast<String>();
    final correctIndex = current['correctIndex'] as int? ?? 0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          widget.data['title']?.toString() ?? '选择题游戏',
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  minHeight: 12,
                  value: (_currentIndex + 1) / questions.length,
                  backgroundColor: AppTheme.softBlue.withOpacity(0.2),
                  color: AppTheme.primaryColor,
                ),
              ),
            ),
            const SizedBox(width: 10),
            Text(
              '${_currentIndex + 1}/${questions.length}',
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        AnimatedContainer(
          duration: const Duration(milliseconds: 280),
          curve: Curves.easeOut,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            boxShadow: AppTheme.softShadow(AppTheme.secondaryColor),
          ),
          child: Text(
            current['question']?.toString() ?? '',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w700,
              height: 1.4,
            ),
          ),
        ),
        const SizedBox(height: 14),
        ...List.generate(options.length, (index) {
          final isSelected = _selectedIndex == index;
          final isCorrect = index == correctIndex;

          final bg = _revealed
              ? (isCorrect
                  ? AppTheme.accentColor.withOpacity(0.18)
                  : (isSelected
                      ? AppTheme.warningColor.withOpacity(0.2)
                      : Colors.white))
              : (isSelected
                  ? AppTheme.softPink.withOpacity(0.3)
                  : Colors.white);

          final border = _revealed
              ? (isCorrect
                  ? AppTheme.accentColor
                  : (isSelected ? AppTheme.warningColor : Colors.grey.shade200))
              : (isSelected ? AppTheme.primaryColor : Colors.grey.shade200);

          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: AnimatedScale(
              scale: isSelected ? 1.01 : 1,
              duration: const Duration(milliseconds: 160),
              child: Material(
                color: bg,
                borderRadius: BorderRadius.circular(16),
                child: InkWell(
                  borderRadius: BorderRadius.circular(16),
                  onTap: _revealed ? null : () => _selectOption(index),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 14,
                    ),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: border, width: 2),
                    ),
                    child: Row(
                      children: [
                        CircleAvatar(
                          radius: 14,
                          backgroundColor: border.withOpacity(0.15),
                          child: Text(
                            String.fromCharCode(65 + index),
                            style: TextStyle(
                              color: border,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            options[index],
                            style: theme.textTheme.bodyLarge?.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        if (_revealed && isCorrect)
                          const Icon(Icons.check_circle_rounded,
                              color: AppTheme.accentColor),
                        if (_revealed && isSelected && !isCorrect)
                          const Icon(Icons.cancel_rounded,
                              color: AppTheme.warningColor),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          );
        }),
        if (_revealed)
          AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: _feedbackCorrect
                  ? AppTheme.accentColor.withOpacity(0.18)
                  : AppTheme.warningColor.withOpacity(0.18),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  _feedbackCorrect
                      ? Icons.sentiment_very_satisfied_rounded
                      : Icons.auto_awesome_mosaic_rounded,
                  color: _feedbackCorrect
                      ? AppTheme.accentColor
                      : AppTheme.warningColor,
                ),
                const SizedBox(width: 8),
                Text(
                  _feedbackCorrect ? '答对啦，继续加油！' : '再想一想，下题继续！',
                  style: theme.textTheme.bodyLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _EmptyGameState extends StatelessWidget {
  final String message;
  final VoidCallback onBack;

  const _EmptyGameState({required this.message, required this.onBack});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.sentiment_neutral_rounded,
              size: 48, color: AppTheme.textSecondary),
          const SizedBox(height: 12),
          Text(message),
          const SizedBox(height: 12),
          FilledButton(onPressed: onBack, child: const Text('返回')),
        ],
      ),
    );
  }
}
