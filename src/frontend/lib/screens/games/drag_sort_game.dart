import 'package:flutter/material.dart';

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
  String? _feedback;
  bool _finished = false;
  bool _completedCalled = false;
  int _finalCorrect = 0;
  int _passingScore = 80;
  int _timeLimitSec = 120;
  late int _startedAt;

  @override
  void initState() {
    super.initState();
    _reset();
  }

  void _reset() {
    _buckets = _parseBuckets(widget.data);
    _items = _parseItems(widget.data, _buckets);
    _placements.clear();
    _attempts.clear();
    _selectedId = null;
    _feedback = null;
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
        _feedback = '放对啦！';
      });
      if (nextPlacements.length == _items.length) {
        _finish(nextPlacements, nextAttempts);
      }
    } else {
      setState(() {
        _attempts.clear();
        _attempts.addAll(nextAttempts);
        _selectedId = null;
        _feedback = '再想一想，它应该住在哪个篮子里呢？';
      });
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
      setState(() => _feedback = '先点一张卡片，再选篮子哦～');
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

  String _itemText(_Item item) =>
      item.icon == null ? item.label : '${item.icon} ${item.label}';

  String _bucketText(_Bucket bucket) =>
      bucket.icon == null ? bucket.label : '${bucket.icon} ${bucket.label}';

  Widget _chip(String text, {required bool selected, bool small = false}) {
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: small ? 10 : 14,
        vertical: small ? 6 : 10,
      ),
      decoration: BoxDecoration(
        color: selected
            ? AppTheme.primaryColor.withValues(alpha: 0.16)
            : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: selected ? AppTheme.primaryColor : const Color(0x33808080),
          width: selected ? 2 : 1.4,
        ),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: small ? 13 : 16,
          fontWeight: FontWeight.w700,
          color: AppTheme.textColor,
        ),
      ),
    );
  }

  Widget _buildBucketCard(_Bucket bucket) {
    final placed = _items
        .where((item) => _placements[item.id]?.bucketId == bucket.id)
        .toList();

    return DragTarget<String>(
      onWillAcceptWithDetails: (details) =>
          !_finished && !_placements.containsKey(details.data),
      onAcceptWithDetails: (details) => _place(details.data, bucket.id),
      builder: (context, candidateData, rejectedData) {
        final highlighted = candidateData.isNotEmpty;
        return Container(
          width: 165,
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: highlighted
                  ? AppTheme.primaryColor
                  : AppTheme.softPurple.withValues(alpha: 0.5),
              width: highlighted ? 2.4 : 1.6,
            ),
            boxShadow: AppTheme.softShadow(AppTheme.softPurple),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                _bucketText(bucket),
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: placed
                    .map((item) => GestureDetector(
                          onTap: () => _undo(item.id),
                          child: _chip(_itemText(item), selected: false, small: true),
                        ))
                    .toList(),
              ),
              const SizedBox(height: 8),
              SizedBox(
                height: 42,
                child: FilledButton(
                  onPressed: () => _handleBucketTap(bucket.id),
                  child: const Text('放到这里'),
                ),
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

    final pending = _items.where((item) => !_placements.containsKey(item.id)).toList();
    final placedCount = _placements.length;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            widget.data['title']?.toString() ?? '分类小游戏',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
          ),
          const SizedBox(height: 6),
          Text(
            widget.data['prompt']?.toString().isNotEmpty == true
                ? widget.data['prompt'].toString()
                : '点一张卡片，再点它该去的篮子（也可以直接拖过去）',
            style: TextStyle(
              color: AppTheme.textSecondary,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '已放好 $placedCount / ${_items.length} · 建议在 $_timeLimitSec 秒内完成',
            style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              boxShadow: AppTheme.softShadow(AppTheme.softPurple),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('待分类',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: pending.isEmpty
                      ? [const Text('全部放好啦！')]
                      : pending.map((item) {
                          final selected = _selectedId == item.id;
                          final chip = _chip(_itemText(item), selected: selected);
                          return Draggable<String>(
                            data: item.id,
                            feedback: Material(
                              color: Colors.transparent,
                              child: _chip(_itemText(item), selected: true),
                            ),
                            childWhenDragging: Opacity(
                              opacity: 0.35,
                              child: chip,
                            ),
                            onDragStarted: () {
                              setState(() => _selectedId = item.id);
                            },
                            child: GestureDetector(
                              onTap: () {
                                setState(() {
                                  _selectedId = selected ? null : item.id;
                                  _feedback = null;
                                });
                              },
                              child: chip,
                            ),
                          );
                        }).toList(),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: _buckets.map(_buildBucketCard).toList(),
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
