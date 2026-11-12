import 'package:flutter/material.dart';

import '../../components/child_game_ui.dart';
import '../../services/child_game_voice.dart';
import '../../theme/app_theme.dart';
import 'game_completion_screen.dart';

/// 拖拽分类游戏（方案 B 第一种参数化题型）。
///
/// 与 Web 端 DragSortGame 使用同一套参数契约与计分规则：
/// - 首次投放正确才计分；放错会记录一次 attempt 但卡片留在待分类区；
/// - 已投放的卡片可以撤回，撤回不会抹掉 attempt 记录；
/// - 回传 score 为 0-100 的百分比，并附带 placements / totalErrors。
/// 支持"点卡片 → 点篮子"和拖拽投放两种方式。
class DragSortGame extends StatefulWidget {
  final Map<String, dynamic> data;
  final VoidCallback onExit;
  final ValueChanged<Map<String, dynamic>>? onFinished;

  const DragSortGame({
    super.key,
    required this.data,
    required this.onExit,
    this.onFinished,
  });

  @override
  State<DragSortGame> createState() => _DragSortGameState();
}

class _Bucket {
  final String id;
  final String label;
  final String? icon;

  const _Bucket({required this.id, required this.label, this.icon});
}

class _Item {
  final String id;
  final String label;
  final String? icon;
  final String bucketId;

  const _Item({
    required this.id,
    required this.label,
    this.icon,
    required this.bucketId,
  });
}

class _Placement {
  final String bucketId;
  final bool correctOnFirstTry;
  final int attempts;

  const _Placement({
    required this.bucketId,
    required this.correctOnFirstTry,
    required this.attempts,
  });
}

String _clip(String value, int maxRunes) {
  if (value.runes.length <= maxRunes) return value;
  return String.fromCharCodes(value.runes.take(maxRunes));
}

int _toInt(dynamic value, int fallback) {
  return int.tryParse(value?.toString() ?? '') ?? fallback;
}

/// 与 _parseBuckets 使用同一套 id 清洗规则，避免 bucket.id 被清洗后
/// item.bucketId 因仍是原始字符串而匹配不上，导致卡片被静默丢弃。
String _cleanId(String value) {
  return value.trim().replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '');
}

class _DragSortGameState extends State<DragSortGame> {
  static const int _maxBuckets = 4;
  static const int _maxItems = 12;

