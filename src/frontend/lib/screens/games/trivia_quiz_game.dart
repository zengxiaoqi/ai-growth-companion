import 'package:flutter/material.dart';

import '../../components/child_fun_page.dart';
import '../../components/child_home_experience.dart';
import '../../components/gradient_button.dart';
import '../../services/public_api_service.dart';
import '../../theme/child_theme.dart';
import '../../utils/app_logger.dart';
import 'quiz_game.dart';

final _log = AppLogger('TriviaQuizGame');

/// Open Trivia DB 知识问答游戏。
///
/// 从后端 `/api/public/trivia` 拉取题目，转换成 [QuizGame] 期望的 data
/// 格式后启动 [QuizGame]。支持难度选择与类别筛选。
///
/// 页面统一走 [ChildFunPage]：自带 Scaffold（缺 Material 祖先时 Text 会
/// 退回 Flutter 错误文本样式，满屏黄色下划线），背景/描边/圆角全部跟随
/// 四套皮肤；类别与难度用 Material 图标而非 emoji（MuMu 缺字形会渲染成方框）。
class TriviaQuizGame extends StatefulWidget {
  final VoidCallback onExit;
  final GameFinishedCallback? onFinished;

  const TriviaQuizGame({
    super.key,
    required this.onExit,
    this.onFinished,
  });

  @override
  State<TriviaQuizGame> createState() => _TriviaQuizGameState();
}

/// 类别（id 对应 Open Trivia DB 的 category）。
class _CategoryOption {
  const _CategoryOption(this.id, this.label, this.icon);

  final int? id;
  final String label;
  final IconData icon;
}

class _DifficultyOption {
  const _DifficultyOption(this.id, this.label, this.icon, this.slot);

  final String id;
  final String label;
  final IconData icon;

  /// 取 `palette.subjects` 的第几个颜色，保证四套皮肤都协调。
  final int slot;
}

class _TriviaQuizGameState extends State<TriviaQuizGame> {
  static const List<_CategoryOption> _categories = <_CategoryOption>[
    _CategoryOption(null, '任意', Icons.shuffle_rounded),
    _CategoryOption(17, '科学', Icons.science_rounded),
    _CategoryOption(18, '计算机', Icons.computer_rounded),
    _CategoryOption(19, '数学', Icons.calculate_rounded),
    _CategoryOption(21, '运动', Icons.sports_soccer_rounded),
    _CategoryOption(22, '地理', Icons.public_rounded),
    _CategoryOption(23, '历史', Icons.history_edu_rounded),
    _CategoryOption(9, '常识', Icons.auto_awesome_rounded),
    _CategoryOption(11, '电影', Icons.movie_rounded),
    _CategoryOption(12, '音乐', Icons.music_note_rounded),
    _CategoryOption(14, '电视', Icons.tv_rounded),
    _CategoryOption(27, '动物', Icons.pets_rounded),
  ];

  static const List<_DifficultyOption> _difficulties = <_DifficultyOption>[
    _DifficultyOption('easy', '简单', Icons.eco_rounded, 2),
    _DifficultyOption('medium', '中等', Icons.bolt_rounded, 3),
    _DifficultyOption('hard', '困难', Icons.local_fire_department_rounded, 0),
  ];

  int? _selectedCategoryId;
  String _difficulty = 'easy';
  bool _loading = false;
  String? _error;
  Map<String, dynamic>? _gameData;

