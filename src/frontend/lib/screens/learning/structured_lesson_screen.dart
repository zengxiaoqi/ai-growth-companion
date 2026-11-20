import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:video_player/video_player.dart';

import '../../components/top_bar.dart';
import '../../providers/content_provider.dart';
import '../../services/api_result.dart';
import '../../services/api_service.dart';
import '../../services/tts_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/app_logger.dart';
import '../games/game_renderer.dart';
import '../parent/web_video_impl.dart';
import 'animation_scene_player.dart';
import 'drawing_step_canvas.dart';
import 'experiment_step_player.dart';
import 'roleplay_step_player.dart';
import 'trace_path_canvas.dart';
import 'lesson_scene_models.dart';
import 'read_step_content.dart';
import 'widgets/step_wizard.dart';

final _log = AppLogger('StructuredLessonScreen');

// ─── 步骤类型元数据 ─────────────────────────────────────────────────────

Map<String, Map<String, dynamic>> _stepMeta = {
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
    'color': Color(0xFFE3BC45),
  },
  'write': {
    'emoji': '✍',
    'label': '写',
    'icon': Icons.edit_rounded,
    'color': AppTheme.softPurple,
  },
  'drawing': {
    'emoji': '🎨',
    'label': '画',
    'icon': Icons.brush_rounded,
    'color': Color(0xFFF783AC),
  },
  'roleplay': {
    'emoji': '🎭',
    'label': '演',
    'icon': Icons.theater_comedy_rounded,
    'color': Color(0xFFE8B93E),
  },
  'experiment': {
    'emoji': '🔬',
    'label': '做',
    'icon': Icons.science_rounded,
    'color': Color(0xFF4DABF7),
  },
  'practice': {
    'emoji': '🎮',
    'label': '练',
    'icon': Icons.games_rounded,
    'color': Color(0xFFE0885F),
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
  final bool previewMode;

  const StructuredLessonScreen({
    super.key,
    required this.contentId,
    this.childId,
    this.previewMode = false,
  });

  @override
  State<StructuredLessonScreen> createState() => _StructuredLessonScreenState();
}

class _StructuredLessonScreenState extends State<StructuredLessonScreen> {
  // 数据
  Map<String, dynamic>? _content;
  String _lessonTitle = '课程';
  String _ageGroup = '';
  String _domain = 'language';
  String _topic = '';
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
  // 角色扮演组件自带逐轮 TTS；顶部「朗读」按钮通过它重播当前轮
  final ValueNotifier<int> _roleplayReadRequest = ValueNotifier<int>(0);

  // 视频生成状态
  String? _videoUrl;
  bool _isVideoGenerating = false;
  Timer? _videoPollTimer;
  DateTime? _videoTaskCreatedAt;

