// Speech Input Widget — 儿童友好的语音输入组件
//
// 提供两种交互模式：
// - 按住说话（press-and-hold），松开即识别
// - 点击切换（toggle），适合需要连续说话的场景
//
// 集成 permission_handler 做显式权限请求，
// 集成 speech_to_text 做设备端语音识别。

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;
import 'package:speech_to_text/speech_recognition_result.dart';

import '../theme/app_theme.dart';

// ─── 状态枚举 ────────────────────────────────────────────────────────────────

enum SpeechInputState {
  idle,
  listening,
  processing,
  error,
  permissionDenied,
}

// ─── 回调类型 ────────────────────────────────────────────────────────────────

/// 当语音识别产生最终结果时回调。
typedef SpeechResultCallback = void Function(String text);

/// 当录音状态变化（开始/结束录音）时回调。用于父组件 UI 联动。
typedef SpeechListeningCallback = void Function(bool isListening);

// ─── Widget ──────────────────────────────────────────────────────────────────

/// 可复用的语音输入按钮组件。
///
/// 使用示例：
/// ```dart
/// SpeechInputWidget(
///   onResult: (text) { print('识别结果: $text'); },
///   localeId: 'zh_CN',
/// )
/// ```
class SpeechInputWidget extends StatefulWidget {
  /// 语音识别结果回调（最终结果，非实时）。
  final SpeechResultCallback onResult;

  /// 识别语言区域（如 'zh_CN', 'en_US'），默认中文。
  final String localeId;

  /// 按钮尺寸。
  final double size;

  /// 录音状态变化回调。
  final SpeechListeningCallback? onListeningChange;

  const SpeechInputWidget({
    super.key,
    required this.onResult,
    this.localeId = 'zh_CN',
    this.size = 48,
    this.onListeningChange,
  });

  @override
  State<SpeechInputWidget> createState() => _SpeechInputWidgetState();
}

