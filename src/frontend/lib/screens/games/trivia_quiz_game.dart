import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import '../../utils/app_logger.dart';
import '../../services/public_api_service.dart';
import 'quiz_game.dart';

final _log = AppLogger('TriviaQuizGame');

/// Open Trivia DB 知识问答游戏
///
/// 从后端 `/api/public/trivia` 拉取题目，转换成 [QuizGame] 期望的 data
/// 格式后启动 [QuizGame]。支持难度选择与类别筛选。
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

class _TriviaQuizGameState extends State<TriviaQuizGame>
    with TickerProviderStateMixin {
  // 类别（emoji 前置，便于儿童识别）
  static const List<Map<String, dynamic>> kCategories = [
    {'id': null, 'label': '任意', 'emoji': '🎲'},
    {'id': 17, 'label': '科学', 'emoji': '🔬'},
    {'id': 18, 'label': '计算机', 'emoji': '💻'},
    {'id': 19, 'label': '数学', 'emoji': '➗'},
    {'id': 21, 'label': '运动', 'emoji': '⚽'},
    {'id': 22, 'label': '地理', 'emoji': '🌍'},
    {'id': 23, 'label': '历史', 'emoji': '📜'},
    {'id': 9, 'label': '常识', 'emoji': '🌟'},
    {'id': 11, 'label': '电影', 'emoji': '🎬'},
    {'id': 12, 'label': '音乐', 'emoji': '🎵'},
    {'id': 14, 'label': '电视', 'emoji': '📺'},
    {'id': 27, 'label': '动物', 'emoji': '🐾'},
  ];

  static const List<Map<String, dynamic>> kDifficulties = [
    {'id': 'easy', 'label': '简单', 'emoji': '🌱', 'color': Color(0xFF4CAF50)},
    {'id': 'medium', 'label': '中等', 'emoji': '⚡', 'color': Color(0xFFFFA726)},
    {'id': 'hard', 'label': '困难', 'emoji': '🔥', 'color': Color(0xFFEF5350)},
  ];

  int? _selectedCategoryId;
  String _difficulty = 'easy';
  bool _loading = false;
  String? _error;
  Map<String, dynamic>? _gameData;

  // 入场动画
  late final AnimationController _introController;
  late final List<Animation<double>> _staggeredAnims;

  @override
  void initState() {
    super.initState();
    _introController = AnimationController(
      duration: const Duration(milliseconds: 1100),
      vsync: this,
    );
    // 6 个动画区间，每个间隔 0.08
    _staggeredAnims = List.generate(6, (i) {
      return Tween<double>(begin: 0, end: 1).animate(
        CurvedAnimation(
          parent: _introController,
          curve: Interval(
            0.05 + i * 0.1,
            (0.05 + i * 0.1).clamp(0.0, 1.0) + 0.4,
            curve: Curves.easeOutCubic,
          ),
        ),
      );
    });
    _introController.forward();
  }

  @override
  void dispose() {
    _introController.dispose();
    super.dispose();
  }

  Widget _buildAnimatedIn(Widget child, int index) {
    final anim = _staggeredAnims[index.clamp(0, _staggeredAnims.length - 1)];
    return AnimatedBuilder(
      animation: anim,
      builder: (context, child) {
        return Opacity(
          opacity: anim.value,
          child: Transform.translate(
            offset: Offset(0, 30 * (1 - anim.value)),
            child: child,
          ),
        );
      },
      child: child,
    );
  }

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
      if (resp == null) {
        setState(() {
          _error = '无法获取题目，请稍后再试';
          _loading = false;
        });
        return;
      }
      final results = (resp['results'] as List?) ?? [];
      if (results.isEmpty) {
        setState(() {
          _error = '该类别暂无可用题目，请换一个试试';
          _loading = false;
        });
        return;
      }
      final data = _convertToQuizGameData(results);
      if (!mounted) return;
      setState(() {
        _gameData = data;
        _loading = false;
      });
    } catch (e) {
      _log.warning('Trivia load failed: $e');
      if (!mounted) return;
      setState(() {
        _error = '加载失败：$e';
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
      final options = [...incorrect, correct]..shuffle();
      final correctIndex = options.indexOf(correct);
      questions.add({
        'question': question,
        'options': options,
        'correctIndex': correctIndex,
        'category': m['category']?.toString(),
        'explanation': '正确答案：$correct',
      });
    }
    return {
      'title': '知识问答 · ${_difficultyLabel()}',
      'questions': questions,
    };
  }

  String _difficultyLabel() {
    return kDifficulties.firstWhere(
      (d) => d['id'] == _difficulty,
      orElse: () => const {'label': '简单'},
    )['label'] as String;
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
    if (_gameData != null) {
      return QuizGame(
        data: _gameData!,
        onExit: () {
          setState(() => _gameData = null);
          widget.onExit();
        },
        onFinished: widget.onFinished,
      );
    }

    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF5AB0D9), Color(0xFF8FD0EC), Color(0xFFE0F2FB)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: SafeArea(
        child: Stack(
          children: [
            // ====== 背景装饰：漂浮气泡 ======
            Positioned(
              top: 80,
              right: -20,
              child: _FloatingBubble(
                size: 60,
                color: Colors.white.withValues(alpha: 0.15),
                delay: const Duration(milliseconds: 0),
              ),
            ),
            Positioned(
              top: 160,
              left: 10,
              child: _FloatingBubble(
                size: 35,
                color: Colors.white.withValues(alpha: 0.1),
                delay: const Duration(milliseconds: 800),
              ),
            ),
            Positioned(
              bottom: 120,
              right: 30,
              child: _FloatingBubble(
                size: 45,
                color: Colors.white.withValues(alpha: 0.12),
                delay: const Duration(milliseconds: 1500),
              ),
            ),
            // ====== 主内容 ======
            Column(
              children: [
                _buildTopBar(),
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                    physics: const BouncingScrollPhysics(),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _buildAnimatedIn(_buildHeroHeader(), 0),
                        const SizedBox(height: 28),
                        _buildAnimatedIn(_buildSectionLabel('📂 选择类别', '你想挑战哪个领域？'), 1),
                        const SizedBox(height: 14),
                        _buildAnimatedIn(_buildCategoryGrid(), 2),
                        const SizedBox(height: 28),
                        _buildAnimatedIn(_buildSectionLabel('⚙️ 选择难度', '选择适合你的挑战等级'), 3),
                        const SizedBox(height: 14),
                        _buildAnimatedIn(_buildDifficultySelector(), 4),
                        const SizedBox(height: 24),
                        _buildAnimatedIn(_buildTipCard(), 5),
                        if (_error != null) ...[
                          const SizedBox(height: 16),
                          _buildErrorMessage(),
                        ],
                        const SizedBox(height: 24),
                        _buildAnimatedIn(_buildStartButton(), 5),
                        const SizedBox(height: 16),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 16, 0),
      child: Row(
        children: [
          _CircleButton(
            onPressed: widget.onExit,
            child: const Icon(Icons.arrow_back_rounded,
                color: Colors.white, size: 24),
          ),
          const Spacer(),
          // 装饰
          const Text('☁️', style: TextStyle(fontSize: 22)),
          const SizedBox(width: 8),
          const Text('⭐', style: TextStyle(fontSize: 16)),
        ],
      ),
    );
  }

  Widget _buildHeroHeader() {
    return Center(
      child: Column(
        children: [
          // 大脑 emoji with 浮动动画
          TweenAnimationBuilder<double>(
            duration: const Duration(seconds: 3),
            tween: Tween<double>(begin: -6, end: 6),
            curve: Curves.easeInOut,
            builder: (context, value, child) {
              return Transform.translate(
                offset: Offset(0, value),
                child: child,
              );
            },
            child: Container(
              width: 96,
              height: 96,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.3),
                shape: BoxShape.circle,
                border: Border.all(
                  color: Colors.white.withValues(alpha: 0.5),
                  width: 2,
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.white.withValues(alpha: 0.3),
                    blurRadius: 20,
                    spreadRadius: 2,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              alignment: Alignment.center,
              child: const Text('🧠', style: TextStyle(fontSize: 50)),
            ),
          ),
          const SizedBox(height: 16),
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.25),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.4),
                width: 1.5,
              ),
            ),
            child: const Text(
              '知识问答',
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w800,
                color: Colors.white,
                letterSpacing: 2,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '选择类别和难度，开启你的脑力冒险！',
            style: TextStyle(
              fontSize: 14,
              color: Colors.white.withValues(alpha: 0.85),
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionLabel(String title, String subtitle) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: Colors.white,
            letterSpacing: 0.5,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          subtitle,
          style: TextStyle(
            fontSize: 12,
            color: Colors.white.withValues(alpha: 0.7),
          ),
        ),
      ],
    );
  }

  Widget _buildCategoryGrid() {
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: kCategories.map((c) {
        final selected = _selectedCategoryId == c['id'];
        return _CategoryChip(
          emoji: c['emoji'] as String,
          label: c['label'] as String,
          selected: selected,
          onTap: () => setState(
            () => _selectedCategoryId = c['id'] as int?,
          ),
        );
      }).toList(),
    );
  }

  Widget _buildDifficultySelector() {
    return Row(
      children: kDifficulties.map((d) {
        final selected = _difficulty == d['id'];
        return Expanded(
          child: Padding(
            padding: EdgeInsets.only(
              right: d == kDifficulties.last ? 0 : 10,
            ),
            child: _DifficultyCard(
              emoji: d['emoji'] as String,
              label: d['label'] as String,
              color: d['color'] as Color,
              selected: selected,
              onTap: () =>
                  setState(() => _difficulty = d['id'] as String),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildTipCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.25),
          width: 1,
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: const Color(0xFFFFCE4E).withValues(alpha: 0.3),
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Text('💡', style: TextStyle(fontSize: 20)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '小提示',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '题目来自国际开源题库（英语），非常适合英语启蒙！答错也没关系，重要的是开眼界。',
                  style: TextStyle(
                    fontSize: 13,
                    color: Colors.white.withValues(alpha: 0.88),
                    height: 1.55,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorMessage() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFF6B6B).withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: const Color(0xFFFF6B6B).withValues(alpha: 0.4),
          width: 1.5,
        ),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: Color(0xFFFF6B6B), size: 22),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              _error!,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 14,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStartButton() {
    return _SpringButton(
      onTap: _loading ? null : _startGame,
      child: Container(
        width: double.infinity,
        height: 60,
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Colors.white, Color(0xFFF8FAFC)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(22),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.15),
              blurRadius: 18,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: _loading
            ? const Center(
                child: SizedBox(
                  width: 26,
                  height: 26,
                  child: CircularProgressIndicator(
                    color: Color(0xFF5AB0D9),
                    strokeWidth: 2.8,
                  ),
                ),
              )
            : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFCE4E).withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child:
                        const Text('🚀', style: TextStyle(fontSize: 22)),
                  ),
                  const SizedBox(width: 12),
                  const Text(
                    '开始答题',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF3A6F8E),
                    ),
                  ),
                  const SizedBox(width: 8),
                  const Icon(Icons.arrow_forward_rounded,
                      size: 22, color: Color(0xFF3A6F8E)),
                ],
              ),
      ),
    );
  }
}

