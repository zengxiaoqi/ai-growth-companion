import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import 'lesson_scene_models.dart';

/// 描红画布（单字模式）
///
/// 设计要点：
/// - **一次只显示一个字**：`TraceGlyphTarget.text` 即使是一整句，也会按字
///   拆成多个步骤，写完一个字才进入下一个字，避免多个字挤在一个格子里。
/// - **按墨迹铺满格子**：离屏渲染字形后测量真实墨迹包围盒，再反算字号与
///   偏移，保证任意汉字/字母都能尽量占满米字格且不被裁切。
/// - **不参与外层滚动**：用 [Listener] 直接收指针事件，配合
///   [EagerGestureRecognizer] 抢赢手势竞技场；滚轮事件在画板内被吞掉，
///   描红时页面既不滚动也不翻页。
/// - **过滤机器输入**：有些模拟器/输入法把滚轮翻译成一串匀速笔直的伪拖拽，
///   框架层看不到"滚动"这个意图。判定必须"从静止瞬间窜出 + 笔直 + 超人手
///   速度"同时成立，或者在空白处匀速划直线——压在字形上的真实书写永远
///   不会被回滚。
/// - **覆盖率按像素采样**：只有真正落在笔画上的点才算覆盖目标。
/// - **漏笔提示按墨迹形状**：把未覆盖的采样点聚成连通块，漏掉哪一笔就只把
///   那一笔的墨迹标成暖色，不再是整格方块。
class TracePathCanvas extends StatefulWidget {
  /// 描红目标（文字或形状）
  final dynamic target; // TraceGlyphTarget | TracePolylineTarget

  /// 最小覆盖率要求（0.0-1.0）
  final double minCoverage;

  /// 全部完成回调（多字时所有字都写完后才回调一次）
  final void Function(TraceResult result) onSolved;

  /// 单字达标后是否自动进入下一个字
  final bool autoAdvance;

  /// 自动进入下一个字前的停留时间（让学习者看到"写好了"的反馈）
  final Duration autoAdvanceDelay;

  const TracePathCanvas({
    super.key,
    required this.target,
    this.minCoverage = 0.9,
    required this.onSolved,
    this.autoAdvance = true,
    this.autoAdvanceDelay = const Duration(milliseconds: 900),
  });

  @override
  State<TracePathCanvas> createState() => _TracePathCanvasState();
}

class _TracePathCanvasState extends State<TracePathCanvas> {
  /// 逻辑画布尺寸（所有绘制/采样坐标都在这个坐标系里）
  static const double _canvasSize = 280.0;

  /// 字形墨迹占格子的比例（留出一点边距，避免贴边被裁）
  static const double _inkFillRatio = 0.86;

  /// 覆盖判定容差（画布坐标）
  ///
  /// 容差按"一根手指的半径"取：手指描得略有偏差也算描到，但相邻笔画
  /// 之间的间距通常远大于 2 倍容差，不会把没写的那一笔也算成已覆盖。
  static const double _coverageTolerance = 14.0;

  /// 局部检查：把未覆盖的墨迹聚成连通块，再按"块"判断漏了哪一笔
  ///
  /// 早先用 8x8 的粗网格逐格判定，格子里只要有墨迹就要求描到三成，
  /// 结果一个笔画拐角就会被算成好几个"缺失区域"（出现过"还缺 20 处"
  /// 这种完全没道理的提示）。改成连通块后，漏一整笔才算一个缺失，
  /// 与孩子理解的"还差几笔"一致。
  static const double _missingCellSize = 10.0;

  /// 缺失块面积占全部墨迹的比例达到这个值，才算"漏了一笔"
  ///
  /// 太小吃笔画末端的采样抖动会误报，太大又会漏掉细小笔画。
  static const double _missingBlobRatio = 0.03;

  /// 覆盖率到 minCoverage 的这个比例后，才把漏掉的笔画标成暖色
  ///
  /// 描一半就给满屏橙色，孩子会以为画布被涂坏了。
  static const double _highlightCoverageFactor = 0.8;

  /// 滚轮信号之后的冷却时间
  ///
  /// 模拟器把滚轮翻译成"滑动"时，伪拖拽紧跟滚动信号而来；
  /// 这段时间内落下的笔一律不算书写。
  static const Duration _scrollCooldown = Duration(milliseconds: 400);

  /// 伪输入被忽略时的提示
  static const String _ignoredInputHint = '这一笔没有算，请沿着浅色字形慢慢描。';

  /// 滚轮在画板上时的提示
  static const String _scrollHint = '滚轮不能画笔画，请按住左键或直接用手指描。';

  /// 用户绘制的笔画线段
  final List<_Segment> _segments = [];

  /// 已覆盖的采样点索引
  final Set<int> _coveredPoints = {};

  /// 当前活动点（用于连续绘制）
  ui.Offset? _activePoint;

  /// 当前活动指针 id（多指触控时只跟踪第一根手指）
  int? _activePointerId;

  /// 覆盖采样点
  List<ui.Offset> _samplePoints = const [];

  /// 参考字的布局（按真实墨迹计算，采样与绘制共用）
  _GlyphLayout? _guideLayout;

  /// 采样代次：目标/步骤变化后丢弃过期的异步结果
  int _guideGeneration = 0;

  /// 步骤（多字时逐字）
  List<String> _steps = const ['一'];

  /// 当前步骤下标
  int _stepIndex = 0;

  /// 每个字的完成结果
  final List<TraceResult> _stepResults = [];

  /// 当前字尝试次数
  int _attempts = 1;

  /// 当前字覆盖率
  double _coverage = 0.0;

  /// 当前字是否已达标
  bool _stepSolved = false;

  /// 是否已经回调过 onSolved
  bool _reported = false;

  /// 提示信息
  String? _warning;

  /// 自动进入下一个字的定时器
  Timer? _advanceTimer;

  /// 字形加载兜底定时器
  Timer? _guideWatchdog;

  /// 画布区域 Key（用于把手势坐标精确映射到画布坐标）
  final GlobalKey _paintKey = GlobalKey();

  /// 最近一次滚轮/滚动信号的时间戳
  ///
  /// 部分模拟器（以及把滚轮映射成"滑动"的输入法）在发出滚动信号后，
  /// 还会把同一股滚动翻译成一串伪拖拽事件；这类事件紧跟滚动之后
  /// [_scrollCooldown] 内到达，必须当作滚动而不是书写。
  Duration? _lastScrollStamp;

  /// 当前笔画是否已被判定为"不是人写出来的"，判定后整笔回滚且不再继续画
  bool _strokeRejected = false;

  /// 本笔画第一条线段在 [_segments] 中的下标（用于整笔回滚）
  int _strokeSegmentStart = 0;

