// Web 平台语音识别 — 调用浏览器原生 Web Speech API
//
// 前置条件：index.html 里的 window._lingxiSpeech helper 脚本
// 用全局函数回调（window._lingxiOnResult 等），避免 dart:js 属性赋值的兼容性问题

import 'dart:async';
import 'dart:js' as js;

import 'package:flutter/foundation.dart';

import 'speech_recognition_service_interface.dart';

class WebSpeechRecognitionService implements SpeechRecognitionService {
  bool _started = false;

  dynamic get _obj => js.context['_lingxiSpeech'];

  @override
  Future<bool> isSupported() async {
    final obj = _obj;
    return obj != null && obj['supported'] == true;
  }

  @override
  Future<bool> startListening({
    required String localeId,
    required OnSpeechResult onResult,
    required OnSpeechState onStateChange,
    required OnSpeechError onError,
  }) async {
    final obj = _obj;
    if (obj == null || obj['supported'] != true) {
      onError('not_supported');
      return false;
    }

    // 用全局函数设置回调 — dart:js 的 js.context['xxx'] = closure
    // 可以被 JS 端以 window._lingxiOnResult(a, b) 形式调用
    js.context['_lingxiOnResult'] = (finalText, interim) {
      try {
        onResult(finalText.toString(), interim.toString());
      } catch (e) {
        debugPrint('[speech] onResult callback error: $e');
      }
    };
    js.context['_lingxiOnEnd'] = () {
      if (_started) {
        _started = false;
        onStateChange(false);
      }
    };
    js.context['_lingxiOnError'] = (err) {
      if (_started) {
        _started = false;
        onStateChange(false);
      }
      onError(err.toString());
    };

    // Web Speech API 的 locale 用 '-' 而不是 '_'
    final lang = localeId.replaceAll('_', '-');
    obj.callMethod('start', [lang]);
    _started = true;
    onStateChange(true);
    return true;
  }

  @override
  Future<void> stopListening() async {
    _started = false;
    final obj = _obj;
    if (obj != null) {
      try {
        obj.callMethod('stop', []);
      } catch (_) {}
    }
  }

  @override
  void dispose() {
    stopListening();
    // 清理全局回调
    js.context['_lingxiOnResult'] = null;
    js.context['_lingxiOnEnd'] = null;
    js.context['_lingxiOnError'] = null;
  }
}

SpeechRecognitionService createSpeechService() {
  return WebSpeechRecognitionService();
}
