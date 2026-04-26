import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/content_provider.dart';
import '../../services/api_service.dart';
import '../games/game_renderer.dart';
import '../../theme/app_theme.dart';

/// 结构化课程视图：展示章节列表、进度与章节学习入口。
class StructuredLessonView extends StatefulWidget {
  final int contentId;
  final int? childId;
  final VoidCallback onBack;

  const StructuredLessonView({
    super.key,
    required this.contentId,
    required this.childId,
    required this.onBack,
  });

  @override
  State<StructuredLessonView> createState() => _StructuredLessonViewState();
}

class _StructuredLessonViewState extends State<StructuredLessonView> {
  bool _isLoading = true;
  String? _error;
  String _title = '结构化课程';
  String _ageGroup = '';
  List<_LessonStepItem> _steps = const [];
  Set<String> _completedStepIds = <String>{};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadLessonData();
    });
  }

  Future<void> _loadLessonData() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      // 先加载课程详情，复用已有 ContentProvider 的数据流。
      final contentProvider = context.read<ContentProvider>();
      await contentProvider.loadContentDetail(widget.contentId);
      final content = contentProvider.currentContent;
      if (content == null) {
        throw Exception('课程不存在或加载失败');
      }

      final parsed = _parseStructuredContent(content['content']);
      final steps = _parseSteps(parsed);
      if (steps.isEmpty) {
        throw Exception('该课程暂无章节内容');
      }

      final completedIds = await _loadProgress();

      if (!mounted) return;
      setState(() {
        _title = (content['title']?.toString().trim().isNotEmpty ?? false)
            ? content['title'].toString()
            : '结构化课程';
        _ageGroup = parsed?['ageGroup']?.toString() ??
            content['age_range']?.toString() ??
            content['ageRange']?.toString() ??
            '';
        _steps = steps;
        _completedStepIds = completedIds;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '加载课程失败：$e';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  Future<Set<String>> _loadProgress() async {
    if (widget.childId == null) return <String>{};

    final api = context.read<ApiService>();
    final progress = await api.getLessonProgress(
      contentId: widget.contentId,
      childId: widget.childId!,
    );

    final ids = progress?['completedSteps'];
    if (ids is! List) return <String>{};

    return ids
        .map((e) => e?.toString())
        .whereType<String>()
        .where((e) => e.isNotEmpty)
        .toSet();
  }

  Future<bool> _completeStep(
    _LessonStepItem step, {
    int? score,
    int? durationSeconds,
    Map<String, dynamic>? interactionData,
  }) async {
    if (widget.childId == null) return false;

    if (_completedStepIds.contains(step.id)) return true;

    final api = context.read<ApiService>();
    final result = await api.completeLessonStep(
      contentId: widget.contentId,
      stepId: step.id,
      childId: widget.childId!,
      score: score ?? 100,
      durationSeconds: durationSeconds ?? 60,
      interactionData: {
        'source': 'flutter_structured_lesson',
        if (interactionData != null) ...interactionData,
      },
    );

    if (result == null) return false;

    if (!mounted) return true;
    setState(() {
      _completedStepIds = {..._completedStepIds, step.id};
    });
    return true;
  }

  Map<String, dynamic>? _parseStructuredContent(dynamic raw) {
    if (raw == null) return null;
    if (raw is Map<String, dynamic>) return raw;
    if (raw is Map) {
      return raw.map((k, v) => MapEntry(k.toString(), v));
    }
    if (raw is String) {
      final text = raw.trim();
      if (text.isEmpty) return null;
      try {
        final decoded = jsonDecode(text);
        if (decoded is Map<String, dynamic>) return decoded;
        if (decoded is Map) {
          return decoded.map((k, v) => MapEntry(k.toString(), v));
        }
      } catch (_) {
        return null;
      }
    }
    return null;
  }

  List<_LessonStepItem> _parseSteps(Map<String, dynamic>? structured) {
    final rawSteps = structured?['steps'];
    if (rawSteps is! List) return const [];

    final result = <_LessonStepItem>[];
    for (var i = 0; i < rawSteps.length; i++) {
      final item = rawSteps[i];
      if (item is! Map) continue;

      final map = item.map((k, v) => MapEntry(k.toString(), v));
      final id = map['id']?.toString().trim();
      if (id == null || id.isEmpty) continue;

      final module = map['module'];
      final moduleMap = module is Map
          ? module.map((k, v) => MapEntry(k.toString(), v))
          : <String, dynamic>{};

      result.add(_LessonStepItem(
        id: id,
        label: (map['label']?.toString().trim().isNotEmpty ?? false)
            ? map['label'].toString()
            : '章节${i + 1}',
        order: (map['order'] is num) ? (map['order'] as num).toInt() : i + 1,
        module: moduleMap,
      ));
    }

    result.sort((a, b) => a.order.compareTo(b.order));
    return result;
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return Scaffold(
        backgroundColor: AppTheme.backgroundColor,
        appBar: AppBar(
          title: const Text('加载课程中'),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_rounded),
            onPressed: widget.onBack,
          ),
        ),
        body: const Center(
          child: CircularProgressIndicator(color: AppTheme.primaryColor),
        ),
      );
    }

    if (_error != null) {
      return Scaffold(
        backgroundColor: AppTheme.backgroundColor,
        appBar: AppBar(
          title: const Text('结构化课程'),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_rounded),
            onPressed: widget.onBack,
          ),
        ),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  _error!,
                  style: const TextStyle(color: AppTheme.textColor),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: _loadLessonData,
                  icon: const Icon(Icons.refresh_rounded),
                  label: const Text('重试'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final completedCount = _completedStepIds.length;
    final totalCount = _steps.length;
    final progress = totalCount == 0 ? 0.0 : completedCount / totalCount;
    final currentStepIndex = _steps.indexWhere((s) => !_completedStepIds.contains(s.id));

    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      appBar: AppBar(
        title: Text(_title),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: widget.onBack,
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _ProgressCard(
                completedCount: completedCount,
                totalCount: totalCount,
                ageGroup: _ageGroup,
                progress: progress,
              ),
              const SizedBox(height: 12),
              Text(
                '课程章节',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textColor,
                    ),
              ),
              const SizedBox(height: 8),
              Expanded(
                child: ListView.separated(
                  itemCount: _steps.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (context, index) {
                    final step = _steps[index];
                    final isCompleted = _completedStepIds.contains(step.id);
                    final isCurrent = !isCompleted && index == currentStepIndex;
                    final status = isCompleted
                        ? _LessonStepStatus.completed
                        : (isCurrent
                            ? _LessonStepStatus.inProgress
                            : _LessonStepStatus.notStarted);

                    return _LessonStepCard(
                      index: index,
                      step: step,
                      status: status,
                      onTap: () async {
                        final changed = await Navigator.of(context).push<bool>(
                          MaterialPageRoute(
                            builder: (_) => _LessonStepLearningScreen(
                              step: step,
                              status: status,
                              onComplete: ({
                                int? score,
                                int? durationSeconds,
                                Map<String, dynamic>? interactionData,
                              }) =>
                                  _completeStep(
                                step,
                                score: score,
                                durationSeconds: durationSeconds,
                                interactionData: interactionData,
                              ),
                            ),
                          ),
                        );

                        if (!mounted) return;
                        if (changed == true) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text('已完成章节：${step.label}'),
                              behavior: SnackBarBehavior.floating,
                            ),
                          );
                        }
                      },
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProgressCard extends StatelessWidget {
  final int completedCount;
  final int totalCount;
  final String ageGroup;
  final double progress;

  const _ProgressCard({
    required this.completedCount,
    required this.totalCount,
    required this.ageGroup,
    required this.progress,
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Card(
      elevation: 0,
      color: scheme.surfaceContainerHighest.withOpacity(0.5),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.insights_rounded, color: scheme.primary),
                const SizedBox(width: 8),
                Text(
                  '学习进度',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
                const Spacer(),
                if (ageGroup.trim().isNotEmpty)
                  Chip(
                    label: Text('$ageGroup 岁'),
                    visualDensity: VisualDensity.compact,
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '$completedCount / $totalCount 章节已完成',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: AppTheme.textSecondary,
                  ),
            ),
            const SizedBox(height: 10),
            LinearProgressIndicator(
              value: progress,
              borderRadius: BorderRadius.circular(999),
              minHeight: 8,
              backgroundColor: scheme.surfaceContainerHighest,
            ),
          ],
        ),
      ),
    );
  }
}

