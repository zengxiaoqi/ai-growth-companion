import 'package:flutter/material.dart';

/// Utility widgets and helpers for reusable micro-animations.
///
/// Every animation here follows flutter-ui-ux performance rules:
/// - [AnimatedBuilder] always receives a `child` parameter so the
///   subtree is built once and reused across frames.
/// - Durations stay within 200–350ms (the skill's recommended range
///   for fade/slide/scale micro-interactions).
/// - Curves are chosen for perceived smoothness — [Curves.easeInOut]
///   for general use, [Curves.easeOutBack] for playful bounce.

// ──────────────────────────────────────────────────────────────────────────
// PressAnimation
// ──────────────────────────────────────────────────────────────────────────

/// Configuration for [PressAnimation].
class PressAnimationConfig {
  /// Total duration of the press/release animation.
  final Duration duration;

  /// Easing curve applied to the scale tween.
  final Curve curve;

  /// Target scale when pressed (e.g. 0.95 = 95% of original size).
  final double pressedScale;

  const PressAnimationConfig({
    this.duration = const Duration(milliseconds: 150),
    this.curve = Curves.easeInOut,
    this.pressedScale = 0.95,
  });
}

/// A wrapper widget that applies a press-scale animation to any [child].
///
/// When the user presses down the child scales to
/// [PressAnimationConfig.pressedScale]; on release it springs back to
/// full size and fires [onTap].
///
/// This pattern is extracted from `_FunctionCard` in
/// `child_home_screen.dart` so every interactive surface in the app can
/// use the same press feedback.
///
/// ```dart
/// PressAnimation(
///   onTap: () => Navigator.pushNamed(context, '/settings'),
///   child: Card(child: ...),
/// )
/// ```
class PressAnimation extends StatefulWidget {
  /// The widget that receives the press animation.
  final Widget child;

  /// Called on tap-up (after the animation springs back).
  final VoidCallback? onTap;

  /// Called on long-press (after the animation springs back).
  final VoidCallback? onLongPress;

  /// Timing and curve parameters.
  final PressAnimationConfig config;

  const PressAnimation({
    super.key,
    required this.child,
    this.onTap,
    this.onLongPress,
    this.config = const PressAnimationConfig(),
  });

  @override
  State<PressAnimation> createState() => _PressAnimationState();
}

