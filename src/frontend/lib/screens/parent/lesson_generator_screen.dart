import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../components/child_fun_page.dart';
import '../../components/empty_state.dart';
import '../../components/shimmer_loading.dart';
import '../../providers/user_provider.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../../theme/child_theme.dart';
import '../../screens/learning/animation_scene_player.dart';
import '../../screens/learning/structured_lesson_screen.dart';
import 'child_selector.dart';

/// 家长端课程生成器页面
/// 功能：AI 一键生成课程、课程预览、步骤编辑、保存/重新生成、草稿加载
class LessonGeneratorScreen extends StatefulWidget {
  /// 如果从草稿管理页面进入，传入要加载的草稿 contentId
  final int? draftContentId;

  const LessonGeneratorScreen({super.key, this.draftContentId});

  @override
  State<LessonGeneratorScreen> createState() => _LessonGeneratorScreenState();
}

class _LessonGeneratorScreenState extends State<LessonGeneratorScreen>
    with SingleTickerProviderStateMixin {
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
    'watch': '👁',
    'read': '📖',
    'write': '✍',
    'practice': '🎮',
  };

  static const Map<String, List<_QuickEditOption>> _stepQuickEdits = {
    'watch': [
      _QuickEditOption(
          label: '更贴主题', prompt: '把这一部分的动画讲解改得更贴合当前主题，避免只出现泛化的字词展示。'),
      _QuickEditOption(
          label: '丰富讲解', prompt: '把这一部分的动画讲解内容再丰富一些，增加更具体的观察点和讲解细节。'),
      _QuickEditOption(
          label: '放慢节奏', prompt: '把这一部分的动画讲解节奏放慢一些，每个场景多给一点停留和说明。'),
      _QuickEditOption(
          label: '修改场景旁白',
          prompt:
              '请修改当前展开场景的旁白文字（narration），让它更贴近主题、更适合孩子理解，表达更自然有趣。修改后保持场景的原有角色和背景不变。'),
      _QuickEditOption(
          label: '调整动画节奏',
          prompt:
              '请调整动画场景的数量和节奏。如果场景太少可以拆分增加，如果太多可以合并精简。每个场景保持合适的信息量和停留时间，确保 5-6 岁孩子能跟得上。'),
      _QuickEditOption(
          label: '添加互动元素',
          prompt:
              '请在动画场景中加入互动点，例如在关键场景处插入提问（"你看到了什么？"）、互动指令（"指一指哪个是红色"）、或者等待孩子回应后再继续。让动画不再是单向播放，而是有互动感。'),
    ],
    'read': [
      _QuickEditOption(label: '更短更清楚', prompt: '把这一部分的阅读内容缩短一点，并让句子更清楚。'),
      _QuickEditOption(label: '突出关键词', prompt: '把这一部分的阅读重点改成更突出关键词和核心句。'),
      _QuickEditOption(label: '加强理解题', prompt: '给这一部分增加更贴合内容的理解问题。'),
    ],
    'write': [
      _QuickEditOption(
          label: '降低描红难度', prompt: '把这一部分的描红和书写要求调简单一点，路径更清楚、更容易完成。'),
      _QuickEditOption(label: '增加鼓励', prompt: '把这一部分的书写提示改得更鼓励式、更适合孩子跟着描。'),
      _QuickEditOption(label: '更贴主题', prompt: '把这一部分的书写内容改得更贴合当前主题，不要太泛化。'),
    ],
    'practice': [
      _QuickEditOption(
          label: '规则更清楚', prompt: '把这一部分的练习规则说明改得更清楚，让孩子一开始就知道怎么做。'),
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
  bool _isLoadingDraft = false;
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
  int _pollCount = 0;
  static const _maxPollCount = 100;
  String? _expandedStepId;

  // ── 页签与历史记录 ──
  late final TabController _tabController;
  List<Map<String, dynamic>> _history = [];
  bool _loadingHistory = false;
  Timer? _historyPollTimer;

  final TextEditingController _modificationController = TextEditingController();
  String _editScope = 'selected';
  bool _isModifying = false;
  bool _isConfirming = false;

  // ── 场景编辑状态 ──
  Map<int, Map<String, String>> _sceneEdits = {};
  int? _editingSceneIndex;
  int _previewSceneIndex = 0;
  bool _isSavingDraft = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _tabController.addListener(() {
      if (_tabController.indexIsChanging) return;
      if (_tabController.index == 1) {
        _loadHistory();
      } else {
        _stopHistoryPoll();
      }
    });
    _loadChildren().then((_) {
      if (widget.draftContentId != null) _loadDraft(widget.draftContentId!);
      _loadHistory(silent: true);
    });
  }

  @override
  void dispose() {
    _topicController.dispose();
    _modificationController.dispose();
    _pollTimer?.cancel();
    _historyPollTimer?.cancel();
    _tabController.dispose();
    super.dispose();
  }

  // ── 数据加载 ──

  /// 加载已有草稿数据，恢复到编辑/预览状态
  Future<void> _loadDraft(int contentId) async {
    setState(() {
      _isLoadingDraft = true;
      _error = null;
    });
    final api = context.read<ApiService>();
    try {
      final result = await api.getContentDetail(contentId);
      if (!mounted) return;
      if (result == null) {
        setState(() {
          _error = '加载草稿失败';
          _isLoadingDraft = false;
        });
        return;
      }
      final status = result['status']?.toString();
      if (status != 'draft') {
        setState(() {
          _error = '该课程不是草稿状态，无法编辑';
          _isLoadingDraft = false;
        });
        return;
      }
      _onLessonGenerated(result);
      setState(() {
        _isLoadingDraft = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '加载草稿失败: $e';
        _isLoadingDraft = false;
      });
    }
  }

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
      _updateChildAgeGroup();
      _isLoadingChildren = false;
    });
  }

  void _updateChildAgeGroup() {
    final child = _children.firstWhere(
        (c) => _toInt(c['id']) == _selectedChildId,
        orElse: () => <String, dynamic>{});
    final age = _toInt(child['age']);
    if (age != null) {
      _childAgeGroup = age <= 4 ? '3-4' : '5-6';
      _selectedAgeGroup = _childAgeGroup!;
    }
  }

  String? _childAgeGroup;

  void _onChildChanged(Map<String, dynamic> child) {
    setState(() {
      _selectedChildId = _toInt(child['id']);
      _updateChildAgeGroup();
    });
    _loadHistory(silent: true);
  }

  // ── 历史记录 ──

  /// 拉取当前孩子的结构化课程任务/草稿（含失败态）。
  /// [silent] 为 true 时不显示加载态，用于轮询刷新与横幅计数。
  Future<void> _loadHistory({bool silent = false}) async {
    final childId = _selectedChildId;
    if (childId == null) return;
    if (!silent) {
      setState(() {
        _loadingHistory = true;
      });
    }
    final api = context.read<ApiService>();
    final raw = await api.getDraftLessons(childId, includeFailed: true);
    if (!mounted) return;
    final rows = raw
        .whereType<Map>()
        .map((e) => e.map((k, v) => MapEntry(k.toString(), v)))
        .where((m) => m['contentType']?.toString() == 'structured_lesson')
        .toList();
    // 轮询刷新时内容没变就不重建，避免无谓 setState
    String signature(List<Map<String, dynamic>> list) => list
        .map((m) => '${m['id']}:${m['status']}:${m['updatedAt']}')
        .join('|');
    if (silent && signature(rows) == signature(_history)) {
      _syncHistoryPoll();
      return;
    }
    setState(() {
      _history = rows;
      _loadingHistory = false;
    });
    _syncHistoryPoll();
  }

  int get _backgroundGeneratingCount => _history
      .where((m) => m['status']?.toString() == 'generating')
      .length;

  /// 历史页签可见且存在生成中任务时才轮询，离开页签即停
  void _syncHistoryPoll() {
    final shouldPoll =
        _tabController.index == 1 && _backgroundGeneratingCount > 0;
    if (shouldPoll && _historyPollTimer == null) {
      _historyPollTimer = Timer.periodic(
          const Duration(seconds: 5), (_) => _loadHistory(silent: true));
    } else if (!shouldPoll) {
      _stopHistoryPoll();
    }
  }

  void _stopHistoryPoll() {
    _historyPollTimer?.cancel();
    _historyPollTimer = null;
  }

  void _editHistoryDraft(Map<String, dynamic> row) {
    final contentId = _toInt(row['id']);
    if (contentId == null) return;
    _tabController.animateTo(0);
    _loadDraft(contentId);
  }

  void _previewHistoryDraft(Map<String, dynamic> row) {
    final contentId = _toInt(row['id']);
    if (contentId == null) return;
    Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => StructuredLessonScreen(
            contentId: contentId,
            childId: _selectedChildId,
            previewMode: true,
          ),
        ));
  }

  Future<void> _retryHistoryTask(Map<String, dynamic> row) async {
    final contentId = _toInt(row['id']);
    if (contentId == null) return;
    final api = context.read<ApiService>();
    final result = await api.retryLessonGeneration(contentId);
    if (!mounted) return;
    if (result == null) {
      _showSnack('重试失败，请稍后再试');
      return;
    }
    _showSnack('已重新开始生成，可离开此页等待');
    _loadHistory();
  }

  Future<void> _deleteHistoryRow(Map<String, dynamic> row) async {
    final contentId = _toInt(row['id']);
    final title = row['title']?.toString() ?? '未命名课程';
    if (contentId == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('确认删除'),
        content: Text('确定要删除"$title"吗？\n删除后无法恢复。'),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('取消')),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: ElevatedButton.styleFrom(
                backgroundColor: Colors.red.shade400,
                foregroundColor: Colors.white),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    final api = context.read<ApiService>();
    final success = await api.deleteLessonDraft(contentId);
    if (!mounted) return;
    if (success) {
      setState(() {
        _history.removeWhere((m) => _toInt(m['id']) == contentId);
      });
      _syncHistoryPoll();
      _showSnack('已删除');
    } else {
      _showSnack('删除失败，请稍后重试');
    }
  }

  void _showSnack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), behavior: SnackBarBehavior.floating),
    );
  }

  // ── 生成课程 ──
  Future<void> _handleGenerate() async {
    final topic = _topicController.text.trim();
    if (topic.isEmpty || _selectedChildId == null) return;
    setState(() {
      _isGenerating = true;
      _error = null;
      _generatedContent = null;
      _lessonData = null;
      _generationProgress = '正在提交生成请求...';
    });
    final api = context.read<ApiService>();
    try {
      final result = await api.generateLesson(
          topic: topic,
          childId: _selectedChildId!,
          domain: _selectedDomain,
          focus: _selectedFocus,
          ageGroup: _selectedAgeGroup,
          durationMinutes: 20);
      if (!mounted) return;
      if (result == null || result['error'] != null) {
        setState(() {
          _error = result?['error']?.toString() ?? '生成课程失败';
          _isGenerating = false;
          _generationProgress = '';
        });
        return;
      }
      final status = result['status']?.toString();
      if (status == 'draft') {
        _onLessonGenerated(result);
      } else if (status == 'generating') {
        setState(() {
          _generationProgress = 'AI 正在后台生成课程...';
          _generatedContent = result;
        });
        _startPolling(result);
        _loadHistory(silent: true);
      } else {
        setState(() {
          _error = '生成状态异常: $status';
          _isGenerating = false;
          _generationProgress = '';
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '生成课程失败: $e';
        _isGenerating = false;
        _generationProgress = '';
      });
    }
  }

  void _onLessonGenerated(Map<String, dynamic> content) {
    final rawContent = content['content'];
    Map<String, dynamic>? lesson;
    if (rawContent is String) {
      try {
        lesson = jsonDecode(rawContent) as Map<String, dynamic>;
      } catch (_) {}
    } else if (rawContent is Map) {
      lesson = rawContent.map((k, v) => MapEntry(k.toString(), v));
    }
    setState(() {
      _generatedContent = content;
      _lessonData = lesson;
      _isGenerating = false;
      _generationProgress = '';
      _expandedStepId =
          lesson?['steps'] is List && (lesson!['steps'] as List).isNotEmpty
              ? _stepId(lesson['steps'][0])
              : null;
      _sceneEdits = {};
      _editingSceneIndex = null;
      _previewSceneIndex = 0;
    });
  }

  void _startPolling(Map<String, dynamic> content) {
    _pollTimer?.cancel();
    final contentId = _toInt(content['id']);
    if (contentId == null) return;
    _pollCount = 0;
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (timer) async {
      try {
        final api = context.read<ApiService>();
        final latest = await api.getContentDetail(contentId);
        if (!mounted) {
          timer.cancel();
          return;
        }
        final status = latest?['status']?.toString();
        if (status == 'draft') {
          timer.cancel();
          _pollTimer = null;
          _onLessonGenerated(latest!);
          _loadHistory(silent: true);
        } else if (status == 'generation_failed') {
          timer.cancel();
          _pollTimer = null;
          setState(() {
            _error = latest?['subtitle']?.toString() ?? '生成课程失败，请重试';
            _isGenerating = false;
            _generationProgress = '';
            _generatedContent = null;
          });
          _loadHistory(silent: true);
        } else {
          _pollCount++;
          if (_pollCount >= _maxPollCount) {
            // 超时只放弃前台等待：服务端任务继续，历史页签仍可跟踪
            timer.cancel();
            _pollTimer = null;
            setState(() {
              _error = '等待超时，任务仍在后台生成，可在历史记录中查看';
              _isGenerating = false;
              _generationProgress = '';
              _generatedContent = null;
            });
            _loadHistory(silent: true);
          } else {
            final progress =
                latest?['subtitle']?.toString() ?? 'AI 正在后台生成课程...';
            if (progress != _generationProgress) {
              setState(() {
                _generationProgress = progress;
                if (latest != null) _generatedContent = latest;
              });
            }
          }
        }
      } catch (_) {}
    });
  }

  // ── 修改课程 ──
  Future<void> _handleModify() async {
    final text = _modificationController.text.trim();
    final contentId = _toInt(_generatedContent?['id']);
    if (text.isEmpty || contentId == null) return;
    setState(() {
      _isModifying = true;
      _error = null;
    });
    final api = context.read<ApiService>();
    final selectedStep = _selectedStep;
    try {
      final result = await api.modifyLesson(contentId, text,
          stepId: (_editScope == 'selected' && selectedStep != null)
              ? selectedStep['id']?.toString()
              : null);
      if (!mounted) return;
      if (result == null || result['error'] != null) {
        setState(() {
          _error = result?['error']?.toString() ?? '修改课程失败';
          _isModifying = false;
        });
        return;
      }
      final rawContent = result['content'];
      Map<String, dynamic>? lesson;
      if (rawContent is String) {
        try {
          lesson = jsonDecode(rawContent) as Map<String, dynamic>;
        } catch (_) {}
      } else if (rawContent is Map) {
        lesson = rawContent.map((k, v) => MapEntry(k.toString(), v));
      }
      setState(() {
        _generatedContent = result;
        _lessonData = lesson;
        _isModifying = false;
        _modificationController.clear();
        _sceneEdits = {};
        _editingSceneIndex = null;
        _previewSceneIndex = 0;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('课程已更新'), backgroundColor: Color(0xFF0B8F55)));
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '修改课程失败: $e';
        _isModifying = false;
      });
    }
  }

  // ── 确认发布 ──
  Future<void> _handleConfirm() async {
    final contentId = _toInt(_generatedContent?['id']);
    if (contentId == null || _selectedChildId == null) return;

    // 如果有未保存的场景编辑，先保存
    if (_sceneEdits.isNotEmpty) {
      setState(() {
        _isConfirming = true;
        _error = null;
      });
      final api = context.read<ApiService>();
      final modDesc = _buildSceneEditDescription();
      try {
        final modResult = await api.modifyLesson(contentId, modDesc);
        if (!mounted) return;
        if (modResult == null || modResult['error'] != null) {
          setState(() {
            _error = modResult?['error']?.toString() ?? '保存场景修改失败';
            _isConfirming = false;
          });
          return;
        }
        final rawContent = modResult['content'];
        if (rawContent is String) {
          try {
            _lessonData = jsonDecode(rawContent) as Map<String, dynamic>;
          } catch (_) {}
        } else if (rawContent is Map) {
          _lessonData = rawContent.map((k, v) => MapEntry(k.toString(), v));
        }
        _sceneEdits = {};
        _editingSceneIndex = null;
        _previewSceneIndex = 0;
      } catch (e) {
        if (!mounted) return;
        setState(() {
          _error = '保存场景修改失败: $e';
          _isConfirming = false;
        });
        return;
      }
    }

    setState(() {
      _isConfirming = true;
      _error = null;
    });
    final api = context.read<ApiService>();
    try {
      final result = await api.confirmLesson(contentId, _selectedChildId!);
      if (!mounted) return;
      if (result == null || result['error'] != null) {
        setState(() {
          _error = result?['error']?.toString() ?? '确认发布失败';
          _isConfirming = false;
        });
        return;
      }
      setState(() {
        _generatedContent = result;
        _isConfirming = false;
        _sceneEdits = {};
        _editingSceneIndex = null;
        _previewSceneIndex = 0;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('课程已发布到学生端！'), backgroundColor: Color(0xFF0B8F55)));
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '确认发布失败: $e';
        _isConfirming = false;
      });
    }
  }

  void _handleReset() {
    _pollTimer?.cancel();
    _pollTimer = null;
    setState(() {
      _generatedContent = null;
      _lessonData = null;
      _modificationController.clear();
      _error = null;
      _expandedStepId = null;
      _isGenerating = false;
      _generationProgress = '';
      _sceneEdits = {};
      _editingSceneIndex = null;
      _previewSceneIndex = 0;
    });
  }

  /// 以学生视角预览课程
  Future<void> _handlePreview() async {
    final contentId = _toInt(_generatedContent?['id']);
    if (contentId == null) return;

    // 如果有未保存的场景编辑，先保存草稿
    if (_sceneEdits.isNotEmpty) {
      setState(() {
        _isSavingDraft = true;
        _error = null;
      });
      final api = context.read<ApiService>();
      final modDesc = _buildSceneEditDescription();
      try {
        final result = await api.modifyLesson(contentId, modDesc);
        if (!mounted) return;
        if (result == null || result['error'] != null) {
          setState(() {
            _error = result?['error']?.toString() ?? '保存草稿失败';
            _isSavingDraft = false;
          });
          return;
        }
        final rawContent = result['content'];
        if (rawContent is String) {
          try {
            _lessonData = jsonDecode(rawContent) as Map<String, dynamic>;
          } catch (_) {}
        } else if (rawContent is Map) {
          _lessonData = rawContent.map((k, v) => MapEntry(k.toString(), v));
        }
        setState(() {
          _generatedContent = result;
          _isSavingDraft = false;
          _sceneEdits = {};
          _editingSceneIndex = null;
          _previewSceneIndex = 0;
        });
      } catch (e) {
        if (!mounted) return;
        setState(() {
          _error = '保存草稿失败: $e';
          _isSavingDraft = false;
        });
        return;
      }
    }

    if (!mounted) return;
    Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => StructuredLessonScreen(
            contentId: contentId,
            childId: _selectedChildId,
            previewMode: true,
          ),
        ));
  }

  void _applyQuickEdit(_QuickEditOption option) {
    final selectedStep = _selectedStep;
    setState(() {
      if (_editScope == 'selected' && selectedStep != null) {
        final stepLabel = selectedStep['label']?.toString() ?? '';
        final stepTitle = _getStepTitle(selectedStep);
        _modificationController.text =
            '请只修改"$stepLabel · $stepTitle"这一步，其他步骤尽量保持不变。\n重点修改方向：${option.prompt}\n请同时同步更新这一步的 scene 预览内容，让家长端预览和学生端展示保持一致。\n修改后继续保持内容贴合主题、年龄合适、表达自然。';
      } else {
        _modificationController.text =
            '请基于整节课做一次整体优化。\n重点修改方向：${option.prompt}\n如果某一步内容发生变化，请同步更新对应的 scene 预览内容。\n修改后继续保持内容贴合主题、年龄合适、表达自然。';
      }
    });
  }

  // ── 辅助方法 ──
  List<dynamic> get _steps {
    final s = _lessonData?['steps'];
    return s is List ? s : [];
  }

  Map<String, dynamic>? get _selectedStep {
    if (_expandedStepId == null || _steps.isEmpty) return null;
    for (final step in _steps) {
      if (_stepId(step) == _expandedStepId) {
        return step is Map
            ? step.map((k, v) => MapEntry(k.toString(), v))
            : null;
      }
    }
    return null;
  }

  String _stepId(dynamic step) =>
      step is Map ? step['id']?.toString() ?? '' : '';
  String _getStepTitle(Map<String, dynamic> step) {
    final module = step['module'];
    if (module is! Map) return step['id']?.toString() ?? '';
    final type = module['type']?.toString() ?? '';
    if (type == 'video') return '教学视频';
    if (type == 'reading') {
      return module['reading']?['goal']?.toString() ?? '阅读理解';
    }
    if (type == 'writing') {
      return module['writing']?['goal']?.toString() ?? '书写练习';
    }
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
    final module = step['module'];
    if (module is! Map) return '';
    final type = module['type']?.toString() ?? '';
    if (type == 'video') {
      final scenesRaw =
          module['visualStory']?['scenes'] ?? module['videoLesson']?['shots'];
      if (scenesRaw is List && scenesRaw.isNotEmpty) {
        return '共 ${scenesRaw.length} 个动画场景';
      }
      return '动画场景';
    }
    if (type == 'reading') {
      return module['reading']?['text']?.toString() ?? '阅读材料';
    }
    if (type == 'writing') {
      final items = module['writing']?['tracingItems'];
      if (items is List && items.isNotEmpty) return '描红: ${items.join(', ')}';
      return '书写练习';
    }
    if (type == 'game') {
      final questions = module['game']?['activityData']?['questions'] ??
          module['game']?['questions'];
      if (questions is List && questions.isNotEmpty) {
        return '共 ${questions.length} 道题';
      }
      return '互动游戏';
    }
    return type;
  }

  // ── 场景解析与编辑辅助 ──

  /// 从步骤中解析动画场景列表
  List<AnimationScene> _parseScenesFromStep(Map<String, dynamic> step) {
    final module = step['module'];
    if (module is! Map) return [];
    final scenesRaw =
        module['visualStory']?['scenes'] ?? module['videoLesson']?['shots'];
    if (scenesRaw is! List || scenesRaw.isEmpty) return [];
    return scenesRaw.whereType<Map>().map<AnimationScene>((s) {
      return AnimationScene(
        narration: s['narration']?.toString() ?? '',
        onScreenText: s['onScreenText']?.toString() ?? '',
        background: s['background']?.toString() ?? '#FFB6C1',
        character: s['character']?.toString() ?? '🦄',
      );
    }).toList();
  }

  /// 合并场景编辑后的数据
  AnimationScene _mergedScene(int index, List<AnimationScene> original) {
    final orig = original[index];
    final edits = _sceneEdits[index];
    if (edits == null) return orig;
    return AnimationScene(
      narration: edits['narration'] ?? orig.narration,
      onScreenText: edits['onScreenText'] ?? orig.onScreenText,
      background: orig.background,
      character: orig.character,
    );
  }

  /// 解析场景背景颜色
  Color _parseSceneColor(String background) {
    final hex = background.replaceAll('#', '').trim();
    if (RegExp(r'^[0-9a-fA-F]{6}$').hasMatch(hex)) {
      return Color(int.parse('FF$hex', radix: 16));
    }
    return AppTheme.softPink;
  }

  /// 构建场景编辑描述（用于 API 保存）
  String _buildSceneEditDescription() {
    final buffer = StringBuffer('请根据以下场景修改请求，更新课程中的 watch 步骤动画场景：\n\n');
    _sceneEdits.forEach((index, edits) {
      buffer.writeln('场景 ${index + 1}:');
      if (edits.containsKey('narration')) {
        buffer.writeln('  - 旁白修改为: ${edits['narration']}');
      }
      if (edits.containsKey('onScreenText')) {
        buffer.writeln('  - 屏幕文字修改为: ${edits['onScreenText']}');
      }
      buffer.writeln();
    });
    buffer.write('请保持其他场景不变，只更新上述指定场景的内容。');
    return buffer.toString();
  }

  int? get _currentParentId {
    final user = context.read<UserProvider>().currentUser;
    return _toInt(user?['id']);
  }

  int? _toInt(dynamic value) {
    if (value is int) return value;
    return int.tryParse(value?.toString() ?? '');
  }

  String _contentStatus() => _generatedContent?['status']?.toString() ?? '';

  // ── 场景编辑切换（含确认对话框 + 触觉反馈） ──
  void _toggleSceneEdit(int index) async {
    if (_editingSceneIndex == index) {
      // 正在编辑 → 关闭编辑态
      if (_sceneEdits.containsKey(index)) {
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            title: Text('确认退出编辑', style: TextStyle(color: AppTheme.textColor)),
            content: Text('当前场景的修改将会保留在本地，你可以稍后保存草稿。确定要关闭编辑吗？',
                style: TextStyle(color: AppTheme.textSecondary)),
            actions: [
              TextButton(
                  onPressed: () => Navigator.of(ctx).pop(false),
                  child: const Text('继续编辑')),
              ElevatedButton(
                onPressed: () => Navigator.of(ctx).pop(true),
                style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primaryColor,
                    foregroundColor: Colors.white),
                child: const Text('退出编辑'),
              ),
            ],
          ),
        );
        if (confirmed != true) return;
      }
      setState(() {
        _editingSceneIndex = null;
      });
      HapticFeedback.lightImpact();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: const Text('已退出场景编辑模式'),
              backgroundColor: AppTheme.textSecondary,
              behavior: SnackBarBehavior.floating,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10))),
        );
      }
    } else {
      // 其他场景 → 打开编辑态
      setState(() {
        _editingSceneIndex = index;
      });
      HapticFeedback.lightImpact();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text('正在编辑场景 ${index + 1}，修改后请记得保存草稿'),
              backgroundColor: AppTheme.primaryColor,
              behavior: SnackBarBehavior.floating,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10)),
              duration: const Duration(seconds: 2)),
        );
      }
    }
  }

  // ── 构建 UI ──
  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    return ChildFunPage(
      title: 'AI 课程生成',
      subtitle: '一键生成"看、读、写、练"完整课程',
      icon: Icons.auto_awesome_rounded,
      padding: EdgeInsets.zero,
      scrollable: false,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 6),
            child: Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: palette.card,
                borderRadius: BorderRadius.circular(palette.radiusMd),
                border: palette.isCartoon
                    ? Border.all(color: palette.line, width: 2)
                    : null,
              ),
              child: TabBar(
                controller: _tabController,
                dividerColor: Colors.transparent,
                indicatorSize: TabBarIndicatorSize.tab,
                indicator: BoxDecoration(
                  color: palette.pop,
                  borderRadius: BorderRadius.circular(palette.radiusSm),
                ),
                labelColor: palette.onPrimary,
                unselectedLabelColor: palette.ink2,
                tabs: const [
                  Tab(icon: Icon(Icons.auto_awesome_rounded), text: '生成'),
                  Tab(icon: Icon(Icons.history_rounded), text: '历史记录'),
                ],
              ),
            ),
          ),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildBody(),
                _buildHistoryTab(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (_isLoadingChildren || _isLoadingDraft) {
      return Padding(
        padding: EdgeInsets.all(16),
        child: Column(children: [
          ShimmerCard(height: 90),
          SizedBox(height: 12),
          ShimmerCard(height: 70),
          SizedBox(height: 12),
          ShimmerCard(height: 70),
        ]),
      );
    }
    if (_children.isEmpty) {
      return const EmptyState(
          emoji: '👨‍👧', title: '选择孩子并输入主题', subtitle: 'AI 将为你生成个性化学习课程');
    }
    return ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          ChildSelector(
              children: _children,
              selectedChildId: _selectedChildId,
              onChildChanged: _onChildChanged,
              mode: ChildSelectorMode.bottomSheet),
          const SizedBox(height: 14),
          if (_backgroundGeneratingCount > 0 && !_isGenerating)
            _buildBackgroundBanner(),
          if (_error != null) _buildErrorBanner(),
          if (_generatedContent == null) _buildInputForm(),
          if (_generatedContent != null && _lessonData == null && _isGenerating)
            _buildBackgroundTaskCard(),
          if (_generatedContent != null && _lessonData != null)
            _buildLessonPreview(),
        ]);
  }

  /// 上次进入页面时提交、仍在后台生成的任务提示
  Widget _buildBackgroundBanner() {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
          color: AppTheme.secondaryColor.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(14),
          border:
              Border.all(color: AppTheme.secondaryColor.withValues(alpha: 0.3))),
      child: Row(children: [
        SizedBox(
            width: 16,
            height: 16,
            child: CircularProgressIndicator(
                strokeWidth: 2, color: AppTheme.secondaryColor)),
        const SizedBox(width: 10),
        Expanded(
            child: Text('$_backgroundGeneratingCount 个课程正在后台生成',
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textColor))),
        TextButton(
            onPressed: () => _tabController.animateTo(1),
            style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                foregroundColor: AppTheme.secondaryColor),
            child: const Text('查看进度', style: TextStyle(fontSize: 12))),
      ]),
    );
  }

  /// 提交成功后的后台任务卡：不锁页，可离开、可看历史、可再提交一单
  Widget _buildBackgroundTaskCard() {
    final title = _generatedContent?['title']?.toString() ??
        _topicController.text.trim();
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                    strokeWidth: 2.5, color: AppTheme.primaryColor)),
            const SizedBox(width: 12),
            Expanded(
                child: Text(title,
                    style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.textColor))),
          ]),
          const SizedBox(height: 10),
          Text(
              _generationProgress.isNotEmpty
                  ? _generationProgress
                  : 'AI 正在后台生成课程...',
              style: TextStyle(fontSize: 13, color: AppTheme.textSecondary)),
          const SizedBox(height: 6),
          Text('生成在后台进行，无需停留在此页；离开后也可在「历史记录」查看进度、编辑或发布。',
              style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
          const SizedBox(height: 14),
          Row(children: [
            Expanded(
                child: OutlinedButton.icon(
              onPressed: () => _tabController.animateTo(1),
              icon: const Icon(Icons.history_rounded, size: 18),
              label: const Text('查看历史记录'),
              style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  foregroundColor: AppTheme.secondaryColor,
                  side: BorderSide(color: AppTheme.secondaryColor),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14))),
            )),
            const SizedBox(width: 10),
            Expanded(
                child: ElevatedButton.icon(
              onPressed: _handleReset,
              icon: const Icon(Icons.add_circle_outline_rounded, size: 18),
              label: const Text('再生成一个'),
              style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14))),
            )),
          ]),
        ]),
      ),
    );
  }

  // ═══ 历史记录页签 ═══

  Widget _buildHistoryTab() {
    if (_selectedChildId == null) {
      return Center(
          child: Text('请先在「生成」页选择孩子',
              style: TextStyle(color: AppTheme.textSecondary, fontSize: 15)));
    }
    if (_loadingHistory) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_history.isEmpty) {
      return Center(
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(Icons.school_rounded, size: 64, color: AppTheme.textSecondary),
        const SizedBox(height: 16),
        const Text('暂无生成记录',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        Text('在「生成」页提交主题后，\n任务进度与课程草稿会显示在这里',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppTheme.textSecondary, fontSize: 14)),
        const SizedBox(height: 20),
        ElevatedButton.icon(
          onPressed: () => _tabController.animateTo(0),
          icon: const Icon(Icons.auto_awesome_rounded),
          label: const Text('去生成课程'),
          style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.primaryColor,
              foregroundColor: Colors.white),
        ),
      ]));
    }
    return RefreshIndicator(
      onRefresh: () => _loadHistory(),
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _history.length + 1,
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (context, index) {
          if (index == 0) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 8, left: 4),
              child: Text('共 ${_history.length} 条记录',
                  style:
                      TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
            );
          }
          return _buildHistoryCard(_history[index - 1]);
        },
      ),
    );
  }

  Widget _buildHistoryCard(Map<String, dynamic> row) {
    final status = row['status']?.toString() ?? '';
    final title = row['title']?.toString() ?? '未命名课程';
    final subtitle = row['subtitle']?.toString() ?? '';
    final isGenerating = status == 'generating';
    final isFailed = status == 'generation_failed';
    final isDraft = status == 'draft';

    final IconData statusIcon;
    final Color statusColor;
    final String statusLabel;
    if (isGenerating) {
      statusIcon = Icons.sync_rounded;
      statusColor = AppTheme.secondaryColor;
      statusLabel = '生成中';
    } else if (isFailed) {
      statusIcon = Icons.error_rounded;
      statusColor = Colors.red;
      statusLabel = '失败';
    } else {
      statusIcon = Icons.edit_note_rounded;
      statusColor = AppTheme.primaryColor;
      statusLabel = '草稿';
    }

    String timeStr = '';
    final createdAt = row['createdAt']?.toString();
    if (createdAt != null) {
      final dt = DateTime.tryParse(createdAt);
      if (dt != null) {
        timeStr =
            '${dt.month}/${dt.day} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
      }
    }

    return Card(
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(statusIcon, color: statusColor, size: 18),
            const SizedBox(width: 6),
            Text(statusLabel,
                style: TextStyle(
                    color: statusColor,
                    fontWeight: FontWeight.w600,
                    fontSize: 13)),
            const Spacer(),
            Text(timeStr,
                style:
                    TextStyle(color: AppTheme.textSecondary, fontSize: 12)),
          ]),
          const SizedBox(height: 8),
          Text(title,
              style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.textColor)),
          if (subtitle.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(subtitle,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: 12,
                    color: isFailed ? Colors.red : AppTheme.textSecondary)),
          ],
          if (isGenerating) ...[
            const SizedBox(height: 8),
            Row(children: [
              SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: statusColor)),
              const SizedBox(width: 8),
              Text('后台生成中，可离开此页',
                  style:
                      TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
            ]),
          ],
          const SizedBox(height: 10),
          Row(mainAxisAlignment: MainAxisAlignment.end, children: [
            if (isDraft) ...[
              TextButton.icon(
                onPressed: () => _previewHistoryDraft(row),
                icon: const Icon(Icons.visibility_rounded, size: 18),
                label: const Text('预览'),
                style: TextButton.styleFrom(
                    foregroundColor: AppTheme.primaryColor,
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    minimumSize: const Size(0, 32),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap),
              ),
              const SizedBox(width: 4),
              TextButton.icon(
                onPressed: () => _editHistoryDraft(row),
                icon: const Icon(Icons.edit_rounded, size: 18),
                label: const Text('编辑'),
                style: TextButton.styleFrom(
                    foregroundColor: AppTheme.secondaryColor,
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    minimumSize: const Size(0, 32),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap),
              ),
            ],
            if (isFailed)
              TextButton.icon(
                onPressed: () => _retryHistoryTask(row),
                icon: const Icon(Icons.refresh_rounded, size: 18),
                label: const Text('重试'),
                style: TextButton.styleFrom(
                    foregroundColor: AppTheme.primaryColor,
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    minimumSize: const Size(0, 32),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap),
              ),
            if (isDraft || isFailed) ...[
              const SizedBox(width: 4),
              TextButton.icon(
                onPressed: () => _deleteHistoryRow(row),
                icon: const Icon(Icons.delete_outline_rounded, size: 18),
                label: const Text('删除'),
                style: TextButton.styleFrom(
                    foregroundColor: Colors.red.shade400,
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    minimumSize: const Size(0, 32),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap),
              ),
            ],
          ]),
        ]),
      ),
    );
  }

  Widget _buildErrorBanner() {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
          color: Colors.red.shade50,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colors.red.shade200)),
      child: Row(children: [
        Icon(Icons.error_outline_rounded, color: Colors.red.shade700, size: 20),
        const SizedBox(width: 8),
        Expanded(
            child: Text(_error!,
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: Colors.red.shade700))),
      ]),
    );
  }

  Widget _buildInputForm() {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(Icons.auto_awesome_rounded,
                size: 22, color: AppTheme.primaryColor),
            SizedBox(width: 8),
            Text('一键生成学习课程',
                style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.textColor)),
          ]),
          const SizedBox(height: 6),
          Text('输入学习主题，AI 自动生成包含"看、读、写、练"四步的完整课程',
              style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
          const SizedBox(height: 16),
          _buildLabel('学习主题'),
          const SizedBox(height: 6),
          TextField(
            controller: _topicController,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              hintText: '例如：认识动物、数字1-10、四季变化',
              filled: true,
              fillColor: Colors.white,
              border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide.none),
              enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide(color: Colors.grey.shade200)),
              focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide:
                      BorderSide(color: AppTheme.primaryColor, width: 2)),
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            ),
            enabled: !_isGenerating,
          ),
          const SizedBox(height: 16),
          _buildLabel('年龄组'),
          const SizedBox(height: 6),
          _buildChipSelector(
              items: const [
                _ChipItem(value: '3-4', label: '3-4岁'),
                _ChipItem(value: '5-6', label: '5-6岁')
              ],
              selectedValue: _selectedAgeGroup,
              onSelected: (v) => setState(() => _selectedAgeGroup = v)),
          const SizedBox(height: 14),
          _buildLabel('学习领域'),
          const SizedBox(height: 6),
          _buildChipSelector(
              items: _domainOptions
                  .map((d) => _ChipItem(value: d.value, label: d.label))
                  .toList(),
              selectedValue: _selectedDomain,
              onSelected: (v) => setState(() => _selectedDomain = v)),
          const SizedBox(height: 14),
          _buildLabel('专注方向'),
          const SizedBox(height: 6),
          _buildChipSelector(
              items: _focusOptions
                  .map((f) => _ChipItem(value: f.value, label: f.label))
                  .toList(),
              selectedValue: _selectedFocus,
              onSelected: (v) => setState(() => _selectedFocus = v)),
          const SizedBox(height: 18),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: (_isGenerating ||
                      _topicController.text.trim().isEmpty ||
                      _selectedChildId == null)
                  ? null
                  : _handleGenerate,
              icon: _isGenerating
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.auto_awesome_rounded, size: 20),
              label: Text(_isGenerating
                  ? (_generationProgress.isNotEmpty
                      ? _generationProgress
                      : 'AI 正在生成课程...')
                  : '生成学习课程'),
              style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14))),
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
      Card(
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text(title,
                      style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.textColor)),
                  if (summary.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(summary,
                        style: TextStyle(
                            fontSize: 13, color: AppTheme.textSecondary))
                  ],
                  if (outcomes is List && outcomes.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: outcomes
                            .map<Widget>((o) => Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 10, vertical: 4),
                                  decoration: BoxDecoration(
                                      color: AppTheme.primaryColor
                                          .withValues(alpha: 0.12),
                                      borderRadius: BorderRadius.circular(20)),
                                  child: Text(o.toString(),
                                      style: TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w600,
                                          color: AppTheme.primaryColor)),
                                ))
                            .toList()),
                  ],
                ])),
            TextButton.icon(
              onPressed: _isSavingDraft ? null : _handlePreview,
              icon: const Icon(Icons.play_circle_outline_rounded, size: 18),
              label: const Text('以学生视角预览', style: TextStyle(fontSize: 12)),
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                foregroundColor: AppTheme.primaryColor,
              ),
            ),
            IconButton(
                onPressed: _handleReset,
                tooltip: '重新生成',
                icon: Icon(Icons.refresh_rounded,
                    size: 22, color: AppTheme.textSecondary)),
          ]),
        ),
      ),
      const SizedBox(height: 12),
      Text('课程四步预览',
          style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: AppTheme.textSecondary,
              letterSpacing: 0.5)),
      const SizedBox(height: 8),
      ..._steps.map<Widget>((step) {
        final stepMap = step is Map
            ? step.map<String, dynamic>((k, v) => MapEntry(k.toString(), v))
            : <String, dynamic>{};
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
    final isWatchStep = stepId == 'watch';
    final scenes =
        isWatchStep ? _parseScenesFromStep(step) : <AnimationScene>[];
    return Card(
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: isExpanded
              ? BorderSide(
                  color: AppTheme.primaryColor.withValues(alpha: 0.35),
                  width: 1.5)
              : BorderSide.none),
      color: isExpanded
          ? AppTheme.primaryColor.withValues(alpha: 0.06)
          : Colors.white,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => setState(() {
          final wasSame = _expandedStepId == stepId;
          _expandedStepId = wasSame ? null : stepId;
          if (!wasSame) {
            _previewSceneIndex = 0;
            _editingSceneIndex = null;
          }
        }),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Text(icon, style: const TextStyle(fontSize: 22)),
              const SizedBox(width: 12),
              Expanded(
                  child: Text('$label — $title',
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.textColor))),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                    color: AppTheme.backgroundColor,
                    borderRadius: BorderRadius.circular(10)),
                child: Text(moduleType,
                    style:
                        TextStyle(fontSize: 10, color: AppTheme.textSecondary)),
              ),
              const SizedBox(width: 4),
              Icon(
                  isExpanded
                      ? Icons.expand_less_rounded
                      : Icons.expand_more_rounded,
                  size: 20,
                  color: AppTheme.textSecondary),
            ]),
            if (isExpanded) ...[
              const SizedBox(height: 12),
              if (isWatchStep && scenes.isNotEmpty)
                _buildLightweightScenePreview(scenes)
              else
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                      color: AppTheme.backgroundColor,
                      borderRadius: BorderRadius.circular(12)),
                  child: Text(previewText,
                      style: TextStyle(
                          fontSize: 12,
                          color: AppTheme.textSecondary,
                          height: 1.5),
                      maxLines: 5,
                      overflow: TextOverflow.ellipsis),
                ),
              if (isWatchStep && scenes.isNotEmpty) ...[
                const SizedBox(height: 12),
                _buildSceneEditList(scenes),
              ],
            ],
          ]),
        ),
      ),
    );
  }

  // ── 轻量视频场景预览 ──

  Widget _buildLightweightScenePreview(List<AnimationScene> scenes) {
    if (_previewSceneIndex >= scenes.length) _previewSceneIndex = 0;
    final scene = _mergedScene(_previewSceneIndex, scenes);
    final bgColor = _parseSceneColor(scene.background);
    return Column(children: [
      ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Container(
          height: 180,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                bgColor,
                bgColor.withValues(alpha: 0.5),
                AppTheme.backgroundColor
              ],
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
            ),
          ),
          child: Stack(children: [
            Center(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 50),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Text(scene.character.isNotEmpty ? scene.character : '🎬',
                      style: const TextStyle(fontSize: 42)),
                  if (scene.onScreenText.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(scene.onScreenText,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w900,
                            color: AppTheme.textColor)),
                  ],
                ]),
              ),
            ),
            if (scene.narration.isNotEmpty)
              Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.92),
                      borderRadius:
                          const BorderRadius.vertical(top: Radius.circular(12)),
                    ),
                    child: Row(children: [
                      Icon(Icons.record_voice_over_rounded,
                          size: 14, color: AppTheme.primaryColor),
                      const SizedBox(width: 6),
                      Expanded(
                          child: Text(scene.narration,
                              style: TextStyle(
                                  fontSize: 12, color: AppTheme.textColor),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis)),
                    ]),
                  )),
          ]),
        ),
      ),
      const SizedBox(height: 8),
      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        _smallNavButton(Icons.chevron_left, () {
          if (_previewSceneIndex > 0) {
            setState(() {
              _previewSceneIndex--;
              _editingSceneIndex = null;
            });
          }
        }),
        ...List.generate(
            scenes.length,
            (i) => AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  margin: const EdgeInsets.symmetric(horizontal: 2),
                  width: _previewSceneIndex == i ? 16 : 6,
                  height: 6,
                  decoration: BoxDecoration(
                    color: _previewSceneIndex == i
                        ? AppTheme.primaryColor
                        : Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(3),
                  ),
                )),
        _smallNavButton(Icons.chevron_right, () {
          if (_previewSceneIndex < scenes.length - 1) {
            setState(() {
              _previewSceneIndex++;
              _editingSceneIndex = null;
            });
          }
        }),
      ]),
    ]);
  }

  Widget _smallNavButton(IconData icon, VoidCallback onPressed) {
    return GestureDetector(
      onTap: onPressed,
      child: Container(
        width: 28,
        height: 28,
        decoration: BoxDecoration(
            color: AppTheme.primaryColor.withValues(alpha: 0.1),
            shape: BoxShape.circle),
        child: Icon(icon, size: 18, color: AppTheme.primaryColor),
      ),
    );
  }

  // ── 场景编辑列表 ──

  Widget _buildSceneEditList(List<AnimationScene> scenes) {
    final hasEditsSet = _sceneEdits.isNotEmpty;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Expanded(
            child: Text('场景内容编辑',
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textColor))),
        if (hasEditsSet)
          GestureDetector(
            onTap: _handleSaveDraft,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                  color: AppTheme.primaryColor,
                  borderRadius: BorderRadius.circular(12)),
              child: _isSavingDraft
                  ? const SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : const Text('保存草稿',
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: Colors.white)),
            ),
          ),
      ]),
      const SizedBox(height: 8),
      ...List.generate(scenes.length, (i) {
        final scene = _mergedScene(i, scenes);
        final isEditing = _editingSceneIndex == i;
        final hasEdit = _sceneEdits.containsKey(i);
        return Container(
          margin: const EdgeInsets.only(bottom: 6),
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: isEditing
                ? AppTheme.primaryColor.withValues(alpha: 0.05)
                : AppTheme.backgroundColor,
            borderRadius: BorderRadius.circular(12),
            border: isEditing
                ? Border.all(
                    color: AppTheme.primaryColor.withValues(alpha: 0.3))
                : hasEdit
                    ? Border.all(
                        color: AppTheme.accentColor.withValues(alpha: 0.5))
                    : null,
          ),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Container(
                width: 20,
                height: 20,
                decoration: BoxDecoration(
                  color: hasEdit ? AppTheme.accentColor : AppTheme.primaryColor,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Center(
                    child: Text('${i + 1}',
                        style: const TextStyle(
                            fontSize: 10,
                            color: Colors.white,
                            fontWeight: FontWeight.bold))),
              ),
              const SizedBox(width: 8),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text(
                        '旁白: ${scene.narration.isNotEmpty ? scene.narration : '(空)'}',
                        style: TextStyle(
                            fontSize: 12,
                            color: AppTheme.textColor,
                            fontWeight: FontWeight.w500),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis),
                    if (scene.onScreenText.isNotEmpty)
                      Text('屏幕文字: ${scene.onScreenText}',
                          style: TextStyle(
                              fontSize: 11, color: AppTheme.textSecondary),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis),
                  ])),
              GestureDetector(
                onTap: () => _toggleSceneEdit(i),
                child: Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: AppTheme.primaryColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    isEditing ? Icons.check_rounded : Icons.edit_rounded,
                    size: 16,
                    color: AppTheme.primaryColor,
                  ),
                ),
              ),
            ]),
            if (isEditing) ...[
              const SizedBox(height: 8),
              _buildSceneEditFields(i, scene),
            ],
          ]),
        );
      }),
    ]);
  }

  Widget _buildSceneEditFields(int index, AnimationScene scene) {
    return Column(children: [
      TextField(
        decoration: InputDecoration(
          labelText: '旁白文字',
          labelStyle: const TextStyle(fontSize: 12),
          hintText: scene.narration.isNotEmpty ? scene.narration : '输入旁白...',
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide.none),
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          isDense: true,
        ),
        style: const TextStyle(fontSize: 13),
        maxLines: 2,
        onChanged: (v) {
          _sceneEdits[index] ??= {};
          _sceneEdits[index]!['narration'] = v;
          setState(() {});
        },
      ),
      const SizedBox(height: 6),
      TextField(
        decoration: InputDecoration(
          labelText: '屏幕文字',
          labelStyle: const TextStyle(fontSize: 12),
          hintText:
              scene.onScreenText.isNotEmpty ? scene.onScreenText : '输入屏幕文字...',
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide.none),
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          isDense: true,
        ),
        style: const TextStyle(fontSize: 13),
        maxLines: 1,
        onChanged: (v) {
          _sceneEdits[index] ??= {};
          _sceneEdits[index]!['onScreenText'] = v;
          setState(() {});
        },
      ),
    ]);
  }

  // ── 保存草稿 ──

  Future<void> _handleSaveDraft() async {
    final contentId = _toInt(_generatedContent?['id']);
    if (contentId == null || _sceneEdits.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('没有需要保存的修改')));
      }
      return;
    }
    setState(() {
      _isSavingDraft = true;
      _error = null;
    });
    final api = context.read<ApiService>();
    final modDesc = _buildSceneEditDescription();
    try {
      final result = await api.modifyLesson(contentId, modDesc);
      if (!mounted) return;
      if (result == null || result['error'] != null) {
        setState(() {
          _error = result?['error']?.toString() ?? '保存草稿失败';
          _isSavingDraft = false;
        });
        return;
      }
      final rawContent = result['content'];
      Map<String, dynamic>? lesson;
      if (rawContent is String) {
        try {
          lesson = jsonDecode(rawContent) as Map<String, dynamic>;
        } catch (_) {}
      } else if (rawContent is Map) {
        lesson = rawContent.map((k, v) => MapEntry(k.toString(), v));
      }
      setState(() {
        _generatedContent = result;
        _lessonData = lesson;
        _isSavingDraft = false;
        _sceneEdits = {};
        _editingSceneIndex = null;
        _previewSceneIndex = 0;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('草稿已保存'), backgroundColor: Color(0xFF0B8F55)));
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '保存草稿失败: $e';
        _isSavingDraft = false;
      });
    }
  }

  Widget _buildModificationPanel() {
    final selectedStep = _selectedStep;
    final quickEdits = _currentQuickEdits;
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('AI 修改课程',
              style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.textColor)),
          const SizedBox(height: 12),
          Row(children: [
            _buildScopeChip(
                label:
                    '只改当前步骤${selectedStep != null ? ' · ${selectedStep['label']}' : ''}',
                isSelected: _editScope == 'selected',
                onTap: selectedStep != null
                    ? () => setState(() => _editScope = 'selected')
                    : null),
            const SizedBox(width: 8),
            _buildScopeChip(
                label: '改整个课程',
                isSelected: _editScope == 'all',
                onTap: () => setState(() => _editScope = 'all')),
          ]),
          const SizedBox(height: 8),
          Text(
              _editScope == 'selected' && selectedStep != null
                  ? '这次修改会优先聚焦在"${selectedStep['label']} · ${_getStepTitle(selectedStep)}"这一步。'
                  : '这次修改会作为整节课的全局编辑请求处理。',
              style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
          const SizedBox(height: 12),
          Text('快捷修改模板',
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textSecondary)),
          const SizedBox(height: 8),
          Wrap(
              spacing: 8,
              runSpacing: 8,
              children: quickEdits
                  .map((option) => InkWell(
                        borderRadius: BorderRadius.circular(20),
                        onTap: () => _applyQuickEdit(option),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                              color: AppTheme.backgroundColor,
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(color: Colors.grey.shade300)),
                          child: Text(option.label,
                              style: TextStyle(
                                  fontSize: 12, color: AppTheme.textColor)),
                        ),
                      ))
                  .toList()),
          const SizedBox(height: 12),
          TextField(
            controller: _modificationController,
            maxLines: 4,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              hintText: '输入修改要求，或点击上方模板快速填写...',
              filled: true,
              fillColor: Colors.white,
              border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide.none),
              enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide(color: Colors.grey.shade200)),
              focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide:
                      BorderSide(color: AppTheme.primaryColor, width: 2)),
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            ),
            enabled: !_isModifying,
          ),
          const SizedBox(height: 6),
          Text('点击模板后会自动填入草稿，可继续编辑再提交',
              style: TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
          const SizedBox(height: 12),
          Row(mainAxisAlignment: MainAxisAlignment.end, children: [
            TextButton(
                onPressed:
                    _isModifying ? null : () => _modificationController.clear(),
                child: const Text('清空')),
            const SizedBox(width: 8),
            ElevatedButton(
              onPressed:
                  (_isModifying || _modificationController.text.trim().isEmpty)
                      ? null
                      : _handleModify,
              style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primaryColor,
                  foregroundColor: Colors.white,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12))),
              child: _isModifying
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : const Text('提交修改'),
            ),
          ]),
        ]),
      ),
    );
  }

  Widget _buildScopeChip(
      {required String label,
      required bool isSelected,
      required VoidCallback? onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? AppTheme.primaryColor : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
              color: isSelected ? AppTheme.primaryColor : Colors.grey.shade300,
              width: isSelected ? 1.5 : 1),
        ),
        child: Text(label,
            style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: isSelected ? Colors.white : AppTheme.textColor)),
      ),
    );
  }

  Widget _buildConfirmSection() {
    final status = _contentStatus();
    if (status == 'draft') {
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (_sceneEdits.isNotEmpty) ...[
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: _isSavingDraft ? null : _handleSaveDraft,
              icon: _isSavingDraft
                  ? SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: AppTheme.primaryColor))
                  : const Icon(Icons.save_outlined, size: 20),
              label: Text(_isSavingDraft
                  ? '正在保存...'
                  : '保存草稿（${_sceneEdits.length} 个场景已修改）'),
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14)),
                side: BorderSide(color: AppTheme.accentColor),
                foregroundColor: AppTheme.accentColor,
              ),
            ),
          ),
          const SizedBox(height: 10),
        ],
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: (_isConfirming) ? null : _handleConfirm,
            icon: _isConfirming
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.check_circle_outline_rounded, size: 20),
            label: Text(_isConfirming ? '正在发布...' : '确认内容，发布到学生端'),
            style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14))),
          ),
        ),
      ]);
    }
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(
          color: AppTheme.primaryColor.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(14)),
      child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(Icons.check_circle_rounded,
            size: 20, color: AppTheme.primaryColor),
        SizedBox(width: 8),
        Text('课程已发布，学生可以在学习页面看到此课程',
            style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppTheme.primaryColor)),
      ]),
    );
  }

  Widget _buildLabel(String text) => Text(text,
      style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: AppTheme.textColor));

  Widget _buildChipSelector(
      {required List<_ChipItem> items,
      required String selectedValue,
      required ValueChanged<String> onSelected}) {
    return Wrap(
        spacing: 6,
        runSpacing: 6,
        children: items.map((item) {
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
                  color:
                      isSelected ? AppTheme.primaryColor : Colors.grey.shade300,
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
