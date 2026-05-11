import 'package:flutter/material.dart';

/// A collection of page transition factories for consistent navigation animations.
///
/// Based on Material Design 3 transition patterns, adapted for the
/// 灵犀伴学 (Lingxi Learning Companion) app. All transitions use
/// [PageRouteBuilder] with durations following flutter-ui-ux skill
/// guidelines (200-350ms).
///
/// Transition guide:
/// - **fadeThrough** → authentication screens
/// - **slideFromRight** → child learning content, parent management
/// - **scaleFade** → AI Chat, focus-mode screens
/// - **sharedAxis** → sibling/peer screen switching
/// - **childFriendly** → games, animation players, interactive play

/// Standard transition duration: 300ms (aligned with flutter-ui-ux guidelines
/// for slide transitions).
const Duration _defaultDuration = Duration(milliseconds: 300);

/// Extended duration for child-friendly bouncy transitions.
const Duration _childFriendlyDuration = Duration(milliseconds: 350);

// ──────────────────────────────────────────────────────────────────────────
// Public transition factories
// ──────────────────────────────────────────────────────────────────────────

/// iOS-style slide-from-right navigation.
///
/// The incoming page slides in from the right edge of the screen.
/// The outgoing page is stationary underneath.
///
/// **Best for:** child learning content, parent management screens,
/// settings, and detail drill-downs.
///
/// ```dart
/// Navigator.push(context, slideFromRight((_) => MyScreen()));
/// ```
Route<T> slideFromRight<T>(
  WidgetBuilder builder, {
  RouteSettings? settings,
}) {
  return PageRouteBuilder<T>(
    settings: settings,
    transitionDuration: _defaultDuration,
    reverseTransitionDuration: _defaultDuration,
    pageBuilder: (context, animation, secondaryAnimation) => builder(context),
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      const begin = Offset(1.0, 0.0);
      const end = Offset.zero;
      const curve = Curves.easeInOut;

      return SlideTransition(
        position: Tween<Offset>(begin: begin, end: end).animate(
          CurvedAnimation(parent: animation, curve: curve),
        ),
        child: child,
      );
    },
  );
}

/// Material Design 3 fade-through transition.
///
/// The incoming page fades in from 0→1 opacity. Subtle and clean —
/// ideal when the destination feels like a distinct destination rather
/// than a sibling screen.
///
/// **Best for:** authentication flows (login → register → mode selection).
///
/// ```dart
/// Navigator.pushReplacement(context, fadeThrough((_) => LoginScreen()));
/// ```
Route<T> fadeThrough<T>(
  WidgetBuilder builder, {
  RouteSettings? settings,
}) {
  return PageRouteBuilder<T>(
    settings: settings,
    transitionDuration: _defaultDuration,
    reverseTransitionDuration: _defaultDuration,
    pageBuilder: (context, animation, secondaryAnimation) => builder(context),
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      return FadeTransition(
        opacity: CurvedAnimation(parent: animation, curve: Curves.easeInOut),
        child: child,
      );
    },
  );
}

/// Scale + fade combination transition.
///
/// The incoming page scales from 0.9→1.0 while fading in.
/// This is the existing pattern from [ChildHomeScreen]'s AI Chat card,
/// extracted for reuse across the app.
///
/// **Best for:** AI Chat, focus-mode screens.
///
/// ```dart
/// Navigator.push(context, scaleFade((_) => AIChatScreen()));
/// ```
Route<T> scaleFade<T>(
  WidgetBuilder builder, {
  RouteSettings? settings,
}) {
  return PageRouteBuilder<T>(
    settings: settings,
    transitionDuration: _defaultDuration,
    reverseTransitionDuration: _defaultDuration,
    pageBuilder: (context, animation, secondaryAnimation) => builder(context),
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      final curvedAnimation = CurvedAnimation(
        parent: animation,
        curve: Curves.easeInOut,
      );

      return ScaleTransition(
        scale: Tween<double>(begin: 0.9, end: 1.0).animate(curvedAnimation),
        child: FadeTransition(
          opacity: curvedAnimation,
          child: child,
        ),
      );
    },
  );
}

/// Shared-axis transition (Material Design 3 pattern).
///
/// Incoming page slides from the right while the outgoing page slides
/// to the left, both with a gentle fade. This creates a spatial
/// relationship between source and destination.
///
/// **Best for:** peer/sibling screens and tab-content switching.
///
/// ```dart
/// Navigator.push(context, sharedAxis((_) => DetailScreen()));
/// ```
Route<T> sharedAxis<T>(
  WidgetBuilder builder, {
  RouteSettings? settings,
}) {
  return PageRouteBuilder<T>(
    settings: settings,
    transitionDuration: _defaultDuration,
    reverseTransitionDuration: _defaultDuration,
    pageBuilder: (context, animation, secondaryAnimation) => builder(context),
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      const curve = Curves.fastOutSlowIn;

      final slideIn = Tween<Offset>(
        begin: const Offset(0.15, 0.0),
        end: Offset.zero,
      ).animate(CurvedAnimation(parent: animation, curve: curve));

      final fadeIn = Tween<double>(
        begin: 0.0,
        end: 1.0,
      ).animate(CurvedAnimation(parent: animation, curve: curve));

      return SlideTransition(
        position: slideIn,
        child: FadeTransition(
          opacity: fadeIn,
          child: child,
        ),
      );
    },
  );
}

/// Child-friendly bouncy scale + fade transition.
///
/// Uses [Curves.easeOutBack] for a playful overshoot/bounce effect.
/// The longer duration (350ms) gives time for the bounce to read
/// clearly. The fade is compressed into the first 70% of the
/// animation to avoid visual overlap with the overshoot.
///
/// **Best for:** games, animation players, interactive learning —
/// any screen that should feel fun and engaging for children.
///
/// ```dart
/// Navigator.push(context, childFriendly((_) => AnimationPlayer()));
/// ```
Route<T> childFriendly<T>(
  WidgetBuilder builder, {
  RouteSettings? settings,
}) {
  return PageRouteBuilder<T>(
    settings: settings,
    transitionDuration: _childFriendlyDuration,
    reverseTransitionDuration: _childFriendlyDuration,
    pageBuilder: (context, animation, secondaryAnimation) => builder(context),
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      final curvedAnimation = CurvedAnimation(
        parent: animation,
        curve: Curves.easeOutBack,
      );

      return ScaleTransition(
        scale: Tween<double>(begin: 0.8, end: 1.0).animate(curvedAnimation),
        child: FadeTransition(
          opacity: Tween<double>(begin: 0.0, end: 1.0).animate(
            CurvedAnimation(
              parent: animation,
              curve: const Interval(0.0, 0.7),
            ),
          ),
          child: child,
        ),
      );
    },
  );
}