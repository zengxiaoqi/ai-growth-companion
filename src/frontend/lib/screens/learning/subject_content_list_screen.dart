import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../theme/app_theme.dart';
import '../../providers/user_provider.dart';

/// 学科课程列表页
///
/// 从 LearningHomeScreen 点击学科卡片后进入，
/// 展示该学科下的课程列表（mock 数据），
/// 点击课程后根据类型导航到 contentDetail 或 structuredLesson。
class SubjectContentListScreen extends StatelessWidget {
  final String subject;
  final int? childId;

  const SubjectContentListScreen({
    super.key,
    required this.subject,
    this.childId,
  });

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

  /// 学科 emoji 映射
  String get _subjectEmoji {
    return _subjectMeta[subject]?['emoji'] as String? ?? '📚';
  }

  Widget _buildCourseList(BuildContext context) {
    final courses = _getMockCourses(subject);

    if (courses.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.school_rounded, size: 64,
                color: AppTheme.textSecondary.withOpacity(0.4)),
            const SizedBox(height: 16),
            const Text(
              '该学科暂无课程',
              style: TextStyle(fontSize: 18, color: AppTheme.textSecondary),
            ),
            const SizedBox(height: 8),
            const Text(
              '更多课程正在制作中，敬请期待 ✨',
              style: TextStyle(fontSize: 14, color: AppTheme.textSecondary),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      itemCount: courses.length,
      itemBuilder: (context, index) {
        final course = courses[index];
        return _CourseCard(
          title: course['title'] as String,
          description: course['description'] as String,
          type: course['type'] as String, // 'structured' | 'normal'
          durationMinutes: course['durationMinutes'] as int? ?? 10,
          difficulty: course['difficulty'] as int? ?? 1,
          color: course['color'] as Color,
          onTap: () => _navigateToCourse(context, course),
        );
      },
    );
  }

  void _navigateToCourse(BuildContext context, Map<String, dynamic> course) {
    final contentId = course['contentId'] as int? ?? 0;
    final type = course['type'] as String? ?? 'normal';

    // 尝试从 Provider 获取 childId，fallback 到参数传入的
    int? effectiveChildId = childId;
    try {
      final userProvider = context.read<UserProvider>();
      if (userProvider.currentUser != null) {
        effectiveChildId = userProvider.currentUser!['id'] as int?;
      }
    } catch (_) {
      // Provider not available, use passed childId
    }

    final args = {
      'contentId': contentId,
      'childId': effectiveChildId,
    };

    if (type == 'structured') {
      Navigator.pushNamed(context, '/learning/structuredLesson', arguments: args);
    } else {
      Navigator.pushNamed(context, '/learning/contentDetail', arguments: args);
    }
  }

  // ─── Mock 课程数据 ────────────────────────────────────────────────────

  static const Map<String, Map<String, dynamic>> _subjectMeta = {
    '语言': {'emoji': '🗣️', 'color': AppTheme.primaryColor},
    '数学': {'emoji': '🔢', 'color': AppTheme.secondaryColor},
    '科学': {'emoji': '🔬', 'color': AppTheme.accentColor},
    '艺术': {'emoji': '🎨', 'color': Color(0xFFDDA0DD)},
    '社会': {'emoji': '🌍', 'color': Color(0xFFFFCE4E)},
    '音乐': {'emoji': '🎵', 'color': Color(0xFFFF85A2)},
  };

  List<Map<String, dynamic>> _getMockCourses(String subject) {
    final meta = _subjectMeta[subject];
    final color = meta?['color'] as Color? ?? AppTheme.primaryColor;

    // 根据学科返回不同的 mock 课程列表
    switch (subject) {
      case '语言':
        return _languageCourses(color);
      case '数学':
        return _mathCourses(color);
      case '科学':
        return _scienceCourses(color);
      case '艺术':
        return _artCourses(color);
      case '社会':
        return _socialCourses(color);
      case '音乐':
        return _musicCourses(color);
      default:
        return [];
    }
  }

  List<Map<String, dynamic>> _languageCourses(Color color) => [
        _course('拼音入门', '学习汉语拼音的声母和韵母，打好识字基础', 'structured', 15, 1, color, 101),
        _course('汉字启蒙', '认识 100 个基础汉字，通过趣味故事加深记忆', 'normal', 10, 1, color, 102),
        _course('儿歌学说话', '通过经典儿歌学习日常用语和表达方式', 'normal', 8, 1, color, 103),
        _course('成语小故事', '听有趣的成语故事，理解寓意，学会运用', 'structured', 12, 2, color, 104),
        _course('古诗欣赏', '背诵经典唐诗，感受中华文化之美', 'normal', 10, 2, color, 105),
      ];

