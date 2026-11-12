import 'dart:async';
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'api_service.dart';
import '../utils/tts_sentence_splitter.dart';

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

  // 顺序播放队列（speakAll 专用）：onPlayerComplete 驱动下一段，排空时 resolve。
  final List<TtsSegment> _queue = [];
  int _queueIndex = 0;
  Completer<void>? _queueCompleter;

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
  ///
  /// 播放失败兜底说明（audioplayers 6.x）：
  /// - 启动失败（URL 无法加载/prepare 失败）→ play() 直接抛异常，speak() 内 catch 后 complete
  /// - 播放中途错误无 error 事件流 → 依赖上层 `_speak` 对 onComplete 的超时兜底
  void _listenForCompletion() {
    _completionSub?.cancel();
    _completionSub = _player.onPlayerComplete.listen((_) {
      if (_queueCompleter != null) {
        // 队列模式：当前段播完，推进下一段
        _queueIndex++;
        _playQueueSegment();
      } else {
        _completeCurrent();
      }
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
  String _buildUrl(String text, {String? voice, String? rate}) {
    final v = voice ?? 'zh-CN-XiaoyiNeural';
    final clean = _stripEmoji(text);
    var url =
        '${ApiService.baseUrl}/voice/tts?text=${Uri.encodeComponent(clean)}&voice=$v';
    if (rate != null && rate.isNotEmpty) {
      url += '&rate=${Uri.encodeComponent(rate)}';
    }
    return url;
  }

  /// 剥离 emoji / 表情符号，避免后端 TTS 把表情读出来（双保险：
  /// 后端 sanitizeForTTS 已处理，这里兜底 Web 端与缓存 URL）
  static final RegExp _emojiRe = RegExp(
    r'[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}'
    r'\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{200D}\u{200B}\u{20E3}]',
    unicode: true,
  );

  static String _stripEmoji(String text) =>
      text.replaceAll(_emojiRe, '').trim();

  /// 朗读文本
  ///
  /// 内部先停止已有朗读，再开始朗读新文本。
  /// 返回的 [onComplete] Future 在朗读自然结束时 resolve。
  Future<void> speak(String text, {String? voice}) async {
    if (text.isEmpty) return;

    // 安全停止当前朗读，清理状态
    await stop();

    _isSpeaking = true;
    final completer = Completer<void>();
    _speakCompleter = completer;

    final url = _buildUrl(text, voice: voice);

    try {
      // 15s 超时兜底：后端 TTS 生成慢/卡住时放弃本次播报，继续对话循环
      await _player.play(UrlSource(url)).timeout(const Duration(seconds: 15));
    } catch (e) {
      debugPrint('TTS play failed: $e');
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

  /// 顺序朗读多个片段（中英混合按句切分后逐段播放）。
  ///
  /// 清空旧队列 → 入队 → 顺序播放；onPlayerComplete 驱动下一段，
  /// 队列排空时 [onComplete] resolve。单段播放失败则跳过继续下一段。
  /// 现有 [speak] 语义不变，其余调用方零影响。
  Future<void> speakAll(List<TtsSegment> segments) async {
    if (segments.isEmpty) return;
    await stop();

    _queue
      ..clear()
      ..addAll(segments);
    _queueIndex = 0;
    _isSpeaking = true;
    final completer = Completer<void>();
    _queueCompleter = completer;
    // 复用 _speakCompleter，使 onComplete 在整段队列播完后 resolve
    _speakCompleter = completer;
    await _playQueueSegment();
  }

  Future<void> _playQueueSegment() async {
    if (_queueCompleter == null) return; // 已被 stop() 取消
    if (_queueIndex >= _queue.length) {
      _finishQueue();
      return;
    }
    final seg = _queue[_queueIndex];
    final url = _buildUrl(seg.text, voice: seg.voice, rate: seg.rate);
    try {
      await _player.play(UrlSource(url)).timeout(const Duration(seconds: 15));
    } catch (e) {
      debugPrint('TTS queue play failed: $e');
      // 本段启动失败：跳过，继续下一段（onPlayerComplete 不会触发）
      _queueIndex++;
      await _playQueueSegment();
    }
  }

  void _finishQueue() {
    _isSpeaking = false;
    _queue.clear();
    _queueIndex = 0;
    final completer = _queueCompleter;
    _queueCompleter = null;
    if (_speakCompleter == completer) {
      _speakCompleter = null;
    }
    if (completer != null && !completer.isCompleted) {
      completer.complete();
    }
  }

  /// 停止朗读
  Future<void> stop() async {
    _isSpeaking = false;
    _queue.clear();
    _queueIndex = 0;
    final queueCompleter = _queueCompleter;
    _queueCompleter = null;
    final completer = _speakCompleter;
    _speakCompleter = null;
    if (queueCompleter != null && !queueCompleter.isCompleted) {
      queueCompleter.complete();
    }
    if (completer != null &&
        completer != queueCompleter &&
        !completer.isCompleted) {
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