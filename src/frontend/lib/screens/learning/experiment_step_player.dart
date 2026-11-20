import 'dart:async';

import 'package:flutter/material.dart';

import '../../services/api_service.dart';
import '../../services/tts_service.dart';
import '../../theme/app_theme.dart';

/// Build the same same-origin picture URL the backend embeds in new lessons.
/// Old draft lessons have no URL field, so labels are normalized here too.
/// "棕熊卡片" must become "棕熊" — drawing the verbatim label would render a
/// picture of a card instead of the animal.
String? _pictureUrlFor(String label) {
  final cleaned = label.trim().replaceFirst(RegExp(r'(卡片|图片|插画|卡|图)$'), '');
  if (cleaned.isEmpty ||
      cleaned.length > 12 ||
      RegExp(r'[\\/<>\x00-\x1f]').hasMatch(cleaned)) {
    return null;
  }
  return '/api/learning/activity-image/${Uri.encodeComponent(cleaned)}';
}

/// Image.network cannot send an Authorization header; the JWT strategy also
/// accepts ?token= (same approach as tap_target_game.dart).
String? _withToken(String? url) {
  if (url == null || url.isEmpty) return null;
  var resolved = url;
  // Debug Flutter Web (flutter run on :8080) has no /api proxy, so a relative
  // /api/... picture URL would 404. Send it to whichever backend the rest of
  // the app uses. Release builds keep the relative path (nginx proxies it).
  if (url.startsWith('/api/') && ApiService.baseUrl.startsWith('http')) {
    final origin = ApiService.baseUrl.replaceFirst(RegExp(r'/api/?$'), '');
    resolved = '$origin$url';
  }
  final token = ApiService().token;
  return token == null || token.isEmpty
      ? resolved
      : '$resolved?token=${Uri.encodeComponent(token)}';
}

/// 屏幕内模拟实验步骤（science 领域「做」一步）。
///
/// 每步：读指令 → 点一点目标物 → 揭示现象（TTS）→ 观察选择题。
/// 全部步骤完成后展示结论。孩子独立完成，不依赖真实器材。
class ExperimentStepPlayer extends StatefulWidget {
  final Map<String, dynamic> data;
  final bool isCompleted;
  final void Function(int score, Map<String, dynamic> interactionData)
      onComplete;

  const ExperimentStepPlayer({
    super.key,
    required this.data,
    required this.isCompleted,
    required this.onComplete,
  });

  @override
  State<ExperimentStepPlayer> createState() => _ExperimentStepPlayerState();
}

class _ExpStep {
  final String instruction;
  final List<String> targets;
  final List<String?> targetImageUrls;
  final String reveal;
  final String observeQuestion;
  final List<String> observeOptions;
  final int correctIndex;

  _ExpStep({
    required this.instruction,
    required this.targets,
    required this.targetImageUrls,
    required this.reveal,
    required this.observeQuestion,
    required this.observeOptions,
    required this.correctIndex,
  });
}

enum _Phase { act, reveal, observe }

class _ExperimentStepPlayerState extends State<ExperimentStepPlayer> {
  final TtsService _tts = TtsService();

  late final String _question;
  late final List<String> _materials;
  late final List<String?> _materialImageUrls;
  late final List<_ExpStep> _steps;
  late final String _conclusion;

  int _stepIndex = 0;
  _Phase _phase = _Phase.act;
  String? _tappedTarget;
  String _feedback = '';
  bool _allDone = false;
  bool _speaking = false;

  final List<int> _observeAnswers = [];
  int _firstTryCorrect = 0;
  bool _currentStepFirstTry = true;

