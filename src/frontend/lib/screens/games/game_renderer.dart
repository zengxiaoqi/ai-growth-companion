import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import 'connection_game.dart';
import 'drag_sort_game.dart';
import 'fill_blank_game.dart';
import 'matching_game.dart';
import 'memory_flip_game.dart';
import 'puzzle_game.dart';
import 'quiz_game.dart';
import 'sequencing_game.dart';
import 'true_false_game.dart';

/// 游戏渲染器：根据类型分发到具体游戏组件，并负责数据加载与归一化。
class GameRenderer extends StatefulWidget {
  final String? activityType;
  final Map<String, dynamic>? initialData;
  final String? gameId;
  final int difficulty;
  final VoidCallback onExit;
  final ValueChanged<Map<String, dynamic>>? onCompleted;

  const GameRenderer({
    super.key,
    this.activityType,
    this.initialData,
    this.gameId,
    this.difficulty = 1,
    required this.onExit,
    this.onCompleted,
  });

  @override
  State<GameRenderer> createState() => _GameRendererState();
}

class _GameRendererState extends State<GameRenderer> {
  bool _isLoading = false;
  String? _error;
  String _resolvedType = 'quiz';
  Map<String, dynamic> _resolvedData = const {};

  @override
  void initState() {
    super.initState();
    _loadGameData();
  }