  @override
  void initState() {
    super.initState();
    _stepStartTime = DateTime.now();
    TtsService().init();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadData());
  }

  @override
  void dispose() {
    _videoPollTimer?.cancel();
    _roleplayReadRequest.dispose();
    TtsService().stop();
    super.dispose();
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

      // 加载进度（预览模式下跳过）
      _LessonProgress progress = const _LessonProgress(completedSteps: {});
      if (!widget.previewMode && widget.childId != null) {
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
        _domain = parsed?['domain']?.toString() ?? 'language';
        _topic = parsed?['topic']?.toString() ?? _lessonTitle;
        _steps = steps;
        _progress = progress;
        _currentStepIndex = startIndex;
        _stepStartTime = DateTime.now();
      });
      // 进入页面后自动朗读当前步骤内容
      _autoSpeakStep();
      // 异步检查视频生成状态（不阻塞 UI）
      _checkVideoStatus();
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
      _log.warning('Load progress error: ${err.message} (${err.type.name})');
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

    final score =
        data['overallScore'] is num ? (data['overallScore'] as num).toInt() : 0;

    return _LessonProgress(completedSteps: completed, overallScore: score);
  }

  /// 检查视频生成状态并在处理中时轮询
  Future<void> _checkVideoStatus() async {
    if (widget.childId == null || !mounted) return;

    final api = context.read<ApiService>();
    try {
      final status =
          await api.getVideoStatus(widget.contentId, widget.childId!);
      if (!mounted) return;

      // 瞬时请求失败不能断掉轮询链，否则占位图会永远转圈
      if (status == null) {
        _scheduleVideoPoll();
        return;
      }

      final exists = status['exists'] == true;
      final taskStatus = status['status']?.toString() ?? '';

      if (!exists) {
        // No video task created yet — check if watch module already has videoUrl
        _syncVideoUrlFromModule();
        return;
      }

      if (taskStatus == 'completed') {
        final videoUrl = api.getLessonVideoPlaybackUrl(
          widget.contentId,
          widget.childId!,
        );
        if (mounted) {
          setState(() {
            _videoUrl = videoUrl;
            _isVideoGenerating = false;
          });
        }
        return;
      }

      if (taskStatus == 'pending' || taskStatus == 'processing') {
        final createdAt = DateTime.tryParse(
          status['createdAt']?.toString() ?? '',
        );
        if (mounted) {
          setState(() {
            _isVideoGenerating = true;
            _videoTaskCreatedAt = createdAt;
          });
        }
        _scheduleVideoPoll();
        return;
      }

      // failed or unknown — fall back to module check
      _syncVideoUrlFromModule();
    } catch (_) {
      if (!mounted) return;
      _syncVideoUrlFromModule();
      _scheduleVideoPoll();
    }
  }

  void _scheduleVideoPoll() {
    _videoPollTimer?.cancel();
    _videoPollTimer = Timer(
      const Duration(seconds: 3),
      () => _checkVideoStatus(),
    );
  }

  /// 从课程模块数据中同步 videoUrl（课程已发布且视频已就绪时后端会写入）
  void _syncVideoUrlFromModule() {
    final watchStep = _steps.isNotEmpty
        ? _steps.firstWhere((s) => s.id == 'watch', orElse: () => _steps.first)
        : null;
    if (watchStep == null) return;

    final moduleUrl = watchStep.module['videoUrl']?.toString();
    if (moduleUrl != null && moduleUrl.isNotEmpty) {
      final fullUrl = '${ApiService.baseUrl}$moduleUrl';
      if (mounted) {
        setState(() {
          _videoUrl = fullUrl;
          _isVideoGenerating = false;
        });
      }
    }
  }

  /// 完成当前步骤
  Future<void> _completeStep({
    int? score,
    Map<String, dynamic>? interactionData,
  }) async {
    if ((widget.childId == null && !widget.previewMode) ||
        _currentStepIndex >= _steps.length) {
      return;
    }

    final step = _steps[_currentStepIndex];
    if (_progress.completedSteps.contains(step.id)) {
      // 已完成，直接跳到下一步
      _goToNextStep();
      return;
    }

    // 预览模式：只在本地标记完成，不调用 API
    if (widget.previewMode) {
      final newCompleted = {..._progress.completedSteps, step.id};
      setState(() {
        _progress = _LessonProgress(
          completedSteps: newCompleted,
          overallScore: _progress.overallScore + (score ?? 100),
        );
        _isCompleting = false;
      });
      if (_steps.every((s) => newCompleted.contains(s.id))) {
        setState(() => _showCompleteScreen = true);
      } else {
        _goToNextStep();
      }
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
      // 切换步骤时停止当前朗读
      TtsService().stop();
      setState(() {
        _currentStepIndex++;
        _stepStartTime = DateTime.now();
        _isSpeakingStep = false;
      });
      _autoSpeakStep();
    }
  }

  void _goToPrevStep() {
    if (_currentStepIndex > 0) {
      // 切换步骤时停止当前朗读
      TtsService().stop();
      setState(() {
        _currentStepIndex--;
        _stepStartTime = DateTime.now();
        _isSpeakingStep = false;
      });
      _autoSpeakStep();
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
        final text =
            reading['text']?.toString() ?? module['content']?.toString() ?? '';
        final questions = reading['questions'] is List
            ? (reading['questions'] as List)
                .map((e) => (e is Map ? e['question'] : e)?.toString() ?? '')
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
              scene['onScreenText']?.toString() ??
              '';
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
      case 'drawing':
        final drawing = module['drawing'] is Map
            ? (module['drawing'] as Map)
                .map((k, v) => MapEntry(k.toString(), v))
            : <String, dynamic>{};
        final prompt = drawing['prompt']?.toString() ?? '';
        final reference = drawing['reference']?.toString() ?? '';
        if (prompt.isNotEmpty) buf.writeln(prompt);
        if (reference.isNotEmpty) buf.writeln('小提示：$reference');
        break;
      case 'experiment':
        final experiment = module['experiment'] is Map
            ? (module['experiment'] as Map)
                .map((k, v) => MapEntry(k.toString(), v))
            : <String, dynamic>{};
        final question = experiment['question']?.toString() ?? '';
        if (question.isNotEmpty) buf.writeln(question);
        final steps = experiment['steps'] is List
            ? experiment['steps'] as List
            : const [];
        for (final s in steps) {
          if (s is Map) {
            final instruction = s['instruction']?.toString() ?? '';
            if (instruction.isNotEmpty) buf.writeln(instruction);
          }
        }
        break;
      case 'roleplay':
        // 对话播放器自带逐轮 TTS，这里不重复朗读
        break;
      case 'practice':
        final game = module['game'] is Map
            ? (module['game'] as Map).map((k, v) => MapEntry(k.toString(), v))
            : <String, dynamic>{};
        final title = game['title']?.toString() ?? '';
        final instructions = game['instructions']?.toString() ??
            game['description']?.toString() ??
            '';
        if (title.isNotEmpty) buf.writeln(title);
        if (instructions.isNotEmpty) buf.writeln(instructions);
        if (buf.isEmpty) {
          final c = module['content']?.toString() ??
              module['description']?.toString() ??
              '';
          if (c.isNotEmpty) buf.write(c);
        }
        break;
      default:
        final c = module['content']?.toString() ??
            module['text']?.toString() ??
            module['description']?.toString() ??
            '';
        if (c.isNotEmpty) buf.write(c);
    }

    if (buf.isEmpty) {
      buf.write(step.label);
    }
    return buf.toString().trim();
  }

  Future<void> _speakStepContent() async {
    if (_steps.isEmpty || _currentStepIndex >= _steps.length) return;

    // 角色扮演的朗读由播放器自行处理（场景→台词→选项），这里只转发重播信号
    if (_steps[_currentStepIndex].type == 'roleplay') {
      _roleplayReadRequest.value++;
      return;
    }

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
      // 切换步骤时停止当前朗读
      if (_isSpeakingStep) {
        TtsService().stop();
      }
      setState(() {
        _currentStepIndex = index;
        _stepStartTime = DateTime.now();
        _isSpeakingStep = false;
      });
      _autoSpeakStep();
    }
  }

  /// 自动朗读当前步骤内容（进入页面 / 切换步骤时调用）
  Future<void> _autoSpeakStep() async {
    if (_steps.isEmpty || _currentStepIndex >= _steps.length) return;

    // watch 步骤的视频/动画已自带 narration 配音，自动朗读会造成「双音」。
    // 仅对非 watch 步骤（read/write/practice）自动 TTS 朗读。
    final step = _steps[_currentStepIndex];
    if (step.type == 'watch' || step.type == 'roleplay') return;

    final tts = TtsService();

    final text = _extractStepText(step);
    if (text.isEmpty) return;

    // 短暂延迟让 UI 先渲染完成
    await Future.delayed(const Duration(milliseconds: 400));

    if (!mounted) return;
    setState(() => _isSpeakingStep = true);
    await tts.speak(text);
    await tts.onComplete;
    if (mounted) {
      setState(() => _isSpeakingStep = false);
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
    if (structured == null) return const [];

    var rawSteps = structured['steps'];

    // video_lesson 类型课程没有 steps 数组，但有 videoLesson.shots / visualStory.scenes
    // 自动构造一个 watch 步骤，复用已有的场景渲染逻辑
    if (rawSteps is! List || rawSteps.isEmpty) {
      final hasVideoLesson = structured['videoLesson'] is Map;
      final hasVisualStory = structured['visualStory'] is Map;
      final hasScenes = structured['scenes'] is List;
      if (hasVideoLesson || hasVisualStory || hasScenes) {
        rawSteps = [
          <String, dynamic>{
            'id': 'watch',
            'label': '看',
            'icon': 'eye',
            'order': 1,
            'module': <String, dynamic>{
              'type': 'video',
              ...structured,
            },
          },
        ];
      }
    }

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
        if (moduleType == 'video') {
          type = 'watch';
        } else if (moduleType == 'reading') {
          type = 'read';
        } else if (moduleType == 'writing') {
          type = 'write';
        } else if (moduleType == 'drawing') {
          type = 'drawing';
        } else if (moduleType == 'roleplay') {
          type = 'roleplay';
        } else if (moduleType == 'experiment') {
          type = 'experiment';
        } else if (moduleType == 'game') {
          type = 'practice';
        } else {
          type = 'read'; // 默认阅读
        }
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
              Expanded(
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
        color: AppTheme.active.card,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 15,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: [
          TopBar(
            title: _lessonTitle + (widget.previewMode ? ' [预览]' : ''),
            subtitle:
                '$completedCount/$totalCount 步骤完成${_ageGroup.isNotEmpty ? ' · $_ageGroup 岁' : ''}',
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
                        ? AppTheme.primaryColor.withValues(alpha: 0.4)
                        : AppTheme.active.line.withValues(alpha: 0.7),
                borderRadius: BorderRadius.circular(3),
                border: Border.all(
                  color: isCurrent
                      ? AppTheme.primaryColor.withValues(alpha: 0.3)
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
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: isCurrent
                      ? AppTheme.primaryColor
                      : isCompleted
                          ? AppTheme.primaryColor.withValues(alpha: 0.12)
                          : AppTheme.active.card,
                  borderRadius: BorderRadius.circular(999),
                  boxShadow: isCurrent
                      ? [
                          BoxShadow(
                            color: AppTheme.primaryColor.withValues(alpha: 0.28),
                            blurRadius: 12,
                            offset: const Offset(0, 4),
                          ),
                        ]
                      : null,
                  border: Border.all(
                    color: isCurrent
                        ? Colors.transparent
                        : isCompleted
                            ? AppTheme.primaryColor.withValues(alpha: 0.3)
                            : AppTheme.active.line,
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
                      step.label,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: isCurrent
                            ? AppTheme.active.onPrimary
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
                            ? AppTheme.active.onPrimary
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
                color: AppTheme.warningColor.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 40, color: AppTheme.warningColor),
            ),
            const SizedBox(height: 16),
            Text(
              title,
              style: TextStyle(
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
                    style: TextStyle(
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
        color: AppTheme.warningColor.withValues(alpha: 0.1),
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

    // read(听说/读/赏)、write、practice 都是「一步步翻页」的模式：
    // 内容组件内部用 StepWizard 管理每页，并有自己的 Expanded + 滚动兜底。
    // 必须让它们吃掉剩余高度，不能再塞进外层 SingleChildScrollView，
    // 否则 Expanded 拿到无界高度会报 "RenderFlex children have non-zero flex"。
    if (step.type == 'read' ||
        step.type == 'write' ||
        step.type == 'practice') {
      return Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildTtsBar(),
            _buildStepTitle(step),
            const SizedBox(height: 10),
            Expanded(child: switch (step.type) {
              'read' => _buildReadStep(step, isCompleted),
              'write' => _buildWriteStep(step, isCompleted),
              _ => _buildPracticeStep(step, isCompleted),
            }),
          ],
        ),
      );
    }

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
            'drawing' => _buildDrawingStep(step, isCompleted),
            'roleplay' => _buildRoleplayStep(step, isCompleted),
            'experiment' => _buildExperimentStep(step, isCompleted),
            _ => _buildGenericStep(step, isCompleted),
          },
          // 提交中提示
          if (_isCompleting)
            Padding(
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
                color: AppTheme.primaryColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                  color: AppTheme.primaryColor.withValues(alpha: 0.3),
                  width: 1,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.volume_up_rounded,
                    size: 18,
                    color: AppTheme.primaryColor,
                  ),
                  const SizedBox(width: 6),
                  Text(
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
                        color: AppTheme.warningColor.withValues(alpha: 0.2),
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
                  color: AppTheme.primaryColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
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
                '${step.label} - $title',
                style: TextStyle(
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
      case 'drawing':
        return '自由画画';
      case 'roleplay':
        return '角色扮演';
      case 'experiment':
        return '模拟小实验';
      case 'practice':
        return '互动练习';
      default:
        return step.label;
    }
  }

  // ─── Watch 步骤 ────────────────────────────────────────────────────────

  Widget _buildWatchStep(_LessonStep step, bool isCompleted) {
    final module = step.module;

    // Video is ready → use video player
    if (_videoUrl != null && _videoUrl!.isNotEmpty) {
      final api = context.read<ApiService>();
      return LessonVideoPlayer(
        videoUrl: _videoUrl!,
        authToken: api.token,
        onComplete: (score) => _completeStep(score: score),
      );
    }

    // Video is generating → show progress indicator
    if (_isVideoGenerating) {
      return _buildVideoGeneratingPlaceholder(isCompleted);
    }

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

  String _videoWaitHint() {
    final createdAt = _videoTaskCreatedAt;
    final minutes = createdAt == null
        ? null
        : DateTime.now().difference(createdAt).inMinutes;
    if (minutes == null || minutes < 1) {
      return '生成通常需要几分钟到十几分钟，可先看动画版';
    }
    return '已生成 $minutes 分钟 · 通常需要几分钟到十几分钟';
  }

  /// 视频生成中的占位组件
  Widget _buildVideoGeneratingPlaceholder(bool isCompleted) {
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
                color: AppTheme.primaryColor.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: Padding(
                padding: EdgeInsets.all(16),
                child: CircularProgressIndicator(
                  strokeWidth: 3,
                  color: AppTheme.primaryColor,
                ),
              ),
            ),
            const SizedBox(height: 20),
            const Text(
              '🎬',
              style: TextStyle(fontSize: 36),
            ),
            const SizedBox(height: 12),
            Text(
              '视频正在生成中...',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: AppTheme.textColor,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'AI 正在为这节课制作动画视频\n${_videoWaitHint()}',
              style: TextStyle(
                fontSize: 14,
                color: AppTheme.textSecondary,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            OutlinedButton.icon(
              onPressed: () {
                // Allow skipping to animation fallback
                setState(() {
                  _isVideoGenerating = false;
                  _videoPollTimer?.cancel();
                });
              },
              icon: const Icon(Icons.skip_next_rounded),
              label: const Text('先看动画版'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppTheme.primaryColor,
              ),
            ),
          ],
        ),
      ),
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
        ? (module['reading'] as Map).map((k, v) => MapEntry(k.toString(), v))
        : <String, dynamic>{};

    return ReadStepContent(
      reading: reading,
      ageGroup: _ageGroup,
      domain: _domain,
      topic: _topic,
      isCompleted: isCompleted,
      onComplete: (score, data) =>
          _completeStep(score: score, interactionData: data),
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
        ? (module['writing'] as Map).map((k, v) => MapEntry(k.toString(), v))
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

  // ─── Drawing / Roleplay / Experiment 步骤（领域输出模块）─────────────

  Map<String, dynamic> _moduleData(_LessonStep step, String key) {
    final raw = step.module[key];
    return raw is Map
        ? raw.map((k, v) => MapEntry(k.toString(), v))
        : <String, dynamic>{};
  }

  Widget _buildDrawingStep(_LessonStep step, bool isCompleted) {
    return DrawingStepCanvas(
      data: _moduleData(step, 'drawing'),
      isCompleted: isCompleted,
      onComplete: (score, data) => _completeStep(
        score: score,
        interactionData: data,
      ),
    );
  }

  Widget _buildRoleplayStep(_LessonStep step, bool isCompleted) {
    return RoleplayStepPlayer(
      data: _moduleData(step, 'roleplay'),
      ageGroup: _ageGroup,
      replaySignal: _roleplayReadRequest,
      isCompleted: isCompleted,
      onComplete: (score, data) => _completeStep(
        score: score,
        interactionData: data,
      ),
    );
  }

  Widget _buildExperimentStep(_LessonStep step, bool isCompleted) {
    return ExperimentStepPlayer(
      data: _moduleData(step, 'experiment'),
      isCompleted: isCompleted,
      onComplete: (score, data) => _completeStep(
        score: score,
        interactionData: data,
      ),
    );
  }

  // ─── Practice 步骤 ─────────────────────────────────────────────────────

  Widget _buildPracticeStep(_LessonStep step, bool isCompleted) {
    final module = step.module;

    // 尝试使用场景播放器（自带固定高度，放进滚动容器避免小屏溢出）
    final scenes = _extractScenes(module);
    if (scenes.isNotEmpty && module['useScenePlayer'] == true) {
      return SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AnimationScenePlayer(
              scenes: scenes,
              isCompleted: isCompleted,
              onComplete: (score) => _completeStep(score: score ?? 85),
            ),
          ],
        ),
      );
    }

    if (isCompleted) {
      return _buildCompletedState();
    }

    // 解析游戏数据
    final game = module['game'] is Map
        ? (module['game'] as Map).map((k, v) => MapEntry(k.toString(), v))
        : <String, dynamic>{};

    final activityType = game['activityType']?.toString() ??
        module['activityType']?.toString() ??
        game['gameType']?.toString() ??
        'quiz';

    final activityData = game['activityData'] is Map
        ? (game['activityData'] as Map).map((k, v) => MapEntry(k.toString(), v))
        : game.isNotEmpty
            ? game
            : <String, dynamic>{'type': activityType, 'title': step.label};

    final gameId = game['gameId']?.toString() ?? game['id']?.toString();
    final difficulty =
        game['difficulty'] is num ? (game['difficulty'] as num).toInt() : 1;

    // 游戏组件内部是「标题 + 可滚动卡片区 + 底部按钮」的 Column，
    // 直接交给外层 Expanded 拿满剩余高度即可（不要再套固定高度）。
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
            color: AppTheme.active.card,
            borderRadius: BorderRadius.circular(AppTheme.cardRadius),
            boxShadow: AppTheme.softShadow(),
          ),
          child: Text(
            content,
            style: TextStyle(
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
        onPressed:
            _isCompleting ? null : () => _completeStep(score: defaultScore),
        icon: _isCompleting
            ? SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: AppTheme.active.onPrimary,
                ),
              )
            : const Icon(Icons.check_rounded),
        label: Text(_isCompleting ? '记录中...' : '完成了，进入下一步'),
        style: FilledButton.styleFrom(
          backgroundColor: AppTheme.primaryColor,
          foregroundColor: AppTheme.active.onPrimary,
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
          Icon(
            Icons.check_circle_rounded,
            size: 64,
            color: AppTheme.accentColor,
          ),
          SizedBox(height: 12),
          Text(
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
    // 一步一步：本级「下一步」要等当前步骤做完才亮起。
    // 预览模式例外——家长要能自由翻看各步骤，不受完成状态限制。
    final currentDone = _steps.isNotEmpty &&
        _progress.completedSteps.contains(_steps[_currentStepIndex].id);
    final canNext = hasNext && (widget.previewMode || currentDone);

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      decoration: BoxDecoration(
        color: AppTheme.active.card,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
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
                  : AppTheme.textSecondary.withValues(alpha: 0.3),
            ),
          ),
          // 步骤指示
          Text(
            '${_currentStepIndex + 1} / ${_steps.length}',
            style: TextStyle(
              fontSize: 14,
              color: AppTheme.textSecondary,
            ),
          ),
          // 下一步：当前步骤完成才亮起（预览模式可自由翻看）
          TextButton.icon(
            onPressed: canNext ? _goToNextStep : null,
            icon: Text(
              hasNext && !canNext ? '先完成这一步' : '下一步',
            ),
            label: const Icon(Icons.arrow_forward_rounded, size: 18),
            style: TextButton.styleFrom(
              foregroundColor: canNext
                  ? AppTheme.primaryColor
                  : AppTheme.textSecondary.withValues(alpha: 0.3),
            ),
          ),
        ],
      ),
    );
  }

  // ─── 完成屏幕 ─────────────────────────────────────────────────────────

  Widget _buildCompleteScreen() {
    final palette = AppTheme.active;
    final score = _progress.overallScore;

    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      body: SafeArea(
        child: Stack(
          children: [
            // 背景：与其它页面同一套静态纸面元素
            BubbleBackground(child: const SizedBox.expand()),
            Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(8, 8, 16, 0),
                  child: Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.arrow_back_rounded),
                        onPressed: () => Navigator.of(context).pop(),
                      ),
                      Text(
                        '课程完成',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: palette.ink,
                        ),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: Center(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
                      child: Container(
                        padding: const EdgeInsets.fromLTRB(22, 24, 22, 22),
                        decoration: BoxDecoration(
                          color: palette.card,
                          borderRadius:
                              BorderRadius.circular(AppTheme.cardRadius),
                          border: palette.isCartoon
                              ? Border.all(color: palette.line, width: 2)
                              : null,
                          boxShadow: AppTheme.softShadow(),
                        ),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            TweenAnimationBuilder<double>(
                              tween: Tween(begin: 0.0, end: 1.0),
                              duration: const Duration(milliseconds: 640),
                              curve: Curves.elasticOut,
                              builder: (context, value, child) =>
                                  Transform.scale(scale: value, child: child),
                              child: const Text(
                                '🎉',
                                style: TextStyle(fontSize: 64),
                              ),
                            ),
                            const SizedBox(height: 14),
                            Text(
                              '太棒了！',
                              style: TextStyle(
                                fontSize: 26,
                                height: 1.2,
                                fontWeight: FontWeight.w800,
                                color: palette.ink,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              '你已经完成了「$_lessonTitle」的全部学习步骤',
                              style: TextStyle(
                                fontSize: 13,
                                height: 1.6,
                                color: palette.ink2,
                              ),
                              textAlign: TextAlign.center,
                            ),
                            if (score > 0) ...[
                              const SizedBox(height: 20),
                              SizedBox(
                                width: 84,
                                height: 84,
                                child: Stack(
                                  alignment: Alignment.center,
                                  children: [
                                    SizedBox(
                                      width: 84,
                                      height: 84,
                                      child: CircularProgressIndicator(
                                        value: (score.clamp(0, 100)) / 100,
                                        strokeWidth: 7,
                                        backgroundColor:
                                            palette.pop.withValues(alpha: 0.14),
                                        valueColor:
                                            AlwaysStoppedAnimation<Color>(
                                                palette.pop),
                                        strokeCap: StrokeCap.round,
                                      ),
                                    ),
                                    Column(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Text(
                                          '$score',
                                          style: TextStyle(
                                            fontSize: 24,
                                            height: 1.0,
                                            fontWeight: FontWeight.w800,
                                            color: palette.ink,
                                          ),
                                        ),
                                        Text(
                                          '总分',
                                          style: TextStyle(
                                            fontSize: 10,
                                            fontWeight: FontWeight.w700,
                                            color: palette.ink2,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            ],
                            const SizedBox(height: 24),
                            SizedBox(
                              width: double.infinity,
                              height: 52,
                              child: FilledButton.icon(
                                onPressed: () => Navigator.of(context).pop(),
                                icon: Icon(Icons.home_rounded,
                                    size: 20, color: palette.ctaInk),
                                label: Text(
                                  '返回课程',
                                  style: const TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w800),
                                ),
                                style: FilledButton.styleFrom(
                                  backgroundColor: palette.cta,
                                  foregroundColor: palette.ctaInk,
                                  elevation: 0,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(
                                        palette.radiusMd),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(height: 10),
                            TextButton.icon(
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
                              icon: Icon(Icons.replay_rounded,
                                  size: 18, color: palette.ink2),
                              label: Text(
                                '重新学一遍',
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  color: palette.ink2,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
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
                AppTheme.secondaryColor.withValues(alpha: 0.15),
                AppTheme.primaryColor.withValues(alpha: 0.1),
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
                style: TextStyle(
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
                  style: TextStyle(
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
                style: TextStyle(
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
      return Row(
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
          foregroundColor: AppTheme.active.onPrimary,
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

  /// 每条书写任务是否需要孩子点「我记住啦」确认，作为翻页钥匙。
  final Set<int> _taskDone = {};

  /// 描红整体结果（所有字写完后才有值）
  TraceResult? _traceResult;

  static const Set<String> _ignoredTraceChars = {
    '，', '。', '、', '；', '：', '！', '？', '“', '”', '‘', '’',
    '（', '）', '《', '》', '「', '」', '『', '』', '…', '—', '·', '～',
    ',', '.', ';', ':', '!', '?', '"', "'", '(', ')', '[', ']', '{', '}',
    '/', '\\', '~', '_', '+', '=', '*', '&', '%', '@', '#', '^', '|',
  };

  @override
  void initState() {
    super.initState();
    _checkedItems = {};
  }

  /// 是否有描红内容需要完成
  bool get _hasTracing => _traceChars.isNotEmpty;

  /// 所有描红项是否已完成
  bool get _allTraced => !_hasTracing || _traceResult != null;

  /// 描红字列表：把所有描红项按字拆开、去重、跳过标点
  ///
  /// 生成式课程里的 tracingItems 常常是「海星」「海星的五只腕」这样的词组，
  /// 直接整段塞进一个格子会叠在一起。这里拆成单字，交给画板逐字描。
  List<String> get _traceChars {
    final chars = <String>[];
    for (final item in widget.tracingItems) {
      for (final rune in item.runes) {
        final ch = String.fromCharCode(rune);
        if (ch.trim().isEmpty) continue;
        if (_ignoredTraceChars.contains(ch)) continue;
        if (chars.contains(ch)) continue;
        chars.add(ch);
      }
    }
    return chars;
  }

  @override
  Widget build(BuildContext context) {
    // 一步一步：描红 → 每条书写任务 → 自检清单，各占一页。
    final pages = <WizardPage>[];

    if (_hasTracing) {
      pages.add(WizardPage(
        label: '描红练习 · 写完一个字自动进入下一个',
        done: _allTraced,
        content: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildTracingHeader(),
            const SizedBox(height: 8),
            ..._buildTraceCanvas(),
          ],
        ),
      ));
    }

    for (var i = 0; i < widget.tasks.length; i++) {
      pages.add(WizardPage(
        label: '书写任务 ${i + 1} / ${widget.tasks.length}',
        done: _taskDone.contains(i),
        content: _buildTaskCard(i),
      ));
    }

    if (widget.checklist.isNotEmpty) {
      final allChecked = widget.checklist.asMap().entries.every(
        (entry) => _checkedItems.contains(entry.key),
      );
      pages.add(WizardPage(
        label: '自检清单 · 做到一项勾一项',
        done: allChecked,
        content: _buildChecklistCard(),
      ));
    }

    if (pages.isEmpty) {
      pages.add(const WizardPage(
        label: '书写练习',
        done: true,
        content: SizedBox.shrink(),
      ));
    }

    return StepWizard(
      allDone: widget.isCompleted,
      header: widget.goal.isNotEmpty ? _buildGoal() : null,
      pages: pages,
      onAllDone: () {
        final traceResult = _traceResult;
        widget.onComplete(traceResult?.score ?? 80, {
          'checkedItems': _checkedItems.toList(),
          if (traceResult != null)
            'traceResults': [
              {
                'coverage': traceResult.coverage,
                'attempts': traceResult.attempts,
                'score': traceResult.score,
              },
            ],
        });
      },
    );
  }

  Widget _buildGoal() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.softPurple.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(Icons.flag_rounded, size: 18, color: AppTheme.softPurple),
          const SizedBox(width: 8),
          Expanded(
            child: Text('目标: ${widget.goal}',
                style: TextStyle(fontSize: 14, color: AppTheme.textColor)),
          ),
        ],
      ),
    );
  }

  Widget _buildTaskCard(int index) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.active.card,
        borderRadius: BorderRadius.circular(AppTheme.cardRadius),
        boxShadow: AppTheme.softShadow(),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('✏️', style: TextStyle(fontSize: 30)),
          const SizedBox(height: 8),
          Text(
            widget.tasks[index],
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: AppTheme.textColor,
            ),
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => setState(() => _taskDone.add(index)),
              icon: Icon(
                _taskDone.contains(index)
                    ? Icons.check_circle_rounded
                    : Icons.edit_rounded,
                size: 18,
              ),
              label: Text(_taskDone.contains(index) ? '我写完啦 ✓' : '我写完啦'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildChecklistCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.active.card,
        borderRadius: BorderRadius.circular(AppTheme.cardRadius),
        boxShadow: AppTheme.softShadow(),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('自检清单',
              style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textColor)),
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
                              : AppTheme.active.gameCardLineStrong,
                          width: 2,
                        ),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: isChecked
                          ? Icon(Icons.check,
                              size: 16, color: AppTheme.active.onPrimary)
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
    );
  }

  /// 描红标题 + 进度提示
  Widget _buildTracingHeader() {
    final totalCount = _traceChars.length;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.softPurple.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: AppTheme.softPurple.withValues(alpha: 0.25),
          width: 1,
        ),
      ),
      child: Row(
        children: [
          const Text('✍', style: TextStyle(fontSize: 20)),
          const SizedBox(width: 10),
          _buildTraceHint(totalCount),
          _buildTraceProgress(),
        ],
      ),
    );
  }

  /// 描红提示文字
  Widget _buildTraceHint(int totalCount) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '描红练习',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: AppTheme.textColor,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            '用手指沿着浅色字形描画，写完一个字自动进入下一个（共 $totalCount 个字）',
            style: TextStyle(
              fontSize: 12,
              color: AppTheme.textSecondary,
            ),
          ),
        ],
      ),
    );
  }

  /// 描红进度指示
  Widget _buildTraceProgress() {
    if (_allTraced) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: AppTheme.accentColor.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          '全部完成 ✅',
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: AppTheme.accentColor,
          ),
        ),
      );
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: AppTheme.primaryColor.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        '共 ${_traceChars.length} 个字',
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: AppTheme.primaryColor,
        ),
      ),
    );
  }

  /// 描红画布区域
  ///
  /// 只渲染一个画布：所有字交给画板逐字描（写完一个字自动进入下一个），
  /// 不再为每个描红项堆一个画布，页面不会因为多个画板而反复滚动。
  List<Widget> _buildTraceCanvas() {
    final chars = _traceChars;
    if (chars.isEmpty) return const [];

    return [
      TracePathCanvas(
        key: const ValueKey('trace_canvas'),
        target: TraceGlyphTarget(
          id: 'trace_all',
          label: '描红: ${chars.join(' ')}',
          text: chars.join(),
        ),
        // 整体墨迹覆盖率 + 画板内部的逐块检查一起判定，
        // 覆盖率 0.75 不会出现"少写一两笔就算完成"。
        minCoverage: 0.75,
        onSolved: (traceResult) {
          if (!mounted) return;
          setState(() {
            _traceResult = traceResult;
          });
        },
      ),
    ];
  }

}