  @override
  void initState() {
    super.initState();
    final d = widget.data;
    _question = d['question']?.toString() ?? '';
    _materials = _stringList(d['materials']);
    _materialImageUrls = _pictureUrls(d['materialImageUrls'], _materials);
    _conclusion = d['conclusion']?.toString() ?? '';

    final steps = <_ExpStep>[];
    final rawSteps = d['steps'];
    if (rawSteps is List) {
      for (final s in rawSteps) {
        if (s is! Map) continue;
        final instruction = s['instruction']?.toString() ?? '';
        if (instruction.isEmpty) continue;
        final observe = s['observe'];
        final observeMap = observe is Map ? observe : const {};
        final options = _stringList(observeMap['options']);
        final targets = _stringList(s['targets']);
        final rawIndex = observeMap['correctIndex'];
        var correctIndex =
            (rawIndex is num) ? rawIndex.toInt() : 0;
        if (options.isEmpty || correctIndex < 0 || correctIndex >= options.length) {
          correctIndex = 0;
        }
        steps.add(_ExpStep(
          instruction: instruction,
          targets: targets,
          targetImageUrls: _pictureUrls(s['targetImageUrls'], targets),
          reveal: s['reveal']?.toString() ?? '',
          observeQuestion: observeMap['question']?.toString() ?? '',
          observeOptions: options,
          correctIndex: correctIndex,
        ));
      }
    }
    _steps = steps;

    if (!widget.isCompleted && _steps.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _speak(_steps[0].instruction));
    }
  }

  static List<String> _stringList(dynamic value) {
    if (value is! List) return const [];
    return value
        .map((e) => e?.toString().trim() ?? '')
        .where((e) => e.isNotEmpty)
        .toList();
  }

  /// Prefer the URL embedded by the backend; fall back to deriving one from
  /// the label so already-generated lessons gain picture cards immediately.
  static List<String?> _pictureUrls(dynamic value, List<String> labels) {
    return List<String?>.generate(labels.length, (i) {
      if (value is List && i < value.length) {
        final stored = value[i]?.toString().trim();
        if (stored != null && stored.isNotEmpty) return stored;
      }
      return _pictureUrlFor(labels[i]);
    });
  }

  Future<void> _speak(String text) async {
    if (text.isEmpty || !mounted) return;
    setState(() => _speaking = true);
    await _tts.speak(text);
    await _tts.onComplete;
    if (mounted) setState(() => _speaking = false);
  }

  Future<void> _tapTarget(String target) async {
    if (_phase != _Phase.act || _stepIndex >= _steps.length) return;
    final step = _steps[_stepIndex];
    setState(() {
      _tappedTarget = target;
      _phase = _Phase.reveal;
      _feedback = '';
    });
    if (step.reveal.isNotEmpty) {
      await _speak(step.reveal);
    }
  }

  void _goObserve() {
    final step = _steps[_stepIndex];
    if (step.observeOptions.isEmpty) {
      _advanceStep();
      return;
    }
    setState(() => _phase = _Phase.observe);
    _speak(step.observeQuestion);
  }

  void _pickObserve(int index) {
    if (_phase != _Phase.observe || _stepIndex >= _steps.length) return;
    final step = _steps[_stepIndex];
    if (index == step.correctIndex) {
      setState(() {
        _observeAnswers.add(index);
        if (_currentStepFirstTry) _firstTryCorrect += 1;
        _feedback = '观察得真仔细！';
      });
      _advanceStep();
    } else {
      setState(() {
        _currentStepFirstTry = false;
        _feedback = '再看看刚才发生了什么？';
      });
    }
  }

  Future<void> _advanceStep() async {
    await Future.delayed(const Duration(milliseconds: 900));
    if (!mounted) return;
    if (_stepIndex >= _steps.length - 1) {
      setState(() => _allDone = true);
      if (_conclusion.isNotEmpty) _speak(_conclusion);
      return;
    }
    setState(() {
      _stepIndex += 1;
      _phase = _Phase.act;
      _tappedTarget = null;
      _feedback = '';
      _currentStepFirstTry = true;
    });
    _speak(_steps[_stepIndex].instruction);
  }

  void _finish() {
    final total = _steps.length;
    final score = total == 0
        ? 85
        : 70 + (30 * _firstTryCorrect / total).round();
    widget.onComplete(score, {
      'stepsCompleted': _observeAnswers.length,
      'observeAnswers': _observeAnswers,
    });
  }

  @override
  void dispose() {
    _tts.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.isCompleted) {
      return _banner('🔬', '小实验完成啦！');
    }
    if (_steps.isEmpty) {
      return _banner('🔬', '这一步暂时没有实验内容');
    }
    if (_allDone) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_conclusion.isNotEmpty)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(
                color: const Color(0xFFE8F8FF),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '实验小发现',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppTheme.secondaryColor,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    _conclusion,
                    style: TextStyle(fontSize: 16, color: AppTheme.textColor),
                  ),
                ],
              ),
            ),
          _banner('🔬', '完成了 $_stepCount 步实验，真像小科学家！'),
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
              child: const Text('完成实验', style: TextStyle(fontSize: 16)),
            ),
          ),
        ],
      );
    }

    final step = _steps[_stepIndex];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (_question.isNotEmpty)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            margin: const EdgeInsets.only(bottom: 10),
            decoration: BoxDecoration(
              color: const Color(0xFFE8F8FF),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Text(
              '❓ $_question',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: AppTheme.textColor,
              ),
            ),
          ),
        if (_materials.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                Text('材料：',
                    style: TextStyle(
                        fontSize: 13, color: AppTheme.textSecondary)),
                for (var i = 0; i < _materials.length; i++)
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppTheme.active.card,
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: AppTheme.active.line),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _smallPicture(_materialImageUrls[i]),
                        if (_materialImageUrls[i] != null)
                          const SizedBox(width: 4),
                        Text(_materials[i],
                            style: TextStyle(
                                fontSize: 13, color: AppTheme.textColor)),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        Text(
          '第 ${_stepIndex + 1} / $_stepCount 步',
          style: TextStyle(fontSize: 13, color: AppTheme.textSecondary),
        ),
        const SizedBox(height: 8),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppTheme.active.card,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppTheme.active.line),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                _speaking ? Icons.volume_up_rounded : Icons.touch_app_rounded,
                size: 20,
                color: AppTheme.secondaryColor,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  step.instruction,
                  style: TextStyle(fontSize: 16, color: AppTheme.textColor),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        if (_phase == _Phase.act) _targetGrid(step),
        if (_phase == _Phase.reveal) _revealCard(step),
        if (_phase == _Phase.observe) _observeCard(step),
        if (_feedback.isNotEmpty) ...[
          const SizedBox(height: 10),
          Text(
            _feedback,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: AppTheme.secondaryColor,
            ),
          ),
        ],
      ],
    );
  }

  int get _stepCount => _steps.length;

  Widget _smallPicture(String? url) {
    final resolved = _withToken(url);
    if (resolved == null) return const SizedBox.shrink();
    return SizedBox(
      width: 18,
      height: 18,
      child: Image.network(
        resolved,
        fit: BoxFit.contain,
        errorBuilder: (_, __, ___) => const SizedBox.shrink(),
      ),
    );
  }

  Widget _targetGrid(_ExpStep step) {
    final targets = step.targets.isEmpty ? ['点一点'] : step.targets;
    final imageUrls = step.targetImageUrls.length == targets.length
        ? step.targetImageUrls
        : List<String?>.generate(
            targets.length, (i) => _pictureUrlFor(targets[i]));
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: [
        for (var i = 0; i < targets.length; i++)
          _PictureTargetCard(
            label: targets[i],
            imageUrl: imageUrls[i],
            selected: _tappedTarget == targets[i],
            onTap: () => _tapTarget(targets[i]),
          ),
      ],
    );
  }

  Widget _revealCard(_ExpStep step) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TweenAnimationBuilder<double>(
          tween: Tween(begin: 0.6, end: 1),
          duration: const Duration(milliseconds: 400),
          curve: Curves.elasticOut,
          builder: (context, scale, child) =>
              Transform.scale(scale: scale, child: child),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFFFFFBEB),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: const Color(0xFFFFD43B).withValues(alpha: 0.6),
              ),
            ),
            child: Text(
              step.reveal.isEmpty ? '发生神奇的变化啦！' : '✨ ${step.reveal}',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: AppTheme.textColor,
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: _speaking ? null : _goObserve,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.secondaryColor,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 13),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(999),
              ),
            ),
            child: Text(step.observeOptions.isEmpty ? '下一步' : '我来回答观察题'),
          ),
        ),
      ],
    );
  }

  Widget _observeCard(_ExpStep step) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          step.observeQuestion.isEmpty ? '你看到了什么？' : step.observeQuestion,
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            color: AppTheme.textColor,
          ),
        ),
        const SizedBox(height: 10),
        for (var i = 0; i < step.observeOptions.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: () => _pickObserve(i),
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 13),
                  side: BorderSide(color: AppTheme.active.line),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: Text(
                  step.observeOptions[i],
                  style: TextStyle(fontSize: 15, color: AppTheme.textColor),
                ),
              ),
            ),
          ),
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
}

