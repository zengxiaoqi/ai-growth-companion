import 'dart:async';

import 'package:flutter/material.dart';

import '../../services/speech_recognition_service.dart';
import '../../services/tts_service.dart';
import '../../theme/app_theme.dart';

/// 角色扮演对话步骤（social 领域「演」一步）。
///
/// 每轮：角色台词 TTS → 孩子跟读/应答。语音识别是增强路径，关键词宽松
/// 匹配；ASR 不可用或失败时全程可点选 options 兜底（3-4 岁语音不可靠）。
/// 完成判定 = 完成轮数 ≥ minTurns。
class RoleplayStepPlayer extends StatefulWidget {
  final Map<String, dynamic> data;
  final bool isCompleted;
  final void Function(int score, Map<String, dynamic> interactionData)
      onComplete;

  const RoleplayStepPlayer({
    super.key,
    required this.data,
    required this.isCompleted,
    required this.onComplete,
  });

  @override
  State<RoleplayStepPlayer> createState() => _RoleplayStepPlayerState();
}

class _Turn {
  final String speakerName;
  final String text;
  final String childLine;
  final List<String> keywords;
  final List<String> options;

  _Turn({
    required this.speakerName,
    required this.text,
    required this.childLine,
    required this.keywords,
    required this.options,
  });

  bool isCorrectOption(String option) {
    if (option == childLine) return true;
    if (keywords.any((kw) => kw.isNotEmpty && option.contains(kw))) return true;
    return false;
  }

  bool matchesSpeech(String spoken) {
    final s = spoken.trim();
    if (s.length < 2) return false;
    if (keywords.any((kw) => kw.isNotEmpty && s.contains(kw))) return true;
    if (childLine.isNotEmpty &&
        (s.contains(childLine) || childLine.contains(s))) {
      return true;
    }
    return false;
  }
}

class _RoleplayStepPlayerState extends State<RoleplayStepPlayer> {
  final TtsService _tts = TtsService();
  SpeechRecognitionService? _asr;

  late final String _scenario;
  late final List<_Turn> _turns;
  late final int _minTurns;

  int _turnIndex = 0;
  int _turnsCompleted = 0;
  bool _viaVoice = false;
  bool _asrSupported = false;
  bool _isListening = false;
  bool _isSpeaking = false;
  bool _awaitingResponse = false;
  String _feedback = '';
  bool _allDone = false;

  @override
  void initState() {
    super.initState();
    final d = widget.data;
    _scenario = d['scenario']?.toString() ?? '';
    _minTurns = (d['minTurns'] is num)
        ? (d['minTurns'] as num).toInt().clamp(1, 10)
        : 3;

    final roleNames = <String, String>{};
    final roles = d['roles'];
    if (roles is List) {
      for (final r in roles) {
        if (r is Map) {
          final id = r['id']?.toString() ?? '';
          final name = r['name']?.toString() ?? '';
          if (id.isNotEmpty && name.isNotEmpty) roleNames[id] = name;
        }
      }
    }

    final turns = <_Turn>[];
    final rawTurns = d['turns'];
    if (rawTurns is List) {
      for (final t in rawTurns) {
        if (t is! Map) continue;
        final speaker = t['speaker']?.toString() ?? '';
        final text = t['text']?.toString() ?? '';
        if (text.isEmpty) continue;
        turns.add(_Turn(
          speakerName: roleNames[speaker] ?? speaker,
          text: text,
          childLine: t['childLine']?.toString() ?? '',
          keywords: _stringList(t['keywords']),
          options: _stringList(t['options']),
        ));
      }
    }
    _turns = turns;

    if (!widget.isCompleted && _turns.isNotEmpty) {
      _initAsr();
      WidgetsBinding.instance.addPostFrameCallback((_) => _playTurn());
    }
  }

  static List<String> _stringList(dynamic value) {
    if (value is! List) return const [];
    return value
        .map((e) => e?.toString().trim() ?? '')
        .where((e) => e.isNotEmpty)
        .toList();
  }

  Future<void> _initAsr() async {
    try {
      final asr = createSpeechRecognitionService();
      final supported = await asr.isSupported();
      if (!mounted) {
        asr.dispose();
        return;
      }
      setState(() {
        _asr = asr;
        _asrSupported = supported;
      });
    } catch (_) {
      // ASR 不可用时静默降级为点选
    }
  }

  Future<void> _playTurn() async {
    if (!mounted || _turnIndex >= _turns.length) return;
    final turn = _turns[_turnIndex];
    setState(() {
      _awaitingResponse = false;
      _feedback = '';
      _isSpeaking = true;
    });
    final line = turn.speakerName.isNotEmpty
        ? '${turn.speakerName}说：${turn.text}'
        : turn.text;
    await _tts.speak(line);
    await _tts.onComplete;
    if (!mounted) return;
    setState(() {
      _isSpeaking = false;
      _awaitingResponse = true;
    });
  }

  Future<void> _replayTurn() async {
    if (_isSpeaking || _isListening) return;
    await _playTurn();
  }

  Future<void> _startListening() async {
    final asr = _asr;
    if (asr == null || !_asrSupported || _isListening) return;
    setState(() {
      _isListening = true;
      _feedback = '我在听，大声说出来吧！';
    });
    final started = await asr.startListening(
      localeId: 'zh-CN',
      onResult: (finalText, interimText) {
        if (!mounted) return;
        if (finalText.trim().isEmpty) return;
        final turn = _turns[_turnIndex];
        if (turn.matchesSpeech(finalText)) {
          _succeedTurn(viaVoice: true);
        } else {
          setState(() => _feedback = '听到「$finalText」，再试试说「${turn.childLine}」');
        }
      },
      onStateChange: (listening) {
        if (!mounted) return;
        setState(() => _isListening = listening);
      },
      onError: (_) {
        if (!mounted) return;
        setState(() {
          _isListening = false;
          _feedback = '麦克风没听清，点下面的答案也可以哦';
        });
      },
    );
    if (!started && mounted) {
      setState(() {
        _isListening = false;
        _feedback = '麦克风暂时用不了，点下面的答案吧';
      });
    }
  }

