import 'dart:async';

import 'package:flutter/material.dart';

import '../../services/tts_service.dart';
import '../../theme/app_theme.dart';
import 'game_completion_screen.dart';

/// 听指令点目标游戏（方案 B 第六种参数化题型）。
///
/// 与 Web 端 TapTargetGame 使用同一套参数契约与判定规则（附录 H.1）：
/// - 每轮指令通过 TTS 播报（TtsService，后端 Edge TTS），播报完成前
///   点击锁定（onComplete + 15s 超时兜底）；TTS 失败时文本常显、立即解锁；
/// - 每轮只有一次判定机会：点中全部 correctIds 该轮通过；
///   碰到干扰项该轮失败，正确目标高亮 800ms 后进入下一轮；
/// - 无轮内倒计时，只有全局 timeLimitSec（30-300）；
/// - 计分：score = round(无失误轮 / 总轮数 × 100)；
/// - 回传 roundResults（roundId/firstTry/taps）供成长报告使用。
class TapTargetGame extends StatefulWidget {
  final Map<String, dynamic> data;
  final VoidCallback onExit;
  final ValueChanged<Map<String, dynamic>>? onFinished;

  const TapTargetGame({
    super.key,
    required this.data,
    required this.onExit,
    this.onFinished,
  });

  @override
  State<TapTargetGame> createState() => _TapTargetGameState();
}

class _TapItem {
  final String id;
  final String label;
  final String? icon;

  const _TapItem({required this.id, required this.label, this.icon});
}

class _TapRound {
  final String id;
  final String prompt;
  final List<_TapItem> targets;
  final List<String> correctIds;

  const _TapRound({
    required this.id,
    required this.prompt,
    required this.targets,
    required this.correctIds,
  });
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

class _TapTargetGameState extends State<TapTargetGame> {
  static const int _maxRounds = 6;
  static const int _maxTargets = 4;

  List<_TapRound> _rounds = const [];
  int _passingScore = 80;
  int _timeLimitSec = 120;
  late int _startedAt;

  int _index = 0;
  final List<String> _pickedIds = <String>[];
  String? _wrongId;
  bool _speaking = false;
  bool _revealing = false;
  String? _feedback;
  bool _finished = false;
  bool _completedCalled = false;
  int _taps = 0;
  final List<Map<String, dynamic>> _roundResults = <Map<String, dynamic>>[];
  Timer? _advanceTimer;
  Timer? _revealTimer;
  StreamSubscription<void>? _completionSub;

  _TapRound? get _current =>
      _index >= 0 && _index < _rounds.length ? _rounds[_index] : null;

  @override
  void initState() {
    super.initState();
    _reset();
  }

  @override
  void dispose() {
    _advanceTimer?.cancel();
    _revealTimer?.cancel();
    _completionSub?.cancel();
    TtsService().stop();
    super.dispose();
  }

  void _reset() {
    _rounds = _parseRounds(widget.data['rounds']);
    _passingScore = _toInt(widget.data['passingScore'], 80).clamp(0, 100).toInt();
    _timeLimitSec = _toInt(widget.data['timeLimitSec'], 120).clamp(30, 300).toInt();
    _startedAt = DateTime.now().millisecondsSinceEpoch;
    _index = 0;
    _pickedIds.clear();
    _wrongId = null;
    _speaking = false;
    _revealing = false;
    _feedback = null;
    _finished = false;
    _completedCalled = false;
    _taps = 0;
    _roundResults.clear();
    _speakPrompt();
  }