/// A picture card for one experiment target: illustration on top, label below.
/// Tapping anywhere on the card keeps the original tap_target interaction.
class _PictureTargetCard extends StatefulWidget {
  final String label;
  final String? imageUrl;
  final bool selected;
  final VoidCallback onTap;

  const _PictureTargetCard({
    required this.label,
    required this.imageUrl,
    required this.selected,
    required this.onTap,
  });

  @override
  State<_PictureTargetCard> createState() => _PictureTargetCardState();
}

class _PictureTargetCardState extends State<_PictureTargetCard> {
  bool _failed = false;

  @override
  void didUpdateWidget(covariant _PictureTargetCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.imageUrl != widget.imageUrl) _failed = false;
  }

  @override
  Widget build(BuildContext context) {
    final resolved = _withToken(widget.imageUrl);
    final showPicture = resolved != null && !_failed;
    return GestureDetector(
      onTap: widget.onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        width: 108,
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
        decoration: BoxDecoration(
          color: widget.selected
              ? AppTheme.primaryColor.withValues(alpha: 0.15)
              : const Color(0xFFE8F8FF),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: widget.selected
                ? AppTheme.primaryColor
                : AppTheme.secondaryColor.withValues(alpha: 0.4),
            width: 2,
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 68,
              height: 68,
              child: showPicture
                  ? Image.network(
                      resolved,
                      fit: BoxFit.contain,
                      errorBuilder: (_, __, ___) {
                        if (!_failed) {
                          WidgetsBinding.instance.addPostFrameCallback((_) {
                            if (mounted) setState(() => _failed = true);
                          });
                        }
                        return _fallbackIcon();
                      },
                    )
                  : _fallbackIcon(),
            ),
            const SizedBox(height: 6),
            Text(
              widget.label,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppTheme.textColor,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _fallbackIcon() => Icon(
        Icons.touch_app_rounded,
        size: 40,
        color: AppTheme.secondaryColor.withValues(alpha: 0.7),
      );
}