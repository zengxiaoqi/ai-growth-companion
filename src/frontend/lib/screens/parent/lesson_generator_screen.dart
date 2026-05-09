import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../components/top_bar.dart';
import '../../providers/user_provider.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import 'child_selector.dart';

/// 家长端课程生成器页面
/// 功能：AI 一键生成课程、课程预览、步骤编辑、保存/重新生成、草稿加载
class LessonGeneratorScreen extends StatefulWidget {
  const LessonGeneratorScreen({super.key});

  @override
  State<LessonGeneratorScreen> createState() => _LessonGeneratorScreenState();
}

class _LessonGeneratorScreenState extends State<LessonGeneratorScreen> {
  // ── 配置数据 ──
  static const List<_FocusOption> _focusOptions = [
    _FocusOption(value: 'mixed', label: '综合'),
    _FocusOption(value: 'literacy', label: '语文'),
    _FocusOption(value: 'math', label: '数学'),
    _FocusOption(value: 'science', label: '科学'),
  ];

  static const List<_DomainOption> _domainOptions = [
    _DomainOption(value: 'language', label: '语言'),
    _DomainOption(value: 'math', label: '数学'),
    _DomainOption(value: 'science', label: '科学'),
    _DomainOption(value: 'art', label: '艺术'),
    _DomainOption(value: 'social', label: '社交'),
  ];

  static const Map<String, String> _stepIcons = {
    'watch': '👁', 'read': '📖', 'write': '✍', 'practice': '🎮',
  };

  static const Map<String, List<_QuickEditOption>> _stepQuickEdits = {
    'watch': [
      _QuickEditOption(label: '更贴主题', prompt: '把这一部分的动画讲解改得更贴合当前主题，避免只出现泛化的字词展示。'),
      _QuickEditOption(label: '丰富讲解', prompt: '把这一部分的动画讲解内容再丰富一些，增加更具体的观察点和讲解细节。'),
      _QuickEditOption(label: '放慢节奏', prompt: '把这一部分的动画讲解节奏放慢一些，每个场景多给一点停留和说明。'),
    ],
    'read': [
      _QuickEditOption(label: '更短更清楚', prompt: '把这一部分的阅读内容缩短一点，并让句子更清楚。'),
      _QuickEditOption(label: '突出关键词', prompt: '把这一部分的阅读重点改成更突出关键词和核心句。'),
      _QuickEditOption(label: '加强理解题', prompt: '给这一部分增加更贴合内容的理解问题。'),
    ],
    'write': [
      _QuickEditOption(label: '降低描红难度', prompt: '把这一部分的描红和书写要求调简单一点，路径更清楚、更容易完成。'),
      _QuickEditOption(label: '增加鼓励', prompt: '把这一部分的书写提示改得更鼓励式、更适合孩子跟着描。'),
      _QuickEditOption(label: '更贴主题', prompt: '把这一部分的书写内容改得更贴合当前主题，不要太泛化。'),
    ],
    'practice': [
      _QuickEditOption(label: '规则更清楚', prompt: '把这一部分的练习规则说明改得更清楚，让孩子一开始就知道怎么做。'),
      _QuickEditOption(label: '提示更多', prompt: '给这一部分的练习加入更多过程提示和鼓励反馈。'),
      _QuickEditOption(label: '降低难度', prompt: '把这一部分的练习难度调低一点，步骤更少、更直接。'),
    ],
  };

  static const List<_QuickEditOption> _globalQuickEdits = [
    _QuickEditOption(label: '整体更简单', prompt: '把整节课整体调简单一点，更适合孩子独立完成。'),
    _QuickEditOption(label: '更贴主题', prompt: '把整节课所有内容都再检查一遍，确保每一步都更贴合当前主题。'),
    _QuickEditOption(label: '增强趣味性', prompt: '把整节课改得更有趣一点，增加鼓励语和互动感。'),
  ];

  // ── 状态 ──
  bool _isLoadingChildren = true;
  List<Map<String, dynamic>> _children = [];
  int? _selectedChildId;