  Future<void> _loadGameData() async {
    final hasLocalData = (widget.initialData ?? {}).isNotEmpty;

    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      Map<String, dynamic> rawData = {
        ...(widget.initialData ?? const <String, dynamic>{}),
      };

      if (!hasLocalData && widget.gameId != null && widget.gameId!.isNotEmpty) {
        final api = context.read<ApiService>();
        final remote = await api.getGameData(
          gameId: widget.gameId!,
          difficulty: widget.difficulty,
        );
        if (remote != null) rawData = remote;
      }

      final type = _normalizeGameType(widget.activityType, rawData);
      final data = _normalizeActivityData(type, rawData);

      if (!mounted) return;
      setState(() {
        _resolvedType = type;
        _resolvedData = data;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '游戏加载失败：$e';
      });
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  String _normalizeGameType(String? activityType, Map<String, dynamic> rawData) {
    const types = {
      'quiz', 'true_false', 'matching',
      'fill_blank', 'sequencing', 'connection', 'puzzle', 'drag_sort',
      'memory_flip',
    };

    final candidate = activityType?.trim();
    if (candidate != null && types.contains(candidate)) return candidate;

    final innerType = rawData['activityType']?.toString().trim();
    if (innerType != null && types.contains(innerType)) return innerType;

    final gameType = rawData['gameType']?.toString().trim();
    if (gameType == 'match') return 'matching';
    if (gameType == 'true_false') return 'true_false';
    if (gameType == 'fill_blank') return 'fill_blank';
    if (gameType == 'sequence' || gameType == 'sequencing') return 'sequencing';
    if (gameType == 'connect' || gameType == 'connection') return 'connection';
    if (gameType == 'puzzle') return 'puzzle';
    if (gameType == 'drag_sort' || gameType == 'sort' || gameType == 'classify') {
      return 'drag_sort';
    }
    if (gameType == 'memory_flip' || gameType == 'memory') {
      return 'memory_flip';
    }
    if (gameType == 'quiz' || gameType == 'count' || gameType == 'riddle') {
      return 'quiz';
    }

    // 根据数据结构推断类型。
    // drag_sort 同样带 items，必须先于 items -> sequencing 判断，否则被误判。
    if (rawData['buckets'] is List && rawData['items'] is List) {
      return 'drag_sort';
    }
    // memory_flip 同样带 pairs，必须先于 pairs -> matching 判断，否则被误判。
    if (rawData['pairs'] is List && rawData['gridSize'] is Map) {
      return 'memory_flip';
    }
    if (rawData['pairs'] is List ||
        (rawData['items'] is List && rawData['targets'] is List)) {
      return 'matching';
    }
    if (rawData['sentences'] is List) return 'fill_blank';
    if (rawData['connections'] is List ||
        (rawData['leftItems'] is List && rawData['rightItems'] is List)) {
      return 'connection';
    }
    if (rawData['pieces'] is List || rawData['gridSize'] is Map) return 'puzzle';
    if (rawData['items'] is List) return 'sequencing';
    if (rawData['statements'] is List) return 'true_false';
    if (rawData['questions'] is List) return 'quiz';

    return 'quiz';
  }

  Map<String, dynamic> _normalizeActivityData(
    String type,
    Map<String, dynamic> rawData,
  ) {
    final title = (rawData['title']?.toString().trim().isNotEmpty ?? false)
        ? rawData['title'].toString()
        : '互动练习';

    final base = <String, dynamic>{
      ...rawData,
      'type': type,
      'title': title,
    };

    if (type == 'drag_sort') {
      return _normalizeDragSortData(base, rawData);
    }

    if (type == 'memory_flip') {
      return _normalizeMemoryFlipData(base, rawData);
    }

    if (type == 'matching') {
      if (rawData['pairs'] is List) {
        return base;
      }

      // 将 items + targets 转换为 pairs。
      final items = rawData['items'];
      final targets = rawData['targets'];
      if (items is List && targets is List) {
        final leftMap = <String, String>{};
        for (final raw in items) {
          if (raw is! Map) continue;
          final item = raw.map((k, v) => MapEntry(k.toString(), v));
          final id = item['id']?.toString();
          if (id == null || id.isEmpty) continue;
          leftMap[id] = item['name']?.toString() ?? item['char']?.toString() ?? '';
        }

        final pairs = <Map<String, dynamic>>[];
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

          pairs.add({
            'id': matchId,
            'left': left,
            'right': right,
          });
        }

        return {
          ...base,
          'pairs': pairs,
        };
      }
    }

    if (type == 'quiz') {
      final rawQuestions = rawData['questions'];
      if (rawQuestions is List) {
        final questions = rawQuestions
            .whereType<Map>()
            .map((e) => e.map((k, v) => MapEntry(k.toString(), v)))
            .where((q) => q['question'] != null && q['options'] is List)
            .map((q) {
          final options = (q['options'] as List)
              .map((e) => e.toString().trim())
              .where((e) => e.isNotEmpty)
              .toList();

          var correctIndex = _toInt(q['correctIndex'] ?? q['correctAnswer']);
          if (correctIndex < 0 || correctIndex >= options.length) {
            final oneBased = correctIndex - 1;
            correctIndex =
                (oneBased >= 0 && oneBased < options.length) ? oneBased : 0;
          }

          return {
            ...q,
            'options': options,
            'correctIndex': correctIndex,
          };
        }).toList();

        return {
          ...base,
          'questions': questions,
        };
      }
    }

    if (type == 'fill_blank') {
      final rawSentences = rawData['sentences'];
      if (rawSentences is List) {
        final sentences = rawSentences
            .whereType<Map>()
            .map((e) => e.map((k, v) => MapEntry(k.toString(), v)))
            .where((s) => s['text'] != null && s['answer'] != null)
            .map((s) {
          final optionsRaw = s['options'];
          final options = optionsRaw is List
              ? optionsRaw
                  .map((e) => e.toString().trim())
                  .where((e) => e.isNotEmpty)
                  .toList()
              : <String>[];

          final answer = s['answer'].toString().trim();
          if (answer.isNotEmpty && !options.contains(answer)) {
            options.add(answer);
          }

          return {
            ...s,
            'text': s['text'].toString(),
            'answer': answer,
            'hint': s['hint']?.toString(),
            'options': options,
          };
        }).toList();

        return {
          ...base,
          'sentences': sentences,
        };
      }
    }

    if (type == 'sequencing') {
      final rawItems = rawData['items'];
      if (rawItems is List) {
        final items = rawItems
            .whereType<Map>()
            .map((e) => e.map((k, v) => MapEntry(k.toString(), v)))
            .where((item) => item['label'] != null)
            .map((item) {
          final id = item['id']?.toString();
          final label = item['label']?.toString().trim() ?? '';
          final order = _toInt(item['order'] ?? item['position'] ?? item['index']);
          return {
            ...item,
            'id': (id == null || id.isEmpty) ? label : id,
            'label': label,
            'order': order <= 0 ? 1 : order,
          };
        }).where((item) => (item['label'] as String).isNotEmpty).toList()
          ..sort((a, b) =>
              (a['order'] as int).compareTo(b['order'] as int));

        for (var i = 0; i < items.length; i++) {
          items[i]['order'] = i + 1;
          final id = items[i]['id']?.toString().trim();
          if (id == null || id.isEmpty) {
            items[i]['id'] = 's_${i + 1}';
          }
        }

        return {
          ...base,
          'items': items,
        };
      }
    }

    if (type == 'connection') {
      final rawLeft = rawData['leftItems'];
      final rawRight = rawData['rightItems'];
      final rawConnections = rawData['connections'];
      if (rawLeft is List && rawRight is List && rawConnections is List) {
        final leftItems = rawLeft
            .whereType<Map>()
            .map((e) => e.map((k, v) => MapEntry(k.toString(), v)))
            .where((item) => item['id'] != null && item['label'] != null)
            .map((item) => {
                  ...item,
                  'id': item['id'].toString(),
                  'label': item['label'].toString(),
                  'emoji': item['emoji']?.toString(),
                })
            .toList();

        final rightItems = rawRight
            .whereType<Map>()
            .map((e) => e.map((k, v) => MapEntry(k.toString(), v)))
            .where((item) => item['id'] != null && item['label'] != null)
            .map((item) => {
                  ...item,
                  'id': item['id'].toString(),
                  'label': item['label'].toString(),
                })
            .toList();

        final leftIds = leftItems.map((e) => e['id']).toSet();
        final rightIds = rightItems.map((e) => e['id']).toSet();
        final connections = rawConnections
            .whereType<Map>()
            .map((e) => e.map((k, v) => MapEntry(k.toString(), v)))
            .where((pair) => pair['left'] != null && pair['right'] != null)
            .map((pair) => {
                  ...pair,
                  'left': pair['left'].toString(),
                  'right': pair['right'].toString(),
                })
            .where((pair) =>
                leftIds.contains(pair['left']) && rightIds.contains(pair['right']))
            .toList();

        return {
          ...base,
          'leftItems': leftItems,
          'rightItems': rightItems,
          'connections': connections,
        };
      }
    }

    if (type == 'puzzle') {
      final rawPieces = rawData['pieces'];
      final gridRaw = rawData['gridSize'];

      final rows = _toInt(gridRaw is Map ? gridRaw['rows'] : null)
          .clamp(2, 3)
          .toInt();
      final cols = _toInt(gridRaw is Map ? gridRaw['cols'] : null)
          .clamp(2, 3)
          .toInt();
      final total = rows * cols;

      if (rawPieces is List) {
        final pieces = rawPieces
            .whereType<Map>()
            .map((e) => e.map((k, v) => MapEntry(k.toString(), v)))
            .where((piece) => piece['id'] != null)
            .map((piece) => {
                  ...piece,
                  'id': piece['id'].toString(),
                  'position': _toInt(piece['position']),
                  'label': piece['label']?.toString() ?? '拼图块',
                  'emoji': piece['emoji']?.toString() ?? '🧩',
                })
            .toList()
          ..sort((a, b) =>
              (a['position'] as int).compareTo(b['position'] as int));

        for (var i = 0; i < pieces.length; i++) {
          pieces[i]['position'] = i;
          if ((pieces[i]['label']?.toString().trim().isEmpty ?? true)) {
            pieces[i]['label'] = '拼图块${i + 1}';
          }
        }

        return {
          ...base,
          'pieces': pieces.take(total).toList(),
          'gridSize': {'rows': rows, 'cols': cols},
        };
      }
    }

    return base;
  }

