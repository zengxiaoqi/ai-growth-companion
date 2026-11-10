import 'dart:async';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import 'game_completion_screen.dart';

/// 描红游戏（方案 B 第四种参数化题型）。
///
/// 与 Web 端 TracePathGame 使用同一套参数契约与计分规则（附录 H.2）：
/// - LLM 只提供 1-2 个常用字/数字/字母，**不提供任何坐标**——采样点由
///   客户端把字形渲染到离屏画布后按像素 alpha 生成（与 Web 端一致）；
/// - 手指沿浅色引导字描画，抬笔静止 1 秒后评估覆盖率：
///   达到 minCoverage 即锁定该字，否则清笔重描并累计失败次数；
/// - 计分：每个字第一次评估就达标（firstTry）记 1 分，
///   score = round(firstTry / targets * 100)；
/// - 回传 perTarget（coverage/attempts/firstTry）供成长报告使用。
class TracePathGame extends StatefulWidget {
  final Map<String, dynamic> data;
  final VoidCallback onExit;
  final ValueChanged<Map<String, dynamic>>? onFinished;

  const TracePathGame({
    super.key,
    required this.data,
    required this.onExit,
    this.onFinished,
  });

  @override
  State<TracePathGame> createState() => _TracePathGameState();
}

class _GlyphTarget {
  final String id;
  final String text;
  final String label;

  const _GlyphTarget({required this.id, required this.text, required this.label});
}

/// 字形白名单：常用汉字 / 数字 / 英文字母，1-2 个字符。
/// emoji 与生僻字会导致采样退化到整块包围盒，等同取消判定，直接丢弃。
final RegExp _glyphTextRe = RegExp(r'^[\u4e00-\u9fa5a-zA-Z0-9]+$');

bool _isValidGlyphText(String value) {
  final runes = value.runes.toList();
  return runes.isNotEmpty && runes.length <= 2 && _glyphTextRe.hasMatch(value);
}

String _clip(String value, int maxRunes) {
  if (value.runes.length <= maxRunes) return value;
  return String.fromCharCodes(value.runes.take(maxRunes));
}

int _toInt(dynamic value, int fallback) {
  return int.tryParse(value?.toString() ?? '') ?? fallback;
}

double _toDouble(dynamic value, double fallback) {
  return double.tryParse(value?.toString() ?? '') ?? fallback;
}

String _cleanId(String value) {
  return value.trim().replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '');
}

class _TracePathGameState extends State<TracePathGame> {
  static const double _canvasSize = 300;
  static const double _brushRadius = 16;
  static const int _sampleStep = 6;
  static const double _glyphFontSizeRatio = 0.58;
  /// 抬笔后静止多久才评估（与 Web 端一致）。
  static const Duration _evaluateDelay = Duration(seconds: 1);

  static const int _maxTargets = 4;
  static const int _minTargets = 2;

  List<_GlyphTarget> _targets = const [];
  double _minCoverage = 0.7;
  int _passingScore = 80;
  int _timeLimitSec = 180;
  late int _startedAt;

  int _index = 0;
  List<ui.Offset> _samples = const [];
  final Set<int> _covered = <int>{};
  final List<Path> _strokes = <Path>[];
  ui.Offset? _lastPoint;
  bool _drawing = false;
  int _failures = 0;
  final List<Map<String, dynamic>> _perTarget = <Map<String, dynamic>>[];
  final Set<String> _passedIds = <String>{};
  String? _feedback;
  bool _finished = false;
  bool _completedCalled = false;

  /// 通知 CustomPainter 重绘笔画（避免每次移动都 setState 整棵树）。
  final ValueNotifier<int> _repaint = ValueNotifier<int>(0);
  Timer? _evaluateTimer;
  Timer? _advanceTimer;
  Timer? _clearTimer;

  _GlyphTarget? get _current =>
      _index >= 0 && _index < _targets.length ? _targets[_index] : null;

  @override
  void initState() {
    super.initState();
    _reset();
  }

  @override
  void dispose() {
    _evaluateTimer?.cancel();
    _advanceTimer?.cancel();
    _clearTimer?.cancel();
    _repaint.dispose();
    super.dispose();
  }