  final TextEditingController _topicController = TextEditingController();
  String _selectedFocus = 'mixed';
  String _selectedDomain = 'language';
  String _selectedAgeGroup = '5-6';

  bool _isGenerating = false;
  String _generationProgress = '';
  String? _error;
  Map<String, dynamic>? _generatedContent;
  Map<String, dynamic>? _lessonData;
  Timer? _pollTimer;
  String? _expandedStepId;

  final TextEditingController _modificationController = TextEditingController();
  String _editScope = 'selected';
  bool _isModifying = false;
  bool _isConfirming = false;

  @override
  void initState() { super.initState(); _loadChildren(); }

  @override
  void dispose() {
    _topicController.dispose();
    _modificationController.dispose();
    _pollTimer?.cancel();
    super.dispose();
  }

  // ── 数据加载 ──
  Future<void> _loadChildren() async {
    final parentId = _currentParentId;
    if (parentId == null) {
      setState(() { _isLoadingChildren = false; _children = []; });
      return;
    }
    final api = context.read<ApiService>();
    final rawChildren = await api.getChildrenByParent(parentId);
    final children = rawChildren.whereType<Map>().map((e) => e.map((k, v) => MapEntry(k.toString(), v))).toList();
    if (!mounted) return;
    setState(() {
      _children = children;
      _selectedChildId = _toInt(children.isNotEmpty ? children.first['id'] : null);
      _updateChildAgeGroup();
      _isLoadingChildren = false;
    });
  }

  void _updateChildAgeGroup() {
    final child = _children.firstWhere((c) => _toInt(c['id']) == _selectedChildId, orElse: () => <String, dynamic>{});
    final age = _toInt(child['age']);
    if (age != null) { _childAgeGroup = age <= 4 ? '3-4' : '5-6'; _selectedAgeGroup = _childAgeGroup!; }
  }

  String? _childAgeGroup;

  void _onChildChanged(Map<String, dynamic> child) {
    setState(() { _selectedChildId = _toInt(child['id']); _updateChildAgeGroup(); });
  }

  // ── 生成课程 ──
  Future<void> _handleGenerate() async {
    final topic = _topicController.text.trim();
    if (topic.isEmpty || _selectedChildId == null) return;
    setState(() { _isGenerating = true; _error = null; _generatedContent = null; _lessonData = null; _generationProgress = '正在提交生成请求...'; });
    final api = context.read<ApiService>();
    try {
      final result = await api.generateLesson(topic: topic, childId: _selectedChildId!, domain: _selectedDomain, focus: _selectedFocus, ageGroup: _selectedAgeGroup, durationMinutes: 20);
      if (!mounted) return;
      if (result == null || result['error'] != null) {
        setState(() { _error = result?['error']?.toString() ?? '生成课程失败'; _isGenerating = false; _generationProgress = ''; });
        return;
      }
      final status = result['status']?.toString();
      if (status == 'draft') { _onLessonGenerated(result); }
      else if (status == 'generating') {
        setState(() { _generationProgress = 'AI 正在生成课程，请稍候...'; _generatedContent = result; });
        _startPolling(result);
      } else {
        setState(() { _error = '生成状态异常: $status'; _isGenerating = false; _generationProgress = ''; });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() { _error = '生成课程失败: $e'; _isGenerating = false; _generationProgress = ''; });
    }
  }

  void _onLessonGenerated(Map<String, dynamic> content) {
    final rawContent = content['content'];
    Map<String, dynamic>? lesson;
    if (rawContent is String) { try { lesson = jsonDecode(rawContent) as Map<String, dynamic>; } catch (_) {} }
    else if (rawContent is Map) { lesson = rawContent.map((k, v) => MapEntry(k.toString(), v)); }
    setState(() {
      _generatedContent = content; _lessonData = lesson; _isGenerating = false; _generationProgress = '';
      _expandedStepId = lesson?['steps'] is List && (lesson!['steps'] as List).isNotEmpty ? _stepId(lesson['steps'][0]) : null;
    });
  }

