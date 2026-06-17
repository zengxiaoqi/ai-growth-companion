import 'package:flutter/foundation.dart';
import 'package:logging/logging.dart';

/// 全局日志工具
///
/// 使用方法：
/// ```dart
/// import 'package:lingxi_companion/utils/app_logger.dart';
///
/// // 按模块创建 logger
/// final _log = AppLogger('ApiService');
/// _log.warning('Something went wrong', error);
/// ```
class AppLogger {
  final Logger _logger;

  AppLogger(String name) : _logger = Logger(name);

  void fine(Object? message, [Object? error, StackTrace? stackTrace]) =>
      _logger.fine(message, error, stackTrace);

  void info(Object? message, [Object? error, StackTrace? stackTrace]) =>
      _logger.info(message, error, stackTrace);

  void warning(Object? message, [Object? error, StackTrace? stackTrace]) =>
      _logger.warning(message, error, stackTrace);

  void severe(Object? message, [Object? error, StackTrace? stackTrace]) =>
      _logger.severe(message, error, stackTrace);

  void shout(Object? message, [Object? error, StackTrace? stackTrace]) =>
      _logger.shout(message, error, stackTrace);
}

/// 初始化日志系统（在 main() 中调用）
///
/// - debug 模式下输出到控制台（Level.ALL）
/// - release 模式下只输出 WARNING 及以上
void initLogger() {
  Logger.root.level = kDebugMode ? Level.ALL : Level.WARNING;
  Logger.root.onRecord.listen((record) {
    // ignore debug-level in release to reduce noise
    if (!kDebugMode && record.level < Level.WARNING) return;
    // ignore: avoid_print
    print('${record.level.name}: ${record.time}: ${record.loggerName}: ${record.message}'
        '${record.error != null ? '\n${record.error}' : ''}'
        '${record.stackTrace != null ? '\n${record.stackTrace}' : ''}');
  });
}