// ─── 空内容占位 ─────────────────────────────────────────────────────────

Widget _buildEmptyCard(String message) {
  return Container(
    width: double.infinity,
    padding: const EdgeInsets.all(32),
    decoration: BoxDecoration(
      color: AppTheme.active.card,
      borderRadius: BorderRadius.circular(AppTheme.cardRadius),
      boxShadow: AppTheme.softShadow(),
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          Icons.inbox_rounded,
          size: 48,
          color: AppTheme.textSecondary.withValues(alpha: 0.4),
        ),
        const SizedBox(height: 12),
        Text(
          message,
          style: TextStyle(
            fontSize: 15,
            color: AppTheme.textSecondary,
          ),
        ),
      ],
    ),
  );
}

// ─── 课程视频播放器 ───────────────────────────────────────────────────

/// 课程视频播放组件
///
/// 使用 video_player 播放 Remotion 生成的教学视频。
/// 视频播放完毕后调用 onComplete 完成步骤。
class LessonVideoPlayer extends StatefulWidget {
  final String videoUrl;
  final String? authToken;
  final void Function(int score) onComplete;

  const LessonVideoPlayer({
    super.key,
    required this.videoUrl,
    this.authToken,
    required this.onComplete,
  });

  @override
  State<LessonVideoPlayer> createState() => _LessonVideoPlayerState();
}

