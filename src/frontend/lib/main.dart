import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'bootstrap.dart';
import 'screens/splash_screen.dart';

/// 全局错误日志：确保 release 模式也输出到浏览器控制台
void _logError(String label, Object error, StackTrace? stack) {
  // ignore: avoid_print
  print('$label $error');
  // ignore: avoid_print
  if (stack != null) print('$label STACK: $stack');
}

void main() {
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
  runZonedGuarded(() async {
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

    // 只预热启动图（几十 KB，几十毫秒），保证 Flutter 首帧就带着图标，
    // 与原生启动屏衔接不闪。SharedPreferences / Service 构造等耗时初始化
    // 全部留给 LingxiBootstrap，在启动动画播放期间并行完成 —— 否则 Android
    // 会一直停在原生启动屏的纯色底上，用户看到的就是「纯色很久、动画一闪」。
    try {
      await SplashScreen.precacheLogo();
    } catch (_) {
      // 预热失败不影响启动，退化为正常异步加载
    }

    runApp(const LingxiBootstrap());
  }, (Object error, StackTrace stack) {
    _logError('💥 [ZoneError]', error, stack);
  });
}
