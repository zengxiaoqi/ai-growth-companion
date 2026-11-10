import 'dart:async';

import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import 'game_completion_screen.dart';

/// 记忆翻牌游戏（方案 B 第二种参数化题型）。
///
/// 与 Web 端 MemoryFlipGame 使用同一套参数契约与计分规则：
/// - 只支持 2/3/4/6/8 对（对应 2x2/2x3/2x4/3x4/4x4 儿童友好棋盘）；
/// - 翻开两张同对卡片保持正面，不同对 800ms 后翻回并记一次 mismatch；
/// - 完成时 score = 配对数 / 总对数 * 100，附带 moves / mismatches；
/// - 洗牌使用由参数决定的确定性种子，双端行为一致、测试可复现。
class MemoryFlipGame extends StatefulWidget {
  final Map<String, dynamic> data;
  final VoidCallback onExit;
  final ValueChanged<Map<String, dynamic>>? onFinished;

  const MemoryFlipGame({
    super.key,
    required this.data,
    required this.onExit,
    this.onFinished,
  });

  @override
  State<MemoryFlipGame> createState() => _MemoryFlipGameState();
}

class _Pair {
  final String id;
  final String label;
  final String? icon;

  const _Pair({required this.id, required this.label, this.icon});
}

class _Card {
  final String key;
  final String pairId;
  final _Pair pair;

  const _Card({required this.key, required this.pairId, required this.pair});
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

/// FNV-1a hash — 与 Web 端 seedFromString 保持一致。
int _seedFromString(String value) {
  var hash = 0x811C9DC5;
  for (final rune in value.runes) {
    hash ^= rune & 0xFF;
    hash = (hash * 0x01000193) & 0xFFFFFFFF;
    hash ^= (rune >> 8) & 0xFF;
    hash = (hash * 0x01000193) & 0xFFFFFFFF;
  }
  return hash & 0x7FFFFFFF;
}

class _MemoryFlipGameState extends State<MemoryFlipGame> {
  static const int _maxPairs = 8;
  static const int _flipBackMs = 800;

  /// 合法对数 -> 棋盘，与后端 PAIR_GRID / Web MEMORY_FLIP_GRIDS 一致。
  static const Map<int, List<int>> _pairGrid = {
    2: [2, 2],
    3: [2, 3],
    4: [2, 4],
    6: [3, 4],
    8: [4, 4],
  };

  List<_Pair> _pairs = const [];
  List<_Card> _deck = const [];
  int _rows = 0;
  int _cols = 0;
  final Set<String> _matched = {};
  final List<_Card> _flipped = [];
  int _moves = 0;
  int _mismatches = 0;
  bool _resolving = false;
  int _resolveGeneration = 0;
  String? _feedback;
  bool _finished = false;
  bool _completedCalled = false;
  int _passingScore = 80;
  int _timeLimitSec = 180;
  late int _startedAt;

  @override
  void initState() {
    super.initState();
    _reset();
  }

  @override
  void dispose() {
    // 让任何在飞的 flip-back 定时器失效。
    _resolveGeneration += 1;
    super.dispose();
  }

  void _reset() {
    _pairs = _parsePairs(widget.data);
    _deck = _buildDeck(_pairs);
    final grid = _pairGrid[_pairs.length];
    _rows = grid?[0] ?? 0;
    _cols = grid?[1] ?? 0;
    _matched.clear();
    _flipped.clear();
    _moves = 0;
    _mismatches = 0;
    _resolving = false;
    _resolveGeneration += 1;
    _feedback = null;
    _finished = false;
    _completedCalled = false;
    _passingScore = _toInt(widget.data['passingScore'], 80).clamp(0, 100).toInt();
    _timeLimitSec = _toInt(widget.data['timeLimitSec'], 180).clamp(60, 300).toInt();
    _startedAt = DateTime.now().millisecondsSinceEpoch;
  }

  List<_Pair> _parsePairs(Map<String, dynamic> data) {
    final raw = data['pairs'];
    if (raw is! List) return const [];

    final used = <String>{};
    final faces = <String>{};
    final result = <_Pair>[];
    for (var i = 0; i < raw.length && result.length < _maxPairs; i++) {
      final entry = raw[i];
      if (entry is! Map) continue;
      final map = entry.map((k, v) => MapEntry(k.toString(), v));
      final label = (map['label']?.toString() ?? '').trim();
      if (label.isEmpty) continue;

      final icon = _clip((map['icon']?.toString() ?? '').trim(), 8);
      // 两对牌面完全一致会让"配对"产生歧义，直接丢弃后到的一对。
      final face = '$label|$icon';
      if (faces.contains(face)) continue;
      faces.add(face);

      var id = _cleanId(map['id']?.toString() ?? '');
      if (id.isEmpty) id = 'p${i + 1}';
      id = _clip(id, 32);
      var suffix = 2;
      while (used.contains(id)) {
        id = 'p${i + 1}_${suffix++}';
      }
      used.add(id);

      result.add(_Pair(
        id: id,
        label: _clip(label, 12),
        icon: icon.isEmpty ? null : icon,
      ));
    }
    // 非法对数（如 5、7）裁剪到最近的可整除棋盘对数，保持可玩。
    final legal = [2, 3, 4, 6, 8];
    final trimmed = legal.where((count) => count <= result.length).toList();
    if (trimmed.isEmpty) return const [];
    final target = trimmed.last;
    if (result.length > target) {
      result.removeRange(target, result.length);
    }
    return result;
  }

