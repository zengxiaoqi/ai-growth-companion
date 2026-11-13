import 'package:flutter/material.dart';

import '../../../theme/app_theme.dart';
import '../../games/game_renderer.dart';
import '../../games/quiz_game.dart';
import 'hanzi_card.dart';
import 'illustration_grid.dart';
import 'poem_card.dart';
import 'story_card.dart';

/// lesson_pack 按类型渲染：每个 section 分发到字卡/诗歌/故事/插图/
/// 互动游戏/测验，绝不把原始 JSON 丢给孩子。
class LessonSectionRenderer extends StatelessWidget {
  final List<Map<String, dynamic>> sections;
  final GameFinishedCallback? onQuizFinished;

  const LessonSectionRenderer({
    super.key,
    required this.sections,
    this.onQuizFinished,
  });

  @override
  Widget build(BuildContext context) {
    final children = <Widget>[];
    for (final section in sections) {
      children.addAll(_buildSection(section));
    }
    if (children.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: children,
    );
  }

  List<Widget> _buildSection(Map<String, dynamic> section) {
    final widgets = <Widget>[];
    final title = section['title']?.toString().trim() ?? '';

    final primary = _buildPrimary(section, title);
    if (primary != null) widgets.add(primary);

    final questions = section['questions'];
    final hasQuizQuestions = questions is List &&
        questions.whereType<Map>().any(
            (q) => (q['q'] ?? q['question'])?.toString().isNotEmpty ?? false);
    if (hasQuizQuestions) {
      widgets.add(_SectionCard(
        title: title.isEmpty ? '互动练习' : title,
        icon: Icons.sports_esports_rounded,
        child: QuizGame(
          data: section,
          onExit: () {},
          onFinished: onQuizFinished,
        ),
      ));
    }

    return widgets;
  }