  void _startPolling(Map<String, dynamic> content) {
    _pollTimer?.cancel();
    final contentId = _toInt(content['id']);
    if (contentId == null) return;
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (timer) async {
      try {
        final api = context.read<ApiService>();
        final latest = await api.getContentDetail(contentId);
        if (!mounted) return;
        final status = latest?['status']?.toString();
        if (status == 'draft') { timer.cancel(); _pollTimer = null; _onLessonGenerated(latest!); }
        else if (status == 'generation_failed') { timer.cancel(); _pollTimer = null; setState(() { _error = latest?['subtitle']?.toString() ?? '生成课程失败，请重试'; _isGenerating = false; _generationProgress = ''; _generatedContent = null; }); }
        else { setState(() { _generationProgress = '正在生成... ($status)'; }); }
      } catch (_) {}
    });
    Timer(const Duration(minutes: 5), () {
      if (_pollTimer != null && _isGenerating) {
        _pollTimer?.cancel(); _pollTimer = null;
        if (mounted) setState(() { _error = '生成超时，请重试'; _isGenerating = false; _generationProgress = ''; _generatedContent = null; });
      }
    });
  }

  // ── 修改课程 ──
  Future<void> _handleModify() async {
    final text = _modificationController.text.trim();
    final contentId = _toInt(_generatedContent?['id']);
    if (text.isEmpty || contentId == null) return;
    setState(() { _isModifying = true; _error = null; });
    final api = context.read<ApiService>();
    final selectedStep = _selectedStep;
    try {
      final result = await api.modifyLesson(contentId, text, stepId: (_editScope == 'selected' && selectedStep != null) ? selectedStep['id']?.toString() : null);
      if (!mounted) return;
      if (result == null || result['error'] != null) { setState(() { _error = result?['error']?.toString() ?? '修改课程失败'; _isModifying = false; }); return; }
      final rawContent = result['content'];
      Map<String, dynamic>? lesson;
      if (rawContent is String) { try { lesson = jsonDecode(rawContent) as Map<String, dynamic>; } catch (_) {} }
      else if (rawContent is Map) { lesson = rawContent.map((k, v) => MapEntry(k.toString(), v)); }
      setState(() { _generatedContent = result; _lessonData = lesson; _isModifying = false; _modificationController.clear(); });
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('课程已更新'), backgroundColor: Color(0xFF0B8F55)));
    } catch (e) { if (!mounted) return; setState(() { _error = '修改课程失败: $e'; _isModifying = false; }); }
  }

  // ── 确认发布 ──
  Future<void> _handleConfirm() async {
    final contentId = _toInt(_generatedContent?['id']);
    if (contentId == null || _selectedChildId == null) return;
    setState(() { _isConfirming = true; _error = null; });
    final api = context.read<ApiService>();
    try {
      final result = await api.confirmLesson(contentId, _selectedChildId!);
      if (!mounted) return;
      if (result == null || result['error'] != null) { setState(() { _error = result?['error']?.toString() ?? '确认发布失败'; _isConfirming = false; }); return; }
      setState(() { _generatedContent = result; _isConfirming = false; });
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('课程已发布到学生端！'), backgroundColor: Color(0xFF0B8F55)));
    } catch (e) { if (!mounted) return; setState(() { _error = '确认发布失败: $e'; _isConfirming = false; }); }
  }

  void _handleReset() {
    _pollTimer?.cancel(); _pollTimer = null;
    setState(() { _generatedContent = null; _lessonData = null; _modificationController.clear(); _error = null; _expandedStepId = null; _isGenerating = false; _generationProgress = ''; });
  }

  void _applyQuickEdit(_QuickEditOption option) {
    final selectedStep = _selectedStep;
    if (_editScope == 'selected' && selectedStep != null) {
      final stepLabel = selectedStep['label']?.toString() ?? '';
      final stepTitle = _getStepTitle(selectedStep);
      _modificationController.text = '请只修改"$stepLabel · $stepTitle"这一步，其他步骤尽量保持不变。\n重点修改方向：${option.prompt}\n请同时同步更新这一步的 scene 预览内容，让家长端预览和学生端展示保持一致。\n修改后继续保持内容贴合主题、年龄合适、表达自然。';
    } else {
      _modificationController.text = '请基于整节课做一次整体优化。\n重点修改方向：${option.prompt}\n如果某一步内容发生变化，请同步更新对应的 scene 预览内容。\n修改后继续保持内容贴合主题、年龄合适、表达自然。';
    }
  }

  // ── 辅助方法 ──
  List<dynamic> get _steps { final s = _lessonData?['steps']; return s is List ? s : []; }
  Map<String, dynamic>? get _selectedStep {
    if (_expandedStepId == null || _steps.isEmpty) return null;
    for (final step in _steps) { if (_stepId(step) == _expandedStepId) return step is Map ? step.map((k, v) => MapEntry(k.toString(), v)) : null; }
    return null;
  }
  String _stepId(dynamic step) => step is Map ? step['id']?.toString() ?? '' : '';
  String _getStepTitle(Map<String, dynamic> step) {
    final module = step['module']; if (module is! Map) return step['id']?.toString() ?? '';
    final type = module['type']?.toString() ?? '';
    if (type == 'video') return '教学视频';
    if (type == 'reading') return module['reading']?['goal']?.toString() ?? '阅读理解';
    if (type == 'writing') return module['writing']?['goal']?.toString() ?? '书写练习';
    if (type == 'game') return '互动练习';
    return type;
  }
  List<_QuickEditOption> get _currentQuickEdits {
    if (_editScope == 'selected' && _selectedStep != null) {
      final stepId = _selectedStep!['id']?.toString() ?? '';
      return _stepQuickEdits[stepId] ?? _globalQuickEdits;
    }
    return _globalQuickEdits;
  }
  String _buildStepPreviewText(Map<String, dynamic> step) {
    final module = step['module']; if (module is! Map) return '';
    final type = module['type']?.toString() ?? '';
    if (type == 'video') {
      final scenes = module['visualStory']?['scenes'] ?? module['videoLesson']?['shots'] ?? [];
      if (scenes is List && scenes.isNotEmpty) {
        final first = scenes.first is Map ? scenes.first as Map : {};
        return first['narration']?.toString() ?? first['caption']?.toString() ?? first['scene']?.toString() ?? '共 ${scenes.length} 个场景';
      }
      return '动画场景';
    }
    if (type == 'reading') return module['reading']?['text']?.toString() ?? '阅读材料';
    if (type == 'writing') {
      final items = module['writing']?['tracingItems'];
      if (items is List && items.isNotEmpty) return '描红: ${items.join(', ')}';
      return '书写练习';
    }
    if (type == 'game') {
      final questions = module['game']?['activityData']?['questions'] ?? module['game']?['questions'];
      if (questions is List && questions.isNotEmpty) return '共 ${questions.length} 道题';
      return '互动游戏';
    }
    return type;
  }
  int? get _currentParentId { final user = context.read<UserProvider>().currentUser; return _toInt(user?['id']); }
  int? _toInt(dynamic value) { if (value is int) return value; return int.tryParse(value?.toString() ?? ''); }
  String _contentStatus() => _generatedContent?['status']?.toString() ?? '';

  // ── 构建 UI ──
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      body: Column(children: [
        TopBar(title: 'AI 课程生成', subtitle: '一键生成"看、读、写、练"完整课程',
          leftSlot: IconButton(onPressed: () => Navigator.of(context).pop(),
            icon: Container(padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: AppTheme.backgroundColor, borderRadius: BorderRadius.circular(12)),
              child: const Icon(Icons.arrow_back_rounded, size: 20, color: AppTheme.textColor),
            ),
          ),
        ),
        Expanded(child: _buildBody()),
      ]),
    );
  }

  Widget _buildBody() {
    if (_isLoadingChildren) return const Center(child: CircularProgressIndicator(color: AppTheme.primaryColor));
    if (_children.isEmpty) return _buildEmptyState('暂无孩子账号', '请先在家长端关联孩子，之后可生成课程。', Icons.family_restroom_rounded);
    return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 24), children: [
      ChildSelector(children: _children, selectedChildId: _selectedChildId, onChildChanged: _onChildChanged, mode: ChildSelectorMode.bottomSheet),
      const SizedBox(height: 14),
      if (_error != null) _buildErrorBanner(),
      if (_generatedContent == null) _buildInputForm(),
      if (_generatedContent != null && _lessonData != null) _buildLessonPreview(),
    ]);
  }

  Widget _buildErrorBanner() {
    return Container(margin: const EdgeInsets.only(bottom: 12), padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(color: Colors.red.shade50, borderRadius: BorderRadius.circular(14), border: Border.all(color: Colors.red.shade200)),
      child: Row(children: [
        Icon(Icons.error_outline_rounded, color: Colors.red.shade700, size: 20), const SizedBox(width: 8),
        Expanded(child: Text(_error!, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.red.shade700))),
      ]),
    );
  }

  Widget _buildInputForm() {
    return Card(elevation: 0, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Padding(padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [const Icon(Icons.auto_awesome_rounded, size: 22, color: AppTheme.primaryColor), const SizedBox(width: 8),
            const Text('一键生成学习课程', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.textColor)),
          ]),
          const SizedBox(height: 6),
          const Text('输入学习主题，AI 自动生成包含"看、读、写、练"四步的完整课程', style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
          const SizedBox(height: 16),
          _buildLabel('学习主题'), const SizedBox(height: 6),
          TextField(controller: _topicController,
            decoration: InputDecoration(hintText: '例如：认识动物、数字1-10、四季变化', filled: true, fillColor: Colors.white,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: Colors.grey.shade200)),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppTheme.primaryColor, width: 2)),
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            ), enabled: !_isGenerating,
          ),
          const SizedBox(height: 16),
          _buildLabel('年龄组'), const SizedBox(height: 6),
          _buildChipSelector(items: const [_ChipItem(value: '3-4', label: '3-4岁'), _ChipItem(value: '5-6', label: '5-6岁')],
            selectedValue: _selectedAgeGroup, onSelected: (v) => setState(() => _selectedAgeGroup = v)),
          const SizedBox(height: 14),
          _buildLabel('学习领域'), const SizedBox(height: 6),
          _buildChipSelector(items: _domainOptions.map((d) => _ChipItem(value: d.value, label: d.label)).toList(),
            selectedValue: _selectedDomain, onSelected: (v) => setState(() => _selectedDomain = v)),
          const SizedBox(height: 14),
          _buildLabel('专注方向'), const SizedBox(height: 6),
          _buildChipSelector(items: _focusOptions.map((f) => _ChipItem(value: f.value, label: f.label)).toList(),
            selectedValue: _selectedFocus, onSelected: (v) => setState(() => _selectedFocus = v)),
          const SizedBox(height: 18),
          SizedBox(width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: (_isGenerating || _topicController.text.trim().isEmpty || _selectedChildId == null) ? null : _handleGenerate,
              icon: _isGenerating ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.auto_awesome_rounded, size: 20),
              label: Text(_isGenerating ? (_generationProgress.isNotEmpty ? _generationProgress : 'AI 正在生成课程...') : '生成学习课程'),
              style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
            ),
          ),
        ]),
      ),
    );
  }

  Widget _buildLessonPreview() {
    final content = _generatedContent!;
    final lesson = _lessonData!;
    final title = content['title']?.toString() ?? '未命名课程';
    final summary = lesson['summary']?.toString() ?? '';
    final outcomes = lesson['outcomes'];
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Card(elevation: 0, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        child: Padding(padding: const EdgeInsets.all(16),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.textColor)),
              if (summary.isNotEmpty) ...[const SizedBox(height: 4), Text(summary, style: const TextStyle(fontSize: 13, color: AppTheme.textSecondary))],
              if (outcomes is List && outcomes.isNotEmpty) ...[const SizedBox(height: 8),
                Wrap(spacing: 6, runSpacing: 6, children: outcomes.map<Widget>((o) => Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: AppTheme.primaryColor.withOpacity(0.12), borderRadius: BorderRadius.circular(20)),
                  child: Text(o.toString(), style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppTheme.primaryColor)),
                )).toList()),
              ],
            ])),
            IconButton(onPressed: _handleReset, tooltip: '重新生成', icon: const Icon(Icons.refresh_rounded, size: 22, color: AppTheme.textSecondary)),
          ]),
        ),
      ),
      const SizedBox(height: 12),
      const Text('课程四步预览', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppTheme.textSecondary, letterSpacing: 0.5)),
      const SizedBox(height: 8),
      ..._steps.map<Widget>((step) {
        final stepMap = step is Map ? step.map<String, dynamic>((k, v) => MapEntry(k.toString(), v)) : <String, dynamic>{};
        return _buildStepCard(stepMap);
      }),
      const SizedBox(height: 12),
      if (_contentStatus() == 'draft') _buildModificationPanel(),
      const SizedBox(height: 12),
      _buildConfirmSection(),
    ]);
  }

  Widget _buildStepCard(Map<String, dynamic> step) {
    final stepId = step['id']?.toString() ?? '';
    final label = step['label']?.toString() ?? '';
    final title = _getStepTitle(step);
    final icon = _stepIcons[stepId] ?? '📝';
    final module = step['module'];
    final moduleType = module is Map ? module['type']?.toString() ?? '' : '';
    final isExpanded = _expandedStepId == stepId;
    final previewText = _buildStepPreviewText(step);
    return Card(elevation: 0, margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16),
        side: isExpanded ? BorderSide(color: AppTheme.primaryColor.withOpacity(0.35), width: 1.5) : BorderSide.none),
      color: isExpanded ? AppTheme.primaryColor.withOpacity(0.06) : Colors.white,
      child: InkWell(borderRadius: BorderRadius.circular(16),
        onTap: () => setState(() { _expandedStepId = isExpanded ? null : stepId; }),
        child: Padding(padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Text(icon, style: const TextStyle(fontSize: 22)), const SizedBox(width: 12),
              Expanded(child: Text('$label — $title', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.textColor))),
              Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(color: AppTheme.backgroundColor, borderRadius: BorderRadius.circular(10)),
                child: Text(moduleType, style: const TextStyle(fontSize: 10, color: AppTheme.textSecondary)),
              ),
              const SizedBox(width: 4),
              Icon(isExpanded ? Icons.expand_less_rounded : Icons.expand_more_rounded, size: 20, color: AppTheme.textSecondary),
            ]),
            if (isExpanded) ...[
              const SizedBox(height: 12),
              Container(padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: AppTheme.backgroundColor, borderRadius: BorderRadius.circular(12)),
                child: Text(previewText, style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary, height: 1.5), maxLines: 5, overflow: TextOverflow.ellipsis),
              ),
            ],
          ]),
        ),
      ),
    );
  }

  Widget _buildModificationPanel() {
    final selectedStep = _selectedStep;
    final quickEdits = _currentQuickEdits;
    return Card(elevation: 0, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Padding(padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('AI 修改课程', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.textColor)),
          const SizedBox(height: 12),
          Row(children: [
            _buildScopeChip(label: '只改当前步骤${selectedStep != null ? ' · ${selectedStep['label']}' : ''}',
              isSelected: _editScope == 'selected', onTap: selectedStep != null ? () => setState(() => _editScope = 'selected') : null),
            const SizedBox(width: 8),
            _buildScopeChip(label: '改整个课程', isSelected: _editScope == 'all', onTap: () => setState(() => _editScope = 'all')),
          ]),
          const SizedBox(height: 8),
          Text(_editScope == 'selected' && selectedStep != null
              ? '这次修改会优先聚焦在"${selectedStep['label']} · ${_getStepTitle(selectedStep)}"这一步。'
              : '这次修改会作为整节课的全局编辑请求处理。',
            style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
          const SizedBox(height: 12),
          const Text('快捷修改模板', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppTheme.textSecondary)),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: quickEdits.map((option) => InkWell(
            borderRadius: BorderRadius.circular(20), onTap: () => _applyQuickEdit(option),
            child: Container(padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(color: AppTheme.backgroundColor, borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.grey.shade300)),
              child: Text(option.label, style: const TextStyle(fontSize: 12, color: AppTheme.textColor)),
            ),
          )).toList()),
          const SizedBox(height: 12),
          TextField(controller: _modificationController, maxLines: 4,
            decoration: InputDecoration(hintText: '输入修改要求，或点击上方模板快速填写...', filled: true, fillColor: Colors.white,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: Colors.grey.shade200)),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppTheme.primaryColor, width: 2)),
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            ), enabled: !_isModifying,
          ),
          const SizedBox(height: 6),
          const Text('点击模板后会自动填入草稿，可继续编辑再提交', style: TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
          const SizedBox(height: 12),
          Row(mainAxisAlignment: MainAxisAlignment.end, children: [
            TextButton(onPressed: _isModifying ? null : () => _modificationController.clear(), child: const Text('清空')),
            const SizedBox(width: 8),
            ElevatedButton(
              onPressed: (_isModifying || _modificationController.text.trim().isEmpty) ? null : _handleModify,
              style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primaryColor, foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
              child: _isModifying
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('提交修改'),
            ),
          ]),
        ]),
      ),
    );
  }

  Widget _buildScopeChip({required String label, required bool isSelected, required VoidCallback? onTap}) {
    return GestureDetector(onTap: onTap,
      child: AnimatedContainer(duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? AppTheme.primaryColor : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: isSelected ? AppTheme.primaryColor : Colors.grey.shade300, width: isSelected ? 1.5 : 1),
        ),
        child: Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: isSelected ? Colors.white : AppTheme.textColor)),
      ),
    );
  }

  Widget _buildConfirmSection() {
    final status = _contentStatus();
    if (status == 'draft') {
      return SizedBox(width: double.infinity,
        child: ElevatedButton.icon(
          onPressed: (_isConfirming) ? null : _handleConfirm,
          icon: _isConfirming ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.check_circle_outline_rounded, size: 20),
          label: Text(_isConfirming ? '正在发布...' : '确认内容，发布到学生端'),
          style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
        ),
      );
    }
    return Container(width: double.infinity, padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(color: AppTheme.primaryColor.withOpacity(0.1), borderRadius: BorderRadius.circular(14)),
      child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(Icons.check_circle_rounded, size: 20, color: AppTheme.primaryColor), const SizedBox(width: 8),
        Text('课程已发布，学生可以在学习页面看到此课程', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.primaryColor)),
      ]),
    );
  }

  Widget _buildLabel(String text) => Text(text, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textColor));

  Widget _buildChipSelector({required List<_ChipItem> items, required String selectedValue, required ValueChanged<String> onSelected}) {
    return Wrap(spacing: 6, runSpacing: 6, children: items.map((item) {
      final isSelected = item.value == selectedValue;
      return GestureDetector(
        onTap: () => onSelected(item.value),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: isSelected ? AppTheme.primaryColor : Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: isSelected ? AppTheme.primaryColor : Colors.grey.shade300,
              width: 1.5,
            ),
          ),
          child: Text(
            item.label,
            style: TextStyle(
              fontSize: 13,
              fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
              color: isSelected ? Colors.white : AppTheme.textColor,
            ),
          ),
        ),
      );
    }).toList());
  }

  Widget _buildEmptyState(String title, String desc, IconData icon) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 64, color: AppTheme.textSecondary.withOpacity(0.5)),
            const SizedBox(height: 16),
            Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.textColor)),
            const SizedBox(height: 8),
            Text(desc, textAlign: TextAlign.center, style: const TextStyle(fontSize: 14, color: AppTheme.textSecondary)),
          ],
        ),
      ),
    );
  }
}

// ── 数据类 ──

class _FocusOption {
  final String value;
  final String label;
  const _FocusOption({required this.value, required this.label});
}

class _DomainOption {
  final String value;
  final String label;
  const _DomainOption({required this.value, required this.label});
}

class _QuickEditOption {
  final String label;
  final String prompt;
  const _QuickEditOption({required this.label, required this.prompt});
}

class _ChipItem {
  final String value;
  final String label;
  const _ChipItem({required this.value, required this.label});
}