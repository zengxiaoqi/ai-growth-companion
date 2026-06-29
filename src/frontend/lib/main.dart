import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'services/storage_service.dart';
import 'services/api_service.dart';
import 'services/ai_service.dart';
import 'providers/user_provider.dart';
import 'providers/learning_provider.dart';
import 'providers/content_provider.dart';
import 'providers/chat_session_provider.dart';
import 'providers/reward_provider.dart';
import 'utils/app_logger.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // 初始化日志系统
  initLogger();

  // 初始化本地存储
  final prefs = await SharedPreferences.getInstance();
  final storageService = StorageService(prefs);

  // 初始化 API 服务
  final apiService = ApiService();

  // 初始化 AI 服务
  final aiService = AiService(apiService);

  // 设置 401 过期回调：清除本地登录态 + 回到根路由
  // 不 push /login 路由 — Consumer 会根据 isLoggedIn 自动显示 LoginScreen
  ApiService.onAuthExpired = () {
    debugPrint('[AuthExpired] 401 detected — clearing session');
    final ctx = navigatorKey.currentContext;
    if (ctx != null) {
      // 通过 Provider 调用 logout，清内存状态 + storage + 通知 Consumer 重建
      Provider.of<UserProvider>(ctx, listen: false).logout();
    } else {
      // Fallback: 直接清 storage
      storageService.clearUser();
    }
    // 弹回根路由，让 Consumer 重建为 LoginScreen
    navigatorKey.currentState?.popUntil((route) => route.isFirst);
  };

  runApp(
    MultiProvider(
      providers: [
        Provider<StorageService>.value(value: storageService),
        Provider<ApiService>.value(value: apiService),
        Provider<AiService>.value(value: aiService),
        ChangeNotifierProvider(
          // 传入 apiService 以便恢复 token
          create: (_) => UserProvider(storageService, apiService),
        ),
        ChangeNotifierProvider(
          create: (_) => LearningProvider(storageService),
        ),
        ChangeNotifierProvider(
          create: (_) => ContentProvider(apiService),
        ),
        ChangeNotifierProvider(
          create: (_) => ChatSessionProvider(apiService),
        ),
        ChangeNotifierProvider(
          create: (_) => RewardProvider(apiService),
        ),
      ],
      child: const LingxiApp(),
    ),
  );
}
