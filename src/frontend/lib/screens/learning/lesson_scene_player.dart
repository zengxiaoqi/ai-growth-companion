import 'dart:async';
import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import '../../components/empty_state.dart';
import '../../services/tts_service.dart';
import '../games/game_renderer.dart';
import 'lesson_scene_models.dart';
import 'scene_renderer.dart';
import 'trace_path_canvas.dart';

// Re-export models for consumers
export 'lesson_scene_models.dart';

// ==================== LessonScenePlayer ====================

/// 课程场景播放器
///
/// 支持三种模式：
/// - playback: 自动播放场景序列
/// - guidedTrace: 描红练习，需完成每个场景的描红
/// - activityShell: 活动练习模式
///
/// 用法：
/// ```dart
/// LessonScenePlayer(
///   document: myDocument,
///   isCompleted: false,
///   onComplete: (score, data) { /* 处理完成 */ },
/// )
/// ```
class LessonScenePlayer extends StatefulWidget {
  final LessonSceneDocument document;
  final bool isCompleted;
  final void Function(int? score, Map<String, dynamic>? data)? onComplete;
  final bool previewMode;

  const LessonScenePlayer({
    super.key,
    required this.document,
    this.isCompleted = false,
    this.onComplete,
    this.previewMode = false,
  });

  @override
  State<LessonScenePlayer> createState() => _LessonScenePlayerState();
}

class _LessonScenePlayerState extends State<LessonScenePlayer> {
  late PageController _pageController;
  int _currentIndex = 0;
  bool _isPlaying = false;
  bool _hasStarted = false;
  final Map<String, TraceResult> _traceResults = {};
  ActivityResult? _activityResult;
  bool _shellReady = false;

  final TtsService _tts = TtsService();
  Timer? _advanceTimer;
  Timer? _safetyTimer;
  bool _advanced = false;

  List<LessonScene> get _scenes => widget.document.scenes;
  LessonScene? get _currentScene =>
      _scenes.isNotEmpty ? _scenes[_currentIndex] : null;
  bool get _isLastScene => _currentIndex >= _scenes.length - 1;

  double get _averageTraceScore {
    if (_traceResults.isEmpty) return 0;
    final sum = _traceResults.values.fold<int>(0, (s, r) => s + r.score);
    return sum / _traceResults.length;
  }

  bool get _canFinishGuidedTrace =>
      widget.document.mode == LessonSceneMode.guidedTrace &&
      _traceResults.length >= _scenes.length &&
      _averageTraceScore > 0;

  bool get _canFinishPractice =>
      widget.document.mode == LessonSceneMode.activityShell &&
      _activityResult != null &&
      _isLastScene;

  bool get _canFinishPlayback =>
      widget.document.mode == LessonSceneMode.playback &&
      _hasStarted &&
      _isLastScene;

  @override
  void initState() {
    super.initState();
    _pageController = PageController(initialPage: 0);
  }

  @override
  void dispose() {
    _clearAllTimers();
    _pageController.dispose();
    super.dispose();
  }

  void _clearAllTimers() {
    _advanceTimer?.cancel();
    _safetyTimer?.cancel();
    _advanceTimer = null;
    _safetyTimer = null;
  }

  void _startPlayback() {
    setState(() {
      _hasStarted = true;
      _isPlaying = true;
    });
  }

  void _speakScene(LessonScene scene) {
    if (scene.narration.isNotEmpty) {
      _tts.speak(scene.narration);
    }
  }

  void _doAdvance() {
    if (_advanced) return;
    _advanced = true;
    _clearAllTimers();
    if (_isLastScene) {
      setState(() => _isPlaying = false);
    } else {
      _advanceToScene(_currentIndex + 1);
    }
  }

  void _advanceToScene(int index) {
    if (index < 0 || index >= _scenes.length) return;
    setState(() => _currentIndex = index);
    _pageController.animateToPage(
      index,
      duration: const Duration(milliseconds: 350),
      curve: Curves.easeInOut,
    );
  }

