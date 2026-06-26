import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// 统计卡片组件 - 用于积分概览区域
/// 
/// 显示一个带有图标、数值和标签的统计卡片
/// 支持自定义颜色、渐变和动画效果
/// 
/// 用法示例：
/// ```dart
/// StatCard(
///   label: '总积分',
///   value: '128',
///   icon: Icons.star_rounded,
///   color: Colors.white,
/// )
/// ```
class StatCard extends StatelessWidget {
  /// 标签文本（显示在底部）
  final String label;
  
  /// 数值文本（显示在中间）
  final String value;
  
  /// 图标
  final IconData icon;
  
  /// 图标和文字颜色
  final Color color;
  
  /// 卡片背景颜色（可选，默认半透明白色）
  final Color? backgroundColor;
  
  /// 是否显示图标背景圆圈
  final bool showIconBackground;
  
  /// 点击回调（可选）
  final VoidCallback? onTap;

  const StatCard({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
    this.backgroundColor,
    this.showIconBackground = true,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final bgColor = backgroundColor ?? Colors.white.withValues(alpha: 0.2);
    
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 12),
          decoration: BoxDecoration(
            color: bgColor,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // 图标
              if (showIconBackground)
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.3),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    icon,
                    color: color,
                    size: AppTheme.iconMd,
                  ),
                )
              else
                Icon(
                  icon,
                  color: color,
                  size: AppTheme.iconLg,
                ),
              
              const SizedBox(height: 8),
              
              // 数值
              Text(
                value,
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                  color: color,
                  height: 1.2,
                ),
              ),
              
              const SizedBox(height: 4),
              
              // 标签
              Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: color.withValues(alpha: 0.9),
                  height: 1.2,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 带动画效果的统计卡片 - 数值变化时有淡入效果
class AnimatedStatCard extends StatefulWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  final Color? backgroundColor;
  final bool showIconBackground;
  final VoidCallback? onTap;

  const AnimatedStatCard({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
    this.backgroundColor,
    this.showIconBackground = true,
    this.onTap,
  });

  @override
  State<AnimatedStatCard> createState() => _AnimatedStatCardState();
}

class _AnimatedStatCardState extends State<AnimatedStatCard>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fadeAnimation;
  String _previousValue = '';

  @override
  void initState() {
    super.initState();
    _previousValue = widget.value;
    _controller = AnimationController(
      duration: const Duration(milliseconds: 300),
      vsync: this,
    );
    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
  }

  @override
  void didUpdateWidget(AnimatedStatCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.value != widget.value) {
      _previousValue = oldWidget.value;
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
    return Expanded(
      child: GestureDetector(
        onTap: widget.onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 12),
          decoration: BoxDecoration(
            color: widget.backgroundColor ?? Colors.white.withValues(alpha: 0.2),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // 图标
              if (widget.showIconBackground)
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.3),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    widget.icon,
                    color: widget.color,
                    size: AppTheme.iconMd,
                  ),
                )
              else
                Icon(
                  widget.icon,
                  color: widget.color,
                  size: AppTheme.iconLg,
                ),
              
              const SizedBox(height: 8),
              
              // 带动画的数值
              AnimatedBuilder(
                animation: _fadeAnimation,
                builder: (context, child) {
                  return Opacity(
                    opacity: _fadeAnimation.value,
                    child: child,
                  );
                },
                child: Text(
                  widget.value,
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w700,
                    color: widget.color,
                    height: 1.2,
                  ),
                ),
              ),
              
              const SizedBox(height: 4),
              
              // 标签
              Text(
                widget.label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: widget.color.withValues(alpha: 0.9),
                  height: 1.2,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