class _LessonStepCard extends StatelessWidget {
  final int index;
  final _LessonStepItem step;
  final _LessonStepStatus status;
  final VoidCallback onTap;

  const _LessonStepCard({
    required this.index,
    required this.step,
    required this.status,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final statusUi = _statusUI(status, scheme);

    return Card(
      elevation: 0,
      color: status == _LessonStepStatus.completed
          ? scheme.primaryContainer.withOpacity(0.35)
          : scheme.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: scheme.outlineVariant.withOpacity(0.4)),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              CircleAvatar(
                radius: 18,
                backgroundColor: statusUi.badgeBg,
                child: Text(
                  '${index + 1}',
                  style: TextStyle(
                    color: statusUi.badgeText,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      step.label,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                            color: AppTheme.textColor,
                          ),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Icon(statusUi.icon, size: 16, color: statusUi.text),
                        const SizedBox(width: 4),
                        Text(
                          statusUi.label,
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: statusUi.text,
                                fontWeight: FontWeight.w600,
                              ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: scheme.outline),
            ],
          ),
        ),
      ),
    );
  }
}

class _LessonStepLearningScreen extends StatefulWidget {
  final _LessonStepItem step;
  final _LessonStepStatus status;
  final Future<bool> Function({
    int? score,
    int? durationSeconds,
    Map<String, dynamic>? interactionData,
  }) onComplete;

