import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../theme/app_theme.dart';

/// 任务卡片组件 - 用于打卡任务列表
/// 
/// 显示一个可点击的任务卡片，包含图标、标题、副标题和状态
/// 支持完成状态、按压缩放动画和勾选标记动画
/// 
/// 用法示例：
/// ```dart
/// TaskCard(
///   title: '起床洗漱',
///   subtitle: '+2 积分',
///   icon: Icons.wb_sunny_rounded,
///   isCompleted: false,
///   onTap: () => _onCheckIn(),
/// )
/// ```
class TaskCard extends StatefulWidget {
  /// 任务标题
  final String title;

  /// 副标题（通常显示积分）
  final String subtitle;

  /// 图标（IconData 模式，与 emoji/iconImage 互斥）
  final IconData? icon;

  /// emoji 文本（与 icon 互斥，优先级低于 iconImage）
  final String? emoji;

  /// 自定义图标图片 URL（优先级最高）
  final String? iconImage;

  /// 图标背景颜色
  final Color? iconColor;

  /// 是否已完成
  final bool isCompleted;

  /// 点击回调
  final VoidCallback? onTap;

  /// 长按回调（可选）
  final VoidCallback? onLongPress;

  const TaskCard({
    super.key,
    required this.title,
    required this.subtitle,
    this.icon,
    this.emoji,
    this.iconImage,
    this.iconColor,
    this.isCompleted = false,
    this.onTap,
    this.onLongPress,
  }) : assert(icon != null || emoji != null,
           'Either icon or emoji must be provided');

  @override
  State<TaskCard> createState() => _TaskCardState();
}

class _TaskCardState extends State<TaskCard>
    with SingleTickerProviderStateMixin {
  late AnimationController _scaleController;
  late Animation<double> _scaleAnimation;

  @override
  void initState() {
    super.initState();
    _scaleController = AnimationController(
      duration: const Duration(milliseconds: 150),
      vsync: this,
    );
    _scaleAnimation = Tween<double>(begin: 1.0, end: 0.97).animate(
      CurvedAnimation(
        parent: _scaleController,
        curve: Curves.easeOutCubic,
        reverseCurve: Curves.easeInCubic,
      ),
    );
  }

  @override
  void dispose() {
    _scaleController.dispose();
    super.dispose();
  }

  void _onTapDown(TapDownDetails details) {
    if (widget.onTap != null) {
      _scaleController.forward();
    }
  }

  void _onTapUp(TapUpDetails details) {
    if (widget.onTap != null) {
      _scaleController.reverse();
      widget.onTap?.call();
    }
  }

  void _onTapCancel() {
    _scaleController.reverse();
  }

  @override
  Widget build(BuildContext context) {
    final iconColor = widget.iconColor ?? AppTheme.primaryColor;
    final isEnabled = widget.onTap != null && !widget.isCompleted;
    
    return GestureDetector(
      onTapDown: _onTapDown,
      onTapUp: _onTapUp,
      onTapCancel: _onTapCancel,
      onLongPress: widget.onLongPress,
      child: AnimatedBuilder(
        animation: _scaleAnimation,
        builder: (context, child) {
          return Transform.scale(
            scale: isEnabled ? _scaleAnimation.value : 1.0,
            child: child,
          );
        },
        child: Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(AppTheme.cardRadius),
            boxShadow: AppTheme.subtleShadow(),
          ),
          child: Row(
            children: [
              // 图标容器
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: iconColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: _buildIcon(iconColor),
              ),
              
              const SizedBox(width: 16),
              
              // 标题和副标题
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.title,
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: widget.isCompleted
                            ? AppTheme.textSecondary
                            : AppTheme.textColor,
                        height: 1.3,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      widget.subtitle,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: widget.isCompleted
                            ? AppTheme.textSecondary.withValues(alpha: 0.7)
                            : AppTheme.successColor,
                        height: 1.3,
                      ),
                    ),
                  ],
                ),
              ),
              
              // 状态指示器
              _buildStatusIndicator(),
            ],
          ),
        ),
      ),
    );
  }

  /// 构建图标内容：优先显示自定义图片，其次 emoji，最后 IconData
  Widget _buildIcon(Color iconColor) {
    // 优先显示自定义图片
    if (widget.iconImage != null && widget.iconImage!.isNotEmpty) {
      final url = widget.iconImage!;
      final fullUrl = url.startsWith('http')
          ? url
          : 'https://lingxi.chataifree.eu.org/api$url';
      return ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: CachedNetworkImage(
          imageUrl: fullUrl,
          fit: BoxFit.cover,
          width: 48,
          height: 48,
          errorWidget: (context, url, error) => _buildEmojiOrIcon(iconColor),
        ),
      );
    }
    return _buildEmojiOrIcon(iconColor);
  }

  Widget _buildEmojiOrIcon(Color iconColor) {
    if (widget.emoji != null) {
      return Center(
        child: Text(
          widget.emoji!,
          style: const TextStyle(fontSize: 24),
        ),
      );
    }
    return Icon(
      widget.icon,
      color: iconColor,
      size: AppTheme.iconMd,
    );
  }

  Widget _buildStatusIndicator() {
    if (widget.isCompleted) {
      // 已完成状态 - 显示勾选标记
      return Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          color: AppTheme.successColor.withValues(alpha: 0.15),
          shape: BoxShape.circle,
        ),
        child: const Icon(
          Icons.check_rounded,
          color: AppTheme.successColor,
          size: 20,
        ),
      );
    } else if (widget.onTap != null) {
      // 未完成状态 - 显示打卡按钮
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          gradient: AppTheme.successGradient,
          borderRadius: BorderRadius.circular(20),
          boxShadow: AppTheme.softShadow(AppTheme.successColor),
        ),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.add_circle_rounded,
              color: Colors.white,
              size: 18,
            ),
            SizedBox(width: 4),
            Text(
              '打卡',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
          ],
        ),
      );
    } else {
      // 禁用状态 - 显示空心圆
      return Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          border: Border.all(
            color: AppTheme.disabledColor,
            width: 2,
          ),
          shape: BoxShape.circle,
        ),
      );
    }
  }
}

