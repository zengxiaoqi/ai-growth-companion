import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// 统一卡片组件，替代各屏幕中重复的 Container+decoration+BoxShadow 模式。
///
/// 支持：
/// - 纯色或渐变背景
/// - onTap 按压缩放动画（仿 _FunctionCard 交互模式）
/// - isLoading 骨架屏占位模式（使用 [ShimmerPlaceholder] 闪光效果）
/// - 自定义阴影、圆角、内边距
///
/// 基本用法：
/// ```dart
/// // 静态卡片
/// AppCard(
///   color: Colors.white,
///   boxShadow: AppTheme.softShadow(),
///   child: Text('卡片内容'),
/// )
///
/// // 可点击卡片（自动按压缩放）
/// AppCard(
///   gradient: AppTheme.primaryGradient,
///   boxShadow: AppTheme.glowShadow(),
///   onTap: () => Navigator.push(...),
///   child: Text('点击我'),
/// )
/// ```
class AppCard extends StatefulWidget {
  /// 卡片内容（[isLoading] 为 true 时作为骨架形状参考）
  final Widget child;

  /// 点击回调；不为 null 时启用按压缩放动画
  final VoidCallback? onTap;

  /// 渐变背景（优先于 [color]）
  final Gradient? gradient;

  /// 纯色背景
  final Color? color;

  /// 自定义阴影列表
  final List<BoxShadow>? boxShadow;

  /// 内边距（默认 all-16）
  final EdgeInsetsGeometry padding;

  /// 圆角（默认 [AppTheme.cardRadius]）
  final BorderRadiusGeometry borderRadius;

  /// 是否展示骨架屏加载占位
  final bool isLoading;

  /// 卡片宽度（默认自动）
  final double? width;

  /// 卡片高度（默认自动）
  final double? height;

  /// 外边距
  final EdgeInsetsGeometry margin;

  const AppCard({
    super.key,
    required this.child,
    this.onTap,
    this.gradient,
    this.color,
    this.boxShadow,
    this.padding = const EdgeInsets.all(16),
    this.borderRadius = const BorderRadius.all(Radius.circular(AppTheme.cardRadius)),
    this.isLoading = false,
    this.width,
    this.height,
    this.margin = EdgeInsets.zero,
  });

  @override
  State<AppCard> createState() => _AppCardState();
}

class _AppCardState extends State<AppCard> with SingleTickerProviderStateMixin {
  late final AnimationController _scaleController;
  late final Animation<double> _scaleAnimation;

  bool get _isInteractive => widget.onTap != null;

  @override
  void initState() {
    super.initState();
    _scaleController = AnimationController(
      duration: const Duration(milliseconds: 150),
      vsync: this,
    );
    _scaleAnimation = Tween<double>(begin: 1.0, end: 0.95).animate(
      CurvedAnimation(parent: _scaleController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _scaleController.dispose();
    super.dispose();
  }

  void _onTapDown(TapDownDetails details) {
    _scaleController.forward();
  }

  void _onTapUp(TapUpDetails details) {
    _scaleController.reverse();
    widget.onTap?.call();
  }

  void _onTapCancel() {
    _scaleController.reverse();
  }

  @override
  Widget build(BuildContext context) {
    final card = _buildCard();

    if (!_isInteractive) {
      return card;
    }

    return GestureDetector(
      onTapDown: _onTapDown,
      onTapUp: _onTapUp,
      onTapCancel: _onTapCancel,
      child: AnimatedBuilder(
        animation: _scaleAnimation,
        builder: (context, child) {
          return Transform.scale(
            scale: _scaleAnimation.value,
            child: child,
          );
        },
        child: card,
      ),
    );
  }

  Widget _buildCard() {
    final content = widget.isLoading
        ? ShimmerPlaceholder(
            borderRadius: widget.borderRadius,
            child: Container(
              padding: widget.padding,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: widget.borderRadius,
              ),
              child: widget.child,
            ),
          )
        : widget.child;

    return Container(
      width: widget.width,
      height: widget.height,
      margin: widget.margin,
      padding: widget.isLoading ? EdgeInsets.zero : widget.padding,
      decoration: BoxDecoration(
        gradient: widget.gradient,
        color: widget.gradient == null
            ? (widget.color ?? Colors.white)
            : null,
        borderRadius: widget.borderRadius,
        boxShadow: widget.boxShadow,
      ),
      clipBehavior: widget.isLoading ? Clip.antiAlias : Clip.none,
      child: content,
    );
  }
}

// ============================================================
//  ShimmerPlaceholder — 骨架屏闪光动画基类
// ============================================================

/// 给任意 child 添加从左到右滑动的闪光动画遮罩，实现骨架屏效果。
///
/// 不依赖任何第三方包，完全基于 Flutter 内置 AnimationController 实现。
///
/// 典型用法：配合灰色/白色占位形状使用
/// ```dart
/// ShimmerPlaceholder(
///   borderRadius: BorderRadius.circular(20),
///   child: Container(height: 100, color: Colors.white),
/// )
/// ```
class ShimmerPlaceholder extends StatefulWidget {
  /// 被闪光动画覆盖的子 widget（通常是灰色骨架形状）
  final Widget child;

  /// 闪光遮罩的圆角裁剪
  final BorderRadiusGeometry borderRadius;

  /// 高光颜色（默认白色半透明）
  final Color highlightColor;

  /// 底层骨架颜色（默认浅灰）
  final Color baseColor;

  const ShimmerPlaceholder({
    super.key,
    required this.child,
    this.borderRadius = const BorderRadius.all(Radius.circular(AppTheme.cardRadius)),
    this.highlightColor = const Color(0x33FFFFFF),
    this.baseColor = const Color(0xFFEBEBEB),
  });

  @override
  State<ShimmerPlaceholder> createState() => _ShimmerPlaceholderState();
}

class _ShimmerPlaceholderState extends State<ShimmerPlaceholder>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return ClipRRect(
          borderRadius: widget.borderRadius,
          child: Stack(
            children: [
              // 底层骨架色
              Positioned.fill(
                child: ColorFiltered(
                  colorFilter: ColorFilter.mode(
                    widget.baseColor,
                    BlendMode.srcATop,
                  ),
                  child: child!,
                ),
              ),

              // 滑动高光
              Positioned.fill(
                child: FractionallySizedBox(
                  widthFactor: 1.0,
                  child: Align(
                    alignment: Alignment(
                      -1.0 + (_controller.value * 2.0),
                      0.0,
                    ),
                    child: Container(
                      width: MediaQuery.of(context).size.width * 0.4,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [
                            widget.baseColor.withValues(alpha: 0.0),
                            widget.highlightColor,
                            widget.baseColor.withValues(alpha: 0.0),
                          ],
                          stops: const [0.0, 0.5, 1.0],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
      child: widget.child,
    );
  }
}