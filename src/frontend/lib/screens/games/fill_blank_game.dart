import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import 'game_completion_screen.dart';
import 'game_tts_helper.dart';

typedef GameFinishedCallback = void Function(Map<String, dynamic> result);

/// 填空题游戏：支持点击或拖拽选项到空白处，并即时反馈对错。
class FillBlankGame extends StatefulWidget {
  final Map<String, dynamic> data;
  final VoidCallback onExit;
  final GameFinishedCallback? onFinished;

  const FillBlankGame({
    super.key,
    required this.data,
    required this.onExit,
    this.onFinished,
  });

  @override
  State<FillBlankGame> createState() => _FillBlankGameState();
}

class _FillBlankGameState extends State<FillBlankGame> with GameTtsHelper {
  List<_FillBlankSentence> _sentences = const [];
  int _currentIndex = 0;
  int _correctCount = 0;
  bool _revealed = false;
  bool _finished = false;
  String? _selectedAnswer;
  final List<String?> _userAnswers = <String?>[];
  final Random _random = Random();
  bool _ttsPlayedForCurrent = false;

  @override
  void initState() {
    super.initState();
    _sentences = _parseSentences(widget.data);
  }

  @override
  void dispose() {
    disposeTts();
    super.dispose();
  }

  /// 将句子中的 "___" 替换为朗读文本 "空白"
  String _sentenceTextForSpeech(String sentenceText) {
    return sentenceText.replaceAll('___', '空白');
  }

  void _prepareGame() {
    setState(() {
      _sentences = _parseSentences(widget.data);
      _currentIndex = 0;
      _correctCount = 0;
      _revealed = false;
      _finished = false;
      _selectedAnswer = null;
      _userAnswers.clear();
      _ttsPlayedForCurrent = false;
    });
  }

  List<_FillBlankSentence> _parseSentences(Map<String, dynamic> data) {
    final raw = data['sentences'];
    if (raw is! List) return const [];

    return raw
        .whereType<Map>()
        .map((item) => item.map((k, v) => MapEntry(k.toString(), v)))
        .where((item) => item['text'] != null && item['answer'] != null)
        .map((item) {
      final optionsRaw = item['options'];
      final options = optionsRaw is List
          ? optionsRaw
              .map((e) => e.toString().trim())
              .where((e) => e.isNotEmpty)
              .toList()
          : <String>[];

      final answer = item['answer'].toString().trim();
      if (answer.isNotEmpty && !options.contains(answer)) {
        options.add(answer);
      }
      options.shuffle(_random);

      return _FillBlankSentence(
        text: item['text'].toString(),
        answer: answer,
        hint: item['hint']?.toString(),
        options: options,
      );
    }).toList();
  }

  /// 为当前题目播放语音（延迟后，等 UI 渲染完成）
  void _speakCurrentQuestion() {
    final current = _sentences[_currentIndex];
    if (!_ttsPlayedForCurrent && ttsEnabled) {
      final text = _sentenceTextForSpeech(current.text);
      speakAfterDelay(text);
      _ttsPlayedForCurrent = true;
    }
  }

  void _applyAnswer(String value) {
    if (_revealed) return;

    final current = _sentences[_currentIndex];
    final isCorrect = value == current.answer;

    setState(() {
      _selectedAnswer = value;
      _revealed = true;
      _userAnswers.add(value);
      if (isCorrect) _correctCount += 1;
    });

    // 播报答题反馈
    if (isCorrect) {
      speak('答对了！');
    } else {
      speak('正确答案是${current.answer}');
    }

    Timer(const Duration(milliseconds: 900), () {
      if (!mounted) return;
      if (_currentIndex >= _sentences.length - 1) {
        _finish();
      } else {
        setState(() {
          _currentIndex += 1;
          _selectedAnswer = null;
          _revealed = false;
          _ttsPlayedForCurrent = false;
        });
        // 下一题自动朗读
        WidgetsBinding.instance.addPostFrameCallback((_) {
          _speakCurrentQuestion();
        });
      }
    });
  }

