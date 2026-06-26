import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// 渐变按钮组件 - 带有渐变背景、图标和按压效果
/// 
/// 支持：
/// - 渐变背景（可自定义）
/// - 前置图标
/// - 按压缩放动画
/// - 涟漪效果
/// - 加载状态
/// 
/// 用法示例：
/// ```dart
/// GradientButton(
///   text: '确认',
///   onPressed: () => {},
///   icon: Icons.check,
///   gradient: AppTheme.primaryGradient,
/// )
/// ```
class GradientButton extends StatefulWidget {
  /// 按钮文本
  final String text;
  
  /// 点击回调
  final VoidCallback? onPressed;
  
  /// 渐变背景（默认使用 primaryGradient）
  final LinearGradient? gradient;
  
  /// 前置图标（可选）
  final IconData? icon;
  
  /// 文字颜色（默认白色）
  final Color textColor;
  
  /// 内边距
  final EdgeInsets padding;
  
  /// 圆角
  final double borderRadius;
  
  /// 是否禁用
  final bool disabled;
  
  /// 是否加载中
  final bool loading;
  
  /// 最小宽度（可选）
  final double? minWidth;
  
  /// 高度
  final double height;

  const GradientButton({
    super.key,
    required this.text,
    this.onPressed,
    this.gradient,
    this.icon,
    this.textColor = Colors.white,
    this.padding = const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
    this.borderRadius = AppTheme.buttonRadius,
    this.disabled = false,
    this.loading = false,
    this.minWidth,
    this.height = 48,
  });

  @override
  State<GradientButton> createState() => _GradientButtonState();
}

class _GradientButtonState extends State<GradientButton>
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
    _scaleAnimation = Tween<double>(begin: 1.0, end: 0.96).animate(
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
    if (!widget.disabled && !widget.loading) {
      _scaleController.forward();
    }
  }

  void _onTapUp(TapUpDetails details) {
    if (!widget.disabled && !widget.loading) {
      _scaleController.reverse();
      widget.onPressed?.call();
    }
  }

  void _onTapCancel() {
    _scaleController.reverse();
  }

  @override
  Widget build(BuildContext context) {
    final isEnabled = !widget.disabled && !widget.loading;
    final gradient = widget.gradient ?? AppTheme.primaryGradient;
    
    return GestureDetector(
      onTapDown: _onTapDown,
      onTapUp: _onTapUp,
      onTapCancel: _onTapCancel,
      child: AnimatedBuilder(
        animation: _scaleAnimation,
        builder: (context, child) {
          return Transform.scale(
            scale: isEnabled ? _scaleAnimation.value : 1.0,
            child: child,
          );
        },
        child: Container(
          constraints: widget.minWidth != null
              ? BoxConstraints(minWidth: widget.minWidth!)
              : null,
          height: widget.height,
          padding: widget.padding,
          decoration: BoxDecoration(
            gradient: isEnabled ? gradient : null,
            color: isEnabled ? null : AppTheme.disabledColor,
            borderRadius: BorderRadius.circular(widget.borderRadius),
            boxShadow: isEnabled ? AppTheme.softShadow(gradient.colors.first) : null,
          ),
          child: Center(
            child: widget.loading
                ? SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor: AlwaysStoppedAnimation<Color>(widget.textColor),
                    ),
                  )
                : Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (widget.icon != null) ...[
                        Icon(
                          widget.icon,
                          color: widget.textColor,
                          size: AppTheme.iconMd,
                        ),
                        const SizedBox(width: 8),
                      ],
                      Text(
                        widget.text,
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: widget.textColor,
                          height: 1.2,
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}

/// 轮廓按钮 - 带有边框的按钮（用于次要操作）
class OutlineButton extends StatefulWidget {
  final String text;
  final VoidCallback? onPressed;
  final IconData? icon;
  final Color borderColor;
  final Color textColor;
  final Color? backgroundColor;
  final EdgeInsets padding;
  final double borderRadius;
  final bool disabled;

  const OutlineButton({
    super.key,
    required this.text,
    this.onPressed,
    this.icon,
    this.borderColor = AppTheme.primaryColor,
    this.textColor = AppTheme.primaryColor,
    this.backgroundColor,
    this.padding = const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
    this.borderRadius = AppTheme.buttonRadius,
    this.disabled = false,
  });

  @override
  State<OutlineButton> createState() => _OutlineButtonState();
}

class _OutlineButtonState extends State<OutlineButton>
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
    _scaleAnimation = Tween<double>(begin: 1.0, end: 0.96).animate(
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
    if (!widget.disabled) {
      _scaleController.forward();
    }
  }

  void _onTapUp(TapUpDetails details) {
    if (!widget.disabled) {
      _scaleController.reverse();
      widget.onPressed?.call();
    }
  }

  void _onTapCancel() {
    _scaleController.reverse();
  }

  @override
  Widget build(BuildContext context) {
    final isEnabled = !widget.disabled;
    
    return GestureDetector(
      onTapDown: _onTapDown,
      onTapUp: _onTapUp,
      onTapCancel: _onTapCancel,
      child: AnimatedBuilder(
        animation: _scaleAnimation,
        builder: (context, child) {
          return Transform.scale(
            scale: isEnabled ? _scaleAnimation.value : 1.0,
            child: child,
          );
        },
        child: Container(
          padding: widget.padding,
          decoration: BoxDecoration(
            color: widget.backgroundColor,
            borderRadius: BorderRadius.circular(widget.borderRadius),
            border: Border.all(
              color: isEnabled ? widget.borderColor : AppTheme.disabledColor,
              width: 1.5,
            ),
          ),
          child: Center(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (widget.icon != null) ...[
                  Icon(
                    widget.icon,
                    color: isEnabled ? widget.textColor : AppTheme.disabledColor,
                    size: AppTheme.iconMd,
                  ),
                  const SizedBox(width: 8),
                ],
                Text(
                  widget.text,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: isEnabled ? widget.textColor : AppTheme.disabledColor,
                    height: 1.2,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
