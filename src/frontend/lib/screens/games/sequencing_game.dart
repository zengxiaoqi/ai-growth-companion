import 'dart:math';

import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import 'game_completion_screen.dart';

typedef GameFinishedCallback = void Function(Map<String, dynamic> result);

/// 排序题游戏：拖拽调整顺序，提交后展示正确顺序并计算得分。
class SequencingGame extends StatefulWidget {
  final Map<String, dynamic> data;
  final VoidCallback onExit;
  final GameFinishedCallback? onFinished;

  const SequencingGame({
    super.key,
    required this.data,
    required this.onExit,
    this.onFinished,
  });

  @override
  State<SequencingGame> createState() => _SequencingGameState();
}

class _SequencingGameState extends State<SequencingGame> {
  final Random _random = Random();

  List<_SequenceItem> _orderedItems = const [];
  List<_SequenceItem> _shuffledItems = const [];

  bool _submitted = false;
  bool _finished = false;
  int _correctCount = 0;

  @override
  void initState() {
    super.initState();
    _prepareGame();
  }

  void _prepareGame() {
    final parsed = _parseItems(widget.data);
    final shuffled = [...parsed]..shuffle(_random);

    setState(() {
      _orderedItems = parsed;
      _shuffledItems = shuffled;
      _submitted = false;
      _finished = false;
      _correctCount = 0;
    });
  }

  List<_SequenceItem> _parseItems(Map<String, dynamic> data) {
    final raw = data['items'];
    if (raw is! List) return const [];

    final parsed = raw
        .whereType<Map>()
        .map((item) => item.map((k, v) => MapEntry(k.toString(), v)))
        .where((item) => item['label'] != null)
        .toList();

    final normalized = <_SequenceItem>[];
    for (var i = 0; i < parsed.length; i++) {
      final item = parsed[i];
      final label = item['label']?.toString().trim() ?? '';
      if (label.isEmpty) continue;
      final id = item['id']?.toString().trim();
      final order = _toInt(item['order'], fallback: i + 1);

      normalized.add(
        _SequenceItem(
          id: (id == null || id.isEmpty) ? 's_${i + 1}' : id,
          label: label,
          order: order,
        ),
      );
    }

    normalized.sort((a, b) => a.order.compareTo(b.order));
    return normalized;
  }

  int _toInt(dynamic value, {int fallback = 0}) {
    final parsed = int.tryParse(value?.toString() ?? '');
    return parsed ?? fallback;
  }

  void _submitOrder() {
    if (_submitted) return;

    var correct = 0;
    for (var i = 0; i < _shuffledItems.length; i++) {
      if (_shuffledItems[i].order == i + 1) {
        correct += 1;
      }
    }

    setState(() {
      _correctCount = correct;
      _submitted = true;
    });
  }

