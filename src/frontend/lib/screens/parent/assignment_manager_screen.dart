import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../components/empty_state.dart';
import '../../components/shimmer_loading.dart';
import '../../components/top_bar.dart';
import '../../providers/user_provider.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../learning/animation_scene_player.dart';
import 'child_selector.dart';

/// 家长端作业管理页面
/// 功能：
/// - 布置新作业（主题 + 活动类型 + 领域 + 难度）
/// - 查看草稿作业列表
/// - 查看已布置作业列表
/// - 编辑/删除待完成作业
class AssignmentManagerScreen extends StatefulWidget {
  const AssignmentManagerScreen({super.key});

  @override
  State<AssignmentManagerScreen> createState() =>
      _AssignmentManagerScreenState();
}

class _AssignmentManagerScreenState extends State<AssignmentManagerScreen> {
  // 领域配置（与 Web 端保持一致）
  static const List<_DomainMeta> _domains = [
    _DomainMeta(key: 'language', label: '语言', color: Color(0xFF006384)),
    _DomainMeta(key: 'math', label: '数学', color: Color(0xFF586000)),
    _DomainMeta(key: 'science', label: '科学', color: Color(0xFF705900)),
    _DomainMeta(key: 'art', label: '艺术', color: Color(0xFFB9AE6E)),
    _DomainMeta(key: 'social', label: '社会', color: Color(0xFFB02500)),
  ];

  // 活动类型配置（与 Web 端 ACTIVITY_TYPES 一致）
  static const List<_ActivityTypeMeta> _activityTypes = [
    _ActivityTypeMeta(value: 'quiz', label: '选择题'),
    _ActivityTypeMeta(value: 'true_false', label: '判断题'),
    _ActivityTypeMeta(value: 'fill_blank', label: '填空题'),
    _ActivityTypeMeta(value: 'matching', label: '配对游戏'),
    _ActivityTypeMeta(value: 'connection', label: '连线游戏'),
    _ActivityTypeMeta(value: 'sequencing', label: '排序游戏'),
    _ActivityTypeMeta(value: 'puzzle', label: '拼图游戏'),
    _ActivityTypeMeta(value: 'video', label: '视频'),
    _ActivityTypeMeta(value: 'animation', label: '动画'),
    _ActivityTypeMeta(value: 'lesson', label: '课程'),
  ];

  // 难度等级
  static const List<_DifficultyMeta> _difficulties = [
    _DifficultyMeta(level: 1, label: '简单'),
    _DifficultyMeta(level: 2, label: '中等'),
    _DifficultyMeta(level: 3, label: '挑战'),
  ];

  // 孩子列表与选中状态
  bool _isLoadingChildren = true;
  List<Map<String, dynamic>> _children = [];
  int? _selectedChildId;

  // 数据加载状态
  bool _isLoadingData = false;
  List<Map<String, dynamic>> _assignments = [];
  List<Map<String, dynamic>> _draftLessons = [];
  String? _error;

  // 创建面板状态
  bool _showCreatePanel = false;
  final TextEditingController _topicController = TextEditingController();
  String _selectedActivityType = 'quiz';
  String _selectedDomain = 'language';
  int _selectedDifficulty = 1;
  bool _isCreating = false;

  // 编辑状态
  int? _editingId;
  final TextEditingController _editTopicController = TextEditingController();
  String _editActivityType = 'quiz';
  String _editDomain = 'language';
  int _editDifficulty = 1;
  int? _mutatingId; // 正在执行编辑/删除的作业 ID

  @override
  void initState() {
    super.initState();
    _loadChildren();
  }

  @override
  void dispose() {
    _topicController.dispose();
    _editTopicController.dispose();
    super.dispose();
  }

  // ==================== 数据加载 ====================

  /// 加载孩子列表
  Future<void> _loadChildren() async {
    final parentId = _currentParentId;
    if (parentId == null) {
      setState(() {
        _isLoadingChildren = false;
        _children = [];
      });
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
      _selectedChildId =
          _toInt(children.isNotEmpty ? children.first['id'] : null);
      _isLoadingChildren = false;
    });

