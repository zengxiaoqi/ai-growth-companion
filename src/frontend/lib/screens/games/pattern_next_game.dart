import 'package:flutter/material.dart';

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
  String? _feedback;
  bool _finished = false;
  bool _completedCalled = false;
  int _passingScore = 80;
  int _timeLimitSec = 120;
  late int _startedAt;

  @override
  void initState() {
    super.initState();
    _reset();
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

    _answerIndex = _resolveAnswerIndex(widget.data['answerIndex'], _options.length);
    _attempts = 0;
    _wrongPick = null;
    _feedback = null;
    _finished = false;
    _completedCalled = false;
    _passingScore = _toInt(widget.data['passingScore'], 80).clamp(0, 100).toInt();
    _timeLimitSec = _toInt(widget.data['timeLimitSec'], 120).clamp(30, 300).toInt();
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
        final seconds = ((DateTime.now().millisecondsSinceEpoch - _startedAt) / 1000)
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
          _feedback = firstTry ? '答对啦！' : '答对啦！（第一次就答对才能得分哦）';
          _finished = true;
        });
      }
      return;
    }

    setState(() {
      _attempts = nextAttempts;
      _wrongPick = _options[index].id;
      _feedback = '再想一想，规律是什么呢？';
    });
  }

  String _entryText(_Entry entry) =>
      entry.icon == null ? entry.label : '${entry.icon} ${entry.label}';

  @override
  Widget build(BuildContext context) {
    final answerValid =
        _answerIndex >= 0 && _answerIndex < _options.length;
    if (_sequence.length < 2 || _options.length < 2 || !answerValid) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.auto_awesome_outlined,
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

    return SingleChildScrollView(
      padding: const EdgeInsets.all(4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            widget.data['title']?.toString() ?? '规律接龙',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
          ),
          const SizedBox(height: 6),
          Text(
            (widget.data['prompt']?.toString().isNotEmpty == true)
                ? widget.data['prompt'].toString()
                : '找一找规律，下一个应该是什么呢？',
            style: TextStyle(
              color: AppTheme.textSecondary,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '建议在 $_timeLimitSec 秒内完成${_attempts > 0 ? ' · 已尝试 $_attempts 次' : ''}',
            style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            alignment: WrapAlignment.center,
            children: [
              for (final item in _sequence)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: const Color(0x33808080), width: 1.4),
                  ),
                  child: Text(
                    _entryText(item),
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                  ),
                ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: AppTheme.primaryColor.withValues(alpha: 0.6),
                    width: 2,
                  ),
                ),
                child: Text(
                  '？',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: AppTheme.primaryColor,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              childAspectRatio: 2.4,
            ),
            itemCount: _options.length,
            itemBuilder: (context, index) {
              final isWrong = _wrongPick == _options[index].id;
              return GestureDetector(
                onTap: () => _pick(index),
                child: Container(
                  alignment: Alignment.center,
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: isWrong
                        ? AppTheme.warningColor.withValues(alpha: 0.12)
                        : Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: isWrong
                          ? AppTheme.warningColor.withValues(alpha: 0.7)
                          : const Color(0x33808080),
                      width: isWrong ? 2 : 1.4,
                    ),
                  ),
                  child: Text(
                    _entryText(_options[index]),
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                  ),
                ),
              );
            },
          ),
          if (_feedback != null) ...[
            const SizedBox(height: 10),
            Text(
              _feedback!,
              textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ],
        ],
      ),
    );
  }
}
