import 'dart:async';
import 'dart:convert';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../services/api_result.dart';
import '../../services/api_service.dart';
import '../../services/speech_recognition_service.dart';
import '../../services/tts_service.dart';
import '../../theme/app_theme.dart';
import '../../theme/child_theme.dart';
import 'widgets/illustration_grid.dart';

class _ReadCard {
  final String sentence;
  final String emoji;
  final String discover;
  const _ReadCard(this.sentence, this.emoji, this.discover);
}

class _ReadQuestion {
  final String question;
  final List<String> options;
  final int correctIndex;
  final String explain;
  const _ReadQuestion(this.question, this.options, this.correctIndex, this.explain);
  bool get isChoice => options.length >= 2;
}

/// 赏/读步骤互动内容：句卡插图 + 关键词点读 + 发现提示 + 选择题 + 跟读评估。
/// 旧课程包只有 text/字符串 questions 时，客户端拆句派生句卡，无需重新生成。
class ReadStepContent extends StatefulWidget {
  final Map<String, dynamic> reading;
  final String ageGroup;
  final String domain;
  final bool isCompleted;
  final void Function(int score, Map<String, dynamic> interactionData) onComplete;

  const ReadStepContent({
    super.key,
    required this.reading,
    required this.ageGroup,
    required this.domain,
    required this.isCompleted,
    required this.onComplete,
  });

  @override
  State<ReadStepContent> createState() => _ReadStepContentState();
}

class _ReadStepContentState extends State<ReadStepContent> {
  final TtsService _tts = TtsService();

  late String _goal;
  late List<String> _keywords;
  late List<_ReadCard> _cards;
  late List<_ReadQuestion> _questions;

  final Map<int, int> _cardStars = {};
  final Set<int> _quizCorrect = {};
  final Map<int, Set<int>> _quizWrong = {};
  bool _readPracticed = false;
  int _readAttempts = 0;

  @override
  void initState() {
    super.initState();
    final r = widget.reading;
    _goal = r['goal']?.toString() ?? '';
    _keywords = (r['keywords'] is List ? r['keywords'] as List : const [])
        .map((e) => e?.toString() ?? '')
        .where((e) => e.isNotEmpty)
        .toList();
    final text = r['text']?.toString() ?? '';
    _cards = _parseCards(r['cards'], text);
    _questions = _parseQuestions(r['questions']);
  }

  List<_ReadCard> _parseCards(dynamic raw, String text) {
    final fromPack = (raw is List ? raw : const [])
        .map((c) => c is Map
            ? _ReadCard(
                c['sentence']?.toString() ?? '',
                c['emoji']?.toString() ?? '',
                c['discover']?.toString() ?? '',
              )
            : null)
        .whereType<_ReadCard>()
        .where((c) => c.sentence.isNotEmpty)
        .toList();
    final base = fromPack.length >= 2
        ? fromPack
        : _splitSentences(text)
            .map((s) => _ReadCard(s, '', ''))
            .toList();
    return base.take(6).map((c) {
      return _ReadCard(
        c.sentence,
        c.emoji.isNotEmpty ? c.emoji : _pickEmoji(c.sentence),
        c.discover.isNotEmpty ? c.discover : _defaultDiscover(),
      );
    }).toList();
  }

  List<String> _splitSentences(String text) {
    return RegExp(r'[^。！？!?\n]+[。！？!?]?')
        .allMatches(text)
        .map((m) => m.group(0)!.trim())
        .where((s) => s.isNotEmpty)
        .toList();
  }

