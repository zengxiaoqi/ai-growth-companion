import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'theme/app_theme.dart';
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
      routes: {
        '/login': (_) => const LoginScreen(),
        '/register': (_) => const RegisterScreen(),
        '/modeSelection': (_) => const ModeSelectionScreen(),
        '/settings': (_) => const SettingsScreen(),
        '/child': (_) => const ChildHomeScreen(),
        '/parent': (_) => const ParentHomeScreen(),
        '/parent/abilityRadar': (_) => const AbilityRadarScreen(),
        '/parent/abilityTrend': (_) => const AbilityTrendScreen(),
        '/parent/parentalControls': (_) => const ParentalControlsScreen(),
        '/parent/assignmentManager': (_) => const AssignmentManagerScreen(),
        '/parent/coursePackManager': (_) => const CoursePackManagerScreen(),
        '/parent/growthReport': (_) => const GrowthReportScreen(),
        '/parent/aiInsights': (_) => const AIInsightsPanel(),
        '/parent/reportDetail': (_) => const ReportDetailScreen(),
        '/parent/lessonGenerator': (_) => const LessonGeneratorScreen(),
      },
      onGenerateRoute: (settings) {
        if (settings.name == '/child/emergencyCall') {
          final args = settings.arguments as Map<String, dynamic>?;
          final childId = _resolveChildId(context, args) ?? 0;
          return MaterialPageRoute(
            builder: (_) => EmergencyCallScreen(
              childId: childId,
            ),
          );
        }
        if (settings.name == '/learning/animationPlayer') {
          final args = settings.arguments as Map<String, dynamic>?;
          return MaterialPageRoute(
            builder: (_) => AnimationScenePlayer(
              scenes: args?['scenes'] as List<AnimationScene>? ?? [],
            ),
          );
        }
        if (settings.name == '/learning/subjectContentList') {
          final args = settings.arguments as Map<String, dynamic>?;
          final childId = _resolveChildId(context, args);
          return MaterialPageRoute(
            builder: (_) => SubjectContentListScreen(
              subject: args?['subject'] as String? ?? '',
              childId: childId,
            ),
          );
        }
        if (settings.name == '/learning/contentDetail') {
          final args = settings.arguments as Map<String, dynamic>?;
          final childId = _resolveChildId(context, args);
          return MaterialPageRoute(
            builder: (_) => ContentDetailScreen(
              contentId: args?['contentId'] as int? ?? 0,
              childId: childId,
            ),
          );
        }
        if (settings.name == '/learning/structuredLesson') {
          final args = settings.arguments as Map<String, dynamic>?;
          final childId = _resolveChildId(context, args);
          return MaterialPageRoute(
            builder: (_) => StructuredLessonScreen(
              contentId: args?['contentId'] as int? ?? 0,
              childId: childId,
            ),
          );
        }
        if (settings.name == '/learning/lessonScenePlayer') {
          final args = settings.arguments as Map<String, dynamic>?;
          return MaterialPageRoute(
            builder: (_) => LessonScenePlayer(
              document: args?['document'] as LessonSceneDocument? ??
                  const LessonSceneDocument(scenes: []),
              isCompleted: args?['isCompleted'] as bool? ?? false,
              onComplete: args?['onComplete'] as void Function(int?, Map<String, dynamic>?)?,
            ),
          );
        }
        return null;
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
