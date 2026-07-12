import 'dart:async';
import 'package:flutter/material.dart';
import '../../services/tts_service.dart';

/// 游戏 TTS 语音播报 Mixin
///
/// 提供游戏场景下的语音播报能力：
/// - 自动朗读题目内容
/// - 朗读选项（可选）
/// - 朗读答题反馈（答对/答错）
/// - 支持手动点击喇叭按钮重新朗读
/// - 自动管理 TTS 生命周期（dispose 时停止）
///
/// 用法：
/// ```dart
/// class _MyGameState extends State<MyGame> with GameTtsHelper {
///   @override
///   void dispose() {
///     disposeTts();
///     super.dispose();
///   }
/// }
/// ```
mixin GameTtsHelper<T extends StatefulWidget> on State<T> {
  final TtsService _tts = TtsService();
  bool _ttsEnabled = true;
  Timer? _autoSpeakTimer;

  /// TTS 是否启用
  bool get ttsEnabled => _ttsEnabled;

  /// 切换 TTS 开关
  void toggleTts() {
    setState(() => _ttsEnabled = !_ttsEnabled);
    if (!_ttsEnabled) {
      _tts.stop();
    }
  }

  /// 朗读文本（如果 TTS 启用）
  Future<void> speak(String text) async {
    if (!_ttsEnabled || !mounted) return;
    await _tts.speak(text);
  }

  /// 停止朗读
  Future<void> stopSpeaking() async {
    await _tts.stop();
  }

  /// 延迟后朗读（用于等待 UI 动画完成）
  Future<void> speakAfterDelay(String text, {Duration delay = const Duration(milliseconds: 400)}) async {
    _autoSpeakTimer?.cancel();
    _autoSpeakTimer = Timer(delay, () {
      if (mounted && _ttsEnabled) {
        _tts.speak(text);
      }
    });
  }

  /// 等待当前朗读完成
  Future<void> get onComplete => _tts.onComplete;

  /// 构建 TTS 控制按钮（喇叭图标）
  Widget buildTtsToggleButton() {
    return IconButton(
      icon: Icon(
        _ttsEnabled ? Icons.volume_up_rounded : Icons.volume_off_rounded,
        color: _ttsEnabled ? const Color(0xFF6C5CE7) : Colors.grey,
      ),
      onPressed: toggleTts,
      tooltip: _ttsEnabled ? '关闭语音' : '开启语音',
    );
  }

  /// 构建重新朗读按钮
  Widget buildReplayButton(String text, {Color color = const Color(0xFF6C5CE7)}) {
    return IconButton(
      icon: Icon(Icons.campaign_rounded, color: color, size: 22),
      onPressed: () => speak(text),
      tooltip: '重新朗读',
    );
  }

  /// 释放 TTS 资源
  void disposeTts() {
    _autoSpeakTimer?.cancel();
    _tts.stop();
  }
}
