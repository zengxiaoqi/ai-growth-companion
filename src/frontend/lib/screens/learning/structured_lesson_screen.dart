import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../components/top_bar.dart';
import '../../providers/content_provider.dart';
import '../../services/api_result.dart';
import '../../services/api_service.dart';
import '../../services/tts_service.dart';
import '../../theme/app_theme.dart';
import '../games/game_renderer.dart';
import 'animation_scene_player.dart';

// ─── 步骤类型元数据 ─────────────────────────────────────────────────────

const Map<String, Map<String, dynamic>> _stepMeta = {
  'watch': {
    'emoji': '👁',
    'label': '看',
    'icon': Icons.visibility_rounded,
    'color': AppTheme.secondaryColor,
  },
  'read': {
    'emoji': '📖',
    'label': '读',
    'icon': Icons.chrome_reader_mode_rounded,
    'color': Color(0xFFFFCE4E),
  },
  'write': {
    'emoji': '✍',
    'label': '写',
    'icon': Icons.edit_rounded,
    'color': Color(0xFFDDA0DD),
  },
  'practice': {
    'emoji': '🎮',
    'label': '练',
    'icon': Icons.games_rounded,
    'color': Color(0xFFFF9B85),
  },
};

// ─── 数据模型 ────────────────────────────────────────────────────────────

/// 课程步骤
class _LessonStep {
  final String id;
  final String type; // watch | read | write | practice
  final String label;
  final int order;
  final Map<String, dynamic> module;

  const _LessonStep({
    required this.id,
    required this.type,
    required this.label,
    required this.order,
    required this.module,
  });
}

/// 课程进度
class _LessonProgress {
  final Set<String> completedSteps;
  final int overallScore;

  const _LessonProgress({
    required this.completedSteps,
    this.overallScore = 0,
  });
}

// ─── 主屏幕 ──────────────────────────────────────────────────────────────

/// 结构化课程学习屏幕
///
/// 从 Web 端 StructuredLessonView 迁移而来，提供步骤导航：
/// watch(看) → read(读) → write(写) → practice(练)
///
/// 路由参数:
/// - contentId: int - 课程 ID
/// - childId: int? - 孩子 ID
class StructuredLessonScreen extends StatefulWidget {
  final int contentId;
  final int? childId;

  const StructuredLessonScreen({
    super.key,
    required this.contentId,
    this.childId,
  });

  @override
  State<StructuredLessonScreen> createState() => _StructuredLessonScreenState();
}

class _StructuredLessonScreenState extends State<StructuredLessonScreen> {
  // 数据
  Map<String, dynamic>? _content;
  String _lessonTitle = '课程';
  String _ageGroup = '';
  List<_LessonStep> _steps = const [];
  _LessonProgress _progress = const _LessonProgress(completedSteps: {});

  // UI 状态
  bool _isLoading = true;
  String? _error;
  int _currentStepIndex = 0;
  bool _isCompleting = false;
  bool _showCompleteScreen = false;

  // 步骤计时
  DateTime? _stepStartTime;

  // TTS 朗读状态
  bool _isSpeakingStep = false;

