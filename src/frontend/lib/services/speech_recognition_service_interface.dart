// speech_recognition_service_interface.dart
import 'dart:async';

/// 识别结果回调：finalText 是最终结果，interimText 是中间结果
typedef OnSpeechResult = void Function(String finalText, String interimText);
typedef OnSpeechState = void Function(bool isListening);
typedef OnSpeechError = void Function(String error);

/// 跨平台语音识别服务接口
abstract class SpeechRecognitionService {
  /// 该平台是否支持语音识别
  Future<bool> isSupported();

  /// 开始监听
  /// [localeId] 如 'zh-CN', 'en-US'
  /// [onResult] 识别结果回调
  /// [onStateChange] 录音状态变化
  /// [onError] 错误回调
  Future<bool> startListening({
    required String localeId,
    required OnSpeechResult onResult,
    required OnSpeechState onStateChange,
    required OnSpeechError onError,
  });

  /// 停止监听
  Future<void> stopListening();

  /// 释放资源
  void dispose();
}