  String _pickEmoji(String sentence) {
    const map = <String, String>{
      '猫': '🐱', '狗': '🐶', '鸟': '🐦', '燕': '🐦', '鱼': '🐟',
      '兔': '🐰', '鸭': '🦆', '太阳': '☀️', '白天': '☀️', '月亮': '🌙',
      '晚上': '🌙', '星': '⭐', '花': '🌸', '树': '🌳', '森林': '🌳',
      '雨': '🌧️', '彩虹': '🌈', '圆': '⭕', '方': '🟦', '尖': '🔺',
      '尾巴': '🐾', '耳朵': '👂', '眼睛': '👀', '条纹': '🐯',
      '妈妈': '❤️', '爱': '❤️', '春天': '🌱', '雪': '⛄',
    };
    for (final e in map.entries) {
      if (sentence.contains(e.key)) return e.value;
    }
    const byDomain = {
      'art': '🎨', 'language': '📖', 'math': '🔢', 'science': '🔭', 'social': '💬',
    };
    return byDomain[widget.domain] ?? '📖';
  }

  String _defaultDiscover() {
    switch (widget.domain) {
      case 'art':
        return '你发现了什么形状和颜色？说说你的感觉。';
      case 'science':
        return '你发现了什么？说一说。';
      case 'math':
        return '一起数一数、比一比。';
      case 'social':
        return '你会怎么说呢？';
      default:
        return '你能把这句话说给大家听吗？';
    }
  }

  List<_ReadQuestion> _parseQuestions(dynamic raw) {
    return (raw is List ? raw : const [])
        .map((q) {
          if (q is String) return _ReadQuestion(q, const [], 0, '');
          if (q is Map) {
            final options = (q['options'] is List ? q['options'] as List : const [])
                .map((o) => o?.toString() ?? '')
                .where((o) => o.isNotEmpty)
                .take(4)
                .toList();
            final idx = int.tryParse(q['correctIndex']?.toString() ?? '0') ?? 0;
            return _ReadQuestion(
              q['question']?.toString() ?? '',
              options,
              options.length > 1 ? idx.clamp(0, options.length - 1) : 0,
              q['explain']?.toString() ?? '',
            );
          }
          return null;
        })
        .whereType<_ReadQuestion>()
        .where((q) => q.question.isNotEmpty)
        .take(3)
        .toList();
  }

  int get _choiceCount => _questions.where((q) => q.isChoice).length;

  int _computeScore() {
    var score = 75;
    if (_choiceCount > 0) {
      score += (15 * _quizCorrect.length / _choiceCount).round();
    }
    if (_cardStars.isNotEmpty) {
      final avg = _cardStars.values.reduce((a, b) => a + b) / _cardStars.length;
      score += (10 * avg / 3).round();
    } else if (_readPracticed) {
      score += 5;
    }
    return score.clamp(0, 100);
  }

  Future<void> _speak(String text) => _tts.speak(text);