  void _reset() {
    _targets = _parseTargets(widget.data['targets']);
    final rawCoverage = _toDouble(widget.data['minCoverage'], 0.7);
    _minCoverage = rawCoverage > 0
        ? rawCoverage.clamp(0.5, 0.85).toDouble()
        : 0.7;
    _passingScore = _toInt(widget.data['passingScore'], 80).clamp(0, 100).toInt();
    _timeLimitSec = _toInt(widget.data['timeLimitSec'], 180).clamp(30, 300).toInt();
    _startedAt = DateTime.now().millisecondsSinceEpoch;
    _index = 0;
    _strokes.clear();
    _covered.clear();
    _lastPoint = null;
    _drawing = false;
    _failures = 0;
    _perTarget.clear();
    _passedIds.clear();
    _feedback = null;
    _finished = false;
    _completedCalled = false;
    _buildSamples();
  }

  List<_GlyphTarget> _parseTargets(dynamic raw) {
    if (raw is! List) return const [];
    final usedIds = <String>{};
    final usedTexts = <String>{};
    final result = <_GlyphTarget>[];
    for (var i = 0; i < raw.length && result.length < _maxTargets; i++) {
      final entry = raw[i];
      if (entry is! Map) continue;
      final map = entry.map((k, v) => MapEntry(k.toString(), v));
      // polyline 模式仅限人工课程内容，LLM 生成一律丢弃。
      final kind = map['kind']?.toString().trim();
      if (kind != null && kind.isNotEmpty && kind != 'glyph') continue;
      final text = _clip((map['text']?.toString() ?? '').trim(), 8);
      if (!_isValidGlyphText(text) || usedTexts.contains(text)) continue;
      usedTexts.add(text);
      var id = _cleanId(map['id']?.toString() ?? '');
      if (id.isEmpty) id = 'g${i + 1}';
      id = _clip(id, 32);
      var suffix = 2;
      while (usedIds.contains(id)) {
        id = 'g${i + 1}_${suffix++}';
      }
      usedIds.add(id);
      final label = _clip((map['label']?.toString() ?? '').trim(), 12);
      result.add(_GlyphTarget(id: id, text: text, label: label.isEmpty ? text : label));
    }
    return result;
  }

  /// 把字形渲染到离屏画布，按 alpha 像素生成采样点（与 Web 端同算法）。
  Future<void> _buildSamples() async {
    final target = _current;
    if (target == null) return;
    final samples = await _sampleGlyph(target.text);
    if (!mounted || _current?.id != target.id) return;
    setState(() {
      _samples = samples;
      _covered.clear();
      _strokes.clear();
      _lastPoint = null;
      _failures = 0;
      _feedback = null;
      _repaint.value++;
    });
  }

  Future<List<ui.Offset>> _sampleGlyph(String text) async {
    final size = _canvasSize.toInt();
    final recorder = ui.PictureRecorder();
    final canvas = ui.Canvas(recorder);
    final textPainter = TextPainter(
      text: TextSpan(
        text: text,
        style: TextStyle(
          fontSize: _canvasSize * _glyphFontSizeRatio,
          fontWeight: FontWeight.w900,
          color: ui.Color.fromARGB(255, 0, 0, 0),
        ),
      ),
      textDirection: TextDirection.ltr,
      textAlign: TextAlign.center,
    )..layout(maxWidth: _canvasSize);
    textPainter.paint(
      canvas,
      ui.Offset(
        (_canvasSize - textPainter.width) / 2,
        (_canvasSize - textPainter.height) / 2,
      ),
    );
    final picture = recorder.endRecording();
    final image = await picture.toImage(size, size);
    picture.dispose();
    final byteData = await image.toByteData(format: ui.ImageByteFormat.rawRgba);
    textPainter.dispose();
    image.dispose();
    if (byteData == null) return const [];

    final samples = <ui.Offset>[];
    for (var y = 0; y < size; y += _sampleStep) {
      for (var x = 0; x < size; x += _sampleStep) {
        final alpha = byteData.getUint8((y * size + x) * 4 + 3);
        if (alpha > 128) {
          samples.add(ui.Offset(x.toDouble(), y.toDouble()));
        }
      }
    }
    return samples;
  }

