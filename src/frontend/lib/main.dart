import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_skill/flutter_skill.dart';

import 'app.dart';
import 'services/storage_service.dart';
import 'services/api_service.dart';
import 'services/ai_service.dart';
import 'providers/user_provider.dart';
import 'providers/learning_provider.dart';
import 'providers/content_provider.dart';
import 'providers/chat_session_provider.dart';
import 'providers/reward_provider.dart';
import 'providers/video_download_provider.dart';
import 'utils/app_logger.dart';

/// 全局错误日志：确保 release 模式也输出到浏览器控制台
void _logError(String label, Object error, StackTrace? stack) {
  // ignore: avoid_print
  print('$label $error');
  // ignore: avoid_print
  if (stack != null) print('$label STACK: $stack');
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // ── 全局 error 兜底 ──
  // 1) Flutter framework 的所有错误（build / layout / paint / provider 初始化等）
  FlutterError.onError = (FlutterErrorDetails details) {
    _logError('🔥 [FlutterError]', details.exception, details.stack);
  };

  // 2) Dart 运行时未捕获异常
  PlatformDispatcher.instance.onError = (Object error, StackTrace stack) {
    _logError('💥 [PlatformError]', error, stack);
    return true;
  };

  // 3) 将整个 runApp 包裹在 Zone 中，捕获所有异步未捕获异常
  await runZonedGuarded(() async {
    // 初始化 flutter_skill（仅 debug 模式）
    if (kDebugMode) {
      FlutterSkillBinding.ensureInitialized();
    }

    // 初始化日志系统
    initLogger();

    // 让 release 模式下的 build 异常可见（默认 ErrorWidget 在 release 模式渲染为 0x0 不可见框）
    ErrorWidget.builder = (FlutterErrorDetails details) {
      _logError('🔥 [ErrorWidget]', details.exception, details.stack);
      return Material(
        child: Container(
          color: Colors.red.shade50,
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, color: Colors.red, size: 32),
              const SizedBox(height: 8),
              Text('渲染错误: ${details.exception}',
                  style: const TextStyle(fontSize: 12, color: Colors.red)),
            ],
          ),
        ),
      );
    };

    // 初始化本地存储
    final prefs = await SharedPreferences.getInstance();
    final storageService = StorageService(prefs);

    // 初始化 API 服务
    final apiService = ApiService();

    // 初始化 AI 服务
    final aiService = AiService(apiService);

    // 设置 401 过期回调
    ApiService.onAuthExpired = () {
      debugPrint('[AuthExpired] 401 detected — clearing session');
      final ctx = navigatorKey.currentContext;
      if (ctx != null) {
        Provider.of<UserProvider>(ctx, listen: false).logout();
      } else {
        storageService.clearUser();
      }
      navigatorKey.currentState?.popUntil((route) => route.isFirst);
    };

    runApp(
      MultiProvider(
        providers: [
          Provider<StorageService>.value(value: storageService),
          Provider<ApiService>.value(value: apiService),
          Provider<AiService>.value(value: aiService),
          ChangeNotifierProvider(
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
          ChangeNotifierProvider(
            create: (_) => VideoDownloadProvider(apiService),
          ),
        ],
        child: const LingxiApp(),
      ),
    );
  }, (Object error, StackTrace stack) {
    _logError('💥 [ZoneError]', error, stack);
  });
}
