// speech_recognition_service_mobile.dart
// Mobile (Android/iOS) 平台语音识别 — 用 speech_to_text 插件设备端引擎

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;
import 'package:speech_to_text/speech_recognition_result.dart';

import 'speech_recognition_service_interface.dart';

class MobileSpeechRecognitionService implements SpeechRecognitionService {
  final stt.SpeechToText _speech = stt.SpeechToText();
  bool _initialized = false;
  bool _listening = false;

  // 缓存最新的最终结果，停止时一次性回调
  String _accumulatedFinal = '';

  // 回调引用
  OnSpeechResult? _onResult;
  OnSpeechState? _onStateChange;
  // ignore: unused_field
  OnSpeechError? _onError;

  @override
  Future<bool> isSupported() async {
    if (!_initialized) {
      _initialized = await _speech.initialize(
        onError: (err) {
          debugPrint('Speech init error: ${err.errorMsg}');
        },
      );
    }
    return _initialized;
  }

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

    // 检查是否可用
    bool available = _speech.isAvailable;
    if (!available) {
      available = await _speech.initialize(
        onStatus: (status) {
          debugPrint('Speech status: $status');
          if (status == 'notListening' && _listening) {
            // 仍然在监听状态，不要切走
          }
        },
        onError: (err) {
          debugPrint('Speech error: ${err.errorMsg}');
          if (_listening) {
            _listening = false;
            onStateChange(false);
            onError(err.errorMsg);
          }
        },
      );
    }

    if (!available) {
      onError('not_available');
      return false;
    }

    _listening = true;
    onStateChange(true);

    await _speech.listen(
      onResult: (SpeechRecognitionResult result) {
        if (result.finalResult) {
          _accumulatedFinal += result.recognizedWords;
          // 实时把中间结果推出去
          onResult(_accumulatedFinal, '');
        } else {
          // 中间结果
          onResult(_accumulatedFinal, result.recognizedWords);
        }
      },
      listenOptions: stt.SpeechListenOptions(
        partialResults: true,
        onDevice: true, // 设备端引擎，不依赖 Google 服务
        listenMode: stt.ListenMode.dictation,
        cancelOnError: false,
        localeId: localeId,
      ),
    );
    return true;
  }

  @override
  Future<void> stopListening() async {
    if (!_listening) return;
    _listening = false;

    if (_speech.isListening) {
      await _speech.stop();
    }

    final finalText = _accumulatedFinal.trim();
    if (finalText.isNotEmpty) {
      _onResult?.call(finalText, '');
    }
    _onStateChange?.call(false);
  }

  @override
  void dispose() {
    if (_speech.isListening) {
      _speech.cancel();
    }
  }
}

SpeechRecognitionService createSpeechService() {
  return MobileSpeechRecognitionService();
}
