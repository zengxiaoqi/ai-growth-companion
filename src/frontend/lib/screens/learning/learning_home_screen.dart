// UI Refresh: 2026-05-12 — 统一组件 + 微交互动画

import 'package:flutter/material.dart';
import 'package:vector_math/vector_math_64.dart' show Vector3;
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../components/app_card.dart';
import '../../components/empty_state.dart';
import '../../components/section_header.dart';
import '../../components/shimmer_loading.dart';
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
      if (mounted) {
        setState(() {
          _courses = courses;
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
              _buildCoursesSection(),
              _buildSubjectGrid(),
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
          const SizedBox(width: 12),
          const Expanded(
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
      {'title': '语言', 'icon': Icons.chat_bubble_rounded, 'emoji': '🗣️', 'color': AppTheme.primaryColor, 'gradient': [AppTheme.primaryColor, const Color(0xFFFF9EBB)]},
      {'title': '数学', 'icon': Icons.calculate_rounded, 'emoji': '🔢', 'color': AppTheme.secondaryColor, 'gradient': [AppTheme.secondaryColor, const Color(0xFF9AD0E8)]},
      {'title': '科学', 'icon': Icons.science_rounded, 'emoji': '🔬', 'color': AppTheme.accentColor, 'gradient': [AppTheme.accentColor, const Color(0xFF9AE87A)]},
      {'title': '艺术', 'icon': Icons.palette_rounded, 'emoji': '🎨', 'color': const Color(0xFFDDA0DD), 'gradient': [const Color(0xFFDDA0DD), const Color(0xFFE8B8E8)]},
      {'title': '社会', 'icon': Icons.people_rounded, 'emoji': '🌍', 'color': const Color(0xFFFFCE4E), 'gradient': [const Color(0xFFFFCE4E), const Color(0xFFFFE066)]},
      {'title': '音乐', 'icon': Icons.music_note_rounded, 'emoji': '🎵', 'color': const Color(0xFFFF85A2), 'gradient': [const Color(0xFFFF85A2), const Color(0xFFFFA5B9)]},
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
          icon: subject['icon'] as IconData,
          emoji: subject['emoji'] as String,
          color: subject['color'] as Color,
          gradient: subject['gradient'] as List<Color>,
          index: index,
        );
      },
    );
  }
}

class _SubjectCard extends StatefulWidget {
  final String title;
  final IconData icon;
  final String emoji;
  final Color color;
  final List<Color> gradient;
  final int index;

  const _SubjectCard({
    required this.title,
    required this.icon,
    required this.emoji,
    required this.color,
    required this.gradient,
    required this.index,
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
      onTapDown: (_) => setState(() => _isPressed = true),
      onTapUp: (_) {
        setState(() => _isPressed = false);
        Navigator.pushNamed(
          context,
          '/learning/subjectContentList',
          arguments: {'subject': widget.title},
        );
      },
      onTapCancel: () => setState(() => _isPressed = false),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 100),
        transform: Matrix4.identity()..scaleByVector3(Vector3.all(_isPressed ? 0.95 : 1.0)),
        child: AppCard(
          gradient: LinearGradient(
            colors: [
              widget.gradient[0].withValues(alpha: 0.15),
              widget.gradient[1].withValues(alpha: 0.05),
            ],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          boxShadow: [
            BoxShadow(
              color: widget.color.withValues(alpha: 0.15),
              blurRadius: 20,
              offset: const Offset(0, 8),
            ),
          ],
          child: Stack(
            children: [
              // 背景装饰
              Positioned(
                right: -10,
                top: -10,
                child: AnimatedBuilder(
                  animation: _scaleAnimation,
                  builder: (context, child) {
                    return Transform.scale(
                      scale: _scaleAnimation.value,
                      child: child,
                    );
                  },
                  child: Icon(
                    widget.icon,
                    size: 80,
                    color: widget.color.withValues(alpha: 0.1),
                  ),
                ),
              ),
              Positioned(
                right: 10,
                bottom: 10,
                child: Text(
                  widget.emoji,
                  style: TextStyle(
                    fontSize: 30,
                    color: widget.color.withValues(alpha: 0.3),
                  ),
                ),
              ),
              // 内容
              Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [
                            widget.color.withValues(alpha: 0.2),
                            widget.color.withValues(alpha: 0.1),
                          ],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: widget.color.withValues(alpha: 0.3),
                            blurRadius: 15,
                          ),
                        ],
                      ),
                      child: Icon(widget.icon, size: 40, color: widget.color),
                    ),
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.8),
                        borderRadius: BorderRadius.circular(AppTheme.buttonRadius),
                      ),
                      child: Text(
                        widget.title,
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: widget.color,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.arrow_forward_rounded, size: 16, color: widget.color.withValues(alpha: 0.6)),
                        const SizedBox(width: 4),
                        Text(
                          '开始学习',
                          style: TextStyle(
                            fontSize: 12,
                            color: widget.color.withValues(alpha: 0.6),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
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