  const _LessonStepLearningScreen({
    required this.step,
    required this.status,
    required this.onComplete,
  });

  @override
  State<_LessonStepLearningScreen> createState() => _LessonStepLearningScreenState();
}

class _LessonStepLearningScreenState extends State<_LessonStepLearningScreen> {
  bool _isCompleting = false;
  bool _gameResultSaved = false;

  @override
  Widget build(BuildContext context) {
    if (_isGameStep(widget.step.module)) {
      return _buildGameStep(context);
    }

    final summary = _stepSummary(widget.step.module);
    final done = widget.status == _LessonStepStatus.completed;

    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      appBar: AppBar(title: Text('章节学习 · ${widget.step.label}')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Card(
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '学习内容',
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        summary.isEmpty ? '本章节暂无详细描述，点击下方按钮可记录完成。' : summary,
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ],
                  ),
                ),
              ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: FilledButton.icon(
                  onPressed: done || _isCompleting
                      ? null
                      : () async {
                          setState(() => _isCompleting = true);
                          final ok = await widget.onComplete(
                            interactionData: const {
                              'stepType': 'default',
                            },
                          );
                          if (!mounted) return;
                          setState(() => _isCompleting = false);

                          if (ok) {
                            Navigator.of(context).pop(true);
                          } else {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('记录章节完成失败，请稍后重试'),
                                behavior: SnackBarBehavior.floating,
                              ),
                            );
                          }
                        },
                  icon: done
                      ? const Icon(Icons.check_circle_rounded)
                      : (_isCompleting
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.task_alt_rounded)),
                  label: Text(done ? '本章节已完成' : (_isCompleting ? '正在提交...' : '完成本章节')),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildGameStep(BuildContext context) {
    final done = widget.status == _LessonStepStatus.completed;
    final payload = _resolveGamePayload(widget.step.module);
    final title = payload['title']?.toString() ?? widget.step.label;

    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      appBar: AppBar(title: Text('互动练习 · $title')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: done
              ? _buildCompletedState()
              : GameRenderer(
                  activityType: payload['activityType']?.toString(),
                  initialData: payload['activityData'] as Map<String, dynamic>?,
                  gameId: payload['gameId']?.toString(),
                  difficulty: payload['difficulty'] as int? ?? 1,
                  onExit: () => Navigator.of(context).pop(_gameResultSaved),
                  onCompleted: (result) async {
                    if (_isCompleting) return;
                    setState(() => _isCompleting = true);
                    final ok = await widget.onComplete(
                      score: _toInt(result['score'], fallback: 100),
                      durationSeconds:
                          _toInt(result['timeSpent'], fallback: 60),
                      interactionData: {
                        'stepType': 'game',
                        'gameType': payload['activityType']?.toString() ?? 'quiz',
                        'gameResult': result,
                      },
                    );
                    if (!mounted) return;
                    setState(() => _isCompleting = false);

                    if (ok) {
                      setState(() => _gameResultSaved = true);
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('成绩已保存，可点击“返回课程”继续'),
                          behavior: SnackBarBehavior.floating,
                        ),
                      );
                    } else {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('保存游戏结果失败，请稍后重试'),
                          behavior: SnackBarBehavior.floating,
                        ),
                      );
                    }
                  },
                ),
        ),
      ),
    );
  }

  Widget _buildCompletedState() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: const [
          Icon(
            Icons.check_circle_rounded,
            size: 56,
            color: AppTheme.accentColor,
          ),
          SizedBox(height: 8),
          Text(
            '该练习已完成',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }

  bool _isGameStep(Map<String, dynamic> module) {
    final type = module['type']?.toString().trim();
    if (type == 'game') return true;
    if (module['game'] is Map) return true;
    return false;
  }

  Map<String, dynamic> _resolveGamePayload(Map<String, dynamic> module) {
    final game = module['game'] is Map
        ? (module['game'] as Map)
            .map((k, v) => MapEntry(k.toString(), v))
        : <String, dynamic>{};

    final activityType = _pickFirstText([
      game['activityType'],
      module['activityType'],
      game['gameType'],
      module['gameType'],
      'quiz',
    ]);

    final dataRaw = game['activityData'] ?? module['activityData'] ?? game;
    final activityData = _toStringKeyMap(dataRaw);

    return {
      'title': _pickFirstText([
        activityData['title'],
        game['title'],
        module['label'],
        widget.step.label,
      ]),
      'activityType': activityType,
      'activityData': activityData,
      'gameId': _pickFirstText([
        game['gameId'],
        game['id'],
        module['gameId'],
      ]),
      'difficulty': _toInt(game['difficulty'], fallback: 1),
    };
  }

  String _pickFirstText(List<dynamic> candidates, {String fallback = ''}) {
    for (final candidate in candidates) {
      final text = candidate?.toString().trim() ?? '';
      if (text.isNotEmpty) return text;
    }
    return fallback;
  }

  Map<String, dynamic> _toStringKeyMap(dynamic value) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map) {
      return value.map((k, v) => MapEntry(k.toString(), v));
    }
    return <String, dynamic>{};
  }

  int _toInt(dynamic value, {int fallback = 0}) {
    final n = int.tryParse(value?.toString() ?? '');
    return n ?? fallback;
  }

  // 将 module 对象展平成可读文本，便于在移动端快速浏览。
  String _stepSummary(Map<String, dynamic> module) {
    if (module.isEmpty) return '';
    final chunks = <String>[];

    final type = module['type']?.toString();
    if (type != null && type.trim().isNotEmpty) {
      chunks.add('类型：${_moduleTypeLabel(type)}');
    }

    final keys = ['title', 'summary', 'description', 'instruction', 'instructions', 'hint'];
    for (final key in keys) {
      final text = _flatten(module[key]);
      if (text.isNotEmpty) {
        chunks.add('$key：$text');
      }
    }

    if (chunks.isEmpty) {
      final generic = _flatten(module);
      if (generic.isNotEmpty) chunks.add(generic);
    }

    return chunks.join('\n\n');
  }

  String _moduleTypeLabel(String type) {
    switch (type) {
      case 'video':
        return '观看';
      case 'reading':
        return '阅读';
      case 'writing':
        return '书写';
      case 'game':
        return '练习';
      default:
        return type;
    }
  }

  String _flatten(dynamic value) {
    if (value == null) return '';
    if (value is String) return value.trim();
    if (value is num || value is bool) return value.toString();
    if (value is List) {
      return value
          .map((e) => _flatten(e))
          .where((e) => e.isNotEmpty)
          .join('；');
    }
    if (value is Map) {
      final parts = <String>[];
      value.forEach((k, v) {
        final text = _flatten(v);
        if (text.isNotEmpty) {
          parts.add('${k.toString()}：$text');
        }
      });
      return parts.join('；');
    }
    return '';
  }
}

