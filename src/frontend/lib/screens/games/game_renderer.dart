import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import 'connection_game.dart';
import 'fill_blank_game.dart';
import 'matching_game.dart';
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
      'fill_blank', 'sequencing', 'connection', 'puzzle',
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
    if (gameType == 'quiz' || gameType == 'count' || gameType == 'riddle') {
      return 'quiz';
    }

    // 根据数据结构推断类型。
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
