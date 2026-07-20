// Speech Input Widget — 儿童友好的语音输入组件
//
// 点击切换模式：点一下开始录音，再点一下停止并发送
// 跨平台：
//   - Web: 浏览器原生 Web Speech API（不依赖任何插件）
//   - Android/iOS: speech_to_text 插件设备端引擎
//
// 集成 permission_handler 做显式权限请求

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

import '../services/speech_recognition_service.dart';
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

typedef SpeechResultCallback = void Function(String text);
typedef SpeechListeningCallback = void Function(bool isListening);

// ─── Widget ──────────────────────────────────────────────────────────────────

class SpeechInputWidget extends StatefulWidget {
  final SpeechResultCallback onResult;
  final String localeId;
  final double size;
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
  late SpeechRecognitionService _speech;
  SpeechInputState _state = SpeechInputState.idle;
  String _recognizedText = '';
  String _interimText = '';
  String _errorMessage = '';
  bool _supported = true;

  late AnimationController _pulseController;
  late Animation<double> _pulseScale;
  late Animation<double> _pulseOpacity;

  late AnimationController _waveController;
  late List<Animation<double>> _waveAnimations;

  Timer? _silenceTimer;
  Timer? _maxDurationTimer;
  bool _isTransitioning = false;

  @override
  void initState() {
    super.initState();
    _speech = createSpeechRecognitionService();

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

    // 异步检查平台是否支持
    _checkSupport();
  }

  Future<void> _checkSupport() async {
    final supported = await _speech.isSupported();
    if (mounted) {
      setState(() => _supported = supported);
      if (!supported) {
        _errorMessage = '当前浏览器不支持语音识别，建议使用 Chrome 或 Safari';
      }
    }
  }

  @override
  void dispose() {
    _silenceTimer?.cancel();
    _maxDurationTimer?.cancel();
    _pulseController.dispose();
    _waveController.dispose();
    _speech.dispose();
    super.dispose();
  }