  Future<void> _stopListening() async {
    try {
      await _asr?.stopListening();
    } catch (_) {}
    if (mounted) setState(() => _isListening = false);
  }

  void _pickOption(String option) {
    if (!_awaitingResponse || _turnIndex >= _turns.length) return;
    final turn = _turns[_turnIndex];
    final correct = turn.isCorrectOption(option) ||
        (!turn.options.any(turn.isCorrectOption) &&
            option == turn.options.first);
    if (correct) {
      _succeedTurn(viaVoice: false);
    } else {
      setState(() => _feedback = '再想想，${turn.speakerName}在等你的回答哦');
    }
  }

  Future<void> _succeedTurn({required bool viaVoice}) async {
    await _stopListening();
    if (!mounted) return;
    setState(() {
      _turnsCompleted += 1;
      if (viaVoice) _viaVoice = true;
      _feedback = '说得真好！';
      _awaitingResponse = false;
    });
    await Future.delayed(const Duration(milliseconds: 900));
    if (!mounted) return;
    if (_turnsCompleted >= _minTurns || _turnIndex >= _turns.length - 1) {
      setState(() => _allDone = true);
      return;
    }
    setState(() => _turnIndex += 1);
    await _playTurn();
  }

  void _finish() {
    widget.onComplete(85, {
      'turnsCompleted': _turnsCompleted,
      'viaVoice': _viaVoice,
    });
  }

  @override
  void dispose() {
    _tts.stop();
    _asr?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.isCompleted) {
      return _banner('🎭', '演得真棒！');
    }
    if (_turns.isEmpty) {
      return _banner('🎭', '这一步暂时没有对话内容');
    }
    if (_allDone) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _banner('🎭', '对话完成啦！你演了 $_turnsCompleted 轮'),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _finish,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primaryColor,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              child: const Text('完成表演', style: TextStyle(fontSize: 16)),
            ),
          ),
        ],
      );
    }

    final turn = _turns[_turnIndex];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (_scenario.isNotEmpty)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            margin: const EdgeInsets.only(bottom: 10),
            decoration: BoxDecoration(
              color: const Color(0xFFFFFBEB),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Text(
              _scenario,
              style: TextStyle(fontSize: 14, color: AppTheme.textColor),
            ),
          ),
        Text(
          '第 ${_turnIndex + 1} / ${_turns.length} 轮',
          style: TextStyle(fontSize: 13, color: AppTheme.textSecondary),
        ),
        const SizedBox(height: 8),
        _speechBubble(
          name: turn.speakerName.isEmpty ? '小伙伴' : turn.speakerName,
          text: turn.text,
          isChild: false,
        ),
        const SizedBox(height: 10),
        if (turn.childLine.isNotEmpty)
          _speechBubble(name: '你', text: turn.childLine, isChild: true),
        const SizedBox(height: 12),
        if (_isSpeaking)
          _statusRow(Icons.volume_up_rounded, '小伙伴在说话，认真听…')
        else if (_isListening)
          _statusRow(Icons.mic_rounded, '我在听你说…')
        else if (_feedback.isNotEmpty)
          _statusRow(Icons.chat_bubble_outline_rounded, _feedback),
        const SizedBox(height: 10),
        if (_awaitingResponse) ...[
          Row(
            children: [
              if (_asrSupported)
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: _isListening ? _stopListening : _startListening,
                    icon: Icon(_isListening ? Icons.stop_rounded : Icons.mic_rounded),
                    label: Text(_isListening ? '停止' : '我来说'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.secondaryColor,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                  ),
                ),
              if (_asrSupported) const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _replayTurn,
                  icon: const Icon(Icons.replay_rounded),
                  label: const Text('再听一次'),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          for (final option in turn.options)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: () => _pickOption(option),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    side: BorderSide(color: AppTheme.active.line),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  child: Text(
                    option,
                    style: TextStyle(fontSize: 15, color: AppTheme.textColor),
                  ),
                ),
              ),
            ),
        ],
      ],
    );
  }

  Widget _banner(String emoji, String text) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppTheme.successColor.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Text(emoji, style: const TextStyle(fontSize: 28)),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: AppTheme.textColor,
              ),
            ),
          ),
          Icon(Icons.check_circle_rounded, color: AppTheme.successColor),
        ],
      ),
    );
  }

  Widget _speechBubble({
    required String name,
    required String text,
    required bool isChild,
  }) {
    return Align(
      alignment: isChild ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 300),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isChild
              ? AppTheme.primaryColor.withValues(alpha: 0.12)
              : AppTheme.active.card,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppTheme.active.line),
        ),
        child: Column(
          crossAxisAlignment:
              isChild ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            Text(
              name,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: AppTheme.textSecondary,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              text,
              style: TextStyle(fontSize: 16, color: AppTheme.textColor),
            ),
          ],
        ),
      ),
    );
  }

  Widget _statusRow(IconData icon, String text) {
    return Row(
      children: [
        Icon(icon, size: 18, color: AppTheme.secondaryColor),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            text,
            style: TextStyle(fontSize: 13, color: AppTheme.textSecondary),
          ),
        ),
      ],
    );
  }
}