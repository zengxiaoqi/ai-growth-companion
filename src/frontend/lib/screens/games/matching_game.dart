import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import 'game_completion_screen.dart';
import 'game_tts_helper.dart';

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

class _MatchingGameState extends State<MatchingGame>
    with GameTtsHelper, TickerProviderStateMixin {
  final Random _random = Random();

  List<_PairItem> _pairs = const [];
  List<_PairItem> _rightShuffled = const [];
  Set<String> _matchedIds = <String>{};

  String? _selectedLeftId;
  String? _selectedRightId;
  bool _isChecking = false;
  // 错误闪烁动画
  bool _flashError = false;

  int _seconds = 0;
  int _score = 0;
  bool _finished = false;
  Timer? _timer;

  // 入场动画
  late final AnimationController _introController;

  @override
  void initState() {
    super.initState();
    _introController = AnimationController(
      duration: const Duration(milliseconds: 600),
      vsync: this,
    );
    _prepareGame();
  }

  @override
  void dispose() {
    disposeTts();
    _timer?.cancel();
    _introController.dispose();
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
      _flashError = false;
      _seconds = 0;
      _score = 0;
      _finished = false;
    });

    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || _finished) return;
      setState(() => _seconds += 1);
    });

    _introController.forward(from: 0);
    speak('配对游戏，请把左边和右边对应的项连起来');
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
      final leftItem = _pairs.firstWhere((p) => p.id == _selectedLeftId);
      await Future<void>.delayed(const Duration(milliseconds: 220));
      if (!mounted) return;
      if (ttsEnabled) {
        speak('${leftItem.left}配${leftItem.right}');
      }
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
      speak('不对哦，再试一次');
      // 错误闪烁
      setState(() => _flashError = true);
      await Future<void>.delayed(const Duration(milliseconds: 500));
      if (!mounted) return;
      setState(() {
        _flashError = false;
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
        Row(
          children: [
            Expanded(
              child: Text(
                widget.data['title']?.toString() ?? '配对游戏',
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            buildTtsToggleButton(),
          ],
        ),
        const SizedBox(height: 12),
        _buildStatusBar(),
        const SizedBox(height: 14),
        Expanded(
          child: Row(
            children: [
              Expanded(
                child: _buildColumn(
                  title: widget.data['leftTitle']?.toString() ?? '左列',
                  accentColor: const Color(0xFF5AB0D9),
                  items: _pairs,
                  onTap: _tapLeft,
                  selectedId: _selectedLeftId,
                  isLeft: true,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _buildColumn(
                  title: widget.data['rightTitle']?.toString() ?? '右列',
                  accentColor: const Color(0xFFFF7E5F),
                  items: _rightShuffled,
                  onTap: _tapRight,
                  selectedId: _selectedRightId,
                  isLeft: false,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildStatusBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Colors.white, Color(0xFFFFFAF0)],
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: AppTheme.softShadow(AppTheme.softOrange),
      ),
      child: Row(
        children: [
          // 时间
          _StatusPill(
            icon: Icons.timer_rounded,
            value: '${_seconds}s',
            color: AppTheme.warningColor,
          ),
          const SizedBox(width: 10),
          // 进度
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                minHeight: 12,
                value: _pairs.isEmpty ? 0 : _matchedIds.length / _pairs.length,
                backgroundColor: AppTheme.accentColor.withValues(alpha: 0.15),
                color: AppTheme.accentColor,
              ),
            ),
          ),
          const SizedBox(width: 10),
          // 得分
          _StatusPill(
            icon: Icons.star_rounded,
            value: '$_score',
            color: const Color(0xFFFFB300),
          ),
          const SizedBox(width: 8),
          Text(
            '${_matchedIds.length}/${_pairs.length}',
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: AppTheme.accentColor,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildColumn({
    required String title,
    required Color accentColor,
    required List<_PairItem> items,
    required ValueChanged<String> onTap,
    required String? selectedId,
    required bool isLeft,
  }) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Colors.white, Color(0xFFF9FBFD)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: AppTheme.subtleShadow(accentColor),
      ),
      child: Column(
        children: [
          // 列标题
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  accentColor.withValues(alpha: 0.2),
                  accentColor.withValues(alpha: 0.08),
                ],
              ),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: accentColor.withValues(alpha: 0.3),
                width: 1,
              ),
            ),
            child: Text(
              title,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontWeight: FontWeight.bold,
                color: accentColor,
                fontSize: 15,
              ),
            ),
          ),
          const SizedBox(height: 10),
          Expanded(
            child: ListView.separated(
              physics: const BouncingScrollPhysics(),
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final item = items[index];
                final isMatched = _matchedIds.contains(item.id);
                final selected = selectedId == item.id;

                // 入场动画
                final anim = Tween<double>(begin: 0, end: 1).animate(
                  CurvedAnimation(
                    parent: _introController,
                    curve: Interval(
                      (index * 0.08).clamp(0.0, 0.6),
                      ((index * 0.08) + 0.4).clamp(0.0, 1.0),
                      curve: Curves.easeOutCubic,
                    ),
                  ),
                );

                return AnimatedBuilder(
                  animation: anim,
                  builder: (context, child) {
                    return Opacity(
                      opacity: anim.value,
                      child: Transform.translate(
                        offset: Offset(
                          isLeft ? -30 * (1 - anim.value) : 30 * (1 - anim.value),
                          0,
                        ),
                        child: child,
                      ),
                    );
                  },
                  child: _PairCard(
                    label: isLeft ? item.left : item.right,
                    accentColor: accentColor,
                    selected: selected,
                    matched: isMatched,
                    flashError: _flashError && (selected),
                    isChecking: _isChecking,
                    onTap: (isMatched || _isChecking) ? null : () => onTap(item.id),
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

// ==================== 子组件 ====================

class _StatusPill extends StatelessWidget {
  final IconData icon;
  final String value;
  final Color color;

  const _StatusPill({
    required this.icon,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(icon, color: color, size: 18),
          const SizedBox(width: 4),
          Text(
            value,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

class _PairCard extends StatefulWidget {
  final String label;
  final Color accentColor;
  final bool selected;
  final bool matched;
  final bool flashError;
  final bool isChecking;
  final VoidCallback? onTap;

  const _PairCard({
    required this.label,
    required this.accentColor,
    required this.selected,
    required this.matched,
    required this.flashError,
    required this.isChecking,
    required this.onTap,
  });

  @override
  State<_PairCard> createState() => _PairCardState();
}

class _PairCardState extends State<_PairCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pressController;

  @override
  void initState() {
    super.initState();
    _pressController = AnimationController(
      duration: const Duration(milliseconds: 130),
      vsync: this,
    );
  }

  @override
  void dispose() {
    _pressController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final borderColor = widget.matched
        ? AppTheme.accentColor
        : (widget.flashError
            ? const Color(0xFFFF5252)
            : (widget.selected ? widget.accentColor : Colors.grey.shade300));

    final bgColor = widget.matched
        ? AppTheme.accentColor.withValues(alpha: 0.18)
        : (widget.flashError
            ? const Color(0xFFFF5252).withValues(alpha: 0.15)
            : (widget.selected
                ? widget.accentColor.withValues(alpha: 0.15)
                : Colors.white));

    return GestureDetector(
      onTapDown: widget.onTap == null
          ? null
          : (_) => _pressController.forward(),
      onTapUp: widget.onTap == null
          ? null
          : (_) {
              _pressController.reverse();
              widget.onTap!();
            },
      onTapCancel: () => _pressController.reverse(),
      child: AnimatedBuilder(
        animation: _pressController,
        builder: (context, child) {
          return Transform.scale(
            scale: 1.0 - 0.04 * _pressController.value,
            child: child,
          );
        },
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
          decoration: BoxDecoration(
            color: bgColor,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: borderColor,
              width: widget.selected || widget.matched || widget.flashError
                  ? 2.5
                  : 1.5,
            ),
            boxShadow: widget.selected
                ? [
                    BoxShadow(
                      color: widget.accentColor.withValues(alpha: 0.3),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    ),
                  ]
                : null,
          ),
          child: Row(
            children: [
              // 序号圆点 / 完成标记
              _LeadingBadge(
                matched: widget.matched,
                selected: widget.selected,
                accentColor: widget.accentColor,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  widget.label,
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 15,
                    color: widget.matched
                        ? AppTheme.accentColor
                        : (widget.selected
                            ? widget.accentColor
                            : AppTheme.textColor),
                    decoration:
                        widget.matched ? TextDecoration.lineThrough : null,
                    decorationColor: AppTheme.accentColor,
                    decorationThickness: 2,
                  ),
                ),
              ),
              if (widget.matched)
                Container(
                  padding: const EdgeInsets.all(3),
                  decoration: const BoxDecoration(
                    color: AppTheme.accentColor,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.check_rounded,
                      color: Colors.white, size: 14),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LeadingBadge extends StatelessWidget {
  final bool matched;
  final bool selected;
  final Color accentColor;

  const _LeadingBadge({
    required this.matched,
    required this.selected,
    required this.accentColor,
  });

  @override
  Widget build(BuildContext context) {
    if (matched) {
      return Container(
        width: 24,
        height: 24,
        decoration: const BoxDecoration(
          color: AppTheme.accentColor,
          shape: BoxShape.circle,
        ),
        alignment: Alignment.center,
        child: const Icon(Icons.check_rounded,
            color: Colors.white, size: 16),
      );
    }
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      width: 24,
      height: 24,
      decoration: BoxDecoration(
        color: selected
            ? accentColor.withValues(alpha: 0.2)
            : Colors.grey.shade100,
        shape: BoxShape.circle,
        border: Border.all(
          color: selected ? accentColor : Colors.grey.shade300,
          width: selected ? 2 : 1,
        ),
      ),
      alignment: Alignment.center,
      child: selected
          ? Icon(Icons.radio_button_checked_rounded,
              color: accentColor, size: 16)
          : Icon(Icons.radio_button_unchecked_rounded,
              color: Colors.grey.shade400, size: 16),
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