  Future<void> _startGame() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final resp = await PublicApiService.instance.getTrivia(
        amount: 10,
        difficulty: _difficulty,
        category: _selectedCategoryId?.toString(),
      );
      if (!mounted) return;
      if (resp == null) {
        setState(() {
          _error = '暂时拿不到题目，检查一下网络再试试';
          _loading = false;
        });
        return;
      }
      final results = (resp['results'] as List?) ?? <dynamic>[];
      if (results.isEmpty) {
        setState(() {
          _error = '这个类别还没有题目，换一个领域试试';
          _loading = false;
        });
        return;
      }
      final data = _convertToQuizGameData(results);
      setState(() {
        _gameData = data;
        _loading = false;
      });
    } catch (e) {
      _log.warning('Trivia load failed: $e');
      if (!mounted) return;
      setState(() {
        _error = '加载失败，请稍后再试';
        _loading = false;
      });
    }
  }

  Map<String, dynamic> _convertToQuizGameData(List<dynamic> results) {
    final questions = <Map<String, dynamic>>[];
    for (final raw in results) {
      final m = raw as Map;
      final question = _decodeHtml(m['question']?.toString() ?? '');
      final correct = _decodeHtml(m['correct_answer']?.toString() ?? '');
      final incorrect = (m['incorrect_answers'] as List?)
              ?.map((e) => _decodeHtml(e.toString()))
              .toList() ??
          const <String>[];
      final options = <String>[...incorrect, correct]..shuffle();
      final correctIndex = options.indexOf(correct);
      questions.add(<String, dynamic>{
        'question': question,
        'options': options,
        'correctIndex': correctIndex,
        'category': m['category']?.toString(),
        'explanation': '正确答案：$correct',
      });
    }
    return <String, dynamic>{
      'title': '知识问答 · ${_difficultyLabel()}',
      'questions': questions,
    };
  }

  String _difficultyLabel() {
    return _difficulties
        .firstWhere(
          (d) => d.id == _difficulty,
          orElse: () => _difficulties.first,
        )
        .label;
  }

  String _decodeHtml(String s) {
    if (s.isEmpty) return s;
    return s
        .replaceAll('&quot;', '"')
        .replaceAll('&#039;', "'")
        .replaceAll('&#39;', "'")
        .replaceAll('&apos;', "'")
        .replaceAll('&amp;', '&')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&nbsp;', ' ');
  }

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);

    // 答题中：QuizGame 只返回一个 Column，需要外面包一层 Scaffold + 滚动区。
    if (_gameData != null) {
      return Scaffold(
        backgroundColor: palette.paper,
        body: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            child: QuizGame(
              data: _gameData!,
              onExit: () {
                setState(() => _gameData = null);
                widget.onExit();
              },
              onFinished: widget.onFinished,
            ),
          ),
        ),
      );
    }

    final density = palette.density;

    return ChildFunPage(
      title: '知识问答',
      subtitle: '选一个领域，挑战一下脑力',
      icon: Icons.psychology_alt_rounded,
      onBack: widget.onExit,
      footer: GradientButton(
        text: _loading ? '正在出题…' : '开始答题',
        icon: _loading ? null : Icons.play_arrow_rounded,
        height: 56,
        loading: _loading,
        gradient: LinearGradient(
          colors: <Color>[palette.cta, palette.pop],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        onPressed: _loading ? null : _startGame,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          ChildFunHero(
            icon: Icons.emoji_objects_rounded,
            title: '10 道小题，答错也没关系，重点是开眼界',
            meta: const <String>['10 道题', '约 3 分钟', '英语题库'],
          ),
          const SizedBox(height: 22),
          ChildSectionTitle(
            title: '选择类别',
            icon: Icons.category_rounded,
            trailing: Text(
              '共 ${_categories.length} 个领域',
              style: TextStyle(fontSize: 12, color: palette.ink2),
            ),
          ),
          const SizedBox(height: 12),
          _buildCategoryGrid(palette, density.level),
          const SizedBox(height: 22),
          ChildSectionTitle(title: '选择难度', icon: Icons.tune_rounded),
          const SizedBox(height: 12),
          _buildDifficultyRow(palette),
          if (_error != null) ...<Widget>[
            const SizedBox(height: 16),
            _buildError(palette),
          ],
          const SizedBox(height: 16),
          _buildTip(palette),
        ],
      ),
    );
  }

  Widget _buildCategoryGrid(ChildThemePalette palette, int level) {
    final columns = level == 0 ? 3 : 4;

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: EdgeInsets.zero,
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: columns,
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        childAspectRatio: level == 0 ? 1.05 : 0.92,
      ),
      itemCount: _categories.length,
      itemBuilder: (context, index) {
        final c = _categories[index];
        final selected = _selectedCategoryId == c.id;
        final color = palette.subjects[index % palette.subjects.length];

        return GestureDetector(
          onTap: () => setState(() => _selectedCategoryId = c.id),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            decoration: BoxDecoration(
              color: selected
                  ? Color.alphaBlend(
                      color.withValues(alpha: 0.16), palette.card)
                  : palette.card,
              borderRadius: BorderRadius.circular(palette.radiusMd),
              border: Border.all(
                color: selected ? color : palette.line,
                width: selected ? 2.5 : (palette.isCartoon ? 2 : 1),
              ),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: <Widget>[
                Container(
                  padding: EdgeInsets.all(level == 0 ? 10 : 8),
                  decoration: BoxDecoration(
                    color: Color.alphaBlend(
                      color.withValues(alpha: selected ? 0.24 : 0.14),
                      palette.card,
                    ),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    c.icon,
                    size: level == 0 ? 26 : 22,
                    color: color,
                  ),
                ),
                SizedBox(height: level == 0 ? 8 : 6),
                Text(
                  c.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: level == 0 ? 14 : 13,
                    fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                    color: selected ? palette.ink : palette.ink2,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildDifficultyRow(ChildThemePalette palette) {
    return Row(
      children: <Widget>[
        for (var i = 0; i < _difficulties.length; i++) ...<Widget>[
          if (i > 0) const SizedBox(width: 10),
          Expanded(
            child: _buildDifficultyCard(
              palette,
              _difficulties[i],
              selected: _difficulty == _difficulties[i].id,
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildDifficultyCard(
    ChildThemePalette palette,
    _DifficultyOption option, {
    required bool selected,
  }) {
    final color = palette.subjects[option.slot];

    return GestureDetector(
      onTap: () => setState(() => _difficulty = option.id),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
        decoration: BoxDecoration(
          color: selected
              ? Color.alphaBlend(color.withValues(alpha: 0.16), palette.card)
              : palette.card,
          borderRadius: BorderRadius.circular(palette.radiusMd),
          border: Border.all(
            color: selected ? color : palette.line,
            width: selected ? 2.5 : (palette.isCartoon ? 2 : 1),
          ),
        ),
        child: Column(
          children: <Widget>[
            Icon(option.icon, size: 26, color: color),
            const SizedBox(height: 8),
            Text(
              option.label,
              style: TextStyle(
                fontSize: 15,
                fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                color: selected ? palette.ink : palette.ink2,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildError(ChildThemePalette palette) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Color.alphaBlend(
          palette.subjects[0].withValues(alpha: 0.14),
          palette.card,
        ),
        borderRadius: BorderRadius.circular(palette.radiusMd),
        border: Border.all(
          color: palette.subjects[0].withValues(alpha: 0.5),
          width: 1.5,
        ),
      ),
      child: Row(
        children: <Widget>[
          Icon(Icons.wifi_off_rounded, size: 20, color: palette.subjects[0]),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              _error!,
              style: TextStyle(
                fontSize: 13,
                height: 1.4,
                fontWeight: FontWeight.w600,
                color: palette.ink,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTip(ChildThemePalette palette) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Color.alphaBlend(
          palette.pop.withValues(alpha: 0.10),
          palette.card,
        ),
        borderRadius: BorderRadius.circular(palette.radiusMd),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(Icons.lightbulb_rounded, size: 20, color: palette.pop),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              '题目来自国际开源题库（英语），正好练练英语启蒙。答错也没关系，重要的是开眼界。',
              style: TextStyle(
                fontSize: 12.5,
                height: 1.5,
                color: palette.ink2,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