  Widget? _buildPrimary(Map<String, dynamic> section, String title) {
    final type = section['type']?.toString() ?? '';

    // quiz section 由 questions 分支处理。
    if (type == 'quiz') return null;

    final characters = section['characters'];
    if (characters is List && characters.isNotEmpty) {
      return _SectionCard(
        title: title.isEmpty ? '认识汉字' : title,
        icon: Icons.translate_rounded,
        child: HanziCard(
          characters: characters.whereType<Map>().map(_stringMap).toList(),
        ),
      );
    }

    if (section['poet'] != null && section['content'] is String) {
      return _SectionCard(
        title: title.isEmpty ? '古诗' : title,
        icon: Icons.menu_book_rounded,
        child: PoemCard(
          title: title,
          poet: section['poet']?.toString() ?? '',
          content: section['content'].toString(),
          meaning: section['meaning']?.toString() ?? '',
        ),
      );
    }

    final lyrics = section['lyrics'];
    if (lyrics is String && lyrics.trim().isNotEmpty) {
      return _SectionCard(
        title: title.isEmpty ? '儿歌' : title,
        icon: Icons.music_note_rounded,
        child: StoryCard(
          title: title,
          text: lyrics,
          extras: _stringList(section['actions']),
        ),
      );
    }

    final tracing = section['tracing'];
    if (tracing is List && tracing.isNotEmpty) {
      final data = _traceFromChars(tracing);
      if (data != null) {
        return _gameCard(title, '描红练习', Icons.draw_rounded,
            'trace_path', data, 560);
      }
    }

    final patterns = section['patterns'];
    if (patterns is List && patterns.isNotEmpty) {
      final games = _patternGames(patterns);
      if (games.isNotEmpty) {
        return _SectionCard(
          title: title.isEmpty ? '找规律' : title,
          icon: Icons.auto_awesome_rounded,
          child: Column(
            children: [
              for (var i = 0; i < games.length; i++) ...[
                if (i > 0) const SizedBox(height: 12),
                SizedBox(
                  height: 430,
                  child: GameRenderer(
                    activityType: 'pattern_next',
                    initialData: {'title': '规律 ${i + 1}', ...games[i]},
                    onExit: () {},
                  ),
                ),
              ],
            ],
          ),
        );
      }
    }

    final items = section['items'];
    if (items is List && items.isNotEmpty) {
      final first = items.first;
      if (first is Map && first['animal'] != null && first['sound'] != null) {
        final data = _matchingFromAnimals(items);
        if (data != null) {
          return _gameCard(title, '动物配对', Icons.compare_arrows_rounded,
              'matching', data, 480);
        }
      }
      if (first is Map && first['color'] != null && first['items'] is List) {
        final data = _dragSortFromColorGroups(items);
        if (data != null) {
          return _gameCard(title, '颜色分类', Icons.category_rounded,
              'drag_sort', data, 520);
        }
      }
      if (first is Map && first['物品'] != null && first['形状'] != null) {
        final pairs = <Map<String, dynamic>>[];
        for (var i = 0; i < items.length; i++) {
          final item = items[i];
          if (item is! Map) continue;
          pairs.add({
            'id': 'p${i + 1}',
            'left': item['物品'].toString(),
            'right': item['形状'].toString(),
          });
        }
        if (pairs.length >= 2) {
          return _gameCard(
              title,
              '形状配对',
              Icons.compare_arrows_rounded,
              'matching',
              {'pairs': pairs, 'prompt': '把物品和对应的形状连起来'},
              480);
        }
      }
      if (first is String) {
        return _SectionCard(
          title: title,
          icon: Icons.grid_view_rounded,
          child: IllustrationGrid(
            emojis: items.map((e) => e.toString()).toList(),
            size: 52,
          ),
        );
      }
    }

    final shapes = section['shapes'];
    if (shapes is List && shapes.isNotEmpty) {
      final data = _dragSortFromShapeGroups(shapes);
      if (data != null) {
        return _gameCard(title, '找形状', Icons.category_rounded,
            'drag_sort', data, 520);
      }
    }

    final tasks = section['tasks'];
    if (tasks is List && tasks.isNotEmpty) {
      final first = tasks.first;
      if (first is Map && first['item'] != null && first['count'] != null) {
        return _SectionCard(
          title: title.isEmpty ? '数一数' : title,
          icon: Icons.pin_rounded,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final task in tasks.whereType<Map>()) ...[
                EmojiCountingGame(
                  items: List.filled(
                    _toInt(task['count']).clamp(1, 10).toInt(),
                    (task['emoji'] ?? task['item']).toString(),
                  ),
                  question: '数一数，有几个 ${(task['emoji'] ?? task['item'])}？',
                ),
                const SizedBox(height: 14),
              ],
            ],
          ),
        );
      }
      if (first is Map &&
          first['category'] != null &&
          first['items'] is List) {
        final data = _dragSortFromCategoryTasks(tasks);
        if (data != null) {
          return _gameCard(title, '整理玩具', Icons.category_rounded,
              'drag_sort', data, 520);
        }
      }
      if (first is Map && (first['主题'] != null || first['名称'] != null)) {
        return _SectionCard(
          title: title,
          icon: Icons.checklist_rounded,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (section['description'] != null)
                _bodyText(section['description'].toString()),
              for (final task in tasks.whereType<Map>())
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _taskTile(task),
                ),
            ],
          ),
        );
      }
    }

    final numbers = section['numbers'];
    if (numbers is List && tasks is List && tasks.isNotEmpty) {
      final data = _tapFromNumberTasks(tasks);
      if (data != null) {
        return _gameCard(title, '找数字', Icons.hearing_rounded,
            'tap_target', data, 480);
      }
    }

    final images = section['images'];
    if (images is List && images.isNotEmpty) {
      return _SectionCard(
        title: title,
        icon: Icons.image_rounded,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            IllustrationGrid(
              emojis: images.map((e) => e.toString()).toList(),
              size: 56,
            ),
            if (section['task'] != null) ...[
              const SizedBox(height: 10),
              _bodyText('🎯 ${section['task']}'),
            ],
            ..._bulletWidgets(_stringList(section['hints'])),
          ],
        ),
      );
    }

    final rhythm = section['rhythm'];
    if (rhythm is List && rhythm.isNotEmpty) {
      return _SectionCard(
        title: title,
        icon: Icons.music_note_rounded,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (section['text'] != null) _bodyText(section['text'].toString()),
            for (final beat in rhythm.whereType<Map>())
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    const Text('👏', style: TextStyle(fontSize: 20)),
                    const SizedBox(width: 8),
                    Text(
                      '${beat['beat'] ?? ''}（${beat['pattern'] ?? ''}）',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.active.ink,
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      );
    }

    final skills = section['skills'];
    if (skills is List && skills.isNotEmpty) {
      return _SectionCard(
        title: title,
        icon: Icons.emoji_people_rounded,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (section['description'] != null)
              _bodyText(section['description'].toString()),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final skill in skills)
                  _chip(skill.toString(), Icons.star_rounded),
              ],
            ),
          ],
        ),
      );
    }

    final text = section['text'];
    if (text is String && text.trim().isNotEmpty) {
      final examples = section['examples'];
      final extras = <String>[];
      if (examples is List) {
        for (final example in examples.whereType<Map>()) {
          final visual = example['visual']?.toString();
          if (visual != null && visual.isNotEmpty) extras.add(visual);
          for (final entry in example.entries) {
            if (entry.key == 'visual') continue;
            extras.add('${entry.key} = ${entry.value}');
          }
        }
      }
      return _SectionCard(
        title: title,
        icon: type == 'story'
            ? Icons.auto_stories_rounded
            : Icons.menu_book_rounded,
        child: StoryCard(
          title: title,
          text: text,
          interactive: section['interactive'] is Map
              ? _stringMap(section['interactive'] as Map)
              : null,
          extras: extras,
        ),
      );
    }

    // 口算练习：questions 是算式字符串列表。
    final questions = section['questions'];
    if (questions is List &&
        questions.isNotEmpty &&
        questions.every((q) => q is String)) {
      return _SectionCard(
        title: title.isEmpty ? '口算练习' : title,
        icon: Icons.calculate_rounded,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _bodyText('大声算出答案，看谁算得又对又快！'),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final q in questions) _chip(q.toString(), null),
              ],
            ),
          ],
        ),
      );
    }

    final steps = section['steps'];
    if (steps is List && steps.isNotEmpty) {
      return _SectionCard(
        title: title,
        icon: type == 'experiment'
            ? Icons.science_rounded
            : Icons.handyman_rounded,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (section['materials'] is List) ...[
              _bodyText('🧺 材料：${_stringList(section['materials']).join('、')}'),
              const SizedBox(height: 8),
            ],
            for (var i = 0; i < steps.length; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _stepBadge(i + 1),
                    const SizedBox(width: 8),
                    Expanded(child: _bodyText(steps[i].toString())),
                  ],
                ),
              ),
            if (section['result'] != null) ...[
              const SizedBox(height: 6),
              _banner('🎯 ${section['result']}'),
            ],
          ],
        ),
      );
    }

    final description = section['description'];
    if (description is String && description.trim().isNotEmpty) {
      return _SectionCard(
        title: title,
        icon: Icons.lightbulb_rounded,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (section['composer'] != null)
              _chip('🎼 ${section['composer']}', null),
            _bodyText(description),
            ..._bulletWidgets(_stringList(section['activities'])),
            ..._bulletWidgets(_stringList(section['examples'])),
          ],
        ),
      );
    }

    // 讨论/观察类练习：categories、prompts、scenarios、suggestions、hints。
    final lists = <String, List<String>>{};
    for (final key in [
      'categories',
      'prompts',
      'suggestions',
      'hints',
      'tools',
    ]) {
      final value = _stringList(section[key]);
      if (value.isNotEmpty) lists[key] = value;
    }
    final scenarios = section['scenarios'];
    if (scenarios is List && scenarios.isNotEmpty) {
      final rows = <String>[];
      for (final scenario in scenarios.whereType<Map>()) {
        rows.add(scenario.entries
            .map((e) => '${e.key}：${e.value}')
            .join('，'));
      }
      if (rows.isNotEmpty) lists['scenarios'] = rows;
    }
    if (lists.isNotEmpty) {
      return _SectionCard(
        title: title,
        icon: Icons.chat_bubble_rounded,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (section['description'] != null)
              _bodyText(section['description'].toString()),
            for (final entry in lists.entries)
              ..._bulletWidgets(entry.value),
          ],
        ),
      );
    }

    final hints = _stringList(section['hints']);
    if (hints.isNotEmpty) {
      return _SectionCard(
        title: title,
        icon: Icons.brush_rounded,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ..._bulletWidgets(hints),
            if (section['tools'] is List)
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final tool in _stringList(section['tools']))
                    _chip(tool, null),
                ],
              ),
          ],
        ),
      );
    }

    return null;
  }

  // ─── 游戏数据归一化（满足 GameRenderer 各 normalizer 边界） ───

  Map<String, dynamic>? _matchingFromAnimals(List items) {
    final pairs = <Map<String, dynamic>>[];
    for (var i = 0; i < items.length; i++) {
      final item = items[i];
      if (item is! Map) continue;
      final animal = item['animal']?.toString() ?? '';
      final sound = item['sound']?.toString() ?? '';
      if (animal.isEmpty || sound.isEmpty) continue;
      pairs.add({'id': 'p${i + 1}', 'left': animal, 'right': sound});
    }
    if (pairs.length < 2) return null;
    return {'pairs': pairs, 'prompt': '把动物和它的叫声连起来'};
  }

  static const Map<String, String> _colorLabels = {
    'red': '红色',
    'blue': '蓝色',
    'yellow': '黄色',
    'green': '绿色',
    'orange': '橙色',
    'purple': '紫色',
    'pink': '粉色',
    'brown': '棕色',
    'black': '黑色',
    'white': '白色',
  };

  Map<String, dynamic>? _dragSortFromGroups(
    List<({String label, List<String> items})> groups,
    String prompt,
  ) {
    final buckets = <Map<String, dynamic>>[];
    final flatItems = <Map<String, dynamic>>[];
    for (var g = 0; g < groups.length && buckets.length < 4; g++) {
      final group = groups[g];
      if (group.label.isEmpty || group.items.isEmpty) continue;
      final bucketId = 'b${buckets.length + 1}';
      buckets.add({'id': bucketId, 'label': group.label});
      for (final emoji in group.items) {
        if (flatItems.length >= 12) break;
        flatItems.add({
          'id': 'i${flatItems.length + 1}',
          'label': emoji,
          'icon': emoji,
          'bucketId': bucketId,
        });
      }
    }
    if (buckets.length < 2 || flatItems.length < 2) return null;
    return {
      'buckets': buckets,
      'items': flatItems,
      'prompt': prompt,
      'passingScore': 80,
      'timeLimitSec': 180,
    };
  }

  Map<String, dynamic>? _dragSortFromColorGroups(List items) {
    final groups = <({String label, List<String> items})>[];
    for (final item in items.whereType<Map>()) {
      final color = item['color']?.toString() ?? '';
      groups.add((
        label: _colorLabels[color] ?? color,
        items: _stringList(item['items']),
      ));
    }
    return _dragSortFromGroups(groups, '把相同颜色的物品放进同一个盒子');
  }

  Map<String, dynamic>? _dragSortFromShapeGroups(List shapes) {
    final groups = <({String label, List<String> items})>[];
    for (final shape in shapes.whereType<Map>()) {
      groups.add((
        label: shape['name']?.toString() ?? '',
        items: _stringList(shape['items']),
      ));
    }
    return _dragSortFromGroups(groups, '把物品放进对应的形状盒子');
  }

  Map<String, dynamic>? _dragSortFromCategoryTasks(List tasks) {
    final groups = <({String label, List<String> items})>[];
    for (final task in tasks.whereType<Map>()) {
      final category = task['category']?.toString() ?? '';
      groups.add((
        label: _colorLabels[category] ?? category,
        items: _stringList(task['items']),
      ));
    }
    return _dragSortFromGroups(groups, '红色放红盒，蓝色放蓝盒，黄色放黄盒');
  }

  List<Map<String, dynamic>> _patternGames(List patterns) {
    final answers = <String>[];
    for (final pattern in patterns.whereType<Map>()) {
      final answer = pattern['answer']?.toString() ?? '';
      if (answer.isNotEmpty && !answers.contains(answer) && answers.length < 4) {
        answers.add(answer);
      }
    }
    if (answers.length < 2) return const [];
    final options = [
      for (var i = 0; i < answers.length; i++)
        {'id': 'o${i + 1}', 'label': answers[i], 'icon': answers[i]},
    ];

    final games = <Map<String, dynamic>>[];
    for (final pattern in patterns.whereType<Map>()) {
      if (games.length >= 3) break;
      final raw = pattern['pattern']?.toString() ?? '';
      final answer = pattern['answer']?.toString() ?? '';
      final tokens = raw.replaceAll('?', '').characters.toList();
      if (tokens.length < 2 || answer.isEmpty) continue;
      final sequence = [
        for (var i = 0; i < tokens.length && i < 8; i++)
          {'id': 's${i + 1}', 'label': tokens[i], 'icon': tokens[i]},
      ];
      var answerIndex = options.indexWhere((o) => o['label'] == answer);
      if (answerIndex < 0) answerIndex = 0;
      games.add({
        'sequence': sequence,
        'options': options,
        'answerIndex': answerIndex,
        'prompt': '接下来应该是什么？',
        'passingScore': 80,
        'timeLimitSec': 120,
      });
    }
    return games;
  }

  Map<String, dynamic>? _traceFromChars(List tracing) {
    final seen = <String>{};
    final targets = <Map<String, dynamic>>[];
    for (final raw in tracing) {
      final char = raw.toString().trim();
      if (char.isEmpty || seen.contains(char)) continue;
      if (char.runes.length > 2) continue;
      seen.add(char);
      targets.add({
        'id': 'g${targets.length + 1}',
        'kind': 'glyph',
        'text': char,
        'label': char,
      });
      if (targets.length >= 4) break;
    }
    if (targets.isEmpty) return null;
    return {
      'targets': targets,
      'prompt': '用手指描一描这些字',
      'minCoverage': 0.7,
      'passingScore': 80,
      'timeLimitSec': 180,
    };
  }

  Map<String, dynamic>? _tapFromNumberTasks(List tasks) {
    final rounds = <Map<String, dynamic>>[];
    for (final task in tasks.whereType<Map>()) {
      if (rounds.length >= 6) break;
      final find = task['find']?.toString() ?? '';
      final pool = _stringList(task['in']);
      if (find.isEmpty || !pool.contains(find) || pool.length < 2) continue;
      final picked = <String>[find];
      for (final value in pool) {
        if (picked.length >= 4) break;
        if (value != find) picked.add(value);
      }
      rounds.add({
        'id': 'r${rounds.length + 1}',
        'prompt': '找到数字 $find',
        'targets': [
          for (final value in picked)
            {'id': 'n$value', 'label': value, 'icon': '🔢'},
        ],
        'correctIds': ['n$find'],
      });
    }
    if (rounds.isEmpty) return null;
    return {'rounds': rounds, 'passingScore': 80, 'timeLimitSec': 120};
  }

  // ─── 通用卡片与小组件 ───

  Widget _gameCard(
    String title,
    String fallbackTitle,
    IconData icon,
    String activityType,
    Map<String, dynamic> data,
    double height,
  ) {
    return _SectionCard(
      title: title.isEmpty ? fallbackTitle : title,
      icon: icon,
      child: SizedBox(
        height: height,
        child: GameRenderer(
          activityType: activityType,
          initialData: {'title': title.isEmpty ? fallbackTitle : title, ...data},
          onExit: () {},
        ),
      ),
    );
  }

  Widget _taskTile(Map task) {
    final palette = AppTheme.active;
    final name = (task['主题'] ?? task['名称'])?.toString() ?? '';
    final steps = task['步骤'];
    final difficulty = task['难度'];
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: palette.soft,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            name,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: palette.ink,
            ),
          ),
          if (steps is List)
            for (var i = 0; i < steps.length; i++)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  '${i + 1}. ${steps[i]}',
                  style: TextStyle(fontSize: 12.5, color: palette.ink2),
                ),
              ),
          if (steps is int)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                '共 $steps 步${difficulty != null ? ' · 难度 ${'★' * _toInt(difficulty).clamp(1, 3).toInt()}' : ''}',
                style: TextStyle(fontSize: 12.5, color: palette.ink2),
              ),
            ),
        ],
      ),
    );
  }

  Widget _bodyText(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 14.5,
          height: 1.75,
          color: AppTheme.active.ink,
        ),
      ),
    );
  }

  List<Widget> _bulletWidgets(List<String> items) {
    if (items.isEmpty) return const [];
    return [
      for (final item in items)
        Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('· ',
                  style: TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w800,
                      color: AppTheme.active.pop)),
              Expanded(
                child: Text(
                  item,
                  style: TextStyle(
                    fontSize: 14,
                    height: 1.6,
                    color: AppTheme.active.ink,
                  ),
                ),
              ),
            ],
          ),
        ),
    ];
  }

  Widget _chip(String label, IconData? icon) {
    final palette = AppTheme.active;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: palette.pop.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 13, color: palette.pop),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
              color: palette.ink,
            ),
          ),
        ],
      ),
    );
  }

  Widget _banner(String text) {
    final palette = AppTheme.active;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: palette.pop.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 13.5,
          fontWeight: FontWeight.w700,
          color: palette.ink,
        ),
      ),
    );
  }

  Widget _stepBadge(int number) {
    final palette = AppTheme.active;
    return Container(
      width: 22,
      height: 22,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: palette.pop.withValues(alpha: 0.14),
        shape: BoxShape.circle,
      ),
      child: Text(
        '$number',
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w800,
          color: palette.pop,
        ),
      ),
    );
  }

  static Map<String, dynamic> _stringMap(Map map) =>
      map.map((k, v) => MapEntry(k.toString(), v));

  static List<String> _stringList(dynamic value) {
    if (value is! List) return const [];
    return value
        .map((e) => e?.toString().trim() ?? '')
        .where((e) => e.isNotEmpty)
        .toList();
  }

  static int _toInt(dynamic value) {
    final n = int.tryParse(value?.toString() ?? '');
    return n ?? 0;
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final IconData icon;
  final Widget child;

  const _SectionCard({
    required this.title,
    required this.icon,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    final palette = AppTheme.active;
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(AppTheme.cardRadius),
        border: palette.isCartoon
            ? Border.all(color: palette.line, width: 2)
            : null,
        boxShadow: AppTheme.softShadow(),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title.isNotEmpty) ...[
            Row(
              children: [
                Icon(icon, size: 20, color: palette.pop),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    title,
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: palette.ink,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
          ],
          child,
        ],
      ),
    );
  }
}