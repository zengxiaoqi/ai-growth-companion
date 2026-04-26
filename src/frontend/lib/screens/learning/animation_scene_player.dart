import 'dart:async';
import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';

/// 动画场景数据模型
///
/// 每个场景包含旁白、屏幕文字、背景、角色等信息，
/// 用于在 AnimationScenePlayer 中逐帧播放。
class AnimationScene {
  /// 旁白文字（叙述内容）
  final String narration;

  /// 屏幕显示文字（大字标题/关键词）
  final String onScreenText;

  /// 背景描述或颜色值（如 "#FFB6C1"、"蓝色天空"）
  final String background;

  /// 角色描述或 emoji（如 "🦄"、"小猫"）
  final String character;

  /// 可选图片 URL
  final String? imageUrl;

  const AnimationScene({
    required this.narration,
    required this.onScreenText,
    required this.background,
    required this.character,
    this.imageUrl,
  });

  /// 从 JSON 解析场景数据
  factory AnimationScene.fromJson(Map<String, dynamic> json) {
    return AnimationScene(
      narration: json['narration']?.toString() ?? '',
      onScreenText: json['onScreenText']?.toString() ?? '',
      background: json['background']?.toString() ?? '',
      character: json['character']?.toString() ?? '',
      imageUrl: json['imageUrl']?.toString(),
    );
  }
}

/// 场景动画播放器（简化版，Flutter 移动端）
///
/// 功能：
/// - 逐场景播放动画内容
/// - 播放/暂停、上一场景、下一场景控制
/// - 底部进度指示点
/// - 场景切换动画
/// - 旁白文字展示（不实际播放音频）
/// - 完成状态与"看完了，进入下一步"按钮
///
/// 用法：
/// ```dart
/// AnimationScenePlayer(
///   scenes: myScenes,
///   isCompleted: false,
///   onComplete: (score) { /* 处理完成 */ },
/// )
/// ```
class AnimationScenePlayer extends StatefulWidget {
  /// 场景列表
  final List<AnimationScene> scenes;

  /// 是否已完成（外部状态）
  final bool isCompleted;

  /// 完成回调，可传入分数
  final void Function(int? score)? onComplete;

  const AnimationScenePlayer({
    super.key,
    required this.scenes,
    this.isCompleted = false,
    this.onComplete,
  });

  @override
  State<AnimationScenePlayer> createState() => _AnimationScenePlayerState();
}