  List<_TapRound> _parseRounds(dynamic raw) {
    if (raw is! List) return const [];
    final usedRoundIds = <String>{};
    final result = <_TapRound>[];
    for (var i = 0; i < raw.length && result.length < _maxRounds; i++) {
      final entry = raw[i];
      if (entry is! Map) continue;
      final map = entry.map((k, v) => MapEntry(k.toString(), v));
      final prompt = _clip((map['prompt']?.toString() ?? '').trim(), 20);
      if (prompt.isEmpty) continue;

      final rawTargets = map['targets'] is List ? map['targets'] as List : const [];
      final usedTargetIds = <String>{};
      final usedLabels = <String>{};
      final idMap = <String, String>{};
      final targets = <_TapItem>[];
      for (var t = 0; t < rawTargets.length && targets.length < _maxTargets; t++) {
        final item = rawTargets[t];
        if (item is! Map) continue;
        final itemMap = item.map((k, v) => MapEntry(k.toString(), v));
        final label = _clip((itemMap['label']?.toString() ?? '').trim(), 12);
        if (label.isEmpty || usedLabels.contains(label)) continue;
        usedLabels.add(label);
        var id = _cleanId(itemMap['id']?.toString() ?? '');
        if (id.isEmpty) id = 't${i + 1}_${t + 1}';
        id = _clip(id, 32);
        var suffix = 2;
        while (usedTargetIds.contains(id)) {
          id = 't${i + 1}_${t + 1}_${suffix++}';
        }
        usedTargetIds.add(id);
        final rawId = (itemMap['id']?.toString() ?? '').trim();
        if (rawId.isNotEmpty) idMap[rawId] = id;
        final icon = _clip((itemMap['icon']?.toString() ?? '').trim(), 8);
        targets.add(_TapItem(id: id, label: label, icon: icon.isEmpty ? null : icon));
      }
      if (targets.length < 2) continue;

      final survivingIds = targets.map((t) => t.id).toSet();
      final rawCorrect = map['correctIds'] is List ? map['correctIds'] as List : const [];
      final correctIds = <String>[];
      for (final candidate in rawCorrect) {
        final raw = candidate?.toString() ?? '';
        final mapped = idMap[raw] ?? raw;
        if (!survivingIds.contains(mapped) || correctIds.contains(mapped)) continue;
        correctIds.add(mapped);
        if (correctIds.length >= 2) break;
      }
      // 正确目标被清洗掉、无 correctId 的轮次无法作答：整轮丢弃。
      if (correctIds.isEmpty) continue;

      var roundId = _cleanId(map['id']?.toString() ?? '');
      if (roundId.isEmpty) roundId = 'r${i + 1}';
      roundId = _clip(roundId, 32);
      var roundSuffix = 2;
      while (usedRoundIds.contains(roundId)) {
        roundId = 'r${i + 1}_${roundSuffix++}';
      }
      usedRoundIds.add(roundId);
      result.add(_TapRound(
        id: roundId,
        prompt: prompt,
        targets: targets,
        correctIds: correctIds,
      ));
    }
    return result;
  }

  void _speakPrompt() {
    final current = _current;
    if (current == null || _finished || _completedCalled) return;
    setState(() => _speaking = true);
    _completionSub?.cancel();
    _completionSub = null;
    // 播报完成（或 15s 超时兜底）后解锁点击；TTS 失败时 onComplete 也会
    // 被 speak() 内部 complete，等同降级为立即解锁。
    TtsService().speak(current.prompt).then((_) {
      _completionSub = null;
      return TtsService()
          .onComplete
          .timeout(const Duration(seconds: 15), onTimeout: () {});
    }).catchError((_) {}).whenComplete(() {
      _completionSub = null;
      if (!mounted || _finished || _completedCalled) return;
      setState(() => _speaking = false);
    });
  }

  void _tapItem(_TapItem item) {
    final current = _current;
    if (current == null || _finished || _completedCalled) return;
    if (_speaking || _revealing) return;
    if (_pickedIds.contains(item.id)) return;

    _taps += 1;

    if (!current.correctIds.contains(item.id)) {
      // 每轮只有一次判定机会：碰到干扰项该轮失败，正确目标高亮 800ms。
      setState(() {
        _wrongId = item.id;
        _revealing = true;
        _feedback = '再听一次指令哦，正确的是它们！';
      });
      _recordRound(current.id, firstTry: false, taps: _taps);
      return;
    }

    setState(() {
      _pickedIds.add(item.id);
      if (_pickedIds.length >= current.correctIds.length) {
        _feedback = '答对啦！';
      }
    });
    if (_pickedIds.length >= current.correctIds.length) {
      _recordRound(current.id, firstTry: true, taps: _taps);
    }
  }

  void _recordRound(String roundId, {required bool firstTry, required int taps}) {
    _roundResults.add({
      'roundId': roundId,
      'firstTry': firstTry,
      'taps': taps,
    });
    if (_roundResults.length >= _rounds.length) {
      _finish();
      return;
    }
    _advanceTimer?.cancel();
    _advanceTimer = Timer(const Duration(milliseconds: 800), () {
      _advanceTimer = null;
      if (!mounted || _finished || _completedCalled) return;
      setState(() {
        _index = (_index + 1).clamp(0, _rounds.length - 1).toInt();
        _pickedIds.clear();
        _wrongId = null;
        _revealing = false;
        _feedback = null;
        _taps = 0;
      });
      _speakPrompt();
    });
  }