class _PressAnimationState extends State<PressAnimation>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: widget.config.duration,
      vsync: this,
    );
    _scaleAnimation = Tween<double>(
      begin: 1.0,
      end: widget.config.pressedScale,
    ).animate(
      CurvedAnimation(parent: _controller, curve: widget.config.curve),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onTapDown(TapDownDetails _) => _controller.forward();

  void _onTapUp(TapUpDetails _) {
    _controller.reverse();
    widget.onTap?.call();
  }

  void _onTapCancel() => _controller.reverse();

  void _onLongPress() {
    _controller.reverse();
    widget.onLongPress?.call();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: widget.onTap != null ? _onTapDown : null,
      onTapUp: widget.onTap != null ? _onTapUp : null,
      onTapCancel: widget.onTap != null ? _onTapCancel : null,
      onLongPress: widget.onLongPress != null ? _onLongPress : null,
      child: AnimatedBuilder(
        animation: _scaleAnimation,
        builder: (context, child) {
          return Transform.scale(
            scale: _scaleAnimation.value,
            child: child,
          );
        },
        // ✅ Child is built once — the AnimatedBuilder only rebuilds
        //    the Transform.scale wrapper on each frame.
        child: widget.child,
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────
// BounceIn
// ──────────────────────────────────────────────────────────────────────────

/// Configuration for [BounceIn].
class BounceInConfig {
  /// Total duration of the bounce-in animation.
  final Duration duration;

  /// Easing curve — [Curves.easeOutBack] gives the characteristic bounce.
  final Curve curve;

  /// Starting scale (e.g. 0.8 = 80% of final size).
  final double startScale;

  /// Starting vertical offset in logical pixels.
  final double startOffsetY;

  const BounceInConfig({
    this.duration = const Duration(milliseconds: 350),
    this.curve = Curves.easeOutBack,
    this.startScale = 0.8,
    this.startOffsetY = 20.0,
  });
}

/// A self-contained bounce-in entrance animation widget.
///
/// The child scales up from [BounceInConfig.startScale] while sliding
/// up from [BounceInConfig.startOffsetY], using [Curves.easeOutBack]
/// to create a playful overshoot effect.
///
/// By default the animation plays automatically on first build
/// (`autoStart: true`).
///
/// ```dart
/// BounceIn(
///   child: AchievementCard(title: '🏆 新成就！'),
/// )
/// ```
class BounceIn extends StatefulWidget {
  /// The widget to animate in.
  final Widget child;

  /// Timing and curve parameters.
  final BounceInConfig config;

  /// Whether to start the animation immediately on first build.
  final bool autoStart;

  const BounceIn({
    super.key,
    required this.child,
    this.config = const BounceInConfig(),
    this.autoStart = true,
  });

  @override
  State<BounceIn> createState() => _BounceInState();
}

class _BounceInState extends State<BounceIn>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  late Animation<double> _offsetAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: widget.config.duration,
      vsync: this,
    );

    _scaleAnimation = Tween<double>(
      begin: widget.config.startScale,
      end: 1.0,
    ).animate(CurvedAnimation(parent: _controller, curve: widget.config.curve));

    _offsetAnimation = Tween<double>(
      begin: widget.config.startOffsetY,
      end: 0.0,
    ).animate(CurvedAnimation(parent: _controller, curve: widget.config.curve));

    if (widget.autoStart) {
      _controller.forward();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  /// Re-trigger the bounce-in animation from the beginning.
  void play() => _controller.forward(from: 0.0);

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Transform.translate(
          offset: Offset(0, _offsetAnimation.value),
          child: Transform.scale(
            scale: _scaleAnimation.value,
            child: child,
          ),
        );
      },
      child: widget.child,
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────
// StaggeredListAnimation
// ──────────────────────────────────────────────────────────────────────────

/// Configuration for [StaggeredListAnimation].
class StaggeredListConfig {
  /// Total duration for the full cascade.
  final Duration totalDuration;

  /// Delay between successive item starts.
  final Duration staggerDelay;

  /// Curve applied to each individual item's interpolation.
  final Curve curve;

  /// Vertical distance each item slides up from (in logical pixels).
  final double startOffsetY;

  const StaggeredListConfig({
    this.totalDuration = const Duration(milliseconds: 600),
    this.staggerDelay = const Duration(milliseconds: 60),
    this.curve = Curves.easeOutCubic,
    this.startOffsetY = 30.0,
  });
}

/// A staggered list entrance animation.
///
/// Each [items] widget slides up and fades in with a cascading delay,
/// producing a "wave" entrance effect. The staggered timing is
/// calculated internally using [Interval]s based on
/// [StaggeredListConfig.totalDuration] and
/// [StaggeredListConfig.staggerDelay].
///
/// The animation starts automatically on first build.
///
/// ```dart
/// StaggeredListAnimation(
///   items: [
///     CourseCard(title: '数学'),
///     CourseCard(title: '英语'),
///     CourseCard(title: '科学'),
///   ],
/// )
/// ```
class StaggeredListAnimation extends StatefulWidget {
  /// The list of widgets to animate. Can be any mix of widgets.
  final List<Widget> items;

  /// Timing and curve parameters.
  final StaggeredListConfig config;

  const StaggeredListAnimation({
    super.key,
    required this.items,
    this.config = const StaggeredListConfig(),
  });

  @override
  State<StaggeredListAnimation> createState() =>
      _StaggeredListAnimationState();
}

class _StaggeredListAnimationState extends State<StaggeredListAnimation>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late List<Animation<double>> _animations;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: widget.config.totalDuration,
      vsync: this,
    );

    final itemCount = widget.items.length;
    final totalMs = widget.config.totalDuration.inMilliseconds;
    final staggerMs = widget.config.staggerDelay.inMilliseconds;

    _animations = List.generate(itemCount, (index) {
      final start = (index * staggerMs / totalMs).clamp(0.0, 1.0);
      final end = (start + 0.6).clamp(0.0, 1.0);

      return Tween<double>(begin: 0.0, end: 1.0).animate(
        CurvedAnimation(
          parent: _controller,
          curve: Interval(start, end, curve: widget.config.curve),
        ),
      );
    });

    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: List.generate(widget.items.length, (index) {
        return AnimatedBuilder(
          animation: _animations[index],
          builder: (context, child) {
            final value = _animations[index].value;
            return Transform.translate(
              offset: Offset(0, widget.config.startOffsetY * (1 - value)),
              child: Opacity(opacity: value, child: child),
            );
          },
          child: widget.items[index],
        );
      }),
    );
  }
}