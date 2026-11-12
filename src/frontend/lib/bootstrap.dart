import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_skill/flutter_skill.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'components/app_update_prompt.dart';
import 'providers/chat_session_provider.dart';
import 'providers/content_provider.dart';
import 'providers/learning_provider.dart';
import 'providers/reward_provider.dart';
import 'providers/user_provider.dart';
import 'providers/video_download_provider.dart';
import 'screens/splash_screen.dart';
import 'services/ai_service.dart';
import 'services/api_service.dart';
import 'services/storage_service.dart';
import 'theme/app_theme.dart';
import 'theme/child_theme.dart';
import 'utils/app_logger.dart';
import 'utils/loader_helper.dart';

/// 启动引导层：**先把启动动画放上屏，再把初始化塞进动画时间里跑**。
///
/// 之前的写法是在 `runApp` 之前 `await` 图片预热、SharedPreferences、
/// Service 构造，Android 全程停在原生启动屏（一块纯色）——引擎启动 + 磁盘
/// 读取叠加起来就是好几秒的纯色，等 Flutter 真画出第一帧时，启动动画只剩
/// 一两百毫秒就要切页了，观感就是「纯色很久，动画闪一下」。
///
/// 现在反过来：
/// 1. `main()` 只做 `runApp`，启动动画立刻开始播；
/// 2. 初始化在动画播放期间并行完成（`Future.wait`）；
/// 3. 动画播完 **且** 初始化就绪，才交叉淡出到真正的 App。
class LingxiBootstrap extends StatefulWidget {
  const LingxiBootstrap({super.key});

  @override
  State<LingxiBootstrap> createState() => _LingxiBootstrapState();
}

class _LingxiBootstrapState extends State<LingxiBootstrap> {
  /// 品牌动画最短可见时长 —— **从首帧真正绘制出来之后开始计时**。
  ///
  /// 若从 `initState` 计时，低端机首帧延迟 1s 就会吃掉大半动画；
  /// 挂在 post-frame 后计时，才能保证用户看到完整的一段入场
  /// （入场动画 1.8s，这里留 100ms 余量，避免切页时字幕刚出现就被打断）。
  static const Duration _brandHold = Duration(milliseconds: 1900);

  StorageService? _storage;
  ApiService? _api;
  AiService? _ai;

  bool _servicesReady = false;
  bool _brandDone = false;
  bool _failed = false;

  bool get _revealed => _servicesReady && _brandDone;

  @override
  void initState() {
    super.initState();
    _startBrandClock();
    _bootstrap();
  }

  /// 首帧绘制完成 → 撤掉 Web 加载层，并开始计动画时长。
  void _startBrandClock() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      hideLoader();
      Future<void>.delayed(_brandHold, () {
        if (!mounted) return;
        setState(() => _brandDone = true);
      });
    });
  }

  Future<void> _bootstrap() async {
    if (kDebugMode) {
      FlutterSkillBinding.ensureInitialized();
    }
    initLogger();

    for (var attempt = 0; attempt < 2; attempt++) {
      try {
        // 图片解码与磁盘读取互不依赖，先各自起跑再一起等，比串行快一截
        final prefsFuture = SharedPreferences.getInstance();
        await SplashScreen.precacheLogo();
        final prefs = await prefsFuture;

        final storage = StorageService(prefs);
        final api = ApiService();
        final ai = AiService(api);

        // 401 过期回调：清会话 + 退回首屏
        ApiService.onAuthExpired = () {
          debugPrint('[AuthExpired] 401 detected — clearing session');
          final ctx = navigatorKey.currentContext;
          if (ctx != null) {
            Provider.of<UserProvider>(ctx, listen: false).logout();
          } else {
            storage.clearUser();
          }
          navigatorKey.currentState?.popUntil((route) => route.isFirst);
        };

        if (!mounted) return;
        setState(() {
          _storage = storage;
          _api = api;
          _ai = ai;
          _servicesReady = true;
        });

        // 静默检查更新：不参与启动时序，失败完全静默
        Future<void>.delayed(const Duration(seconds: 3), () {
          final ctx = navigatorKey.currentContext;
          if (ctx != null && ctx.mounted) {
            AppUpdatePrompt.autoCheck(ctx);
          }
        });
        return;
      } catch (error, stack) {
        debugPrint('🔥 [Bootstrap] 初始化失败(第 ${attempt + 1} 次): $error\n$stack');
        if (attempt == 0) {
          await Future<void>.delayed(const Duration(milliseconds: 240));
        }
      }
    }

    if (!mounted) return;
    setState(() => _failed = true);
  }

  @override
  Widget build(BuildContext context) {
    final storage = _storage;
    final api = _api;
    final ai = _ai;

    if (_failed) {
      return const _BootFailureScreen();
    }

    final Widget child;
    if (_revealed && storage != null && api != null && ai != null) {
      child = MultiProvider(
        key: const ValueKey('lingxi_root'),
        providers: [
          Provider<StorageService>.value(value: storage),
          Provider<ApiService>.value(value: api),
          Provider<AiService>.value(value: ai),
          ChangeNotifierProvider(
            create: (_) => UserProvider(storage, api),
          ),
          ChangeNotifierProvider(
            create: (_) => LearningProvider(storage),
          ),
          ChangeNotifierProvider(
            create: (_) => ContentProvider(api),
          ),
          ChangeNotifierProvider(
            create: (_) => ChatSessionProvider(api),
          ),
          ChangeNotifierProvider(
            create: (_) => RewardProvider(api),
          ),
          ChangeNotifierProvider(
            create: (_) => VideoDownloadProvider(api),
          ),
          // 孩子端可切换主题：mode 由 StorageService 持久化，auto 依赖年龄
          ChangeNotifierProvider<ChildThemeController>(
            create: (_) => ChildThemeController(storage),
          ),
        ],
        child: const LingxiApp(),
      );
    } else {
      // 启动动画需要 MediaQuery / Theme / Directionality，用最小 MaterialApp 兜住
      child = MaterialApp(
        key: const ValueKey('lingxi_boot_splash'),
        debugShowCheckedModeBanner: false,
        title: '灵犀伴学',
        theme: AppTheme.lightTheme,
        home: const SplashScreen(),
      );
    }

    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 460),
      switchInCurve: Curves.easeOutCubic,
      switchOutCurve: Curves.easeInCubic,
      child: child,
    );
  }
}

/// 初始化彻底失败时的兜底页（正常不会出现）。
class _BootFailureScreen extends StatelessWidget {
  const _BootFailureScreen();

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        backgroundColor: BrandSplashColors.deep,
        body: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  '启动遇到一点问题',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  '请退出 App 后重新打开',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.6),
                    fontSize: 13,
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
