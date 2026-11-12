import 'package:flutter/material.dart';

import '../../components/child_game_ui.dart';
import '../../services/child_game_voice.dart';
import '../../theme/app_theme.dart';
import 'game_completion_screen.dart';

/// 规律接龙游戏（方案 B 第三种参数化题型）。
///
/// 与 Web 端 PatternNextGame 使用同一套参数契约与计分规则：
/// - 序列展示 + 问号占位，孩子从 2-4 个选项里点选"下一个"；
/// - 答错可以重试，但只有第一次就答对才计分（score 100/0，total=1）；
/// - 回传 attempts / firstTryCorrect 供成长报告使用。
class PatternNextGame extends StatefulWidget {
  final Map<String, dynamic> data;
  final VoidCallback onExit;
  final ValueChanged<Map<String, dynamic>>? onFinished;

  const PatternNextGame({
    super.key,
    required this.data,
    required this.onExit,
    this.onFinished,
  });

  @override
  State<PatternNextGame> createState() => _PatternNextGameState();
}

class _Entry {
  final String id;
  final String label;
  final String? icon;

  const _Entry({required this.id, required this.label, this.icon});
}

String _clip(String value, int maxRunes) {
  if (value.runes.length <= maxRunes) return value;
  return String.fromCharCodes(value.runes.take(maxRunes));
}

int _toInt(dynamic value, int fallback) {
  return int.tryParse(value?.toString() ?? '') ?? fallback;
}

String _cleanId(String value) {
  return value.trim().replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '');
}

class _PatternNextGameState extends State<PatternNextGame> {
  static const int _maxSequence = 8;
  static const int _maxOptions = 4;

  List<_Entry> _sequence = const [];
  List<_Entry> _options = const [];
  int _answerIndex = -1;
  int _attempts = 0;
  String? _wrongPick;
  ChildFeedback? _feedback;
  int _cheerKey = 0;
  bool _finished = false;
  bool _completedCalled = false;
  int _passingScore = 80;
  int _timeLimitSec = 120;
  late int _startedAt;
  late final ChildGameVoice _voice;

