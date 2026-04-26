import 'dart:math';

import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import 'game_completion_screen.dart';

typedef GameFinishedCallback = void Function(Map<String, dynamic> result);

/// 拼图游戏：拖拽交换拼图块，完成拼合。
class PuzzleGame extends StatefulWidget {
  final Map<String, dynamic> data;
  final VoidCallback onExit;
  final GameFinishedCallback? onFinished;

  const PuzzleGame({
    super.key,
    required this.data,
    required this.onExit,
    this.onFinished,
  });

  @override
  State<PuzzleGame> createState() => _PuzzleGameState();
}

class _PuzzleGameState extends State<PuzzleGame> {
  int _rows = 2;
  int _cols = 2;
  List<_PuzzlePiece> _pieces = [];
  bool _finished = false;
  int _moves = 0;

  final Random _random = Random();

  @override
  void initState() {
    super.initState();
    _prepareGame();
  }

  void _prepareGame() {
    final gridSize = widget.data['gridSize'];
    if (gridSize is Map) {
      _rows = _toInt(gridSize['rows'], fallback: 2);
      _cols = _toInt(gridSize['cols'], fallback: 2);
    }
    _rows = _rows.clamp(2, 3);
    _cols = _cols.clamp(2, 3);

    final total = _rows * _cols;
    final rawPieces = widget.data['pieces'];
    final parsed = <_PuzzlePiece>[];

    if (rawPieces is List) {
      for (final raw in rawPieces) {
        if (raw is! Map) continue;
        final m = raw.map((k, v) => MapEntry(k.toString(), v));
        final id = m['id']?.toString() ?? '';
        final position = _toInt(m['position'], fallback: parsed.length);
        final label = m['label']?.toString() ?? '';
        final emoji = m['emoji']?.toString() ?? '';
        if (id.isEmpty) continue;
        parsed.add(_PuzzlePiece(
          id: id,
          correctPosition: position,
          currentPosition: position,
          label: label,
          emoji: emoji,
        ));
      }
    }

    // 如果没有数据，生成默认拼图块。
    if (parsed.isEmpty) {
      for (var i = 0; i < total; i++) {
        parsed.add(_PuzzlePiece(
          id: 'pz_$i',
          correctPosition: i,
          currentPosition: i,
          label: '${i + 1}',
          emoji: _emojiForIndex(i),
        ));
      }
    }

    // 打乱顺序。
    final shuffled = [...parsed];
    shuffled.shuffle(_random);
    // 确保打乱后不是原序。
    while (_isComplete(shuffled)) {
      shuffled.shuffle(_random);
    }
    for (var i = 0; i < shuffled.length; i++) {
      shuffled[i] = shuffled[i].copyWith(currentPosition: i);
    }

    setState(() {
      _pieces = shuffled;
      _finished = false;
      _moves = 0;
    });
  }

  bool _isComplete(List<_PuzzlePiece> pieces) {
    for (final p in pieces) {
      if (p.currentPosition != p.correctPosition) return false;
    }
    return true;
  }

  String _emojiForIndex(int i) {
    const emojis = ['🌟', '🌈', '🎨', '🎭', '🎪', '🎠', '🎡', '🎢', '🎯'];
    return emojis[i % emojis.length];
  }

  int _toInt(dynamic value, {int fallback = 0}) {
    final n = int.tryParse(value?.toString() ?? '');
    return n ?? fallback;
  }

  void _swapPieces(int pos1, int pos2) {
    if (pos1 == pos2) return;
    setState(() {
      final idx1 = _pieces.indexWhere((p) => p.currentPosition == pos1);
      final idx2 = _pieces.indexWhere((p) => p.currentPosition == pos2);
      if (idx1 >= 0 && idx2 >= 0) {
        _pieces[idx1] = _pieces[idx1].copyWith(currentPosition: pos2);
        _pieces[idx2] = _pieces[idx2].copyWith(currentPosition: pos1);
        _moves++;
      }
      if (_isComplete(_pieces)) {
        _finish();
      }
    });
  }

