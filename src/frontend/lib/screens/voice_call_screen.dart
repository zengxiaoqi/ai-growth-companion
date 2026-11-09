// voice_call_screen.dart — 豆包式语音通话界面
//
// 全屏通话 UI + 连续对话循环：聆听 → 识别 → AI 碎碎念短回复 → TTS 播报 → 继续聆听。
// - 语音识别：SpeechRecognitionService（移动端 speech_to_text / Web 浏览器 API）
// - TTS：TtsService（后端 Edge TTS，zh-CN-XiaoxiaoNeural）
// - AI 回复：ChatSessionProvider.sendVoiceTurn（强制 casual 模式，口语短句）

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/chat_session_provider.dart';
import '../services/speech_recognition_service.dart';
import '../services/tts_service.dart';

enum _CallPhase { connecting, listening, thinking, speaking, muted, error }

extension _CallPhaseX on _CallPhase {
  String get label {
    switch (this) {
      case _CallPhase.connecting:
        return '正在接通…';
      case _CallPhase.listening:
        return '正在聆听…';
      case _CallPhase.thinking:
        return '对方思考中…';
      case _CallPhase.speaking:
        return '对方正在说话…';
      case _CallPhase.muted:
        return '已静音';
      case _CallPhase.error:
        return '麦克风不可用，请检查权限';
    }
  }

  bool get isRingPhase => this == _CallPhase.listening || this == _CallPhase.speaking;
}

class _CallTurn {
  final String role;
  final String content;
  _CallTurn(this.role, this.content);
}

class VoiceCallScreen extends StatefulWidget {
  const VoiceCallScreen({super.key});

  @override
  State<VoiceCallScreen> createState() => _VoiceCallScreenState();
}

