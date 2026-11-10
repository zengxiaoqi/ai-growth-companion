import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import 'connection_game.dart';
import 'color_fill_game.dart';
import 'drag_sort_game.dart';
import 'fill_blank_game.dart';
import 'matching_game.dart';
import 'memory_flip_game.dart';
import 'pattern_next_game.dart';
import 'puzzle_game.dart';
import 'quiz_game.dart';
import 'sequencing_game.dart';
import 'tap_target_game.dart';
import 'trace_path_game.dart';
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
      'memory_flip', 'pattern_next', 'trace_path', 'color_fill', 'tap_target',
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
    if (gameType == 'pattern_next' || gameType == 'pattern' || gameType == 'riddle_sequence') {
      return 'pattern_next';
    }
    if (gameType == 'trace_path' || gameType == 'trace' || gameType == 'tracing') {
      return 'trace_path';
    }
    if (gameType == 'color_fill' || gameType == 'coloring' || gameType == 'paint') {
      return 'color_fill';
    }
    if (gameType == 'tap_target' || gameType == 'listen_tap' || gameType == 'listen') {
      return 'tap_target';
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
    // pattern_next 用 sequence + options；sequence 是无歧义的结构键。
    if (rawData['sequence'] is List && rawData['options'] is List) {
      return 'pattern_next';
    }
    // trace_path 用 targets；必须先于下方的 items+targets -> matching
    // 回退判断，否则描红数据会被误判成配对游戏（附录 H.4）。
    if (rawData['targets'] is List) {
      return 'trace_path';
    }
    // color_fill 用 regions；grep-verified 全仓唯一。
    if (rawData['regions'] is List) {
      return 'color_fill';
    }
    // tap_target 用 rounds；grep-verified 全仓唯一。
    if (rawData['rounds'] is List) {
      return 'tap_target';
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

    if (type == 'pattern_next') {
      return _normalizePatternNextData(base, rawData);
    }

    if (type == 'trace_path') {
      return _normalizeTracePathData(base, rawData);
    }

    if (type == 'color_fill') {
      return _normalizeColorFillData(base, rawData);
    }

    if (type == 'tap_target') {
      return _normalizeTapTargetData(base, rawData);
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

  /// 参数化题型 pattern_next 的防御式归一化，与 Web normalizer /
  /// 后端 sanitizePatternNextParams 保持同一套边界与计分语义。
  Map<String, dynamic> _normalizePatternNextData(
    Map<String, dynamic> base,
    Map<String, dynamic> rawData,
  ) {
    const int maxSequence = 8;
    const int maxOptions = 4;
    const int maxLabel = 12;
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

    List<Map<String, dynamic>> parseEntries(
      dynamic raw,
      String prefix,
      int max,
    ) {
      if (raw is! List) return <Map<String, dynamic>>[];
      final used = <String>{};
      final result = <Map<String, dynamic>>[];
      for (var i = 0; i < raw.length && result.length < max; i++) {
        final entry = raw[i];
        if (entry is! Map) continue;
        final map = entry.map((k, v) => MapEntry(k.toString(), v));
        final label = clip(text(map['label']), maxLabel);
        if (label.isEmpty) continue;

        var id = safeId(map['id']);
        if (id.isEmpty) id = '$prefix${i + 1}';
        var suffix = 2;
        while (used.contains(id)) {
          id = '$prefix${i + 1}_${suffix++}';
        }
        used.add(id);

        final icon = clip(text(map['icon']), maxIcon);
        result.add({
          'id': id,
          'label': label,
          if (icon.isNotEmpty) 'icon': icon,
        });
      }
      return result;
    }

    final sequence = parseEntries(rawData['sequence'], 's', maxSequence);

    // 答案必须能在清洗后的选项里按 label 重新锚定，否则重建选项列表。
    final rawOptions = rawData['options'] is List ? rawData['options'] as List : [];
    final answerIdx = intOr(rawData['answerIndex'], -1);
    final declaredAnswer = (answerIdx >= 0 && answerIdx < rawOptions.length)
        ? text((rawOptions[answerIdx] as Map?)?['label'])
        : '';

    final cleaned = parseEntries(rawOptions, 'o', maxOptions);
    final usedOptionLabels = <String>{};
    final options = <Map<String, dynamic>>[];
    var answerIndex = -1;
    for (final option in cleaned) {
      final label = option['label'] as String;
      if (usedOptionLabels.contains(label)) continue;
      usedOptionLabels.add(label);
      if (label == declaredAnswer) answerIndex = options.length;
      options.add(option);
    }

    if (answerIndex < 0 && options.length >= 2) {
      // 无法按 label 重新锚定：保守取第一个选项，保证棋盘可答。
      answerIndex = 0;
    }

    return {
      ...base,
      'sequence': sequence,
      'options': options,
      'answerIndex': answerIndex,
      'prompt': clip(text(rawData['prompt']), 60),
      'passingScore': intOr(rawData['passingScore'], 80).clamp(0, 100).toInt(),
      'timeLimitSec': intOr(rawData['timeLimitSec'], 120).clamp(30, 300).toInt(),
    };
  }

  int _toInt(dynamic value) {
    final n = int.tryParse(value?.toString() ?? '');
    return n ?? 0;
  }

  /// 参数化题型 trace_path 的防御式归一化，与 Web normalizer /
  /// 后端 sanitizeTracePathParams 保持同一套边界（附录 H.2）：
  /// 字形白名单（常用汉字/数字/字母，1-2 个）、polyline 丢弃、去重、
  /// minCoverage 裁剪到 [0.5, 0.85]。
  Map<String, dynamic> _normalizeTracePathData(
    Map<String, dynamic> base,
    Map<String, dynamic> rawData,
  ) {
    const int maxTargets = 4;
    const int maxLabel = 12;

    String text(dynamic value) {
      if (value == null) return '';
      return value.toString().replaceAll(RegExp(r'\s+'), ' ').trim();
    }

    String clip(String value, int max) => value.runes.length <= max
        ? value
        : String.fromCharCodes(value.runes.take(max));

    String safeId(dynamic value) =>
        clip(text(value).replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), ''), 32);

    final glyphRe = RegExp(r'^[\u4e00-\u9fa5a-zA-Z0-9]+$');
    bool isValidGlyph(String value) {
      final runes = value.runes.toList();
      return runes.isNotEmpty && runes.length <= 2 && glyphRe.hasMatch(value);
    }

    double doubleOr(dynamic value, double fallback) {
      final n = num.tryParse(value?.toString() ?? '');
      return (n == null || !n.isFinite) ? fallback : n.toDouble();
    }

    final usedIds = <String>{};
    final usedTexts = <String>{};
    final rawTargets = rawData['targets'] is List
        ? rawData['targets'] as List
        : <dynamic>[];
    final targets = <Map<String, dynamic>>[];
    for (var i = 0; i < rawTargets.length && targets.length < maxTargets; i++) {
      final entry = rawTargets[i];
      if (entry is! Map) continue;
      final map = entry.map((k, v) => MapEntry(k.toString(), v));
      // polyline 模式仅限人工课程内容，LLM 生成一律丢弃。
      final kind = text(map['kind']);
      if (kind.isNotEmpty && kind != 'glyph') continue;
      final glyph = clip(text(map['text']), 8);
      if (!isValidGlyph(glyph) || usedTexts.contains(glyph)) continue;
      usedTexts.add(glyph);
      var id = safeId(map['id']);
      if (id.isEmpty) id = 'g${i + 1}';
      var suffix = 2;
      while (usedIds.contains(id)) {
        id = 'g${i + 1}_${suffix++}';
      }
      usedIds.add(id);
      final label = clip(text(map['label']), maxLabel);
      targets.add({
        'id': id,
        'kind': 'glyph',
        'text': glyph,
        'label': label.isEmpty ? glyph : label,
      });
    }

    final rawCoverage = doubleOr(rawData['minCoverage'], 0.7);
    final minCoverage = rawCoverage > 0
        ? rawCoverage.clamp(0.5, 0.85).toDouble()
        : 0.7;

    return {
      ...base,
      'targets': targets,
      'minCoverage': minCoverage,
      'prompt': clip(text(rawData['prompt']), 60),
      'passingScore': _intOr(rawData['passingScore'], 80).clamp(0, 100).toInt(),
      'timeLimitSec': _intOr(rawData['timeLimitSec'], 180).clamp(30, 300).toInt(),
    };
  }

  int _intOr(dynamic value, int fallback) {
    final n = int.tryParse(value?.toString() ?? '');
    return n ?? fallback;
  }

  /// 参数化题型 color_fill 的防御式归一化，与 Web normalizer /
  /// 后端 sanitizeColorFillParams 保持同一套边界（附录 H.3）：
  /// 形状/颜色枚举、palette 去重裁剪、色盘缺对应色块的区域删除。
  Map<String, dynamic> _normalizeColorFillData(
    Map<String, dynamic> base,
    Map<String, dynamic> rawData,
  ) {
    const int maxRegions = 6;
    const int maxPalette = 8;

    const shapes = <String>[
      'circle', 'star', 'heart', 'triangle', 'square',
      'flower', 'sun', 'moon', 'cloud', 'fish',
    ];
    const colors = <String>[
      'red', 'blue', 'yellow', 'green', 'orange',
      'purple', 'pink', 'brown', 'black', 'white',
    ];

    String cleanId(String value) {
      final cleaned = value.trim().replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '');
      return cleaned.runes.length <= 32
          ? cleaned
          : String.fromCharCodes(cleaned.runes.take(32));
    }

    final rawPalette = rawData['palette'] is List
        ? rawData['palette'] as List
        : <dynamic>[];
    final seenPalette = <String>{};
    final palette = <String>[];
    for (final entry in rawPalette) {
      final color = entry?.toString() ?? '';
      if (!colors.contains(color) || seenPalette.contains(color)) continue;
      seenPalette.add(color);
      palette.add(color);
      if (palette.length >= maxPalette) break;
    }
    final paletteSet = palette.toSet();

    final rawRegions = rawData['regions'] is List
        ? rawData['regions'] as List
        : <dynamic>[];
    final usedIds = <String>{};
    final regions = <Map<String, dynamic>>[];
    for (var i = 0; i < rawRegions.length && regions.length < maxRegions; i++) {
      final entry = rawRegions[i];
      if (entry is! Map) continue;
      final map = entry.map((k, v) => MapEntry(k.toString(), v));
      final shape = map['shape']?.toString() ?? '';
      final colorKey = map['colorKey']?.toString() ?? '';
      // 未知形状/颜色、色盘缺对应色块的区域：无法涂色，直接丢弃。
      if (!shapes.contains(shape) ||
          !colors.contains(colorKey) ||
          !paletteSet.contains(colorKey)) {
        continue;
      }
      var id = cleanId(map['id']?.toString() ?? '');
      if (id.isEmpty) id = 's${i + 1}';
      var suffix = 2;
      while (usedIds.contains(id)) {
        id = 's${i + 1}_${suffix++}';
      }
      usedIds.add(id);
      regions.add({'id': id, 'shape': shape, 'colorKey': colorKey});
    }

    final prompt = (rawData['prompt']?.toString() ?? '')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    final clippedPrompt = prompt.runes.length <= 60
        ? prompt
        : String.fromCharCodes(prompt.runes.take(60));

    return {
      ...base,
      'regions': regions,
      'palette': palette,
      'prompt': clippedPrompt,
      'passingScore': _intOr(rawData['passingScore'], 80).clamp(0, 100).toInt(),
      'timeLimitSec': _intOr(rawData['timeLimitSec'], 120).clamp(30, 300).toInt(),
    };
  }

  /// 参数化题型 tap_target 的防御式归一化，与 Web normalizer /
  /// 后端 sanitizeTapTargetParams 保持同一套边界（附录 H.1）：
  /// 每轮目标 label 去重、correctIds 重新锚定到清洗后的 id、
  /// 无幸存正确目标的轮次整轮丢弃。
  Map<String, dynamic> _normalizeTapTargetData(
    Map<String, dynamic> base,
    Map<String, dynamic> rawData,
  ) {
    const int maxRounds = 6;
    const int maxTargets = 4;

    String text(dynamic value) {
      if (value == null) return '';
      return value.toString().replaceAll(RegExp(r'\s+'), ' ').trim();
    }

    String clip(String value, int max) => value.runes.length <= max
        ? value
        : String.fromCharCodes(value.runes.take(max));

    String safeId(dynamic value) =>
        clip(text(value).replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), ''), 32);

    final usedRoundIds = <String>{};
    final rawRounds =
        rawData['rounds'] is List ? rawData['rounds'] as List : <dynamic>[];
    final rounds = <Map<String, dynamic>>[];

    for (var i = 0; i < rawRounds.length && rounds.length < maxRounds; i++) {
      final entry = rawRounds[i];
      if (entry is! Map) continue;
      final map = entry.map((k, v) => MapEntry(k.toString(), v));
      final prompt = clip(text(map['prompt']), 20);
      if (prompt.isEmpty) continue;

      final rawTargets = map['targets'] is List ? map['targets'] as List : const [];
      final usedTargetIds = <String>{};
      final usedLabels = <String>{};
      final idMap = <String, String>{};
      final targets = <Map<String, dynamic>>[];
      for (var t = 0; t < rawTargets.length && targets.length < maxTargets; t++) {
        final item = rawTargets[t];
        if (item is! Map) continue;
        final itemMap = item.map((k, v) => MapEntry(k.toString(), v));
        final label = clip(text(itemMap['label']), 12);
        if (label.isEmpty || usedLabels.contains(label)) continue;
        usedLabels.add(label);
        var id = safeId(itemMap['id']);
        if (id.isEmpty) id = 't${i + 1}_${t + 1}';
        var suffix = 2;
        while (usedTargetIds.contains(id)) {
          id = 't${i + 1}_${t + 1}_${suffix++}';
        }
        usedTargetIds.add(id);
        final rawId = text(itemMap['id']);
        if (rawId.isNotEmpty) idMap[rawId] = id;
        final icon = clip(text(itemMap['icon']), 8);
        targets.add({
          'id': id,
          'label': label,
          if (icon.isNotEmpty) 'icon': icon,
        });
      }
      if (targets.length < 2) continue;

      final survivingIds = targets.map((t) => t['id'] as String).toSet();
      final rawCorrect = map['correctIds'] is List
          ? map['correctIds'] as List
          : <dynamic>[];
      final correctIds = <String>[];
      for (final candidate in rawCorrect) {
        final raw = text(candidate);
        final mapped = idMap[raw] ?? raw;
        if (!survivingIds.contains(mapped) || correctIds.contains(mapped)) continue;
        correctIds.add(mapped);
        if (correctIds.length >= 2) break;
      }
      // 正确目标被清洗掉、无 correctId 的轮次无法作答：整轮丢弃。
      if (correctIds.isEmpty) continue;

      var roundId = safeId(map['id']);
      if (roundId.isEmpty) roundId = 'r${i + 1}';
      var roundSuffix = 2;
      while (usedRoundIds.contains(roundId)) {
        roundId = 'r${i + 1}_${roundSuffix++}';
      }
      usedRoundIds.add(roundId);
      rounds.add({
        'id': roundId,
        'prompt': prompt,
        'targets': targets,
        'correctIds': correctIds,
      });
    }

    return {
      ...base,
      'rounds': rounds,
      'passingScore': _intOr(rawData['passingScore'], 80).clamp(0, 100).toInt(),
      'timeLimitSec': _intOr(rawData['timeLimitSec'], 120).clamp(30, 300).toInt(),
    };
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
      case 'pattern_next':
        return PatternNextGame(
          data: _resolvedData,
          onExit: widget.onExit,
          onFinished: widget.onCompleted,
        );
      case 'trace_path':
        return TracePathGame(
          data: _resolvedData,
          onExit: widget.onExit,
          onFinished: widget.onCompleted,
        );
      case 'color_fill':
        return ColorFillGame(
          data: _resolvedData,
          onExit: widget.onExit,
          onFinished: widget.onCompleted,
        );
      case 'tap_target':
        return TapTargetGame(
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