  void _startAutoAdvance(LessonScene scene) {
    _clearAllTimers();
    _advanced = false;
    final durationMs = scene.durationSec * 1000;

    _advanceTimer = Timer(Duration(milliseconds: durationMs), () {
      if (_tts.isSpeaking) {
        // TTS 仍在播放，等待其自然完成（通过 Completer 避免轮询竞态）
        _tts.onComplete.then((_) {
          if (!_advanced) _doAdvance();
        });
        // 安全兜底：8 秒后强制推进
        _safetyTimer = Timer(const Duration(seconds: 8), _doAdvance);
      } else {
        _doAdvance();
      }
    });
  }

  void _onSceneChanged(int index) {
    if (index != _currentIndex) {
      setState(() => _currentIndex = index);
    }
    if (widget.document.mode == LessonSceneMode.playback && _isPlaying) {
      final scene = _scenes[index];
      _tts.stop();
      _speakScene(scene);
      _startAutoAdvance(scene);
    }
  }

  void _handleTraceSolved(String sceneId, TraceResult result) {
    setState(() {
      _traceResults[sceneId] = result;
    });
  }

  void _handleActivityComplete(ActivityResult result) {
    setState(() {
      _activityResult = result;
      _shellReady = true;
    });
    if (!_isLastScene) {
      Timer(const Duration(milliseconds: 500), () {
        if (mounted) _advanceToScene(_currentIndex + 1);
      });
    }
  }

