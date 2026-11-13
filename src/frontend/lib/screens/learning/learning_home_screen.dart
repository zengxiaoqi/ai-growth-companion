// 学习中心首页 —— 2026-11-13 重构：
//   学习台 Hero（问候 + 真实计数 + 主行动）→ 待完成作业 → 我的课程 → 学科入口
//   → 英文诗歌 → 科学探索
//
// 设计口径沿用孩子端「贴纸」语言（ChildSticker / ChildJelly / ChildSectionTitle），
// 与首页保持一致：粗描边 + 实体下阴影 + 果冻按压，颜色全部走当前皮肤 token。

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../theme/app_theme.dart';
import '../../theme/child_theme.dart';
import '../../theme/subject_meta.dart';
import '../../components/child_home_experience.dart';
import '../../components/shimmer_loading.dart';
import '../../components/science_explore_section.dart';
import '../../components/english_poetry_card.dart';
import '../../services/api_service.dart';
import '../../providers/user_provider.dart';

class LearningHomeScreen extends StatefulWidget {
  const LearningHomeScreen({super.key});

  @override
  State<LearningHomeScreen> createState() => _LearningHomeScreenState();
}

class _LearningHomeScreenState extends State<LearningHomeScreen> {
  List<dynamic> _courses = [];
  bool _loadingCourses = true;
  List<Map<String, dynamic>> _assignments = [];
  int? _lastLoadedChildId;
  VoidCallback? _userProviderListener;

