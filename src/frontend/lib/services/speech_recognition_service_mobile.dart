// speech_recognition_service_mobile.dart
// Mobile (Android/iOS) 平台语音识别 — 用 speech_to_text 插件设备端引擎
//
// 关键点：
// - onStatus / onError 必须在 initialize 时始终注册（不能只注册在
//   !isAvailable 分支），否则引擎自动停止/报错时上层完全无感知，
//   连续对话循环会卡死在「正在聆听」。
// - status 'done'/'notListening' 时向 onStateChange(false) 传播，
//   由上层界面做兜底重启。

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;
import 'package:speech_to_text/speech_recognition_result.dart';

import 'speech_recognition_service_interface.dart';

class MobileSpeechRecognitionService implements SpeechRecognitionService {
  // speech_to_text 插件底层是全局单例，这里包装多实例安全
  final stt.SpeechToText _speech = stt.SpeechToText();
  bool _initialized = false;
  bool _listening = false;

  // 缓存最新的最终结果，停止时一次性回调
  String _accumulatedFinal = '';

  // 回调引用
  OnSpeechResult? _onResult;
  OnSpeechState? _onStateChange;
  OnSpeechError? _onError;

  /// 确保 initialize 且回调已注册（幂等，可反复调用）
  Future<bool> _ensureInitialized() async {
    if (_initialized && _speech.isAvailable) return true;
    _initialized = await _speech.initialize(
      onStatus: (status) {
        debugPrint('Speech status: $status');
        // 引擎自动停止（无语音超时/识别结束）→ 通知上层兜底重启
        // 主动 stopListening 时 _listening 已先置 false，不会误报
        if ((status == 'done' || status == 'notListening') && _listening) {
          _listening = false;
          _onStateChange?.call(false);
        }
      },
      onError: (err) {
        debugPrint('Speech error: ${err.errorMsg}');
        final wasListening = _listening;
        _listening = false;
        if (wasListening) {
          _onStateChange?.call(false);
        }
        _onError?.call(err.errorMsg);
      },
    );
    debugPrint('Speech initialize: $_initialized');
    return _initialized;
  }

  @override
  Future<bool> isSupported() => _ensureInitialized();

  @override
  Future<bool> startListening({
    required String localeId,
    required OnSpeechResult onResult,
    required OnSpeechState onStateChange,
    required OnSpeechError onError,
  }) async {
    _onResult = onResult;
    _onStateChange = onStateChange;
    _onError = onError;
    _accumulatedFinal = '';

    final available = await _ensureInitialized();
    if (!available) {
      onError('not_available');
      return false;
    }

    _listening = true;
    onStateChange(true);

    try {
      await _speech.listen(
        onResult: (SpeechRecognitionResult result) {
          if (result.finalResult) {
            _accumulatedFinal += result.recognizedWords;
            // 实时把最终累积结果推出去
            onResult(_accumulatedFinal, '');
          } else {
            // 中间结果
            onResult(_accumulatedFinal, result.recognizedWords);
          }
        },
        listenOptions: stt.SpeechListenOptions(
          partialResults: true,
          // 不强制设备端离线识别：国产 ROM 常无离线中文识别包，
          // 强制 onDevice 会导致引擎不稳定/直接失败
          onDevice: false,
          listenMode: stt.ListenMode.dictation,
          cancelOnError: false,
          localeId: localeId,
        ),
      );
    } catch (e) {
      debugPrint('Speech listen failed: $e');
      _listening = false;
      onStateChange(false);
      onError('listen_failed');
      return false;
    }
    return true;
  }

  @override
  Future<void> stopListening() async {
    if (!_listening) return;
    _listening = false;

    if (_speech.isListening) {
      try {
        await _speech.stop();
      } catch (_) {}
    }

    final finalText = _accumulatedFinal.trim();
    if (finalText.isNotEmpty) {
      _onResult?.call(finalText, '');
    }
    _onStateChange?.call(false);
  }

  @override
  void dispose() {
    _listening = false;
    if (_speech.isListening) {
      try {
        _speech.cancel();
      } catch (_) {}
    }
  }
}

SpeechRecognitionService createSpeechService() {
  return MobileSpeechRecognitionService();
}