enum _LessonStepStatus {
  completed,
  inProgress,
  notStarted,
}

class _LessonStepItem {
  final String id;
  final String label;
  final int order;
  final Map<String, dynamic> module;

  const _LessonStepItem({
    required this.id,
    required this.label,
    required this.order,
    required this.module,
  });
}

class _LessonStepStatusUI {
  final String label;
  final IconData icon;
  final Color text;
  final Color badgeBg;
  final Color badgeText;

  const _LessonStepStatusUI({
    required this.label,
    required this.icon,
    required this.text,
    required this.badgeBg,
    required this.badgeText,
  });
}

_LessonStepStatusUI _statusUI(_LessonStepStatus status, ColorScheme scheme) {
  switch (status) {
    case _LessonStepStatus.completed:
      return _LessonStepStatusUI(
        label: '已完成',
        icon: Icons.check_circle_rounded,
        text: const Color(0xFF2E7D32),
        badgeBg: const Color(0xFFE8F5E9),
        badgeText: const Color(0xFF2E7D32),
      );
    case _LessonStepStatus.inProgress:
      return _LessonStepStatusUI(
        label: '进行中',
        icon: Icons.play_circle_rounded,
        text: const Color(0xFFEF6C00),
        badgeBg: const Color(0xFFFFF3E0),
        badgeText: const Color(0xFFEF6C00),
      );
    case _LessonStepStatus.notStarted:
      return _LessonStepStatusUI(
        label: '未开始',
        icon: Icons.radio_button_unchecked_rounded,
        text: scheme.outline,
        badgeBg: scheme.surfaceContainerHighest,
        badgeText: scheme.outline,
      );
  }
}
