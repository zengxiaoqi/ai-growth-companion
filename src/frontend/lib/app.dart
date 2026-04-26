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
import 'screens/child/emergency_call_screen.dart';
import 'screens/learning/animation_scene_player.dart';
// AnimationScene 已在 animation_scene_player.dart 中导出

class LingxiApp extends StatelessWidget {
  const LingxiApp({super.key});

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
      },
      onGenerateRoute: (settings) {
        if (settings.name == '/child/emergencyCall') {
          final args = settings.arguments as Map<String, dynamic>?;
          return MaterialPageRoute(
            builder: (_) => EmergencyCallScreen(
              childId: args?['childId'] as int? ?? 0,
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