class _VoiceCallScreenState extends State<VoiceCallScreen>
    with SingleTickerProviderStateMixin {
  static const _greeting = '喂？我在呢！今天有什么好玩的事呀，快说给我听听～';

  _CallPhase _phase = _CallPhase.connecting;
  bool _muted = false;
  bool _active = true;
  String _interim = '';
  final List<_CallTurn> _turns = [];
  int _elapsed = 0;
  Timer? _tick;

  SpeechRecognitionService? _speech;
  final TtsService _tts = TtsService();
  String _utteranceBuf = '';
  Timer? _commitTimer;
  // 提交/静音期间忽略 stopListening 冲刷出来的识别结果
  bool _suppressResults = false;
  // 识别引擎连续报错计数（成功收到结果时清零，防无限重启死循环）
  int _speechFailures = 0;

  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 2),
  );

  @override
  void initState() {
    super.initState();
    _tts.init();
    _turns.add(_CallTurn('assistant', _greeting));
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _elapsed++);
    });
    _connect();
  }

  @override
  void dispose() {
    _active = false;
    _tick?.cancel();
    _commitTimer?.cancel();
    _speech?.stopListening();
    _speech?.dispose();
    _speech = null;
    _tts.stop();
    _pulse.dispose();
    super.dispose();
  }

  Future<void> _connect() async {
    await Future.delayed(const Duration(milliseconds: 500));
    if (!_active) return;
    await _speak(_greeting);
  }

  /// TTS 播报，播完自动进入聆听
  Future<void> _speak(String text) async {
    if (!_active) return;
    setState(() => _phase = _CallPhase.speaking);
    await _tts.speak(text);
    // 30s 超时兜底：即使底层播报事件丢失，也绝不卡死在「对方正在说话」
    await _tts.onComplete.timeout(const Duration(seconds: 30),
        onTimeout: () {});
    if (!_active) return;
    setState(() => _phase = _CallPhase.listening);
    await _startListening();
  }

  Future<void> _startListening() async {
    if (!_active || _muted) return;
    _speech ??= createSpeechRecognitionService();
    final supported = await _speech!.isSupported();
    if (!supported) {
      if (mounted) setState(() => _phase = _CallPhase.error);
      return;
    }

    _utteranceBuf = '';
    _suppressResults = false;
    final ok = await _speech!.startListening(
      localeId: 'zh-CN',
      onResult: _onSpeechResult,
      onStateChange: (listening) {
        // 设备端引擎可能自动停止（无语音超时），聆听阶段兜底重启
        if (!listening && _active && !_muted && _phase == _CallPhase.listening) {
          final delay = 400 + _speechFailures * 300;
          Future.delayed(Duration(milliseconds: delay), () {
            if (_active && !_muted && _phase == _CallPhase.listening) {
              _startListening();
            }
          });
        }
      },
      onError: (err) {
        debugPrint('[voice-call] speech error: $err');
        final fatal = err.contains('not_') ||
            err.contains('denied') ||
            err.contains('permission');
        if (fatal) {
          if (mounted) setState(() => _phase = _CallPhase.error);
          return;
        }
        // 非致命错误计入失败，连续多次后停止自动重启，交还给用户
        _speechFailures++;
        if (_speechFailures >= 5 && mounted) {
          setState(() => _phase = _CallPhase.error);
        }
      },
    );
    if (!ok && mounted) {
      _speechFailures++;
      if (_speechFailures < 5) {
        // listen 启动失败，稍后重试而不是直接报错卡死
        Future.delayed(
            Duration(milliseconds: 800 + _speechFailures * 300), () {
          if (_active && !_muted && _phase == _CallPhase.listening) {
            _startListening();
          }
        });
      } else {
        setState(() => _phase = _CallPhase.error);
      }
    }
  }

  void _onSpeechResult(String finalText, String interimText) {
    if (!_active || _suppressResults) return;
    // 收到任何识别结果说明引擎工作正常，重置失败计数
    if (finalText.isNotEmpty || interimText.isNotEmpty) {
      _speechFailures = 0;
    }
    setState(() {
      _interim = interimText;
      if (finalText.isNotEmpty) _utteranceBuf = finalText;
    });
    // 静默判定：有内容后 800ms 无新结果就提交一轮
    if (_utteranceBuf.trim().isNotEmpty) {
      _commitTimer?.cancel();
      _commitTimer = Timer(const Duration(milliseconds: 800), _commitUtterance);
    }
  }

  Future<void> _commitUtterance() async {
    if (!_active) return;
    final text = _utteranceBuf.trim();
    if (text.isEmpty) return;

    // 在首个 await 之前取好 provider，避免跨 async gap 使用 BuildContext
    final provider = context.read<ChatSessionProvider>();
    _suppressResults = true;
    setState(() {
      _phase = _CallPhase.thinking;
      _interim = '';
    });
    await _speech?.stopListening();
    _suppressResults = false;
    _utteranceBuf = '';

    if (mounted) {
      setState(() => _turns.add(_CallTurn('user', text)));
    }
    String reply;
    try {
      reply = await provider.sendVoiceTurn(text);
    } catch (e) {
      debugPrint('[voice-call] sendVoiceTurn failed: $e');
      if (!_active || !mounted) return;
      reply = '哎呀，我这边信号不太好，你再说一遍好吗？';
    }
    if (!_active || !mounted) return;
    setState(() => _turns.add(_CallTurn('assistant', reply)));
    await _speak(reply);
  }

  Future<void> _toggleMute() async {
    final next = !_muted;
    setState(() => _muted = next);
    if (next) {
      _suppressResults = true;
      await _speech?.stopListening();
      if (mounted) setState(() => _phase = _CallPhase.muted);
    } else {
      if (mounted) setState(() => _phase = _CallPhase.listening);
      await _startListening();
    }
  }

  Future<void> _hangUp() async {
    _active = false;
    _tick?.cancel();
    _commitTimer?.cancel();
    await _speech?.stopListening();
    _speech?.dispose();
    _speech = null;
    await _tts.stop();
    if (mounted) Navigator.of(context).pop();
  }

  String get _durationText {
    final mm = (_elapsed ~/ 60).toString().padLeft(2, '0');
    final ss = (_elapsed % 60).toString().padLeft(2, '0');
    return '$mm:$ss';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        width: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF0F172A), Color(0xFF1E1B4B), Color(0xFF0F172A)],
          ),
        ),
        child: SafeArea(
          child: Column(children: [
            const SizedBox(height: 16),
            const Text(
              'AI 学习伙伴 · 小犀',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              _elapsed > 0 && _phase != _CallPhase.error
                  ? '${_phase.label}  $_durationText'
                  : _phase.label,
              style: TextStyle(
                fontSize: 12,
                color: _phase == _CallPhase.error
                    ? const Color(0xFFFCA5A5)
                    : Colors.white70,
              ),
            ),
            // 头像 + 呼吸环
            Expanded(
              flex: 3,
              child: Center(
                child: _buildAvatarWithRings(),
              ),
            ),
            // 实时识别文字
            SizedBox(
              height: 28,
              child: _interim.isNotEmpty && _phase == _CallPhase.listening
                  ? Text(
                      '$_interim…',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 13,
                        fontStyle: FontStyle.italic,
                        color: Colors.white60,
                      ),
                    )
                  : const SizedBox.shrink(),
            ),
            // 通话记录（最近几轮）
            Expanded(
              flex: 4,
              child: ListView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 4),
                itemCount: _turns.length,
                itemBuilder: (ctx, i) {
                  final turn = _turns[i];
                  final isUser = turn.role == 'user';
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Align(
                      alignment:
                          isUser ? Alignment.centerRight : Alignment.centerLeft,
                      child: Container(
                        constraints: BoxConstraints(
                          maxWidth: MediaQuery.of(context).size.width * 0.8,
                        ),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 8),
                        decoration: BoxDecoration(
                          color: isUser
                              ? Colors.white.withValues(alpha: 0.20)
                              : Colors.white.withValues(alpha: 0.10),
                          borderRadius: BorderRadius.only(
                            topLeft: const Radius.circular(16),
                            topRight: const Radius.circular(16),
                            bottomLeft: Radius.circular(isUser ? 16 : 4),
                            bottomRight: Radius.circular(isUser ? 4 : 16),
                          ),
                        ),
                        child: Text(
                          turn.content,
                          style: TextStyle(
                            fontSize: 14,
                            height: 1.4,
                            color: isUser
                                ? Colors.white
                                : Colors.white.withValues(alpha: 0.92),
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            // 底部控制：静音 / 挂断
            Padding(
              padding: const EdgeInsets.only(bottom: 24, top: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const SizedBox(width: 28),
                  _circleButton(
                    size: 56,
                    background: _muted
                        ? Colors.white
                        : Colors.white.withValues(alpha: 0.15),
                    icon: Icon(
                      _muted
                          ? Icons.mic_off_rounded
                          : Icons.mic_rounded,
                      size: 26,
                      color: _muted
                          ? const Color(0xFF0F172A)
                          : Colors.white,
                    ),
                    onTap: _phase == _CallPhase.error ? null : _toggleMute,
                  ),
                  const SizedBox(width: 40),
                  _circleButton(
                    size: 64,
                    background: const Color(0xFFEF4444),
                    icon: const Icon(Icons.call_end_rounded,
                        size: 30, color: Colors.white),
                    onTap: _hangUp,
                  ),
                  const SizedBox(width: 28),
                ],
              ),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _buildAvatarWithRings() {
    final ringsActive = _active && _phase.isRingPhase;
    if (ringsActive) _pulse.repeat(reverse: true);
    return Stack(
      alignment: Alignment.center,
      children: [
        if (ringsActive) ...[
          FadeTransition(
            opacity: Tween(begin: 0.35, end: 0.05).animate(_pulse),
            child: ScaleTransition(
              scale: Tween(begin: 1.0, end: 1.6).animate(
                CurvedAnimation(parent: _pulse, curve: Curves.easeOut),
              ),
              child: Container(
                width: 140,
                height: 140,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withValues(alpha: 0.10),
                ),
              ),
            ),
          ),
        ],
        Container(
          width: 128,
          height: 128,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: Colors.white.withValues(alpha: 0.15),
            border: Border.all(color: Colors.white24, width: 1),
            boxShadow: const [
              BoxShadow(
                color: Colors.black38,
                blurRadius: 24,
                offset: Offset(0, 8),
              ),
            ],
          ),
          child: const Icon(
            Icons.smart_toy_rounded,
            size: 60,
            color: Colors.white,
          ),
        ),
      ],
    );
  }

  Widget _circleButton({
    required double size,
    required Color background,
    required Widget icon,
    VoidCallback? onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(shape: BoxShape.circle, color: background),
        alignment: Alignment.center,
        child: icon,
      ),
    );
  }
}