  void _handleFinish() {
    final mode = widget.document.mode;
    final policy = widget.document.completionPolicy;

    if (mode == LessonSceneMode.guidedTrace) {
      widget.onComplete?.call(
        _averageTraceScore.toInt().clamp(0, 100),
        {
          'sceneMode': 'guided_trace',
          'traceResults': _traceResults.map(
            (k, v) => MapEntry(k, {
              'coverage': v.coverage,
              'attempts': v.attempts,
              'score': v.score,
            }),
          ),
        },
      );
      return;
    }

    if (mode == LessonSceneMode.activityShell) {
      widget.onComplete?.call(
        _activityResult?.score ?? policy?.passingScore ?? 85,
        {
          'sceneMode': 'activity_shell',
          'activityResult': {
            'score': _activityResult?.score,
            'totalQuestions': _activityResult?.totalQuestions,
            'correctAnswers': _activityResult?.correctAnswers,
          },
        },
      );
      return;
    }

    // playback
    widget.onComplete?.call(
      policy?.passingScore ?? 90,
      {
        'sceneMode': 'playback',
        'viewedScenes': _scenes.map((s) => s.id).toList(),
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_scenes.isEmpty) {
      return const EmptyState(
        emoji: '🎬',
        title: '暂无动画内容',
        subtitle: '学习内容正在准备中...',
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Playback 模式：需要点击开始
        if (widget.document.mode == LessonSceneMode.playback && !_hasStarted)
          _buildTapToStart()
        else
          _buildSceneContent(),

        const SizedBox(height: 12),

        // 朗读按钮（非 activity_shell 且有旁白时）
        if (widget.document.mode != LessonSceneMode.activityShell &&
            _currentScene?.narration.isNotEmpty == true)
          _buildSpeakButton(),

        // Playback 控制栏
        if (widget.document.mode == LessonSceneMode.playback && _hasStarted)
          _buildPlaybackControls(),

        // 非 playback 且非活动交互时的导航
        if (widget.document.mode != LessonSceneMode.playback &&
            _currentScene?.interaction?.type != 'launch_activity')
          _buildStepNavigation(),

        const SizedBox(height: 8),

        // 进度指示
        _buildProgressIndicator(),

        const SizedBox(height: 12),

        // 完成区域
        _buildCompleteSection(),
      ],
    );
  }



  Widget _buildTapToStart() {
    final firstScene = _scenes.first;
    return GestureDetector(
      onTap: _startPlayback,
      child: Container(
        height: 240,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              AppTheme.primaryColor.withValues(alpha: 0.15),
              AppTheme.secondaryColor.withValues(alpha: 0.1),
            ],
          ),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(
            color: AppTheme.primaryColor.withValues(alpha: 0.2),
            width: 1.5,
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppTheme.primaryColor.withValues(alpha: 0.15),
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.play_arrow_rounded,
                size: 40,
                color: AppTheme.primaryColor,
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              '点击开始播放场景',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: AppTheme.textColor,
              ),
            ),
            if (firstScene.onScreenText?.isNotEmpty == true ||
                firstScene.title.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                firstScene.onScreenText ?? firstScene.title,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                  color: AppTheme.textColor,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildSceneContent() {
    return SizedBox(
      height: 360,
      child: PageView.builder(
        controller: _pageController,
        itemCount: _scenes.length,
        onPageChanged: _onSceneChanged,
        itemBuilder: (context, index) {
          final scene = _scenes[index];
          final isCurrent = index == _currentIndex;

          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Column(
              children: [
                // 场景渲染
                Expanded(
                  child: SceneRenderer(
                    scene: scene,
                    isPlaying: widget.document.mode == LessonSceneMode.playback
                        ? _isPlaying && isCurrent
                        : true,
                  ),
                ),

                // 描红交互
                if (scene.interaction?.type == 'trace_path' && isCurrent) ...[
                  const SizedBox(height: 8),
                  _buildTracePathSection(scene),
                ],

                // 活动交互
                if (scene.interaction?.type == 'launch_activity' && isCurrent)
                  _buildActivityShell(scene),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildTracePathSection(LessonScene scene) {
    final traceInteraction = scene.interaction?.tracePath;
    if (traceInteraction == null || traceInteraction.targets.isEmpty) {
      return const SizedBox.shrink();
    }

    final target = traceInteraction.targets.first;
    final minCoverage = traceInteraction.minCoverage ?? 0.9;

    return TracePathCanvas(
      target: target,
      minCoverage: minCoverage,
      onSolved: (result) => _handleTraceSolved(scene.id, result),
    );
  }

  Widget _buildActivityShell(LessonScene scene) {
    final activityInteraction = scene.interaction?.launchActivity;
    if (activityInteraction == null) return const SizedBox.shrink();

    final activityData = activityInteraction.activityData;
    final gameId =
        activityData['gameId']?.toString() ?? activityData['id']?.toString();
    final difficulty = activityData['difficulty'] is num
        ? (activityData['difficulty'] as num).toInt()
        : 1;

    // 无有效游戏数据时回退到占位 UI
    if (activityInteraction.activityType.isEmpty && activityData.isEmpty) {
      return _buildActivityFallback(scene);
    }

    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        activityInteraction.prompt ?? '互动练习',
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.textColor,
                        ),
                      ),
                      Text(
                        '完成小游戏后会自动进入反馈场景',
                        style: TextStyle(
                          fontSize: 12,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: Icon(Icons.volume_up_rounded,
                      size: 20, color: AppTheme.primaryColor),
                  onPressed: () => _speakScene(scene),
                ),
              ],
            ),
            const SizedBox(height: 8),
            // GameRenderer 渲染真实互动游戏
            SizedBox(
              height: 280,
              child: GameRenderer(
                activityType: activityInteraction.activityType,
                initialData: activityData,
                gameId: gameId,
                difficulty: difficulty,
                onExit: () {},
                onCompleted: (result) {
                  final score = result['score'] as int? ?? 85;
                  _handleActivityComplete(ActivityResult(
                    score: score.clamp(0, 100),
                    totalQuestions: result['totalQuestions'] as int? ?? 1,
                    correctAnswers: result['correctAnswers'] as int? ?? 1,
                    timeSpent: result['timeSpent'] as int?,
                  ));
                },
              ),
            ),
            if (_shellReady) ...[
              const SizedBox(height: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: AppTheme.primaryColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Text(
                  '练习完成，正在进入反馈场景',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: AppTheme.primaryColor,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// 活动数据为空时的回退占位 UI
  Widget _buildActivityFallback(LessonScene scene) {
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '互动练习',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.textColor,
                        ),
                      ),
                      Text(
                        '暂无互动数据，点击完成跳过此步骤',
                        style: TextStyle(
                          fontSize: 12,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: Icon(Icons.volume_up_rounded,
                      size: 20, color: AppTheme.primaryColor),
                  onPressed: () => _speakScene(scene),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Container(
              height: 120,
              decoration: BoxDecoration(
                color: AppTheme.backgroundColor,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.games_outlined,
                      size: 32,
                      color: AppTheme.textSecondary.withValues(alpha: 0.4),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      '暂无互动内容',
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

  Widget _buildSpeakButton() {
    return Align(
      alignment: Alignment.centerRight,
      child: GestureDetector(
        onTap: () {
          if (_currentScene != null) _speakScene(_currentScene!);
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: AppTheme.primaryColor.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.volume_up_rounded,
                  size: 14, color: AppTheme.primaryColor),
              const SizedBox(width: 4),
              Text(
                '朗读提示',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: AppTheme.primaryColor,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPlaybackControls() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _buildNavButton(
          icon: Icons.skip_previous_rounded,
          label: '上一幕',
          enabled: _currentIndex > 0,
          onTap: () => _advanceToScene(_currentIndex - 1),
        ),
        const SizedBox(width: 16),
        _buildPlayPauseButton(),
        const SizedBox(width: 16),
        _buildNavButton(
          icon: Icons.skip_next_rounded,
          label: '下一幕',
          enabled: !_isLastScene,
          onTap: () => _advanceToScene(_currentIndex + 1),
        ),
      ],
    );
  }

  Widget _buildPlayPauseButton() {
    return GestureDetector(
      onTap: () {
        setState(() => _isPlaying = !_isPlaying);
        if (_isPlaying && _currentScene != null) {
          _startAutoAdvance(_currentScene!);
        } else {
          _clearAllTimers();
        }
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: AppTheme.primaryColor,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: AppTheme.primaryColor.withValues(alpha: 0.3),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              _isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded,
              size: 16,
              color: Colors.white,
            ),
            const SizedBox(width: 4),
            Text(
              _isPlaying ? '暂停' : '播放',
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNavButton({
    required IconData icon,
    required String label,
    required bool enabled,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: enabled ? onTap : null,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.grey.shade100,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 16,
              color: enabled
                  ? AppTheme.textColor
                  : AppTheme.textSecondary.withValues(alpha: 0.4),
            ),
            const SizedBox(width: 4),
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                color: enabled
                    ? AppTheme.textSecondary
                    : AppTheme.textSecondary.withValues(alpha: 0.4),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStepNavigation() {
    final traceDone = _currentScene != null &&
        _traceResults.containsKey(_currentScene!.id);

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        _buildNavButton(
          icon: Icons.arrow_back_rounded,
          label: '上一步',
          enabled: _currentIndex > 0,
          onTap: () => _advanceToScene(_currentIndex - 1),
        ),
        Text(
          '${_currentIndex + 1} / ${_scenes.length}',
          style: TextStyle(
            fontSize: 12,
            color: AppTheme.textSecondary,
          ),
        ),
        _buildNavButton(
          icon: Icons.arrow_forward_rounded,
          label: '下一步',
          enabled: !_isLastScene &&
              !(widget.document.mode == LessonSceneMode.guidedTrace &&
                  !traceDone),
          onTap: () => _advanceToScene(_currentIndex + 1),
        ),
      ],
    );
  }

  Widget _buildProgressIndicator() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(_scenes.length, (index) {
        final isCurrent = index == _currentIndex;
        return AnimatedContainer(
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeInOut,
          margin: const EdgeInsets.symmetric(horizontal: 3),
          width: isCurrent ? 24 : 6,
          height: 6,
          decoration: BoxDecoration(
            color: isCurrent
                ? AppTheme.primaryColor
                : Colors.grey.shade200,
            borderRadius: BorderRadius.circular(3),
          ),
        );
      }),
    );
  }

  Widget _buildCompleteSection() {
    if (widget.isCompleted) {
      return Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.check_circle_rounded,
              size: 18, color: AppTheme.primaryColor),
          const SizedBox(width: 6),
          Text(
            '已完成',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: AppTheme.primaryColor,
            ),
          ),
        ],
      );
    }

    final canFinish =
        _canFinishPlayback || _canFinishGuidedTrace || _canFinishPractice;

    if (!widget.previewMode && !widget.isCompleted && canFinish) {
      return SizedBox(
        width: double.infinity,
        child: ElevatedButton.icon(
          onPressed: _handleFinish,
          icon: const Icon(Icons.check_rounded, size: 20),
          label: const Text(
            '完成此步骤',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppTheme.primaryColor,
            foregroundColor: Colors.white,
            elevation: 2,
            shadowColor: AppTheme.primaryColor.withValues(alpha: 0.3),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
          ),
        ),
      );
    }

    return const SizedBox.shrink();
  }
}