  void _finish() {
    final reviewData = _sentences.asMap().entries.map((entry) {
      final i = entry.key;
      final sentence = entry.value;
      final userAnswer = i < _userAnswers.length ? _userAnswers[i] : null;
      return {
        'question': sentence.text.replaceAll('___', '______'),
        'userAnswer': userAnswer ?? '未作答',
        'correctAnswer': sentence.answer,
        'isCorrect': userAnswer == sentence.answer,
        'explanation': sentence.hint,
      };
    }).toList();

    final result = {
      'score': _correctCount,
      'totalQuestions': _sentences.length,
      'correctAnswers': _correctCount,
      'interactionData': {
        'sentences': _sentences
            .map((s) => {
                  'text': s.text,
                  'answer': s.answer,
                  'hint': s.hint,
                  'options': s.options,
                })
            .toList(),
        'userAnswers': _userAnswers,
        'reviewData': reviewData,
      },
    };

    widget.onFinished?.call(result);
    setState(() => _finished = true);
  }

  void _reset() {
    _prepareGame();
  }

  @override
  void didUpdateWidget(covariant FillBlankGame oldWidget) {
    super.didUpdateWidget(oldWidget);
    // 如果数据源变了，重新初始化
    if (oldWidget.data != widget.data) {
      setState(() {
        _sentences = _parseSentences(widget.data);
        _currentIndex = 0;
        _correctCount = 0;
        _revealed = false;
        _finished = false;
        _selectedAnswer = null;
        _userAnswers.clear();
        _ttsPlayedForCurrent = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (_sentences.isEmpty) {
      return _FillBlankEmptyState(
        message: '暂无填空题数据',
        onBack: widget.onExit,
      );
    }

    if (_finished) {
      return GameCompletionScreen(
        title: widget.data['title']?.toString() ?? '填空题游戏',
        score: _correctCount,
        total: _sentences.length,
        onPlayAgain: _reset,
        onBack: widget.onExit,
      );
    }

    final current = _sentences[_currentIndex];
    final isCurrentCorrect = _selectedAnswer == current.answer;

    // 首次渲染时自动朗读题目
    if (!_ttsPlayedForCurrent && mounted) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _speakCurrentQuestion();
      });
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                widget.data['title']?.toString() ?? '填空题游戏',
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            buildTtsToggleButton(),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: LinearProgressIndicator(
                minHeight: 12,
                value: (_currentIndex + 1) / _sentences.length,
                borderRadius: BorderRadius.circular(999),
                color: AppTheme.primaryColor,
                backgroundColor: AppTheme.softPink.withValues(alpha: 0.2),
              ),
            ),
            const SizedBox(width: 10),
            Text(
              '${_currentIndex + 1}/${_sentences.length}',
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            boxShadow: AppTheme.softShadow(AppTheme.softBlue),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _SentenceWithBlank(
                text: current.text,
                selected: _selectedAnswer,
                revealed: _revealed,
                isCorrect: isCurrentCorrect,
                onDrop: _applyAnswer,
                onReplay: _revealed ? null : () => speak(_sentenceTextForSpeech(current.text)),
              ),
              if ((current.hint ?? '').trim().isNotEmpty && !_revealed) ...[
                const SizedBox(height: 10),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: AppTheme.softYellow.withValues(alpha: 0.35),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    '提示：${current.hint}',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 14),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: current.options.map((option) {
            final isSelected = option == _selectedAnswer;
            final isAnswer = option == current.answer;
            final borderColor = _revealed
                ? (isAnswer
                    ? AppTheme.accentColor
                    : (isSelected
                        ? AppTheme.warningColor
                        : Colors.grey.shade300))
                : (isSelected ? AppTheme.primaryColor : Colors.grey.shade300);

            final bgColor = _revealed
                ? (isAnswer
                    ? AppTheme.accentColor.withValues(alpha: 0.18)
                    : (isSelected
                        ? AppTheme.warningColor.withValues(alpha: 0.18)
                        : Colors.white))
                : (isSelected
                    ? AppTheme.softPink.withValues(alpha: 0.3)
                    : Colors.white);

            return Draggable<String>(
              data: option,
              feedback: _OptionChip(
                label: option,
                borderColor: AppTheme.primaryColor,
                backgroundColor: Colors.white,
              ),
              childWhenDragging: Opacity(
                opacity: 0.35,
                child: _OptionChip(
                  label: option,
                  borderColor: borderColor,
                  backgroundColor: bgColor,
                ),
              ),
              child: GestureDetector(
                onTap: _revealed ? null : () => _applyAnswer(option),
                child: _OptionChip(
                  label: option,
                  borderColor: borderColor,
                  backgroundColor: bgColor,
                ),
              ),
            );
          }).toList(),
        ),
        const SizedBox(height: 12),
        if (_revealed)
          AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOut,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: isCurrentCorrect
                  ? AppTheme.accentColor.withValues(alpha: 0.18)
                  : AppTheme.warningColor.withValues(alpha: 0.18),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              isCurrentCorrect
                  ? '答对啦，太棒了！'
                  : '正确答案是：${current.answer}',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyLarge?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
      ],
    );
  }
}

