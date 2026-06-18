import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'theme/app_theme.dart';
import 'theme/page_transitions.dart';
import 'providers/user_provider.dart';
import 'screens/splash_screen.dart';
import 'screens/auth/login_screen.dart';
import 'screens/auth/register_screen.dart';
import 'screens/auth/mode_selection_screen.dart';
import 'screens/settings/settings_screen.dart';
import 'screens/child/child_home_screen.dart';
import 'screens/parent/parent_home_screen.dart';
import 'screens/parent/ability_radar_screen.dart';
import 'screens/parent/ability_trend_screen.dart';
import 'screens/parent/parental_controls_screen.dart';
import 'screens/parent/assignment_manager_screen.dart';
import 'screens/parent/course_pack_manager_screen.dart';
import 'screens/parent/growth_report_screen.dart';
import 'screens/parent/ai_insights_panel.dart';
import 'screens/parent/report_detail_screen.dart';
import 'screens/parent/lesson_generator_screen.dart';
import 'screens/parent/draft_manager_screen.dart';
import 'screens/parent/quick_video_generator_screen.dart';
import 'screens/child/emergency_call_screen.dart';
import 'screens/learning/animation_scene_player.dart';
import 'screens/learning/content_detail_screen.dart';
import 'screens/learning/structured_lesson_screen.dart';
import 'screens/learning/lesson_scene_player.dart';
import 'screens/learning/subject_content_list_screen.dart';
// AnimationScene 已在 animation_scene_player.dart 中导出

class LingxiApp extends StatelessWidget {
  const LingxiApp({super.key});

  /// 解析 childId：路由参数优先，fallback 到 UserProvider.activeChildId
  static int? _resolveChildId(BuildContext context, Map<String, dynamic>? args) {
    if (args != null && args.containsKey('childId')) {
      return args['childId'] as int?;
    }
    // Fallback: 从 Provider 获取 activeChildId
    try {
      final userProvider = Provider.of<UserProvider>(context, listen: false);
      return userProvider.activeChildId;
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '灵犀伴学',
      theme: AppTheme.lightTheme,
      debugShowCheckedModeBanner: false,
      // All routes use custom page transitions defined in
      // theme/page_transitions.dart.  See that file for the transition
      // assignment rationale.
      onGenerateRoute: (settings) {
        final args = settings.arguments as Map<String, dynamic>?;
        final childId = _resolveChildId(context, args);

        // Helper — wraps a builder with the chosen transition factory.
        Route<T> page<T>(
          WidgetBuilder builder,
          Route<T> Function(WidgetBuilder, {RouteSettings? settings}) transition,
        ) {
          return transition(builder, settings: settings);
        }

        switch (settings.name) {
          // ── Authentication → fadeThrough ──
          case '/login':
            return page((_) => const LoginScreen(), fadeThrough);
          case '/register':
            return page((_) => const RegisterScreen(), fadeThrough);
          case '/modeSelection':
            return page((_) => const ModeSelectionScreen(), fadeThrough);

          // ── Settings → slideFromRight ──
          case '/settings':
            return page((_) => const SettingsScreen(), slideFromRight);

          // ── Child shell → slideFromRight ──
          case '/child':
            return page((_) => const ChildHomeScreen(), slideFromRight);

          // ── Child emergency → slideFromRight ──
          case '/child/emergencyCall':
            return page(
              (_) => EmergencyCallScreen(childId: childId ?? 0),
              slideFromRight,
            );

          // ── Parent shell & management → slideFromRight ──
          case '/parent':
            return page((_) => const ParentHomeScreen(), slideFromRight);
          case '/parent/abilityRadar':
            return page((_) => const AbilityRadarScreen(), slideFromRight);
          case '/parent/abilityTrend':
            return page((_) => const AbilityTrendScreen(), slideFromRight);
          case '/parent/parentalControls':
            return page(
              (_) => const ParentalControlsScreen(),
              slideFromRight,
            );
          case '/parent/assignmentManager':
            return page(
              (_) => const AssignmentManagerScreen(),
              slideFromRight,
            );
          case '/parent/coursePackManager':
            return page(
              (_) => const CoursePackManagerScreen(),
              slideFromRight,
            );
          case '/parent/growthReport':
            return page(
              (_) => const GrowthReportScreen(),
              slideFromRight,
            );
          case '/parent/aiInsights':
            return page((_) => const AIInsightsPanel(), slideFromRight);
          case '/parent/reportDetail':
            return page(
              (_) => const ReportDetailScreen(),
              slideFromRight,
            );
          case '/parent/lessonGenerator':
            return page(
              (_) => LessonGeneratorScreen(
                draftContentId: args?['draftContentId'] as int?,
              ),
              slideFromRight,
            );
          case '/parent/draftManager':
            return page(
              (_) => const DraftManagerScreen(),
              slideFromRight,
            );
          case '/parent/quickVideoGenerator':
            return page(
              (_) => const QuickVideoGeneratorScreen(),
              slideFromRight,
            );

          // ── Learning content → slideFromRight ──
          case '/learning/subjectContentList':
            return page(
              (_) => SubjectContentListScreen(
                subject: args?['subject'] as String? ?? '',
                childId: childId,
              ),
              slideFromRight,
            );
          case '/learning/contentDetail':
            return page(
              (_) => ContentDetailScreen(
                contentId: args?['contentId'] as int? ?? 0,
                childId: childId,
              ),
              slideFromRight,
            );
          case '/learning/structuredLesson':
            return page(
              (_) => StructuredLessonScreen(
                contentId: args?['contentId'] as int? ?? 0,
                childId: childId,
              ),
              slideFromRight,
            );

          // ── Games / interactive play → childFriendly ──
          case '/learning/animationPlayer':
            return page(
              (_) => AnimationScenePlayer(
                scenes: args?['scenes'] as List<AnimationScene>? ?? [],
              ),
              childFriendly,
            );
          case '/learning/lessonScenePlayer':
            return page(
              (_) => LessonScenePlayer(
                document: args?['document'] as LessonSceneDocument? ??
                    const LessonSceneDocument(scenes: []),
                isCompleted: args?['isCompleted'] as bool? ?? false,
                onComplete: args?['onComplete']
                    as void Function(int?, Map<String, dynamic>?)?,
              ),
              childFriendly,
            );

          default:
            return null;
        }
      },
      home: Consumer<UserProvider>(
        builder: (context, userProvider, _) {
          if (userProvider.isLoading) {
            return const SplashScreen();
          }

          if (!userProvider.isLoggedIn) {
            return const LoginScreen();
          }

          final mode = userProvider.selectedMode;
          if (mode == null) {
            return const ModeSelectionScreen();
          }

          if (mode == 'child') {
            return const ChildHomeScreen();
          }

          return const ParentHomeScreen();
        },
      ),
    );
  }
}
