// UI Refresh: 2026-05-12 — 统一组件 + 微交互动画

import 'package:flutter/material.dart';
import 'package:vector_math/vector_math_64.dart' show Vector3;
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
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
      final courses = await context.read<ApiService>().getContents(childId: childId);
      // 同时加载待完成作业
      final assignments = await context.read<ApiService>().getAssignmentsByChild(childId);
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
    return const Padding(
      padding: EdgeInsets.all(20),
      child: Row(
        children: [
          CloudDecoration(size: 32, color: AppTheme.softBlue),
          SizedBox(width: 12),
          Expanded(
            child: SectionHeader(
              title: '学习中心',
              emoji: '📚',
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
                  emoji: '📝',
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppTheme.primaryColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  '${_assignments.length} 项',
                  style: const TextStyle(
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

                final color = AppTheme.childColors[
                    index % AppTheme.childColors.length];

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
                              style: const TextStyle(
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
                                style: const TextStyle(
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
                  emoji: '📚',
                ),
              ),
              if (_courses.isNotEmpty)
                Text(
                  '${_courses.length} 门课',
                  style: const TextStyle(
                    fontSize: 14,
                    color: AppTheme.textSecondary,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          // Content
          if (_loadingCourses)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: SizedBox(
                height: 140,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  children: const [
                    SizedBox(width: 12),
                    ShimmerCard(width: 180, height: 140),
                    SizedBox(width: 12),
                    ShimmerCard(width: 180, height: 140),
                    SizedBox(width: 12),
                    ShimmerCard(width: 180, height: 140),
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
              height: 140,
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

                  return _CourseCard(
                    title: title,
                    summary: summary,
                    domain: domain,
                    color: color,
                    onTap: () {
                      Navigator.pushNamed(
                        context,
                        '/learning/structuredLesson',
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

  Widget _buildSubjectGrid() {
    final subjects = [
      {'title': '语言', 'domain': 'language', 'icon': Icons.chat_bubble_rounded, 'emoji': '🗣️', 'color': AppTheme.primaryColor, 'gradient': [AppTheme.primaryColor, const Color(0xFFFF9EBB)]},
      {'title': '数学', 'domain': 'math', 'icon': Icons.calculate_rounded, 'emoji': '🔢', 'color': AppTheme.secondaryColor, 'gradient': [AppTheme.secondaryColor, const Color(0xFF9AD0E8)]},
      {'title': '科学', 'domain': 'science', 'icon': Icons.science_rounded, 'emoji': '🔬', 'color': AppTheme.accentColor, 'gradient': [AppTheme.accentColor, const Color(0xFF9AE87A)]},
      {'title': '艺术', 'domain': 'art', 'icon': Icons.palette_rounded, 'emoji': '🎨', 'color': const Color(0xFFDDA0DD), 'gradient': [const Color(0xFFDDA0DD), const Color(0xFFE8B8E8)]},
      {'title': '社会', 'domain': 'social', 'icon': Icons.people_rounded, 'emoji': '🌍', 'color': const Color(0xFFFFCE4E), 'gradient': [const Color(0xFFFFCE4E), const Color(0xFFFFE066)]},
      {'title': '音乐', 'domain': 'music', 'icon': Icons.music_note_rounded, 'emoji': '🎵', 'color': const Color(0xFFFF85A2), 'gradient': [const Color(0xFFFF85A2), const Color(0xFFFFA5B9)]},
    ];

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 16,
        crossAxisSpacing: 16,
        childAspectRatio: 0.9,
      ),
      itemCount: subjects.length,
      itemBuilder: (context, index) {
        final subject = subjects[index];
        return _SubjectCard(
          title: subject['title'] as String,
          domain: subject['domain'] as String,
          icon: subject['icon'] as IconData,
          emoji: subject['emoji'] as String,
          color: subject['color'] as Color,
          gradient: subject['gradient'] as List<Color>,
          index: index,
          onTap: () {
            final childId = context.read<UserProvider>().activeChildId;
            Navigator.pushNamed(
              context,
              '/learning/subjectContentList',
              arguments: {
                'subject': subject['domain'] as String,
                'childId': childId,
              },
            );
          },
        );
      },
    );
  }
}

class _SubjectCard extends StatefulWidget {
  final String title;
  final String domain;
  final IconData icon;
  final String emoji;
  final Color color;
  final List<Color> gradient;
  final int index;
  final VoidCallback onTap;

  const _SubjectCard({
    required this.title,
    required this.domain,
    required this.icon,
    required this.emoji,
    required this.color,
    required this.gradient,
    required this.index,
    required this.onTap,
  });

  @override
  State<_SubjectCard> createState() => _SubjectCardState();
}

class _SubjectCardState extends State<_SubjectCard> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  bool _isPressed = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat(reverse: true);

    _scaleAnimation = Tween<double>(begin: 1.0, end: 1.05).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
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
      onTap: widget.onTap,
      onTapDown: (_) => setState(() => _isPressed = true),
      onTapUp: (_) => setState(() => _isPressed = false),
      onTapCancel: () => setState(() => _isPressed = false),
      child: AnimatedBuilder(
        animation: _scaleAnimation,
        builder: (context, child) {
          return Transform(
            alignment: Alignment.center,
            transform: _isPressed
                ? Matrix4.diagonal3Values(0.95, 0.95, 1)
                : Matrix4.identity(),
            child: child,
          );
        },
        child: AnimatedBuilder(
          animation: _scaleAnimation,
          builder: (context, child) {
            return Transform(
              alignment: Alignment.center,
              transform: Matrix4.diagonal3Values(
                _scaleAnimation.value,
                _scaleAnimation.value,
                1,
              ),
              child: child,
            );
          },
          child: AppCard(
            gradient: LinearGradient(
              colors: [
                widget.gradient[0].withValues(alpha: 0.15),
                widget.gradient[1].withValues(alpha: 0.08),
              ],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            boxShadow: [
              BoxShadow(
                color: widget.color.withValues(alpha: 0.12),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  widget.emoji,
                  style: const TextStyle(fontSize: 32),
                ),
                const SizedBox(height: 8),
                Text(
                  widget.title,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textColor,
                  ),
                ),
              ],
            ),
          ),
        ),
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
              style: const TextStyle(
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
              child: Text(
                summary,
                style: const TextStyle(
                  fontSize: 12,
                  color: AppTheme.textSecondary,
                  height: 1.3,
                ),
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(height: 10),
            // Enter button
            Align(
              alignment: Alignment.centerRight,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
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
                    Icon(Icons.play_arrow_rounded, color: Colors.white, size: 16),
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