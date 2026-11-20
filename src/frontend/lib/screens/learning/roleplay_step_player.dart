import 'dart:async';

import 'package:flutter/material.dart';

import '../../services/speech_recognition_service.dart';
import '../../services/tts_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/roleplay_voice.dart';

/// 角色扮演对话步骤（social 领域「演」一步）。
///
/// 每轮：场景/题目 TTS → 角色台词 TTS → 逐项播报选项 → 孩子跟读/应答。
/// 语音识别是增强路径，关键词宽松匹配；ASR 不可用或失败时全程可点选 options
/// 兜底（3-4 岁语音不可靠）。完成判定 = 完成轮数 ≥ minTurns。
///
/// 语音注意：底层 completion 事件在真机可能丢失，所有等待都有超时兜底，
/// 失败时明确提示并提供「再听一次 / 小喇叭」，绝不把孩子卡在「正在说话」。
class RoleplayStepPlayer extends StatefulWidget {
  final Map<String, dynamic> data;
  final String ageGroup;
  final bool isCompleted;
  final void Function(int score, Map<String, dynamic> interactionData)
      onComplete;

  /// 上层「朗读」按钮的重播信号；计数变化即重读当前轮。
  final ValueNotifier<int>? replaySignal;

  const RoleplayStepPlayer({
    super.key,
    required this.data,
    this.ageGroup = '',
    required this.isCompleted,
    required this.onComplete,
    this.replaySignal,
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
  late final String _ttsRate;
  late final String _listenHint;
  late final String _optionHint;

  int _turnIndex = 0;
  int _turnsCompleted = 0;
  bool _viaVoice = false;
  bool _asrSupported = false;
  bool _isListening = false;
  bool _isSpeaking = false;
  bool _isReadingOptions = false;
  bool _ttsUnavailable = false;
  int _activeOptionIndex = -1;
  bool _awaitingResponse = false;
  String _feedback = '';
  bool _allDone = false;

  /// 每次重新播报 +1，旧播报的异步结果据此作废，避免乱序串音。
  int _speakEpoch = 0;

  @override
  void initState() {
    super.initState();
    _ttsRate = roleplayTtsRate(widget.ageGroup);
    _listenHint = roleplayListenHint(widget.ageGroup);
    _optionHint = roleplayOptionHint(widget.ageGroup);

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

    final signal = widget.replaySignal;
    if (signal != null) {
      signal.addListener(_onReplaySignal);
    }

    if (!widget.isCompleted && _turns.isNotEmpty) {
      _tts.init();
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

  void _onReplaySignal() {
    if (!mounted || widget.isCompleted || _turns.isEmpty) return;
    _playTurn();
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

  /// 播报单句；返回 false 表示没有拿到可靠的播放完成信号（可能没声音）。
  Future<bool> _speakText(String text, int epoch) async {
    final clean = text.trim();
    if (clean.isEmpty) return true;
    try {
      await _tts.speak(clean, rate: _ttsRate);
      // 播放启动失败时 TtsService 会把 isSpeaking 置回 false（静默吞掉异常），
      // 这里据此标记「没声音」，让界面给出明确提示而不是假装播完了。
      if (!_tts.isSpeaking) return false;
      var completed = true;
      await _tts.onComplete.timeout(
        roleplayTtsTimeout(clean, rate: _ttsRate),
        onTimeout: () => completed = false,
      );
      return epoch == _speakEpoch && completed;
    } catch (_) {
      return false;
    }
  }

  Future<bool> _pause(int epoch, Duration duration) async {
    await Future.delayed(duration);
    return mounted && epoch == _speakEpoch;
  }

  Future<void> _playTurn() async {
    if (!mounted || _turnIndex >= _turns.length) return;
    final epoch = ++_speakEpoch;
    await _tts.stop();
    if (!mounted || epoch != _speakEpoch) return;

    final turn = _turns[_turnIndex];
    setState(() {
      _awaitingResponse = false;
      _feedback = '';
      _isSpeaking = true;
      _isReadingOptions = false;
      _ttsUnavailable = false;
      _activeOptionIndex = -1;
    });

    // 第一轮先读场景/题目，孩子才明白在演什么；后续轮只读台词避免啰嗦。
    if (_turnIndex == 0 && _scenario.isNotEmpty) {
      final ok = await _speakText('先听故事：$_scenario', epoch);
      if (!ok || !await _pause(epoch, const Duration(milliseconds: 350))) {
        return _finishSpeaking(epoch, ok: false);
      }
    }

    final line = turn.speakerName.isNotEmpty
        ? '${turn.speakerName}说：${turn.text}'
        : turn.text;
    final ok = await _speakText(line, epoch);
    if (!mounted || epoch != _speakEpoch) return;
    _finishSpeaking(epoch, ok: ok);
    if (ok && turn.options.isNotEmpty) {
      await _readOptions(epoch);
    }
  }

  void _finishSpeaking(int epoch, {required bool ok}) {
    if (!mounted || epoch != _speakEpoch) return;
    setState(() {
      _isSpeaking = false;
      _awaitingResponse = true;
      _ttsUnavailable = !ok;
      if (!ok) _feedback = '没听到声音？点小喇叭再试一次';
    });
  }

  /// 逐项朗读选项，并高亮当前正在读的那一项（低龄孩子不识字也能跟听）。
  Future<void> _readOptions(int epoch) async {
    if (!mounted || epoch != _speakEpoch || _turnIndex >= _turns.length) return;
    final options = _turns[_turnIndex].options;
    if (options.isEmpty) return;
    setState(() {
      _isReadingOptions = true;
      _activeOptionIndex = -1;
    });
    for (var i = 0; i < options.length; i++) {
      if (!mounted || epoch != _speakEpoch) return;
      setState(() => _activeOptionIndex = i);
      final ok = await _speakText('选项${i + 1}：${options[i]}', epoch);
      if (!ok) break;
      if (!await _pause(epoch, const Duration(milliseconds: 250))) return;
    }
    if (!mounted || epoch != _speakEpoch) return;
    setState(() {
      _isReadingOptions = false;
      _activeOptionIndex = -1;
    });
  }

  Future<void> _replayTurn() async {
    if (_isListening) await _stopListening();
    await _playTurn();
  }

  Future<void> _replayOptions() async {
    if (_turnIndex >= _turns.length || _turns[_turnIndex].options.isEmpty) {
      return;
    }
    final epoch = ++_speakEpoch;
    await _tts.stop();
    if (mounted && epoch == _speakEpoch) {
      await _readOptions(epoch);
    }
  }

  /// 单独重读某一项（点选项右侧小喇叭）。
  Future<void> _speakOption(int index) async {
    if (_turnIndex >= _turns.length) return;
    final option = _turns[_turnIndex].options[index];
    final epoch = ++_speakEpoch;
    await _tts.stop();
    if (!mounted || epoch != _speakEpoch) return;
    setState(() {
      _isReadingOptions = true;
      _activeOptionIndex = index;
      _ttsUnavailable = false;
    });
    final ok = await _speakText('选项${index + 1}：$option', epoch);
    if (!mounted || epoch != _speakEpoch) return;
    setState(() {
      _isReadingOptions = false;
      _activeOptionIndex = -1;
      if (!ok) _ttsUnavailable = true;
    });
  }

  /// 重读气泡里的任意一句（题目台词/孩子的示范回答）。
  Future<void> _speakBubble(String text) async {
    final epoch = ++_speakEpoch;
    await _tts.stop();
    if (!mounted || epoch != _speakEpoch) return;
    setState(() {
      // 可能打断场景/台词播报：直接进入可作答状态，避免卡在「正在说话」
      _isSpeaking = false;
      _awaitingResponse = true;
      _isReadingOptions = true;
      _activeOptionIndex = -1;
      _ttsUnavailable = false;
    });
    final ok = await _speakText(text, epoch);
    if (!mounted || epoch != _speakEpoch) return;
    setState(() {
      _isReadingOptions = false;
      if (!ok) _ttsUnavailable = true;
    });
  }

  Future<void> _startListening() async {
    final asr = _asr;
    if (asr == null || !_asrSupported || _isListening) return;
    if (_isReadingOptions) {
      ++_speakEpoch;
      await _tts.stop();
      if (!mounted) return;
      setState(() {
        _isReadingOptions = false;
        _activeOptionIndex = -1;
      });
    }
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

  Future<void> _pickOption(String option) async {
    if (!_awaitingResponse || _turnIndex >= _turns.length) return;
    // 孩子点了答案就停掉正在播的选项，避免声音压住他的操作反馈。
    ++_speakEpoch;
    await _tts.stop();
    if (!mounted) return;
    setState(() {
      _isReadingOptions = false;
      _activeOptionIndex = -1;
    });
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
    widget.replaySignal?.removeListener(_onReplaySignal);
    _speakEpoch++;
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
          onSpeak: () => _speakBubble(turn.text),
        ),
        const SizedBox(height: 10),
        if (turn.childLine.isNotEmpty)
          _speechBubble(
            name: '你',
            text: turn.childLine,
            isChild: true,
            onSpeak: () => _speakBubble(turn.childLine),
          ),
        const SizedBox(height: 12),
        if (_isSpeaking)
          _statusRow(Icons.volume_up_rounded, _listenHint)
        else if (_isReadingOptions)
          _statusRow(Icons.volume_up_rounded, _optionHint)
        else if (_isListening)
          _statusRow(Icons.mic_rounded, '我在听你说…')
        else if (_feedback.isNotEmpty)
          _statusRow(
            _ttsUnavailable ? Icons.warning_amber_rounded : Icons.chat_bubble_outline_rounded,
            _feedback,
            color: _ttsUnavailable ? AppTheme.warningColor : null,
          ),
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
          if (turn.options.isNotEmpty) ...[
            const SizedBox(height: 4),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: _replayOptions,
                icon: const Icon(Icons.volume_up_rounded, size: 18),
                label: Text(
                  _isReadingOptions ? '正在读选项…' : '听选项',
                  style: const TextStyle(fontSize: 13),
                ),
              ),
            ),
            const SizedBox(height: 2),
          ],
          for (var i = 0; i < turn.options.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _pickOption(turn.options[i]),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 13),
                        side: BorderSide(
                          color: _activeOptionIndex == i
                              ? AppTheme.primaryColor
                              : AppTheme.active.line,
                          width: _activeOptionIndex == i ? 2 : 1,
                        ),
                        backgroundColor: _activeOptionIndex == i
                            ? AppTheme.primaryColor.withValues(alpha: 0.12)
                            : null,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      child: Text(
                        turn.options[i],
                        style: TextStyle(
                          fontSize: 15,
                          color: AppTheme.textColor,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  SizedBox(
                    width: 46,
                    height: 46,
                    child: OutlinedButton(
                      onPressed: () => _speakOption(i),
                      style: OutlinedButton.styleFrom(
                        padding: EdgeInsets.zero,
                        side: BorderSide(color: AppTheme.active.line),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      child: Icon(
                        Icons.volume_up_rounded,
                        size: 20,
                        color: _activeOptionIndex == i
                            ? AppTheme.primaryColor
                            : AppTheme.textSecondary,
                      ),
                    ),
                  ),
                ],
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
    required VoidCallback onSpeak,
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
            Row(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Flexible(
                  child: Text(
                    text,
                    style: TextStyle(fontSize: 16, color: AppTheme.textColor),
                  ),
                ),
                const SizedBox(width: 6),
                InkWell(
                  onTap: onSpeak,
                  borderRadius: BorderRadius.circular(12),
                  child: Padding(
                    padding: const EdgeInsets.all(2),
                    child: Icon(
                      Icons.volume_up_rounded,
                      size: 18,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _statusRow(IconData icon, String text, {Color? color}) {
    return Row(
      children: [
        Icon(icon, size: 18, color: color ?? AppTheme.secondaryColor),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            text,
            style: TextStyle(
              fontSize: 13,
              color: color ?? AppTheme.textSecondary,
            ),
          ),
        ),
      ],
    );
  }
}