  void _onPanStart(DragStartDetails details) {
    if (_finished || _completedCalled) return;
    final current = _current;
    if (current == null || _passedIds.contains(current.id)) return;
    _evaluateTimer?.cancel();
    _evaluateTimer = null;
    _drawing = true;
    _lastPoint = null;
    _strokeTo(details.localPosition);
  }

  void _onPanUpdate(DragUpdateDetails details) {
    if (!_drawing) return;
    _strokeTo(details.localPosition);
  }

  void _onPanEnd(DragEndDetails details) {
    if (!_drawing) return;
    _drawing = false;
    _lastPoint = null;
    _scheduleEvaluate();
  }

  void _strokeTo(ui.Offset point) {
    if (point.dx < 0 ||
        point.dy < 0 ||
        point.dx > _canvasSize ||
        point.dy > _canvasSize) {
      return;
    }
    final path = Path();
    final last = _lastPoint;
    if (last != null) {
      path.moveTo(last.dx, last.dy);
      path.lineTo(point.dx, point.dy);
    } else {
      path.addOval(
        Rect.fromCircle(center: point, radius: _brushRadius / 2),
      );
    }
    _strokes.add(path);
    _lastPoint = point;

    final reach = _brushRadius + _sampleStep * 0.5;
    final reachSq = reach * reach;
    for (var i = 0; i < _samples.length; i++) {
      if (_covered.contains(i)) continue;
      final dx = _samples[i].dx - point.dx;
      final dy = _samples[i].dy - point.dy;
      if (dx * dx + dy * dy <= reachSq) _covered.add(i);
    }
    _repaint.value++;
  }

  void _scheduleEvaluate() {
    _evaluateTimer?.cancel();
    _evaluateTimer = Timer(_evaluateDelay, () {
      _evaluateTimer = null;
      if (!_drawing) _evaluate();
    });
  }

  void _evaluate() {
    final current = _current;
    if (current == null || _samples.isEmpty || _finished || _completedCalled) return;
    final coverage = _covered.length / _samples.length;
    final passed = coverage >= _minCoverage;
    if (passed) {
      final record = <String, dynamic>{
        'id': current.id,
        'coverage': (coverage * 100).round() / 100,
        'attempts': _failures + 1,
        'firstTry': _failures == 0,
      };
      _perTarget.removeWhere((entry) => entry['id'] == record['id']);
      _perTarget.add(record);
      _passedIds.add(current.id);
      setState(() => _feedback = '真棒，描得很准！');
      if (_passedIds.length >= _targets.length) {
        _finish();
      } else {
        _advanceTimer?.cancel();
        _advanceTimer = Timer(const Duration(milliseconds: 900), () {
          _advanceTimer = null;
          if (!mounted || _finished) return;
          setState(() {
            _index = (_index + 1).clamp(0, _targets.length - 1).toInt();
          });
          _buildSamples();
        });
      }
    } else {
      setState(() {
        _failures += 1;
        _feedback = '没关系，再描一次试试看！';
      });
      _clearTimer?.cancel();
      _clearTimer = Timer(const Duration(milliseconds: 450), () {
        _clearTimer = null;
        if (!mounted || _passedIds.contains(current.id)) return;
        setState(() {
          _covered.clear();
          _strokes.clear();
          _lastPoint = null;
          _repaint.value++;
        });
      });
    }
  }

  void _finish() {
    if (_completedCalled) return;
    _completedCalled = true;
    final firstTryCount = _perTarget.where((entry) => entry['firstTry'] == true).length;
    final total = _targets.length;
    final seconds = ((DateTime.now().millisecondsSinceEpoch - _startedAt) / 1000)
        .round()
        .clamp(0, 86400)
        .toInt();

    widget.onFinished?.call({
      'score': total > 0 ? ((firstTryCount / total) * 100).round() : 0,
      'totalQuestions': total,
      'correctAnswers': firstTryCount,
      'timeSpent': seconds,
      'interactionData': {
        'activityType': 'trace_path',
        'engine': 'parameterized',
        'passingScore': _passingScore,
        'timeLimitSec': _timeLimitSec,
        'minCoverage': _minCoverage,
        'perTarget': _perTarget.map((entry) => Map<String, dynamic>.from(entry)).toList(),
      },
    });

    setState(() => _finished = true);
  }

