import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../components/top_bar.dart';
import '../../providers/user_provider.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import 'child_selector.dart';

/// 家长端课程包管理页
/// 功能：
/// 1. 一句话生成课程包（主题 + 重点方向 + 时长）
/// 2. 历史课程包列表（按时间倒序）
/// 3. 课程包预览（JSON 内容滚动查看）
/// 4. 简化导出功能
class CoursePackManagerScreen extends StatefulWidget {
  const CoursePackManagerScreen({super.key});

  @override
  State<CoursePackManagerScreen> createState() => _CoursePackManagerScreenState();
}

class _CoursePackManagerScreenState extends State<CoursePackManagerScreen> {
  // 重点方向选项
  static const List<_FocusOption> _focusOptions = [
    _FocusOption(value: 'mixed', label: '综合'),
    _FocusOption(value: 'literacy', label: '语文'),
    _FocusOption(value: 'math', label: '数学'),
    _FocusOption(value: 'science', label: '科学'),
  ];

  // 时长选项
  static const List<int> _durationOptions = [15, 20, 25, 30, 40];

  // 表单状态
  final TextEditingController _topicController = TextEditingController();
  String _selectedFocus = 'mixed';
  int _selectedDuration = 20;

  // 数据状态
  bool _isLoadingChildren = true;
  bool _isLoadingPacks = false;
  bool _isGenerating = false;
  bool _isExporting = false;
  List<Map<String, dynamic>> _children = [];
  int? _selectedChildId;
  List<Map<String, dynamic>> _packs = [];
  Map<String, dynamic>? _previewContent;
  int? _previewRecordId;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadChildren();
  }

  @override
  void dispose() {
    _topicController.dispose();
    super.dispose();
  }

  // ========== 数据加载 ==========

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
      _selectedChildId = _toInt(children.isNotEmpty ? children.first['id'] : null);
      _isLoadingChildren = false;
    });

    if (_selectedChildId != null) {
      await _loadPacks();
    }
  }

  /// 加载课程包列表
  Future<void> _loadPacks() async {
    final childId = _selectedChildId;
    if (childId == null) return;

    setState(() {
      _isLoadingPacks = true;
      _error = null;
    });

    final api = context.read<ApiService>();
    final rawPacks = await api.getCoursePacks(childId);
    final packs = rawPacks
        .whereType<Map>()
        .map((e) => e.map((k, v) => MapEntry(k.toString(), v)))
        .toList();

    if (!mounted) return;

    setState(() {
      _packs = packs;
      _isLoadingPacks = false;
    });
  }

  // ========== 操作 ==========

  /// 生成单节课程包
  Future<void> _generateCoursePack() async {
    final childId = _selectedChildId;
    final topic = _topicController.text.trim();
    if (childId == null || topic.isEmpty) return;

    setState(() {
      _isGenerating = true;
      _error = null;
    });

    final api = context.read<ApiService>();
    final result = await api.generateCoursePack(
      topic: topic,
      childId: childId,
      focus: _selectedFocus,
      durationMinutes: _selectedDuration,
    );

    if (!mounted) return;

    if (result == null || result.containsKey('error')) {
      setState(() {
        _error = result?['error']?.toString() ?? '生成课程包失败，请稍后重试';
        _isGenerating = false;
      });
      return;
    }

    // 显示预览
    final planContent = result['planContent'] ?? result;
    final recordId = _toInt(result['coursePackRecordId']);

    setState(() {
      _previewContent = planContent is Map<String, dynamic>
          ? planContent
          : (planContent is Map
              ? planContent.map((k, v) => MapEntry(k.toString(), v))
              : null);
      _previewRecordId = recordId;
      _isGenerating = false;
    });

    // 清空输入并刷新列表
    _topicController.clear();
    await _loadPacks();
  }

  /// 查看课程包详情
  Future<void> _viewPack(Map<String, dynamic> pack) async {
    final recordId = _toInt(pack['id']);
    if (recordId == null) return;

    setState(() {
      _error = null;
    });

    final api = context.read<ApiService>();
    final detail = await api.getCoursePackById(recordId);

    if (!mounted) return;

    if (detail == null) {
      setState(() {
        _error = '获取课程包详情失败';
      });
      return;
    }

    final planContent = detail['planContent'];
    setState(() {
      _previewRecordId = recordId;
      _previewContent = planContent is Map<String, dynamic>
          ? planContent
          : (planContent is Map
              ? planContent.map((k, v) => MapEntry(k.toString(), v))
              : detail);
    });
  }

  /// 导出课程包（简化版）
  Future<void> _exportPack() async {
    final recordId = _previewRecordId;
    if (recordId == null) {
      setState(() => _error = '请先选择一个已保存的课程包再导出');
      return;
    }

    setState(() {
      _isExporting = true;
      _error = null;
    });

    final api = context.read<ApiService>();
    final success = await api.exportCoursePack(recordId);

    if (!mounted) return;

    setState(() {
      _isExporting = false;
    });

    if (!mounted) return;

    if (success) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('导出成功')),
      );
    } else {
      setState(() => _error = '导出失败，请稍后重试');
    }
  }

  /// 切换孩子
  void _onChildChanged(Map<String, dynamic> child) {
    final nextId = _toInt(child['id']);
    if (nextId == null || nextId == _selectedChildId) return;

    setState(() {
      _selectedChildId = nextId;
      _packs = [];
      _previewContent = null;
      _previewRecordId = null;
    });

    _loadPacks();
  }

  // ========== UI 构建 ==========

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      body: Column(
        children: [
          TopBar(
            title: '课程包管理',
            subtitle: 'AI 一键生成课程',
            leftSlot: IconButton(
              onPressed: () => Navigator.of(context).pop(),
              icon: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppTheme.backgroundColor,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.arrow_back_rounded, size: 20, color: AppTheme.textColor),
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
      return const Center(child: CircularProgressIndicator(color: AppTheme.primaryColor));
    }

    if (_children.isEmpty) {
      return const _EmptyState(
        title: '暂无孩子账号',
        description: '请先在家长端关联孩子，之后可生成课程包。',
      );
    }

    return RefreshIndicator(
      color: AppTheme.primaryColor,
      onRefresh: _loadPacks,
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
          // 生成表单
          _buildGenerateCard(),
          const SizedBox(height: 14),
          // 错误提示
          if (_error != null) _buildErrorBanner(),
          // 历史课程包列表
          _buildHistorySection(),
          const SizedBox(height: 14),
          // 预览区域
          if (_previewContent != null) _buildPreviewCard(),
        ],
      ),
    );
  }

  /// 生成课程包表单卡片
  Widget _buildGenerateCard() {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 标题行
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: AppTheme.primaryColor.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.auto_awesome_rounded, size: 18, color: AppTheme.primaryColor),
                ),
                const SizedBox(width: 10),
                const Text(
                  '一句话生成课程包',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.textColor),
                ),
              ],
            ),
            const SizedBox(height: 16),
            // 主题输入
            const Text(
              '家长需求',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.textSecondary),
            ),
            const SizedBox(height: 6),
            TextField(
              controller: _topicController,
              decoration: InputDecoration(
                hintText: '例如：用故事视频讲解汉字"日月山川"',
                filled: true,
                fillColor: AppTheme.backgroundColor,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: BorderSide.none,
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: BorderSide(color: Colors.grey.shade200),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: const BorderSide(color: AppTheme.primaryColor, width: 2),
                ),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              ),
              maxLines: 2,
              textInputAction: TextInputAction.done,
            ),
            const SizedBox(height: 14),
            // 重点方向 + 时长
            Row(
              children: [
                Expanded(child: _buildFocusSelector()),
                const SizedBox(width: 12),
                Expanded(child: _buildDurationSelector()),
              ],
            ),
            const SizedBox(height: 16),
            // 生成按钮
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton.icon(
                onPressed: (_selectedChildId != null && _topicController.text.trim().isNotEmpty && !_isGenerating)
                    ? _generateCoursePack
                    : null,
                icon: _isGenerating
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                      )
                    : const Icon(Icons.auto_awesome_rounded, size: 20),
                label: Text(_isGenerating ? '正在生成...' : '立即生成单节课程包'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primaryColor,
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: AppTheme.primaryColor.withOpacity(0.4),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// 重点方向选择器
  Widget _buildFocusSelector() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '重点方向',
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppTheme.textSecondary),
          ),
          const SizedBox(height: 2),
          DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              isExpanded: true,
              value: _selectedFocus,
              items: _focusOptions
                  .map((opt) => DropdownMenuItem(
                        value: opt.value,
                        child: Text(opt.label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                      ))
                  .toList(),
              onChanged: (value) {
                if (value != null) setState(() => _selectedFocus = value);
              },
              icon: const Icon(Icons.keyboard_arrow_down_rounded, size: 20),
            ),
          ),
        ],
      ),
    );
  }

  /// 时长选择器
  Widget _buildDurationSelector() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '课程时长',
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppTheme.textSecondary),
          ),
          const SizedBox(height: 2),
          DropdownButtonHideUnderline(
            child: DropdownButton<int>(
              isExpanded: true,
              value: _selectedDuration,
              items: _durationOptions
                  .map((m) => DropdownMenuItem(
                        value: m,
                        child: Text('$m 分钟', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                      ))
                  .toList(),
              onChanged: (value) {
                if (value != null) setState(() => _selectedDuration = value);
              },
              icon: const Icon(Icons.keyboard_arrow_down_rounded, size: 20),
            ),
          ),
        ],
      ),
    );
  }

  /// 错误提示横幅
  Widget _buildErrorBanner() {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFFB3261E).withOpacity(0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFB3261E).withOpacity(0.25)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline_rounded, size: 18, color: Color(0xFFB3261E)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              _error ?? '',
              style: const TextStyle(fontSize: 13, color: Color(0xFFB3261E)),
            ),
          ),
          GestureDetector(
            onTap: () => setState(() => _error = null),
            child: const Icon(Icons.close_rounded, size: 16, color: Color(0xFFB3261E)),
          ),
        ],
      ),
    );
  }

  /// 历史课程包列表
  Widget _buildHistorySection() {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  '历史课程包',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.textColor),
                ),
                TextButton.icon(
                  onPressed: _loadPacks,
                  icon: const Icon(Icons.refresh_rounded, size: 18),
                  label: const Text('刷新'),
                  style: TextButton.styleFrom(
                    foregroundColor: AppTheme.textSecondary,
                    textStyle: const TextStyle(fontSize: 13),
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    minimumSize: const Size(0, 32),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            if (_isLoadingPacks)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Center(child: CircularProgressIndicator(color: AppTheme.primaryColor)),
              )
            else if (_packs.isEmpty)
              const _EmptyState(
                title: '暂无课程包',
                description: '生成后会自动保存到这里，方便反复使用。',
                small: true,
              ),
            // 直接用 ListView 渲染排序后的列表
            if (_packs.isNotEmpty) ..._buildSortedPackItems(),
          ],
        ),
      ),
    );
  }

  /// 排序后的课程包列表项
  List<Widget> _buildSortedPackItems() {
    final sorted = List<Map<String, dynamic>>.from(_packs)
      ..sort((a, b) {
        final at = a['createdAt']?.toString() ?? '';
        final bt = b['createdAt']?.toString() ?? '';
        return bt.compareTo(at);
      });

    return sorted.map((pack) => _buildPackItem(pack)).toList();
  }

  /// 单个课程包列表项
  Widget _buildPackItem(Map<String, dynamic> pack) {
    final recordId = _toInt(pack['id']);
    final title = pack['title']?.toString() ?? '未命名课程包';
    final createdAt = pack['createdAt']?.toString() ?? '';
    final isSelected = recordId == _previewRecordId;

    return InkWell(
      onTap: () => _viewPack(pack),
      borderRadius: BorderRadius.circular(14),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: isSelected ? AppTheme.primaryColor.withOpacity(0.08) : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: isSelected ? AppTheme.primaryColor.withOpacity(0.35) : Colors.grey.shade200,
          ),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: AppTheme.secondaryColor.withOpacity(0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.menu_book_rounded, size: 20, color: AppTheme.secondaryColor),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppTheme.textColor),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 3),
                  Row(
                    children: [
                      const Icon(Icons.schedule_rounded, size: 14, color: AppTheme.textSecondary),
                      const SizedBox(width: 4),
                      Text(
                        _formatDateTime(createdAt),
                        style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            Text(
              '#${recordId ?? '?'}',
              style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary, fontWeight: FontWeight.w600),
            ),
            const SizedBox(width: 4),
            const Icon(Icons.chevron_right_rounded, size: 20, color: AppTheme.textSecondary),
          ],
        ),
      ),
    );
  }

  /// 课程包预览卡片
  Widget _buildPreviewCard() {
    final jsonString = _previewContent != null
        ? const JsonEncoder.withIndent('  ').convert(_previewContent)
        : '暂无内容';

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 标题行 + 导出按钮
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(
                        color: AppTheme.accentColor.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.visibility_rounded, size: 18, color: AppTheme.accentColor),
                    ),
                    const SizedBox(width: 10),
                    const Text(
                      '课程包预览',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.textColor),
                    ),
                  ],
                ),
                TextButton.icon(
                  onPressed: _isExporting ? null : _exportPack,
                  icon: _isExporting
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(color: AppTheme.primaryColor, strokeWidth: 2),
                        )
                      : const Icon(Icons.download_rounded, size: 18),
                  label: const Text('导出'),
                  style: TextButton.styleFrom(
                    foregroundColor: AppTheme.primaryColor,
                    textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    minimumSize: const Size(0, 32),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            // JSON 预览区域（可滚动）
            Container(
              width: double.infinity,
              constraints: const BoxConstraints(maxHeight: 360),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFF5F5F5),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.grey.shade300),
              ),
              child: SingleChildScrollView(
                child: SelectableText(
                  jsonString,
                  style: const TextStyle(
                    fontFamily: 'monospace',
                    fontSize: 12,
                    color: AppTheme.textColor,
                    height: 1.5,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ========== 工具方法 ==========

  int? get _currentParentId {
    final user = context.read<UserProvider>().currentUser;
    return _toInt(user?['id']);
  }

  int? _toInt(dynamic value) {
    if (value is int) return value;
    return int.tryParse(value?.toString() ?? '');
  }

  String _formatDateTime(String raw) {
    if (raw.isEmpty) return '未知时间';
    try {
      final dt = DateTime.parse(raw);
      return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')} '
          '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return raw;
    }
  }
}

/// 重点方向选项数据
class _FocusOption {
  final String value;
  final String label;

  const _FocusOption({required this.value, required this.label});
}

/// 空状态组件
class _EmptyState extends StatelessWidget {
  final String title;
  final String description;
  final bool small;

  const _EmptyState({
    required this.title,
    required this.description,
    this.small = false,
  });

  @override
  Widget build(BuildContext context) {
    final iconSize = small ? 36.0 : 42.0;
    final titleSize = small ? 14.0 : 16.0;
    final descSize = small ? 12.0 : 13.0;

    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.auto_stories_rounded,
              color: AppTheme.textSecondary.withOpacity(0.4),
              size: iconSize,
            ),
            const SizedBox(height: 8),
            Text(
              title,
              style: TextStyle(
                fontSize: titleSize,
                fontWeight: FontWeight.w700,
                color: AppTheme.textColor,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              description,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: descSize,
                color: AppTheme.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