class _AnimationScenePlayerState extends State<AnimationScenePlayer>
    with SingleTickerProviderStateMixin {
  int _currentIndex = 0;
  bool _isPlaying = false;
  bool _allWatched = false;
  bool _needsUserTap = true;

  // 场景切换动画控制器
  late AnimationController _transitionController;
  late Animation<double> _fadeAnimation;
  late Animation<Offset> _slideAnimation;

  // 自动播放定时器
  Timer? _autoTimer;

  // 每个场景自动停留时间（秒）
  static const int _sceneDurationSeconds = 6;
  int _remainingSeconds = _sceneDurationSeconds;

  @override
  void initState() {
    super.initState();
    _transitionController = AnimationController(
      duration: const Duration(milliseconds: 400),
      vsync: this,
    );
    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _transitionController, curve: Curves.easeInOut),
    );
    _slideAnimation = Tween<Offset>(
      begin: const Offset(0.15, 0),
      end: Offset.zero,
    ).animate(
      CurvedAnimation(parent: _transitionController, curve: Curves.easeOutCubic),
    );
    // 初始场景淡入
    _transitionController.forward();
  }

  @override
  void dispose() {
    _autoTimer?.cancel();
    _transitionController.dispose();
    super.dispose();
  }

  /// 用户首次点击开始播放
  void _startPlayback() {
    setState(() {
      _needsUserTap = false;
      _isPlaying = true;
    });
    _startAutoAdvance();
  }

  /// 开始自动推进场景
  void _startAutoAdvance() {
    _autoTimer?.cancel();
    _remainingSeconds = _sceneDurationSeconds;
    _autoTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return;
      if (!_isPlaying) return;

      if (_remainingSeconds <= 1) {
        timer.cancel();
        _advanceScene();
      } else {
        setState(() => _remainingSeconds--);
      }
    });
  }

  /// 推进到下一场景
  void _advanceScene() {
    if (_currentIndex >= widget.scenes.length - 1) {
      // 所有场景播放完毕
      setState(() {
        _isPlaying = false;
        _allWatched = true;
      });
      _autoTimer?.cancel();
      return;
    }

    // 先淡出
    _transitionController.reverse().then((_) {
      if (!mounted) return;
      setState(() => _currentIndex++);
      // 再淡入新场景
      _transitionController.forward();
      _startAutoAdvance();
    });
  }

  /// 播放/暂停切换
  void _togglePlayPause() {
    if (_isPlaying) {
      _autoTimer?.cancel();
      setState(() => _isPlaying = false);
    } else {
      setState(() => _isPlaying = true);
      _startAutoAdvance();
    }
  }

  /// 上一场景
  void _prevScene() {
    if (_currentIndex <= 0) return;
    _autoTimer?.cancel();
    _transitionController.reverse().then((_) {
      if (!mounted) return;
      setState(() => _currentIndex--);
      _transitionController.forward();
      if (_isPlaying) _startAutoAdvance();
    });
  }

  /// 下一场景
  void _nextScene() {
    if (_currentIndex >= widget.scenes.length - 1) return;
    _autoTimer?.cancel();
    _transitionController.reverse().then((_) {
      if (!mounted) return;
      setState(() => _currentIndex++);
      _transitionController.forward();
      if (_isPlaying) _startAutoAdvance();
    });
  }

  /// 解析背景颜色
  Color _parseBackgroundColor(String background) {
    // 尝试解析十六进制颜色
    final hex = background.replaceAll('#', '').trim();
    if (RegExp(r'^[0-9a-fA-F]{6}$').hasMatch(hex)) {
      return Color(int.parse('FF$hex', radix: 16));
    }
    if (RegExp(r'^[0-9a-fA-F]{8}$').hasMatch(hex)) {
      return Color(int.parse(hex, radix: 16));
    }
    // 默认返回柔和背景色
    return AppTheme.backgroundColor;
  }

  /// 判断 character 是否为 emoji
  bool _isEmoji(String character) {
    if (character.isEmpty) return false;
    // 简单判断：emoji 通常不在 ASCII 范围内
    return character.runes.any((r) => r > 0xFF);
  }

  @override
  Widget build(BuildContext context) {
    if (widget.scenes.isEmpty) {
      return _buildEmptyState();
    }

    // 需要用户点击才能开始（移动端自动播放限制）
    if (_needsUserTap) {
      return _buildTapToStartOverlay();
    }

    final scene = widget.scenes[_currentIndex];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // 动画场景渲染区域
        _buildSceneCanvas(scene),
        const SizedBox(height: 12),
        // 播放控制栏
        _buildPlaybackControls(),
        const SizedBox(height: 12),
        // 进度指示点
        _buildProgressDots(),
        const SizedBox(height: 16),
        // 完成按钮或已完成状态
        _buildCompleteSection(),
      ],
    );
  }

  // ==================== 空状态 ====================
  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.movie_outlined,
              size: 56,
              color: AppTheme.textSecondary.withOpacity(0.4),
            ),
            const SizedBox(height: 12),
            const Text(
              '暂无动画内容',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: AppTheme.textColor,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '学习内容正在准备中...',
              style: TextStyle(
                fontSize: 13,
                color: AppTheme.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ==================== 点击开始覆盖层 ====================
  Widget _buildTapToStartOverlay() {
    final firstScene = widget.scenes.first;
    return GestureDetector(
      onTap: _startPlayback,
      child: Container(
        height: 240,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              AppTheme.primaryColor.withOpacity(0.15),
              AppTheme.secondaryColor.withOpacity(0.1),
            ],
          ),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(
            color: AppTheme.primaryColor.withOpacity(0.2),
            width: 1.5,
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppTheme.primaryColor.withOpacity(0.15),
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
              '点击开始播放动画',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: AppTheme.textColor,
              ),
            ),
            if (firstScene.onScreenText.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                firstScene.onScreenText,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.textColor,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  // ==================== 场景画布 ====================
  Widget _buildSceneCanvas(AnimationScene scene) {
    final bgColor = _parseBackgroundColor(scene.background);

    return ClipRRect(
      borderRadius: BorderRadius.circular(24),
      child: Container(
        height: 300,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              bgColor,
              bgColor.withOpacity(0.6),
              AppTheme.backgroundColor,
            ],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
          boxShadow: [
            BoxShadow(
              color: bgColor.withOpacity(0.2),
              blurRadius: 16,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Stack(
          children: [
            // 场景内容（带切换动画）
            FadeTransition(
              opacity: _fadeAnimation,
              child: SlideTransition(
                position: _slideAnimation,
                child: _buildSceneContent(scene),
              ),
            ),
            // 右上角暂停/播放浮动按钮
            Positioned(
              top: 12,
              right: 12,
              child: GestureDetector(
                onTap: _togglePlayPause,
                child: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.black.withOpacity(0.3),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    _isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded,
                    color: Colors.white,
                    size: 22,
                  ),
                ),
              ),
            ),
            // 底部旁白文字区域
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: _buildNarrationBar(scene),
            ),
          ],
        ),
      ),
    );
  }

  // ==================== 场景内容渲染 ====================
  Widget _buildSceneContent(AnimationScene scene) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 50, 20, 80),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // 角色展示
          _buildCharacterDisplay(scene),
          const SizedBox(height: 20),
          // 屏幕文字（大字标题）
          if (scene.onScreenText.isNotEmpty)
            Text(
              scene.onScreenText,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w900,
                color: AppTheme.textColor,
                height: 1.2,
              ),
            ),
        ],
      ),
    );
  }

  /// 角色展示：emoji 或图片
  Widget _buildCharacterDisplay(AnimationScene scene) {
    // 优先显示图片
    if (scene.imageUrl != null && scene.imageUrl!.isNotEmpty) {
      return Container(
        width: 100,
        height: 100,
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.6),
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.08),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: ClipOval(
          child: Image.network(
            scene.imageUrl!,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => _buildCharacterEmoji(scene),
            loadingBuilder: (context, child, progress) {
              if (progress == null) return child;
              return SizedBox(
                width: 40,
                height: 40,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  valueColor: AlwaysStoppedAnimation(AppTheme.primaryColor),
                ),
              );
            },
          ),
        ),
      );
    }

    // 否则显示 emoji
    return _buildCharacterEmoji(scene);
  }

  Widget _buildCharacterEmoji(AnimationScene scene) {
    final isEmoji = _isEmoji(scene.character);
    return Container(
      width: 90,
      height: 90,
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.6),
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.06),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Center(
        child: isEmoji
            ? Text(scene.character, style: const TextStyle(fontSize: 52))
            : Text(
                scene.character.isNotEmpty ? scene.character[0].toUpperCase() : '?',
                style: TextStyle(
                  fontSize: 40,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.primaryColor,
                ),
              ),
      ),
    );
  }

  // ==================== 旁白文字条 ====================
  Widget _buildNarrationBar(AnimationScene scene) {
    if (scene.narration.isEmpty) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.92),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 8,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 旁白标识
          Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: AppTheme.primaryColor.withOpacity(0.12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(
              Icons.record_voice_over_rounded,
              size: 18,
              color: AppTheme.primaryColor,
            ),
          ),
          const SizedBox(width: 10),
          // 旁白文字
          Expanded(
            child: Text(
              scene.narration,
              style: const TextStyle(
                fontSize: 15,
                color: AppTheme.textColor,
                height: 1.4,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  // ==================== 播放控制栏 ====================
  Widget _buildPlaybackControls() {
    final hasPrev = _currentIndex > 0;
    final hasNext = _currentIndex < widget.scenes.length - 1;

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        // 上一场景
        _buildControlButton(
          icon: Icons.skip_previous_rounded,
          label: '上一场景',
          enabled: hasPrev,
          onTap: _prevScene,
        ),
        const SizedBox(width: 16),
        // 播放/暂停
        _buildControlButton(
          icon: _isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded,
          label: _isPlaying ? '暂停' : '播放',
          enabled: true,
          onTap: _togglePlayPause,
          isPrimary: true,
        ),
        const SizedBox(width: 16),
        // 下一场景
        _buildControlButton(
          icon: Icons.skip_next_rounded,
          label: '下一场景',
          enabled: hasNext,
          onTap: _nextScene,
        ),
      ],
    );
  }

  Widget _buildControlButton({
    required IconData icon,
    required String label,
    required bool enabled,
    required VoidCallback onTap,
    bool isPrimary = false,
  }) {
    final size = isPrimary ? 52.0 : 44.0;
    return GestureDetector(
      onTap: enabled ? onTap : null,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: isPrimary
              ? AppTheme.primaryColor
              : Colors.grey.shade100,
          shape: BoxShape.circle,
          boxShadow: isPrimary
              ? [
                  BoxShadow(
                    color: AppTheme.primaryColor.withOpacity(0.3),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ]
              : null,
        ),
        child: Icon(
          icon,
          color: isPrimary
              ? Colors.white
              : enabled
                  ? AppTheme.textColor
                  : AppTheme.textSecondary.withOpacity(0.4),
          size: isPrimary ? 28 : 24,
        ),
      ),
    );
  }

  // ==================== 进度指示点 ====================
  Widget _buildProgressDots() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(widget.scenes.length, (index) {
        final isCurrent = index == _currentIndex;
        final isPast = index < _currentIndex;

        return AnimatedContainer(
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeInOut,
          margin: const EdgeInsets.symmetric(horizontal: 3),
          width: isCurrent ? 24 : 6,
          height: 6,
          decoration: BoxDecoration(
            color: isCurrent
                ? AppTheme.primaryColor
                : isPast
                    ? AppTheme.primaryColor.withOpacity(0.4)
                    : Colors.grey.shade200,
            borderRadius: BorderRadius.circular(3),
          ),
        );
      }),
    );
  }

  // ==================== 完成区域 ====================
  Widget _buildCompleteSection() {
    // 已完成（外部状态）
    if (widget.isCompleted) {
      return Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.check_circle_rounded, size: 18, color: AppTheme.primaryColor),
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

    // 全部看完 → 显示完成按钮
    if (_allWatched || _currentIndex >= widget.scenes.length - 1) {
      return SizedBox(
        width: double.infinity,
        height: 52,
        child: ElevatedButton.icon(
          onPressed: () => widget.onComplete?.call(_allWatched ? 95 : 85),
          icon: const Icon(Icons.check_rounded, size: 20),
          label: const Text(
            '看完了，进入下一步',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppTheme.primaryColor,
            foregroundColor: Colors.white,
            elevation: 2,
            shadowColor: AppTheme.primaryColor.withOpacity(0.3),
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