  // 本笔画的输入特征，用来识别"机器生成的滑动"
  Duration _strokeStartStamp = Duration.zero;
  Duration _strokeLastStamp = Duration.zero;
  bool _hasStrokeClock = false;
  int _strokeMoveCount = 0;
  double _strokeTravel = 0;
  double _strokeMinX = 0;
  double _strokeMaxX = 0;
  double _strokeMinY = 0;
  double _strokeMaxY = 0;
  final List<double> _strokeSteps = [];

  // 各种"机器特征"命中标记，命中足够多项才判定为伪输入
  bool _sigInstantStart = false;
  bool _sigStraightAxis = false;
  bool _sigUniformStep = false;
  bool _sigTooFast = false;
  bool _sigLongStraight = false;
  bool _sigOffInk = false;

  /// 本笔画里"碰到字形"和"完全没碰到字形"的段数（用于判断是不是在空白处瞎划）
  int _strokeOnInkSegments = 0;
  int _strokeOffInkSegments = 0;

  bool get _isLastStep => _stepIndex >= _steps.length - 1;

  String get _currentText {
    final target = widget.target;
    if (target is! TraceGlyphTarget) return '';
    if (_steps.isEmpty) return '';
    return _steps[_stepIndex.clamp(0, _steps.length - 1)];
  }

  @override
  void initState() {
    super.initState();
    _setupSteps();
    _loadGuide();
  }

  @override
  void dispose() {
    _advanceTimer?.cancel();
    _guideWatchdog?.cancel();
    super.dispose();
  }

  @override
  void didUpdateWidget(TracePathCanvas oldWidget) {
    super.didUpdateWidget(oldWidget);
    // 父级 rebuild 会创建新的 target 实例，按业务字段比较而非对象引用，
    // 否则每次父级 setState 都会误判为目标变化并清空进度。
    if (_targetSignature(widget.target) != _targetSignature(oldWidget.target)) {
      _advanceTimer?.cancel();
      _reported = false;
      _stepResults.clear();
      _stepIndex = 0;
      _attempts = 1;
      _setupSteps();
      _clearStrokeState();
      _loadGuide();
    }
  }

  /// 目标的业务签名（类型 + 内容）
  String _targetSignature(dynamic target) {
    if (target is TraceGlyphTarget) {
      return 'glyph:${target.id}:${target.text}';
    }
    if (target is TracePolylineTarget) {
      return 'polyline:${target.id}:${target.points.length}';
    }
    return '${target.hashCode}';
  }

  // ─── 步骤 ──────────────────────────────────────────────────────────────

  void _setupSteps() {
    final target = widget.target;
    if (target is TraceGlyphTarget) {
      final chars = _splitGlyphChars(target.text);
      _steps = chars.isEmpty ? const ['一'] : chars;
    } else {
      _steps = const ['__shape__'];
    }
    _stepIndex = _stepIndex.clamp(0, _steps.length - 1);
  }

  void _clearStrokeState() {
    _segments.clear();
    _setSamples(const []);
    _activePoint = null;
    _activePointerId = null;
    _coverage = 0.0;
    _stepSolved = false;
    _warning = null;
    _guideLayout = null;
    _resetStrokeFeatures(0, 0);
  }

  /// 应用采样点集合（同时重置覆盖统计，避免下标错位）
  void _setSamples(List<ui.Offset> samples) {
    _samplePoints = samples;
    _coveredPoints.clear();
  }

  /// 采样点变化后重算已有笔画的覆盖情况
  ///
  /// 参考字布局是异步渲染出来的，可能在用户已经落笔后才生效；
  /// 直接替换采样点会让旧下标全部错位，必须整体重算。
  void _applySamples(List<ui.Offset> samples) {
    _setSamples(samples);
    for (final segment in _segments) {
      _accumulateCoverage(segment);
    }
    _coverage = _samplePoints.isEmpty
        ? 0.0
        : _coveredPoints.length / _samplePoints.length;
  }

  /// 还没描到的笔画数量（未覆盖墨迹的连通块）
  int get _missingStrokes => _analyzeMissingInk().blobCount;

  /// 分析未覆盖的墨迹
  ///
  /// 把未覆盖采样点按 [_missingCellSize] 的细格聚成连通块：
  /// - [blobCount]：面积明显的缺失块数量，对应"还差几笔"
  /// - [largestRatio]：最大缺失块占全部墨迹的比例
  /// - [highlight]：需要标暖色的采样点（只取明显缺失块里的点）
  _MissingInk _analyzeMissingInk({bool withHighlight = false}) {
    if (_samplePoints.isEmpty) return _MissingInk.empty;

    final cells = (_canvasSize / _missingCellSize).ceil();
    final counts = List<int>.filled(cells * cells, 0);

    for (var i = 0; i < _samplePoints.length; i++) {
      if (_coveredPoints.contains(i)) continue;
      final point = _samplePoints[i];
      final cx = (point.dx / _missingCellSize).floor().clamp(0, cells - 1);
      final cy = (point.dy / _missingCellSize).floor().clamp(0, cells - 1);
      counts[cy * cells + cx] += 1;
    }

    final visited = List<bool>.filled(cells * cells, false);
    final highlighted = List<bool>.filled(cells * cells, false);
    final total = _samplePoints.length;
    var blobCount = 0;
    var largestRatio = 0.0;

    for (var start = 0; start < counts.length; start++) {
      if (visited[start] || counts[start] == 0) continue;

      final queue = <int>[start];
      visited[start] = true;
      final members = <int>[];
      var area = 0;

      while (queue.isNotEmpty) {
        final cell = queue.removeLast();
        members.add(cell);
        area += counts[cell];

        final x = cell % cells;
        final y = cell ~/ cells;
        for (var d = 0; d < 4; d++) {
          final nx = d == 0 ? x + 1 : (d == 1 ? x - 1 : x);
          final ny = d == 2 ? y + 1 : (d == 3 ? y - 1 : y);
          if (nx < 0 || ny < 0 || nx >= cells || ny >= cells) continue;
          final next = ny * cells + nx;
          if (visited[next] || counts[next] == 0) continue;
          visited[next] = true;
          queue.add(next);
        }
      }

      final ratio = area / total;
      if (ratio < _missingBlobRatio) continue;

      blobCount += 1;
      if (ratio > largestRatio) largestRatio = ratio;
      for (final cell in members) {
        highlighted[cell] = true;
      }
    }

    final highlight = <ui.Offset>[];
    if (withHighlight && blobCount > 0) {
      for (var i = 0; i < _samplePoints.length; i++) {
        if (_coveredPoints.contains(i)) continue;
        final point = _samplePoints[i];
        final cx = (point.dx / _missingCellSize).floor().clamp(0, cells - 1);
        final cy = (point.dy / _missingCellSize).floor().clamp(0, cells - 1);
        if (highlighted[cy * cells + cx]) highlight.add(point);
      }
    }

    return _MissingInk(blobCount, largestRatio, highlight);
  }