class _LessonVideoPlayerState extends State<LessonVideoPlayer> {
  static int _viewIdCounter = 0;

  VideoPlayerController? _controller;
  bool _isInitialized = false;
  bool _hasError = false;
  String _errorMessage = '';
  bool _hasCompleted = false;

  // Web-only
  late String _viewType;

  @override
  void initState() {
    super.initState();
    if (kIsWeb) {
      _initWebPlayer();
    } else {
      _initPlayer();
    }
  }

  /// Web 平台用原生 HTML5 `<video>`（带 controls + autoplay），完全绕过 video_player。
  /// 原因：video_player_web 在移动端 Android Chrome 上对 mp4 会 duration=NaN、黑屏，
  /// 原生 `video` 元素（与 raw 测试一致）能正常解码。
  void _initWebPlayer() {
    _viewType = 'lesson-video-${_viewIdCounter++}';
    initWebVideoPlayer(
      _viewType,
      widget.videoUrl,
      () {
        _log.warning('LessonVideoPlayer: HTML5 video error');
        if (mounted) setState(() => _hasError = true);
      },
      () {
        if (mounted) setState(() => _isInitialized = true);
      },
      () {
        // 原生 video 播放完毕 → 完成步骤
        if (mounted && !_hasCompleted) {
          _hasCompleted = true;
          widget.onComplete(100);
        }
      },
    );
  }