  void _finish() {
    if (_completedCalled) return;
    _completedCalled = true;
    final total = _rounds.length;
    final cleanRounds =
        _roundResults.where((entry) => entry['firstTry'] == true).length;
    final seconds = ((DateTime.now().millisecondsSinceEpoch - _startedAt) / 1000)
        .round()
        .clamp(0, 86400)
        .toInt();

    widget.onFinished?.call({
      'score': total > 0 ? ((cleanRounds / total) * 100).round() : 0,
      'totalQuestions': total,
      'correctAnswers': cleanRounds,
      'timeSpent': seconds,
      'interactionData': {
        'activityType': 'tap_target',
        'engine': 'parameterized',
        'passingScore': _passingScore,
        'timeLimitSec': _timeLimitSec,
        'roundResults': _roundResults
            .map((entry) => Map<String, dynamic>.from(entry))
            .toList(),
      },
    });

    setState(() {
      _finished = true;
      _revealing = false;
    });
  }

  String _entryText(_TapItem item) =>
      item.icon == null ? item.label : '${item.icon} ${item.label}';

  @override
  Widget build(BuildContext context) {
    final current = _current;
    if (_rounds.isEmpty || current == null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons hearing_outlined,
                size: 48, color: AppTheme.textSecondary),
            const SizedBox(height: 12),
            const Text('暂无听指令题目'),
            const SizedBox(height: 12),
            FilledButton(onPressed: widget.onExit, child: const Text('返回')),
          ],
        ),
      );
    }

    if (_finished) {
      final cleanRounds =
          _roundResults.where((entry) => entry['firstTry'] == true).length;
      return GameCompletionScreen(
        title: widget.data['title']?.toString() ?? '听指令点一点',
        score: cleanRounds,
        total: _rounds.length,
        onPlayAgain: () => setState(_reset),
        onBack: widget.onExit,
      );
    }

    final locked = _speaking || _revealing;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            widget.data['title']?.toString() ?? '听指令点一点',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
          ),
          const SizedBox(height: 6),
          Text(
            current.prompt,
            style: TextStyle(
              color: AppTheme.textSecondary,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '第 ${_index + 1} / ${_rounds.length} 轮 · 建议在 $_timeLimitSec 秒内完成',
            style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
          ),
          const SizedBox(height: 10),
          Center(
            child: GestureDetector(
              onTap: locked ? null : _speakPrompt,
              child: Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: AppTheme.primaryColor.withValues(alpha: 0.5),
                    width: 2,
                  ),
                ),
                child: const Icon(Icons.volume_up_outlined,
                    color: AppTheme.primaryColor),
              ),
            ),
          ),
          const SizedBox(height: 10),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              childAspectRatio: 2.2,
            ),
            itemCount: current.targets.length,
            itemBuilder: (context, index) {
              final item = current.targets[index];
              final picked = _pickedIds.contains(item.id);
              final isWrong = _wrongId == item.id;
              final isRevealed =
                  _revealing && current.correctIds.contains(item.id);
              return GestureDetector(
                onTap: () => _tapItem(item),
                child: Container(
                  alignment: Alignment.center,
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: picked
                        ? AppTheme.successColor.withValues(alpha: 0.12)
                        : isWrong
                            ? AppTheme.warningColor.withValues(alpha: 0.12)
                            : Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: picked
                          ? AppTheme.successColor.withValues(alpha: 0.7)
                          : isWrong
                              ? AppTheme.warningColor.withValues(alpha: 0.7)
                              : isRevealed
                                  ? AppTheme.primaryColor.withValues(alpha: 0.7)
                                  : const Color(0x33808080),
                      width: isRevealed ? 2.4 : 1.4,
                    ),
                  ),
                  child: Text(
                    _entryText(item),
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: locked && !isRevealed
                          ? AppTheme.textSecondary
                          : AppTheme.textColor,
                    ),
                  ),
                ),
              );
            },
          ),
          if (locked) ...[
            const SizedBox(height: 8),
            const Text(
              '听完指令再点哦…',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: AppTheme.textSecondary),
            ),
          ],
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
