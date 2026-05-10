import 'dart:async';
import 'package:audioplayers/audioplayers.dart';
import 'api_service.dart';

/// TTS 语音朗读服务
/// 通过后端 Edge TTS API 生成 MP3 音频，使用 audioplayers 播放
///
/// 特性：
/// - 单例模式，全局共享一个 AudioPlayer 实例
/// - 通过 Completer + 流订阅解决竞态问题
/// - isAvailable 始终为 true（后端总是可用）
class TtsService {
  static final TtsService _instance = TtsService._internal();
  factory TtsService() => _instance;
  TtsService._internal();

  final AudioPlayer _player = AudioPlayer();
  StreamSubscription<void>? _completionSub;
  bool _isSpeaking = false;
  Completer<void>? _speakCompleter;

  /// 是否正在朗读
  bool get isSpeaking => _isSpeaking;

  /// TTS 服务是否可用（后端始终可用）
  bool get isAvailable => true;

  /// 初始化 TTS 服务
  /// 预初始化 AudioPlayer，注册完成回调
  Future<void> init() async {
    _listenForCompletion();
  }

  /// 注册播放完成监听（单次订阅，可重复调用以替换旧订阅）
  void _listenForCompletion() {
    _completionSub?.cancel();
    _completionSub = _player.onPlayerComplete.listen((_) {
      _completeCurrent();
    });
  }

  void _completeCurrent() {
    _isSpeaking = false;
    final completer = _speakCompleter;
    _speakCompleter = null;
    if (completer != null && !completer.isCompleted) {
      completer.complete();
    }
  }

  /// 构建 TTS 请求 URL
  String _buildUrl(String text) {
    return '${ApiService.baseUrl}/voice/tts?text=${Uri.encodeComponent(text)}';
  }

  /// 朗读文本
  ///
  /// 内部先停止已有朗读，再开始朗读新文本。
  /// 返回的 [onComplete] Future 在朗读自然结束时 resolve。
  Future<void> speak(String text) async {
    if (text.isEmpty) return;

    // 安全停止当前朗读，清理状态
    await stop();

    _isSpeaking = true;
    final completer = Completer<void>();
    _speakCompleter = completer;

    final url = _buildUrl(text);

    try {
      await _player.play(UrlSource(url));
    } catch (_) {
      // 播放启动失败：清理状态（但不要重复 complete）
      _isSpeaking = false;
      if (_speakCompleter == completer) {
        _speakCompleter = null;
      }
      if (!completer.isCompleted) {
        completer.complete();
      }
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
      await _player.stop();
    } catch (_) {}
  }

  /// 返回一个 Future，在当前朗读完成后 resolve。
  /// 如果当前未在朗读，立即返回 resolved Future。
  Future<void> get onComplete =>
      _speakCompleter?.future ?? Future<void>.value();

  /// 释放资源
  void dispose() {
    _completionSub?.cancel();
    _completionSub = null;
    _player.dispose();
  }
}