  Future<void> _initPlayer() async {
    try {
      final uri = Uri.parse(widget.videoUrl);
      final httpHeaders = <String, String>{};
      if (widget.authToken != null && widget.authToken!.isNotEmpty) {
        httpHeaders['Authorization'] = 'Bearer ${widget.authToken}';
      }
      _controller =
          VideoPlayerController.networkUrl(uri, httpHeaders: httpHeaders);
      await _controller!.initialize();
      if (!mounted) return;

      setState(() => _isInitialized = true);

      _controller!.addListener(_onControllerUpdate);

      // Auto-play
      _controller!.play();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _hasError = true;
        _errorMessage = e.toString();
      });
    }
  }

  @override
  void dispose() {
    _controller?.removeListener(_onControllerUpdate);
    _controller?.dispose();
    super.dispose();
  }

  /// 播放状态每次变化都刷新 UI，否则进度条/时间/按钮图标全部停在初始帧
  void _onControllerUpdate() {
    if (!mounted) return;
    final value = _controller!.value;
    if (!_hasCompleted &&
        value.duration > Duration.zero &&
        value.position >= value.duration) {
      _hasCompleted = true;
    }
    setState(() {});
  }

  bool get _isEnded {
    final value = _controller!.value;
    return value.duration > Duration.zero &&
        value.position >= value.duration &&
        !value.isPlaying;
  }

  void _togglePlayPause() {
    final controller = _controller!;
    if (_isEnded) {
      controller.seekTo(Duration.zero);
      controller.play();
    } else if (controller.value.isPlaying) {
      controller.pause();
    } else {
      controller.play();
    }
  }

  void _seekBy(Duration delta) {
    final controller = _controller!;
    final target = controller.value.position + delta;
    controller.seekTo(target < Duration.zero
        ? Duration.zero
        : target > controller.value.duration
            ? controller.value.duration
            : target);
  }

  void _enterFullscreen() {
    Navigator.of(context).push(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => _FullscreenVideoPage(
          controller: _controller!,
          restoreOrientation: MediaQuery.orientationOf(context),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_hasError) {
      return _buildErrorState();
    }

    if (!_isInitialized) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(color: AppTheme.primaryColor),
            SizedBox(height: 12),
            Text(
              '正在加载视频...',
              style: TextStyle(fontSize: 14, color: AppTheme.textSecondary),
            ),
          ],
        ),
      );
    }

    // Web：原生 HTML5 video（带原生 controls + autoplay），初始化完成即显示
    if (kIsWeb) {
      return _buildWebVideo();
    }

    final isPlaying = _controller!.value.isPlaying;
    final isBuffering = _controller!.value.isBuffering;
    final aspectRatio = _controller!.value.aspectRatio;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Video display
        ClipRRect(
          borderRadius: BorderRadius.circular(AppTheme.cardRadius),
          child: AspectRatio(
            aspectRatio: aspectRatio > 0 ? aspectRatio : 16 / 9,
            child: ColoredBox(
              color: Colors.black,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  GestureDetector(
                    onTap: _togglePlayPause,
                    child: VideoPlayer(_controller!),
                  ),
                  // Paused / ended overlay
                  if (!isPlaying && !isBuffering)
                    Positioned.fill(
                      child: IgnorePointer(
                        child: ColoredBox(
                          color: Colors.black26,
                          child: Center(
                            child: Icon(
                              _isEnded
                                  ? Icons.replay_rounded
                                  : Icons.play_circle_fill_rounded,
                              size: 64,
                              color: Colors.white70,
                            ),
                          ),
                        ),
                      ),
                    ),
                  // Buffering indicator
                  if (isBuffering)
                    const CircularProgressIndicator(color: Colors.white70),
                  // Fullscreen button
                  Positioned(
                    right: 4,
                    bottom: 4,
                    child: IconButton(
                      icon: const Icon(
                        Icons.fullscreen_rounded,
                        color: Colors.white,
                        size: 28,
                      ),
                      tooltip: '全屏播放',
                      onPressed: _enterFullscreen,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),

        const SizedBox(height: 12),

        // Progress bar（可拖动定位）
        _VideoSeekBar(controller: _controller!),

        const SizedBox(height: 8),

        // Playback controls + complete button
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            // Rewind 10s
            IconButton(
              icon: const Icon(Icons.replay_10_rounded),
              onPressed: () => _seekBy(const Duration(seconds: -10)),
              tooltip: '后退10秒',
              color: AppTheme.primaryColor,
            ),
            // Play/pause
            Container(
              decoration: BoxDecoration(
                color: AppTheme.primaryColor,
                shape: BoxShape.circle,
              ),
              child: IconButton(
                icon: Icon(
                  isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded,
                  color: AppTheme.active.onPrimary,
                  size: 28,
                ),
                onPressed: _togglePlayPause,
              ),
            ),
            // Forward 10s
            IconButton(
              icon: const Icon(Icons.forward_10_rounded),
              onPressed: () => _seekBy(const Duration(seconds: 10)),
              tooltip: '快进10秒',
              color: AppTheme.primaryColor,
            ),
          ],
        ),

        const SizedBox(height: 12),

        // Complete button
        SizedBox(
          width: double.infinity,
          height: 48,
          child: FilledButton.icon(
            onPressed: () {
              _controller!.pause();
              widget.onComplete(_hasCompleted ? 95 : 70);
            },
            icon: const Icon(Icons.check_rounded),
            label: Text(_hasCompleted ? '看完了，进入下一步' : '看好了，进入下一步'),
            style: FilledButton.styleFrom(
              backgroundColor: AppTheme.primaryColor,
              foregroundColor: AppTheme.active.onPrimary,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildWebVideo() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(AppTheme.cardRadius),
          child: AspectRatio(
            aspectRatio: 16 / 9,
            // 原生 HTML5 <video>，带浏览器自带的播放/进度控件
            child: HtmlElementView(viewType: _viewType),
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          height: 48,
          child: FilledButton.icon(
            onPressed: () => widget.onComplete(_hasCompleted ? 95 : 70),
            icon: const Icon(Icons.check_rounded),
            label: Text(_hasCompleted ? '看完了，进入下一步' : '看好了，进入下一步'),
            style: FilledButton.styleFrom(
              backgroundColor: AppTheme.primaryColor,
              foregroundColor: AppTheme.active.onPrimary,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildErrorState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.videocam_off_rounded,
              size: 48,
              color: AppTheme.textSecondary,
            ),
            const SizedBox(height: 12),
            Text(
              '视频加载失败',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: AppTheme.textColor,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              _errorMessage.length > 100
                  ? '${_errorMessage.substring(0, 100)}...'
                  : _errorMessage,
              style: TextStyle(
                fontSize: 12,
                color: AppTheme.textSecondary,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: () {
                setState(() {
                  _hasError = false;
                  _errorMessage = '';
                });
                _initPlayer();
              },
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('重试'),
            ),
          ],
        ),
      ),
    );
  }

}

// ─── 视频进度条（可拖动定位）────────────────────────────────────────────

/// 独立监听 controller 的进度条：拖动时显示目标位置，松手才 seek，
/// 播放中时间标签与滑块随播放实时前进。
class _VideoSeekBar extends StatefulWidget {
  final VideoPlayerController controller;
  final bool onDark;

  const _VideoSeekBar({required this.controller, this.onDark = false});

  @override
  State<_VideoSeekBar> createState() => _VideoSeekBarState();
}

class _VideoSeekBarState extends State<_VideoSeekBar> {
  double? _dragValueMs;

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onUpdate);
  }

  @override
  void didUpdateWidget(_VideoSeekBar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.removeListener(_onUpdate);
      widget.controller.addListener(_onUpdate);
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onUpdate);
    super.dispose();
  }

  void _onUpdate() {
    if (mounted) setState(() {});
  }

  String _format(Duration d) {
    final minutes = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final seconds = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$minutes:$seconds';
  }

  @override
  Widget build(BuildContext context) {
    final value = widget.controller.value;
    final totalMs = value.duration.inMilliseconds;
    final positionMs = _dragValueMs ??
        value.position.inMilliseconds
            .toDouble()
            .clamp(0.0, totalMs.toDouble())
            .toDouble();
    final sliderValue =
        totalMs > 0 ? (positionMs / totalMs).clamp(0.0, 1.0).toDouble() : 0.0;

    final activeColor = widget.onDark ? Colors.white : AppTheme.primaryColor;
    final inactiveColor = widget.onDark
        ? Colors.white24
        : AppTheme.active.isDarkSurface
            ? AppTheme.active.line
            : Colors.grey.shade300;
    final labelColor = widget.onDark ? Colors.white70 : AppTheme.textSecondary;
    final labelStyle = TextStyle(fontSize: 12, color: labelColor);

    return Row(
      children: [
        Text(
          _format(Duration(milliseconds: positionMs.round())),
          style: labelStyle,
        ),
        Expanded(
          child: SliderTheme(
            data: SliderThemeData(
              trackHeight: 4,
              thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
              overlayShape: const RoundSliderOverlayShape(overlayRadius: 14),
              activeTrackColor: activeColor,
              inactiveTrackColor: inactiveColor,
              thumbColor: activeColor,
              overlayColor: activeColor.withValues(alpha: 0.15),
            ),
            child: Slider(
              value: sliderValue,
              onChanged: totalMs > 0
                  ? (v) => setState(() => _dragValueMs = v * totalMs)
                  : null,
              onChangeStart: (_) => setState(() => _dragValueMs =
                  value.position.inMilliseconds.toDouble()),
              onChangeEnd: (v) {
                widget.controller.seekTo(
                  Duration(milliseconds: (v * totalMs).round()),
                );
                setState(() => _dragValueMs = null);
              },
            ),
          ),
        ),
        Text(_format(value.duration), style: labelStyle),
      ],
    );
  }
}