  @override
  Widget build(BuildContext context) {
    final current = _current;
    if (_targets.isEmpty || current == null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.draw_outlined, size: 48, color: AppTheme.textSecondary),
            const SizedBox(height: 12),
            const Text('暂无描红题目'),
            const SizedBox(height: 12),
            FilledButton(onPressed: widget.onExit, child: const Text('返回')),
          ],
        ),
      );
    }

    if (_finished) {
      final firstTryCount = _perTarget.where((entry) => entry['firstTry'] == true).length;
      return GameCompletionScreen(
        title: widget.data['title']?.toString() ?? '描红游戏',
        score: firstTryCount,
        total: _targets.length,
        onPlayAgain: () => setState(_reset),
        onBack: widget.onExit,
      );
    }

    final glyphIndex = _targets.indexWhere((t) => t.id == current.id);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            widget.data['title']?.toString() ?? '描红游戏',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
          ),
          const SizedBox(height: 6),
          Text(
            (widget.data['prompt']?.toString().isNotEmpty == true)
                ? widget.data['prompt'].toString()
                : '用手指沿着浅色的字描一描',
            style: TextStyle(
              color: AppTheme.textSecondary,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '第 ${glyphIndex + 1} / ${_targets.length} 个 · 建议在 $_timeLimitSec 秒内完成',
            style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (final target in _targets)
                Container(
                  width: 10,
                  height: 10,
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: _passedIds.contains(target.id)
                        ? AppTheme.primaryColor
                        : target.id == current.id
                            ? AppTheme.primaryColor.withValues(alpha: 0.4)
                            : Colors.grey.withValues(alpha: 0.3),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          Center(
            child: GestureDetector(
              onPanStart: _onPanStart,
              onPanUpdate: _onPanUpdate,
              onPanEnd: _onPanEnd,
              onPanCancel: () {
                _drawing = false;
                _lastPoint = null;
                _scheduleEvaluate();
              },
              child: Container(
                width: _canvasSize,
                height: _canvasSize,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: Colors.grey.withValues(alpha: 0.4),
                    width: 1.6,
                  ),
                ),
                child: CustomPaint(
                  painter: _TracePathPainter(
                    glyph: current.text,
                    strokes: _strokes,
                    repaint: _repaint,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            current.text,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.w900,
              letterSpacing: 8,
            ),
          ),
          if (_feedback != null) ...[
            const SizedBox(height: 10),
            Text(
              _feedback!,
              textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ],
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

class _TracePathPainter extends CustomPainter {
  final String glyph;
  final List<Path> strokes;
  final ValueNotifier<int> repaint;

  _TracePathPainter({
    required this.glyph,
    required this.strokes,
    required this.repaint,
  }) : super(repaint: repaint);

  static const double _canvasSize = _TracePathGameState._canvasSize;
  static const double _glyphFontSizeRatio = _TracePathGameState._glyphFontSizeRatio;
  static const double _brushRadius = _TracePathGameState._brushRadius;

  @override
  void paint(Canvas canvas, ui.Size size) {
    // 引导字形（浅灰）
    final textPainter = TextPainter(
      text: TextSpan(
        text: glyph,
        style: TextStyle(
          fontSize: _canvasSize * _glyphFontSizeRatio,
          fontWeight: FontWeight.w900,
          color: const ui.Color(0x4764748B),
        ),
      ),
      textDirection: TextDirection.ltr,
      textAlign: TextAlign.center,
    )..layout(maxWidth: _canvasSize);
    textPainter.paint(
      canvas,
      ui.Offset(
        (_canvasSize - textPainter.width) / 2,
        (_canvasSize - textPainter.height) / 2,
      ),
    );
    textPainter.dispose();

    // 孩子的笔画
    final paint = Paint()
      ..color = AppTheme.primaryColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = _brushRadius
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    for (final path in strokes) {
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(_TracePathPainter oldDelegate) => oldDelegate.repaint != repaint;
}