  void _openReadAloud(int cardIndex, _ReadCard card) {
    final api = context.read<ApiService>();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ReadAloudSheet(
        api: api,
        sentence: card.sentence,
        ageGroup: widget.ageGroup,
        onStars: (stars) {
          setState(() {
            _readAttempts++;
            if (stars == null) {
              _readPracticed = true;
            } else {
              _cardStars[cardIndex] =
                  (_cardStars[cardIndex] ?? 0) > stars ? _cardStars[cardIndex]! : stars;
            }
          });
        },
      ),
    );
  }

  void _answerQuestion(int qi, _ReadQuestion q, int oi) {
    if (_quizCorrect.contains(qi)) return;
    if (oi == q.correctIndex) {
      setState(() => _quizCorrect.add(qi));
      _speak(q.explain.isNotEmpty ? '答对啦！$q.explain' : '答对啦，真棒！');
    } else {
      setState(() => (_quizWrong[qi] ??= {}).add(oi));
      _speak('再想一想？');
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppTheme.active;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (_goal.isNotEmpty)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppTheme.secondaryColor.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Icon(Icons.flag_rounded, size: 18, color: AppTheme.secondaryColor),
                const SizedBox(width: 8),
                Expanded(
                  child: Text('目标: $_goal',
                      style: TextStyle(fontSize: 14, color: AppTheme.textColor)),
                ),
              ],
            ),
          ),
        if (_goal.isNotEmpty) const SizedBox(height: 12),

        // 句卡：插图 + 点读 + 我来读
        for (var i = 0; i < _cards.length; i++) ...[
          _buildCard(i, _cards[i], palette),
          const SizedBox(height: 12),
        ],

        // 理解问题：选择题互动 / 开放说一说
        if (_questions.isNotEmpty) ...[
          Text('理解问题',
              style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: palette.ink)),
          const SizedBox(height: 8),
          for (var qi = 0; qi < _questions.length; qi++) ...[
            _buildQuestion(qi, _questions[qi], palette),
            const SizedBox(height: 10),
          ],
        ],

        const SizedBox(height: 8),
        _buildCompleteButton(palette),
      ],
    );
  }

  Widget _buildCard(int index, _ReadCard card, ChildThemePalette palette) {
    final stars = _cardStars[index];
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(AppTheme.cardRadius),
        boxShadow: AppTheme.softShadow(),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: palette.soft,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: TwemojiImage(emoji: card.emoji, size: 52),
              ),
              const SizedBox(width: 12),
              Expanded(child: _sentenceText(card, palette)),
            ],
          ),
          const SizedBox(height: 10),
          // 发现提示：点一下朗读，引导孩子观察/表达
          InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () => _speak(card.discover),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: AppTheme.secondaryColor.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  const Text('💡', style: TextStyle(fontSize: 14)),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(card.discover,
                        style: TextStyle(fontSize: 13, color: palette.ink2)),
                  ),
                  Icon(Icons.volume_up_rounded,
                      size: 16, color: AppTheme.secondaryColor),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _speak(card.sentence),
                  icon: const Icon(Icons.volume_up_rounded, size: 18),
                  label: const Text('听一听'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: FilledButton.tonalIcon(
                  onPressed: () => _openReadAloud(index, card),
                  icon: const Icon(Icons.mic_rounded, size: 18),
                  label: Text(stars == null ? '我来读' : '我来读 ${'⭐' * stars}'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// 关键词可点读：点哪个词读哪个词
  Widget _sentenceText(_ReadCard card, ChildThemePalette palette) {
    final present = _keywords
        .where((k) => k.length >= 2 && card.sentence.contains(k))
        .toList();
    final style = TextStyle(fontSize: 16, height: 1.7, color: palette.ink);
    if (present.isEmpty) return Text(card.sentence, style: style);

    final pattern = RegExp(present.map(RegExp.escape).join('|'));
    final spans = <InlineSpan>[];
    var last = 0;
    for (final m in pattern.allMatches(card.sentence)) {
      if (m.start > last) {
        spans.add(TextSpan(text: card.sentence.substring(last, m.start), style: style));
      }
      final kw = m.group(0)!;
      spans.add(WidgetSpan(
        alignment: PlaceholderAlignment.baseline,
        baseline: TextBaseline.alphabetic,
        child: GestureDetector(
          onTap: () => _speak(kw),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 2),
            decoration: BoxDecoration(
              color: AppTheme.secondaryColor.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(kw,
                style: style.copyWith(
                  fontWeight: FontWeight.w700,
                  color: AppTheme.secondaryColor,
                )),
          ),
        ),
      ));
      last = m.end;
    }
    if (last < card.sentence.length) {
      spans.add(TextSpan(text: card.sentence.substring(last), style: style));
    }
    return Text.rich(TextSpan(children: spans));
  }

  Widget _buildQuestion(int qi, _ReadQuestion q, ChildThemePalette palette) {
    final answered = _quizCorrect.contains(qi);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(AppTheme.cardRadius),
        boxShadow: AppTheme.softShadow(),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('${qi + 1}. ${q.question}',
                    style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: palette.ink)),
              ),
              IconButton(
                visualDensity: VisualDensity.compact,
                icon: Icon(Icons.volume_up_rounded,
                    size: 18, color: AppTheme.secondaryColor),
                onPressed: () => _speak(q.question),
              ),
            ],
          ),
          if (q.isChoice) ...[
            const SizedBox(height: 6),
            for (var oi = 0; oi < q.options.length; oi++)
              _buildOption(qi, q, oi, answered, palette),
            if (answered && q.explain.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text('💡 ${q.explain}',
                    style: TextStyle(fontSize: 13, color: palette.ink2)),
              ),
          ] else ...[
            const SizedBox(height: 6),
            Align(
              alignment: Alignment.centerLeft,
              child: ActionChip(
                avatar: const Text('🗣', style: TextStyle(fontSize: 14)),
                label: const Text('说一说你的答案'),
                onPressed: () => _speak('把你的答案说给大家听吧！'),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildOption(
      int qi, _ReadQuestion q, int oi, bool answered, ChildThemePalette palette) {
    const correctColor = Color(0xFF2F9E44);
    const wrongColor = Color(0xFFE8590C);
    final isCorrect = answered && oi == q.correctIndex;
    final isWrong = (_quizWrong[qi] ?? const {}).contains(oi) && !answered;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: answered ? null : () => _answerQuestion(qi, q, oi),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: isCorrect
                ? correctColor.withValues(alpha: 0.12)
                : isWrong
                    ? wrongColor.withValues(alpha: 0.08)
                    : palette.soft,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isCorrect
                  ? correctColor
                  : isWrong
                      ? wrongColor
                      : palette.line.withValues(alpha: 0.6),
              width: isCorrect || isWrong ? 2 : 1,
            ),
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(q.options[oi],
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: isCorrect ? FontWeight.w700 : FontWeight.w500,
                      color: isCorrect
                          ? correctColor
                          : isWrong
                              ? wrongColor
                              : palette.ink,
                    )),
              ),
              if (isCorrect)
                const Icon(Icons.check_circle_rounded,
                    size: 18, color: correctColor),
              if (isWrong)
                const Icon(Icons.refresh_rounded, size: 18, color: wrongColor),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCompleteButton(ChildThemePalette palette) {
    if (widget.isCompleted) {
      return Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.check_circle_rounded, size: 20, color: AppTheme.primaryColor),
          const SizedBox(width: 6),
          Text('已完成',
              style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.primaryColor)),
        ],
      );
    }
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: FilledButton.icon(
        onPressed: () => widget.onComplete(_computeScore(), {
          'readCards': _cards.length,
          'readAloud': {'attempts': _readAttempts, 'stars': _cardStars},
          'quiz': {'correct': _quizCorrect.length, 'total': _choiceCount},
        }),
        icon: const Icon(Icons.check_rounded),
        label: const Text('完成了，进入下一步'),
        style: FilledButton.styleFrom(
          backgroundColor: AppTheme.primaryColor,
          foregroundColor: palette.onPrimary,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        ),
      ),
    );
  }
}

