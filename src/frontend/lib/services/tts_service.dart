import 'dart:async';
import 'package:flutter_tts/flutter_tts.dart';

/// TTS 语音朗读服务
/// 封装 flutter_tts，提供中文语音朗读功能
///
/// 特性：
/// - 单例模式，全局共享一个 FlutterTts 实例
/// - 通过 Completer 暴露 onComplete Future，解决竞态问题
/// - 自动处理错误状态
class TtsService {
  static final TtsService _instance = TtsService._internal();
  factory TtsService() => _instance;
  TtsService._internal();

  final FlutterTts _tts = FlutterTts();
  bool _isSpeaking = false;
  Completer<void>? _speakCompleter;
  bool _initialized = false;

  /// 是否正在朗读
  bool get isSpeaking => _isSpeaking;

  /// 初始化 TTS 引擎
  /// 设置中文朗读参数，注册完成/错误回调
  Future<void> init() async {
    if (_initialized) return;
    await _tts.setLanguage("zh-CN");
    await _tts.setSpeechRate(0.45);
    await _tts.setPitch(1.0);
    await _tts.setVolume(1.0);

    // 朗读完成时更新状态 + 触发 onComplete
    await _tts.setCompletionHandler(() {
      _isSpeaking = false;
      final completer = _speakCompleter;
      _speakCompleter = null;
      if (completer != null && !completer.isCompleted) {
        completer.complete();
      }
    });

    // 错误时也触发完成，避免永久等待
    await _tts.setErrorHandler((message) {
      _isSpeaking = false;
      final completer = _speakCompleter;
      _speakCompleter = null;
      if (completer != null && !completer.isCompleted) {
        completer.complete();
      }
    });

    _initialized = true;
  }

  /// 朗读文本
  ///
  /// 返回 [onComplete] Future，当朗读自然完成时 resolve。
  /// 调用方可通过 `await ttsService.onComplete` 等待朗读结束，
  /// 替代轮询 `isSpeaking` 的不稳定做法。
  Future<void> speak(String text) async {
    if (text.isEmpty) return;
    if (!_initialized) await init();

    // 先停止当前朗读
    await _tts.stop();

    _isSpeaking = true;
    _speakCompleter = Completer<void>();
    await _tts.speak(text);
  }

  /// 停止朗读
  Future<void> stop() async {
    _isSpeaking = false;
    final completer = _speakCompleter;
    _speakCompleter = null;
    if (completer != null && !completer.isCompleted) {
      completer.complete();
    }
    await _tts.stop();
  }

  /// 返回一个 Future，在当前朗读完成后 resolve
  ///
  /// 如果当前未在朗读，立即返回 resolved Future。
  /// 这消除了启动朗读与等待完成之间的竞态条件：
  /// Completer 在 speak() 调用前创建，最差情况是立即被 completionHandler 触发。
  Future<void> get onComplete =>
      _speakCompleter?.future ?? Future<void>.value();
}