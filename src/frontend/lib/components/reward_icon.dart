import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../theme/app_theme.dart';

/// 积分模块通用图标组件
///
/// 支持两种显示模式：
/// 1. 自定义上传图片（iconImage 不为空时）
/// 2. emoji 文本（默认）
///
/// 用法：
/// ```dart
/// RewardIcon(
///   emoji: '⭐',
///   iconImage: template.iconImage,
///   size: 48,
///   backgroundColor: AppTheme.primaryColor,
/// )
/// ```
class RewardIcon extends StatelessWidget {
  /// emoji 文本（当没有自定义图片时显示）
  final String emoji;

  /// 自定义图标图片 URL（不为空时优先显示）
  final String? iconImage;

  /// 图标尺寸
  final double size;

  /// 背景颜色
  final Color? backgroundColor;

  /// 圆角
  final double borderRadius;

  /// 是否显示背景容器
  final bool showBackground;

  const RewardIcon({
    super.key,
    required this.emoji,
    this.iconImage,
    this.size = 48,
    this.backgroundColor,
    this.borderRadius = 12,
    this.showBackground = true,
  });

  bool get hasCustomIcon => iconImage != null && iconImage!.isNotEmpty;

  /// 构建图片 URL（处理相对路径）
  String? get _imageUrl {
    if (!hasCustomIcon) return null;
    final url = iconImage!;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    // 相对路径，拼接 API base URL
    return 'https://lingxi.chataifree.eu.org/api$url';
  }

  @override
  Widget build(BuildContext context) {
    final bgColor = backgroundColor ?? AppTheme.primaryColor;

    if (showBackground) {
      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: bgColor.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(borderRadius),
        ),
        child: _buildIconContent(),
      );
    } else {
      return SizedBox(
        width: size,
        height: size,
        child: _buildIconContent(),
      );
    }
  }

  Widget _buildIconContent() {
    if (hasCustomIcon) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(borderRadius),
        child: CachedNetworkImage(
          imageUrl: _imageUrl!,
          fit: BoxFit.cover,
          width: size,
          height: size,
          placeholder: (context, url) => Center(
            child: SizedBox(
              width: size * 0.3,
              height: size * 0.3,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation<Color>(
                  backgroundColor ?? AppTheme.primaryColor,
                ),
              ),
            ),
          ),
          errorWidget: (context, url, error) => _buildEmoji(),
        ),
      );
    }
    return _buildEmoji();
  }

  Widget _buildEmoji() {
    return Center(
      child: Text(
        emoji,
        style: TextStyle(
          fontSize: size * 0.5,
        ),
      ),
    );
  }
}

/// 紧凑版图标 — 不带背景容器，用于卡片列表中等场景
class RewardIconCompact extends StatelessWidget {
  final String emoji;
  final String? iconImage;
  final double size;

  const RewardIconCompact({
    super.key,
    required this.emoji,
    this.iconImage,
    this.size = 32,
  });

  @override
  Widget build(BuildContext context) {
    return RewardIcon(
      emoji: emoji,
      iconImage: iconImage,
      size: size,
      showBackground: false,
    );
  }
}