// ==================== 自定义组件 ====================

/// 圆形按钮 - 带半透明背景
class _CircleButton extends StatelessWidget {
  final Widget child;
  final VoidCallback onPressed;

  const _CircleButton({required this.child, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: 0.25),
      shape: const CircleBorder(),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onPressed,
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: child,
        ),
      ),
    );
  }
}

/// 漂浮气泡 - 持续上下浮动
class _FloatingBubble extends StatefulWidget {
  final double size;
  final Color color;
  final Duration delay;

  const _FloatingBubble({
    required this.size,
    required this.color,
    required this.delay,
  });

  @override
  State<_FloatingBubble> createState() => _FloatingBubbleState();
}

class _FloatingBubbleState extends State<_FloatingBubble>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(seconds: 4),
      vsync: this,
    );
    _anim = Tween<double>(begin: -8, end: 8).animate(
      CurvedAnimation(
        parent: _controller,
        curve: Curves.easeInOut,
      ),
    );
    Future.delayed(widget.delay, () {
      if (mounted) {
        _controller.repeat(reverse: true);
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _anim,
      builder: (context, child) {
        return Transform.translate(
          offset: Offset(0, _anim.value),
          child: child,
        );
      },
      child: Container(
        width: widget.size,
        height: widget.size,
        decoration: BoxDecoration(
          color: widget.color,
          shape: BoxShape.circle,
        ),
      ),
    );
  }
}

