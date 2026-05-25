import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../theme/app_theme.dart';
import '../../providers/user_provider.dart';
import '../../components/empty_state.dart';
import '../../services/api_service.dart';

/// 学科课程列表页
///
/// 从 LearningHomeScreen 点击学科卡片后进入，
/// 展示该学科下的课程列表（从 API 加载），
/// 点击课程后根据类型导航到 contentDetail 或 structuredLesson。
class SubjectContentListScreen extends StatefulWidget {
  final String subject;
  final int? childId;

  const SubjectContentListScreen({
    super.key,
    required this.subject,
    this.childId,
  });

  @override
  State<SubjectContentListScreen> createState() => _SubjectContentListScreenState();
}

class _SubjectContentListScreenState extends State<SubjectContentListScreen> {
  List<Map<String, dynamic>> _courses = [];
  bool _isLoading = true;

  String get subject => widget.subject;
  int? get childId => widget.childId;

  @override
  void initState() {
    super.initState();
    _loadCourses();
  }

  Future<void> _loadCourses() async {
    try {
      final api = context.read<ApiService>();
      final ageGroup = _subjectAgeGroup(subject);

      final list = await api.getContents(domain: subject, ageRange: ageGroup);
      setState(() {
        _courses = list.whereType<Map>().map((c) => c.map((k, v) => MapEntry(k.toString(), v))).toList();
        _isLoading = false;
      });
    } catch (_) {
      setState(() => _isLoading = false);
    }
  }

  String _subjectAgeGroup(String subject) {
    // Default age range based on subject — backend expects '3-4','5-6' etc.
    return '5-6';
  }

  /// 学科 emoji 映射
  String get _subjectEmoji {
    return _subjectMeta[subject]?['emoji'] as String? ?? '📚';
  }

  @override
  Widget build(BuildContext context) {
    return BubbleBackground(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_rounded, color: AppTheme.textColor),
            onPressed: () => Navigator.of(context).pop(),
          ),
          title: Row(
            children: [
              Text(
                _subjectEmoji,
                style: const TextStyle(fontSize: 24),
              ),
              const SizedBox(width: 8),
              Text(
                '$subject 课程',
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.textColor,
                ),
              ),
            ],
          ),
        ),
        body: _buildCourseList(context),
      ),
    );
  }

  Widget _buildCourseList(BuildContext context) {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator(color: AppTheme.primaryColor));
    }

    if (_courses.isEmpty) {
      return const EmptyState(
        emoji: '📚',
        title: '该学科暂无课程',
        subtitle: '更多课程正在制作中，敬请期待 ✨',
      );
    }

    final meta = _subjectMeta[subject];
    final color = meta?['color'] as Color? ?? AppTheme.primaryColor;

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      itemCount: _courses.length,
      itemBuilder: (context, index) {
        final course = _courses[index];
        return _CourseCard(
          title: course['title'] as String? ?? '未命名课程',
          description: course['description'] as String? ?? '',
          type: course['type'] as String? ?? 'normal',
          durationMinutes: (course['durationMinutes'] ?? course['duration_minutes']) as int? ?? 10,
          difficulty: (course['difficulty'] ?? course['level']) as int? ?? 1,
          color: color,
          onTap: () => _navigateToCourse(context, course),
        );
      },
    );
  }

  void _navigateToCourse(BuildContext context, Map<String, dynamic> course) {
    final contentId = (course['contentId'] ?? course['id']) as int? ?? 0;
    final type = course['type'] as String? ?? 'normal';

    int? effectiveChildId = childId;
    if (effectiveChildId == null) {
      try {
        final userProvider = context.read<UserProvider>();
        effectiveChildId = userProvider.activeChildId;
      } catch (_) {}
    }

    final args = <String, dynamic>{
      'contentId': contentId,
      if (effectiveChildId != null) 'childId': effectiveChildId,
    };

    if (type == 'structured') {
      Navigator.pushNamed(context, '/learning/structuredLesson', arguments: args);
    } else {
      Navigator.pushNamed(context, '/learning/contentDetail', arguments: args);
    }
  }

  // ─── 学科元数据 ────────────────────────────────────────────────────────

  static const Map<String, Map<String, dynamic>> _subjectMeta = {
    '语言': {'emoji': '🗣️', 'color': AppTheme.primaryColor},
    '数学': {'emoji': '🔢', 'color': AppTheme.secondaryColor},
    '科学': {'emoji': '🔬', 'color': AppTheme.accentColor},
    '艺术': {'emoji': '🎨', 'color': Color(0xFFDDA0DD)},
    '社会': {'emoji': '🌍', 'color': Color(0xFFFFCE4E)},
    '音乐': {'emoji': '🎵', 'color': Color(0xFFFF85A2)},
  };
}

/// 单个课程卡片
class _CourseCard extends StatelessWidget {
  final String title;
  final String description;
  final String type;
  final int durationMinutes;
  final int difficulty;
  final Color color;
  final VoidCallback onTap;

  const _CourseCard({
    required this.title,
    required this.description,
    required this.type,
    required this.durationMinutes,
    required this.difficulty,
    required this.color,
    required this.onTap,
  });

  bool get _isStructured => type == 'structured';

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.9),
            borderRadius: BorderRadius.circular(AppTheme.cardRadius),
            border: Border.all(color: color.withValues(alpha: 0.15)),
            boxShadow: [
              BoxShadow(
                color: color.withValues(alpha: 0.08),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Row(
            children: [
              // 左侧图标
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(
                  _isStructured ? Icons.list_alt_rounded : Icons.play_circle_fill_rounded,
                  color: color,
                  size: 28,
                ),
              ),
              const SizedBox(width: 14),
              // 中间文本
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            title,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                              color: AppTheme.textColor,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (_isStructured) ...[
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: color.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              '结构化',
                              style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: color),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      description,
                      style: TextStyle(
                        fontSize: 13,
                        color: AppTheme.textSecondary.withValues(alpha: 0.85),
                        height: 1.3,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        _infoChip(Icons.timer_outlined, '$durationMinutes 分钟'),
                        const SizedBox(width: 12),
                        _infoChip(Icons.signal_cellular_alt_rounded, '难度 L$difficulty'),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 4),
              Icon(Icons.arrow_forward_ios_rounded, size: 16,
                  color: AppTheme.textSecondary.withValues(alpha: 0.4)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _infoChip(IconData icon, String label) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: AppTheme.textSecondary.withValues(alpha: 0.5)),
        const SizedBox(width: 4),
        Text(
          label,
          style: TextStyle(
            fontSize: 11,
            color: AppTheme.textSecondary.withValues(alpha: 0.7),
          ),
        ),
      ],
    );
  }
}