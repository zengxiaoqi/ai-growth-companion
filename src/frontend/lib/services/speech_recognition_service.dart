// speech_recognition_service.dart — 跨平台语音识别抽象
//
// 通过条件导入区分平台：
// - Web (dart.library.html): 用浏览器原生 Web Speech API
// - Mobile (dart.library.io): 用 speech_to_text 插件设备端引擎

import 'speech_recognition_service_interface.dart';

export 'speech_recognition_service_interface.dart' show SpeechRecognitionService;

import 'speech_recognition_service_web.dart'
    if (dart.library.io) 'speech_recognition_service_mobile.dart'
    as platform;

/// 获取平台对应的语音识别服务实例
SpeechRecognitionService createSpeechRecognitionService() {
  return platform.createSpeechService();
}