// ─── 全屏播放页 ─────────────────────────────────────────────────────────

/// 横屏全屏播放：复用同一个 controller，进出全屏不中断播放。
/// 点击画面显示/隐藏控制层，播放中 3 秒无操作自动隐藏。
class _FullscreenVideoPage extends StatefulWidget {
  final VideoPlayerController controller;
  final Orientation restoreOrientation;

  const _FullscreenVideoPage({
    required this.controller,
    required this.restoreOrientation,
  });

  @override
  State<_FullscreenVideoPage> createState() => _FullscreenVideoPageState();
}

class _FullscreenVideoPageState extends State<_FullscreenVideoPage> {
  bool _controlsVisible = true;
  Timer? _hideTimer;

  /// 退出全屏时先锁回进入前的方向，再交还系统：部分设备（模拟器）的
  /// 传感器在旋转后停留在横屏，直接放开会卡在横屏；而一直锁死又会
  /// 废掉自动旋转。世代号保证重进全屏时旧的交还定时器失效。
  static int _orientGen = 0;
  int _gen = 0;

  VideoPlayerController get _controller => widget.controller;

  @override
  void initState() {
    super.initState();
    _gen = ++_orientGen;
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);
    _controller.addListener(_onUpdate);
    _scheduleHide();
  }

  @override
  void dispose() {
    _hideTimer?.cancel();
    _controller.removeListener(_onUpdate);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    SystemChrome.setPreferredOrientations(
      widget.restoreOrientation == Orientation.landscape
          ? [DeviceOrientation.landscapeLeft, DeviceOrientation.landscapeRight]
          : [DeviceOrientation.portraitUp, DeviceOrientation.portraitDown],
    );
    final gen = _gen;
    Timer(const Duration(seconds: 1), () {
      if (gen == _orientGen) SystemChrome.setPreferredOrientations([]);
    });
    super.dispose();
  }

  void _onUpdate() {
    if (mounted) setState(() {});
  }

  bool get _isEnded {
    final value = _controller.value;
    return value.duration > Duration.zero &&
        value.position >= value.duration &&
        !value.isPlaying;
  }

  void _scheduleHide() {
    _hideTimer?.cancel();
    if (_controller.value.isPlaying) {
      _hideTimer = Timer(const Duration(seconds: 3), () {
        if (mounted) setState(() => _controlsVisible = false);
      });
    }
  }

  void _toggleControls() {
    setState(() => _controlsVisible = !_controlsVisible);
    if (_controlsVisible) _scheduleHide();
  }

  void _togglePlayPause() {
    if (_isEnded) {
      _controller.seekTo(Duration.zero);
      _controller.play();
    } else if (_controller.value.isPlaying) {
      _controller.pause();
    } else {
      _controller.play();
    }
    setState(() => _controlsVisible = true);
    _scheduleHide();
  }

  void _seekBy(Duration delta) {
    final target = _controller.value.position + delta;
    _controller.seekTo(target < Duration.zero
        ? Duration.zero
        : target > _controller.value.duration
            ? _controller.value.duration
            : target);
    setState(() => _controlsVisible = true);
    _scheduleHide();
  }

  @override
  Widget build(BuildContext context) {
    final value = _controller.value;
    final aspect = value.aspectRatio;

    return Scaffold(
      backgroundColor: Colors.black,
      body: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: _toggleControls,
        child: Stack(
          fit: StackFit.expand,
          children: [
            Center(
              child: aspect > 0
                  ? AspectRatio(
                      aspectRatio: aspect,
                      child: VideoPlayer(_controller),
                    )
                  : VideoPlayer(_controller),
            ),
            if (value.isBuffering)
              const Center(
                child: CircularProgressIndicator(color: Colors.white70),
              ),
            if (!value.isPlaying && !value.isBuffering)
              Center(
                child: IconButton(
                  iconSize: 72,
                  icon: Icon(
                    _isEnded
                        ? Icons.replay_rounded
                        : Icons.play_circle_fill_rounded,
                    color: Colors.white70,
                  ),
                  onPressed: _togglePlayPause,
                ),
              ),
            // 控制层
            IgnorePointer(
              ignoring: !_controlsVisible,
              child: AnimatedOpacity(
                opacity: _controlsVisible ? 1 : 0,
                duration: const Duration(milliseconds: 220),
                child: Container(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.black54,
                        Colors.transparent,
                        Colors.transparent,
                        Colors.black87,
                      ],
                      stops: [0, 0.25, 0.6, 1],
                    ),
                  ),
                  child: SafeArea(
                    child: Column(
                      children: [
                        Align(
                          alignment: Alignment.centerLeft,
                          child: IconButton(
                            icon: const Icon(
                              Icons.fullscreen_exit_rounded,
                              color: Colors.white,
                              size: 30,
                            ),
                            tooltip: '退出全屏',
                            onPressed: () => Navigator.of(context).pop(),
                          ),
                        ),
                        const Spacer(),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          child: _VideoSeekBar(
                            controller: _controller,
                            onDark: true,
                          ),
                        ),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            IconButton(
                              icon: const Icon(
                                Icons.replay_10_rounded,
                                color: Colors.white,
                                size: 30,
                              ),
                              tooltip: '后退10秒',
                              onPressed: () =>
                                  _seekBy(const Duration(seconds: -10)),
                            ),
                            const SizedBox(width: 24),
                            IconButton(
                              icon: Icon(
                                value.isPlaying
                                    ? Icons.pause_circle_filled_rounded
                                    : Icons.play_circle_fill_rounded,
                                color: Colors.white,
                                size: 52,
                              ),
                              tooltip: value.isPlaying ? '暂停' : '播放',
                              onPressed: _togglePlayPause,
                            ),
                            const SizedBox(width: 24),
                            IconButton(
                              icon: const Icon(
                                Icons.forward_10_rounded,
                                color: Colors.white,
                                size: 30,
                              ),
                              tooltip: '快进10秒',
                              onPressed: () =>
                                  _seekBy(const Duration(seconds: 10)),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                      ],
                    ),
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
