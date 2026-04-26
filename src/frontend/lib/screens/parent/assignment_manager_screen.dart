import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../components/top_bar.dart';
import '../../providers/user_provider.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
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
        parentId != null ? api.getAssignments(parentId) : Future.value([]),
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
      return const _EmptyState(
        title: '暂无孩子账号',
        description: '请先在家长端关联孩子，之后可布置作业。',
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
      return const _SectionSkeleton();
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
      return const _EmptyState(
        title: '暂无草稿作业',
        description: '未发布的一键生成课程会显示在这里，方便继续查看和编辑。',
        icon: Icons.note_alt_outlined,
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
    final isCoursePack = draft['contentType']?.toString() == 'course_pack';
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
                        ? AppTheme.primaryColor.withOpacity(0.15)
                        : AppTheme.secondaryColor.withOpacity(0.15),
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
                        ? AppTheme.primaryColor.withOpacity(0.12)
                        : AppTheme.secondaryColor.withOpacity(0.12),
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
          ],
        ),
      ),
    );
  }

  /// 已布置作业列表
  Widget _buildAssignmentSection() {
    if (_isLoadingData) {
      return const _SectionSkeleton();
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
      return const _EmptyState(
        title: '暂无布置作业',
        description: '点击上方"布置作业"按钮，为孩子创建本周任务。',
        icon: Icons.inbox_outlined,
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
                        ? const Color(0xFF0B8F55).withOpacity(0.12)
                        : isPending
                            ? AppTheme.primaryColor.withOpacity(0.12)
                            : AppTheme.accentColor.withOpacity(0.12),
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
                        ? const Color(0xFF0B8F55).withOpacity(0.12)
                        : AppTheme.primaryColor.withOpacity(0.12),
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
          const SizedBox(height: 14),

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
        color: domain.color.withOpacity(0.12),
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

// ==================== 辅助组件 ====================

class _SectionSkeleton extends StatelessWidget {
  const _SectionSkeleton();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          height: 18,
          width: 80,
          decoration: BoxDecoration(
            color: Colors.grey.shade300,
            borderRadius: BorderRadius.circular(4),
          ),
        ),
        const SizedBox(height: 10),
        Card(
          elevation: 0,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          child: Container(
            height: 80,
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        height: 14,
                        width: 120,
                        decoration: BoxDecoration(
                          color: Colors.grey.shade300,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Container(
                        height: 10,
                        width: 80,
                        decoration: BoxDecoration(
                          color: Colors.grey.shade300,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// 空状态组件
class _EmptyState extends StatelessWidget {
  final String title;
  final String description;
  final IconData icon;

  const _EmptyState({
    required this.title,
    required this.description,
    this.icon = Icons.inbox_outlined,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 200,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon,
                  size: 48, color: AppTheme.textSecondary.withOpacity(0.5)),
              const SizedBox(height: 14),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.textColor,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                description,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 13,
                  color: AppTheme.textSecondary,
                ),
              ),
            ],
          ),
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