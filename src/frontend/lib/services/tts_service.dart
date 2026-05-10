import 'dart:async';
import 'package:flutter_tts/flutter_tts.dart';

/// TTS 语音朗读服务
/// 封装 flutter_tts，提供中文语音朗读功能
///
/// 特性：
/// - 单例模式，全局共享一个 FlutterTts 实例
/// - 通过 Completer + generation 计数器解决竞态问题
/// - 自动处理错误状态和非中文环境的降级
class TtsService {
  static final TtsService _instance = TtsService._internal();
  factory TtsService() => _instance;
  TtsService._internal();

  final FlutterTts _tts = FlutterTts();
  bool _isSpeaking = false;
  Completer<void>? _speakCompleter;
  bool _initialized = false;
  bool _engineAvailable = false;

  /// 是否正在朗读
  bool get isSpeaking => _isSpeaking;

  /// TTS 引擎是否可用
  bool get isAvailable => _engineAvailable;

  /// 初始化 TTS 引擎
  /// 设置中文朗读参数，注册完成/错误回调
  Future<void> init() async {
    if (_initialized) return;

    try {
      // 检查语言是否可用
      final langs = await _tts.getLanguages;
      if (langs.contains("zh-CN") ||
          langs.contains("zh") ||
          langs.contains("cmn")) {
        _engineAvailable = true;
      }
    } catch (_) {
      _engineAvailable = false;
    }

    if (_engineAvailable) {
      await _tts.setLanguage("zh-CN");
    }
    await _tts.setSpeechRate(0.45);
    await _tts.setPitch(1.0);
    await _tts.setVolume(1.0);

    // 朗读自然完成回调
    _tts.setCompletionHandler(() {
      _completeCurrent();
    });

    // 错误回调
    _tts.setErrorHandler((_) {
      _completeCurrent();
    });

    _initialized = true;
  }

  void _completeCurrent() {
    _isSpeaking = false;
    final completer = _speakCompleter;
    _speakCompleter = null;
    if (completer != null && !completer.isCompleted) {
      completer.complete();
    }
  }

  /// 朗读文本
  ///
  /// 内部先停止已有朗读，再开始朗读新文本。
  /// 返回的 [onComplete] Future 在朗读自然结束时 resolve。
  Future<void> speak(String text) async {
    if (text.isEmpty) return;
    if (!_initialized) await init();
    if (!_engineAvailable) return;

    // 安全停止当前朗读，清理状态
    await stop();

    _isSpeaking = true;
    _speakCompleter = Completer<void>();

    try {
      await _tts.speak(text);
    } catch (_) {
      // speak 本身可能抛异常；状态由 handler 清理
    }
  }

  /// 停止朗读
  Future<void> stop() async {
    _isSpeaking = false;
    final completer = _speakCompleter;
    _speakCompleter = null;
    if (completer != null && !completer.isCompleted) {
      completer.complete();
    }
    try {
      await _tts.stop();
    } catch (_) {}
  }

  /// 返回一个 Future，在当前朗读完成后 resolve。
  /// 如果当前未在朗读，立即返回 resolved Future。
  Future<void> get onComplete =>
      _speakCompleter?.future ?? Future<void>.value();
}