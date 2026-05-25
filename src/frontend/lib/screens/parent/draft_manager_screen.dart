import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../components/empty_state.dart';
import '../../components/shimmer_loading.dart';
import '../../components/top_bar.dart';
import '../../providers/user_provider.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import 'child_selector.dart';

/// 家长端草稿管理页面
///
/// 展示所有 AI 生成的草稿课程，支持按孩子筛选、
/// 继续编辑、预览和删除操作。
class DraftManagerScreen extends StatefulWidget {
  const DraftManagerScreen({super.key});

  @override
  State<DraftManagerScreen> createState() => _DraftManagerScreenState();
}

class _DraftManagerScreenState extends State<DraftManagerScreen> {
  // ── 孩子数据 ──
  bool _isLoadingChildren = true;
  List<Map<String, dynamic>> _children = [];
  int? _selectedChildId;

  // ── 草稿数据 ──
  bool _isLoadingDrafts = false;
  List<Map<String, dynamic>> _drafts = [];
  String? _error;

  // ── 领域颜色映射 ──
  static const Map<String, Color> _domainColors = {
    'language': AppTheme.softPink,
    'math': AppTheme.softBlue,
    'science': AppTheme.softMint,
    'art': AppTheme.softPurple,
    'social': AppTheme.softOrange,
  };

  static const Map<String, String> _domainLabels = {
    'language': '语言',
    'math': '数学',
    'science': '科学',
    'art': '艺术',
    'social': '社交',
  };

  // ── 课程类型映射 ──
  static const Map<String, _CourseTypeInfo> _courseTypeInfo = {
    'video': _CourseTypeInfo(label: '视频', icon: Icons.play_circle_outline_rounded),
    'reading': _CourseTypeInfo(label: '阅读', icon: Icons.menu_book_outlined),
    'writing': _CourseTypeInfo(label: '写作', icon: Icons.edit_outlined),
    'game': _CourseTypeInfo(label: '练习', icon: Icons.sports_esports_outlined),
  };

  @override
  void initState() {
    super.initState();
    _loadChildren();
  }

  // ── 数据加载 ──

  Future<void> _loadChildren() async {
    final parentId = _currentParentId;
    if (parentId == null) {
      if (mounted) {
        setState(() {
          _isLoadingChildren = false;
          _children = [];
        });
      }
      return;
    }
    final api = context.read<ApiService>();
    final rawChildren = await api.getChildrenByParent(parentId);
    final children = rawChildren
        .whereType<Map>()
        .map((e) => e.map((k, v) => MapEntry(k.toString(), v)))
        .toList();
    if (!mounted) return;
    setState(() {
      _children = children;
      _selectedChildId = _toInt(
          children.isNotEmpty ? children.first['id'] : null);
      _isLoadingChildren = false;
    });
    if (_selectedChildId != null) {
      _loadDrafts();
    }
  }

  Future<void> _loadDrafts() async {
    if (_selectedChildId == null) return;
    setState(() {
      _isLoadingDrafts = true;
      _error = null;
    });
    final api = context.read<ApiService>();
    try {
      final rawDrafts = await api.getDraftLessons(_selectedChildId!);
      final drafts = rawDrafts
          .whereType<Map>()
          .map((e) => e.map((k, v) => MapEntry(k.toString(), v)))
          .toList();
      if (!mounted) return;
      setState(() {
        _drafts = drafts;
        _isLoadingDrafts = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '加载草稿失败: $e';
        _isLoadingDrafts = false;
      });
    }
  }