  List<_Card> _buildDeck(List<_Pair> pairs) {
    final cards = <_Card>[];
    for (final pair in pairs) {
      cards.add(_Card(key: '${pair.id}#a', pairId: pair.id, pair: pair));
      cards.add(_Card(key: '${pair.id}#b', pairId: pair.id, pair: pair));
    }
    // 确定性洗牌（与 Web mulberry32 同为可复现实现；子游戏无需加密强度）。
    var seed = _seedFromString(cards.map((c) => c.key).join('|'));
    int nextRandom() {
      seed = (seed + 0x6D2B79F5) & 0x7FFFFFFF;
      var t = seed;
      t = ((t ^ (t >> 15)) * (t | 1)) & 0x7FFFFFFF;
      t = (t + (((t ^ (t >> 7)) * (t | 61)) & 0x7FFFFFFF)) & 0x7FFFFFFF;
      return ((t ^ (t >> 14)) & 0x7FFFFFFF);
    }

    for (var i = cards.length - 1; i > 0; i--) {
      final j = nextRandom() % (i + 1);
      final tmp = cards[i];
      cards[i] = cards[j];
      cards[j] = tmp;
    }
    return cards;
  }

  void _flip(_Card card) {
    if (_finished || _completedCalled || _resolving) return;
    if (_matched.contains(card.pairId)) return;
    if (_flipped.any((entry) => entry.key == card.key)) return;
    if (_flipped.length >= 2) return;

    setState(() {
      _flipped.add(card);
      _feedback = null;
    });
    if (_flipped.length < 2) return;

    final a = _flipped[0];
    final b = _flipped[1];
    final generation = _resolveGeneration;

    if (a.pairId == b.pairId) {
      setState(() {
        _moves += 1;
        _matched.add(a.pairId);
        _flipped.clear();
        _feedback = '配对成功！';
      });
      if (_matched.length == _pairs.length) {
        _finish();
      }
      return;
    }

    setState(() {
      _moves += 1;
      _mismatches += 1;
      _resolving = true;
      _feedback = '不是一对，再试试看～';
    });
    Future.delayed(const Duration(milliseconds: _flipBackMs), () {
      if (!mounted || generation != _resolveGeneration) return;
      setState(() {
        _flipped.clear();
        _resolving = false;
      });
    });
  }

  void _finish() {
    if (_completedCalled) return;
    _completedCalled = true;

    final seconds = ((DateTime.now().millisecondsSinceEpoch - _startedAt) / 1000)
        .round()
        .clamp(0, 86400)
        .toInt();
    final total = _pairs.length;
    const score = 100;

    widget.onFinished?.call({
      'score': score,
      'totalQuestions': total,
      'correctAnswers': total,
      'timeSpent': seconds,
      'interactionData': {
        'activityType': 'memory_flip',
        'engine': 'parameterized',
        'passingScore': _passingScore,
        'timeLimitSec': _timeLimitSec,
        'moves': _moves,
        'mismatches': _mismatches,
        'pairs': _pairs
            .map((pair) => {
                  'pairId': pair.id,
                  'label': pair.label,
                  'matched': _matched.contains(pair.id),
                })
            .toList(),
      },
    });

    setState(() {
      _finished = true;
    });
  }

  String _pairText(_Pair pair) =>
      pair.icon == null ? pair.label : '${pair.icon} ${pair.label}';

  Widget _cardFace(_Card card, bool faceUp) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      decoration: BoxDecoration(
        color: faceUp ? AppTheme.primaryColor.withValues(alpha: 0.14) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: faceUp
              ? AppTheme.primaryColor.withValues(alpha: 0.6)
              : const Color(0x33808080),
          width: faceUp ? 2 : 1.4,
        ),
      ),
      alignment: Alignment.center,
      padding: const EdgeInsets.all(4),
      child: Text(
        faceUp ? _pairText(card.pair) : '❓',
        textAlign: TextAlign.center,
        style: TextStyle(
          fontSize: faceUp ? 14 : 20,
          fontWeight: FontWeight.w800,
          color: faceUp ? AppTheme.textColor : AppTheme.textSecondary,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_rows < 2 || _cols < 2 || _deck.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.style_outlined, size: 48, color: AppTheme.textSecondary),
            const SizedBox(height: 12),
            const Text('暂无记忆翻牌题目'),
            const SizedBox(height: 12),
            FilledButton(onPressed: widget.onExit, child: const Text('返回')),
          ],
        ),
      );
    }

    if (_finished) {
      return GameCompletionScreen(
        title: widget.data['title']?.toString() ?? '记忆翻牌',
        score: _pairs.length,
        total: _pairs.length,
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
            widget.data['title']?.toString() ?? '记忆翻牌',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
          ),
          const SizedBox(height: 6),
          Text(
            (widget.data['prompt']?.toString().isNotEmpty == true)
                ? widget.data['prompt'].toString()
                : '翻两张卡片，找到一模一样的一对！',
            style: TextStyle(
              color: AppTheme.textSecondary,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '已配对 ${_matched.length} / ${_pairs.length} · 翻了 $_moves 次 · 建议在 $_timeLimitSec 秒内完成',
            style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
          ),
          const SizedBox(height: 12),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: _cols,
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              childAspectRatio: 0.95,
            ),
            itemCount: _deck.length,
            itemBuilder: (context, index) {
              final card = _deck[index];
              final faceUp =
                  _matched.contains(card.pairId) ||
                      _flipped.any((entry) => entry.key == card.key);
              return GestureDetector(
                onTap: () => _flip(card),
                child: _cardFace(card, faceUp),
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