/// 带动画进入效果的任务卡片
class AnimatedTaskCard extends StatefulWidget {
  final String title;
  final String subtitle;
  final IconData? icon;
  final String? emoji;
  final String? iconImage;
  final Color? iconColor;
  final bool isCompleted;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final int index;

  const AnimatedTaskCard({
    super.key,
    required this.title,
    required this.subtitle,
    this.icon,
    this.emoji,
    this.iconImage,
    this.iconColor,
    this.isCompleted = false,
    this.onTap,
    this.onLongPress,
    this.index = 0,
  }) : assert(icon != null || emoji != null,
           'Either icon or emoji must be provided');

  @override
  State<AnimatedTaskCard> createState() => _AnimatedTaskCardState();
}

class _AnimatedTaskCardState extends State<AnimatedTaskCard>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fadeAnimation;
  late Animation<Offset> _slideAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 400),
      vsync: this,
    );
    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: Curves.easeOut,
      ),
    );
    _slideAnimation = Tween<Offset>(
      begin: const Offset(0.2, 0),
      end: Offset.zero,
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: Curves.easeOut,
      ),
    );
    
    // 延迟启动动画，实现交错进入效果
    Future.delayed(Duration(milliseconds: widget.index * 80), () {
      if (mounted) {
        _controller.forward();
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SlideTransition(
      position: _slideAnimation,
      child: FadeTransition(
        opacity: _fadeAnimation,
        child: TaskCard(
          title: widget.title,
          subtitle: widget.subtitle,
          icon: widget.icon,
          emoji: widget.emoji,
          iconImage: widget.iconImage,
          iconColor: widget.iconColor,
          isCompleted: widget.isCompleted,
          onTap: widget.onTap,
          onLongPress: widget.onLongPress,
        ),
      ),
    );
  }
}
