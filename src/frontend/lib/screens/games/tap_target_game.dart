import 'dart:async';

import 'package:flutter/material.dart';

import '../../components/child_game_ui.dart';
import '../../services/child_game_voice.dart';
import '../../services/api_service.dart';
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
  /// Server-generated situation picture, preferred over the single emoji.
  final String? imageUrl;

  const _TapItem({
    required this.id,
    required this.label,
    this.icon,
    this.imageUrl,
  });
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
  bool _revealing = false;
  ChildFeedback? _feedback;
  int _cheerKey = 0;
  bool _finished = false;
  bool _completedCalled = false;
  int _taps = 0;
  final List<Map<String, dynamic>> _roundResults = <Map<String, dynamic>>[];
  Timer? _advanceTimer;
  Timer? _revealTimer;
  late final ChildGameVoice _voice;

  _TapRound? get _current =>
      _index >= 0 && _index < _rounds.length ? _rounds[_index] : null;

  @override
  void initState() {
    super.initState();
    _voice = ChildGameVoice();
    _voice.addListener(_onVoiceChanged);
    _reset();
    // 与旧逻辑一致：进入游戏时播报第 1 轮指令，播报完成前锁定点击。
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _speakPrompt();
    });
  }

  @override
  void dispose() {
    _advanceTimer?.cancel();
    _revealTimer?.cancel();
    _voice.removeListener(_onVoiceChanged);
    _voice.dispose();
    super.dispose();
  }

  void _onVoiceChanged() {
    if (mounted) setState(() {});
  }

  void _reset() {
    _rounds = _parseRounds(widget.data['rounds']);
    _passingScore =
        _toInt(widget.data['passingScore'], 80).clamp(0, 100).toInt();
    _timeLimitSec =
        _toInt(widget.data['timeLimitSec'], 120).clamp(30, 300).toInt();
    _startedAt = DateTime.now().millisecondsSinceEpoch;
    _index = 0;
    _pickedIds.clear();
    _wrongId = null;
    _revealing = false;
    _feedback = null;
    _cheerKey = 0;
    _finished = false;
    _completedCalled = false;
    _taps = 0;
    _roundResults.clear();
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

      final rawTargets =
          map['targets'] is List ? map['targets'] as List : const [];
      final usedTargetIds = <String>{};
      final usedLabels = <String>{};
      final idMap = <String, String>{};
      final targets = <_TapItem>[];
      for (var t = 0;
          t < rawTargets.length && targets.length < _maxTargets;
          t++) {
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
        // Only same-origin activity-image paths may become an <img> source.
        final rawImageUrl = (itemMap['imageUrl']?.toString() ?? '').trim();
        final imageUrl = RegExp(
          r'^/api/learning/activity-image/[A-Za-z0-9_.%~-]{1,200}$',
        ).hasMatch(rawImageUrl)
            ? rawImageUrl
            : null;
        targets.add(_TapItem(
          id: id,
          label: label,
          icon: icon.isEmpty ? null : icon,
          imageUrl: imageUrl,
        ));
      }
      if (targets.length < 2) continue;

      final survivingIds = targets.map((t) => t.id).toSet();
      final rawCorrect =
          map['correctIds'] is List ? map['correctIds'] as List : const [];
      final correctIds = <String>[];
      for (final candidate in rawCorrect) {
        final raw = candidate?.toString() ?? '';
        final mapped = idMap[raw] ?? raw;
        if (!survivingIds.contains(mapped) || correctIds.contains(mapped)) {
          continue;
        }
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
    // ChildGameVoice 负责 speaking 状态：播报期间点击锁定，
    // 失败 / 12s 超时会立即降级解锁，指令文本始终常显。
    _voice.speak(current.prompt);
  }

  void _tapItem(_TapItem item) {
    final current = _current;
    if (current == null || _finished || _completedCalled) return;
    if (_voice.speaking || _revealing) return;
    if (_pickedIds.contains(item.id)) return;

    _taps += 1;

    if (!current.correctIds.contains(item.id)) {
      // 每轮只有一次判定机会：碰到干扰项该轮失败，正确目标高亮 800ms。
      setState(() {
        _wrongId = item.id;
        _revealing = true;
        _feedback = const ChildFeedback.think('再听一次指令哦，正确的是它们！');
      });
      _voice.speak('再听一次指令哦');
      _recordRound(current.id, firstTry: false, taps: _taps);
      return;
    }

    setState(() {
      _pickedIds.add(item.id);
      if (_pickedIds.length >= current.correctIds.length) {
        _feedback = const ChildFeedback.cheer('答对啦！');
        _cheerKey += 1;
      }
    });
    if (_pickedIds.length >= current.correctIds.length) {
      if (_roundResults.length + 1 < _rounds.length) {
        _voice.speak('答对啦，真棒！');
      }
      _recordRound(current.id, firstTry: true, taps: _taps);
    }
  }

  void _recordRound(String roundId,
      {required bool firstTry, required int taps}) {
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
    final seconds =
        ((DateTime.now().millisecondsSinceEpoch - _startedAt) / 1000)
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

  @override
  Widget build(BuildContext context) {
    final current = _current;
    if (_rounds.isEmpty || current == null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.hearing_outlined,
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
        onPlayAgain: () {
          setState(_reset);
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) _speakPrompt();
          });
        },
        onBack: widget.onExit,
      );
    }

    final locked = _voice.speaking || _revealing;

    return ChildGameShell(
      title: widget.data['title']?.toString() ?? '听指令点一点',
      mascot: '👂',
      prompt: current.prompt,
      replayText: current.prompt,
      stepLabel: '第 ${_index + 1} / ${_rounds.length} 轮 · 听完再点',
      current: _index,
      total: _rounds.length,
      voice: _voice,
      feedback: _feedback,
      cheerKey: _cheerKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (locked)
            Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: ChildGamePalette.sky.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text('👂', style: TextStyle(fontSize: 24)),
                  SizedBox(width: 8),
                  Text(
                    '听完指令再点哦…',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w900,
                      color: ChildGamePalette.inkSoft,
                    ),
                  ),
                ],
              ),
            ),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.78),
              borderRadius: BorderRadius.circular(22),
            ),
            child: Wrap(
              spacing: 12,
              runSpacing: 12,
              alignment: WrapAlignment.center,
              children: [
                for (var index = 0; index < current.targets.length; index++)
                  _buildTargetTile(current, index, locked),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTargetTile(_TapRound round, int index, bool locked) {
    final item = round.targets[index];
    final picked = _pickedIds.contains(item.id);
    final isWrong = _wrongId == item.id;
    final isRevealed = _revealing && round.correctIds.contains(item.id);

    ChildTileState state;
    if (picked) {
      state = ChildTileState.correct;
    } else if (isWrong) {
      state = ChildTileState.wrong;
    } else if (isRevealed) {
      state = ChildTileState.revealed;
    } else if (locked) {
      state = ChildTileState.dimmed;
    } else {
      state = ChildTileState.normal;
    }

    return ChildVisualTile(
      visual: childVisual(icon: item.icon, label: item.label),
      label: item.label,
      size: 140,
      state: state,
      tint: ChildGamePalette.tintFor(index),
      semanticLabel: '目标 ${item.label}',
      // <img>/Image.network cannot send an Authorization header — append the
      // JWT as a query param (the JWT strategy already accepts ?token=).
      imageUrl: item.imageUrl == null
          ? null
          : () {
              final token = ApiService().token;
              return token == null || token.isEmpty
                  ? item.imageUrl
                  : '${item.imageUrl!}?token=${Uri.encodeComponent(token)}';
            }(),
      onTap: locked ? null : () => _tapItem(item),
    );
  }
}