  @override
  void initState() {
    super.initState();
    // 监听 UserProvider 变化，切换孩子时自动刷新
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _attachUserProviderListener();
      _loadCourses();
    });
  }

  @override
  void dispose() {
    _detachUserProviderListener();
    super.dispose();
  }

  void _attachUserProviderListener() {
    final userProvider = context.read<UserProvider>();
    _detachUserProviderListener();
    _userProviderListener = () {
      final newChildId = _effectiveChildId;
      if (newChildId != _lastLoadedChildId) {
        if (mounted) {
          setState(() => _loadingCourses = true);
          _loadCoursesForChild(newChildId);
        }
      }
    };
    userProvider.addListener(_userProviderListener!);
  }

  void _detachUserProviderListener() {
    if (_userProviderListener != null) {
      final userProvider = context.read<UserProvider>();
      userProvider.removeListener(_userProviderListener!);
      _userProviderListener = null;
    }
  }

  /// 当前生效的孩子 ID。
  ///
  /// `activeChildId` 在「孩子快捷登录」等路径下可能尚未写回存储，
  /// 只认它会让整页停在「0 门课程」的空态；因此孩子身份再兜一层
  /// `currentUser['id']`（家长身份不兜底，避免读到家长自己）。
  int? get _effectiveChildId {
    final userProvider = context.read<UserProvider>();
    final active = userProvider.activeChildId;
    if (active != null) return active;
    final user = userProvider.currentUser;
    if (user != null && user['type']?.toString() == 'child') {
      final id = user['id'];
      if (id is int) return id;
      return int.tryParse('$id');
    }
    return null;
  }

  Future<void> _loadCourses() async {
    _loadCoursesForChild(_effectiveChildId);
  }

  Future<void> _loadCoursesForChild(int? childId) async {
    if (childId == null) {
      if (mounted) setState(() => _loadingCourses = false);
      return;
    }
    _lastLoadedChildId = childId;
    final apiService = context.read<ApiService>();

    // 两个请求互相独立：作业接口挂了不应该让课程一起变空
    List<dynamic> courses = <dynamic>[];
    try {
      courses = await apiService.getContents(childId: childId);
    } catch (_) {
      courses = <dynamic>[];
    }

    List<Map<String, dynamic>> assignments = <Map<String, dynamic>>[];
    try {
      final raw = await apiService.getAssignmentsByChild(childId);
      assignments = raw
          .where((a) => a is Map && a['status'] == 'pending')
          .map((a) => Map<String, dynamic>.from(a as Map))
          .toList();
    } catch (_) {
      assignments = <Map<String, dynamic>>[];
    }

    if (!mounted) return;
    setState(() {
      _courses = courses;
      _assignments = assignments;
      _loadingCourses = false;
    });
  }

  // ─── 导航 ──────────────────────────────────────────────────────────────

  void _openContent(dynamic course) {
    if (course is! Map) return;
    final type = course['contentType']?.toString() ?? '';
    final isStructured = type == 'structured_lesson' || type == 'video_lesson';
    Navigator.pushNamed(
      context,
      isStructured ? '/learning/structuredLesson' : '/learning/contentDetail',
      arguments: <String, dynamic>{
        'contentId': course['id'],
        'childId': _effectiveChildId,
      },
    );
  }

  // ─── 构建 ──────────────────────────────────────────────────────────────

  String get _greeting {
    final hour = DateTime.now().hour;
    if (hour < 6) return '夜深了';
    if (hour < 11) return '早上好';
    if (hour < 14) return '中午好';
    if (hour < 18) return '下午好';
    return '晚上好';
  }

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    return BubbleBackground(
      child: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: palette.pop,
          backgroundColor: palette.card,
          onRefresh: () async => _loadCoursesForChild(_effectiveChildId),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.only(top: 12, bottom: 28),
            children: <Widget>[
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: _buildHero(palette),
              ),
              const SizedBox(height: 26),
              if (_loadingCourses)
                _buildCourseSkeleton()
              else ...<Widget>[
                if (_assignments.isNotEmpty) ...<Widget>[
                  _buildAssignmentsSection(),
                  const SizedBox(height: 26),
                ],
                _buildCoursesSection(),
                const SizedBox(height: 26),
              ],
              _buildSubjectGrid(),
              const SizedBox(height: 26),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 20),
                child: EnglishPoetryCard(),
              ),
              const SizedBox(height: 22),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 20),
                child: ScienceExploreSection(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ─── Hero：学习台 ──────────────────────────────────────────────────────

  Widget _buildHero(ChildThemePalette palette) {
    final userName =
        context.watch<UserProvider>().currentUser?['name']?.toString().trim() ??
            '';
    final displayName = userName.isEmpty ? '小朋友' : userName;
    final firstCourse = _courses.isNotEmpty ? _courses.first : null;
    final firstTitle = firstCourse is Map
        ? (firstCourse['title']?.toString().trim() ?? '')
        : '';
    final todoCount = _assignments.length;
    final courseCount = _courses.length;

    return ChildSticker(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: <Color>[
          Color.alphaBlend(palette.pop.withValues(alpha: 0.16), palette.card),
          Color.alphaBlend(
            palette.subjects.isNotEmpty
                ? palette.subjects[1].withValues(alpha: 0.13)
                : palette.cta.withValues(alpha: 0.12),
            palette.card,
          ),
        ],
      ),
      child: Stack(
        clipBehavior: Clip.none,
        children: <Widget>[
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(
                          '学习中心',
                          style: TextStyle(
                            fontSize: 11,
                            height: 1.2,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1.6,
                            color: palette.pop,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          '$_greeting，$displayName',
                          style: TextStyle(
                            fontSize: 24,
                            height: 1.15,
                            fontWeight: FontWeight.w800,
                            color: palette.ink,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          todoCount > 0
                              ? '有 $todoCount 件小事在等你，先挑一个？'
                              : '今天想学点什么？挑一个开始吧',
                          style: TextStyle(
                            fontSize: 13,
                            height: 1.4,
                            color: palette.ink2,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  const ChildMascot(size: 52),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                children: <Widget>[
                  Expanded(
                    child: _StatPill(
                      icon: Icons.edit_note_rounded,
                      value: '$todoCount',
                      unit: '项',
                      label: '待完成作业',
                      highlight: todoCount > 0,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _StatPill(
                      icon: Icons.menu_book_rounded,
                      value: '$courseCount',
                      unit: '门',
                      label: '可学课程',
                      highlight: false,
                    ),
                  ),
                ],
              ),
              if (firstCourse != null) ...<Widget>[
                const SizedBox(height: 16),
                ChildJelly(
                  onTap: () => _openContent(firstCourse),
                  child: Container(
                    height: palette.density.ctaHeight,
                    padding: const EdgeInsets.symmetric(horizontal: 18),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: <Color>[
                          palette.cta,
                          Color.lerp(palette.cta, Colors.white, 0.18) ??
                              palette.cta,
                        ],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(palette.radiusMd),
                      border: palette.isCartoon
                          ? Border.all(
                              color: Color.lerp(palette.cta, palette.ink, 0.3)!,
                              width: palette.borderW,
                            )
                          : null,
                      boxShadow: <BoxShadow>[
                        BoxShadow(
                          color: palette.cta.withValues(alpha: 0.35),
                          blurRadius: 14,
                          offset: const Offset(0, 6),
                        ),
                      ],
                    ),
                    child: Row(
                      children: <Widget>[
                        Icon(Icons.play_arrow_rounded,
                            size: 22, color: palette.ctaInk),
                        const SizedBox(width: 6),
                        Text(
                          '接着学',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: palette.ctaInk,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            firstTitle.isEmpty ? '我的第一门课' : '《$firstTitle》',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: palette.ctaInk.withValues(alpha: 0.72),
                            ),
                          ),
                        ),
                        Icon(Icons.arrow_forward_rounded,
                            size: 18,
                            color: palette.ctaInk.withValues(alpha: 0.8)),
                      ],
                    ),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildCourseSkeleton() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        SizedBox(
          height: 112,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 20),
            itemCount: 3,
            physics: const NeverScrollableScrollPhysics(),
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (_, __) => const ShimmerCard(
              width: 208,
              height: 112,
              margin: EdgeInsets.zero,
            ),
          ),
        ),
        const SizedBox(height: 26),
        SizedBox(
          height: 196,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 20),
            itemCount: 3,
            physics: const NeverScrollableScrollPhysics(),
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (_, __) => const ShimmerCard(
              width: 168,
              height: 196,
              margin: EdgeInsets.zero,
            ),
          ),
        ),
      ],
    );
  }

  // ─── 待完成作业 ────────────────────────────────────────────────────────

  Widget _buildAssignmentsSection() {
    final palette = ChildThemePalette.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: ChildSectionTitle(
            title: '待完成作业',
            icon: Icons.edit_note_rounded,
            trailing: _CountChip(
              text: '${_assignments.length} 项',
              color: palette.pop,
            ),
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 112,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 20),
            itemCount: _assignments.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (context, index) {
              final assignment = _assignments[index];
              final activityData = assignment['activityData'];
              final title = (activityData is Map
                      ? (activityData['title']?.toString() ??
                          activityData['topic']?.toString())
                      : null) ??
                  '作业';
              final type = assignment['activityType']?.toString() ?? 'quiz';
              final domain = assignment['domain']?.toString() ?? '';
              final difficulty = assignment['difficulty'] as int? ?? 1;

              return _AssignmentCard(
                title: title,
                typeLabel: _assignmentTypeLabel(type),
                typeIcon: _assignmentTypeIcon(type),
                domainLabel: subjectMetaFor(domain).label,
                difficulty: difficulty,
                index: index,
                onTap: () {
                  Navigator.pushNamed(
                    context,
                    '/learning/assignmentPlay',
                    arguments: {'assignment': assignment},
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }

  String _assignmentTypeLabel(String type) {
    const labels = {
      'quiz': '选择题',
      'true_false': '判断题',
      'matching': '配对游戏',
      'fill_blank': '填空游戏',
      'sequencing': '排序游戏',
      'connection': '连线游戏',
      'puzzle': '拼图游戏',
      'drag_sort': '分类游戏',
      'memory_flip': '记忆翻牌',
      'pattern_next': '规律接龙',
      'trace_path': '描红游戏',
      'color_fill': '涂色游戏',
      'tap_target': '听指令点一点',
    };
    return labels[type] ?? '互动游戏';
  }

  IconData _assignmentTypeIcon(String type) {
    const icons = {
      'quiz': Icons.quiz_rounded,
      'true_false': Icons.check_circle_outline_rounded,
      'matching': Icons.compare_arrows_rounded,
      'fill_blank': Icons.edit_note_rounded,
      'sequencing': Icons.sort_rounded,
      'connection': Icons.link_rounded,
      'puzzle': Icons.extension_rounded,
      'drag_sort': Icons.category_outlined,
      'memory_flip': Icons.style_outlined,
      'pattern_next': Icons.auto_awesome_outlined,
      'trace_path': Icons.draw_outlined,
      'color_fill': Icons.palette_outlined,
      'tap_target': Icons.hearing_outlined,
    };
    return icons[type] ?? Icons.play_circle_rounded;
  }

  // ─── 我的课程 ──────────────────────────────────────────────────────────

  Widget _buildCoursesSection() {
    final palette = ChildThemePalette.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: ChildSectionTitle(
            title: '我的课程',
            icon: Icons.menu_book_rounded,
            trailing: _courses.isEmpty
                ? null
                : _CountChip(
                    text: '${_courses.length} 门',
                    color: palette.ink2,
                  ),
          ),
        ),
        const SizedBox(height: 12),
        if (_courses.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 20),
            child: _EmptyCoursesCard(),
          )
        else
          SizedBox(
            height: 196,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 20),
              itemCount: _courses.length,
              separatorBuilder: (_, __) => const SizedBox(width: 12),
              itemBuilder: (context, index) {
                final course = _courses[index];
                if (course is! Map) return const SizedBox.shrink();
                final courseType = course['contentType']?.toString() ?? '';
                return _CourseCard(
                  index: index,
                  title: course['title']?.toString() ?? '未命名课程',
                  summary: (course['subtitle'] ?? course['summary'] ?? '')
                      .toString(),
                  meta: subjectMetaFor(course['domain']?.toString()),
                  minutes: (course['durationMinutes'] ??
                          course['duration_minutes']) as int?,
                  difficulty:
                      (course['difficulty'] ?? course['level']) as int?,
                  isStructured: courseType == 'structured_lesson' ||
                      courseType == 'video_lesson',
                  onTap: () => _openContent(course),
                );
              },
            ),
          ),
      ],
    );
  }

  /// 学科入口：复用首页的大图标网格（同密度档、同贴纸视觉），
  /// 不再用六个撑满整屏的大方块。
  Widget _buildSubjectGrid() {
    final palette = ChildThemePalette.of(context);
    final childId = _effectiveChildId;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: ChildSubjectGrid(
        density: palette.density,
        onPick: (key) => Navigator.pushNamed(
          context,
          '/learning/subjectContentList',
          arguments: <String, dynamic>{
            'subject': key.name,
            'childId': childId,
          },
        ),
        onMusic: () => Navigator.pushNamed(context, '/music'),
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════════
//  局部组件
// ════════════════════════════════════════════════════════════════════

/// Hero 里的计数胶囊：数字大字 + 单位小字 + 说明。
class _StatPill extends StatelessWidget {
  const _StatPill({
    required this.icon,
    required this.value,
    required this.unit,
    required this.label,
    required this.highlight,
  });

  final IconData icon;
  final String value;
  final String unit;
  final String label;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Color.alphaBlend(
          (highlight ? palette.pop : palette.ink).withValues(alpha: 0.07),
          palette.card,
        ),
        borderRadius: BorderRadius.circular(palette.radiusMd),
        border: palette.isCartoon
            ? Border.all(color: palette.line, width: 1.5)
            : null,
      ),
      child: Row(
        children: <Widget>[
          Icon(icon,
              size: 18,
              color: highlight ? palette.pop : palette.ink2),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Row(
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: <Widget>[
                    Text(
                      value,
                      style: TextStyle(
                        fontSize: 19,
                        height: 1.1,
                        fontWeight: FontWeight.w800,
                        color: highlight ? palette.pop : palette.ink,
                      ),
                    ),
                    const SizedBox(width: 2),
                    Text(
                      unit,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: palette.ink2,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 11,
                    height: 1.2,
                    color: palette.ink2,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// 区块标题右侧的小计数标签。
class _CountChip extends StatelessWidget {
  const _CountChip({required this.text, required this.color});

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    );
  }
}

/// 难度圆点：3 级，实心表示当前难度。
class _LevelDots extends StatelessWidget {
  const _LevelDots({required this.level, required this.color});

  final int level;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    final safe = level.clamp(1, 3);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List<Widget>.generate(3, (i) {
        final on = i < safe;
        return Container(
          width: 5,
          height: 5,
          margin: const EdgeInsets.only(right: 3),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: on ? color : palette.ink2.withValues(alpha: 0.22),
          ),
        );
      }),
    );
  }
}

/// 待完成作业卡：图标块 + 标题 + 类型 + 难度。
class _AssignmentCard extends StatelessWidget {
  const _AssignmentCard({
    required this.title,
    required this.typeLabel,
    required this.typeIcon,
    required this.domainLabel,
    required this.difficulty,
    required this.index,
    required this.onTap,
  });

  final String title;
  final String typeLabel;
  final IconData typeIcon;
  final String domainLabel;
  final int difficulty;
  final int index;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    final color = palette.subjects[index % palette.subjects.length];

    return ChildJelly(
      onTap: onTap,
      tiltDegrees: palette.isCartoon ? (index.isEven ? -0.6 : 0.6) : 0,
      child: ChildSticker(
        width: 208,
        padding: const EdgeInsets.all(12),
        radius: palette.radiusMd,
        background: Color.alphaBlend(
          color.withValues(alpha: 0.10),
          palette.card,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(11),
                  ),
                  child: Icon(typeIcon, color: color, size: 20),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      title,
                      style: TextStyle(
                        fontSize: 14,
                        height: 1.3,
                        fontWeight: FontWeight.w700,
                        color: palette.ink,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
              ],
            ),
            const Spacer(),
            Row(
              children: <Widget>[
                Flexible(
                  child: Text(
                    domainLabel.isEmpty ? typeLabel : domainLabel,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: color,
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  '·',
                  style: TextStyle(fontSize: 11, color: palette.ink2),
                ),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    typeLabel,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: palette.ink2,
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                _LevelDots(level: difficulty, color: color),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// 课程卡：封面色块 + 学科 emoji + 标题 + meta。
class _CourseCard extends StatelessWidget {
  const _CourseCard({
    required this.index,
    required this.title,
    required this.summary,
    required this.meta,
    required this.minutes,
    required this.difficulty,
    required this.isStructured,
    required this.onTap,
  });

  final int index;
  final String title;
  final String summary;
  final SubjectMeta meta;
  final int? minutes;
  final int? difficulty;
  final bool isStructured;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    final color = meta.colorFor(palette);

    final List<String> facts = <String>[
      if (minutes != null && minutes! > 0) '$minutes 分钟',
      if (isStructured) '六步课程' else if (difficulty != null) '难度 $difficulty',
    ];

    return ChildJelly(
      onTap: onTap,
      tiltDegrees: palette.isCartoon ? (index.isEven ? -0.6 : 0.6) : 0,
      child: ChildSticker(
        width: 168,
        padding: EdgeInsets.zero,
        radius: palette.radiusLg,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            // 封面
            Container(
              height: 72,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: <Color>[
                    Color.alphaBlend(
                      color.withValues(alpha: 0.30),
                      palette.card,
                    ),
                    Color.alphaBlend(
                      color.withValues(alpha: 0.12),
                      palette.card,
                    ),
                  ],
                ),
                borderRadius: BorderRadius.vertical(
                  top: Radius.circular(palette.radiusLg - 2),
                ),
              ),
              child: Stack(
                children: <Widget>[
                  Center(
                    child: Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: Color.alphaBlend(
                          color.withValues(alpha: 0.22),
                          palette.card,
                        ),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(meta.icon, size: 24, color: color),
                    ),
                  ),
                  Positioned(
                    left: 10,
                    bottom: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 7, vertical: 2),
                      decoration: BoxDecoration(
                        color: Color.alphaBlend(
                          color.withValues(alpha: 0.16),
                          palette.card,
                        ),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        meta.label,
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          color: color,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            // 文字区
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      title,
                      style: TextStyle(
                        fontSize: 14,
                        height: 1.3,
                        fontWeight: FontWeight.w700,
                        color: palette.ink,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (summary.isNotEmpty) ...<Widget>[
                      const SizedBox(height: 4),
                      Expanded(
                        child: Text(
                          summary,
                          style: TextStyle(
                            fontSize: 11,
                            height: 1.35,
                            color: palette.ink2,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ] else
                      const Spacer(),
                    const SizedBox(height: 6),
                    Row(
                      children: <Widget>[
                        Expanded(
                          child: Text(
                            facts.join(' · '),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                              color: palette.ink2,
                            ),
                          ),
                        ),
                        Container(
                          width: 22,
                          height: 22,
                          decoration: BoxDecoration(
                            color: color.withValues(alpha: 0.16),
                            shape: BoxShape.circle,
                          ),
                          child: Icon(Icons.arrow_forward_rounded,
                              size: 13, color: color),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 没有课程时的友好提示（不是冰冷的「暂无数据」）。
class _EmptyCoursesCard extends StatelessWidget {
  const _EmptyCoursesCard();

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    return ChildSticker(
      child: Row(
        children: <Widget>[
          const Text('🌱', style: TextStyle(fontSize: 34)),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  '还没有课程',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: palette.ink,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '让爸爸妈妈帮你生成一门，或者先挑个学科逛逛',
                  style: TextStyle(
                    fontSize: 12,
                    height: 1.4,
                    color: palette.ink2,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