  /// 重来当前字
  void _resetCurrentStep() {
    _advanceTimer?.cancel();
    setState(() {
      _attempts += 1;
      _clearStrokeState();
    });
    _loadGuide();
  }

  /// 进入下一个字（未完成时会跳过当前字）
  void _goToNextStep() {
    _advanceTimer?.cancel();

    if (_isLastStep) {
      _reportSolved();
      return;
    }

    setState(() {
      _stepIndex += 1;
      _attempts = 1;
      _clearStrokeState();
    });
    _loadGuide();
  }

  /// 当前字达标
  void _finishStep() {
    if (_stepSolved) return;

    final result = TraceResult(
      coverage: _coverage,
      attempts: _attempts,
      score: _scoreFor(_coverage, _attempts),
    );

    setState(() {
      _stepSolved = true;
      _activePoint = null;
      _activePointerId = null;
      _warning = null;
      _stepResults.add(result);
    });

    if (!_isLastStep) {
      if (widget.autoAdvance) {
        _advanceTimer = Timer(widget.autoAdvanceDelay, () {
          if (!mounted) return;
          _goToNextStep();
        });
      }
    } else {
      _reportSolved();
    }
  }

  int _scoreFor(double coverage, int attempts) {
    return (coverage * 100 - (attempts - 1) * 4).clamp(70.0, 100.0).round();
  }

  void _reportSolved() {
    if (_reported) return;
    _reported = true;

    final results = _stepResults.isEmpty
        ? [
            TraceResult(
              coverage: _coverage,
              attempts: _attempts,
              score: _scoreFor(_coverage, _attempts),
            ),
          ]
        : _stepResults;

    final avgCoverage =
        results.map((r) => r.coverage).reduce((a, b) => a + b) / results.length;
    final avgScore = results.map((r) => r.score).reduce((a, b) => a + b) /
        results.length;

    widget.onSolved(TraceResult(
      coverage: avgCoverage,
      attempts: results.map((r) => r.attempts).reduce(math.max),
      score: avgScore.round().clamp(0, 100),
    ));
  }

  // ─── 采样 / 字形布局 ───────────────────────────────────────────────────

  /// 加载当前步骤的参考字布局与覆盖采样点
  Future<void> _loadGuide() async {
    final gen = ++_guideGeneration;
    final target = widget.target;

    if (target is TracePolylineTarget) {
      final samples = _generatePolylineSamples(target);
      if (!mounted || gen != _guideGeneration) return;
      setState(() {
        _guideLayout = null;
        if (!_stepSolved) _applySamples(samples);
      });
      return;
    }

    if (target is! TraceGlyphTarget) return;
    final text = _currentText;
    if (text.isEmpty) return;

    // 兜底：离屏渲染在某些平台可能迟迟不返回或抛错，超过 800ms 还没拿到
    // 布局就退化为「估算布局 + 包围盒采样」，保证描红始终可用。
    // 真布局随后到达时由 _applyGuide 把已画的墨迹一起搬过去，不会错位。
    _guideWatchdog?.cancel();
    _guideWatchdog = Timer(const Duration(milliseconds: 800), () {
      if (!mounted || gen != _guideGeneration) return;
      if (_guideLayout != null) return;
      final layout = _fallbackLayout(text);
      setState(() {
        _applyGuide(layout, _fallbackSampling(layout, text));
      });
    });

    final guide = await _buildGlyphGuide(text);
    _guideWatchdog?.cancel();
    if (!mounted || gen != _guideGeneration) return;

    setState(() {
      _applyGuide(guide.layout, guide.samples);
    });
  }

  /// 应用参考字布局与采样点
  ///
  /// 参考字是异步渲染的，可能在已经落笔后才换成更准确的布局。这时如果把
  /// 新布局直接铺上去，字会"跳"一下，之前描的笔画就全部错位、覆盖率凭空
  /// 掉下去（截图里"描了半天只有 46%"就是这个问题）。所以布局变化时把
  /// 已有笔画按同样的缩放/平移搬过去，让墨迹始终贴在字形上。
  void _applyGuide(_GlyphLayout layout, List<ui.Offset> samples) {
    final previous = _guideLayout;
    _guideLayout = layout;

    if (previous != null &&
        previous.fontSize > 0 &&
        layout.fontSize > 0 &&
        (_segments.isNotEmpty || _activePoint != null)) {
      final scale = layout.fontSize / previous.fontSize;
      final shift = (layout.offset - previous.offset).distance;
      if ((scale - 1).abs() > 0.01 || shift > 0.5) {
        ui.Offset map(ui.Offset point) =>
            layout.offset + (point - previous.offset) * scale;
        for (var i = 0; i < _segments.length; i++) {
          final segment = _segments[i];
          _segments[i] = _Segment(map(segment.start), map(segment.end));
        }
        final active = _activePoint;
        if (active != null) _activePoint = map(active);
      }
    }

    if (!_stepSolved) _applySamples(samples);
  }

  /// 构建字形参考：按真实墨迹计算字号/偏移，并按像素采样覆盖点
  Future<_GuideData> _buildGlyphGuide(String text) async {
    const probeFontSize = 120.0;

    final scan = await _scanInk(text, probeFontSize);
    final ink = scan?.ink;
    if (scan == null || ink == null || ink.width <= 0 || ink.height <= 0) {
      final layout = _fallbackLayout(text);
      return _GuideData(layout, _fallbackSampling(layout, text));
    }

    final targetExtent = _canvasSize * _inkFillRatio;
    final scale = math.min(
      targetExtent / ink.width,
      targetExtent / ink.height,
    );
    final fontSize =
        (probeFontSize * scale).clamp(24.0, _canvasSize * 1.1).toDouble();
    final applied = fontSize / probeFontSize;

    // 把墨迹包围盒精确居中到格子内
    final layout = _GlyphLayout(
      fontSize,
      ui.Offset(
        (_canvasSize - ink.width * applied) / 2 - ink.left * applied,
        (_canvasSize - ink.height * applied) / 2 - ink.top * applied,
      ),
    );

    // 探针图上的采样点等比映射到最终布局（只做一次离屏渲染）
    final samples = <ui.Offset>[];
    for (final point in scan.points) {
      samples.add(ui.Offset(
        layout.offset.dx + (point.dx - scan.origin.dx) * applied,
        layout.offset.dy + (point.dy - scan.origin.dy) * applied,
      ));
    }

    if (samples.isEmpty) {
      return _GuideData(layout, _fallbackSampling(layout, text));
    }
    return _GuideData(layout, samples);
  }