class _SpeechInputWidgetState extends State<SpeechInputWidget>
    with TickerProviderStateMixin {
  // ── 语音引擎 ──
  final stt.SpeechToText _speech = stt.SpeechToText();

  // ── 状态 ──
  SpeechInputState _state = SpeechInputState.idle;
  String _recognizedWords = '';

  // ── 动画 ──
  late AnimationController _pulseController;
  late Animation<double> _pulseScale;
  late Animation<double> _pulseOpacity;

  late AnimationController _waveController;
  late List<Animation<double>> _waveAnimations;

  // ── 定时器 ──
  Timer? _silenceTimer;

  // ── 防重入 ──
  bool _isTransitioning = false;

  // ──────────────── 生命周期 ────────────────

  @override
  void initState() {
    super.initState();

    // 脉冲动画（录音时缩放）
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );
    _pulseScale = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 1.0, end: 1.18), weight: 50),
      TweenSequenceItem(tween: Tween(begin: 1.18, end: 1.0), weight: 50),
    ]).animate(CurvedAnimation(
      parent: _pulseController,
      curve: Curves.easeInOut,
    ));
    _pulseOpacity = Tween<double>(begin: 1.0, end: 0.6).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );

    // 波形条动画
    _waveController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    );
    _waveAnimations = List.generate(5, (i) {
      final begin = 0.15 + (i * 0.05);
      final end = 0.7 + (i * 0.1);
      return TweenSequence<double>([
        TweenSequenceItem(
            tween: Tween(begin: begin, end: end.clamp(0.1, 1.0)), weight: 50),
        TweenSequenceItem(
            tween: Tween(begin: end.clamp(0.1, 1.0), end: begin), weight: 50),
      ]).animate(
        CurvedAnimation(
          parent: _waveController,
          curve: Interval(i * 0.08, 1.0, curve: Curves.easeInOut),
        ),
      );
    });
    _waveController.repeat(reverse: true);
  }

  @override
  void dispose() {
    if (_speech.isListening) {
      _speech.cancel();
    }
    _pulseController.dispose();
    _waveController.dispose();
    _silenceTimer?.cancel();
    super.dispose();
  }

  // ──────────────── 权限 ────────────────

  /// 请求麦克风权限。
  ///
  /// 返回 true 表示已授权，false 表示已拒或永久拒绝。
  Future<bool> _requestPermission() async {
    var status = await Permission.microphone.status;

    if (status.isGranted) return true;

    if (status.isPermanentlyDenied) {
      if (mounted) setState(() => _state = SpeechInputState.permissionDenied);
      return false;
    }

    status = await Permission.microphone.request();

    if (status.isGranted) return true;

    if (mounted) {
      setState(() =>
          status.isPermanentlyDenied
              ? SpeechInputState.permissionDenied
              : _state = SpeechInputState.idle);
    }
    return false;
  }

  // ──────────────── 语音控制 ────────────────

  Future<void> _startListening() async {
    if (_isTransitioning) return;
    _isTransitioning = true;
    try {
      final hasPermission = await _requestPermission();
      if (!hasPermission) return;

      // 初始化语音引擎
      bool available = _speech.isAvailable;
      if (!available) {
        available = await _speech.initialize(
          onStatus: _onSpeechStatus,
          onError: (error) {
            debugPrint('Speech error: ${error.errorMsg}');
            if (mounted) setState(() => _state = SpeechInputState.error);
          },
        );
      }

      if (!available) {
        if (mounted) setState(() => _state = SpeechInputState.error);
        return;
      }

      _recognizedWords = '';
      setState(() => _state = SpeechInputState.listening);
      widget.onListeningChange?.call(true);

      // 启动脉冲动画
      _pulseController.repeat(reverse: true);

      await _speech.listen(
        onResult: _onSpeechResult,
        listenOptions: stt.SpeechListenOptions(
          partialResults: true,
          onDevice: false,
          listenMode: stt.ListenMode.dictation,
          cancelOnError: false,
          localeId: widget.localeId,
        ),
      );

      // 设置 10 秒无语音自动停止
      _resetSilenceTimer();
    } finally {
      _isTransitioning = false;
    }
  }

  Future<void> _stopListening() async {
    _silenceTimer?.cancel();
    _pulseController.stop();
    _pulseController.reset();

    if (_speech.isListening) {
      await _speech.stop();
    }

    final finalText = _recognizedWords.trim();
    if (finalText.isNotEmpty) {
      widget.onResult(finalText);
    }

    if (mounted) setState(() => _state = SpeechInputState.idle);
    widget.onListeningChange?.call(false);
  }

  Future<void> _cancelListening() async {
    _silenceTimer?.cancel();
    _pulseController.stop();
    _pulseController.reset();

    if (_speech.isListening) {
      await _speech.cancel();
    }

    _recognizedWords = '';
    if (mounted) setState(() => _state = SpeechInputState.idle);
    widget.onListeningChange?.call(false);
  }

  // ──────────────── 回调 ────────────────

  void _onSpeechStatus(String status) {
    debugPrint('Speech status: $status');
    if (status == 'notListening' && _state == SpeechInputState.listening) {
      if (mounted) setState(() => _state = SpeechInputState.processing);
    }
  }

  void _onSpeechResult(SpeechRecognitionResult result) {
    if (!mounted) return;
    setState(() {
      _recognizedWords = result.recognizedWords;
    });

    // 每次收到新结果时重置静音计时器
    _resetSilenceTimer();

    if (result.finalResult && _recognizedWords.trim().isNotEmpty) {
      _stopListening();
    }
  }

  void _resetSilenceTimer() {
    _silenceTimer?.cancel();
    _silenceTimer = Timer(const Duration(seconds: 10), () {
      if (_state == SpeechInputState.listening && _speech.isListening) {
        debugPrint('Silence timeout — auto-stopping');
        _stopListening();
      }
    });
  }

  // ──────────────── 权限被拒 ────────────────

  void _openAppSettings() {
    openAppSettings();
  }

  // ──────────────── UI 构建 ────────────────

  @override
  Widget build(BuildContext context) {
    return switch (_state) {
      SpeechInputState.listening => _buildListeningButton(),
      SpeechInputState.processing => _buildProcessingButton(),
      SpeechInputState.error => _buildErrorButton(),
      SpeechInputState.permissionDenied => _buildPermissionDeniedButton(),
      SpeechInputState.idle => _buildIdleButton(),
    };
  }

  // ── 闲置状态：麦克风图标 ──

  Widget _buildIdleButton() {
    return GestureDetector(
      onLongPressStart: (_) => _startListening(),
      onLongPressEnd: (_) => _stopListening(),
      onLongPressCancel: () => _cancelListening(),
      child: Container(
        width: widget.size,
        height: widget.size,
        decoration: BoxDecoration(
          color: AppTheme.softBlue.withValues(alpha: 0.25),
          shape: BoxShape.circle,
          border: Border.all(
            color: AppTheme.secondaryColor.withValues(alpha: 0.4),
            width: 2,
          ),
          boxShadow: [
            BoxShadow(
              color: AppTheme.secondaryColor.withValues(alpha: 0.12),
              blurRadius: 10,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        child: const Icon(
          Icons.mic_rounded,
          color: AppTheme.secondaryColor,
          size: 24,
        ),
      ),
    );
  }

  // ── 录音中：脉冲麦克风 + 波形条 ──

  Widget _buildListeningButton() {
    final size = widget.size;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // 波形条（麦克风上方）
        _buildWaveformBars(),
        const SizedBox(height: 4),

        // 脉冲麦克风按钮
        GestureDetector(
          onLongPressEnd: (_) => _stopListening(),
          onTap: _stopListening,
          child: AnimatedBuilder(
            animation: _pulseController,
            builder: (context, child) {
              return Transform.scale(
                scale: _pulseScale.value,
                child: Container(
                  width: size,
                  height: size,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [
                        AppTheme.warningColor,
                        Color(0xFFFF6B6B),
                      ],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: AppTheme.warningColor.withValues(alpha: 
                          0.4 * _pulseOpacity.value,
                        ),
                        blurRadius: 20,
                        spreadRadius: 2,
                        offset: const Offset(0, 5),
                      ),
                    ],
                  ),
                  child: const Icon(
                    Icons.mic_rounded,
                    color: Colors.white,
                    size: 24,
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 4),

        // 提示文字
        Text(
          _recognizedWords.isEmpty ? '正在听…' : '松开结束',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color: AppTheme.warningColor.withValues(alpha: 0.8),
          ),
        ),
      ],
    );
  }

  /// 五根波形条动画
  Widget _buildWaveformBars() {
    return SizedBox(
      height: 20,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: List.generate(5, (index) {
          return AnimatedBuilder(
            animation: _waveController,
            builder: (context, child) {
              return Container(
                width: 4,
                height: 20 * _waveAnimations[index].value,
                margin: const EdgeInsets.symmetric(horizontal: 2),
                decoration: BoxDecoration(
                  color: AppTheme.warningColor.withValues(alpha: 0.6),
                  borderRadius: BorderRadius.circular(999),
                ),
              );
            },
          );
        }),
      ),
    );
  }

  // ── 识别处理中 ──

  Widget _buildProcessingButton() {
    return Container(
      width: widget.size,
      height: widget.size,
      decoration: BoxDecoration(
        color: AppTheme.softPurple.withValues(alpha: 0.25),
        shape: BoxShape.circle,
        border: Border.all(
          color: AppTheme.softPurple.withValues(alpha: 0.5),
          width: 2,
        ),
      ),
      child: const Padding(
        padding: EdgeInsets.all(10),
        child: CircularProgressIndicator(
          color: AppTheme.softPurple,
          strokeWidth: 3,
        ),
      ),
    );
  }

  // ── 识别失败 ──

  Widget _buildErrorButton() {
    return GestureDetector(
      onTap: () {
        setState(() => _state = SpeechInputState.idle);
      },
      child: Container(
        width: widget.size,
        height: widget.size,
        decoration: BoxDecoration(
          color: AppTheme.warningColor.withValues(alpha: 0.15),
          shape: BoxShape.circle,
          border: Border.all(
            color: AppTheme.warningColor.withValues(alpha: 0.4),
            width: 2,
          ),
        ),
        child: const Icon(
          Icons.error_outline_rounded,
          color: AppTheme.warningColor,
          size: 24,
        ),
      ),
    );
  }

  // ── 权限被拒 ──

  Widget _buildPermissionDeniedButton() {
    return GestureDetector(
      onTap: () {
        showDialog(
          context: context,
          builder: (ctx) {
            return AlertDialog(
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(AppTheme.cardRadius),
              ),
              title: const Row(
                children: [
                  Text('🎤', style: TextStyle(fontSize: 28)),
                  SizedBox(width: 10),
                  Text(
                    '需要麦克风权限',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 18,
                    ),
                  ),
                ],
              ),
              content: const Text(
                '灵犀伴学需要用麦克风来听你说话，\n这样才能用语音聊天哦~',
                style: TextStyle(fontSize: 14, height: 1.5),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(ctx).pop(),
                  child: const Text('取消'),
                ),
                FilledButton(
                  onPressed: () {
                    Navigator.of(ctx).pop();
                    _openAppSettings();
                  },
                  style: FilledButton.styleFrom(
                    backgroundColor: AppTheme.primaryColor,
                    shape: RoundedRectangleBorder(
                      borderRadius:
                          BorderRadius.circular(AppTheme.buttonRadius),
                    ),
                  ),
                  child: const Text('去设置'),
                ),
              ],
            );
          },
        );
      },
      child: Container(
        width: widget.size,
        height: widget.size,
        decoration: BoxDecoration(
          color: Colors.grey.withValues(alpha: 0.12),
          shape: BoxShape.circle,
          border: Border.all(
            color: AppTheme.textSecondary.withValues(alpha: 0.3),
            width: 2,
          ),
        ),
        child: const Icon(
          Icons.mic_off_rounded,
          color: AppTheme.textSecondary,
          size: 22,
        ),
      ),
    );
  }
}