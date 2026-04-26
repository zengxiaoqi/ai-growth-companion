import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import 'game_completion_screen.dart';

typedef GameFinishedCallback = void Function(Map<String, dynamic> result);

/// 配对游戏：左右列选择配对，支持计时和得分。
class MatchingGame extends StatefulWidget {
  final Map<String, dynamic> data;
  final VoidCallback onExit;
  final GameFinishedCallback? onFinished;

  const MatchingGame({
    super.key,
    required this.data,
    required this.onExit,
    this.onFinished,
  });

  @override
  State<MatchingGame> createState() => _MatchingGameState();
}

class _MatchingGameState extends State<MatchingGame> {
  final Random _random = Random();

  List<_PairItem> _pairs = const [];
  List<_PairItem> _rightShuffled = const [];
  Set<String> _matchedIds = <String>{};

  String? _selectedLeftId;
  String? _selectedRightId;
  bool _isChecking = false;

  int _seconds = 0;
  int _score = 0;
  bool _finished = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _prepareGame();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _prepareGame() {
    final parsed = _parsePairs(widget.data);
    setState(() {
      _pairs = parsed;
      _rightShuffled = [...parsed]..shuffle(_random);
      _matchedIds = <String>{};
      _selectedLeftId = null;
      _selectedRightId = null;
      _isChecking = false;
      _seconds = 0;
      _score = 0;
      _finished = false;
    });

    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || _finished) return;
      setState(() => _seconds += 1);
    });
  }

  List<_PairItem> _parsePairs(Map<String, dynamic> data) {
    final pairs = data['pairs'];
    if (pairs is List) {
      return pairs
          .whereType<Map>()
          .map((e) => e.map((k, v) => MapEntry(k.toString(), v)))
          .where((e) => e['left'] != null && e['right'] != null)
          .map((e) {
        final id = e['id']?.toString();
        return _PairItem(
          id: (id == null || id.isEmpty)
              ? '${e['left']}_${e['right']}'
              : id,
          left: e['left'].toString(),
          right: e['right'].toString(),
        );
      }).toList();
    }

    // 兼容后端 game 接口返回的 items + targets 结构。
    final items = data['items'];
    final targets = data['targets'];
    if (items is List && targets is List) {
      final leftMap = <String, String>{};
      for (final raw in items) {
        if (raw is! Map) continue;
        final item = raw.map((k, v) => MapEntry(k.toString(), v));
        final id = item['id']?.toString();
        if (id == null || id.isEmpty) continue;
        leftMap[id] = item['name']?.toString() ?? item['char']?.toString() ?? '';
      }

      final result = <_PairItem>[];
      for (final raw in targets) {
        if (raw is! Map) continue;
        final target = raw.map((k, v) => MapEntry(k.toString(), v));
        final matchId = target['matchId']?.toString();
        if (matchId == null || matchId.isEmpty) continue;
        final left = leftMap[matchId] ?? '';
        final right = target['name']?.toString() ??
            target['word']?.toString() ??
            target['emoji']?.toString() ??
            '';
        if (left.isEmpty || right.isEmpty) continue;
        result.add(_PairItem(id: matchId, left: left, right: right));
      }

      return result;
    }

    return const [];
  }

  void _tapLeft(String id) {
    if (_matchedIds.contains(id) || _isChecking) return;
    setState(() {
      _selectedLeftId = id;
    });
    _checkPairIfReady();
  }

  void _tapRight(String id) {
    if (_matchedIds.contains(id) || _isChecking) return;
    setState(() {
      _selectedRightId = id;
    });
    _checkPairIfReady();
  }

  Future<void> _checkPairIfReady() async {
    if (_selectedLeftId == null || _selectedRightId == null || _isChecking) {
      return;
    }

    setState(() => _isChecking = true);

    final success = _selectedLeftId == _selectedRightId;

    if (success) {
      await Future<void>.delayed(const Duration(milliseconds: 220));
      if (!mounted) return;
      setState(() {
        _matchedIds = {..._matchedIds, _selectedLeftId!};
        _selectedLeftId = null;
        _selectedRightId = null;
        _isChecking = false;
        _score += 10;
      });

      if (_matchedIds.length == _pairs.length) {
        _finish();
      }
    } else {
      await Future<void>.delayed(const Duration(milliseconds: 500));
      if (!mounted) return;
      setState(() {
        _selectedLeftId = null;
        _selectedRightId = null;
        _isChecking = false;
        _score = max(0, _score - 2);
      });
    }
  }

  void _finish() {
    _timer?.cancel();
    final totalScore = _pairs.length * 10;
    final result = {
      'score': _score,
      'totalQuestions': totalScore,
      'correctAnswers': _matchedIds.length,
      'timeSpent': _seconds,
      'interactionData': {
        'matchedPairs': _matchedIds.length,
        'seconds': _seconds,
      },
    };

    widget.onFinished?.call(result);
    setState(() => _finished = true);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (_pairs.isEmpty) {
      return _MatchingEmptyState(
        message: '暂无配对题数据',
        onBack: widget.onExit,
      );
    }

    if (_finished) {
      return GameCompletionScreen(
        title: widget.data['title']?.toString() ?? '配对游戏',
        score: _score,
        total: _pairs.length * 10,
        onPlayAgain: _prepareGame,
        onBack: widget.onExit,
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          widget.data['title']?.toString() ?? '配对游戏',
          style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            boxShadow: AppTheme.softShadow(AppTheme.softOrange),
          ),
          child: Row(
            children: [
              const Icon(Icons.timer_rounded, color: AppTheme.warningColor),
              const SizedBox(width: 6),
              Text('$_seconds 秒'),
              const Spacer(),
              const Icon(Icons.star_rounded, color: Color(0xFFFFC928)),
              const SizedBox(width: 4),
              Text('$_score 分'),
              const SizedBox(width: 10),
              Text('${_matchedIds.length}/${_pairs.length} 组'),
            ],
          ),
        ),
        const SizedBox(height: 14),
        Expanded(
          child: Row(
            children: [
              Expanded(
                child: _buildColumn(
                  title: '左边',
                  items: _pairs,
                  onTap: _tapLeft,
                  selectedId: _selectedLeftId,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _buildColumn(
                  title: '右边',
                  items: _rightShuffled,
                  onTap: _tapRight,
                  selectedId: _selectedRightId,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildColumn({
    required String title,
    required List<_PairItem> items,
    required ValueChanged<String> onTap,
    required String? selectedId,
  }) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Text(
            title,
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: ListView.separated(
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final item = items[index];
                final isMatched = _matchedIds.contains(item.id);
                final selected = selectedId == item.id;

                final borderColor = isMatched
                    ? AppTheme.accentColor
                    : (selected ? AppTheme.primaryColor : Colors.grey.shade300);

                final bgColor = isMatched
                    ? AppTheme.accentColor.withOpacity(0.2)
                    : (selected
                        ? AppTheme.softPink.withOpacity(0.2)
                        : Colors.white);

                return AnimatedScale(
                  duration: const Duration(milliseconds: 180),
                  scale: selected ? 1.02 : 1,
                  child: Material(
                    color: bgColor,
                    borderRadius: BorderRadius.circular(12),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(12),
                      onTap: isMatched ? null : () => onTap(item.id),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 12,
                        ),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: borderColor, width: 2),
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(
                                title == '左边' ? item.left : item.right,
                                style: const TextStyle(fontWeight: FontWeight.w600),
                              ),
                            ),
                            if (isMatched)
                              const Icon(
                                Icons.check_circle_rounded,
                                color: AppTheme.accentColor,
                                size: 18,
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _PairItem {
  final String id;
  final String left;
  final String right;

  const _PairItem({
    required this.id,
    required this.left,
    required this.right,
  });
}

class _MatchingEmptyState extends StatelessWidget {
  final String message;
  final VoidCallback onBack;

  const _MatchingEmptyState({
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
            Icons.sentiment_neutral_rounded,
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
