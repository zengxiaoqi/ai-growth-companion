import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';

import 'theme/app_theme.dart';
import 'theme/child_theme.dart';
import 'theme/page_transitions.dart';
import 'providers/user_provider.dart';
import 'screens/splash_screen.dart';
import 'screens/auth/login_screen.dart';
import 'screens/auth/register_screen.dart';
import 'screens/auth/mode_selection_screen.dart';
import 'screens/child/child_home_screen.dart';
import 'screens/parent/parent_home_screen.dart';
import 'screens/parent/ability_radar_screen.dart';
import 'screens/parent/ability_trend_screen.dart';
import 'screens/parent/parental_controls_screen.dart';
import 'screens/parent/assignment_manager_screen.dart';
import 'screens/parent/course_pack_manager_screen.dart';
import 'screens/parent/growth_report_screen.dart';
import 'screens/parent/ai_insights_panel.dart';
import 'screens/parent/lesson_generator_screen.dart';
import 'screens/parent/draft_manager_screen.dart';
import 'screens/parent/quick_video_generator_screen.dart';
import 'screens/parent/child_manager_screen.dart';
import 'screens/parent/video_download_screen.dart';
import 'screens/reward/reward_home_screen.dart';
import 'screens/child/emergency_call_screen.dart';
import 'screens/learning/animation_scene_player.dart';
import 'screens/learning/assignment_play_screen.dart';
import 'screens/learning/content_detail_screen.dart';
import 'screens/ai_chat_screen.dart';
import 'screens/learning/structured_lesson_screen.dart';
import 'screens/learning/lesson_scene_player.dart';
import 'screens/learning/subject_content_list_screen.dart';
import 'screens/poetry/poetry_home_screen.dart';
import 'screens/child/music_screen.dart';
import 'screens/poetry/poetry_detail_screen.dart';
import 'screens/poetry/poetry_game_screen.dart';
import 'screens/poetry/fill_blank_game_screen.dart';
import 'screens/poetry/flying_flower_game_screen.dart';
import 'screens/poetry/solitaire_game_screen.dart';
import 'screens/parent/book_skill_upload_screen.dart';
import 'screens/book_skill_browse_screen.dart';
// AnimationScene 已在 animation_scene_player.dart 中导出

/// 全局 Navigator Key，供 ApiService 在 401 时跳转登录页
final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

/// 家长端统一主题。
///
/// 与 [AppTheme.lightTheme] 逐字段一致（colorScheme / cardTheme / textTheme
/// 全是原蜜黄配置，零视觉回归），只额外挂上 honey 色板 extension，让家长端
/// 复用孩子端 v2 组件时 `ChildThemePalette.of(context)` 能明确取到蜜黄。
/// 不用 `buildChildTheme(honey)`：那套色板的 `colorScheme.surface` 是白色，
/// 会把家长端原有的奶油黄 surface 换掉，Dialog / Material 卡片会偏白。
ThemeData get parentTheme => AppTheme.lightTheme.copyWith(
      extensions: <ThemeExtension<dynamic>>[ChildThemePalette.honey],
    );

class LingxiApp extends StatelessWidget {
  const LingxiApp({super.key});

  /// 解析 childId：路由参数优先，fallback 到 UserProvider.activeChildId
  static int? _resolveChildId(
      BuildContext context, Map<String, dynamic>? args) {
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
    // 用 Consumer 包住 MaterialApp，主题切换时由 ChildThemeController 驱动重建。
    //
    // 关于 MaterialApp 的 key：这里刻意保持 const ValueKey('lingxi_app') 不随
    // 主题变化。MaterialApp 内部通过 AnimatedTheme / Theme(InheritedWidget) 下发
    // ThemeData，theme 改变会通知所有 Theme.of(context) 依赖方即时重建（并带
    // 一次平滑过渡），足以完成换肤。若让 key 随主题变化，整个 MaterialApp
    // Element 连同 Navigator、所有路由及页面状态（滚动位置、表单输入、导航栈）
    // 都会在每次换肤时被销毁重建，代价大且没有必要。
    // 只关心「是否已登录」与「是否家长端」两个布尔值：登录/登出/切端时
    // 才需要换主题，UserProvider 的其它变动（切换孩子、刷新资料）不应重建
    // 整个 MaterialApp。
    return Selector<UserProvider, ({bool loggedIn, bool isParent})>(
      selector: (_, u) => (
        loggedIn: u.isLoggedIn,
        // 与 ProfileScreen / _HomeScreen 共用同一个角色口径，避免三处各自
        // 兜底规则漂移（activeRole 为空时回退 currentUser['type']）。
        isParent: u.activeUserType == 'parent',
      ),
      builder: (context, state, _) {
        return Consumer<ChildThemeController>(
          builder: (context, themeController, _) {
            // 未登录（含启动校验阶段）与家长端都固定品牌蜜黄浅色：
            // 皮肤是孩子端的体验，登录页不该跟随上一次残留的孩子皮肤；
            // 家长端则不能只在主壳上套 Theme —— Navigator.push 出去的
            // 报告 / 设置 / 能力页不在主壳子树里，若孩子当前选了 space，
            // 这些二级页会变成深紫，与蜜黄主壳割裂。
            // 因此整棵 MaterialApp 在家长端直接用 parentTheme。
            final ThemeData theme;
            if (!state.loggedIn) {
              theme = AppTheme.lightTheme;
            } else if (state.isParent) {
              theme = parentTheme;
            } else {
              theme = themeController.themeData;
            }
            return _buildMaterialApp(context, theme);
          },
        );
      },
    );
  }