  List<_Bucket> _buckets = const [];
  List<_Item> _items = const [];
  final Map<String, _Placement> _placements = {};
  final Map<String, int> _attempts = {};
  String? _selectedId;
  ChildFeedback? _feedback;
  int _cheerKey = 0;
  bool _finished = false;
  bool _completedCalled = false;
  int _finalCorrect = 0;
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
    final title = widget.data['title']?.toString() ?? '分类小游戏';
    return '我们来玩$title。${_promptText()}';
  }

  void _reset() {
    _buckets = _parseBuckets(widget.data);
    _items = _parseItems(widget.data, _buckets);
    _placements.clear();
    _attempts.clear();
    _selectedId = null;
    _feedback = null;
    _cheerKey = 0;
    _finished = false;
    _completedCalled = false;
    _finalCorrect = 0;
    _passingScore = _toInt(widget.data['passingScore'], 80).clamp(0, 100).toInt();
    _timeLimitSec = _toInt(widget.data['timeLimitSec'], 120).clamp(30, 300).toInt();
    _startedAt = DateTime.now().millisecondsSinceEpoch;
  }

  List<_Bucket> _parseBuckets(Map<String, dynamic> data) {
    final raw = data['buckets'];
    if (raw is! List) return const [];

    final used = <String>{};
    final result = <_Bucket>[];
    for (var i = 0; i < raw.length && result.length < _maxBuckets; i++) {
      final entry = raw[i];
      if (entry is! Map) continue;
      final map = entry.map((k, v) => MapEntry(k.toString(), v));
      final label = (map['label']?.toString() ?? '').trim();
      if (label.isEmpty) continue;

      var id = _cleanId(map['id']?.toString() ?? '');
      if (id.isEmpty) id = 'b${i + 1}';
      id = _clip(id, 32);
      var suffix = 2;
      while (used.contains(id)) {
        id = 'b${i + 1}_${suffix++}';
      }
      used.add(id);

      final icon = _clip((map['icon']?.toString() ?? '').trim(), 8);
      result.add(_Bucket(
        id: id,
        label: _clip(label, 16),
        icon: icon.isEmpty ? null : icon,
      ));
    }
    return result;
  }

  List<_Item> _parseItems(Map<String, dynamic> data, List<_Bucket> buckets) {
    final raw = data['items'];
    if (raw is! List || buckets.isEmpty) return const [];
    final bucketIds = buckets.map((b) => b.id).toSet();

    final used = <String>{};
    final result = <_Item>[];
    for (var i = 0; i < raw.length && result.length < _maxItems; i++) {
      final entry = raw[i];
      if (entry is! Map) continue;
      final map = entry.map((k, v) => MapEntry(k.toString(), v));
      final label = (map['label']?.toString() ?? '').trim();
      final bucketId = _cleanId(map['bucketId']?.toString() ?? '');
      if (label.isEmpty || !bucketIds.contains(bucketId)) continue;

      var id = _cleanId(map['id']?.toString() ?? '');
      if (id.isEmpty) id = 'i${i + 1}';
      id = _clip(id, 32);
      var suffix = 2;
      while (used.contains(id)) {
        id = 'i${i + 1}_${suffix++}';
      }
      used.add(id);

      final icon = _clip((map['icon']?.toString() ?? '').trim(), 8);
      result.add(_Item(
        id: id,
        label: _clip(label, 16),
        icon: icon.isEmpty ? null : icon,
        bucketId: bucketId,
      ));
    }
    return result;
  }

  void _place(String itemId, String bucketId) {
    if (_finished || _completedCalled) return;
    final item = _items.where((entry) => entry.id == itemId).toList();
    if (item.isEmpty || _placements.containsKey(itemId)) return;

    final count = (_attempts[itemId] ?? 0) + 1;
    final nextAttempts = Map<String, int>.from(_attempts)..[itemId] = count;

    if (item.first.bucketId == bucketId) {
      final nextPlacements = Map<String, _Placement>.from(_placements)
        ..[itemId] = _Placement(
          bucketId: bucketId,
          correctOnFirstTry: count == 1,
          attempts: count,
        );
      setState(() {
        _attempts.clear();
        _attempts.addAll(nextAttempts);
        _placements.clear();
        _placements.addAll(nextPlacements);
        _selectedId = null;
        _feedback = const ChildFeedback.cheer('放对啦！');
        _cheerKey += 1;
      });
      if (nextPlacements.length == _items.length) {
        _finish(nextPlacements, nextAttempts);
      } else {
        _voice.speak('太棒啦，放对了！');
      }
    } else {
      setState(() {
        _attempts.clear();
        _attempts.addAll(nextAttempts);
        _selectedId = null;
        _feedback = const ChildFeedback.think('再想一想，它应该住在哪个篮子里呢？');
      });
      _voice.speak('再想一想，试试别的篮子吧');
    }
  }

  void _undo(String itemId) {
    if (_finished || _completedCalled) return;
    setState(() {
      _placements.remove(itemId);
      _feedback = null;
    });
  }

  void _handleBucketTap(String bucketId) {
    final selected = _selectedId;
    if (selected == null) {
      setState(() => _feedback = const ChildFeedback.tip('先点一张卡片，再选篮子哦～'));
      _voice.speak('先点一张小卡片，再点篮子');
      return;
    }
    _place(selected, bucketId);
  }

  void _finish(Map<String, _Placement> placements, Map<String, int> attempts) {
    if (_completedCalled) return;
    _completedCalled = true;

    final correct =
        placements.values.where((entry) => entry.correctOnFirstTry).length;
    final totalErrors = attempts.values.fold<int>(
      0,
      (sum, n) => sum + (n - 1).clamp(0, 1000).toInt(),
    );
    final seconds = ((DateTime.now().millisecondsSinceEpoch - _startedAt) / 1000)
        .round()
        .clamp(0, 86400)
        .toInt();
    final total = _items.length;
    final score = total > 0 ? ((correct / total) * 100).round() : 0;

    widget.onFinished?.call({
      'score': score,
      'totalQuestions': total,
      'correctAnswers': correct,
      'timeSpent': seconds,
      'interactionData': {
        'activityType': 'drag_sort',
        'engine': 'parameterized',
        'passingScore': _passingScore,
        'timeLimitSec': _timeLimitSec,
        'totalErrors': totalErrors,
        'placements': _items.map((item) {
          final placement = placements[item.id];
          return {
            'itemId': item.id,
            'bucketId': placement?.bucketId ?? item.bucketId,
            'correctOnFirstTry': placement?.correctOnFirstTry ?? false,
            'attempts': attempts[item.id] ?? 0,
          };
        }).toList(),
      },
    });

    setState(() {
      _finalCorrect = correct;
      _finished = true;
    });
  }

  String _promptText() {
    final raw = (widget.data['prompt']?.toString() ?? '').trim();
    return raw.isNotEmpty ? raw : '点一点小卡片，把它送回对应的家';
  }

  Widget _buildBucketCard(_Bucket bucket) {
    final placed = _items
        .where((item) => _placements[item.id]?.bucketId == bucket.id)
        .toList();
    final visual = childVisual(icon: bucket.icon, label: bucket.label);
    final tint = ChildGamePalette.tintFor(_buckets.indexOf(bucket) + 2);

    return DragTarget<String>(
      onWillAcceptWithDetails: (details) =>
          !_finished && !_placements.containsKey(details.data),
      onAcceptWithDetails: (details) => _place(details.data, bucket.id),
      builder: (context, candidateData, rejectedData) {
        final highlighted = candidateData.isNotEmpty;
        return AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          width: 168,
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: highlighted
                ? ChildGamePalette.sunshine.withValues(alpha: 0.5)
                : tint,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(
              color: highlighted
                  ? ChildGamePalette.coral
                  : ChildGamePalette.inkSoft.withValues(alpha: 0.3),
              width: highlighted ? 3 : 2,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.06),
                blurRadius: 10,
                offset: const Offset(0, 5),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                visual.glyph,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 38, height: 1.1),
              ),
              const SizedBox(height: 2),
              Text(
                bucket.label,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w900,
                  color: ChildGamePalette.ink,
                ),
              ),
              const SizedBox(height: 8),
              Container(
                constraints: const BoxConstraints(minHeight: 58),
                alignment: Alignment.center,
                child: placed.isEmpty
                    ? Icon(
                        Icons.inbox_rounded,
                        size: 34,
                        color: ChildGamePalette.inkSoft.withValues(alpha: 0.4),
                      )
                    : Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        alignment: WrapAlignment.center,
                        children: placed
                            .map((item) => ChildMiniChip(
                                  visual: childVisual(
                                      icon: item.icon, label: item.label),
                                  label: item.label,
                                  onTap: () => _undo(item.id),
                                ))
                            .toList(),
                      ),
              ),
              const SizedBox(height: 8),
              ChildBigButton(
                label: '放到这里',
                emoji: '👇',
                onTap: () => _handleBucketTap(bucket.id),
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_buckets.length < 2 || _items.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.category_outlined,
                size: 48, color: AppTheme.textSecondary),
            const SizedBox(height: 12),
            const Text('暂无分类题目'),
            const SizedBox(height: 12),
            FilledButton(onPressed: widget.onExit, child: const Text('返回')),
          ],
        ),
      );
    }

    if (_finished) {
      return GameCompletionScreen(
        title: widget.data['title']?.toString() ?? '分类小游戏',
        score: _finalCorrect,
        total: _items.length,
        onPlayAgain: () => setState(_reset),
        onBack: widget.onExit,
      );
    }

    final pending =
        _items.where((item) => !_placements.containsKey(item.id)).toList();
    final placedCount = _placements.length;
    final prompt = _promptText();

    return ChildGameShell(
      title: widget.data['title']?.toString() ?? '分类小游戏',
      mascot: '🏠',
      prompt: prompt,
      replayText: '把小卡片送回对应的家。$prompt',
      stepLabel: '点卡片 → 点篮子',
      current: placedCount,
      total: _items.length,
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
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                const Row(
                  children: [
                    Text('🎈', style: TextStyle(fontSize: 20)),
                    SizedBox(width: 6),
                    Text(
                      '等待送回家',
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
                  spacing: 10,
                  runSpacing: 10,
                  children: pending.isEmpty
                      ? [
                          const Text(
                            '全部放好啦！🎉',
                            style: TextStyle(
                                fontSize: 15, fontWeight: FontWeight.w800),
                          ),
                        ]
                      : pending.map((item) {
                          final selected = _selectedId == item.id;
                          final visual =
                              childVisual(icon: item.icon, label: item.label);
                          final tint =
                              ChildGamePalette.tintFor(_items.indexOf(item));
                          Widget tileOf(ChildTileState state) => ChildVisualTile(
                                visual: visual,
                                label: item.label,
                                state: state,
                                tint: tint,
                                semanticLabel: '选择卡片 ${item.label}',
                              );
                          return Draggable<String>(
                            data: item.id,
                            feedback: Material(
                              color: Colors.transparent,
                              child: tileOf(ChildTileState.selected),
                            ),
                            childWhenDragging: Opacity(
                              opacity: 0.3,
                              child: tileOf(ChildTileState.normal),
                            ),
                            onDragStarted: () {
                              setState(() => _selectedId = item.id);
                            },
                            child: ChildVisualTile(
                              visual: visual,
                              label: item.label,
                              state: selected
                                  ? ChildTileState.selected
                                  : ChildTileState.normal,
                              tint: tint,
                              semanticLabel: '选择卡片 ${item.label}',
                              onTap: () {
                                setState(() {
                                  _selectedId = selected ? null : item.id;
                                  _feedback = null;
                                });
                                _voice.speak('这是${item.label}，把它送回家吧');
                              },
                            ),
                          );
                        }).toList(),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: _buckets.map(_buildBucketCard).toList(),
          ),
        ],
      ),
    );
  }
}
