// UI Refresh: 2026-05-12 — 统一组件 + 微交互动画

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../theme/child_theme.dart';
import '../../components/child_home_experience.dart';
import '../../components/app_card.dart';
import '../../components/empty_state.dart';
import '../../components/section_header.dart';
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
      final newChildId = userProvider.activeChildId;
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

  Future<void> _loadCourses() async {
    final userProvider = context.read<UserProvider>();
    _loadCoursesForChild(userProvider.activeChildId);
  }

  Future<void> _loadCoursesForChild(int? childId) async {
    if (childId == null) {
      if (mounted) setState(() => _loadingCourses = false);
      return;
    }
    try {
      _lastLoadedChildId = childId;
      final apiService = context.read<ApiService>();
      final courses = await apiService.getContents(childId: childId);
      // 同时加载待完成作业
      final assignments = await apiService.getAssignmentsByChild(childId);
      if (mounted) {
        setState(() {
          _courses = courses;
          _assignments = assignments
              .where((a) => a is Map && a['status'] == 'pending')
              .map((a) => Map<String, dynamic>.from(a as Map))
              .toList();
          _loadingCourses = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _loadingCourses = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return BubbleBackground(
      child: SafeArea(
        child: SingleChildScrollView(
          child: Column(
            children: [
              _buildHeader(),
              _buildAssignmentsSection(),
              _buildCoursesSection(),
              _buildSubjectGrid(),
              const SizedBox(height: 8),
              // 英文诗歌赏读
              const EnglishPoetryCard(),
              const SizedBox(height: 8),
              const ScienceExploreSection(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: EdgeInsets.all(20),
      child: Row(
        children: [
          CloudDecoration(size: 32, color: AppTheme.softBlue),
          SizedBox(width: 12),
          Expanded(
            child: SectionHeader(
              title: '学习中心',
              icon: Icons.menu_book_rounded,
              trailing: Text('✨'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAssignmentsSection() {
    if (_loadingCourses) return const SizedBox.shrink();
    if (_assignments.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: SectionHeader(
                  title: '待完成作业',
                  icon: Icons.edit_note_rounded,
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppTheme.primaryColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  '${_assignments.length} 项',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.primaryColor,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 100,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
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

                final typeLabel = _assignmentTypeLabel(type);
                final typeIcon = _assignmentTypeIcon(type);

                final color =
                    AppTheme.childColors[index % AppTheme.childColors.length];

                return AppCard(
                  width: 180,
                  height: 100,
                  onTap: () {
                    Navigator.pushNamed(
                      context,
                      '/learning/assignmentPlay',
                      arguments: {'assignment': assignment},
                    );
                  },
                  gradient: LinearGradient(
                    colors: [
                      color.withValues(alpha: 0.2),
                      color.withValues(alpha: 0.05),
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: color.withValues(alpha: 0.15),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ],
                  child: Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: color.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Icon(typeIcon, color: color, size: 22),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              title,
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: AppTheme.textColor,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 4),
                            Row(
                              children: [
                                Text(
                                  typeLabel,
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: color,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Icon(
                                  Icons.star_rounded,
                                  size: 12,
                                  color: color.withValues(alpha: 0.5),
                                ),
                                Text(
                                  '$difficulty',
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: color.withValues(alpha: 0.7),
                                  ),
                                ),
                              ],
                            ),
                            if (domain.isNotEmpty) ...[
                              const SizedBox(height: 2),
                              Text(
                                domain,
                                style: TextStyle(
                                  fontSize: 11,
                                  color: AppTheme.textSecondary,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 16),
        ],
      ),
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

  Widget _buildCoursesSection() {
    final childId = context.watch<UserProvider>().activeChildId;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Section header
          Row(
            children: [
              const Expanded(
                child: SectionHeader(
                  title: '我的课程',
                  icon: Icons.menu_book_rounded,
                ),
              ),
              if (_courses.isNotEmpty)
                Text(
                  '${_courses.length} 门课',
                  style: TextStyle(
                    fontSize: 14,
                    color: AppTheme.textSecondary,
                  ),
                ),
            ],
          ),
          SizedBox(height: 12),
          // Content
          if (_loadingCourses)
            Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: SizedBox(
                height: 190,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  children: [
                    SizedBox(width: 12),
                    ShimmerCard(width: 180, height: 190),
                    SizedBox(width: 12),
                    ShimmerCard(width: 180, height: 190),
                    SizedBox(width: 12),
                    ShimmerCard(width: 180, height: 190),
                  ],
                ),
              ),
            )
          else if (_courses.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: EmptyState(
                emoji: '🌱',
                title: '暂无课程，等待家长为你生成哦~',
              ),
            )
          else
            SizedBox(
              height: 190,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _courses.length,
                separatorBuilder: (_, __) => const SizedBox(width: 12),
                itemBuilder: (context, index) {
                  final course = _courses[index];
                  final title = course['title'] as String? ?? '未命名课程';
                  final summary = course['summary'] as String? ?? '';
                  final domain = course['domain'] as String? ?? '';
                  final courseId = course['id'];
                  final colorIndex = index % AppTheme.childColors.length;
                  final color = AppTheme.childColors[colorIndex];

                  final contentType = course['contentType']?.toString() ?? '';
                  final isStructured = contentType == 'structured_lesson' ||
                      contentType == 'video_lesson';
                  return _CourseCard(
                    title: title,
                    summary: summary,
                    domain: domain,
                    color: color,
                    onTap: () {
                      Navigator.pushNamed(
                        context,
                        isStructured
                            ? '/learning/structuredLesson'
                            : '/learning/contentDetail',
                        arguments: {
                          'contentId': courseId,
                          'childId': childId,
                        },
                      );
                    },
                  );
                },
              ),
            ),
        ],
      ),
    );
  }

  /// 学科入口：复用首页的大图标网格（同密度档、同贴纸视觉），
  /// 不再用六个撑满整屏的大方块。
  Widget _buildSubjectGrid() {
    final palette = ChildThemePalette.of(context);
    final childId = context.read<UserProvider>().activeChildId;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
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

class _CourseCard extends StatelessWidget {
  final String title;
  final String summary;
  final String domain;
  final Color color;
  final VoidCallback onTap;

  const _CourseCard({
    required this.title,
    required this.summary,
    required this.domain,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AppCard(
        width: 180,
        padding: const EdgeInsets.all(16),
        gradient: LinearGradient(
          colors: [
            color.withValues(alpha: 0.12),
            color.withValues(alpha: 0.04),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: [
          BoxShadow(
            color: color.withValues(alpha: 0.12),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Domain badge
            if (domain.isNotEmpty)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(AppTheme.smallRadius),
                ),
                child: Text(
                  domain,
                  style: TextStyle(
                    fontSize: 11,
                    color: color,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            const SizedBox(height: 8),
            // Title
            Text(
              title,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: AppTheme.textColor,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 6),
            // Summary
            Expanded(
              child: Align(
                alignment: Alignment.topLeft,
                child: Text(
                  summary,
                  style: TextStyle(
                    fontSize: 12,
                    color: AppTheme.textSecondary,
                    height: 1.3,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ),
            const SizedBox(height: 10),
            // Enter button
            Align(
              alignment: Alignment.centerRight,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [color, color.withValues(alpha: 0.7)],
                  ),
                  borderRadius: BorderRadius.circular(AppTheme.smallRadius),
                  boxShadow: [
                    BoxShadow(
                      color: color.withValues(alpha: 0.3),
                      blurRadius: 6,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      '进入学习',
                      style: TextStyle(
                        fontSize: 13,
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    SizedBox(width: 4),
                    Icon(Icons.play_arrow_rounded,
                        color: Colors.white, size: 16),
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