  @override
  void initState() {
    super.initState();
    _stepStartTime = DateTime.now();
    TtsService().init();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadData());
  }

  Future<void> _loadData() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      // 加载课程内容
      final contentProvider = context.read<ContentProvider>();
      await contentProvider.loadContentDetail(widget.contentId);
      final content = contentProvider.currentContent;
      if (content == null) {
        throw Exception('课程不存在或加载失败');
      }

      final parsed = _parseStructuredContent(content['content']);
      final steps = _parseSteps(parsed);
      if (steps.isEmpty) {
        throw Exception('该课程暂无步骤内容');
      }

      // 加载进度
      _LessonProgress progress = const _LessonProgress(completedSteps: {});
      if (widget.childId != null) {
        progress = await _loadProgress();
      }

      // 找到第一个未完成的步骤
      int startIndex = 0;
      if (progress.completedSteps.isNotEmpty) {
        final firstIncomplete = steps.indexWhere(
          (s) => !progress.completedSteps.contains(s.id),
        );
        if (firstIncomplete >= 0) {
          startIndex = firstIncomplete;
        }
      }

      if (!mounted) return;
      setState(() {
        _content = content;
        _lessonTitle = (content['title']?.toString().trim().isNotEmpty ?? false)
            ? content['title'].toString()
            : '课程';
        _ageGroup = parsed?['ageGroup']?.toString() ??
            content['age_range']?.toString() ??
            content['ageRange']?.toString() ??
            '';
        _steps = steps;
        _progress = progress;
        _currentStepIndex = startIndex;
        _stepStartTime = DateTime.now();
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '加载课程失败：$e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<_LessonProgress> _loadProgress() async {
    if (widget.childId == null) {
      return const _LessonProgress(completedSteps: {});
    }

    final api = context.read<ApiService>();
    final result = await api.getLessonProgressResult(
      contentId: widget.contentId,
      childId: widget.childId!,
    );

    if (result is! ApiSuccess<Map<String, dynamic>>) {
      final err = result as ApiError;
      // 进度加载失败不应该阻断课程加载，静默处理
      print('Load progress error: ${err.message} (${err.type.name})');
      return const _LessonProgress(completedSteps: {});
    }

    final data = result.data;
    final ids = data['completedSteps'];
    if (ids is! List) return const _LessonProgress(completedSteps: {});

    final completed = ids
        .map((e) => e?.toString())
        .whereType<String>()
        .where((e) => e.isNotEmpty)
        .toSet();

    final score = data['overallScore'] is num
        ? (data['overallScore'] as num).toInt()
        : 0;

    return _LessonProgress(completedSteps: completed, overallScore: score);
  }

  /// 完成当前步骤
  Future<void> _completeStep({
    int? score,
    Map<String, dynamic>? interactionData,
  }) async {
    if (widget.childId == null || _currentStepIndex >= _steps.length) return;

    final step = _steps[_currentStepIndex];
    if (_progress.completedSteps.contains(step.id)) {
      // 已完成，直接跳到下一步
      _goToNextStep();
      return;
    }

    setState(() => _isCompleting = true);

    final duration = _stepStartTime != null
        ? DateTime.now().difference(_stepStartTime!).inSeconds.clamp(1, 9999)
        : 60;

    try {
      final api = context.read<ApiService>();
      final result = await api.completeLessonStepResult(
        contentId: widget.contentId,
        stepId: step.id,
        childId: widget.childId!,
        score: score ?? 100,
        durationSeconds: duration,
        interactionData: {
          'source': 'flutter_structured_lesson_screen',
          if (interactionData != null) ...interactionData,
        },
      );

      if (!mounted) return;

      if (result is ApiError) {
        final err = result as ApiError<Map<String, dynamic>>;
        final msg = switch (err.type) {
          ApiErrorType.networkTimeout => '网络连接超时，请检查网络后重试',
          ApiErrorType.serverError => '服务器繁忙，请稍后重试',
          ApiErrorType.unauthorized => '登录已过期，请重新登录',
          ApiErrorType.notFound => '课程步骤不存在',
          _ => '记录步骤失败：${err.message}',
        };
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(msg),
              behavior: SnackBarBehavior.floating,
              action: err.isRetryable
                  ? SnackBarAction(
                      label: '重试',
                      onPressed: () => _completeStep(
                        score: score,
                        interactionData: interactionData,
                      ),
                    )
                  : null,
            ),
          );
        }
        return;
      }

      // 更新本地进度
      final newCompleted = {..._progress.completedSteps, step.id};
      setState(() {
        _progress = _LessonProgress(
          completedSteps: newCompleted,
          overallScore: _progress.overallScore + (score ?? 100),
        );
      });

      // 检查是否全部完成
      if (_steps.every((s) => newCompleted.contains(s.id))) {
        setState(() => _showCompleteScreen = true);
      } else {
        _goToNextStep();
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('记录步骤失败：$e'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } finally {
      if (mounted) setState(() => _isCompleting = false);
    }
  }

  void _goToNextStep() {
    if (_currentStepIndex < _steps.length - 1) {
      setState(() {
        _currentStepIndex++;
        _stepStartTime = DateTime.now();
      });
    }
  }

  void _goToPrevStep() {
    if (_currentStepIndex > 0) {
      setState(() {
        _currentStepIndex--;
        _stepStartTime = DateTime.now();
      });
    }
  }

  // ─── 语音朗读 ──────────────────────────────────────────────────────

  /// 提取步骤中的所有文本内容
  String _extractStepText(_LessonStep step) {
    final buf = StringBuffer();
    final module = step.module;

    switch (step.type) {
      case 'read':
        final reading = module['reading'] is Map
            ? (module['reading'] as Map)
                .map((k, v) => MapEntry(k.toString(), v))
            : <String, dynamic>{};
        final text = reading['text']?.toString() ?? module['content']?.toString() ?? '';
        final questions = reading['questions'] is List
            ? (reading['questions'] as List)
                .map((e) => e?.toString() ?? '')
                .where((e) => e.isNotEmpty)
                .toList()
            : <String>[];
        if (text.isNotEmpty) buf.writeln(text);
        for (var i = 0; i < questions.length; i++) {
          buf.writeln('第${i + 1}题：${questions[i]}');
        }
        break;
      case 'watch':
        final scenes = _extractRawScenes(module);
        for (final scene in scenes) {
          final narration = scene['narration']?.toString() ?? '';
          final caption = scene['caption']?.toString() ??
              scene['onScreenText']?.toString() ?? '';
          if (caption.isNotEmpty && caption != narration) {
            buf.writeln(caption);
          }
          if (narration.isNotEmpty) buf.writeln(narration);
        }
        // fallback: module-level content
        if (buf.isEmpty) {
          final c = module['content']?.toString() ?? '';
          if (c.isNotEmpty) buf.write(c);
        }
        break;
      case 'write':
        final writing = module['writing'] is Map
            ? (module['writing'] as Map)
                .map((k, v) => MapEntry(k.toString(), v))
            : <String, dynamic>{};
        final goal = writing['goal']?.toString() ?? '';
        final tasks = writing['practiceTasks'] is List
            ? (writing['practiceTasks'] as List)
                .map((e) => e?.toString() ?? '')
                .where((e) => e.isNotEmpty)
                .toList()
            : <String>[];
        final checklist = writing['checklist'] is List
            ? (writing['checklist'] as List)
                .map((e) => e?.toString() ?? '')
                .where((e) => e.isNotEmpty)
                .toList()
            : <String>[];
        if (goal.isNotEmpty) buf.writeln('学习目标：$goal');
        for (var i = 0; i < tasks.length; i++) {
          buf.writeln('任务${i + 1}：${tasks[i]}');
        }
        for (var i = 0; i < checklist.length; i++) {
          buf.writeln('检查项${i + 1}：${checklist[i]}');
        }
        break;
      case 'practice':
        final game = module['game'] is Map
            ? (module['game'] as Map)
                .map((k, v) => MapEntry(k.toString(), v))
            : <String, dynamic>{};
        final title = game['title']?.toString() ?? '';
        final instructions = game['instructions']?.toString() ??
            game['description']?.toString() ?? '';
        if (title.isNotEmpty) buf.writeln(title);
        if (instructions.isNotEmpty) buf.writeln(instructions);
        if (buf.isEmpty) {
          final c = module['content']?.toString() ??
              module['description']?.toString() ?? '';
          if (c.isNotEmpty) buf.write(c);
        }
        break;
      default:
        final c = module['content']?.toString() ??
            module['text']?.toString() ??
            module['description']?.toString() ?? '';
        if (c.isNotEmpty) buf.write(c);
    }

    if (buf.isEmpty) {
      buf.write(step.label);
    }
    return buf.toString().trim();
  }

  Future<void> _speakStepContent() async {
    if (_steps.isEmpty || _currentStepIndex >= _steps.length) return;

    final tts = TtsService();

    if (_isSpeakingStep) {
      await tts.stop();
      setState(() => _isSpeakingStep = false);
      return;
    }

    final text = _extractStepText(_steps[_currentStepIndex]);
    if (text.isEmpty) return;

    setState(() => _isSpeakingStep = true);
    await tts.speak(text);
    await tts.onComplete;
    if (mounted) {
      setState(() => _isSpeakingStep = false);
    }
  }

  void _jumpToStep(int index) {
    if (index >= 0 && index < _steps.length) {
      setState(() {
        _currentStepIndex = index;
        _stepStartTime = DateTime.now();
      });
    }
  }

  // ─── 解析方法 ─────────────────────────────────────────────────────────

  Map<String, dynamic>? _parseStructuredContent(dynamic raw) {
    if (raw == null) return null;
    if (raw is Map<String, dynamic>) return raw;
    if (raw is Map) return raw.map((k, v) => MapEntry(k.toString(), v));
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

  List<_LessonStep> _parseSteps(Map<String, dynamic>? structured) {
    final rawSteps = structured?['steps'];
    if (rawSteps is! List) return const [];

    final result = <_LessonStep>[];
    for (var i = 0; i < rawSteps.length; i++) {
      final item = rawSteps[i];
      if (item is! Map) continue;

      final map = item.map((k, v) => MapEntry(k.toString(), v));
      final id = map['id']?.toString().trim();
      if (id == null || id.isEmpty) continue;

      // 推断步骤类型
      String type = map['type']?.toString().trim() ?? '';
      if (!_stepMeta.containsKey(type)) {
        // 从 module 类型推断
        final module = map['module'];
        final moduleType = module is Map ? module['type']?.toString() : null;
        if (moduleType == 'video') type = 'watch';
        else if (moduleType == 'reading') type = 'read';
        else if (moduleType == 'writing') type = 'write';
        else if (moduleType == 'game') type = 'practice';
        else type = 'read'; // 默认阅读
      }

      final module = map['module'];
      final moduleMap = module is Map
          ? module.map((k, v) => MapEntry(k.toString(), v))
          : <String, dynamic>{};

      final label = (map['label']?.toString().trim().isNotEmpty ?? false)
          ? map['label'].toString()
          : _stepMeta[type]?['label'] ?? '步骤${i + 1}';

      result.add(_LessonStep(
        id: id,
        type: type,
        label: label,
        order: (map['order'] is num) ? (map['order'] as num).toInt() : i + 1,
        module: moduleMap,
      ));
    }

    result.sort((a, b) => a.order.compareTo(b.order));
    return result;
  }

  // ─── 构建 ─────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    // 加载状态
    if (_isLoading) {
      return Scaffold(
        backgroundColor: AppTheme.backgroundColor,
        body: SafeArea(
          child: Column(
            children: [
              TopBar(
                title: '加载课程中',
                leftSlot: IconButton(
                  icon: const Icon(Icons.arrow_back_rounded),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ),
              const Expanded(
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      CircularProgressIndicator(color: AppTheme.primaryColor),
                      SizedBox(height: 12),
                      Text(
                        '正在加载课程...',
                        style: TextStyle(
                          fontSize: 14,
                          color: AppTheme.textSecondary,
                        ),
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

    // 完成屏幕
    if (_showCompleteScreen) {
      return _buildCompleteScreen();
    }

    // 错误状态（无内容）
    if (_error != null && _content == null) {
      return _buildErrorScreen();
    }

    // 主界面
    final currentStep = _steps.isNotEmpty ? _steps[_currentStepIndex] : null;
    final completedCount = _progress.completedSteps.length;
    final totalCount = _steps.length;

    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      body: SafeArea(
        child: Column(
          children: [
            // 顶部导航栏
            _buildTopBar(completedCount, totalCount),
            // 步骤导航条
            _buildStepNavigator(),
            // 错误提示
            if (_error != null) _buildErrorBar(),
            // 步骤内容（可滚动）
            Expanded(
              child: currentStep != null
                  ? _buildStepContent(currentStep)
                  : const Center(child: Text('暂无步骤内容')),
            ),
            // 底部导航
            _buildBottomNavigation(),
          ],
        ),
      ),
    );
  }

  // ─── 顶部导航栏 ────────────────────────────────────────────────────────

  Widget _buildTopBar(int completedCount, int totalCount) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: AppTheme.primaryColor.withOpacity(0.06),
            blurRadius: 15,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: [
          TopBar(
            title: _lessonTitle,
            subtitle: '$completedCount/$totalCount 步骤完成' +
                (_ageGroup.isNotEmpty ? ' · $_ageGroup 岁' : ''),
            leftSlot: IconButton(
              icon: const Icon(Icons.arrow_back_rounded),
              onPressed: () => Navigator.of(context).pop(),
            ),
          ),
          // 进度条
          _buildProgressBar(),
        ],
      ),
    );
  }

  Widget _buildProgressBar() {
    if (_steps.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      child: Row(
        children: List.generate(_steps.length, (index) {
          final step = _steps[index];
          final isCompleted = _progress.completedSteps.contains(step.id);
          final isCurrent = index == _currentStepIndex;

          return Expanded(
            child: Container(
              height: 6,
              margin: EdgeInsets.only(right: index < _steps.length - 1 ? 4 : 0),
              decoration: BoxDecoration(
                color: isCompleted
                    ? AppTheme.primaryColor
                    : isCurrent
                        ? AppTheme.primaryColor.withOpacity(0.4)
                        : AppTheme.backgroundColor.withOpacity(0.8),
                borderRadius: BorderRadius.circular(3),
                border: Border.all(
                  color: isCurrent
                      ? AppTheme.primaryColor.withOpacity(0.3)
                      : Colors.transparent,
                  width: 1,
                ),
              ),
            ),
          );
        }),
      ),
    );
  }

  // ─── 步骤导航条 ────────────────────────────────────────────────────────

  Widget _buildStepNavigator() {
    if (_steps.isEmpty) return const SizedBox.shrink();

    return Container(
      height: 52,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: _steps.length,
        itemBuilder: (context, index) {
          final step = _steps[index];
          final meta = _stepMeta[step.type] ?? _stepMeta['read']!;
          final isCompleted = _progress.completedSteps.contains(step.id);
          final isCurrent = index == _currentStepIndex;

          return Padding(
            padding: const EdgeInsets.only(right: 6),
            child: GestureDetector(
              onTap: () => _jumpToStep(index),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: isCurrent
                      ? AppTheme.primaryColor
                      : isCompleted
                          ? AppTheme.primaryColor.withOpacity(0.12)
                          : Colors.white,
                  borderRadius: BorderRadius.circular(999),
                  boxShadow: isCurrent
                      ? [
                          BoxShadow(
                            color: AppTheme.primaryColor.withOpacity(0.3),
                            blurRadius: 12,
                            offset: const Offset(0, 4),
                          ),
                        ]
                      : null,
                  border: Border.all(
                    color: isCurrent
                        ? Colors.transparent
                        : isCompleted
                            ? AppTheme.primaryColor.withOpacity(0.3)
                            : Colors.grey.shade200,
                    width: 1.5,
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      meta['emoji'] as String,
                      style: const TextStyle(fontSize: 14),
                    ),
                    const SizedBox(width: 4),
                    Text(
                      meta['label'] as String,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: isCurrent
                            ? Colors.white
                            : isCompleted
                                ? AppTheme.primaryColor
                                : AppTheme.textSecondary,
                      ),
                    ),
                    if (isCompleted) ...[
                      const SizedBox(width: 3),
                      Icon(
                        Icons.check_rounded,
                        size: 14,
                        color: isCurrent
                            ? Colors.white
                            : AppTheme.primaryColor,
                      ),
                    ],
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  // ─── 错误组件 ────────────────────────────────────────────────────────

  /// 通用错误覆盖页面（课程加载失败时显示）
  Widget _buildErrorScreen() {
    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      body: SafeArea(
        child: Column(
          children: [
            TopBar(
              title: '课程',
              leftSlot: IconButton(
                icon: const Icon(Icons.arrow_back_rounded),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ),
            Expanded(
              child: _buildErrorWidget(
                message: _error!,
                onRetry: _loadData,
                onBack: () => Navigator.of(context).pop(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// 通用错误展示组件
  /// 根据错误消息推断类型并显示对应的图标和操作按钮
  Widget _buildErrorWidget({
    required String message,
    VoidCallback? onRetry,
    VoidCallback? onBack,
  }) {
    // 根据消息内容推断错误类型
    final isTimeout = message.contains('超时') ||
        message.contains('timeout') ||
        message.contains('timed out');
    final isNotFound = message.contains('不存在') ||
        message.contains('not found') ||
        message.contains('404');
    final isServer = message.contains('服务器') ||
        message.contains('server') ||
        message.contains('500');
    final isAuth = message.contains('登录') ||
        message.contains('unauthorized') ||
        message.contains('401');
    final isNetwork = message.contains('网络') ||
        message.contains('connection') ||
        message.contains('SocketException');

    final (icon, title, suggestions) = () {
      if (isTimeout || isNetwork) {
        return (
          Icons.wifi_off_rounded,
          '网络连接异常',
          <String>['请检查网络连接', '尝试切换 Wi-Fi 或移动数据', '检查后点击下方按钮重试'],
        );
      }
      if (isNotFound) {
        return (
          Icons.search_off_rounded,
          '课程不存在',
          <String>['该课程可能已被删除或下架', '请返回课程列表查看其他内容'],
        );
      }
      if (isServer) {
        return (
          Icons.cloud_off_rounded,
          '服务器繁忙',
          <String>['服务器暂时无法响应', '请稍等片刻后重试', '如持续出现此问题，请联系客服'],
        );
      }
      if (isAuth) {
        return (
          Icons.lock_outline_rounded,
          '登录已过期',
          <String>['请重新登录后再试', '返回首页重新进入'],
        );
      }
      return (
        Icons.error_outline_rounded,
        '加载失败',
        <String>[message],
      );
    }();

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: AppTheme.warningColor.withOpacity(0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 40, color: AppTheme.warningColor),
            ),
            const SizedBox(height: 16),
            Text(
              title,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: AppTheme.textColor,
              ),
            ),
            const SizedBox(height: 12),
            ...suggestions.map((s) => Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Text(
                    s,
                    style: const TextStyle(
                      fontSize: 14,
                      color: AppTheme.textSecondary,
                    ),
                    textAlign: TextAlign.center,
                  ),
                )),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (onRetry != null)
                  FilledButton.icon(
                    onPressed: onRetry,
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('重试'),
                  ),
                if (onBack != null) ...[
                  if (onRetry != null) const SizedBox(width: 12),
                  OutlinedButton.icon(
                    onPressed: onBack,
                    icon: const Icon(Icons.arrow_back_rounded),
                    label: const Text('返回'),
                  ),
                ],
                if (onRetry == null && onBack == null)
                  FilledButton.icon(
                    onPressed: _loadData,
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('重试'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorBar() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: AppTheme.warningColor.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              _error!,
              style: const TextStyle(
                fontSize: 13,
                color: AppTheme.warningColor,
              ),
            ),
          ),
          TextButton(
            onPressed: () => setState(() => _error = null),
            child: const Text('关闭', style: TextStyle(fontSize: 12)),
          ),
        ],
      ),
    );
  }

  // ─── 步骤内容 ──────────────────────────────────────────────────────────

  Widget _buildStepContent(_LessonStep step) {
    final isCompleted = _progress.completedSteps.contains(step.id);

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 语音朗读控制栏
          _buildTtsBar(),
          // 步骤标题
          _buildStepTitle(step),
          const SizedBox(height: 12),
          // 根据类型渲染内容
          switch (step.type) {
            'watch' => _buildWatchStep(step, isCompleted),
            'read' => _buildReadStep(step, isCompleted),
            'write' => _buildWriteStep(step, isCompleted),
            'practice' => _buildPracticeStep(step, isCompleted),
            _ => _buildGenericStep(step, isCompleted),
          },
          // 提交中提示
          if (_isCompleting)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Center(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppTheme.primaryColor,
                      ),
                    ),
                    SizedBox(width: 8),
                    Text(
                      '记录中...',
                      style: TextStyle(
                        fontSize: 14,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

/// 语音朗读控制栏
  Widget _buildTtsBar() {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      margin: const EdgeInsets.only(bottom: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          if (_isSpeakingStep)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: AppTheme.primaryColor.withOpacity(0.1),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                  color: AppTheme.primaryColor.withOpacity(0.3),
                  width: 1,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.volume_up_rounded,
                    size: 18,
                    color: AppTheme.primaryColor,
                  ),
                  const SizedBox(width: 6),
                  const Text(
                    '正在朗读...',
                    style: TextStyle(
                      fontSize: 13,
                      color: AppTheme.primaryColor,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(width: 6),
                  GestureDetector(
                    onTap: _speakStepContent,
                    child: Container(
                      width: 28,
                      height: 28,
                      decoration: BoxDecoration(
                        color: AppTheme.warningColor.withOpacity(0.2),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.stop_rounded,
                        size: 16,
                        color: AppTheme.warningColor,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          if (!_isSpeakingStep)
            GestureDetector(
              onTap: _speakStepContent,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: AppTheme.primaryColor.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: const [
                    Icon(
                      Icons.volume_up_rounded,
                      size: 18,
                      color: AppTheme.primaryColor,
                    ),
                    SizedBox(width: 6),
                    Text(
                      '朗读',
                      style: TextStyle(
                        fontSize: 13,
                        color: AppTheme.primaryColor,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildStepTitle(_LessonStep step) {
    final meta = _stepMeta[step.type] ?? _stepMeta['read']!;
    final title = _getStepTitle(step);

    return Row(
      children: [
        Text(meta['emoji'] as String, style: const TextStyle(fontSize: 28)),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${meta['label']} - $title',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.textColor,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  String _getStepTitle(_LessonStep step) {
    switch (step.type) {
      case 'watch':
        return '观看动画讲解';
      case 'read':
        return '阅读学习';
      case 'write':
        return '书写练习';
      case 'practice':
        return '互动练习';
      default:
        return step.label;
    }
  }

  // ─── Watch 步骤 ────────────────────────────────────────────────────────

  Widget _buildWatchStep(_LessonStep step, bool isCompleted) {
    final module = step.module;
    final scenes = _extractScenes(module);

    if (scenes.isNotEmpty) {
      return AnimationScenePlayer(
        scenes: scenes,
        isCompleted: isCompleted,
        onComplete: (score) => _completeStep(score: score),
      );
    }

    // 无场景数据 → 文字卡片 fallback
    return _buildWatchFallbackCards(module, isCompleted);
  }

  List<AnimationScene> _extractScenes(Map<String, dynamic> module) {
    // 尝试从多个可能的字段中提取场景数据
    final sources = [
      module['visualStory']?['scenes'],
      module['videoLesson']?['shots'],
      module['scenes'],
      module['animationScenes'],
    ];

    for (final source in sources) {
      if (source is List && source.isNotEmpty) {
        return source
            .whereType<Map>()
            .map((s) => s.map((k, v) => MapEntry(k.toString(), v)))
            .map((s) => AnimationScene(
                  narration: s['narration']?.toString() ?? '',
                  onScreenText: s['onScreenText']?.toString() ??
                      s['caption']?.toString() ??
                      s['scene']?.toString() ??
                      '',
                  background: s['background']?.toString() ??
                      s['bgColor']?.toString() ??
                      '#FFE4B5',
                  character: s['character']?.toString() ??
                      s['emoji']?.toString() ??
                      '🎓',
                  imageUrl: s['imageUrl']?.toString(),
                ))
            .toList();
      }
    }

    return [];
  }

  Widget _buildWatchFallbackCards(
    Map<String, dynamic> module,
    bool isCompleted,
  ) {
    final scenes = _extractRawScenes(module);

    if (scenes.isEmpty) {
      return _buildEmptyCard('暂无视频内容');
    }

    return _WatchFallbackCards(
      scenes: scenes,
      isCompleted: isCompleted,
      onComplete: (score) => _completeStep(score: score),
    );
  }

  List<Map<String, dynamic>> _extractRawScenes(Map<String, dynamic> module) {
    final sources = [
      module['visualStory']?['scenes'],
      module['videoLesson']?['shots'],
      module['scenes'],
    ];

    for (final source in sources) {
      if (source is List && source.isNotEmpty) {
        return source
            .whereType<Map>()
            .map((s) => s.map((k, v) => MapEntry(k.toString(), v)))
            .toList();
      }
    }
    return [];
  }

  // ─── Read 步骤 ─────────────────────────────────────────────────────────

  Widget _buildReadStep(_LessonStep step, bool isCompleted) {
    final module = step.module;
    final reading = module['reading'] is Map
        ? (module['reading'] as Map)
            .map((k, v) => MapEntry(k.toString(), v))
        : <String, dynamic>{};

    final text = reading['text']?.toString() ?? module['content']?.toString() ?? '';
    final goal = reading['goal']?.toString() ?? '';
    final keywords = reading['keywords'] is List
        ? (reading['keywords'] as List)
            .map((e) => e?.toString() ?? '')
            .where((e) => e.isNotEmpty)
            .toList()
        : <String>[];
    final questions = reading['questions'] is List
        ? (reading['questions'] as List)
            .map((e) => e?.toString() ?? '')
            .where((e) => e.isNotEmpty)
            .toList()
        : <String>[];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 学习目标
        if (goal.isNotEmpty)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppTheme.secondaryColor.withOpacity(0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Icon(Icons.flag_rounded,
                    size: 18, color: AppTheme.secondaryColor),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '目标: $goal',
                    style: const TextStyle(
                      fontSize: 14,
                      color: AppTheme.textColor,
                    ),
                  ),
                ),
              ],
            ),
          ),
        if (goal.isNotEmpty) const SizedBox(height: 12),

        // 阅读内容卡片
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(AppTheme.cardRadius),
            boxShadow: AppTheme.softShadow(),
          ),
          child: Text(
            text.isNotEmpty ? text : '暂无阅读内容',
            style: const TextStyle(
              fontSize: 15,
              height: 1.8,
              color: AppTheme.textColor,
            ),
          ),
        ),

        // 关键词
        if (keywords.isNotEmpty) ...[
          const SizedBox(height: 12),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              const Text(
                '关键词:',
                style: TextStyle(fontSize: 13, color: AppTheme.textSecondary),
              ),
              ...keywords.map((kw) => Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppTheme.secondaryColor.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      kw,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.secondaryColor,
                      ),
                    ),
                  )),
            ],
          ),
        ],

        // 理解问题
        if (questions.isNotEmpty) ...[
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(AppTheme.cardRadius),
              boxShadow: AppTheme.softShadow(),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '理解问题:',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textColor,
                  ),
                ),
                const SizedBox(height: 8),
                ...questions.asMap().entries.map((entry) => Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Text(
                        '${entry.key + 1}. ${entry.value}',
                        style: const TextStyle(
                          fontSize: 14,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                    )),
              ],
            ),
          ),
        ],

        // 完成按钮
        const SizedBox(height: 16),
        _buildCompleteButton(isCompleted, defaultScore: 85),
      ],
    );
  }

  // ─── Write 步骤 ────────────────────────────────────────────────────────

  Widget _buildWriteStep(_LessonStep step, bool isCompleted) {
    final module = step.module;

    // 尝试使用场景播放器
    final scenes = _extractScenes(module);
    if (scenes.isNotEmpty && module['useScenePlayer'] == true) {
      return AnimationScenePlayer(
        scenes: scenes,
        isCompleted: isCompleted,
        onComplete: (score) => _completeStep(score: score ?? 80),
      );
    }

    final writing = module['writing'] is Map
        ? (module['writing'] as Map)
            .map((k, v) => MapEntry(k.toString(), v))
        : <String, dynamic>{};

    final goal = writing['goal']?.toString() ?? '';
    final tracingItems = writing['tracingItems'] is List
        ? (writing['tracingItems'] as List)
            .map((e) => e?.toString() ?? '')
            .where((e) => e.isNotEmpty)
            .toList()
        : <String>[];
    final tasks = writing['practiceTasks'] is List
        ? (writing['practiceTasks'] as List)
            .map((e) => e?.toString() ?? '')
            .where((e) => e.isNotEmpty)
            .toList()
        : <String>[];
    final checklist = writing['checklist'] is List
        ? (writing['checklist'] as List)
            .map((e) => e?.toString() ?? '')
            .where((e) => e.isNotEmpty)
            .toList()
        : <String>[];

    return _WriteStepContent(
      goal: goal,
      tracingItems: tracingItems,
      tasks: tasks,
      checklist: checklist,
      isCompleted: isCompleted,
      onComplete: (score, data) => _completeStep(
        score: score ?? 80,
        interactionData: data,
      ),
    );
  }

  // ─── Practice 步骤 ─────────────────────────────────────────────────────

  Widget _buildPracticeStep(_LessonStep step, bool isCompleted) {
    final module = step.module;

    // 尝试使用场景播放器
    final scenes = _extractScenes(module);
    if (scenes.isNotEmpty && module['useScenePlayer'] == true) {
      return AnimationScenePlayer(
        scenes: scenes,
        isCompleted: isCompleted,
        onComplete: (score) => _completeStep(score: score ?? 85),
      );
    }

    if (isCompleted) {
      return _buildCompletedState();
    }

    // 解析游戏数据
    final game = module['game'] is Map
        ? (module['game'] as Map)
            .map((k, v) => MapEntry(k.toString(), v))
        : <String, dynamic>{};

    final activityType = game['activityType']?.toString() ??
        module['activityType']?.toString() ??
        game['gameType']?.toString() ??
        'quiz';

    final activityData = game['activityData'] is Map
        ? (game['activityData'] as Map)
            .map((k, v) => MapEntry(k.toString(), v))
        : game.isNotEmpty
            ? game
            : <String, dynamic>{'type': activityType, 'title': step.label};

    final gameId = game['gameId']?.toString() ?? game['id']?.toString();
    final difficulty = game['difficulty'] is num
        ? (game['difficulty'] as num).toInt()
        : 1;

    return GameRenderer(
      activityType: activityType,
      initialData: activityData,
      gameId: gameId,
      difficulty: difficulty,
      onExit: () {},
      onCompleted: (result) {
        final score = result['score'] as int? ?? 85;
        _completeStep(score: score, interactionData: {'gameResult': result});
      },
    );
  }

  // ─── Generic 步骤（默认）────────────────────────────────────────────

  Widget _buildGenericStep(_LessonStep step, bool isCompleted) {
    final content = step.module['content']?.toString() ??
        step.module['text']?.toString() ??
        step.module['description']?.toString() ??
        '暂无内容';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(AppTheme.cardRadius),
            boxShadow: AppTheme.softShadow(),
          ),
          child: Text(
            content,
            style: const TextStyle(
              fontSize: 15,
              height: 1.6,
              color: AppTheme.textColor,
            ),
          ),
        ),
        const SizedBox(height: 16),
        _buildCompleteButton(isCompleted, defaultScore: 80),
      ],
    );
  }

  // ─── 完成按钮 ─────────────────────────────────────────────────────────

  Widget _buildCompleteButton(bool isCompleted, {int defaultScore = 100}) {
    if (isCompleted) {
      return Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.check_circle_rounded,
              size: 20, color: AppTheme.primaryColor),
          const SizedBox(width: 6),
          const Text(
            '已完成',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: AppTheme.primaryColor,
            ),
          ),
        ],
      );
    }

    return SizedBox(
      width: double.infinity,
      height: 52,
      child: FilledButton.icon(
        onPressed: _isCompleting
            ? null
            : () => _completeStep(score: defaultScore),
        icon: _isCompleting
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : const Icon(Icons.check_rounded),
        label: Text(_isCompleting ? '记录中...' : '完成了，进入下一步'),
        style: FilledButton.styleFrom(
          backgroundColor: AppTheme.primaryColor,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
      ),
    );
  }

  // ─── 已完成状态 ─────────────────────────────────────────────────────

  Widget _buildCompletedState() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.check_circle_rounded,
            size: 64,
            color: AppTheme.accentColor,
          ),
          const SizedBox(height: 12),
          const Text(
            '练习已完成',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: AppTheme.textColor,
            ),
          ),
        ],
      ),
    );
  }

  // ─── 底部导航 ─────────────────────────────────────────────────────────

  Widget _buildBottomNavigation() {
    final hasPrev = _currentStepIndex > 0;
    final hasNext = _currentStepIndex < _steps.length - 1;

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // 上一步
          TextButton.icon(
            onPressed: hasPrev ? _goToPrevStep : null,
            icon: const Icon(Icons.arrow_back_rounded, size: 18),
            label: const Text('上一步'),
            style: TextButton.styleFrom(
              foregroundColor: hasPrev
                  ? AppTheme.primaryColor
                  : AppTheme.textSecondary.withOpacity(0.3),
            ),
          ),
          // 步骤指示
          Text(
            '${_currentStepIndex + 1} / ${_steps.length}',
            style: const TextStyle(
              fontSize: 14,
              color: AppTheme.textSecondary,
            ),
          ),
          // 下一步
          TextButton.icon(
            onPressed: hasNext ? _goToNextStep : null,
            icon: const Text('下一步'),
            label: const Icon(Icons.arrow_forward_rounded, size: 18),
            style: TextButton.styleFrom(
              foregroundColor: hasNext
                  ? AppTheme.primaryColor
                  : AppTheme.textSecondary.withOpacity(0.3),
            ),
          ),
        ],
      ),
    );
  }

  // ─── 完成屏幕 ─────────────────────────────────────────────────────────

  Widget _buildCompleteScreen() {
    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      body: SafeArea(
        child: Column(
          children: [
            // 顶部
            Container(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back_rounded),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                  const Text(
                    '课程完成',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textColor,
                    ),
                  ),
                ],
              ),
            ),
            // 内容
            Expanded(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // 庆祝动画
                      TweenAnimationBuilder<double>(
                        tween: Tween(begin: 0.0, end: 1.0),
                        duration: const Duration(milliseconds: 600),
                        curve: Curves.elasticOut,
                        builder: (context, value, child) {
                          return Transform.scale(
                            scale: value,
                            child: const Text(
                              '🎉',
                              style: TextStyle(fontSize: 72),
                            ),
                          );
                        },
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        '太棒了！',
                        style: TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.textColor,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '你已经完成了「$_lessonTitle」的全部学习步骤',
                        style: const TextStyle(
                          fontSize: 15,
                          color: AppTheme.textSecondary,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      if (_progress.overallScore > 0) ...[
                        const SizedBox(height: 20),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 20,
                            vertical: 10,
                          ),
                          decoration: BoxDecoration(
                            color: AppTheme.primaryColor.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(
                                Icons.star_rounded,
                                size: 22,
                                color: AppTheme.primaryColor,
                              ),
                              const SizedBox(width: 6),
                              Text(
                                '总分: ${_progress.overallScore} 分',
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                  color: AppTheme.primaryColor,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                      const SizedBox(height: 32),
                      // 按钮
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          OutlinedButton.icon(
                            onPressed: () {
                              setState(() {
                                _currentStepIndex = 0;
                                _showCompleteScreen = false;
                                _progress = const _LessonProgress(
                                  completedSteps: {},
                                  overallScore: 0,
                                );
                              });
                            },
                            icon: const Icon(Icons.replay_rounded),
                            label: const Text('重新学习'),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: AppTheme.primaryColor,
                              side: const BorderSide(
                                  color: AppTheme.primaryColor),
                            ),
                          ),
                          const SizedBox(width: 12),
                          FilledButton.icon(
                            onPressed: () => Navigator.of(context).pop(),
                            icon: const Icon(Icons.home_rounded),
                            label: const Text('返回课程'),
                            style: FilledButton.styleFrom(
                              backgroundColor: AppTheme.primaryColor,
                              foregroundColor: Colors.white,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── 文字 Fallback 卡片 ─────────────────────────────────────────────────

class _WatchFallbackCards extends StatefulWidget {
  final List<Map<String, dynamic>> scenes;
  final bool isCompleted;
  final void Function(int score) onComplete;

  const _WatchFallbackCards({
    required this.scenes,
    required this.isCompleted,
    required this.onComplete,
  });

  @override
  State<_WatchFallbackCards> createState() => _WatchFallbackCardsState();
}

class _WatchFallbackCardsState extends State<_WatchFallbackCards> {
  int _currentIndex = 0;

  @override
  Widget build(BuildContext context) {
    if (widget.scenes.isEmpty) {
      return _buildEmptyCard('暂无视频内容');
    }

    final scene = widget.scenes[_currentIndex];
    final caption =
        scene['caption']?.toString() ?? scene['scene']?.toString() ?? '';
    final narration = scene['narration']?.toString() ?? '';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 场景卡片
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                AppTheme.secondaryColor.withOpacity(0.15),
                AppTheme.primaryColor.withOpacity(0.1),
              ],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(AppTheme.cardRadius),
          ),
          child: Column(
            children: [
              // 场景标题
              Text(
                caption.isNotEmpty ? caption : '场景 ${_currentIndex + 1}',
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.textColor,
                ),
                textAlign: TextAlign.center,
              ),
              if (narration.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(
                  narration,
                  style: const TextStyle(
                    fontSize: 15,
                    color: AppTheme.textSecondary,
                    height: 1.5,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ],
          ),
        ),

        // 导航按钮
        if (widget.scenes.length > 1) ...[
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              TextButton(
                onPressed: _currentIndex > 0
                    ? () => setState(() => _currentIndex--)
                    : null,
                child: const Text('上一个'),
              ),
              Text(
                '${_currentIndex + 1} / ${widget.scenes.length}',
                style: const TextStyle(
                  fontSize: 14,
                  color: AppTheme.textSecondary,
                ),
              ),
              TextButton(
                onPressed: _currentIndex < widget.scenes.length - 1
                    ? () => setState(() => _currentIndex++)
                    : null,
                child: const Text('下一个'),
              ),
            ],
          ),
        ],

        // 完成按钮
        const SizedBox(height: 16),
        _buildCompleteButton(
          isCompleted: widget.isCompleted,
          onComplete: () => widget.onComplete(80),
        ),
      ],
    );
  }

  Widget _buildCompleteButton({
    required bool isCompleted,
    required VoidCallback onComplete,
  }) {
    if (isCompleted) {
      return const Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.check_circle_rounded,
              size: 20, color: AppTheme.primaryColor),
          SizedBox(width: 6),
          Text(
            '已完成',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: AppTheme.primaryColor,
            ),
          ),
        ],
      );
    }

    return SizedBox(
      width: double.infinity,
      height: 52,
      child: FilledButton.icon(
        onPressed: onComplete,
        icon: const Icon(Icons.check_rounded),
        label: const Text('看完了，进入下一步'),
        style: FilledButton.styleFrom(
          backgroundColor: AppTheme.primaryColor,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
      ),
    );
  }
}

