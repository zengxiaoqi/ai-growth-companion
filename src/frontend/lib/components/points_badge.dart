import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// 积分徽章组件 - 显示积分变化
/// 
/// 用于展示积分增减，带有颜色和动画效果
/// 正值显示绿色+号，负值显示红色-号
/// 
/// 用法示例：
/// ```dart
/// PointsBadge(
///   points: 5,
///   size: PointsBadgeSize.medium,
/// )
/// ```
class PointsBadge extends StatelessWidget {
  /// 积分值
  final int points;
  
  /// 尺寸
  final PointsBadgeSize size;
  
  /// 是否显示背景
  final bool showBackground;
  
  /// 自定义颜色（可选，默认根据正负自动选择）
  final Color? customColor;

  const PointsBadge({
    super.key,
    required this.points,
    this.size = PointsBadgeSize.medium,
    this.showBackground = true,
    this.customColor,
  });

  /// 获取积分文本（带+/-号）
  String get pointsText {
    if (points > 0) {
      return '+$points';
    } else if (points < 0) {
      return '$points';
    }
    return '0';
  }

  /// 获取颜色
  Color get _color {
    if (customColor != null) return customColor!;
    if (points > 0) return AppTheme.successColor;
    if (points < 0) return AppTheme.errorColor;
    return AppTheme.textSecondary;
  }

  /// 获取背景颜色
  Color get _backgroundColor {
    return _color.withValues(alpha: 0.15);
  }

  /// 获取字体大小
  double get _fontSize {
    switch (size) {
      case PointsBadgeSize.small:
        return 12;
      case PointsBadgeSize.medium:
        return 14;
      case PointsBadgeSize.large:
        return 16;
    }
  }

  /// 获取内边距
  EdgeInsets get _padding {
    switch (size) {
      case PointsBadgeSize.small:
        return const EdgeInsets.symmetric(horizontal: 8, vertical: 4);
      case PointsBadgeSize.medium:
        return const EdgeInsets.symmetric(horizontal: 10, vertical: 5);
      case PointsBadgeSize.large:
        return const EdgeInsets.symmetric(horizontal: 12, vertical: 6);
    }
  }

  /// 获取图标大小
  double get _iconSize {
    switch (size) {
      case PointsBadgeSize.small:
        return 12;
      case PointsBadgeSize.medium:
        return 14;
      case PointsBadgeSize.large:
        return 16;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: _padding,
      decoration: showBackground
          ? BoxDecoration(
              color: _backgroundColor,
              borderRadius: BorderRadius.circular(12),
            )
          : null,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            points > 0
                ? Icons.arrow_upward_rounded
                : points < 0
                    ? Icons.arrow_downward_rounded
                    : Icons.remove_rounded,
            color: _color,
            size: _iconSize,
          ),
          const SizedBox(width: 2),
          Text(
            pointsText,
            style: TextStyle(
              fontSize: _fontSize,
              fontWeight: FontWeight.w600,
              color: _color,
              height: 1.2,
            ),
          ),
        ],
      ),
    );
  }
}

/// 积分徽章尺寸
enum PointsBadgeSize {
  small,
  medium,
  large,
}

/// 带动画的积分徽章 - 数值变化时有弹跳效果
class AnimatedPointsBadge extends StatefulWidget {
  final int points;
  final PointsBadgeSize size;
  final bool showBackground;
  final Color? customColor;

  const AnimatedPointsBadge({
    super.key,
    required this.points,
    this.size = PointsBadgeSize.medium,
    this.showBackground = true,
    this.customColor,
  });

  @override
  State<AnimatedPointsBadge> createState() => _AnimatedPointsBadgeState();
}

class _AnimatedPointsBadgeState extends State<AnimatedPointsBadge>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 400),
      vsync: this,
    );
    _scaleAnimation = TweenSequence<double>([
      TweenSequenceItem(
        tween: Tween<double>(begin: 1.0, end: 1.2),
        weight: 50,
      ),
      TweenSequenceItem(
        tween: Tween<double>(begin: 1.2, end: 1.0),
        weight: 50,
      ),
    ]).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
  }

  @override
  void didUpdateWidget(AnimatedPointsBadge oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.points != widget.points) {
      _controller.forward(from: 0.0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _scaleAnimation,
      builder: (context, child) {
        return Transform.scale(
          scale: _scaleAnimation.value,
          child: child,
        );
      },
      child: PointsBadge(
        points: widget.points,
        size: widget.size,
        showBackground: widget.showBackground,
        customColor: widget.customColor,
      ),
    );
  }
}

/// 积分变化提示 - 浮动显示积分变化后消失
class PointsChangeIndicator extends StatefulWidget {
  final int points;
  final VoidCallback? onDismiss;

  const PointsChangeIndicator({
    super.key,
    required this.points,
    this.onDismiss,
  });

  @override
  State<PointsChangeIndicator> createState() => _PointsChangeIndicatorState();
}

class _PointsChangeIndicatorState extends State<PointsChangeIndicator>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fadeAnimation;
  late Animation<Offset> _slideAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    );
    _fadeAnimation = Tween<double>(
      begin: 0.0,
      end: 1.0,
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.0, 0.3, curve: Curves.easeOut),
        reverseCurve: const Interval(0.7, 1.0, curve: Curves.easeIn),
      ),
    );
    _slideAnimation = Tween<Offset>(
      begin: const Offset(0, 0.5),
      end: const Offset(0, -1.5),
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: Curves.easeOut,
      ),
    );
    _controller.forward();
    _controller.addStatusListener((status) {
      if (status == AnimationStatus.completed) {
        widget.onDismiss?.call();
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
    final color = widget.points > 0 ? AppTheme.successColor : AppTheme.errorColor;
    
    return SlideTransition(
      position: _slideAnimation,
      child: FadeTransition(
        opacity: _fadeAnimation,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(20),
            boxShadow: AppTheme.softShadow(color),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                widget.points > 0
                    ? Icons.add_rounded
                    : Icons.remove_rounded,
                color: Colors.white,
                size: 16,
              ),
              const SizedBox(width: 4),
              Text(
                '${widget.points > 0 ? '+' : ''}${widget.points} 积分',
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