  @override
  void initState() {
    super.initState();
    _voice = ChildGameVoice();
    _voice.addListener(_onVoiceChanged);
    _reset();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _voice.speak(_introSpeech());
    });
  }

  @override
  void dispose() {
    _voice.removeListener(_onVoiceChanged);
    _voice.dispose();
    super.dispose();
  }

  void _onVoiceChanged() {
    if (mounted) setState(() {});
  }

  String _introSpeech() {
    final title = widget.data['title']?.toString() ?? '规律接龙';
    return '我们来玩$title。${_promptText()}';
  }

  void _reset() {
    _sequence = _parseEntries(widget.data['sequence'], 's', _maxSequence);
    _options = _parseEntries(widget.data['options'], 'o', _maxOptions);

    // 选项标签必须唯一，否则答案对孩子有歧义：丢弃后到的重复项。
    final seen = <String>{};
    final unique = <_Entry>[];
    for (final option in _options) {
      if (seen.contains(option.label)) continue;
      seen.add(option.label);
      unique.add(option);
    }
    _options = unique;

    _answerIndex =
        _resolveAnswerIndex(widget.data['answerIndex'], _options.length);
    _attempts = 0;
    _wrongPick = null;
    _feedback = null;
    _cheerKey = 0;
    _finished = false;
    _completedCalled = false;
    _passingScore =
        _toInt(widget.data['passingScore'], 80).clamp(0, 100).toInt();
    _timeLimitSec =
        _toInt(widget.data['timeLimitSec'], 120).clamp(30, 300).toInt();
    _startedAt = DateTime.now().millisecondsSinceEpoch;
  }

  List<_Entry> _parseEntries(dynamic raw, String prefix, int max) {
    if (raw is! List) return const [];
    final used = <String>{};
    final result = <_Entry>[];
    for (var i = 0; i < raw.length && result.length < max; i++) {
      final entry = raw[i];
      if (entry is! Map) continue;
      final map = entry.map((k, v) => MapEntry(k.toString(), v));
      final label = (map['label']?.toString() ?? '').trim();
      if (label.isEmpty) continue;

      var id = _cleanId(map['id']?.toString() ?? '');
      if (id.isEmpty) id = '$prefix${i + 1}';
      id = _clip(id, 32);
      var suffix = 2;
      while (used.contains(id)) {
        id = '$prefix${i + 1}_${suffix++}';
      }
      used.add(id);

      final icon = _clip((map['icon']?.toString() ?? '').trim(), 8);
      result.add(_Entry(
        id: id,
        label: _clip(label, 12),
        icon: icon.isEmpty ? null : icon,
      ));
    }
    return result;
  }

  /// 零基 answerIndex；容忍模型给出的一基答案，无法解析时返回 -1（空状态）。
  int _resolveAnswerIndex(dynamic raw, int optionCount) {
    var index = _toInt(raw, -1);
    if (index < 0 || index >= optionCount) {
      final oneBased = index - 1;
      index = (oneBased >= 0 && oneBased < optionCount) ? oneBased : -1;
    }
    return index;
  }

  void _pick(int index) {
    if (_finished || _completedCalled) return;
    if (index < 0 || index >= _options.length) return;

    final nextAttempts = _attempts + 1;
    if (index == _answerIndex) {
      final firstTry = nextAttempts == 1;
      if (!_completedCalled) {
        _completedCalled = true;
        final seconds =
            ((DateTime.now().millisecondsSinceEpoch - _startedAt) / 1000)
                .round()
                .clamp(0, 86400)
                .toInt();

        widget.onFinished?.call({
          'score': firstTry ? 100 : 0,
          'totalQuestions': 1,
          'correctAnswers': firstTry ? 1 : 0,
          'timeSpent': seconds,
          'interactionData': {
            'activityType': 'pattern_next',
            'engine': 'parameterized',
            'passingScore': _passingScore,
            'timeLimitSec': _timeLimitSec,
            'attempts': nextAttempts,
            'firstTryCorrect': firstTry,
            'pickedOptionId': _options[index].id,
            'sequenceLabels': _sequence.map((item) => item.label).toList(),
          },
        });

        setState(() {
          _attempts = nextAttempts;
          _feedback = firstTry
              ? const ChildFeedback.cheer('答对啦！')
              : const ChildFeedback.cheer('答对啦！（第一次就答对才能得分哦）');
          _cheerKey += 1;
          _finished = true;
        });
      }
      return;
    }

    setState(() {
      _attempts = nextAttempts;
      _wrongPick = _options[index].id;
      _feedback = const ChildFeedback.think('再想一想，规律是什么呢？');
    });
    _voice.speak('再想一想，看看前面的规律');
  }

  String _promptText() {
    final raw = (widget.data['prompt']?.toString() ?? '').trim();
    return raw.isNotEmpty ? raw : '找一找规律，下一个应该是什么呢？';
  }

  @override
  Widget build(BuildContext context) {
    final answerValid = _answerIndex >= 0 && _answerIndex < _options.length;
    if (_sequence.length < 2 || _options.length < 2 || !answerValid) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.auto_awesome_outlined,
                size: 48, color: AppTheme.textSecondary),
            const SizedBox(height: 12),
            const Text('暂无规律接龙题目'),
            const SizedBox(height: 12),
            FilledButton(onPressed: widget.onExit, child: const Text('返回')),
          ],
        ),
      );
    }

    if (_finished) {
      return GameCompletionScreen(
        title: widget.data['title']?.toString() ?? '规律接龙',
        score: _attempts == 1 ? 1 : 0,
        total: 1,
        onPlayAgain: () => setState(_reset),
        onBack: widget.onExit,
      );
    }

    final prompt = _promptText();

    return ChildGameShell(
      title: widget.data['title']?.toString() ?? '规律接龙',
      mascot: '🐻',
      prompt: prompt,
      replayText: '看看排队的图形，猜猜下一个。$prompt',
      stepLabel: '找出排队的规律',
      current: 0,
      total: 1,
      voice: _voice,
      feedback: _feedback,
      cheerKey: _cheerKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.8),
              borderRadius: BorderRadius.circular(22),
              border: Border.all(
                color: ChildGamePalette.inkSoft.withValues(alpha: 0.2),
              ),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Row(
                  children: [
                    Text('🚂', style: TextStyle(fontSize: 20)),
                    SizedBox(width: 6),
                    Text(
                      '小火车排队啦',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w900,
                        color: ChildGamePalette.inkSoft,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  alignment: WrapAlignment.center,
                  children: [
                    for (var i = 0; i < _sequence.length; i++)
                      ChildVisualTile(
                        visual: childVisual(
                            icon: _sequence[i].icon, label: _sequence[i].label),
                        label: _sequence[i].label,
                        size: 76,
                        tint: ChildGamePalette.tintFor(i),
                        semanticLabel: '序列 ${_sequence[i].label}',
                      ),
                    ChildVisualTile(
                      visual: const ChildVisual('❓'),
                      label: '下一个?',
                      size: 76,
                      state: ChildTileState.revealed,
                      semanticLabel: '下一个是什么',
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          const Row(
            children: [
              Text('👇', style: TextStyle(fontSize: 20)),
              SizedBox(width: 6),
              Text(
                '点一个大图形选答案',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w900,
                  color: ChildGamePalette.inkSoft,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            alignment: WrapAlignment.center,
            children: [
              for (var index = 0; index < _options.length; index++)
                ChildVisualTile(
                  visual: childVisual(
                      icon: _options[index].icon, label: _options[index].label),
                  label: _options[index].label,
                  size: 140,
                  state: _wrongPick == _options[index].id
                      ? ChildTileState.wrong
                      : ChildTileState.normal,
                  tint: ChildGamePalette.tintFor(index + 1),
                  semanticLabel: '选项 ${_options[index].label}',
                  onTap: () => _pick(index),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
