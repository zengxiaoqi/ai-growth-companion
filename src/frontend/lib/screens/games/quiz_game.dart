import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import 'game_completion_screen.dart';
import 'game_tts_helper.dart';

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

class _QuizGameState extends State<QuizGame>
    with GameTtsHelper, TickerProviderStateMixin {
  int _currentIndex = 0;
  int _correctCount = 0;
  int? _selectedIndex;
  bool _revealed = false;
  bool _finished = false;
  bool _feedbackCorrect = false;
  final List<int> _answers = <int>[];

  // 题目入场动画
  late final AnimationController _questionController;
  late final Animation<double> _questionFade;
  late final Animation<Offset> _questionSlide;

  @override
  void initState() {
    super.initState();
    _questionController = AnimationController(
      duration: const Duration(milliseconds: 400),
      vsync: this,
    );
    _questionFade = CurvedAnimation(
      parent: _questionController,
      curve: Curves.easeOut,
    );
    _questionSlide = Tween<Offset>(
      begin: const Offset(0, 0.25),
      end: Offset.zero,
    ).animate(CurvedAnimation(
      parent: _questionController,
      curve: Curves.easeOutCubic,
    ));
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _autoSpeakCurrentQuestion();
      _questionController.forward();
    });
  }

  @override
  void dispose() {
    disposeTts();
    _questionController.dispose();
    super.dispose();
  }

  void _autoSpeakCurrentQuestion() {
    if (!mounted || !ttsEnabled) return;
    final questions = _questions;
    if (_currentIndex < questions.length) {
      final q = questions[_currentIndex];
      final questionText = q['question']?.toString() ?? '';
      final options = (q['options'] as List?)?.cast<String>() ?? [];
      final parts = <String>['第${_currentIndex + 1}题。$questionText'];
      for (var i = 0; i < options.length; i++) {
        parts.add('选项${String.fromCharCode(65 + i)}。${options[i]}');
      }
      speakAfterDelay(parts.join('。'), delay: const Duration(milliseconds: 400));
    }
  }

  void _speakAnswerFeedback(List<String> options, int correctIndex, bool isCorrect) {
    if (!ttsEnabled) return;
    if (isCorrect) {
      final explanation = _questions[_currentIndex]['explanation']?.toString();
      String text = '答对了！';
      if (explanation != null && explanation.isNotEmpty) {
        text += explanation;
      }
      speak(text);
    } else {
      final correctText = options[correctIndex];
      speak('答错了，正确答案是$correctText');
    }
  }

  String _buildSpeakText(Map<String, dynamic> current, List<String> options) {
    final questionText = current['question']?.toString() ?? '';
    final parts = <String>['第${_currentIndex + 1}题。$questionText'];
    for (var i = 0; i < options.length; i++) {
      parts.add('选项${String.fromCharCode(65 + i)}。${options[i]}');
    }
    return parts.join('。');
  }

  List<Map<String, dynamic>> get _questions {
    final raw = widget.data['questions'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((q) => q.map((k, v) => MapEntry(k.toString(), v)))
        .where((q) {
      // Support both 'question' (QuizGame) and 'q' (lesson_pack) field names
      final questionText = q['question']?.toString() ?? q['q']?.toString() ?? '';
      return questionText.isNotEmpty && q['options'] is List;
    })
        .map((q) {
      final options = (q['options'] as List)
          .map((e) => e.toString().trim())
          .where((e) => e.isNotEmpty)
          .toList();
      // Support both 'correctIndex'/'correctAnswer' (QuizGame) and 'answer' (lesson_pack) field names
      var correctIndex = _toInt(q['correctIndex'] ?? q['correctAnswer'] ?? q['answer']);
      // If answer is a string (e.g. "开心"), find its index in options
      if (correctIndex < 0 || correctIndex >= options.length) {
        final answerStr = q['answer']?.toString() ?? '';
        if (answerStr.isNotEmpty) {
          final idx = options.indexOf(answerStr);
          if (idx >= 0) correctIndex = idx;
        }
      }
      // Normalize answer field name to 'correctIndex' for downstream use
      if (correctIndex < 0 || correctIndex >= options.length) {
        final oneBased = correctIndex - 1;
        correctIndex =
            (oneBased >= 0 && oneBased < options.length) ? oneBased : 0;
      }
      // Normalize question field name to 'question'
      final questionText = q['question']?.toString() ?? q['q']?.toString() ?? '';
      return {
        'question': questionText,
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
    final options = (current['options'] as List).cast<String>();
    final correctIndex = current['correctIndex'] as int? ?? 0;

    setState(() {
      _selectedIndex = index;
      _revealed = true;
      _feedbackCorrect = isCorrect;
      _answers.add(index);
      if (isCorrect) _correctCount += 1;
    });

    _speakAnswerFeedback(options, correctIndex, isCorrect);

    onComplete.then((_) {
      if (!mounted) return;
      _nextQuestion();
    }).timeout(const Duration(seconds: 8), onTimeout: () {
      if (!mounted) return;
      _nextQuestion();
    });
  }

  void _nextQuestion() {
    if (_currentIndex >= _questions.length - 1) {
      _completeGame();
    } else {
      setState(() {
        _currentIndex += 1;
        _selectedIndex = null;
        _revealed = false;
      });
      _questionController.forward(from: 0);
      _autoSpeakCurrentQuestion();
    }
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
    _questionController.forward(from: 0);
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
    final questionText = current['question']?.toString() ?? '';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // 顶部：标题 + TTS
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
              child: Text(
                widget.data['title']?.toString() ?? '选择题游戏',
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            buildTtsToggleButton(),
          ],
        ),
        const SizedBox(height: 12),
        // 进度条
        Row(
          children: [
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  minHeight: 14,
                  value: (_currentIndex + 1) / questions.length,
                  backgroundColor:
                      AppTheme.softBlue.withValues(alpha: 0.2),
                  color: AppTheme.primaryColor,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: AppTheme.primaryColor.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                '${_currentIndex + 1}/${questions.length}',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.primaryColor,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        // 题目卡片 - 带入场动画
        SlideTransition(
          position: _questionSlide,
          child: FadeTransition(
            opacity: _questionFade,
            child: Stack(
              children: [
                AnimatedContainer(
                  duration: const Duration(milliseconds: 280),
                  curve: Curves.easeOut,
                  padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Colors.white, Color(0xFFFBFAFC)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(22),
                    boxShadow: AppTheme.softShadow(AppTheme.secondaryColor),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // 题号标记
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppTheme.secondaryColor.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          'Q${_currentIndex + 1}',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: AppTheme.secondaryColor,
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        questionText,
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                          height: 1.45,
                        ),
                      ),
                    ],
                  ),
                ),
                Positioned(
                  top: 8,
                  right: 12,
                  child: buildReplayButton(_buildSpeakText(current, options)),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        // 选项列表 - 带交错入场
        // 使用 shrinkWrap: true 避免嵌套在 SingleChildScrollView 中
        // Expanded 导致布局崩溃（constraints unbounded）
        ListView.separated(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: options.length,
          separatorBuilder: (_, __) => const SizedBox(height: 10),
          itemBuilder: (context, index) {
            return _QuizOption(
              index: index,
              text: options[index],
              isSelected: _selectedIndex == index,
              isCorrect: index == correctIndex,
              revealed: _revealed,
              onTap: _revealed ? null : () => _selectOption(index),
              animBase: _questionController,
            );
          },
        ),
        if (_revealed)
          AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOut,
            padding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: _feedbackCorrect
                  ? AppTheme.accentColor.withValues(alpha: 0.15)
                  : const Color(0xFFFF9B85).withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: _feedbackCorrect
                    ? AppTheme.accentColor.withValues(alpha: 0.3)
                    : const Color(0xFFFF9B85).withValues(alpha: 0.3),
                width: 1.5,
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  _feedbackCorrect
                      ? Icons.celebration_rounded
                      : Icons.lightbulb_rounded,
                  color: _feedbackCorrect
                      ? AppTheme.accentColor
                      : AppTheme.warningColor,
                  size: 22,
                ),
                const SizedBox(width: 8),
                Text(
                  _feedbackCorrect ? '答对啦，继续加油！' : '再想一想，下题继续！',
                  style: theme.textTheme.bodyLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: _feedbackCorrect
                        ? AppTheme.accentColor
                        : AppTheme.warningColor,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

// ==================== 自定义组件 ====================

class _QuizOption extends StatefulWidget {
  final int index;
  final String text;
  final bool isSelected;
  final bool isCorrect;
  final bool revealed;
  final VoidCallback? onTap;
  final Animation<double> animBase;

  const _QuizOption({
    required this.index,
    required this.text,
    required this.isSelected,
    required this.isCorrect,
    required this.revealed,
    required this.onTap,
    required this.animBase,
  });

  @override
  State<_QuizOption> createState() => _QuizOptionState();
}

class _QuizOptionState extends State<_QuizOption>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pressController;

  @override
  void initState() {
    super.initState();
    _pressController = AnimationController(
      duration: const Duration(milliseconds: 120),
      vsync: this,
    );
  }

  @override
  void dispose() {
    _pressController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final letter = String.fromCharCode(65 + widget.index);

    final Color borderColor;
    final Color bgColor;
    if (widget.revealed) {
      if (widget.isCorrect) {
        borderColor = AppTheme.accentColor;
        bgColor = AppTheme.accentColor.withValues(alpha: 0.12);
      } else if (widget.isSelected) {
        borderColor = AppTheme.warningColor;
        bgColor = AppTheme.warningColor.withValues(alpha: 0.12);
      } else {
        borderColor = Colors.grey.shade200;
        bgColor = Colors.white;
      }
    } else {
      borderColor =
          widget.isSelected ? AppTheme.primaryColor : Colors.grey.shade200;
      bgColor = widget.isSelected
          ? AppTheme.softPink.withValues(alpha: 0.25)
          : Colors.white;
    }

    // 入场动画
    final introAnim = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(
        parent: widget.animBase,
        curve: Interval(
          (0.15 + widget.index * 0.06).clamp(0.0, 1.0),
          (0.15 + widget.index * 0.06 + 0.35).clamp(0.0, 1.0),
          curve: Curves.easeOutCubic,
        ),
      ),
    );

    return AnimatedBuilder(
      animation: Listenable.merge([introAnim, _pressController]),
      builder: (context, child) {
        return Opacity(
          opacity: introAnim.value,
          child: Transform.translate(
            offset: Offset(0, 20 * (1 - introAnim.value)),
            child: Transform.scale(
              scale: 1.0 - 0.03 * _pressController.value,
              child: child,
            ),
          ),
        );
      },
      child: GestureDetector(
        onTapDown: widget.onTap == null
            ? null
            : (_) => _pressController.forward(),
        onTapUp: widget.onTap == null
            ? null
            : (_) {
                _pressController.reverse();
                widget.onTap!();
              },
        onTapCancel: () => _pressController.reverse(),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
          decoration: BoxDecoration(
            gradient: bgColor == Colors.white
                ? const LinearGradient(
                    colors: [Colors.white, Color(0xFFFBFAFC)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  )
                : null,
            color: bgColor == Colors.white ? null : bgColor,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: borderColor, width: 2),
            boxShadow: widget.isSelected && !widget.revealed
                ? [
                    BoxShadow(
                      color: borderColor.withValues(alpha: 0.25),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    ),
                  ]
                : null,
          ),
          child: Row(
            children: [
              // 字母圆点
              _LetterBadge(
                letter: letter,
                color: borderColor,
                selected: widget.isSelected,
                revealed: widget.revealed,
                isCorrect: widget.isCorrect,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  widget.text,
                  style: theme.textTheme.bodyLarge?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: widget.revealed && widget.isCorrect
                        ? AppTheme.accentColor
                        : (widget.revealed && widget.isSelected
                            ? AppTheme.warningColor
                            : AppTheme.textColor),
                  ),
                ),
              ),
              // 状态图标
              if (widget.revealed && widget.isCorrect)
                const Icon(Icons.check_circle_rounded,
                    color: AppTheme.accentColor, size: 24),
              if (widget.revealed && widget.isSelected && !widget.isCorrect)
                const Icon(Icons.cancel_rounded,
                    color: AppTheme.warningColor, size: 24),
            ],
          ),
        ),
      ),
    );
  }
}

class _LetterBadge extends StatelessWidget {
  final String letter;
  final Color color;
  final bool selected;
  final bool revealed;
  final bool isCorrect;

  const _LetterBadge({
    required this.letter,
    required this.color,
    required this.selected,
    required this.revealed,
    required this.isCorrect,
  });

  @override
  Widget build(BuildContext context) {
    final Color badgeColor;
    final Color textColor;
    if (revealed && isCorrect) {
      badgeColor = AppTheme.accentColor;
      textColor = Colors.white;
    } else if (revealed && selected) {
      badgeColor = AppTheme.warningColor;
      textColor = Colors.white;
    } else if (selected) {
      badgeColor = color;
      textColor = Colors.white;
    } else {
      badgeColor = color.withValues(alpha: 0.12);
      textColor = color;
    }

    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      width: 30,
      height: 30,
      decoration: BoxDecoration(
        color: badgeColor,
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      child: Text(
        letter,
        style: TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.bold,
          color: textColor,
        ),
      ),
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