  List<Map<String, dynamic>> _mathCourses(Color color) => [
        _course('认识数字', '从 1 到 100，数数、认数、写数', 'structured', 15, 1, color, 201),
        _course('加法入门', '10 以内的加法运算，用实物辅助理解', 'normal', 10, 1, color, 202),
        _course('形状与空间', '认识常见的平面图形和立体图形', 'structured', 12, 1, color, 203),
        _course('趣味减法', '10 以内的减法运算，游戏化学习', 'normal', 10, 2, color, 204),
        _course('时间与钟表', '认识钟表，学会看时间', 'structured', 15, 2, color, 205),
      ];

  List<Map<String, dynamic>> _scienceCourses(Color color) => [
        _course('动物世界', '认识动物分类，了解动物的生活习性', 'structured', 12, 1, color, 301),
        _course('植物生长', '观察种子发芽到开花结果的全过程', 'structured', 15, 1, color, 302),
        _course('天气与季节', '认识四季变化和不同的天气现象', 'normal', 10, 1, color, 303),
        _course('奇妙的磁力', '动手实验，探索磁铁的吸引与排斥', 'structured', 15, 2, color, 304),
        _course('水的三态', '了解水的固体、液体和气体形态变化', 'normal', 10, 2, color, 305),
      ];

  List<Map<String, dynamic>> _artCourses(Color color) => [
        _course('色彩游戏', '认识三原色，学习调色和搭配', 'normal', 15, 1, color, 401),
        _course('简笔画', '从简单的线条开始，画出可爱的图形', 'structured', 12, 1, color, 402),
        _course('手工折纸', '学习基础折纸技巧，锻炼手眼协调', 'structured', 20, 1, color, 403),
        _course('涂色乐园', '为有趣的图案填色，培养色彩感知', 'normal', 10, 1, color, 404),
      ];

  List<Map<String, dynamic>> _socialCourses(Color color) => [
        _course('我的家庭', '认识家庭成员，了解家庭角色和分工', 'normal', 10, 1, color, 501),
        _course('社区探索', '了解社区里的各种职业和服务', 'structured', 12, 1, color, 502),
        _course('交通规则', '学习基本交通标志和安全出行知识', 'normal', 10, 1, color, 503),
        _course('节日文化', '了解中国重要传统节日的由来和习俗', 'structured', 15, 2, color, 504),
      ];

  List<Map<String, dynamic>> _musicCourses(Color color) => [
        _course('音符启蒙', '认识五线谱和基本音符，培养乐感', 'structured', 12, 1, color, 601),
        _course('节拍律动', '跟随节奏拍手、踏步，感受音乐节拍', 'normal', 10, 1, color, 602),
        _course('儿歌学唱', '学唱经典儿歌，培养音乐兴趣', 'normal', 8, 1, color, 603),
        _course('乐器认知', '认识常见乐器，听辨不同乐器的声音', 'structured', 12, 2, color, 604),
      ];

  Map<String, dynamic> _course(
    String title,
    String description,
    String type,
    int durationMinutes,
    int difficulty,
    Color color,
    int contentId,
  ) {
    return {
      'title': title,
      'description': description,
      'type': type,
      'durationMinutes': durationMinutes,
      'difficulty': difficulty,
      'color': color,
      'contentId': contentId,
    };
  }
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
            color: Colors.white.withOpacity(0.9),
            borderRadius: BorderRadius.circular(AppTheme.cardRadius),
            border: Border.all(color: color.withOpacity(0.15)),
            boxShadow: [
              BoxShadow(
                color: color.withOpacity(0.08),
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
                  gradient: LinearGradient(
                    colors: [color.withOpacity(0.2), color.withOpacity(0.08)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(
                  _isStructured ? Icons.extension_rounded : Icons.menu_book_rounded,
                  size: 28,
                  color: color,
                ),
              ),
              const SizedBox(width: 14),
              // 中间内容
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.textColor,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      description,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 13,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        _tag(Icons.schedule_rounded, '$durationMinutes 分钟'),
                        const SizedBox(width: 8),
                        _tag(Icons.star_rounded, '难度 $difficulty'),
                        const SizedBox(width: 8),
                        _tag(
                          _isStructured ? Icons.extension_rounded : Icons.article_outlined,
                          _isStructured ? '结构化' : '普通',
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              // 右侧箭头
              Icon(Icons.chevron_right_rounded, color: color.withOpacity(0.4)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _tag(IconData icon, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color.withOpacity(0.7)),
          const SizedBox(width: 3),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              color: color.withOpacity(0.8),
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}