class _SentenceWithBlank extends StatelessWidget {
  final String text;
  final String? selected;
  final bool revealed;
  final bool isCorrect;
  final ValueChanged<String> onDrop;
  final VoidCallback? onReplay;

  const _SentenceWithBlank({
    required this.text,
    required this.selected,
    required this.revealed,
    required this.isCorrect,
    required this.onDrop,
    this.onReplay,
  });

  @override
  Widget build(BuildContext context) {
    // 如果有重读按钮，用 Stack 包裹；否则用原始布局
    if (onReplay != null) {
      return Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.topRight,
        children: [
          _buildSentenceContent(context),
          Positioned(
            top: -4,
            right: -4,
            child: IconButton(
              icon: const Icon(Icons.campaign_rounded, size: 22, color: Color(0xFF6C5CE7)),
              onPressed: onReplay,
              tooltip: '重新朗读',
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(),
            ),
          ),
        ],
      );
    }
    return _buildSentenceContent(context);
  }

  Widget _buildSentenceContent(BuildContext context) {
    final parts = text.split('___');
    final hasBlank = parts.length > 1;

    if (!hasBlank) {
      return Text(
        text,
        style: Theme.of(context).textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w700,
              height: 1.45,
            ),
      );
    }

    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      spacing: 2,
      runSpacing: 8,
      children: List<Widget>.generate(parts.length * 2 - 1, (i) {
        if (i.isEven) {
          final textIndex = i ~/ 2;
          return Text(
            parts[textIndex],
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  height: 1.45,
                ),
          );
        }

        final borderColor = revealed
            ? (isCorrect ? AppTheme.accentColor : AppTheme.warningColor)
            : AppTheme.primaryColor;

        final bgColor = revealed
            ? (isCorrect
                ? AppTheme.accentColor.withValues(alpha: 0.18)
                : AppTheme.warningColor.withValues(alpha: 0.18))
            : AppTheme.softPink.withValues(alpha: 0.18);

        return DragTarget<String>(
          onWillAcceptWithDetails: (details) => !revealed,
          onAcceptWithDetails: (details) => onDrop(details.data),
          builder: (context, candidate, rejected) {
            return AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              curve: Curves.easeOut,
              constraints: const BoxConstraints(minWidth: 88, minHeight: 46),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: candidate.isNotEmpty
                    ? AppTheme.softBlue.withValues(alpha: 0.25)
                    : bgColor,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: borderColor, width: 2.2),
              ),
              child: Text(
                selected ?? '___',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: selected == null
                          ? AppTheme.textSecondary
                          : AppTheme.textColor,
                    ),
              ),
            );
          },
        );
      }),
    );
  }
}

class _OptionChip extends StatelessWidget {
  final String label;
  final Color borderColor;
  final Color backgroundColor;

  const _OptionChip({
    required this.label,
    required this.borderColor,
    required this.backgroundColor,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 150),
      curve: Curves.easeOut,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: borderColor, width: 2),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
              fontWeight: FontWeight.w700,
            ),
      ),
    );
  }
}

class _FillBlankSentence {
  final String text;
  final String answer;
  final String? hint;
  final List<String> options;

  const _FillBlankSentence({
    required this.text,
    required this.answer,
    required this.hint,
    required this.options,
  });
}

class _FillBlankEmptyState extends StatelessWidget {
  final String message;
  final VoidCallback onBack;

  const _FillBlankEmptyState({
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
            Icons.edit_note_rounded,
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
