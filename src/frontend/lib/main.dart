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

  // 设置 401 过期回调：清除本地登录态 + 跳转登录页
  ApiService.onAuthExpired = () {
    debugPrint('[AuthExpired] 401 detected — clearing session and redirecting');
    storageService.clearUser();
    // 通过全局 navigatorKey 跳转到登录页，清空所有路由栈
    navigatorKey.currentState?.pushNamedAndRemoveUntil('/login', (_) => false);
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
