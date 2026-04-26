import 'dart:math';

import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import 'game_completion_screen.dart';

typedef GameFinishedCallback = void Function(Map<String, dynamic> result);

/// 连线题游戏：左右两列，点击建立连接，CustomPainter 绘制连线。
class ConnectionGame extends StatefulWidget {
  final Map<String, dynamic> data;
  final VoidCallback onExit;
  final GameFinishedCallback? onFinished;

  const ConnectionGame({
    super.key,
    required this.data,
    required this.onExit,
    this.onFinished,
  });

  @override
  State<ConnectionGame> createState() => _ConnectionGameState();
}

class _ConnectionGameState extends State<ConnectionGame> {
  List<_ConnectionItem> _leftItems = const [];
  List<_ConnectionItem> _rightItems = const [];
  List<_ConnectionPair> _correctPairs = const [];
  // 用户连线：leftId → rightId
  final Map<String, String> _userConnections = {};
  // 选中的左侧 ID
  String? _selectedLeftId;
  bool _submitted = false;
  bool _finished = false;
  int _correctCount = 0;

  final GlobalKey _paintKey = GlobalKey();

  @override
  void initState() {
    super.initState();
    _prepareGame();
  }

  void _prepareGame() {
    final leftItems = _parseItems(widget.data['leftItems'], 'l');
    final rightItems = _parseItems(widget.data['rightItems'], 'r');
    final rawConnections = widget.data['connections'];

    final correctPairs = <_ConnectionPair>[];
    if (rawConnections is List) {
      for (final raw in rawConnections) {
        if (raw is! Map) continue;
        final m = raw.map((k, v) => MapEntry(k.toString(), v));
        final left = m['left']?.toString();
        final right = m['right']?.toString();
        if (left != null && right != null) {
          correctPairs.add(_ConnectionPair(leftId: left, rightId: right));
        }
      }
    }

    // 打乱右侧顺序。
    final shuffledRight = [...rightItems]..shuffle(Random());

    setState(() {
      _leftItems = leftItems;
      _rightItems = shuffledRight;
      _correctPairs = correctPairs;
      _userConnections.clear();
      _selectedLeftId = null;
      _submitted = false;
      _finished = false;
      _correctCount = 0;
    });
  }

  List<_ConnectionItem> _parseItems(dynamic raw, String prefix) {
    if (raw is! List) return const [];
    final result = <_ConnectionItem>[];
    for (var i = 0; i < raw.length; i++) {
      final item = raw[i];
      if (item is! Map) continue;
      final m = item.map((k, v) => MapEntry(k.toString(), v));
      final id = m['id']?.toString() ?? '${prefix}_$i';
      final label = m['label']?.toString().trim() ?? '';
      final emoji = m['emoji']?.toString() ?? '';
      if (label.isEmpty && emoji.isEmpty) continue;
      result.add(_ConnectionItem(id: id, label: label, emoji: emoji));
    }
    return result;
  }

  void _tapLeft(String id) {
    if (_submitted) return;
    setState(() {
      _selectedLeftId = _selectedLeftId == id ? null : id;
    });
  }

  void _tapRight(String rightId) {
    if (_submitted) return;
    final leftId = _selectedLeftId;
    if (leftId == null) return;

    setState(() {
      // 移除该右侧已有的连线。
      _userConnections.removeWhere((_, v) => v == rightId);
      _userConnections[leftId] = rightId;
      _selectedLeftId = null;
    });
  }

  void _submit() {
    if (_submitted) return;
    var correct = 0;
    for (final pair in _correctPairs) {
      if (_userConnections[pair.leftId] == pair.rightId) correct++;
    }
    setState(() {
      _correctCount = correct;
      _submitted = true;
    });
  }

  void _finish() {
    final result = {
      'score': _correctCount,
      'totalQuestions': _correctPairs.length,
      'correctAnswers': _correctCount,
      'interactionData': {
        'userConnections': _userConnections,
      },
    };
    widget.onFinished?.call(result);
    setState(() => _finished = true);
  }