    if (_selectedChildId != null) {
      await _loadData();
    }
  }

  /// 加载作业和草稿数据
  Future<void> _loadData() async {
    final childId = _selectedChildId;
    if (childId == null) return;

    setState(() {
      _isLoadingData = true;
      _error = null;
    });

    final api = context.read<ApiService>();
    final parentId = _currentParentId;

    try {
      final results = await Future.wait([
        parentId != null ? api.getAssignmentsByParent(parentId) : Future.value([]),
        api.getDraftLessons(childId),
      ]);

      if (!mounted) return;

      final rawAssignments = results[0]
          .whereType<Map>()
          .map((e) => e.map((k, v) => MapEntry(k.toString(), v)))
          .toList();

      final rawDrafts = results[1]
          .whereType<Map>()
          .map((e) => e.map((k, v) => MapEntry(k.toString(), v)))
          .toList();

      setState(() {
        _assignments = rawAssignments;
        _draftLessons = rawDrafts;
        _isLoadingData = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '加载数据失败，请稍后重试';
        _isLoadingData = false;
      });
    }
  }

  /// 孩子切换回调
  Future<void> _onChildChanged(Map<String, dynamic> child) async {
    final nextId = _toInt(child['id']);
    if (nextId == null || nextId == _selectedChildId) return;

    setState(() {
      _selectedChildId = nextId;
      _assignments = [];
      _draftLessons = [];
    });

    await _loadData();
  }

  // ==================== 创建作业 ====================

  /// 创建新作业
  Future<void> _createAssignment() async {
    final topic = _topicController.text.trim();
    if (topic.isEmpty || _selectedChildId == null) return;

    setState(() {
      _isCreating = true;
      _error = null;
    });

    final api = context.read<ApiService>();
    final parentId = _currentParentId;

    try {
      final result = await api.createAssignment({
        'parentId': parentId,
        'childId': _selectedChildId,
        'activityType': _selectedActivityType,
        'domain': _selectedDomain,
        'difficulty': _selectedDifficulty,
        'activityData': {'topic': topic},
      });

      if (!mounted) return;

      if (result != null && result['error'] == null) {
        _topicController.clear();
        setState(() {
          _showCreatePanel = false;
          _isCreating = false;
        });
        await _loadData();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('作业布置成功！'),
              backgroundColor: Color(0xFF0B8F55),
            ),
          );
        }
      } else {
        setState(() {
          _error = '创建作业失败，请稍后重试';
          _isCreating = false;
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '创建作业失败：$e';
        _isCreating = false;
      });
    }
  }

  // ==================== 编辑/删除作业 ====================

  /// 开始编辑作业
  void _startEdit(Map<String, dynamic> assignment) {
    final activityData = assignment['activityData'];
    setState(() {
      _editingId = _toInt(assignment['id']);
      _editTopicController.text =
          activityData is Map ? (activityData['topic']?.toString() ?? '') : '';
      _editActivityType = assignment['activityType']?.toString() ?? 'quiz';
      _editDomain = assignment['domain']?.toString() ?? 'language';
      _editDifficulty = _toInt(assignment['difficulty']) ?? 1;
      _error = null;
    });
  }

  /// 判断是否视频/动画/课程类内容类型
  bool _isVideoContentType(String? contentType) {
    if (contentType == null) return false;
    final ct = contentType.toLowerCase();
    return ct == 'video' || ct == 'animation' || ct == 'lesson';
  }

  /// 判断是否视频/动画/课程类活动类型
  bool _isVideoActivityType(String? activityType) {
    if (activityType == null) return false;
    final at = activityType.toLowerCase();
    return at == 'video' || at == 'animation' || at == 'lesson';
  }

  /// 从草稿/课程数据中提取场景列表
  List<Map<String, dynamic>> _extractScenes(Map<String, dynamic> draft) {
    final lessonData = draft['lessonData'];
    if (lessonData is! Map) return [];

    final steps = lessonData['steps'];
    if (steps is! List) return [];

    final List<Map<String, dynamic>> allScenes = [];

    for (final step in steps) {
      if (step is! Map) continue;
      final modules = step['modules'];
      if (modules is! List) continue;

      for (final module in modules) {
        if (module is! Map) continue;
        final type = module['type']?.toString().toLowerCase() ?? '';
        if (type != 'video' && type != 'animation') continue;

        final scenes = module['visualStory']?['scenes'] ??
            module['videoLesson']?['shots'] ?? [];
        if (scenes is List) {
          for (final scene in scenes) {
            if (scene is Map) {
              allScenes.add(Map<String, dynamic>.from(scene));
            }
          }
        }
      }
    }

    return allScenes;
  }

  /// 取消编辑
  void _cancelEdit() {
    setState(() {
      _editingId = null;
      _editTopicController.clear();
      _error = null;
    });
  }

  /// 保存编辑
  Future<void> _saveEdit() async {
    final id = _editingId;
    final topic = _editTopicController.text.trim();
    if (id == null || topic.isEmpty) return;

    setState(() {
      _mutatingId = id;
      _error = null;
    });

    final api = context.read<ApiService>();

    try {
      final result = await api.updateAssignment(id, {
        'activityType': _editActivityType,
        'domain': _editDomain,
        'difficulty': _editDifficulty,
        'topic': topic,
      });

      if (!mounted) return;

      if (result != null && result['error'] == null) {
        setState(() {
          _editingId = null;
          _editTopicController.clear();
          _mutatingId = null;
        });
        await _loadData();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('作业已更新'),
              backgroundColor: Color(0xFF0B8F55),
            ),
          );
        }
      } else {
        setState(() {
          _error = '更新作业失败，请稍后重试';
          _mutatingId = null;
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '更新作业失败：$e';
        _mutatingId = null;
      });
    }
  }

  /// 删除作业
  Future<void> _deleteAssignment(int id) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('确认删除'),
        content: const Text('确认删除这条待完成作业吗？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('删除'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    setState(() {
      _mutatingId = id;
      _error = null;
    });

    final api = context.read<ApiService>();
    final success = await api.deleteAssignment(id);

    if (!mounted) return;

    if (success) {
      if (_editingId == id) {
        _cancelEdit();
      }
      setState(() => _mutatingId = null);
      await _loadData();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('作业已删除'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } else {
      setState(() {
        _error = '删除作业失败，请稍后重试';
        _mutatingId = null;
      });
    }
  }

  // ==================== 构建 UI ====================

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      body: Column(
        children: [
          TopBar(
            title: '作业管理',
            subtitle: '布置和管理孩子的学习任务',
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
    if (_isLoadingChildren) {
      return const Center(
        child: CircularProgressIndicator(color: AppTheme.primaryColor),
      );
    }

    if (_children.isEmpty) {
      return const EmptyState(
        emoji: '👶',
        title: '暂无孩子账号',
        subtitle: '请先在家长端关联孩子，之后可布置作业。',
      );
    }

    return RefreshIndicator(
      color: AppTheme.primaryColor,
      onRefresh: _loadData,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          // 孩子选择器
          ChildSelector(
            children: _children,
            selectedChildId: _selectedChildId,
            onChildChanged: _onChildChanged,
            mode: ChildSelectorMode.bottomSheet,
          ),
          const SizedBox(height: 14),

          // 错误提示
          if (_error != null) _buildErrorBanner(),

          // 布置作业按钮 + 创建面板
          _buildCreateSection(),
          const SizedBox(height: 16),

          // 草稿作业列表
          _buildDraftSection(),
          const SizedBox(height: 16),

          // 已布置作业列表
          _buildAssignmentSection(),
        ],
      ),
    );
  }

  /// 错误提示横幅
  Widget _buildErrorBanner() {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.red.shade50,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.red.shade200),
      ),
      child: Row(
        children: [
          Icon(Icons.error_outline_rounded, color: Colors.red.shade700, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              _error!,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: Colors.red.shade700,
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// 创建作业区域（按钮 + 展开面板）
  Widget _buildCreateSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ElevatedButton.icon(
          onPressed: () {
            setState(() {
              _showCreatePanel = !_showCreatePanel;
              _error = null;
            });
          },
          icon: Icon(
            _showCreatePanel ? Icons.expand_less_rounded : Icons.add_rounded,
            size: 22,
          ),
          label: Text(_showCreatePanel ? '收起面板' : '布置作业'),
          style: ElevatedButton.styleFrom(
            backgroundColor: _showCreatePanel
                ? AppTheme.secondaryColor
                : AppTheme.primaryColor,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
          ),
        ),
        if (_showCreatePanel) ...[
          const SizedBox(height: 12),
          _buildCreatePanel(),
        ],
      ],
    );
  }

  /// 创建作业面板
  Widget _buildCreatePanel() {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '创建新作业',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: AppTheme.textColor,
              ),
            ),
            const SizedBox(height: 16),

            // 主题输入
            _buildSectionLabel('作业主题'),
            const SizedBox(height: 6),
            TextField(
              controller: _topicController,
              decoration: InputDecoration(
                hintText: '例如：认识数字 1-10',
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide.none,
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide(color: Colors.grey.shade200),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide:
                      const BorderSide(color: AppTheme.primaryColor, width: 2),
                ),
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              ),
            ),
            const SizedBox(height: 16),

            // 活动类型选择
            _buildSectionLabel('活动类型'),
            const SizedBox(height: 6),
            _buildChipSelector(
              items: _activityTypes
                  .map((t) => _ChipItem(value: t.value, label: t.label))
                  .toList(),
              selectedValue: _selectedActivityType,
              onSelected: (v) => setState(() => _selectedActivityType = v),
            ),
            const SizedBox(height: 16),

            // 领域选择
            _buildSectionLabel('学习领域'),
            const SizedBox(height: 6),
            _buildChipSelector(
              items: _domains
                  .map((d) => _ChipItem(value: d.key, label: d.label))
                  .toList(),
              selectedValue: _selectedDomain,
              onSelected: (v) => setState(() => _selectedDomain = v),
              selectedColor: const Color(0xFF4A4A4A),
            ),
            const SizedBox(height: 16),

            // 难度选择
            _buildSectionLabel('难度等级'),
            const SizedBox(height: 6),
            _buildChipSelector(
              items: _difficulties
                  .map((d) => _ChipItem(
                        value: d.level.toString(),
                        label: d.label,
                      ))
                  .toList(),
              selectedValue: _selectedDifficulty.toString(),
              onSelected: (v) =>
                  setState(() => _selectedDifficulty = int.parse(v)),
              selectedColor: AppTheme.accentColor,
            ),
            const SizedBox(height: 18),

            // 确认按钮
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: (_isCreating ||
                        _topicController.text.trim().isEmpty ||
                        _selectedChildId == null)
                    ? null
                    : _createAssignment,
                icon: _isCreating
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.assignment_turned_in_rounded, size: 20),
                label: Text(_isCreating ? '创建中...' : '确认布置'),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// 草稿作业列表
  Widget _buildDraftSection() {
    if (_isLoadingData) {
      return const SizedBox(
        height: 200,
        child: Center(child: ShimmerCard(height: 120)),
      );
    }

    // 按孩子过滤并按时间倒序
    final drafts = _draftLessons
        .where((d) =>
            _selectedChildId == null ||
            _toInt(d['childId']) == _selectedChildId)
        .toList()
      ..sort((a, b) {
        final at = _toDateTime(a['createdAt']);
        final bt = _toDateTime(b['createdAt']);
        if (at == null && bt == null) return 0;
        if (at == null) return 1;
        if (bt == null) return -1;
        return bt.compareTo(at);
      });

    if (drafts.isEmpty) {
      return const EmptyState(
        emoji: '📝',
        title: '暂无草稿作业',
        subtitle: '未发布的一键生成课程会显示在这里，方便继续查看和编辑。',
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionTitle('草稿作业'),
        const SizedBox(height: 8),
        ...drafts.map((draft) => _buildDraftCard(draft)),
      ],
    );
  }

  /// 草稿卡片
  Widget _buildDraftCard(Map<String, dynamic> draft) {
    final domainKey = draft['domain']?.toString() ?? '';
    final domain = _domains.firstWhere(
      (d) => d.key == domainKey,
      orElse: () => _domains.first,
    );
    final contentType = draft['contentType']?.toString() ?? '';
    final isCoursePack = contentType == 'course_pack';
    final isVideoDraft = _isVideoContentType(contentType);
    final hasScenes =
        isVideoDraft && _extractScenes(draft).isNotEmpty;
    final title = draft['title']?.toString() ?? '未命名草稿';
    final subtitle = draft['subtitle']?.toString();
    final createdAt = _toDateTime(draft['createdAt']);

    return Card(
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          children: [
            Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: isCoursePack
                        ? AppTheme.primaryColor.withValues(alpha: 0.15)
                        : AppTheme.secondaryColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    isCoursePack
                        ? Icons.menu_book_rounded
                        : Icons.note_alt_rounded,
                    size: 20,
                    color: isCoursePack
                        ? AppTheme.primaryColor
                        : AppTheme.secondaryColor,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              title,
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.bold,
                                color: AppTheme.textColor,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(width: 6),
                          _buildDomainBadge(domain),
                        ],
                      ),
                      if (subtitle != null && subtitle.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(
                          subtitle,
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppTheme.textSecondary,
                          ),
                        ),
                      ],
                      if (createdAt != null) ...[
                        const SizedBox(height: 2),
                        Text(
                          _formatDate(createdAt),
                          style: const TextStyle(
                            fontSize: 11,
                            color: AppTheme.textSecondary,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: isCoursePack
                        ? AppTheme.primaryColor.withValues(alpha: 0.12)
                        : AppTheme.secondaryColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    isCoursePack ? '课程包' : '草稿',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: isCoursePack
                          ? AppTheme.primaryColor
                          : AppTheme.secondaryColor,
                    ),
                  ),
                ),
              ],
            ),
            // 视频/动画/课程类草稿的预览按钮
            if (isVideoDraft) ...[
              const SizedBox(height: 10),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  if (hasScenes)
                    TextButton.icon(
                      onPressed: () => _showVideoPreview(context, draft),
                      icon: const Icon(Icons.play_circle_outline_rounded,
                          size: 18),
                      label: const Text('预览场景'),
                      style: TextButton.styleFrom(
                        foregroundColor: AppTheme.primaryColor,
                        padding:
                            const EdgeInsets.symmetric(horizontal: 10),
                        minimumSize: const Size(0, 32),
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                    ),
                  const SizedBox(width: 4),
                  TextButton.icon(
                    onPressed: () {
                      Navigator.pushNamed(
                          context, '/parent/lessonGenerator');
                    },
                    icon: const Icon(Icons.auto_fix_high_rounded, size: 18),
                    label: const Text('去课程生成器'),
                    style: TextButton.styleFrom(
                      foregroundColor: AppTheme.secondaryColor,
                      padding:
                          const EdgeInsets.symmetric(horizontal: 10),
                      minimumSize: const Size(0, 32),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// 视频/动画作业场景预览（底部弹出面板）
  void _showVideoPreview(BuildContext context, Map<String, dynamic> draft) {
    final scenes = _extractScenes(draft);
    final title = draft['title']?.toString() ?? '未命名草稿';

    if (scenes.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('暂无可预览的场景数据'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _VideoPreviewSheet(
        title: title,
        scenes: scenes,
        theme: Theme.of(context),
      ),
    );
  }

  /// 已布置作业列表
  Widget _buildAssignmentSection() {
    if (_isLoadingData) {
      return const SizedBox(
        height: 200,
        child: Center(child: ShimmerCard(height: 120)),
      );
    }

    // 按孩子过滤并按时间倒序
    final filtered = _assignments
        .where((a) =>
            _selectedChildId == null ||
            _toInt(a['childId']) == _selectedChildId)
        .toList()
      ..sort((a, b) {
        final at = _toDateTime(a['createdAt']);
        final bt = _toDateTime(b['createdAt']);
        if (at == null && bt == null) return 0;
        if (at == null) return 1;
        if (bt == null) return -1;
        return bt.compareTo(at);
      });

    if (filtered.isEmpty) {
      return const EmptyState(
        emoji: '📋',
        title: '暂无作业',
        subtitle: '点击上方按钮为孩子布置作业',
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionTitle('已布置作业'),
        const SizedBox(height: 8),
        ...filtered.map((assignment) => _buildAssignmentCard(assignment)),
      ],
    );
  }

  /// 已布置作业卡片
  Widget _buildAssignmentCard(Map<String, dynamic> assignment) {
    final id = _toInt(assignment['id']);
    final status = assignment['status']?.toString() ?? 'pending';
    final isCompleted = status == 'completed';
    final isPending = status == 'pending';
    final isEditing = id != null && _editingId == id;
    final isBusy = id != null && _mutatingId == id;

    final domainKey = assignment['domain']?.toString() ?? '';
    final domain = _domains.firstWhere(
      (d) => d.key == domainKey,
      orElse: () => _domains.first,
    );

    final activityType = assignment['activityType']?.toString() ?? '';
    final activityLabel = _activityTypes
            .firstWhere(
              (t) => t.value == activityType,
              orElse: () => _activityTypes.first,
            )
            .label;

    final activityData = assignment['activityData'];
    final topic = activityData is Map
        ? activityData['topic']?.toString()
        : null;
    final displayTitle = topic?.isNotEmpty == true ? topic! : activityType;

    final score = _toInt(assignment['score']);
    final createdAt = _toDateTime(assignment['createdAt']);

    return Card(
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 主信息行
            Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: isCompleted
                        ? const Color(0xFF0B8F55).withValues(alpha: 0.12)
                        : isPending
                            ? AppTheme.primaryColor.withValues(alpha: 0.12)
                            : AppTheme.accentColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    isCompleted
                        ? Icons.check_circle_rounded
                        : isPending
                            ? Icons.schedule_rounded
                            : Icons.play_circle_rounded,
                    size: 20,
                    color: isCompleted
                        ? const Color(0xFF0B8F55)
                        : isPending
                            ? AppTheme.primaryColor
                            : AppTheme.accentColor,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              displayTitle,
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.bold,
                                color: AppTheme.textColor,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(width: 6),
                          _buildDomainBadge(domain),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          Text(
                            activityLabel,
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppTheme.textSecondary,
                            ),
                          ),
                          if (isCompleted && score != null) ...[
                            const SizedBox(width: 10),
                            Text(
                              '得分 $score',
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: Color(0xFF0B8F55),
                              ),
                            ),
                          ],
                          if (createdAt != null) ...[
                            const SizedBox(width: 10),
                            Text(
                              _formatDate(createdAt),
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
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: isCompleted
                        ? const Color(0xFF0B8F55).withValues(alpha: 0.12)
                        : AppTheme.primaryColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    isCompleted ? '已完成' : '待完成',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: isCompleted
                          ? const Color(0xFF0B8F55)
                          : AppTheme.primaryColor,
                    ),
                  ),
                ),
              ],
            ),

            // 待完成作业的操作按钮（非编辑态）
            if (isPending && !isEditing) ...[
              const SizedBox(height: 10),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton.icon(
                    onPressed: isBusy || id == null
                        ? null
                        : () => _startEdit(assignment),
                    icon: const Icon(Icons.edit_rounded, size: 16),
                    label: const Text('编辑'),
                    style: TextButton.styleFrom(
                      foregroundColor: AppTheme.textSecondary,
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      minimumSize: const Size(0, 32),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                  ),
                  const SizedBox(width: 4),
                  TextButton.icon(
                    onPressed: isBusy || id == null
                        ? null
                        : () => _deleteAssignment(id),
                    icon: isBusy
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.red,
                            ),
                          )
                        : const Icon(Icons.delete_outline_rounded, size: 16),
                    label: const Text('删除'),
                    style: TextButton.styleFrom(
                      foregroundColor: Colors.red,
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      minimumSize: const Size(0, 32),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                  ),
                ],
              ),
            ],

            // 编辑面板
            if (isPending && isEditing) ...[
              const SizedBox(height: 12),
              _buildEditPanel(isBusy),
            ],
          ],
        ),
      ),
    );
  }

  /// 编辑面板（内嵌在作业卡片中）
  Widget _buildEditPanel(bool isBusy) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.backgroundColor,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 主题输入
          _buildSectionLabel('作业主题'),
          const SizedBox(height: 6),
          TextField(
            controller: _editTopicController,
            decoration: InputDecoration(
              filled: true,
              fillColor: Colors.white,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: Colors.grey.shade200),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide:
                    const BorderSide(color: AppTheme.primaryColor, width: 2),
              ),
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            ),
          ),
          const SizedBox(height: 12),

          // 活动类型
          _buildSectionLabel('活动类型'),
          const SizedBox(height: 6),
          _buildChipSelector(
            items: _activityTypes
                .map((t) => _ChipItem(value: t.value, label: t.label))
                .toList(),
            selectedValue: _editActivityType,
            onSelected: (v) => setState(() => _editActivityType = v),
            compact: true,
          ),
          const SizedBox(height: 12),

          // 领域
          _buildSectionLabel('学习领域'),
          const SizedBox(height: 6),
          _buildChipSelector(
            items: _domains
                .map((d) => _ChipItem(value: d.key, label: d.label))
                .toList(),
            selectedValue: _editDomain,
            onSelected: (v) => setState(() => _editDomain = v),
            selectedColor: const Color(0xFF4A4A4A),
            compact: true,
          ),
          const SizedBox(height: 12),

          // 难度
          _buildSectionLabel('难度等级'),
          const SizedBox(height: 6),
          _buildChipSelector(
            items: _difficulties
                .map((d) => _ChipItem(
                      value: d.level.toString(),
                      label: d.label,
                    ))
                .toList(),
            selectedValue: _editDifficulty.toString(),
            onSelected: (v) =>
                setState(() => _editDifficulty = int.parse(v)),
            selectedColor: AppTheme.accentColor,
            compact: true,
          ),
          const SizedBox(height: 12),

          // 视频/动画作业专属内容
          if (_isVideoActivityType(_editActivityType)) ...[
            _buildEditVideoSection(),
          ],
          const SizedBox(height: 6),

          // 操作按钮
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton(
                onPressed: isBusy ? null : _cancelEdit,
                child: const Text('取消'),
              ),
              const SizedBox(width: 8),
              ElevatedButton(
                onPressed: isBusy || _editTopicController.text.trim().isEmpty
                    ? null
                    : _saveEdit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primaryColor,
                  foregroundColor: Colors.white,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
                child: isBusy
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text('保存'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// 编辑面板中的视频/动画作业专属内容
  Widget _buildEditVideoSection() {
    final assignment = _assignments.firstWhere(
      (a) => _toInt(a['id']) == _editingId,
      orElse: () => {},
    );

    final activityData = assignment['activityData'];
    final scenes = activityData is Map<String, dynamic>
        ? _extractScenesFromActivityData(activityData)
        : activityData is Map
            ? _extractScenesFromActivityData(
                Map<String, dynamic>.from(activityData))
            : <Map<String, dynamic>>[];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppTheme.primaryColor.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: AppTheme.primaryColor.withValues(alpha: 0.2),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.movie_creation_outlined,
                      size: 18, color: AppTheme.primaryColor),
                  const SizedBox(width: 6),
                  Text(
                    '视频/动画作业',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.primaryColor,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              if (scenes.isNotEmpty) ...[
                const Text(
                  '场景列表预览：',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textColor,
                  ),
                ),
                const SizedBox(height: 6),
                ...List.generate(scenes.length.clamp(0, 5),
                    (i) => _buildSceneSummaryTile(scenes[i], i)),
                if (scenes.length > 5)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      '... 共 ${scenes.length} 个场景',
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppTheme.textSecondary,
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ),
              ] else ...[
                const Text(
                  '作业内容需在"AI 课程生成器"中编辑场景和内容。',
                  style: TextStyle(
                    fontSize: 12,
                    color: AppTheme.textSecondary,
                  ),
                ),
              ],
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: () {
                    Navigator.pushNamed(
                        context, '/parent/lessonGenerator');
                  },
                  icon: const Icon(Icons.auto_fix_high_rounded, size: 18),
                  label: const Text('去 AI 课程生成器编辑'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppTheme.secondaryColor,
                    side: BorderSide(
                      color: AppTheme.secondaryColor.withValues(alpha: 0.5),
                    ),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 10),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  /// 场景摘要行
  Widget _buildSceneSummaryTile(Map<String, dynamic> scene, int index) {
    final narration = scene['narration']?.toString() ?? '';
    final onScreenText = scene['onScreenText']?.toString() ?? '';
    final displayTitle = onScreenText.isNotEmpty
        ? onScreenText
        : narration.length > 40
            ? '${narration.substring(0, 40)}...'
            : narration;

    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 22,
            height: 22,
            decoration: BoxDecoration(
              color: AppTheme.accentColor.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(6),
            ),
            alignment: Alignment.center,
            child: Text(
              '${index + 1}',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.bold,
                color: AppTheme.accentColor,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  displayTitle,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppTheme.textColor,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                if (narration.isNotEmpty) ...[
                  const SizedBox(height: 1),
                  Text(
                    narration.length > 60
                        ? '${narration.substring(0, 60)}...'
                        : narration,
                    style: const TextStyle(
                      fontSize: 11,
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
  }

  /// 从活动数据中提取场景
  List<Map<String, dynamic>> _extractScenesFromActivityData(
      Map<String, dynamic> activityData) {
    final List<Map<String, dynamic>> result = [];

    // 尝试多种可能的场景数据路径
    void tryExtract(dynamic source) {
      if (source is List) {
        for (final item in source) {
          if (item is Map) {
            result.add(Map<String, dynamic>.from(item));
          }
        }
      }
    }

    tryExtract(activityData['scenes']);
    tryExtract(activityData['visualStory']?['scenes']);
    tryExtract(activityData['videoLesson']?['shots']);

    // 也尝试 lessonData
    final lessonData = activityData['lessonData'];
    if (lessonData is Map) {
      final steps = lessonData['steps'];
      if (steps is List) {
        for (final step in steps) {
          if (step is Map) {
            final modules = step['modules'];
            if (modules is List) {
              for (final module in modules) {
                if (module is Map) {
                  final type =
                      module['type']?.toString().toLowerCase() ?? '';
                  if (type == 'video' || type == 'animation') {
                    tryExtract(module['visualStory']?['scenes']);
                    tryExtract(module['videoLesson']?['shots']);
                  }
                }
              }
            }
          }
        }
      }
    }

    return result;
  }

  // ==================== 辅助组件 ====================

  /// 区块标题
  Widget _buildSectionTitle(String title) {
    return Text(
      title,
      style: const TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.bold,
        color: AppTheme.textSecondary,
        letterSpacing: 0.5,
      ),
    );
  }

  /// 区块标签
  Widget _buildSectionLabel(String label) {
    return Text(
      label,
      style: const TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: AppTheme.textColor,
      ),
    );
  }

  /// 领域标签
  Widget _buildDomainBadge(_DomainMeta domain) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: domain.color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        domain.label,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.bold,
          color: domain.color,
        ),
      ),
    );
  }

  /// 选择器（单选 Chips）
  Widget _buildChipSelector({
    required List<_ChipItem> items,
    required String selectedValue,
    required ValueChanged<String> onSelected,
    Color? selectedColor,
    bool compact = false,
  }) {
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: items.map((item) {
        final isSelected = item.value == selectedValue;
        final color = selectedColor ?? AppTheme.primaryColor;

        return GestureDetector(
          onTap: () => onSelected(item.value),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            padding: EdgeInsets.symmetric(
              horizontal: compact ? 10 : 12,
              vertical: compact ? 6 : 8,
            ),
            decoration: BoxDecoration(
              color: isSelected ? color : Colors.white,
              borderRadius: BorderRadius.circular(compact ? 8 : 10),
              border: Border.all(
                color: isSelected ? color : Colors.grey.shade300,
                width: isSelected ? 1.5 : 1,
              ),
            ),
            child: Text(
              item.label,
              style: TextStyle(
                fontSize: compact ? 12 : 13,
                fontWeight: FontWeight.w600,
                color: isSelected ? Colors.white : AppTheme.textColor,
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  // ==================== 工具方法 ====================

  int? get _currentParentId {
    final user = context.read<UserProvider>().currentUser;
    return _toInt(user?['id']);
  }

  int? _toInt(dynamic value) {
    if (value is int) return value;
    return int.tryParse(value?.toString() ?? '');
  }

  DateTime? _toDateTime(dynamic value) {
    if (value == null) return null;
    return DateTime.tryParse(value.toString());
  }

  String _formatDate(DateTime dt) {
    return '${dt.month}-${dt.day}';
  }
}




/// 视频/动画作业场景预览底部弹出面板
class _VideoPreviewSheet extends StatefulWidget {
  final String title;
  final List<Map<String, dynamic>> scenes;
  final ThemeData theme;

  const _VideoPreviewSheet({
    required this.title,
    required this.scenes,
    required this.theme,
  });

  @override
  State<_VideoPreviewSheet> createState() => _VideoPreviewSheetState();
}

class _VideoPreviewSheetState extends State<_VideoPreviewSheet> {
  late final PageController _pageController;
  int _currentScene = 0;

  @override
  void initState() {
    super.initState();
    _pageController = PageController();
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  List<AnimationScene> get _parsedScenes =>
      widget.scenes.map((s) => AnimationScene.fromJson(s)).toList();

  @override
  Widget build(BuildContext context) {
    final scenes = _parsedScenes;

    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (context, scrollController) => Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          children: [
            // 拖拽指示器
            Container(
              margin: const EdgeInsets.only(top: 12),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),

            // 标题栏
            Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              child: Row(
                children: [
                  Icon(Icons.movie_creation_outlined,
                      color: AppTheme.primaryColor, size: 22),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      widget.title,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.textColor,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppTheme.primaryColor.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      '${scenes.length} 个场景',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.primaryColor,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            const Divider(height: 1),

            // 场景进度条
            Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              child: Row(
                children: [
                  Text(
                    '场景 ${_currentScene + 1} / ${scenes.length}',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                  const Spacer(),
                  // 进度点
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: List.generate(
                      scenes.length,
                      (i) => Container(
                        width: _currentScene == i ? 16 : 8,
                        height: 8,
                        margin: const EdgeInsets.symmetric(horizontal: 2),
                        decoration: BoxDecoration(
                          color: _currentScene == i
                              ? AppTheme.primaryColor
                              : Colors.grey.shade300,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // 场景页面
            Expanded(
              child: PageView.builder(
                controller: _pageController,
                onPageChanged: (i) => setState(() => _currentScene = i),
                itemCount: scenes.length,
                itemBuilder: (context, index) =>
                    _buildScenePage(scenes[index], index),
              ),
            ),

            // 底部导航栏
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              decoration: BoxDecoration(
                color: Colors.white,
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.05),
                    blurRadius: 10,
                    offset: const Offset(0, -2),
                  ),
                ],
              ),
              child: SafeArea(
                top: false,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    // 上一个
                    _NavButton(
                      icon: Icons.arrow_back_rounded,
                      label: '上一场景',
                      enabled: _currentScene > 0,
                      onTap: () {
                        if (_currentScene > 0) {
                          _pageController.previousPage(
                            duration: const Duration(milliseconds: 300),
                            curve: Curves.easeInOut,
                          );
                        }
                      },
                    ),

                    // 场景跳转下拉
                    PopupMenuButton<int>(
                      offset: const Offset(0, -300),
                      onSelected: (index) {
                        _pageController.animateToPage(
                          index,
                          duration: const Duration(milliseconds: 300),
                          curve: Curves.easeInOut,
                        );
                      },
                      itemBuilder: (context) => List.generate(
                        scenes.length,
                        (i) => PopupMenuItem(
                          value: i,
                          child: Text(
                            '场景 ${i + 1}${_currentScene == i ? ' ←' : ''}',
                            style: TextStyle(
                              fontWeight: _currentScene == i
                                  ? FontWeight.bold
                                  : FontWeight.normal,
                            ),
                          ),
                        ),
                      ),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          color: AppTheme.secondaryColor.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(
                          Icons.apps_rounded,
                          size: 20,
                          color: AppTheme.secondaryColor,
                        ),
                      ),
                    ),

                    // 下一个
                    _NavButton(
                      icon: Icons.arrow_forward_rounded,
                      label: '下一场景',
                      isNext: true,
                      enabled: _currentScene < scenes.length - 1,
                      onTap: () {
                        if (_currentScene < scenes.length - 1) {
                          _pageController.nextPage(
                            duration: const Duration(milliseconds: 300),
                            curve: Curves.easeInOut,
                          );
                        }
                      },
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

  Widget _buildScenePage(AnimationScene scene, int index) {
    final bgColor = _parseSceneBackground(scene.background);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // 场景编号标识
            Center(
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                decoration: BoxDecoration(
                  color: AppTheme.accentColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '🎬 场景 ${index + 1}',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.accentColor,
                  ),
                ),
              ),
            ),

            const SizedBox(height: 16),

            // 屏幕文字展示框
            if (scene.onScreenText.isNotEmpty) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      bgColor ?? AppTheme.primaryColor.withValues(alpha: 0.15),
                      (bgColor ?? AppTheme.primaryColor)
                          .withValues(alpha: 0.05),
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: (bgColor ?? AppTheme.primaryColor)
                        .withValues(alpha: 0.2),
                  ),
                ),
                child: Column(
                  children: [
                    if (scene.character.isNotEmpty) ...[
                      Text(
                        scene.character,
                        style: const TextStyle(fontSize: 48),
                      ),
                      const SizedBox(height: 8),
                    ],
                    Text(
                      scene.onScreenText,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.textColor,
                        letterSpacing: 1.2,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],

            // 旁白文字
            if (scene.narration.isNotEmpty) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: Colors.grey.shade200),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.record_voice_over_rounded,
                            size: 16, color: AppTheme.textSecondary),
                        const SizedBox(width: 6),
                        const Text(
                          '旁白',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.textSecondary,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      scene.narration,
                      style: const TextStyle(
                        fontSize: 14,
                        color: AppTheme.textColor,
                        height: 1.6,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],

            // 场景详情信息
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.grey.shade50,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    '场景详情',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 8),
                  _buildDetailRow('背景', scene.background),
                  _buildDetailRow('角色', scene.character),
                  if (scene.imageUrl != null &&
                      scene.imageUrl!.isNotEmpty)
                    _buildDetailRow('图片', scene.imageUrl!),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Color? _parseSceneBackground(String background) {
    final b = background.toLowerCase();
    // 尝试解析十六进制颜色
    if (b.startsWith('#') && b.length == 7) {
      try {
        return Color(
            int.parse('0xFF${b.substring(1)}'));
      } catch (_) {}
    }
    // 基于关键词返回颜色
    if (b.contains('sky') || b.contains('blue')) return Colors.blue.shade100;
    if (b.contains('night') || b.contains('dark')) return Colors.indigo.shade100;
    if (b.contains('sun') || b.contains('yellow')) return Colors.amber.shade100;
    if (b.contains('forest') || b.contains('green')) return Colors.green.shade100;
    if (b.contains('sea') || b.contains('ocean')) return Colors.teal.shade100;
    if (b.contains('pink') || b.contains('rose')) return Colors.pink.shade100;
    return null;
  }

  Widget _buildDetailRow(String label, String value) {
    if (value.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 40,
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 11,
                color: AppTheme.textSecondary,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 12,
                color: AppTheme.textColor,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// 视频预览底部导航按钮
class _NavButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool enabled;
  final VoidCallback onTap;
  final bool isNext;

  const _NavButton({
    required this.icon,
    required this.label,
    required this.enabled,
    required this.onTap,
    this.isNext = false,
  });

  @override
  Widget build(BuildContext context) {
    return TextButton.icon(
      onPressed: enabled ? onTap : null,
      label: Text(label),
      icon: Icon(isNext ? icon : icon,
          size: 18),
      style: TextButton.styleFrom(
        foregroundColor: AppTheme.primaryColor,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
        ),
      ),
    );
  }
}

// ==================== 数据模型 ====================

class _DomainMeta {
  final String key;
  final String label;
  final Color color;

  const _DomainMeta({
    required this.key,
    required this.label,
    required this.color,
  });
}

class _ActivityTypeMeta {
  final String value;
  final String label;

  const _ActivityTypeMeta({
    required this.value,
    required this.label,
  });
}

class _DifficultyMeta {
  final int level;
  final String label;

  const _DifficultyMeta({
    required this.level,
    required this.label,
  });
}

class _ChipItem {
  final String value;
  final String label;

  const _ChipItem({
    required this.value,
    required this.label,
  });
}