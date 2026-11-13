// 学科课程列表页 —— 2026-11-13 重构
//
// 从学习中心点击学科卡片后进入，展示该学科下的课程列表。
// 修复：
//   1. 标题曾直接拼英文 domain（显示「language 课程」）→ 统一走 subject_meta 中文名；
//   2. emoji 查表 key 用中文去查英文表，导致永远显示 📚 → 已修正；
//   3. 卡片写死 `Colors.white`，深色皮肤（space）下正文不可读 → 全部走皮肤 token。
// 增强：学科色头部、类型筛选、骨架屏、下拉刷新、错误重试。

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../theme/app_theme.dart';
import '../../theme/child_theme.dart';
import '../../theme/subject_meta.dart';
import '../../providers/user_provider.dart';
import '../../components/child_home_experience.dart';
import '../../components/empty_state.dart';
import '../../components/shimmer_loading.dart';
import '../../components/top_bar.dart';
import '../../services/api_service.dart';

/// 课程类型筛选
enum _CourseFilter { all, structured, article }

class SubjectContentListScreen extends StatefulWidget {
  final String subject;
  final int? childId;

  const SubjectContentListScreen({
    super.key,
    required this.subject,
    this.childId,
  });

  @override
  State<SubjectContentListScreen> createState() =>
      _SubjectContentListScreenState();
}

class _SubjectContentListScreenState extends State<SubjectContentListScreen> {
  List<Map<String, dynamic>> _courses = [];
  bool _isLoading = true;
  bool _hasError = false;
  _CourseFilter _filter = _CourseFilter.all;

  String get subject => widget.subject;
  int? get childId => widget.childId;

  SubjectMeta get _meta => subjectMetaFor(subject);

  @override
  void initState() {
    super.initState();
    _loadCourses();
  }

  Future<void> _loadCourses() async {
    if (!mounted) return;
    setState(() {
      _isLoading = true;
      _hasError = false;
    });

    try {
      final api = context.read<ApiService>();
      final list = await api.getContents(domain: subject);
      if (!mounted) return;
      setState(() {
        _courses = list
            .whereType<Map>()
            .map((c) => c.map((k, v) => MapEntry(k.toString(), v)))
            .toList();
        _isLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _hasError = true;
      });
    }
  }

  // ─── 数据派生 ──────────────────────────────────────────────────────────

  static String _typeOf(Map<String, dynamic> course) =>
      (course['contentType'] ?? course['type'] ?? '').toString();

  static bool _isStructured(String type) =>
      type == 'structured_lesson' || type == 'video_lesson';

  List<Map<String, dynamic>> get _visibleCourses {
    switch (_filter) {
      case _CourseFilter.all:
        return _courses;
      case _CourseFilter.structured:
        return _courses.where((c) => _isStructured(_typeOf(c))).toList();
      case _CourseFilter.article:
        return _courses.where((c) => !_isStructured(_typeOf(c))).toList();
    }
  }

  int get _structuredCount =>
      _courses.where((c) => _isStructured(_typeOf(c))).length;

  bool get _showFilter =>
      !_isLoading && _structuredCount > 0 && _structuredCount < _courses.length;

  // ─── 导航 ──────────────────────────────────────────────────────────────