  /// 构造 MaterialApp；[theme] 由 [ChildThemeController] 提供。
  Widget _buildMaterialApp(BuildContext context, ThemeData theme) {
    return MaterialApp(
      key: const ValueKey('lingxi_app'),
      navigatorKey: navigatorKey,
      title: '灵犀伴学',
      theme: theme,
      debugShowCheckedModeBanner: false,
      // 中文本地化：让 DatePicker 等 Material 组件显示中文月份/星期
      locale: const Locale('zh', 'CN'),
      supportedLocales: const [
        Locale('zh', 'CN'),
        Locale('en', 'US'),
      ],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      // Force initial route to '/' — prevents Flutter Web from treating
      // the browser URL path (e.g. '/login') as the initial route and
      // pushing it onto the navigator stack, which would shadow the
      // Consumer-based home widget.
      initialRoute: '/',
      // All routes use custom page transitions defined in
      // theme/page_transitions.dart.  See that file for the transition
      // assignment rationale.
      onGenerateRoute: (settings) {
        final args = settings.arguments as Map<String, dynamic>?;
        final childId = _resolveChildId(context, args);

        // Helper — wraps a builder with the chosen transition factory.
        Route<T> page<T>(
          WidgetBuilder builder,
          Route<T> Function(WidgetBuilder, {RouteSettings? settings})
              transition,
        ) {
          return transition(builder, settings: settings);
        }

        switch (settings.name) {
          // ── Authentication → fadeThrough ──
          case '/login':
            // Return _HomeScreen (Consumer) instead of standalone LoginScreen.
            // This ensures notifyListeners() triggers UI rebuild when login
            // succeeds, even when /login is the initial route (URL-based).
            return page((_) => const _HomeScreen(), fadeThrough);
          case '/register':
            return page((_) => const RegisterScreen(), fadeThrough);
          case '/modeSelection':
            return page((_) => const ModeSelectionScreen(), fadeThrough);

          // ── Settings 已并入「我的」页，不再单独成页 ──
          case '/settings':
            return page((_) => const ChildHomeScreen(), slideFromRight);

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
              (_) => CoursePackManagerScreen(
                initialRecordId: args?['initialRecordId'] as int?,
                initialChildId: args?['initialChildId'] as int?,
              ),
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
            // 旧深链保留兼容：报告详情已并入成长报告页，不再维护第二份实现
            // （原 report_detail_screen.dart 与成长报告重复且全仓无调用方）。
            return page(
              (_) => const GrowthReportScreen(),
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
          case '/parent/videoDownload':
            return page(
              (_) => const VideoDownloadScreen(),
              slideFromRight,
            );
          case '/parent/childManager':
            return page(
              (_) => const ChildManagerScreen(),
              slideFromRight,
            );

          // ── Reward system → slideFromRight ──
          case '/reward/home':
            return page((_) => const RewardHomeScreen(), slideFromRight);

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

          // ── Poetry → slideFromRight ──
          case '/poetry':
            return page((_) => const PoetryHomeScreen(), slideFromRight);
          case '/poetry/detail':
            return page(
              (_) => PoetryDetailScreen(
                poemId: args?['poemId'] as int? ?? 0,
              ),
              slideFromRight,
            );
          case '/poetry/game':
            return page((_) => const PoetryGameScreen(), slideFromRight);
          case '/poetry/game/fill-blank':
            return page((_) => const FillBlankGameScreen(), slideFromRight);
          case '/poetry/game/flying-flower':
            return page((_) => const FlyingFlowerGameScreen(), slideFromRight);
          case '/poetry/game/solitaire':
            return page((_) => const SolitaireGameScreen(), slideFromRight);

          // ── Music → slideFromRight ──
          case '/music':
            return page((_) => const MusicScreen(), slideFromRight);

          // ── Book skill → slideFromRight ──
          case '/book-skill/upload':
            return page((_) => const BookSkillUploadScreen(), slideFromRight);
          case '/book-skill/browse':
            return page((_) => const BookSkillBrowseScreen(), slideFromRight);
          case '/book-skill/detail':
            return page(
              (_) => BookSkillDetailScreen(
                bookId: args?['bookId'] as int? ?? 0,
              ),
              slideFromRight,
            );

          // ── AI Chat → slideFromRight ──
          case '/ai/chat':
            return page(
              (_) => AIChatScreen(
                bookId: args?['context']?['bookId'] as int?,
                bookTitle: args?['context']?['bookTitle'] as String?,
              ),
              slideFromRight,
            );

          // ── Games / interactive play → childFriendly ──
          case '/learning/assignmentPlay':
            return page(
              (_) => AssignmentPlayScreen(
                assignment: args?['assignment'] as Map<String, dynamic>? ?? {},
              ),
              childFriendly,
            );
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
                onComplete: args?['onComplete'] as void Function(
                    int?, Map<String, dynamic>?)?,
              ),
              childFriendly,
            );

          default:
            return null;
        }
      },
      home: const _HomeScreen(),
    );
  }
}