// ─── 书写步骤内容组件 ───────────────────────────────────────────────────

class _WriteStepContent extends StatefulWidget {
  final String goal;
  final List<String> tracingItems;
  final List<String> tasks;
  final List<String> checklist;
  final bool isCompleted;
  final void Function(int? score, Map<String, dynamic>? data) onComplete;

  const _WriteStepContent({
    required this.goal,
    required this.tracingItems,
    required this.tasks,
    required this.checklist,
    required this.isCompleted,
    required this.onComplete,
  });

  @override
  State<_WriteStepContent> createState() => _WriteStepContentState();
}

class _WriteStepContentState extends State<_WriteStepContent> {
  late Set<int> _checkedItems;

  @override
  void initState() {
    super.initState();
    _checkedItems = {};
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 学习目标
        if (widget.goal.isNotEmpty)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFDDA0DD).withOpacity(0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                const Icon(Icons.flag_rounded,
                    size: 18, color: Color(0xFFDDA0DD)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '目标: ${widget.goal}',
                    style: const TextStyle(
                      fontSize: 14,
                      color: AppTheme.textColor,
                    ),
                  ),
                ),
              ],
            ),
          ),
        if (widget.goal.isNotEmpty) const SizedBox(height: 12),

        // 描红练习
        if (widget.tracingItems.isNotEmpty) ...[
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(AppTheme.cardRadius),
              boxShadow: AppTheme.softShadow(),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '描红练习',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textColor,
                  ),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: widget.tracingItems.map((item) {
                    return Container(
                      width: 60,
                      height: 60,
                      decoration: BoxDecoration(
                        border: Border.all(
                          color: Colors.grey.shade300,
                          width: 2,
                          style: BorderStyle.solid,
                        ),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Center(
                        child: Text(
                          item,
                          style: const TextStyle(
                            fontSize: 28,
                            fontWeight: FontWeight.bold,
                            color: AppTheme.textColor,
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
        ],

        // 书写任务
        if (widget.tasks.isNotEmpty) ...[
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(AppTheme.cardRadius),
              boxShadow: AppTheme.softShadow(),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '书写任务',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textColor,
                  ),
                ),
                const SizedBox(height: 8),
                ...widget.tasks.asMap().entries.map((entry) => Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Text(
                        '${entry.key + 1}. ${entry.value}',
                        style: const TextStyle(
                          fontSize: 14,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                    )),
              ],
            ),
          ),
          const SizedBox(height: 12),
        ],

        // 自检清单
        if (widget.checklist.isNotEmpty) ...[
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(AppTheme.cardRadius),
              boxShadow: AppTheme.softShadow(),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '自检清单',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textColor,
                  ),
                ),
                const SizedBox(height: 8),
                ...widget.checklist.asMap().entries.map((entry) {
                  final isChecked = _checkedItems.contains(entry.key);
                  return GestureDetector(
                    onTap: () {
                      setState(() {
                        if (isChecked) {
                          _checkedItems.remove(entry.key);
                        } else {
                          _checkedItems.add(entry.key);
                        }
                      });
                    },
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Row(
                        children: [
                          Container(
                            width: 22,
                            height: 22,
                            decoration: BoxDecoration(
                              color: isChecked
                                  ? AppTheme.primaryColor
                                  : Colors.transparent,
                              border: Border.all(
                                color: isChecked
                                    ? AppTheme.primaryColor
                                    : Colors.grey.shade400,
                                width: 2,
                              ),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: isChecked
                                ? const Icon(
                                    Icons.check,
                                    size: 16,
                                    color: Colors.white,
                                  )
                                : null,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              entry.value,
                              style: TextStyle(
                                fontSize: 14,
                                color: isChecked
                                    ? AppTheme.textSecondary
                                    : AppTheme.textColor,
                                decoration: isChecked
                                    ? TextDecoration.lineThrough
                                    : null,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }),
              ],
            ),
          ),
          const SizedBox(height: 12),
        ],

        // 完成按钮
        _buildCompleteButton(),
      ],
    );
  }

  Widget _buildCompleteButton() {
    if (widget.isCompleted) {
      return const Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.check_circle_rounded,
              size: 20, color: AppTheme.primaryColor),
          SizedBox(width: 6),
          Text(
            '已完成',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: AppTheme.primaryColor,
            ),
          ),
        ],
      );
    }

    return SizedBox(
      width: double.infinity,
      height: 52,
      child: FilledButton.icon(
        onPressed: () => widget.onComplete(
          80,
          {'checkedItems': _checkedItems.toList()},
        ),
        icon: const Icon(Icons.check_rounded),
        label: const Text('写完了，进入下一步'),
        style: FilledButton.styleFrom(
          backgroundColor: AppTheme.primaryColor,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
      ),
    );
  }
}

// ─── 空内容占位 ─────────────────────────────────────────────────────────

Widget _buildEmptyCard(String message) {
  return Container(
    width: double.infinity,
    padding: const EdgeInsets.all(32),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(AppTheme.cardRadius),
      boxShadow: AppTheme.softShadow(),
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          Icons.inbox_rounded,
          size: 48,
          color: AppTheme.textSecondary.withOpacity(0.4),
        ),
        const SizedBox(height: 12),
        Text(
          message,
          style: const TextStyle(
            fontSize: 15,
            color: AppTheme.textSecondary,
          ),
        ),
      ],
    ),
  );
}