  void _finish() {
    final result = {
      'score': _correctCount,
      'totalQuestions': _orderedItems.length,
      'correctAnswers': _correctCount,
      'interactionData': {
        'userOrder': _shuffledItems.map((item) => item.id).toList(),
      },
    };

    widget.onFinished?.call(result);
    setState(() => _finished = true);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (_orderedItems.isEmpty) {
      return _SequencingEmptyState(
        message: '暂无排序题数据',
        onBack: widget.onExit,
      );
    }

    if (_finished) {
      return GameCompletionScreen(
        title: widget.data['title']?.toString() ?? '排序题游戏',
        score: _correctCount,
        total: _orderedItems.length,
        onPlayAgain: _prepareGame,
        onBack: widget.onExit,
      );
    }

    if (_submitted) {
      return _buildReview(theme);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          widget.data['title']?.toString() ?? '排序题游戏',
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          '拖拽卡片调整顺序，完成后点击提交',
          style: theme.textTheme.bodyMedium?.copyWith(
            color: AppTheme.textSecondary,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 12),
        Expanded(
          child: Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              boxShadow: AppTheme.softShadow(AppTheme.softPurple),
            ),
            child: ReorderableListView.builder(
              buildDefaultDragHandles: false,
              itemCount: _shuffledItems.length,
              proxyDecorator: (child, index, animation) {
                return Material(
                  color: Colors.transparent,
                  child: AnimatedBuilder(
                    animation: animation,
                    builder: (context, _) {
                      final t = Curves.easeOut.transform(animation.value);
                      return Transform.scale(
                        scale: 1 + (0.03 * t),
                        child: child,
                      );
                    },
                  ),
                );
              },
              onReorder: (oldIndex, newIndex) {
                setState(() {
                  if (newIndex > oldIndex) newIndex -= 1;
                  final item = _shuffledItems.removeAt(oldIndex);
                  _shuffledItems.insert(newIndex, item);
                });
              },
              itemBuilder: (context, index) {
                final item = _shuffledItems[index];
                return Container(
                  key: ValueKey(item.id),
                  margin: const EdgeInsets.only(bottom: 8),
                  decoration: BoxDecoration(
                    color: AppTheme.softBlue.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: AppTheme.secondaryColor.withOpacity(0.35),
                      width: 1.6,
                    ),
                  ),
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    leading: CircleAvatar(
                      backgroundColor: AppTheme.primaryColor.withOpacity(0.14),
                      child: Text(
                        '${index + 1}',
                        style: const TextStyle(
                          color: AppTheme.primaryColor,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    title: Text(
                      item.label,
                      style: theme.textTheme.bodyLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    trailing: ReorderableDragStartListener(
                      index: index,
                      child: const Icon(
                        Icons.drag_handle_rounded,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 52,
          child: FilledButton.icon(
            onPressed: _submitOrder,
            icon: const Icon(Icons.checklist_rounded),
            label: const Text('提交顺序'),
          ),
        ),
      ],
    );
  }

  Widget _buildReview(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          widget.data['title']?.toString() ?? '排序题游戏',
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: AppTheme.softMint.withOpacity(0.25),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Text(
            '得分：$_correctCount / ${_orderedItems.length}',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        const SizedBox(height: 12),
        Expanded(
          child: Row(
            children: [
              Expanded(
                child: _OrderPanel(
                  title: '你的顺序',
                  items: _shuffledItems,
                  compareByPosition: true,
                  orderedItems: _orderedItems,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _OrderPanel(
                  title: '正确顺序',
                  items: _orderedItems,
                  compareByPosition: false,
                  orderedItems: _orderedItems,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
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
}

class _OrderPanel extends StatelessWidget {
  final String title;
  final List<_SequenceItem> items;
  final bool compareByPosition;
  final List<_SequenceItem> orderedItems;

  const _OrderPanel({
    required this.title,
    required this.items,
    required this.compareByPosition,
    required this.orderedItems,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: AppTheme.softShadow(AppTheme.softOrange),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: ListView.separated(
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final item = items[index];
                final isCorrect = compareByPosition
                    ? (index < orderedItems.length &&
                        orderedItems[index].id == item.id)
                    : true;

                return Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 10,
                  ),
                  decoration: BoxDecoration(
                    color: isCorrect
                        ? AppTheme.accentColor.withOpacity(0.14)
                        : AppTheme.warningColor.withOpacity(0.14),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color:
                          isCorrect ? AppTheme.accentColor : AppTheme.warningColor,
                      width: 1.6,
                    ),
                  ),
                  child: Row(
                    children: [
                      Text(
                        '${index + 1}.',
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          color: AppTheme.textColor,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          item.label,
                          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                fontWeight: FontWeight.w700,
                              ),
                        ),
                      ),
                      if (compareByPosition)
                        Icon(
                          isCorrect
                              ? Icons.check_circle_rounded
                              : Icons.cancel_rounded,
                          color: isCorrect
                              ? AppTheme.accentColor
                              : AppTheme.warningColor,
                          size: 20,
                        ),
                    ],
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

class _SequenceItem {
  final String id;
  final String label;
  final int order;

  const _SequenceItem({
    required this.id,
    required this.label,
    required this.order,
  });
}

class _SequencingEmptyState extends StatelessWidget {
  final String message;
  final VoidCallback onBack;

  const _SequencingEmptyState({
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
            Icons.sort_rounded,
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