/// 类别 Chip - 带弹簧按压效果
class _CategoryChip extends StatefulWidget {
  final String emoji;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _CategoryChip({
    required this.emoji,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  State<_CategoryChip> createState() => _CategoryChipState();
}

class _CategoryChipState extends State<_CategoryChip>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 200),
      vsync: this,
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => _controller.forward(),
      onTapUp: (_) {
        _controller.reverse();
        widget.onTap();
      },
      onTapCancel: () => _controller.reverse(),
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          final scale = 1.0 - 0.06 * _controller.value;
          return Transform.scale(
            scale: widget.selected ? scale : scale,
            child: child,
          );
        },
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
          padding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          decoration: BoxDecoration(
            gradient: widget.selected
                ? const LinearGradient(
                    colors: [Colors.white, Color(0xFFF8FAFC)],
                  )
                : null,
            color: widget.selected
                ? null
                : Colors.white.withValues(alpha: 0.2),
            borderRadius: BorderRadius.circular(22),
            border: Border.all(
              color: widget.selected
                  ? Colors.white
                  : Colors.white.withValues(alpha: 0.3),
              width: widget.selected ? 2 : 1.5,
            ),
            boxShadow: widget.selected
                ? [
                    BoxShadow(
                      color: Colors.white.withValues(alpha: 0.4),
                      blurRadius: 14,
                      offset: const Offset(0, 5),
                    ),
                  ]
                : null,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(widget.emoji, style: const TextStyle(fontSize: 16)),
              const SizedBox(width: 6),
              Text(
                widget.label,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: widget.selected
                      ? FontWeight.w800
                      : FontWeight.w600,
                  color: widget.selected
                      ? const Color(0xFF3A6F8E)
                      : Colors.white,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 难度卡片 - 带颜色主题
class _DifficultyCard extends StatefulWidget {
  final String emoji;
  final String label;
  final Color color;
  final bool selected;
  final VoidCallback onTap;

  const _DifficultyCard({
    required this.emoji,
    required this.label,
    required this.color,
    required this.selected,
    required this.onTap,
  });

  @override
  State<_DifficultyCard> createState() => _DifficultyCardState();
}

class _DifficultyCardState extends State<_DifficultyCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 180),
      vsync: this,
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => _controller.forward(),
      onTapUp: (_) {
        _controller.reverse();
        widget.onTap();
      },
      onTapCancel: () => _controller.reverse(),
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          return Transform.scale(
            scale: 1.0 - 0.05 * _controller.value,
            child: child,
          );
        },
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding:
              const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
          decoration: BoxDecoration(
            gradient: widget.selected
                ? LinearGradient(
                    colors: [
                      Colors.white,
                      Colors.white.withValues(alpha: 0.96),
                    ],
                  )
                : null,
            color: widget.selected
                ? null
                : Colors.white.withValues(alpha: 0.2),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: widget.selected
                  ? widget.color
                  : Colors.white.withValues(alpha: 0.3),
              width: widget.selected ? 2.5 : 1.5,
            ),
            boxShadow: widget.selected
                ? [
                    BoxShadow(
                      color: widget.color.withValues(alpha: 0.35),
                      blurRadius: 14,
                      offset: const Offset(0, 5),
                    ),
                  ]
                : null,
          ),
          child: Column(
            children: [
              Text(widget.emoji, style: const TextStyle(fontSize: 26)),
              const SizedBox(height: 8),
              Text(
                widget.label,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: widget.selected
                      ? widget.color
                      : Colors.white,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 弹簧按钮 - 按下回弹
class _SpringButton extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;

  const _SpringButton({required this.child, this.onTap});

  @override
  State<_SpringButton> createState() => _SpringButtonState();
}

class _SpringButtonState extends State<_SpringButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 120),
      vsync: this,
    );
    _scale = Tween<double>(begin: 1.0, end: 0.96).animate(
      CurvedAnimation(
        parent: _controller,
        curve: Curves.easeIn,
      ),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: widget.onTap == null
          ? null
          : (_) => _controller.forward(),
      onTapUp: widget.onTap == null
          ? null
          : (_) {
              _controller.reverse();
              widget.onTap!();
            },
      onTapCancel: () => _controller.reverse(),
      child: AnimatedBuilder(
        animation: _scale,
        builder: (context, child) {
          return Transform.scale(
            scale: _scale.value,
            child: child,
          );
        },
        child: widget.child,
      ),
    );
  }
}