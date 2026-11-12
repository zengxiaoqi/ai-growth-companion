import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../theme/child_theme.dart';

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

  /// 文字颜色（为空时跟随当前皮肤主行动按钮的文字色）
  final Color? textColor;

  /// 内边距
  final EdgeInsets padding;

  /// 圆角（默认跟随当前皮肤 buttonRadius）
  final double? borderRadius;

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
    this.textColor,
    this.padding = const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
    this.borderRadius,
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
    final palette = ChildThemePalette.of(context);
    // 卡通皮肤（candy/forest/space）默认用本皮肤的主行动色渐变，
    // 否则蜜黄渐变会串到深色/绿色皮肤上；honey 保持原有绘本渐变。
    final gradient = widget.gradient ??
        (palette.isCartoon
            ? LinearGradient(
                colors: <Color>[palette.cta, palette.pop],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              )
            : AppTheme.primaryGradient);
    // 未显式指定文字色时跟随当前皮肤（context 版，不依赖全局同步）
    final inkColor = widget.textColor ?? palette.ctaInk;

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
            borderRadius: BorderRadius.circular(
                widget.borderRadius ?? AppTheme.buttonRadius),
            boxShadow:
                isEnabled ? AppTheme.softShadow(gradient.colors.first) : null,
          ),
          child: Center(
            child: widget.loading
                ? SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor: AlwaysStoppedAnimation<Color>(inkColor),
                    ),
                  )
                : Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (widget.icon != null) ...[
                        Icon(
                          widget.icon,
                          color: inkColor,
                          size: AppTheme.iconMd,
                        ),
                        const SizedBox(width: 8),
                      ],
                      Text(
                        widget.text,
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: inkColor,
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
  final Color? borderColor;
  final Color? textColor;
  final Color? backgroundColor;
  final EdgeInsets padding;
  final double? borderRadius;
  final bool disabled;

  const OutlineButton({
    super.key,
    required this.text,
    this.onPressed,
    this.icon,
    this.borderColor,
    this.textColor,
    this.backgroundColor,
    this.padding = const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
    this.borderRadius,
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
            borderRadius: BorderRadius.circular(
                widget.borderRadius ?? AppTheme.buttonRadius),
            border: Border.all(
              color: isEnabled
                  ? (widget.borderColor ?? AppTheme.primaryColor)
                  : AppTheme.disabledColor,
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
                    color: isEnabled
                        ? (widget.textColor ?? AppTheme.primaryColor)
                        : AppTheme.disabledColor,
                    size: AppTheme.iconMd,
                  ),
                  const SizedBox(width: 8),
                ],
                Text(
                  widget.text,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: isEnabled
                        ? (widget.textColor ?? AppTheme.primaryColor)
                        : AppTheme.disabledColor,
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