  /// 参数化题型 drag_sort 的防御式归一化，与 Web normalizer / 后端
  /// sanitizeDragSortParams 保持同一套边界与计分语义。
  Map<String, dynamic> _normalizeDragSortData(
    Map<String, dynamic> base,
    Map<String, dynamic> rawData,
  ) {
    const int maxBuckets = 4;
    const int maxItems = 12;
    const int maxLabel = 16;
    const int maxIcon = 8;

    String text(dynamic value) {
      if (value == null) return '';
      return value.toString().replaceAll(RegExp(r'\s+'), ' ').trim();
    }

    String clip(String value, int max) => value.runes.length <= max
        ? value
        : String.fromCharCodes(value.runes.take(max));

    String safeId(dynamic value) =>
        clip(text(value).replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), ''), 32);

    int intOr(dynamic value, int fallback) {
      if (value == null) return fallback;
      final n = num.tryParse(value.toString());
      return (n == null || !n.isFinite) ? fallback : n.truncate();
    }

    final usedBucketIds = <String>{};
    final buckets = <Map<String, dynamic>>[];
    final rawBuckets = rawData['buckets'];
    if (rawBuckets is List) {
      for (var i = 0; i < rawBuckets.length && buckets.length < maxBuckets; i++) {
        final entry = rawBuckets[i];
        if (entry is! Map) continue;
        final map = entry.map((k, v) => MapEntry(k.toString(), v));
        final label = clip(text(map['label']), maxLabel);
        if (label.isEmpty) continue;

        var id = safeId(map['id']);
        if (id.isEmpty) id = 'b${i + 1}';
        var suffix = 2;
        while (usedBucketIds.contains(id)) {
          id = 'b${i + 1}_${suffix++}';
        }
        usedBucketIds.add(id);

        final icon = clip(text(map['icon']), maxIcon);
        buckets.add({
          'id': id,
          'label': label,
          if (icon.isNotEmpty) 'icon': icon,
        });
      }
    }

    final usedItemIds = <String>{};
    final items = <Map<String, dynamic>>[];
    final rawItems = rawData['items'];
    if (rawItems is List) {
      for (var i = 0; i < rawItems.length && items.length < maxItems; i++) {
        final entry = rawItems[i];
        if (entry is! Map) continue;
        final map = entry.map((k, v) => MapEntry(k.toString(), v));
        final label = clip(text(map['label']), maxLabel);
        final bucketId = safeId(map['bucketId']);
        if (label.isEmpty || !usedBucketIds.contains(bucketId)) continue;

        var id = safeId(map['id']);
        if (id.isEmpty) id = 'i${i + 1}';
        var suffix = 2;
        while (usedItemIds.contains(id)) {
          id = 'i${i + 1}_${suffix++}';
        }
        usedItemIds.add(id);

        final icon = clip(text(map['icon']), maxIcon);
        items.add({
          'id': id,
          'label': label,
          'bucketId': bucketId,
          if (icon.isNotEmpty) 'icon': icon,
        });
      }
    }

    return {
      ...base,
      'buckets': buckets,
      'items': items,
      'prompt': clip(text(rawData['prompt']), 60),
      'passingScore': intOr(rawData['passingScore'], 80).clamp(0, 100).toInt(),
      'timeLimitSec': intOr(rawData['timeLimitSec'], 120).clamp(30, 300).toInt(),
    };
  }

  /// 参数化题型 memory_flip 的防御式归一化，与 Web normalizer /
  /// 后端 sanitizeMemoryFlipParams 保持同一套边界与计分语义。
  /// 只接受 2/3/4/6/8 对；非法对数直接清空（渲染端会显示空状态）。
  Map<String, dynamic> _normalizeMemoryFlipData(
    Map<String, dynamic> base,
    Map<String, dynamic> rawData,
  ) {
    const int maxPairs = 8;
    const int maxLabel = 12;
    const int maxIcon = 8;
    const Map<int, List<int>> pairGrid = {
      2: [2, 2],
      3: [2, 3],
      4: [2, 4],
      6: [3, 4],
      8: [4, 4],
    };

    String text(dynamic value) {
      if (value == null) return '';
      return value.toString().replaceAll(RegExp(r'\s+'), ' ').trim();
    }

    String clip(String value, int max) => value.runes.length <= max
        ? value
        : String.fromCharCodes(value.runes.take(max));

    String safeId(dynamic value) =>
        clip(text(value).replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), ''), 32);

    int intOr(dynamic value, int fallback) {
      if (value == null) return fallback;
      final n = num.tryParse(value.toString());
      return (n == null || !n.isFinite) ? fallback : n.truncate();
    }

    final usedPairIds = <String>{};
    final usedFaces = <String>{};
    final pairs = <Map<String, dynamic>>[];
    final rawPairs = rawData['pairs'];
    if (rawPairs is List) {
      for (var i = 0; i < rawPairs.length && pairs.length < maxPairs; i++) {
        final entry = rawPairs[i];
        if (entry is! Map) continue;
        final map = entry.map((k, v) => MapEntry(k.toString(), v));
        final label = clip(text(map['label']), maxLabel);
        if (label.isEmpty) continue;

        final icon = clip(text(map['icon']), maxIcon);
        // 两对牌面完全一致会让配对产生歧义，丢弃后到的一对。
        final face = '$label|$icon';
        if (usedFaces.contains(face)) continue;
        usedFaces.add(face);

        var id = safeId(map['id']);
        if (id.isEmpty) id = 'p${i + 1}';
        var suffix = 2;
        while (usedPairIds.contains(id)) {
          id = 'p${i + 1}_${suffix++}';
        }
        usedPairIds.add(id);

        pairs.add({
          'id': id,
          'label': label,
          if (icon.isNotEmpty) 'icon': icon,
        });
      }
    }

    final grid = pairGrid[pairs.length];
    final rows = grid?[0] ?? 0;
    final cols = grid?[1] ?? 0;

    return {
      ...base,
      'pairs': pairs,
      'gridSize': {'rows': rows, 'cols': cols},
      'prompt': clip(text(rawData['prompt']), 60),
      'passingScore': intOr(rawData['passingScore'], 80).clamp(0, 100).toInt(),
      'timeLimitSec': intOr(rawData['timeLimitSec'], 180).clamp(60, 300).toInt(),
    };
  }

  int _toInt(dynamic value) {
    final n = int.tryParse(value?.toString() ?? '');
    return n ?? 0;
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(color: AppTheme.primaryColor),
      );
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline_rounded,
                  color: AppTheme.warningColor, size: 42),
              const SizedBox(height: 8),
              Text(
                _error!,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 10),
              FilledButton.icon(
                onPressed: _loadGameData,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('重试'),
              ),
            ],
          ),
        ),
      );
    }

    switch (_resolvedType) {
      case 'quiz':
        return QuizGame(
          data: _resolvedData,
          onExit: widget.onExit,
          onFinished: widget.onCompleted,
        );
      case 'true_false':
        return TrueFalseGame(
          data: _resolvedData,
          onExit: widget.onExit,
          onFinished: widget.onCompleted,
        );
      case 'matching':
        return MatchingGame(
          data: _resolvedData,
          onExit: widget.onExit,
          onFinished: widget.onCompleted,
        );
      case 'fill_blank':
        return FillBlankGame(
          data: _resolvedData,
          onExit: widget.onExit,
          onFinished: widget.onCompleted,
        );
      case 'sequencing':
        return SequencingGame(
          data: _resolvedData,
          onExit: widget.onExit,
          onFinished: widget.onCompleted,
        );
      case 'connection':
        return ConnectionGame(
          data: _resolvedData,
          onExit: widget.onExit,
          onFinished: widget.onCompleted,
        );
      case 'puzzle':
        return PuzzleGame(
          data: _resolvedData,
          onExit: widget.onExit,
          onFinished: widget.onCompleted,
        );
      case 'drag_sort':
        return DragSortGame(
          data: _resolvedData,
          onExit: widget.onExit,
          onFinished: widget.onCompleted,
        );
      case 'memory_flip':
        return MemoryFlipGame(
          data: _resolvedData,
          onExit: widget.onExit,
          onFinished: widget.onCompleted,
        );
      default:
        return Center(
          child: Text(
            '暂不支持的游戏类型：$_resolvedType',
            style: Theme.of(context).textTheme.bodyLarge,
          ),
        );
    }
  }
}