  void _navigateToCourse(Map<String, dynamic> course) {
    final courseId = (course['contentId'] ?? course['id']) as int? ?? 0;
    final type = _typeOf(course);

    int? effectiveChildId = childId;
    if (effectiveChildId == null) {
      try {
        effectiveChildId = context.read<UserProvider>().activeChildId;
      } catch (_) {}
    }

    final args = <String, dynamic>{
      'contentId': courseId,
      if (effectiveChildId != null) 'childId': effectiveChildId,
    };

    Navigator.pushNamed(
      context,
      _isStructured(type) ? '/learning/structuredLesson' : '/learning/contentDetail',
      arguments: args,
    );
  }

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);

    return ColoredBox(
      color: palette.paper,
      child: BubbleBackground(
        child: Scaffold(
          backgroundColor: Colors.transparent,
          body: Column(
            children: <Widget>[
              TopBar(
                title: '${_meta.label}课程',
                subtitle: _isLoading
                    ? '正在整理课程…'
                    : (_courses.isEmpty ? '还没有课程' : '共 ${_courses.length} 门'),
                leftSlot: IconButton(
                  icon: const Icon(Icons.arrow_back_rounded),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ),
              Expanded(
                child: SafeArea(
                  top: false,
                  child: RefreshIndicator(
                    color: palette.pop,
                    backgroundColor: palette.card,
                    onRefresh: _loadCourses,
                    child: _buildBody(),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
        children: <Widget>[
          const ShimmerCard(height: 108, margin: EdgeInsets.zero),
          const SizedBox(height: 12),
          ...List<Widget>.generate(
            4,
            (_) => const Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: ShimmerCard(height: 104, margin: EdgeInsets.zero),
            ),
          ),
        ],
      );
    }

    if (_hasError) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: <Widget>[
          const SizedBox(height: 48),
          EmptyState(
            emoji: '😵',
            iconSize: 52,
            title: '课程没加载出来',
            subtitle: '可能是网络打了个盹',
            actionLabel: '再试一次',
            onAction: _loadCourses,
          ),
        ],
      );
    }

    final visible = _visibleCourses;

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      children: <Widget>[
        _buildSubjectHeader(),
        if (_showFilter) ...<Widget>[
          const SizedBox(height: 16),
          _buildFilterRow(),
        ],
        const SizedBox(height: 16),
        if (_courses.isEmpty)
          const EmptyState(
            emoji: '📚',
            title: '这里还空着',
            subtitle: '这个学科的课程正在制作中，先去别的学科逛逛吧 ✨',
          )
        else if (visible.isEmpty)
          const EmptyState(
            emoji: '🔍',
            title: '这一栏还没有内容',
            subtitle: '换个筛选条件看看',
          )
        else
          ...List<Widget>.generate(visible.length, (index) {
            final course = visible[index];
            final type = _typeOf(course);
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _CourseTile(
                meta: _meta,
                title: course['title']?.toString() ?? '未命名课程',
                description: (course['description'] ??
                        course['subtitle'] ??
                        course['summary'] ??
                        '')
                    .toString(),
                isStructured: _isStructured(type),
                minutes: (course['durationMinutes'] ??
                        course['duration_minutes']) as int?,
                difficulty: (course['difficulty'] ?? course['level']) as int?,
                onTap: () => _navigateToCourse(course),
              ),
            );
          }),
      ],
    );
  }

  // ─── 头部 ──────────────────────────────────────────────────────────────

  Widget _buildSubjectHeader() {
    final palette = ChildThemePalette.of(context);
    final color = _meta.colorFor(palette);

    return ChildSticker(
      padding: const EdgeInsets.all(16),
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: <Color>[
          Color.alphaBlend(color.withValues(alpha: 0.24), palette.card),
          Color.alphaBlend(color.withValues(alpha: 0.08), palette.card),
        ],
      ),
      child: Row(
        children: <Widget>[
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: Color.alphaBlend(
                color.withValues(alpha: 0.18),
                palette.card,
              ),
              borderRadius: BorderRadius.circular(palette.radiusMd),
              border: palette.isCartoon
                  ? Border.all(
                      color: color.withValues(alpha: 0.5),
                      width: palette.borderW,
                    )
                  : null,
            ),
            alignment: Alignment.center,
            child: Icon(_meta.icon, size: 28, color: color),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  _meta.label,
                  style: TextStyle(
                    fontSize: 19,
                    height: 1.2,
                    fontWeight: FontWeight.w800,
                    color: palette.ink,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  _meta.tagline,
                  style: TextStyle(
                    fontSize: 12,
                    height: 1.35,
                    color: palette.ink2,
                  ),
                ),
              ],
            ),
          ),
          if (_courses.isNotEmpty)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                '${_courses.length} 门',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: color,
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildFilterRow() {
    return Row(
      children: <Widget>[
        _FilterChip(
          label: '全部',
          count: _courses.length,
          selected: _filter == _CourseFilter.all,
          onTap: () => setState(() => _filter = _CourseFilter.all),
        ),
        const SizedBox(width: 8),
        _FilterChip(
          label: '六步课程',
          count: _structuredCount,
          selected: _filter == _CourseFilter.structured,
          onTap: () => setState(() => _filter = _CourseFilter.structured),
        ),
        const SizedBox(width: 8),
        _FilterChip(
          label: '图文',
          count: _courses.length - _structuredCount,
          selected: _filter == _CourseFilter.article,
          onTap: () => setState(() => _filter = _CourseFilter.article),
        ),
      ],
    );
  }
}

// ════════════════════════════════════════════════════════════════════
//  局部组件
// ════════════════════════════════════════════════════════════════════

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.count,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? palette.pop : palette.card,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: selected ? palette.pop : palette.line,
            width: palette.isCartoon ? 1.5 : 1,
          ),
        ),
        child: Text(
          '$label $count',
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: selected ? palette.onPrimary : palette.ink2,
          ),
        ),
      ),
    );
  }
}

/// 课程行卡：学科色图标块 + 标题/描述/meta + 箭头。
class _CourseTile extends StatelessWidget {
  const _CourseTile({
    required this.meta,
    required this.title,
    required this.description,
    required this.isStructured,
    required this.minutes,
    required this.difficulty,
    required this.onTap,
  });

  final SubjectMeta meta;
  final String title;
  final String description;
  final bool isStructured;
  final int? minutes;
  final int? difficulty;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    final color = meta.colorFor(palette);

    final List<String> facts = <String>[
      if (minutes != null && minutes! > 0) '$minutes 分钟',
      if (difficulty != null && difficulty! > 0) '难度 $difficulty',
    ];

    return ChildJelly(
      onTap: onTap,
      child: ChildSticker(
        padding: const EdgeInsets.all(14),
        radius: palette.radiusMd,
        child: Row(
          children: <Widget>[
            Container(
              width: 48,
              height: 48,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: Color.alphaBlend(
                  color.withValues(alpha: 0.16),
                  palette.card,
                ),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(
                isStructured ? meta.icon : Icons.article_rounded,
                size: 22,
                color: color,
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Row(
                    children: <Widget>[
                      Flexible(
                        child: Text(
                          title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 15,
                            height: 1.3,
                            fontWeight: FontWeight.w700,
                            color: palette.ink,
                          ),
                        ),
                      ),
                      if (isStructured) ...<Widget>[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(
                            color: color.withValues(alpha: 0.14),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            '六步',
                            style: TextStyle(
                              fontSize: 9,
                              fontWeight: FontWeight.w800,
                              color: color,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  if (description.isNotEmpty) ...<Widget>[
                    const SizedBox(height: 4),
                    Text(
                      description,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12,
                        height: 1.4,
                        color: palette.ink2,
                      ),
                    ),
                  ],
                  if (facts.isNotEmpty) ...<Widget>[
                    const SizedBox(height: 6),
                    Row(
                      children: <Widget>[
                        Icon(Icons.schedule_rounded,
                            size: 12, color: palette.ink2),
                        const SizedBox(width: 4),
                        Text(
                          facts.join(' · '),
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: palette.ink2,
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 6),
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.arrow_forward_rounded, size: 15, color: color),
            ),
          ],
        ),
      ),
    );
  }
}