  /// 离屏渲染字形，一次拿到墨迹包围盒 + 笔画采样点
  Future<_InkScan?> _scanInk(String text, double fontSize) async {
    const pad = 40.0;
    const step = 2;
    final dim = (fontSize * 2.4 + pad * 2).ceil();
    try {
      final recorder = ui.PictureRecorder();
      final canvas = ui.Canvas(recorder);
      final painter = _glyphPainter(text, fontSize);
      const origin = ui.Offset(pad, pad);
      painter.paint(canvas, origin);

      final picture = recorder.endRecording();
      final image = await picture.toImage(dim, dim);
      final bytes = await image.toByteData(format: ui.ImageByteFormat.rawRgba);
      image.dispose();
      picture.dispose();
      if (bytes == null) return null;

      final pixels = bytes.buffer.asUint8List();
      var minX = dim, minY = dim, maxX = -1, maxY = -1;
      final points = <ui.Offset>[];

      for (var y = 0; y < dim; y += step) {
        final rowOffset = y * dim * 4;
        for (var x = 0; x < dim; x += step) {
          if (pixels[rowOffset + x * 4 + 3] <= 40) continue;
          points.add(ui.Offset(x.toDouble(), y.toDouble()));
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      if (maxX < 0 || maxY < 0) return null;

      return _InkScan(
        ink: _InkBox(
          left: minX - pad,
          top: minY - pad,
          width: (maxX - minX + 1).toDouble(),
          height: (maxY - minY + 1).toDouble(),
        ),
        points: points,
        origin: origin,
      );
    } catch (_) {
      return null;
    }
  }

  TextPainter _glyphPainter(String text, double fontSize) {
    return TextPainter(
      text: TextSpan(
        text: text,
        style: TextStyle(
          fontSize: fontSize,
          fontWeight: FontWeight.w900,
          color: const ui.Color(0xFF000000),
        ),
      ),
      textDirection: TextDirection.ltr,
      maxLines: 1,
    )..layout();
  }

  /// 降级布局（离屏渲染不可用时）：按字号与行长估算，保证能描红
  _GlyphLayout _fallbackLayout(String text) {
    final fontSize = _canvasSize * 0.62;
    final painter = _glyphPainter(text, fontSize);
    return _GlyphLayout(
      fontSize,
      ui.Offset(
        (_canvasSize - painter.width) / 2,
        (_canvasSize - painter.height) / 2,
      ),
    );
  }

  /// 降级采样：在字形外接框内按网格取点
  List<ui.Offset> _fallbackSampling(_GlyphLayout layout, String text) {
    final samples = <ui.Offset>[];
    final painter = _glyphPainter(text, layout.fontSize);
    final boxes = painter.getBoxesForSelection(
      TextSelection(baseOffset: 0, extentOffset: text.length),
    );
    if (boxes.isEmpty) return samples;

    const step = 5.0;
    for (final box in boxes) {
      final left = (box.left + layout.offset.dx).clamp(0.0, _canvasSize);
      final top = (box.top + layout.offset.dy).clamp(0.0, _canvasSize);
      final right = (box.right + layout.offset.dx).clamp(0.0, _canvasSize);
      final bottom = (box.bottom + layout.offset.dy).clamp(0.0, _canvasSize);
      for (double y = top; y <= bottom; y += step) {
        for (double x = left; x <= right; x += step) {
          samples.add(ui.Offset(x, y));
        }
      }
    }
    return samples;
  }

  /// 生成折线采样点
  List<ui.Offset> _generatePolylineSamples(TracePolylineTarget target) {
    final samples = <ui.Offset>[];
    if (target.points.isEmpty) return samples;

    for (int i = 1; i < target.points.length; i++) {
      final from = target.points[i - 1];
      final to = target.points[i];
      final distance = (to - from).distance;
      final steps = (distance / 8).ceil().clamp(8, 20);

      for (int step = 0; step <= steps; step++) {
        final t = step / steps;
        samples.add(ui.Offset(
          from.dx + (to.dx - from.dx) * t,
          from.dy + (to.dy - from.dy) * t,
        ));
      }
    }

    return samples;
  }

  // ─── 指针交互 ──────────────────────────────────────────────────────────

  /// 画板内吞掉滚轮事件：既不滚动页面，也不会凭空画线
  void _handlePointerSignal(PointerSignalEvent event) {
    if (event is! PointerScrollEvent) return;

    GestureBinding.instance.pointerSignalResolver.register(event, (_) {
      // 故意不处理：滚轮在描红画板上不产生任何滚动
    });

    if (event.timeStamp > Duration.zero) _lastScrollStamp = event.timeStamp;
    _rejectStroke();
    _endActiveStroke();

    if (!_stepSolved) {
      setState(() => _warning = _scrollHint);
    }
    if (kDebugMode) {
      debugPrint('[trace-input] scroll delta=${event.scrollDelta} '
          'kind=${event.kind.name} at=${event.localPosition}');
    }
  }

  void _handlePointerDown(PointerDownEvent event) {
    if (_stepSolved || _activePointerId != null) return;
    // 鼠标只认左键（滚轮/悬停/中键产生的杂散事件直接忽略）
    if (event.kind == PointerDeviceKind.mouse &&
        (event.buttons & kPrimaryMouseButton) == 0) {
      return;
    }

    final point = _normalizePosition(event.localPosition);
    _resetStrokeFeatures(point.dx, point.dy);
    _strokeStartStamp = event.timeStamp;
    _strokeLastStamp = event.timeStamp;

    // 滚轮刚过去：紧跟的这段拖拽是同一股滚动被翻译出来的，不是书写
    final lastScroll = _lastScrollStamp;
    if (lastScroll != null && event.timeStamp > Duration.zero) {
      final since = event.timeStamp - lastScroll;
      if (since < _scrollCooldown && since > -_scrollCooldown) {
        _strokeRejected = true;
      }
    }

    setState(() {
      _activePointerId = event.pointer;
      _activePoint = point;
      if (_strokeRejected) {
        _warning = _scrollHint;
      } else {
        _warning = null;
      }
    });
  }

  void _handlePointerMove(PointerMoveEvent event) {
    if (_stepSolved || _activePoint == null) return;
    if (event.pointer != _activePointerId) return;

    // 鼠标松开后（含滚轮/悬停导致的伪移动）不再画线
    if (event.kind == PointerDeviceKind.mouse &&
        (event.buttons & kPrimaryMouseButton) == 0) {
      _endActiveStroke();
      return;
    }

    final nextPoint = _normalizePosition(event.localPosition);
    if (_strokeRejected) {
      setState(() => _activePoint = nextPoint);
      return;
    }

    final previous = _activePoint!;
    final distance = (nextPoint - previous).distance;

    // 单次事件跳过大半个画布：不是正常书写（滚轮/惯性滑动塞进来的指针移动），
    // 不连成一条长线，只把落点挪过去。
    if (distance > _canvasSize * 0.45) {
      setState(() => _activePoint = nextPoint);
      return;
    }

    // 先判特征，再决定这一段要不要记入画布：
    // 否则伪造的滑动会先污染覆盖率，等判出来时已经"描完"了。
    _trackStrokeFeatures(event.timeStamp, nextPoint, distance);
    if (_shouldRejectStroke()) {
      setState(() => _activePoint = nextPoint);
      _rejectStroke();
      return;
    }

    final segment = _Segment(previous, nextPoint);
    setState(() {
      _segments.add(segment);
      _activePoint = nextPoint;
    });

    _updateCoverage(segment);
  }

  void _handlePointerUp(PointerEvent event) {
    if (event.pointer != _activePointerId) return;

    final rejected = _strokeRejected;
    _endActiveStroke();
    _logStroke(event, rejected);
    _resetStrokeFeatures(0, 0);

    if (rejected || _stepSolved) return;

    final missing = _missingStrokes;
    final String? hint;
    if (_coverage < widget.minCoverage) {
      hint = '继续沿着浅色字形描一描，尽量把笔画都盖到。';
    } else if (missing > 0) {
      hint = '还有 $missing 笔没描到，暖色就是漏掉的笔画，补上就完成了。';
    } else {
      hint = null;
    }
    if (hint != null) {
      setState(() => _warning = hint);
    }
  }

  /// 结束当前笔画（不回收已画的墨迹）
  void _endActiveStroke() {
    _activePointerId = null;
    _activePoint = null;
  }

  /// 判定当前笔画不是书写：整笔回滚，覆盖率重算
  ///
  /// 回滚是必须的——伪输入一旦先把覆盖率抬高，就会出现"什么都没写却描完了"。
  void _rejectStroke() {
    if (_strokeRejected && _segments.length <= _strokeSegmentStart) return;
    _strokeRejected = true;

    setState(() {
      if (_segments.length > _strokeSegmentStart) {
        _segments.removeRange(_strokeSegmentStart, _segments.length);
        _applySamples(_samplePoints);
      }
      if (!_stepSolved) _warning = _ignoredInputHint;
    });

    if (kDebugMode) {
      debugPrint('[trace-input] 拦截伪输入 moves=$_strokeMoveCount '
          'travel=${_strokeTravel.toStringAsFixed(1)} '
          'signals=${_signalSummary()}');
    }
  }

  /// 清空当前笔画的输入特征
  void _resetStrokeFeatures(double x, double y) {
    _strokeRejected = false;
    _strokeSegmentStart = _segments.length;
    _strokeStartStamp = Duration.zero;
    _strokeLastStamp = Duration.zero;
    _hasStrokeClock = false;
    _strokeMoveCount = 0;
    _strokeTravel = 0;
    _strokeSteps.clear();
    _strokeMinX = x;
    _strokeMaxX = x;
    _strokeMinY = y;
    _strokeMaxY = y;
    _sigInstantStart = false;
    _sigStraightAxis = false;
    _sigUniformStep = false;
    _sigTooFast = false;
    _sigLongStraight = false;
    _sigOffInk = false;
    _strokeOnInkSegments = 0;
    _strokeOffInkSegments = 0;
  }

  /// 记录这一段移动的"机器特征"
  ///
  /// 人手书写一定有加减速、有横向抖动、速度有上限；
  /// 而滚轮被翻译出来的滑动是匀速、笔直、瞬间完成的。
  void _trackStrokeFeatures(
    Duration stamp,
    ui.Offset to,
    double distance,
  ) {
    _strokeMoveCount += 1;
    _strokeTravel += distance;
    _strokeSteps.add(distance);
    if (_strokeSteps.length > 8) _strokeSteps.removeAt(0);

    _strokeMinX = math.min(_strokeMinX, to.dx);
    _strokeMaxX = math.max(_strokeMaxX, to.dx);
    _strokeMinY = math.min(_strokeMinY, to.dy);
    _strokeMaxY = math.max(_strokeMaxY, to.dy);

    if (stamp > Duration.zero && _strokeStartStamp > Duration.zero) {
      _hasStrokeClock = true;
    }
    final dt = _hasStrokeClock && stamp > Duration.zero
        ? stamp - _strokeLastStamp
        : Duration.zero;
    if (stamp > Duration.zero) _strokeLastStamp = stamp;

    // ① 落笔后第一帧就窜出 18px 以上：注入事件的典型特征
    //（人手从静止起步，第一帧位移一定很小）
    if (_strokeMoveCount == 1 &&
        _hasStrokeClock &&
        dt > Duration.zero &&
        dt < const Duration(milliseconds: 25) &&
        distance > 18) {
      _sigInstantStart = true;
    }

    final spanX = _strokeMaxX - _strokeMinX;
    final spanY = _strokeMaxY - _strokeMinY;
    final vertical = spanY >= spanX;
    final crossSpan = vertical ? spanX : spanY;
    final alongSpan = vertical ? spanY : spanX;

    // ② 整笔几乎是数学意义上的直线（横向抖动 < 1.2 画布像素）
    if (_strokeMoveCount >= 4 && alongSpan >= 56 && crossSpan < 1.2) {
      _sigStraightAxis = true;
    }

    // ③ 一步一格的匀速推进：插值出来的滑动必然等距
    if (_strokeSteps.length >= 4 && _strokeTravel >= 40) {
      final recent = _strokeSteps.sublist(_strokeSteps.length - 4);
      final maxStep = recent.reduce(math.max);
      final minStep = recent.reduce(math.min);
      if (maxStep > 1 && minStep / maxStep > 0.8) _sigUniformStep = true;
    }

    // ④ 速度超过人手：整笔零耗时、平均速度过高、或极短时间内走完一段
    if (_hasStrokeClock) {
      final micros = (_strokeLastStamp - _strokeStartStamp).inMicroseconds;
      if (_strokeTravel >= 40 && micros <= 0) {
        // 几十像素的笔画耗时为零：只可能是注入事件
        _sigTooFast = true;
      } else if (micros > 0 && _strokeTravel >= 56) {
        final speed = _strokeTravel / (micros / 1000000);
        if (speed > 3000 || (_strokeTravel >= 80 && micros <= 120000)) {
          _sigTooFast = true;
        }
      }
    }

    // ⑤ 一条 200px 以上、零横向抖动的直线
    if (alongSpan >= _canvasSize * 0.7 && crossSpan < 1.2) {
      _sigLongStraight = true;
    }
  }

  /// 判定当前笔画是不是注入的滑动
  ///
  /// 之前只要"笔直 + 匀速 + 快"三项成立就回滚，结果真实书写的横画（鼠标
  /// 拖得笔直、匀速、又快）被当成滚轮整笔删掉，覆盖率凭空掉了。
  ///
  /// 现在只有两种组合才回滚，而且都必须"完全没碰到字形"：
  /// 1. 从静止瞬间窜出 + 绝对笔直 + 超人手速度（注入事件的典型组合，
  ///    人手从静止起步不可能第一帧就飞出去）；
  /// 2. 匀速 + 绝对笔直 + 超快/超长（模拟器插值出来的滑动）。
  ///
  /// 只要笔画落在字形墨迹上，就一定是孩子在写，一律不回滚——
  /// 之前少了这条限制，鼠标拖出来的笔直横画被当成滚轮整笔删掉，
  /// 覆盖率凭空掉下去，孩子还以为自己写错了。
  bool _shouldRejectStroke() {
    if (!_hasStrokeClock || _strokeMoveCount < 3) return false;
    if (!_sigOffInk) return false;

    if (_sigInstantStart && _sigStraightAxis && _sigTooFast) return true;
    if (_sigStraightAxis && _sigUniformStep && (_sigTooFast || _sigLongStraight)) {
      return true;
    }
    return false;
  }

  String _signalSummary() {
    final names = <String>[
      if (_sigInstantStart) '瞬间窜出',
      if (_sigStraightAxis) '笔直',
      if (_sigUniformStep) '匀速',
      if (_sigTooFast) '超快',
      if (_sigLongStraight) '超长直线',
      if (_sigOffInk) '偏离字形',
    ];
    return names.isEmpty ? '无' : names.join('+');
  }

  void _logStroke(PointerEvent event, bool rejected) {
    if (!kDebugMode || _strokeMoveCount == 0) return;
    debugPrint('[trace-input] stroke kind=${event.kind.name} '
        'moves=$_strokeMoveCount '
        'travel=${_strokeTravel.toStringAsFixed(1)} '
        'durMs=${(_strokeLastStamp - _strokeStartStamp).inMilliseconds} '
        'spanX=${(_strokeMaxX - _strokeMinX).toStringAsFixed(1)} '
        'spanY=${(_strokeMaxY - _strokeMinY).toStringAsFixed(1)} '
        'clock=$_hasStrokeClock signals=${_signalSummary()} '
        'rejected=$rejected');
  }

  /// 手势坐标 -> 画布坐标
  ///
  /// 以画布（CustomPaint）自身的 RenderBox 为基准换算，画布被缩放显示时
  /// 也能正确映射。
  ui.Offset _normalizePosition(Offset localPosition) {
    final renderBox =
        _paintKey.currentContext?.findRenderObject() as RenderBox?;
    double scaleX = 1, scaleY = 1;
    if (renderBox != null &&
        renderBox.size.width > 0 &&
        renderBox.size.height > 0) {
      scaleX = _canvasSize / renderBox.size.width;
      scaleY = _canvasSize / renderBox.size.height;
    }

    return ui.Offset(
      (localPosition.dx * scaleX).clamp(0.0, _canvasSize),
      (localPosition.dy * scaleY).clamp(0.0, _canvasSize),
    );
  }

  /// 记录一段笔画覆盖到的采样点
  ///
  /// [trackInk] 为 true 时顺带统计这一段是否碰到字形（供伪输入判定使用），
  /// 重算覆盖率时传 false，避免污染当前笔画的统计。
  bool _accumulateCoverage(_Segment segment, {bool trackInk = false}) {
    if (_samplePoints.isEmpty) return false;

    var added = false;
    var touchesInk = false;
    for (var i = 0; i < _samplePoints.length; i++) {
      final distance = _distanceToSegment(_samplePoints[i], segment);
      // "碰到墨迹"与"算作覆盖"用同一把尺子：能盖住采样点就是写在字上，
      // 否则再多留一圈容差会把画布边缘也算成字，伪滑动就判不出来了。
      if (distance <= _coverageTolerance) touchesInk = true;
      if (distance > _coverageTolerance) continue;
      if (_coveredPoints.contains(i)) continue;
      _coveredPoints.add(i);
      added = true;
    }

    if (trackInk) {
      if (touchesInk) {
        _strokeOnInkSegments += 1;
      } else {
        _strokeOffInkSegments += 1;
      }
      final total = _strokeOnInkSegments + _strokeOffInkSegments;
      if (total >= 4 && _strokeOffInkSegments / total > 0.65) {
        _sigOffInk = true;
      }
    }
    return added;
  }

  /// 更新覆盖率并判定是否完成
  void _updateCoverage(_Segment segment) {
    if (_accumulateCoverage(segment, trackInk: true) &&
        _samplePoints.isNotEmpty) {
      setState(() => _coverage = _coveredPoints.length / _samplePoints.length);
    }
    if (_stepSolved) return;

    // 测试/演示用：minCoverage <= 0 表示一落笔即通过
    if (widget.minCoverage <= 0) {
      _finishStep();
      return;
    }
    if (_coverage < widget.minCoverage) return;

    // 整体占比够了还不够：漏掉的整笔必须也描到，
    // 否则会出现"还差一两笔就提示完成"的情况。
    final missing = _missingStrokes;
    if (missing == 0) {
      _finishStep();
      return;
    }

    final hint = '还有 $missing 笔没描到，暖色就是漏掉的笔画，补上就完成了。';
    if (_warning != hint) {
      setState(() => _warning = hint);
    }
  }

  /// 点到线段的距离
  double _distanceToSegment(ui.Offset point, _Segment segment) {
    final dx = segment.end.dx - segment.start.dx;
    final dy = segment.end.dy - segment.start.dy;

    if (dx == 0 && dy == 0) {
      return (point - segment.start).distance;
    }

    // 先按真实线段长度求投影比例，再把 t 钳到 [0, 1]
    final t = (((point.dx - segment.start.dx) * dx +
                (point.dy - segment.start.dy) * dy) /
            (dx * dx + dy * dy))
        .clamp(0.0, 1.0);

    final px = segment.start.dx + t * dx;
    final py = segment.start.dy + t * dy;

    return (ui.Offset(px, py) - point).distance;
  }

  // ─── 构建 ──────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final label = widget.target is TraceGlyphTarget
        ? (widget.target as TraceGlyphTarget).label
        : (widget.target as TracePolylineTarget).label;

    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _buildHeader(label),
            const SizedBox(height: 12),
            _buildCanvas(),
            const SizedBox(height: 12),
            _buildStatus(),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(String label) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: AppTheme.textColor,
            ),
          ),
        ),
        if (_steps.length > 1) ...[
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: AppTheme.primaryColor.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              '第 ${_stepIndex + 1}/${_steps.length} 个字',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppTheme.primaryColor,
              ),
            ),
          ),
          const SizedBox(width: 8),
        ],
        GestureDetector(
          onTap: _resetCurrentStep,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: AppTheme.active.isDarkSurface
                  ? AppTheme.active.soft
                  : Colors.grey.shade100,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.refresh_rounded,
                    size: 14, color: AppTheme.textSecondary),
                const SizedBox(width: 4),
                Text(
                  '重来',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: AppTheme.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  /// 正方形画布：逻辑坐标固定 280，窄屏等比缩小，不会溢出也不会变形
  Widget _buildCanvas() {
    return LayoutBuilder(
      builder: (context, constraints) {
        final side = math.min(constraints.maxWidth, _canvasSize);
        return Center(
          child: SizedBox(
            width: side,
            height: side,
            child: FittedBox(
              fit: BoxFit.contain,
              child: SizedBox(
                width: _canvasSize,
                height: _canvasSize,
                child: _buildCanvasSurface(),
              ),
            ),
          ),
        );
      },
    );
  }

  /// 需要标暖色的采样点：只在快描完时才提示，避免描一半满屏橙色
  List<ui.Offset> get _highlightPointsForPaint {
    if (_stepSolved) return const [];
    if (widget.minCoverage <= 0) return const [];
    if (_coverage < widget.minCoverage * _highlightCoverageFactor) return const [];

    final missing = _analyzeMissingInk(withHighlight: true);
    if (missing.blobCount == 0) return const [];
    return missing.highlight;
  }

  Widget _buildCanvasSurface() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.shade300, width: 1),
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          Listener(
            behavior: HitTestBehavior.opaque,
            onPointerSignal: _handlePointerSignal,
            onPointerDown: _handlePointerDown,
            onPointerMove: _handlePointerMove,
            onPointerUp: _handlePointerUp,
            onPointerCancel: _handlePointerUp,
            child: RawGestureDetector(
              behavior: HitTestBehavior.opaque,
              // 立刻赢下手势竞技场：外层 SingleChildScrollView / PageView
              // 永远拿不到描红区域里的手指，笔画不会变成滚动/翻页。
              gestures: <Type, GestureRecognizerFactory>{
                EagerGestureRecognizer:
                    GestureRecognizerFactoryWithHandlers<
                        EagerGestureRecognizer>(
                  () => EagerGestureRecognizer(),
                  (_) {},
                ),
              },
              child: CustomPaint(
                key: _paintKey,
                painter: _TracePathPainter(
                  target: widget.target,
                  segments: _segments,
                  canvasSize: _canvasSize,
                  guideText: _currentText,
                  guideLayout: _guideLayout,
                  highlightPoints: _highlightPointsForPaint,
                ),
                size: const Size(_canvasSize, _canvasSize),
              ),
            ),
          ),
          if (_stepSolved)
            Positioned.fill(
              child: IgnorePointer(
                child: Center(
                  child: Container(
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.86),
                      shape: BoxShape.circle,
                      boxShadow: AppTheme.softShadow(),
                    ),
                    child: Icon(
                      Icons.check_rounded,
                      size: 42,
                      color: AppTheme.primaryColor,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildStatus() {
    final message = _statusMessage();
    final percent = (_coverage * 100).round();
    final missing = _stepSolved ? 0 : _missingStrokes;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: _coverage.clamp(0.0, 1.0),
            minHeight: 8,
            backgroundColor: AppTheme.active.isDarkSurface
                ? AppTheme.active.line
                : Colors.grey.shade200,
            valueColor: AlwaysStoppedAnimation(
              _stepSolved ? AppTheme.accentColor : AppTheme.primaryColor,
            ),
          ),
        ),
        const SizedBox(height: 8),
        // 固定高度信息条：文案切换不改变布局，避免画布上下跳动
        SizedBox(
          height: 18,
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text(
              message,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 12,
                fontWeight: _stepSolved ? FontWeight.w600 : FontWeight.w400,
                color: _stepSolved
                    ? AppTheme.primaryColor
                    : AppTheme.textSecondary,
              ),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            Text(
              '覆盖率 $percent%',
              style: TextStyle(fontSize: 12, color: AppTheme.textSecondary),
            ),
            if (missing > 0 && !_stepSolved) ...[
              const SizedBox(width: 8),
              Text(
                '还差 $missing 笔没描到',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: const Color(0xFFD97706),
                ),
              ),
            ],
            const Spacer(),
            Text(
              '尝试 $_attempts 次',
              style: TextStyle(fontSize: 12, color: AppTheme.textSecondary),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: _resetCurrentStep,
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppTheme.textSecondary,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  side: BorderSide(
                    color: AppTheme.active.isDarkSurface
                        ? AppTheme.active.line
                        : Colors.grey.shade300,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text('再描一次'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              flex: 2,
              child: ElevatedButton(
                onPressed: _stepSolved && _isLastStep
                    ? _reportSolved
                    : _goToNextStep,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primaryColor,
                  foregroundColor: AppTheme.active.onPrimary,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: Text(
                  _primaryActionLabel(),
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  String _primaryActionLabel() {
    if (_stepSolved && _isLastStep) return '写好了，完成';
    if (_stepSolved) return '下一个字 →';
    if (_isLastStep) return '跳过这个字';
    return '跳过，下一个字';
  }

  String _statusMessage() {
    if (_stepSolved && _isLastStep) {
      return '全部写完啦，点「写好了，完成」结束这一项';
    }
    if (_stepSolved) {
      return '写得真好！马上进入下一个字…';
    }
    if (_warning != null) return _warning!;
    if (_steps.length > 1) {
      return '沿着浅色字形描一遍（第 ${_stepIndex + 1}/${_steps.length} 个字）';
    }
    return '沿着浅色字形描一遍，尽量覆盖每一笔';
  }
}

/// 需要跳过描红的标点/空白
const Set<String> _ignoredGlyphChars = {
  '，', '。', '、', '；', '：', '！', '？', '“', '”', '‘', '’',
  '（', '）', '《', '》', '「', '」', '『', '』', '…', '—', '·', '～',
  ',', '.', ';', ':', '!', '?', '"', "'", '(', ')', '[', ']', '{', '}',
  '/', '\\', '~', '_', '+', '=', '*', '&', '%', '@', '#', '^', '|',
};

/// 把任意文本拆成"一个字"一个步骤（去重、跳过标点）
List<String> _splitGlyphChars(String text) {
  final chars = <String>[];
  for (final rune in text.runes) {
    final ch = String.fromCharCode(rune);
    if (ch.trim().isEmpty) continue;
    if (_ignoredGlyphChars.contains(ch)) continue;
    if (chars.contains(ch)) continue; // 同一个字只描一次
    chars.add(ch);
  }
  return chars;
}

/// 线段
class _Segment {
  final ui.Offset start;
  final ui.Offset end;

  _Segment(this.start, this.end);
}

/// 字形布局结果
class _GlyphLayout {
  final double fontSize;
  final ui.Offset offset;

  const _GlyphLayout(this.fontSize, this.offset);
}

/// 墨迹包围盒（相对绘制原点）
class _InkBox {
  final double left;
  final double top;
  final double width;
  final double height;

  const _InkBox({
    required this.left,
    required this.top,
    required this.width,
    required this.height,
  });
}

/// 墨迹扫描结果：包围盒 + 笔画采样点 + 探针绘制原点
class _InkScan {
  final _InkBox ink;
  final List<ui.Offset> points;
  final ui.Offset origin;

  const _InkScan({
    required this.ink,
    required this.points,
    required this.origin,
  });
}

/// 未覆盖墨迹的统计结果
class _MissingInk {
  /// 面积明显的缺失块数量（对应"还差几笔"）
  final int blobCount;

  /// 最大缺失块占全部墨迹的比例
  final double largestRatio;

  /// 需要标暖色的采样点
  final List<ui.Offset> highlight;

  const _MissingInk(this.blobCount, this.largestRatio, this.highlight);

  static const _MissingInk empty = _MissingInk(0, 0.0, <ui.Offset>[]);
}

/// 参考字数据
class _GuideData {
  final _GlyphLayout layout;
  final List<ui.Offset> samples;

  const _GuideData(this.layout, this.samples);
}
/// 描红画布绘制器
class _TracePathPainter extends CustomPainter {
  final dynamic target;
  final List<_Segment> segments;
  final double canvasSize;
  final String guideText;
  final _GlyphLayout? guideLayout;

  /// 漏掉的笔画：这些采样点上的参考字标成暖色，提示"这几笔还没写"
  final List<ui.Offset> highlightPoints;

  _TracePathPainter({
    required this.target,
    required this.segments,
    required this.canvasSize,
    required this.guideText,
    required this.guideLayout,
    this.highlightPoints = const [],
  });

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(
      Rect.fromLTWH(0, 0, canvasSize, canvasSize),
      Paint()..color = const ui.Color(0xFFF8FAFC),
    );

    _drawGrid(canvas);
    _drawGuide(canvas);
    _drawUserStrokes(canvas);
  }

  /// 绘制参考目标
  void _drawGuide(Canvas canvas) {
    if (target is TraceGlyphTarget) {
      final layout = guideLayout;
      if (layout == null || guideText.isEmpty) return;

      final textPainter = TextPainter(
        text: TextSpan(
          text: guideText,
          style: TextStyle(
            fontSize: layout.fontSize,
            fontWeight: FontWeight.w900,
            color: const ui.Color(0xFFCBD5E1),
          ),
        ),
        textDirection: TextDirection.ltr,
        maxLines: 1,
      )..layout();

      // 注意：不要设置 textAlign.center，否则会与居中 offset 叠加导致偏左
      textPainter.paint(canvas, layout.offset);
      _drawPendingHint(canvas, layout);
      return;
    }

    if (target is TracePolylineTarget) {
      final polylineTarget = target as TracePolylineTarget;
      if (polylineTarget.points.length < 2) return;

      final guidePaint = Paint()
        ..color = const ui.Color(0xFFCBD5E1)
        ..style = ui.PaintingStyle.stroke
        ..strokeWidth = 8
        ..strokeCap = ui.StrokeCap.round
        ..strokeJoin = ui.StrokeJoin.round;

      final path = ui.Path();
      path.moveTo(polylineTarget.points[0].dx, polylineTarget.points[0].dy);
      for (int i = 1; i < polylineTarget.points.length; i++) {
        path.lineTo(polylineTarget.points[i].dx, polylineTarget.points[i].dy);
      }
      canvas.drawPath(path, guidePaint);
    }
  }

  /// 把漏掉的笔画标成暖色
  ///
  /// 用"未覆盖采样点"拼出遮罩，暖色只覆盖真正没描到的墨迹，
  /// 所以看起来是笔画本身变了颜色，而不是整格方块。
  void _drawPendingHint(Canvas canvas, _GlyphLayout layout) {
    if (highlightPoints.isEmpty || guideText.isEmpty) return;

    final mask = ui.Path();
    const half = 3.5;
    for (final point in highlightPoints) {
      mask.addRect(ui.Rect.fromCenter(
        center: point,
        width: half * 2,
        height: half * 2,
      ));
    }

    final hintPainter = TextPainter(
      text: TextSpan(
        text: guideText,
        style: TextStyle(
          fontSize: layout.fontSize,
          fontWeight: FontWeight.w900,
          color: const ui.Color(0xFFF59E0B).withValues(alpha: 0.6),
        ),
      ),
      textDirection: TextDirection.ltr,
      maxLines: 1,
    )..layout();

    canvas.save();
    canvas.clipPath(mask);
    hintPainter.paint(canvas, layout.offset);
    canvas.restore();
  }

  /// 绘制米字格
  void _drawGrid(Canvas canvas) {
    final gridPaint = Paint()
      ..color = const ui.Color(0xFFE2E8F0)
      ..style = ui.PaintingStyle.stroke
      ..strokeWidth = 1;

    final step = canvasSize / 8;
    for (double pos = 0; pos <= canvasSize + 0.5; pos += step) {
      canvas.drawLine(ui.Offset(pos, 0), ui.Offset(pos, canvasSize), gridPaint);
      canvas.drawLine(ui.Offset(0, pos), ui.Offset(canvasSize, pos), gridPaint);
    }

    // 中线略深，方便对位
    final axisPaint = Paint()
      ..color = const ui.Color(0xFFCBD5E1)
      ..style = ui.PaintingStyle.stroke
      ..strokeWidth = 1.4;
    canvas.drawLine(
      ui.Offset(canvasSize / 2, 0),
      ui.Offset(canvasSize / 2, canvasSize),
      axisPaint,
    );
    canvas.drawLine(
      ui.Offset(0, canvasSize / 2),
      ui.Offset(canvasSize, canvasSize / 2),
      axisPaint,
    );
  }

  /// 绘制用户笔画
  void _drawUserStrokes(Canvas canvas) {
    final strokePaint = Paint()
      ..color = const ui.Color(0xFF0EA5E9)
      ..style = ui.PaintingStyle.stroke
      ..strokeWidth = 12
      ..strokeCap = ui.StrokeCap.round
      ..strokeJoin = ui.StrokeJoin.round;

    for (final segment in segments) {
      canvas.drawLine(segment.start, segment.end, strokePaint);
    }
  }

  @override
  bool shouldRepaint(covariant _TracePathPainter oldDelegate) {
    return segments.length != oldDelegate.segments.length ||
        canvasSize != oldDelegate.canvasSize ||
        guideText != oldDelegate.guideText ||
        guideLayout != oldDelegate.guideLayout ||
        highlightPoints.length != oldDelegate.highlightPoints.length ||
        !identical(target, oldDelegate.target);
  }
}