  bool _isCorrectConnection(String leftId, String rightId) {
    return _correctPairs.any((p) => p.leftId == leftId && p.rightId == rightId);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (_leftItems.isEmpty || _rightItems.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.link_off_rounded, size: 48, color: AppTheme.textSecondary),
            const SizedBox(height: 12),
            const Text('暂无连线题数据'),
            const SizedBox(height: 12),
            FilledButton(onPressed: widget.onExit, child: const Text('返回')),
          ],
        ),
      );
    }

    if (_finished) {
      return GameCompletionScreen(
        title: widget.data['title']?.toString() ?? '连线题游戏',
        score: _correctCount,
        total: _correctPairs.length,
        onPlayAgain: _prepareGame,
        onBack: widget.onExit,
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          widget.data['title']?.toString() ?? '连线题游戏',
          style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        Text(
          _submitted
              ? '得分：$_correctCount / ${_correctPairs.length}'
              : '先点左边，再点右边建立连线',
          style: theme.textTheme.bodyMedium?.copyWith(
            color: _submitted ? AppTheme.accentColor : AppTheme.textSecondary,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 12),
        Expanded(
          child: Stack(
            key: _paintKey,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: _buildColumn(_leftItems, isLeft: true)),
                  const SizedBox(width: 40),
                  Expanded(child: _buildColumn(_rightItems, isLeft: false)),
                ],
              ),
              // 连线绘制层。
              if (_userConnections.isNotEmpty)
                TweenAnimationBuilder<double>(
                  duration: const Duration(milliseconds: 260),
                  tween: Tween(begin: 0, end: 1),
                  builder: (context, progress, child) {
                    return CustomPaint(
                      size: Size.infinite,
                      painter: _ConnectionPainter(
                        progress: progress,
                        connections: Map<String, String>.from(_userConnections),
                        leftItems: _leftItems,
                        rightItems: _rightItems,
                        correctPairs: _correctPairs,
                        submitted: _submitted,
                      ),
                    );
                  },
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        if (!_submitted)
          SizedBox(
            height: 52,
            child: FilledButton.icon(
              onPressed: _userConnections.isEmpty ? null : _submit,
              icon: const Icon(Icons.checklist_rounded),
              label: const Text('提交连线'),
            ),
          ),
        if (_submitted)
          SizedBox(
            height: 52,
            child: FilledButton.icon(
              onPressed: _finish,
              icon: const Icon(Icons.emoji_events_rounded),
              label: const Text('查看结果'),
            ),
          ),
      ],
    );
  }

  Widget _buildColumn(List<_ConnectionItem> items, {required bool isLeft}) {
    return Column(
      children: items.asMap().entries.map((entry) {
        final item = entry.value;
        final isSelected = isLeft && _selectedLeftId == item.id;
        final isConnected = isLeft
            ? _userConnections.containsKey(item.id)
            : _userConnections.containsValue(item.id);

        Color borderColor;
        if (_submitted) {
          // 提交后：判断该项目的连线是否正确。
          if (isLeft) {
            final rightId = _userConnections[item.id];
            borderColor = rightId != null && _isCorrectConnection(item.id, rightId)
                ? AppTheme.accentColor
                : (rightId != null ? AppTheme.warningColor : Colors.grey.shade300);
          } else {
            final hasCorrect = _userConnections.entries
                .any((e) => e.value == item.id && _isCorrectConnection(e.key, e.value));
            borderColor = hasCorrect
                ? AppTheme.accentColor
                : (_userConnections.containsValue(item.id)
                    ? AppTheme.warningColor
                    : Colors.grey.shade300);
          }
        } else {
          borderColor = isSelected
              ? AppTheme.primaryColor
              : (isConnected ? AppTheme.secondaryColor : Colors.grey.shade300);
        }

        final bgColor = _submitted
            ? (borderColor == AppTheme.accentColor
                ? AppTheme.accentColor.withOpacity(0.12)
                : (borderColor == AppTheme.warningColor
                    ? AppTheme.warningColor.withOpacity(0.12)
                    : Colors.white))
            : (isSelected
                ? AppTheme.softBlue.withOpacity(0.25)
                : (isConnected ? AppTheme.softPink.withOpacity(0.18) : Colors.white));

        return GestureDetector(
          onTap: () => isLeft ? _tapLeft(item.id) : _tapRight(item.id),
          child: Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
            decoration: BoxDecoration(
              color: bgColor,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: borderColor, width: 2.2),
            ),
            child: Row(
              children: [
                if (item.emoji.isNotEmpty) ...[
                  Text(item.emoji, style: const TextStyle(fontSize: 22)),
                  const SizedBox(width: 8),
                ],
                Expanded(
                  child: Text(
                    item.label,
                    style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                ),
                if (_submitted)
                  Icon(
                    borderColor == AppTheme.accentColor
                        ? Icons.check_circle_rounded
                        : Icons.cancel_rounded,
                    color: borderColor,
                    size: 20,
                  ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }
}

/// CustomPainter：在左右两列之间绘制连线。
class _ConnectionPainter extends CustomPainter {
  final double progress;
  final Map<String, String> connections;
  final List<_ConnectionItem> leftItems;
  final List<_ConnectionItem> rightItems;
  final List<_ConnectionPair> correctPairs;
  final bool submitted;

  _ConnectionPainter({
    required this.progress,
    required this.connections,
    required this.leftItems,
    required this.rightItems,
    required this.correctPairs,
    required this.submitted,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;

    final leftWidth = size.width * 0.4;
    final rightStart = size.width * 0.6;
    final itemHeight = size.height / (leftItems.length > rightItems.length
        ? leftItems.length
        : rightItems.length);

    connections.forEach((leftId, rightId) {
      final leftIndex = leftItems.indexWhere((i) => i.id == leftId);
      final rightIndex = rightItems.indexWhere((i) => i.id == rightId);
      if (leftIndex < 0 || rightIndex < 0) return;

      final startX = leftWidth - 10;
      final startY = (leftIndex + 0.5) * itemHeight;
      final endX = rightStart + 10;
      final endY = (rightIndex + 0.5) * itemHeight;
      final animatedEndX = startX + (endX - startX) * progress;
      final animatedEndY = startY + (endY - startY) * progress;

      final isCorrect = correctPairs.any(
        (p) => p.leftId == leftId && p.rightId == rightId,
      );

      paint.color = submitted
          ? (isCorrect ? AppTheme.accentColor : AppTheme.warningColor)
          : AppTheme.secondaryColor.withOpacity(0.7);

      // 贝塞尔曲线连线。
      final path = Path();
      path.moveTo(startX, startY);
      final cp1x = startX + (animatedEndX - startX) * 0.35;
      final cp2x = startX + (animatedEndX - startX) * 0.65;
      path.cubicTo(cp1x, startY, cp2x, animatedEndY, animatedEndX, animatedEndY);
      canvas.drawPath(path, paint);
    });
  }

  @override
  bool shouldRepaint(covariant _ConnectionPainter oldDelegate) {
    if (oldDelegate.progress != progress) return true;
    if (oldDelegate.submitted != submitted) return true;
    if (oldDelegate.connections.length != connections.length) return true;
    for (final entry in connections.entries) {
      if (oldDelegate.connections[entry.key] != entry.value) return true;
    }
    return false;
  }
}

class _ConnectionItem {
  final String id;
  final String label;
  final String emoji;

  const _ConnectionItem({
    required this.id,
    required this.label,
    required this.emoji,
  });
}

class _ConnectionPair {
  final String leftId;
  final String rightId;

  const _ConnectionPair({
    required this.leftId,
    required this.rightId,
  });
}