  void _finish() {
    final result = {
      'score': _moves <= _pieces.length ? _pieces.length : _pieces.length - (_moves - _pieces.length),
      'totalQuestions': _pieces.length,
      'correctAnswers': _pieces.length,
      'interactionData': {
        'moves': _moves,
      },
    };
    widget.onFinished?.call(result);
    setState(() => _finished = true);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (_pieces.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.extension_rounded, size: 48, color: AppTheme.textSecondary),
            const SizedBox(height: 12),
            const Text('暂无拼图数据'),
            const SizedBox(height: 12),
            FilledButton(onPressed: widget.onExit, child: const Text('返回')),
          ],
        ),
      );
    }

    if (_finished) {
      return GameCompletionScreen(
        title: widget.data['title']?.toString() ?? '拼图游戏',
        score: _pieces.length,
        total: _pieces.length,
        onPlayAgain: _prepareGame,
        onBack: widget.onExit,
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          widget.data['title']?.toString() ?? '拼图游戏',
          style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              '拖拽交换拼图块',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppTheme.textSecondary,
                fontWeight: FontWeight.w600,
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: AppTheme.softPurple.withOpacity(0.2),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                '步数：$_moves',
                style: theme.textTheme.bodySmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: AppTheme.primaryColor,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        Expanded(
          child: Center(
            child: AspectRatio(
              aspectRatio: _cols / _rows,
              child: _PuzzleGrid(
                rows: _rows,
                cols: _cols,
                pieces: _pieces,
                onSwap: _swapPieces,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _PuzzleGrid extends StatefulWidget {
  final int rows;
  final int cols;
  final List<_PuzzlePiece> pieces;
  final void Function(int, int) onSwap;

  const _PuzzleGrid({
    required this.rows,
    required this.cols,
    required this.pieces,
    required this.onSwap,
  });

  @override
  State<_PuzzleGrid> createState() => _PuzzleGridState();
}

class _PuzzleGridState extends State<_PuzzleGrid> {
  int? _draggingPos;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: widget.cols,
        mainAxisSpacing: 4,
        crossAxisSpacing: 4,
      ),
      itemCount: widget.rows * widget.cols,
      itemBuilder: (context, index) {
        final piece = widget.pieces.firstWhere(
          (p) => p.currentPosition == index,
          orElse: () => widget.pieces.first,
        );
        final isCorrect = piece.currentPosition == piece.correctPosition;

        return DragTarget<_PuzzlePiece>(
          onWillAcceptWithDetails: (_) => true,
          onAcceptWithDetails: (details) {
            widget.onSwap(_draggingPos ?? -1, index);
            _draggingPos = null;
          },
          builder: (context, candidate, rejected) {
            return Draggable<_PuzzlePiece>(
              data: piece,
              feedback: Material(
                elevation: 8,
                borderRadius: BorderRadius.circular(12),
                child: _buildPieceTile(piece, isCorrect, dragging: true),
              ),
              childWhenDragging: Opacity(
                opacity: 0.3,
                child: _buildPieceTile(piece, isCorrect),
              ),
              onDragStarted: () => _draggingPos = piece.currentPosition,
              child: _buildPieceTile(piece, isCorrect),
            );
          },
        );
      },
    );
  }

  Widget _buildPieceTile(_PuzzlePiece piece, bool isCorrect, {bool dragging = false}) {
    final theme = Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        color: isCorrect
            ? AppTheme.accentColor.withOpacity(0.15)
            : Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isCorrect
              ? AppTheme.accentColor
              : AppTheme.secondaryColor.withOpacity(0.3),
          width: 2,
        ),
        boxShadow: dragging
            ? AppTheme.softShadow(AppTheme.primaryColor)
            : [],
      ),
      child: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (piece.emoji.isNotEmpty)
              Text(piece.emoji, style: const TextStyle(fontSize: 32)),
            const SizedBox(height: 4),
            Text(
              piece.label,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: AppTheme.textColor,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PuzzlePiece {
  final String id;
  final int correctPosition;
  final int currentPosition;
  final String label;
  final String emoji;

  const _PuzzlePiece({
    required this.id,
    required this.correctPosition,
    required this.currentPosition,
    required this.label,
    required this.emoji,
  });

  _PuzzlePiece copyWith({
    String? id,
    int? correctPosition,
    int? currentPosition,
    String? label,
    String? emoji,
  }) {
    return _PuzzlePiece(
      id: id ?? this.id,
      correctPosition: correctPosition ?? this.correctPosition,
      currentPosition: currentPosition ?? this.currentPosition,
      label: label ?? this.label,
      emoji: emoji ?? this.emoji,
    );
  }
}