  Future<void> _deleteDraft(Map<String, dynamic> draft) async {
    final contentId = _toInt(draft['id']);
    final title = draft['title']?.toString() ?? '未命名课程';
    if (contentId == null) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20)),
        title: const Text('确认删除'),
        content: Text('确定要删除草稿"$title"吗？\n删除后无法恢复。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('取消'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red.shade400,
              foregroundColor: Colors.white,
            ),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    final api = context.read<ApiService>();
    final success = await api.deleteLessonDraft(contentId);
    if (!mounted) return;
    if (success) {
      setState(() {
        _drafts.removeWhere(
            (d) => _toInt(d['id']) == contentId);
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('草稿已删除'),
            backgroundColor: Color(0xFF0B8F55),
          ),
        );
      }
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('删除失败，请稍后重试'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  void _showPreview(Map<String, dynamic> draft) {
    final title = draft['title']?.toString() ?? '未命名课程';
    final domain = draft['domain']?.toString() ?? '';
    final domainLabel = _domainLabels[domain] ?? domain;
    final steps = _parseSteps(draft);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return DraggableScrollableSheet(
          initialChildSize: 0.6,
          minChildSize: 0.3,
          maxChildSize: 0.85,
          expand: false,
          builder: (ctx, scrollController) {
            return ListView(
              controller: scrollController,
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
              children: [
                // 标题
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.textColor,
                  ),
                ),
                if (domain.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: (_domainColors[domain] ?? AppTheme.primaryColor)
                          .withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      domainLabel,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color:
                            _domainColors[domain] ?? AppTheme.primaryColor,
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                // 步骤摘要
                if (steps.isEmpty)
                  const Text(
                    '暂无课程步骤',
                    style: TextStyle(
                        fontSize: 14, color: AppTheme.textSecondary),
                  )
                else
                  ...steps.asMap().entries.map((entry) {
                    final i = entry.key;
                    final step = entry.value;
                    final stepTitle =
                        step['title']?.toString() ?? '步骤 ${i + 1}';
                    final stepType = step['type']?.toString() ?? '';
                    final typeInfo =
                        _courseTypeInfo[stepType];
                    final preview = step['preview']?.toString() ?? '';
                    return Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppTheme.backgroundColor,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 28,
                            height: 28,
                            decoration: BoxDecoration(
                              color: AppTheme.primaryColor
                                  .withValues(alpha: 0.12),
                              borderRadius:
                                  BorderRadius.circular(8),
                            ),
                            child: Center(
                              child: Text(
                                '${i + 1}',
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.bold,
                                  color: AppTheme.primaryColor,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment:
                                  CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    if (typeInfo != null) ...[
                                      Icon(
                                        typeInfo.icon,
                                        size: 16,
                                        color: AppTheme.textSecondary,
                                      ),
                                      const SizedBox(width: 4),
                                      Text(
                                        typeInfo.label,
                                        style: const TextStyle(
                                          fontSize: 11,
                                          color: AppTheme.textSecondary,
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                    ],
                                    Expanded(
                                      child: Text(
                                        stepTitle,
                                        style: const TextStyle(
                                          fontSize: 14,
                                          fontWeight: FontWeight.w600,
                                          color: AppTheme.textColor,
                                        ),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                  ],
                                ),
                                if (preview.isNotEmpty) ...[
                                  const SizedBox(height: 4),
                                  Text(
                                    preview,
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: AppTheme.textSecondary,
                                    ),
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ],
                      ),
                    );
                  }),
              ],
            );
          },
        );
      },
    );
  }

  Future<void> _publishDraft(Map<String, dynamic> draft) async {
    final contentId = _toInt(draft['id']);
    if (contentId == null) return;
    final childId = _selectedChildId;
    if (childId == null) return;

    final title = draft['title']?.toString() ?? '未命名课程';

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20)),
        title: const Text('确认发布'),
        content: Text('确定要发布"$title"吗？\n发布后课程将加入孩子的学习计划。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('取消'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.primaryColor,
              foregroundColor: Colors.white,
            ),
            child: const Text('发布'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    final api = context.read<ApiService>();
    final result = await api.confirmLesson(contentId, childId);
    if (!mounted) return;

    if (result != null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('"$title" 已成功发布！'),
            backgroundColor: const Color(0xFF0B8F55),
          ),
        );
      }
      _loadDrafts();
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('发布失败，请稍后重试'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _continueEdit(Map<String, dynamic> draft) async {
    final contentId = _toInt(draft['id']);
    if (contentId == null) return;
    await Navigator.pushNamed(
      context,
      '/parent/lessonGenerator',
      arguments: {'draftContentId': contentId},
    );
    _loadDrafts();
  }

  // ── 辅助方法 ──

  int? get _currentParentId {
    final user = context.read<UserProvider>().currentUser;
    return _toInt(user?['id']);
  }

  int? _toInt(dynamic value) {
    if (value is int) return value;
    return int.tryParse(value?.toString() ?? '');
  }

  /// 从草稿数据中解析课程步骤摘要
  List<Map<String, dynamic>> _parseSteps(Map<String, dynamic> draft) {
    final content = draft['content'];
    Map<String, dynamic>? parsed;
    if (content is String) {
      try {
        parsed = jsonDecode(content) as Map<String, dynamic>;
      } catch (_) {
        return [];
      }
    } else if (content is Map) {
      parsed = content.map((k, v) => MapEntry(k.toString(), v));
    }
    if (parsed == null) return [];

    final rawSteps = parsed['steps'];
    if (rawSteps is! List || rawSteps.isEmpty) return [];

    return rawSteps.whereType<Map>().map((step) {
      final module = step['module'];
      final moduleType =
          module is Map ? module['type']?.toString() ?? '' : '';
      String preview = '';
      int? count;
      if (module is Map) {
        if (moduleType == 'video') {
          final scenes = module['visualStory']?['scenes'] ??
              module['videoLesson']?['shots'];
          if (scenes is List && scenes.isNotEmpty) {
            count = scenes.length;
            preview = '共 $count 个动画场景';
          }
        } else if (moduleType == 'reading') {
          final text = module['reading']?['text']?.toString();
          if (text != null && text.isNotEmpty) {
            preview = text.length > 60
                ? '${text.substring(0, 60)}...'
                : text;
          }
        } else if (moduleType == 'writing') {
          final items = module['writing']?['tracingItems'];
          if (items is List && items.isNotEmpty) {
            preview = '描红: ${items.join(', ')}';
          }
        } else if (moduleType == 'game') {
          final questions = module['game']?['activityData']
                  ?['questions'] ??
              module['game']?['questions'];
          if (questions is List && questions.isNotEmpty) {
            count = questions.length;
            preview = '共 $count 道互动题';
          }
        }
      }
      return <String, dynamic>{
        'title': step['label']?.toString() ?? '',
        'type': moduleType,
        'preview': preview,
        'count': count,
      };
    }).toList();
  }

  /// 提取课程主要类型标签（取第一步的类型）
  String _primaryCourseType(Map<String, dynamic> draft) {
    final steps = _parseSteps(draft);
    if (steps.isEmpty) return '';
    final firstType = steps.first['type']?.toString() ?? '';
    return firstType;
  }

  /// 格式化日期字符串
  String _formatDate(String? isoDate) {
    if (isoDate == null || isoDate.isEmpty) return '';
    try {
      final dt = DateTime.parse(isoDate).toLocal();
      final now = DateTime.now();
      final diff = now.difference(dt);
      if (diff.inMinutes < 1) return '刚刚';
      if (diff.inHours < 1) return '${diff.inMinutes} 分钟前';
      if (diff.inDays < 1) return '${diff.inHours} 小时前';
      if (diff.inDays < 7) return '${diff.inDays} 天前';
      return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
    } catch (_) {
      return isoDate;
    }
  }

  // ── UI 构建 ──

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      body: Column(
        children: [
          TopBar(
            title: '课程草稿',
            subtitle: '管理 AI 生成的课程草稿',
            leftSlot: IconButton(
              onPressed: () => Navigator.of(context).pop(),
              icon: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppTheme.backgroundColor,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.arrow_back_rounded,
                    size: 20, color: AppTheme.textColor),
              ),
            ),
          ),
          Expanded(child: _buildBody()),
        ],
      ),
    );
  }

  Widget _buildBody() {
    // 加载孩子列表中的骨架屏
    if (_isLoadingChildren) {
      return const Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          children: [
            ShimmerCard(height: 72),
            SizedBox(height: 12),
            ShimmerCard(height: 100),
            SizedBox(height: 12),
            ShimmerCard(height: 100),
            SizedBox(height: 12),
            ShimmerCard(height: 100),
          ],
        ),
      );
    }

    // 没有孩子
    if (_children.isEmpty) {
      return const EmptyState(
        emoji: '👨‍👧',
        title: '暂无绑定孩子',
        subtitle: '请先在设置中绑定孩子账户',
      );
    }

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: ChildSelector(
            children: _children,
            selectedChildId: _selectedChildId,
            onChildChanged: (child) {
              setState(() {
                _selectedChildId = _toInt(child['id']);
              });
              _loadDrafts();
            },
            mode: ChildSelectorMode.bottomSheet,
            title: '筛选孩子',
          ),
        ),
        Expanded(child: _buildDraftList()),
      ],
    );
  }

  Widget _buildDraftList() {
    // 加载草稿中
    if (_isLoadingDrafts) {
      return ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: List.generate(
          4,
          (_) => const Padding(
            padding: EdgeInsets.only(bottom: 12),
            child: ShimmerCard(height: 140),
          ),
        ),
      );
    }

    // 错误状态
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline_rounded,
                  size: 48, color: AppTheme.textSecondary),
              const SizedBox(height: 12),
              Text(
                _error!,
                style: const TextStyle(color: AppTheme.textSecondary),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _loadDrafts,
                child: const Text('重试'),
              ),
            ],
          ),
        ),
      );
    }

    // 空状态
    if (_drafts.isEmpty) {
      return EmptyState(
        emoji: '📝',
        title: '暂无草稿',
        subtitle: '去 AI 课程生成页面创建吧',
        actionLabel: '去生成课程',
        onAction: () => Navigator.pushNamed(
            context, '/parent/lessonGenerator'),
      );
    }

    // 草稿列表
    return RefreshIndicator(
      onRefresh: _loadDrafts,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        itemCount: _drafts.length,
        itemBuilder: (context, index) {
          return _buildDraftCard(_drafts[index]);
        },
      ),
    );
  }

  Widget _buildDraftCard(Map<String, dynamic> draft) {
    final title = draft['title']?.toString() ?? '未命名课程';
    final domain = draft['domain']?.toString() ?? '';
    final domainLabel = _domainLabels[domain] ?? (domain.isNotEmpty ? domain : '综合');
    final domainColor = _domainColors[domain] ?? AppTheme.primaryColor;
    final courseType = _primaryCourseType(draft);
    final typeInfo = _courseTypeInfo[courseType];
    final createdAt = _formatDate(draft['created_at']?.toString());
    final updatedAt = _formatDate(draft['updated_at']?.toString());

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: AppTheme.softShadow(),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 卡片内容
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 标题行
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        title,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.textColor,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (courseType.isNotEmpty && typeInfo != null) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: domainColor.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(typeInfo.icon,
                                size: 14, color: domainColor),
                            const SizedBox(width: 4),
                            Text(
                              typeInfo.label,
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: domainColor,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 10),
                // 领域标签
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    // 领域标签
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: domainColor.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        domainLabel,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: domainColor,
                        ),
                      ),
                    ),
                    // 状态标签
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppTheme.softYellow.withValues(alpha: 0.3),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.edit_note_rounded,
                              size: 14, color: Color(0xFFB8860B)),
                          SizedBox(width: 4),
                          Text(
                            '草稿',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: Color(0xFFB8860B),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                // 时间信息
                Row(
                  children: [
                    if (createdAt.isNotEmpty) ...[
                      Icon(Icons.add_circle_outline_rounded,
                          size: 14, color: AppTheme.textSecondary),
                      const SizedBox(width: 4),
                      Text(
                        '创建: $createdAt',
                        style: const TextStyle(
                          fontSize: 11,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                    ],
                    if (createdAt.isNotEmpty && updatedAt.isNotEmpty) ...[
                      const SizedBox(width: 12),
                    ],
                    if (updatedAt.isNotEmpty) ...[
                      Icon(Icons.update_rounded,
                          size: 14, color: AppTheme.textSecondary),
                      const SizedBox(width: 4),
                      Text(
                        '更新: $updatedAt',
                        style: const TextStyle(
                          fontSize: 11,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          // 分隔线 + 操作按钮
          Divider(height: 1, color: Colors.grey.shade100),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
            child: Row(
              children: [
                _buildActionButton(
                  icon: Icons.edit_outlined,
                  label: '编辑',
                  color: AppTheme.primaryColor,
                  onTap: () => _continueEdit(draft),
                ),
                _buildActionButton(
                  icon: Icons.visibility_outlined,
                  label: '预览',
                  color: AppTheme.secondaryColor,
                  onTap: () => _showPreview(draft),
                ),
                _buildActionButton(
                  icon: Icons.outbox_outlined,
                  label: '发布',
                  color: const Color(0xFF0B8F55),
                  onTap: () => _publishDraft(draft),
                ),
                _buildActionButton(
                  icon: Icons.delete_outline_rounded,
                  label: '删除',
                  color: Colors.red.shade400,
                  onTap: () => _deleteDraft(draft),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionButton({
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onTap,
  }) {
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 16, color: color),
              const SizedBox(width: 4),
              Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: color,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 课程类型信息
class _CourseTypeInfo {
  final String label;
  final IconData icon;
  const _CourseTypeInfo({required this.label, required this.icon});
}