/// Central Consumer-based home widget.
///
/// Used both as `MaterialApp.home` and as the `/login` route target.
/// By routing `/login` through this Consumer (instead of a standalone
/// `LoginScreen`), `notifyListeners()` from `UserProvider.login()` reliably
/// triggers a rebuild that swaps to the appropriate screen — even when
/// the user navigated directly to the `/login` URL.
class _HomeScreen extends StatelessWidget {
  const _HomeScreen();

  @override
  Widget build(BuildContext context) {
    return Consumer<UserProvider>(
      builder: (context, userProvider, _) {
        // 把当前用户年龄同步给主题控制器（auto 模式按年龄推断皮肤）。
        // 用 post-frame 避免在 build 期间触发 notifyListeners；setAge 对
        // 未变化的值做了短路，不会引起循环重建。
        final age = userProvider.currentUser?['age'];
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!context.mounted) return;
          context.read<ChildThemeController>().setAge(age);
        });

        final Widget page;

        // 兜底：`LingxiBootstrap` 已经把完整的品牌动画播完才切到这里，
        // 正常情况下这一帧 `isLoading` 就是 false，不会再出现启动屏；
        // 只有用户状态异常（异步校验未回）时才短暂保留启动屏占位。
        if (userProvider.isLoading) {
          page = const SplashScreen(key: ValueKey('lingxi_splash'));
        } else if (!userProvider.isLoggedIn) {
          // 未登录：强制回到品牌蜜黄浅色。
          // `AppTheme.active` 是全局静态，退出登录后若不清回 honey，登录页会
          // 沿用上一次孩子皮肤的取色板（例如 space 的深紫 + 薄荷绿），出现
          // 白卡片里嵌深紫输入框、浮动 label 横跨深浅背景的情况。
          // MaterialApp 层的 theme 也已切到 lightTheme（见 LingxiApp.build），
          // 保证输入框等组件的 InputDecoration 同样是浅色。
          AppTheme.active = ChildThemePalette.honey;
          page = const LoginScreen(key: ValueKey('lingxi_login'));
        } else {
          // 根据 activeRole 决定显示哪个端
          // activeRole 由登录或双端切换设置
          final role = userProvider.activeRole ??
              userProvider.currentUser?['type']?.toString() ??
              'child';

          // 同步全局静态取色板：`AppTheme.xxx` getter 代理 [AppTheme.active]，
          // 孩子端跟随当前皮肤，家长端 / 未登录强制 honey（与 lightTheme 一致）。
          // 在 build 中同步赋值即可：随后的子树 build 读取到的是新值；
          // 换肤时 ChildThemeController.notifyListeners 会重建整个 MaterialApp，
          // 本 build 会再次执行并刷新 active，无循环重建风险。
          AppTheme.active = role == 'parent'
              ? ChildThemePalette.honey
              : context.read<ChildThemeController>().palette;

          if (role == 'parent') {
            // 主壳内再挂一层 parentTheme 作为显式保障：MaterialApp 层已经
            // 统一（见 LingxiApp.build），这里保证即使以后有人调整上层逻辑，
            // 首页 / 学习 / AI / 我的 四个 tab 也不会串到孩子皮肤。
            page = Theme(
              key: const ValueKey('lingxi_parent'),
              data: parentTheme,
              child: const ParentHomeScreen(),
            );
          } else {
            // 孩子端：监听 ChildThemeController，切肤时同步 active 并用
            // resolvedKey 作 key 强制整棵首页子树重建 —— 历史代码大量直接写
            // `AppTheme.xxx`（静态 getter，不注册 Theme 依赖），不整树重建
            // 就读不到新值，换肤瞬间会残留上一套皮肤的颜色。
            page = Consumer<ChildThemeController>(
              builder: (context, themeController, _) {
                AppTheme.active = themeController.palette;
                return ChildHomeScreen(
                  key: ValueKey(
                    'lingxi_child_${themeController.resolvedKey.name}',
                  ),
                );
              },
            );
          }
        }

        // 启动屏 → 首页/登录页交叉淡出，避免「啪」地一下换屏
        return AnimatedSwitcher(
          duration: const Duration(milliseconds: 380),
          switchInCurve: Curves.easeOut,
          switchOutCurve: Curves.easeIn,
          child: page,
        );
      },
    );
  }
}