  // ──────────────── 权限 ────────────────

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
      setState(() => _state = status.isPermanentlyDenied
          ? SpeechInputState.permissionDenied
          : SpeechInputState.idle);
    }
    return false;
  }

  // ──────────────── 点击切换 ────────────────

  /// 点击麦克风按钮：
  /// - idle/error → 开始录音
  /// - listening → 停止并发送
  Future<void> _onTap() async {
    if (_isTransitioning) return;

    if (_state == SpeechInputState.listening) {
      await _stopListening();
      return;
    }

    await _startListening();
  }

  Future<void> _startListening() async {
    _isTransitioning = true;
    try {
      // 1. 检查平台支持
      if (!_supported) {
        _errorMessage = '当前环境不支持语音识别';
        setState(() => _state = SpeechInputState.error);
        return;
      }

      // 2. 请求权限（mobile 平台）
      final hasPermission = await _requestPermission();
      if (!hasPermission) return;

      // 3. 启动识别
      _recognizedText = '';
      _interimText = '';
      setState(() => _state = SpeechInputState.listening);
      widget.onListeningChange?.call(true);
      _pulseController.repeat(reverse: true);

      final ok = await _speech.startListening(
        localeId: widget.localeId,
        onResult: (finalText, interim) {
          if (!mounted) return;
          setState(() {
            _recognizedText = finalText;
            _interimText = interim;
          });
          _resetSilenceTimer();
        },
        onStateChange: (isListening) {
          if (!mounted) return;
          if (!isListening && _state == SpeechInputState.listening) {
            // 录音意外停止（如浏览器自动停止），等待最终结果
            // 不直接 _stopListening，让 silenceTimer 或 onend 处理
            debugPrint('[speech] onStateChange(false) during listening — waiting for final result');
          }
        },
        onError: (err) {
          if (!mounted) return;
          debugPrint('Speech error: $err');
          _errorMessage = _mapError(err);
          setState(() => _state = SpeechInputState.error);
          widget.onListeningChange?.call(false);
          _pulseController.stop();
          _pulseController.reset();
        },
      );

      if (!ok) {
        if (mounted) {
          _errorMessage = '语音识别启动失败，请检查麦克风权限';
          setState(() => _state = SpeechInputState.error);
          widget.onListeningChange?.call(false);
          _pulseController.stop();
          _pulseController.reset();
        }
        return;
      }

      _resetSilenceTimer();
      // 最长录音 30 秒
      _maxDurationTimer?.cancel();
      _maxDurationTimer = Timer(const Duration(seconds: 30), () {
        if (_state == SpeechInputState.listening) {
          _stopListening();
        }
      });
    } finally {
      _isTransitioning = false;
    }
  }

  Future<void> _stopListening() async {
    _silenceTimer?.cancel();
    _maxDurationTimer?.cancel();
    _pulseController.stop();
    _pulseController.reset();

    // 先切到 processing 状态，防止 onStateChange(false) 触发再次 stop
    if (mounted) setState(() => _state = SpeechInputState.processing);

    // 调用 stop（Web Speech API 的 rec.stop() 是异步的）
    await _speech.stopListening();

    // 给浏览器 500ms 触发最后的 onresult(final result)
    // rec.stop() 后浏览器会异步触发一次带 isFinal=true 的 onresult
    await Future.delayed(const Duration(milliseconds: 500));

    // 最终文字 = final results + interim results
    final finalText = (_recognizedText + _interimText).trim();
    debugPrint('[speech] stopListening — final="$_recognizedText" interim="$_interimText" → "$finalText"');
    if (finalText.isNotEmpty) {
      widget.onResult(finalText);
    }

    if (mounted) {
      setState(() {
        _state = SpeechInputState.idle;
        _recognizedText = '';
        _interimText = '';
      });
    }
    widget.onListeningChange?.call(false);
  }

  void _resetSilenceTimer() {
    _silenceTimer?.cancel();
    _silenceTimer = Timer(const Duration(seconds: 8), () {
      if (_state == SpeechInputState.listening) {
        debugPrint('Silence timeout — auto-stopping');
        _stopListening();
      }
    });
  }

  String _mapError(String err) {
    switch (err) {
      case 'not_supported':
        return '当前浏览器不支持语音识别\n建议使用 Chrome 或 Safari';
      case 'not_allowed':
      case 'service-not-allowed':
        return '麦克风权限被拒绝\n请允许麦克风权限';
      case 'not_available':
        return '设备没有可用的语音识别引擎\n建议在系统设置中开启语音输入';
      case 'network':
        return '网络错误，请检查网络连接';
      case 'no_speech':
        return '没有检测到语音\n请再试一次';
      case 'aborted':
        return '';
      default:
        return '语音识别出错：$err';
    }
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

  Widget _buildIdleButton() {
    return GestureDetector(
      onTap: _onTap,
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

  Widget _buildListeningButton() {
    final size = widget.size;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _buildWaveformBars(),
        const SizedBox(height: 4),
        GestureDetector(
          onTap: _onTap,
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
        Text(
          (_recognizedText + _interimText).isEmpty
              ? '正在听…点击结束'
              : (_recognizedText + _interimText),
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color: AppTheme.warningColor.withValues(alpha: 0.8),
          ),
        ),
      ],
    );
  }

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

  Widget _buildErrorButton() {
    return GestureDetector(
      onTap: () {
        setState(() => _state = SpeechInputState.idle);
      },
      onLongPress: () {
        showDialog(
          context: context,
          builder: (ctx) => AlertDialog(
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppTheme.cardRadius),
            ),
            title: const Row(children: [
              Text('🎤', style: TextStyle(fontSize: 28)),
              SizedBox(width: 10),
              Text('语音识别不可用', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
            ]),
            content: Text(
              _errorMessage.isEmpty
                  ? '设备没有可用的语音识别引擎。\n\n建议在系统设置中检查语音输入功能，或改用键盘输入。'
                  : _errorMessage,
              style: const TextStyle(fontSize: 14, height: 1.5),
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('知道了')),
            ],
          ),
        );
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
          size: 24,
        ),
      ),
    );
  }
}