// ─── 跟读评估 ────────────────────────────────────────────────────────────

enum _ReadAloudPhase { idle, listening, evaluating, result, unsupported, error }

/// 我来读：设备端/浏览器识别 → 后端字级对齐评分 → 星级+逐字反馈+TTS 鼓励。
/// 无识别引擎时诚实降级为跟读模式（听示范+大声跟读），不假评分。
class _ReadAloudSheet extends StatefulWidget {
  final ApiService api;
  final String sentence;
  final String ageGroup;
  final void Function(int? stars) onStars;

  const _ReadAloudSheet({
    required this.api,
    required this.sentence,
    required this.ageGroup,
    required this.onStars,
  });

  @override
  State<_ReadAloudSheet> createState() => _ReadAloudSheetState();
}

class _ReadAloudSheetState extends State<_ReadAloudSheet>
    with SingleTickerProviderStateMixin {
  final TtsService _tts = TtsService();
  late final SpeechRecognitionService _speech = createSpeechRecognitionService();
  final AudioPlayer _feedbackPlayer = AudioPlayer();
  late final AnimationController _pulse =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 800))
        ..repeat(reverse: true);

  _ReadAloudPhase _phase = _ReadAloudPhase.idle;
  String _final = '';
  String _interim = '';
  String _hint = '';
  DateTime? _listenStart;
  Map<String, dynamic>? _result;

  @override
  void dispose() {
    _pulse.dispose();
    _speech.dispose();
    _feedbackPlayer.dispose();
    super.dispose();
  }

  Future<void> _startListening() async {
    await _tts.stop();
    setState(() {
      _final = '';
      _interim = '';
      _hint = '';
      _result = null;
    });
    final supported = await _speech.isSupported();
    if (!mounted) return;
    if (!supported) {
      setState(() => _phase = _ReadAloudPhase.unsupported);
      return;
    }
    _listenStart = DateTime.now();
    setState(() => _phase = _ReadAloudPhase.listening);
    await _speech.startListening(
      localeId: 'zh-CN',
      onResult: (finalText, interimText) {
        if (!mounted) return;
        setState(() {
          _final = finalText;
          _interim = interimText;
        });
      },
      onStateChange: (listening) {
        if (!mounted || listening || _phase != _ReadAloudPhase.listening) return;
        if (_final.trim().isNotEmpty) {
          _finish();
        } else {
          setState(() {
            _phase = _ReadAloudPhase.idle;
            _hint = '没听清声音，靠近一点再试一次。';
          });
        }
      },
      onError: (error) {
        if (!mounted || _phase != _ReadAloudPhase.listening) return;
        setState(() {
          _phase = _ReadAloudPhase.idle;
          _hint = '识别出了点小问题，再试一次吧。';
        });
      },
    );
  }

  Future<void> _finish() async {
    await _speech.stopListening();
    if (!mounted) return;
    final recognized = _final.trim();
    final durationMs = _listenStart != null
        ? DateTime.now().difference(_listenStart!).inMilliseconds
        : null;
    setState(() => _phase = _ReadAloudPhase.evaluating);
    final res = await widget.api.evaluateReadAloud(
      targetText: widget.sentence,
      recognizedText: recognized,
      ageGroup: widget.ageGroup,
      durationMs: durationMs,
    );
    if (!mounted) return;
    if (res is ApiSuccess<Map<String, dynamic>>) {
      setState(() {
        _result = res.data;
        _phase = _ReadAloudPhase.result;
      });
      final stars = (_result?['stars'] as num?)?.toInt() ?? 0;
      widget.onStars(stars);
      final audio = _result?['feedbackAudio']?.toString();
      if (audio != null && audio.isNotEmpty) {
        try {
          await _feedbackPlayer.play(BytesSource(base64Decode(audio)));
        } catch (_) {}
      }
    } else {
      setState(() => _phase = _ReadAloudPhase.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppTheme.active;
    return Container(
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 16,
        bottom: MediaQuery.of(context).padding.bottom + 20,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: palette.line,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                const Text('🎤', style: TextStyle(fontSize: 20)),
                const SizedBox(width: 8),
                Text('我来读',
                    style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                        color: palette.ink)),
              ],
            ),
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: palette.soft,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Text(widget.sentence,
                  style: TextStyle(fontSize: 18, height: 1.7, color: palette.ink)),
            ),
            const SizedBox(height: 16),
            _buildPhase(palette),
          ],
        ),
      ),
    );
  }

  Widget _buildPhase(ChildThemePalette palette) {
    switch (_phase) {
      case _ReadAloudPhase.idle:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (_hint.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Text(_hint,
                    style: TextStyle(fontSize: 13, color: palette.ink2)),
              ),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _tts.speak(widget.sentence),
                    icon: const Icon(Icons.volume_up_rounded, size: 18),
                    label: const Text('听示范'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _startListening,
                    icon: const Icon(Icons.mic_rounded, size: 18),
                    label: const Text('开始读'),
                  ),
                ),
              ],
            ),
          ],
        );
      case _ReadAloudPhase.listening:
        return Column(
          children: [
            AnimatedBuilder(
              animation: _pulse,
              builder: (_, __) => Transform.scale(
                scale: 1 + _pulse.value * 0.12,
                child: Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: AppTheme.primaryColor.withValues(alpha: 0.15),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(Icons.mic_rounded,
                      size: 34, color: AppTheme.primaryColor),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Text('正在听你读…',
                style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: palette.ink)),
            const SizedBox(height: 6),
            Text(
              (_final + _interim).trim().isEmpty ? '大声读出上面的句子吧' : (_final + _interim),
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 15, color: palette.ink2),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _finish,
                icon: const Icon(Icons.stop_rounded, size: 18),
                label: const Text('读完了'),
              ),
            ),
          ],
        );
      case _ReadAloudPhase.evaluating:
        return const Padding(
          padding: EdgeInsets.symmetric(vertical: 24),
          child: Center(child: CircularProgressIndicator()),
        );
      case _ReadAloudPhase.result:
        return _buildResult(palette);
      case _ReadAloudPhase.unsupported:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('这台设备暂时不支持语音识别，没法逐字评分。先听示范，再大声跟读一遍吧！',
                style: TextStyle(fontSize: 14, height: 1.6, color: palette.ink2)),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _tts.speak(widget.sentence),
                    icon: const Icon(Icons.volume_up_rounded, size: 18),
                    label: const Text('听示范'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: () {
                      widget.onStars(null);
                      Navigator.pop(context);
                    },
                    icon: const Icon(Icons.check_rounded, size: 18),
                    label: const Text('我读完了'),
                  ),
                ),
              ],
            ),
          ],
        );
      case _ReadAloudPhase.error:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('评分没连上服务器，再试一次吧。',
                style: TextStyle(fontSize: 14, color: palette.ink2)),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _startListening,
                icon: const Icon(Icons.refresh_rounded, size: 18),
                label: const Text('再读一次'),
              ),
            ),
          ],
        );
    }
  }

  Widget _buildResult(ChildThemePalette palette) {
    final r = _result ?? {};
    final stars = (r['stars'] as num?)?.toInt() ?? 0;
    final chars = (r['chars'] is List ? r['chars'] as List : const []);
    const missedColor = Color(0xFFE8590C);
    const readColor = Color(0xFF2F9E44);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            for (var i = 0; i < 3; i++)
              Icon(
                i < stars ? Icons.star_rounded : Icons.star_outline_rounded,
                size: 34,
                color: i < stars ? const Color(0xFFF59F00) : palette.line,
              ),
          ],
        ),
        const SizedBox(height: 12),
        // 逐字反馈：读对绿色，漏读/错读橙色
        Wrap(
          spacing: 2,
          runSpacing: 4,
          children: [
            for (final c in chars)
              Text(
                c is Map ? (c['char']?.toString() ?? '') : '',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: c is Map && c['status'] == 'read' ? readColor : missedColor,
                ),
              ),
          ],
        ),
        const SizedBox(height: 10),
        Text(r['feedback']?.toString() ?? '',
            style: TextStyle(fontSize: 15, height: 1.6, color: palette.ink)),
        if ((r['fluencyNote']?.toString() ?? '').isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text('⏱ ${r['fluencyNote']}',
                style: TextStyle(fontSize: 13, color: palette.ink2)),
          ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => _tts.speak(widget.sentence),
                icon: const Icon(Icons.volume_up_rounded, size: 18),
                label: const Text('听示范'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _startListening,
                icon: const Icon(Icons.refresh_rounded, size: 18),
                label: const Text('再读一次'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: FilledButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('完成'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}