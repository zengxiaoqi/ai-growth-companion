import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import 'lesson_scene_models.dart';

/// 场景渲染器
///
/// 渲染单个课程场景的视觉效果，支持：
/// - 多种背景类型 (day/night/indoor/seasonal/abstract)
/// - 角色 (characters)、道具 (items)、特效 (effects)
/// - 模板动画 (templateId + templateParams)
/// - 旁白 (narration) 和屏幕文字 (onScreenText)
class SceneRenderer extends StatelessWidget {
  final LessonScene scene;
  final bool isPlaying;

  const SceneRenderer({
    super.key,
    required this.scene,
    this.isPlaying = true,
  });

  /// 根据背景类型返回渐变色
  LinearGradient _backgroundGradient(BackgroundType type) {
    switch (type) {
      case BackgroundType.night:
        return const LinearGradient(
          colors: [
            Color(0xFF0F172A),
            Color(0xFF0C1E3A),
            Color(0xFF1E293B),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        );
      case BackgroundType.indoor:
        return const LinearGradient(
          colors: [
            Color(0xFFFFF8E1),
            Color(0xFFFFFDE7),
            Color(0xFFFFF3E0),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        );
      case BackgroundType.seasonal:
        return const LinearGradient(
          colors: [
            Color(0xFFD1FAE5),
            Color(0xFFDBEAFE),
            Color(0xFFFEF3C7),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        );
      case BackgroundType.abstract:
        return LinearGradient(
          colors: [
            AppTheme.primaryColor.withOpacity(0.15),
            AppTheme.secondaryColor.withOpacity(0.12),
            AppTheme.softPurple.withOpacity(0.1),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        );
      case BackgroundType.day:
      default:
        return const LinearGradient(
          colors: [
            Color(0xFFE0F2FE),
            Color(0xFFECFEFF),
            Color(0xFFF0FDF4),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        );
    }
  }

  /// 文字颜色（根据背景类型）
  Color _textColor(BackgroundType type) {
    switch (type) {
      case BackgroundType.night:
        return Colors.white;
      case BackgroundType.indoor:
        return const Color(0xFF422006);
      default:
        return const Color(0xFF0F172A);
    }
  }

  @override
  Widget build(BuildContext context) {
    final visual = scene.visual;
    final bgType = visual?.background?.type ?? BackgroundType.day;
    final themeColor = visual?.background?.themeColor;
    final textColor = _textColor(bgType);

    // 如果有模板ID，使用模板渲染（占位）
    if (visual?.templateId != null) {
      return _buildTemplateRenderer(bgType, themeColor, textColor);
    }

    // 标准场景渲染
    return Container(
      decoration: BoxDecoration(
        gradient: themeColor != null
            ? LinearGradient(
                colors: [
                  themeColor,
                  themeColor.withOpacity(0.6),
                  themeColor.withOpacity(0.3),
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              )
            : _backgroundGradient(bgType),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: Colors.black.withOpacity(0.05),
          width: 1,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          // 装饰光效
          _buildLightEffects(),
          // 场景内容
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                // 顶部：标题 + 屏幕文字 + 特效
                _buildTopSection(textColor),
                // 中间：旁白
                if (scene.narration.isNotEmpty)
                  _buildNarration(textColor),
                // 底部：角色 + 道具
                _buildBottomSection(textColor),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// 模板渲染（占位，后续对接 AnimationRenderer）
  Widget _buildTemplateRenderer(
    BackgroundType bgType,
    Color? themeColor,
    Color textColor,
  ) {
    return Container(
      decoration: BoxDecoration(
        gradient: themeColor != null
            ? LinearGradient(
                colors: [
                  themeColor,
                  themeColor.withOpacity(0.6),
                ],
              )
            : _backgroundGradient(bgType),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.auto_awesome_rounded,
              size: 48,
              color: textColor.withOpacity(0.6),
            ),
            const SizedBox(height: 12),
            Text(
              scene.onScreenText ?? scene.visual?.caption ?? scene.title,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w900,
                color: textColor,
              ),
            ),
            if (scene.narration.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(
                scene.narration,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 14,
                  color: textColor.withOpacity(0.85),
                  height: 1.5,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// 装饰光效（模糊圆形光斑）
  Widget _buildLightEffects() {
    return Positioned.fill(
      child: Opacity(
        opacity: 0.4,
        child: Stack(
          children: [
            Positioned(
              top: -32,
              right: 32,
              child: Container(
                width: 96,
                height: 96,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withOpacity(0.3),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.white.withOpacity(0.3),
                      blurRadius: 40,
                      spreadRadius: 10,
                    ),
                  ],
                ),
              ),
            ),
            Positioned(
              bottom: 0,
              left: 0,
              child: Container(
                width: 112,
                height: 112,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withOpacity(0.2),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.white.withOpacity(0.2),
                      blurRadius: 40,
                      spreadRadius: 10,
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

  /// 顶部区域：场景标题 + 屏幕文字 + 特效标签
  Widget _buildTopSection(Color textColor) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                scene.title.toUpperCase(),
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 2,
                  color: textColor.withOpacity(0.7),
                ),
              ),
              if (scene.onScreenText?.isNotEmpty == true ||
                  scene.visual?.caption?.isNotEmpty == true) ...[
                const SizedBox(height: 6),
                Text(
                  scene.onScreenText ?? scene.visual?.caption ?? '',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w900,
                    color: textColor,
                    height: 1.2,
                  ),
                ),
              ],
            ],
          ),
        ),
        // 特效标签
        if (scene.visual?.effects.isNotEmpty == true) ...[
          const SizedBox(width: 8),
          Wrap(
            spacing: 6,
            runSpacing: 4,
            alignment: WrapAlignment.end,
            children: scene.visual!.effects.take(3).map((effect) {
              return Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.35),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  effect,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: textColor,
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ],
    );
  }

  /// 旁白文字
  Widget _buildNarration(Color textColor) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 400),
        child: Text(
          scene.narration,
          style: TextStyle(
            fontSize: 14,
            color: textColor.withOpacity(0.85),
            height: 1.5,
          ),
        ),
      ),
    );
  }

  /// 底部区域：角色 + 道具
  Widget _buildBottomSection(Color textColor) {
    final characters = scene.visual?.characters ?? [];
    final items = scene.visual?.items ?? [];

    if (characters.isEmpty && items.isEmpty) {
      return const SizedBox.shrink();
    }

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        // 角色列表
        if (characters.isNotEmpty)
          Wrap(
            spacing: 10,
            runSpacing: 8,
            children: characters.map((character) {
              return _buildCharacterCard(character, textColor);
            }).toList(),
          ),
        // 道具列表
        if (items.isNotEmpty)
          Wrap(
            spacing: 6,
            runSpacing: 4,
            alignment: WrapAlignment.end,
            children: items.map((item) {
              return Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  border: Border.all(
                    color: Colors.white.withOpacity(0.35),
                    width: 1,
                  ),
                  color: Colors.white.withOpacity(0.25),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Text(
                  item.label,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: textColor.withOpacity(0.9),
                  ),
                ),
              );
            }).toList(),
          ),
      ],
    );
  }

  /// 角色卡片
  Widget _buildCharacterCard(SceneCharacter character, Color textColor) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.4),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          // 角色头像
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.7),
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Text(
                character.label.isNotEmpty
                    ? character.label[0]
                    : '?',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w900,
                  color: character.color ?? textColor,
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          // 角色信息
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  character.label,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: textColor,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
                if (character.pose?.isNotEmpty == true ||
                    character.mood?.isNotEmpty == true) ...[
                  Text(
                    character.pose ?? character.mood ?? '',
                    style: TextStyle(
                      fontSize: 11,
                      color: textColor.withOpacity(0.7),
                    ),
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
}

