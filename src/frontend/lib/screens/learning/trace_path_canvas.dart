import 'dart:ui' as ui;
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import 'lesson_scene_models.dart';

/// 描红画布组件
///
/// Canvas 描红练习（手写练习），支持：
/// - glyph（文字）描红
/// - shape（折线形状）描红
/// - 实时计算覆盖率和得分
/// - 多笔画支持
/// - 完成判定（minCoverage）
class TracePathCanvas extends StatefulWidget {
  /// 描红目标（文字或形状）
  final dynamic target; // TraceGlyphTarget | TracePolylineTarget

  /// 最小覆盖率要求（0.0-1.0）
  final double minCoverage;

  /// 完成回调
  final void Function(TraceResult result) onSolved;

  const TracePathCanvas({
    super.key,
    required this.target,
    this.minCoverage = 0.9,
    required this.onSolved,
  });

  @override
  State<TracePathCanvas> createState() => _TracePathCanvasState();
}

class _TracePathCanvasState extends State<TracePathCanvas> {
  // 画布大小
  static const double _canvasSize = 280.0;

  // 用户绘制的笔画线段
  final List<_Segment> _segments = [];

  // 已覆盖的采样点索引
  final Set<int> _coveredPoints = {};

  // 当前活动点（用于连续绘制）
  ui.Offset? _activePoint;

  // 尝试次数
  int _attempts = 1;

  // 当前覆盖率
  double _coverage = 0.0;

  // 是否已解决（完成）
  bool _solved = false;

  // 警告信息
  String? _warning;

  // 采样点列表
  List<ui.Offset> _samplePoints = [];

  // 画布区域 Key（用于把手势坐标精确映射到画布坐标）
  final GlobalKey _paintKey = GlobalKey();

  @override
  void initState() {
    super.initState();
    _initSamplePoints();
  }

  @override
  void didUpdateWidget(TracePathCanvas oldWidget) {
    super.didUpdateWidget(oldWidget);
    // 父级 rebuild 会创建新的 target 实例，按业务字段比较而非对象引用，
    // 否则每次父级 setState 都会误判为目标变化并清空进度。
    if (_targetSignature(widget.target) != _targetSignature(oldWidget.target)) {
      _initSamplePoints();
      _reset();
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

  /// 初始化采样点
  void _initSamplePoints() {
    _samplePoints = [];
    final target = widget.target;

    if (target is TraceGlyphTarget) {
      // 像素级采样是异步的（需要先离屏渲染字形），先空着等回调
      _generateGlyphSamples(target).then((samples) {
        if (!mounted) return;
        if (widget.target != target) return; // 目标已切换，丢弃过期结果
        setState(() => _samplePoints = samples);
      });
    } else if (target is TracePolylineTarget) {
      _samplePoints = _generatePolylineSamples(target);
    }
  }

  /// 生成文字采样点（基于字形实际渲染像素）
  ///
  /// 先把字形离屏渲染成位图，再按像素 alpha 采样——只有真正有笔画的
  /// 像素会成为覆盖点。相比按包围盒整格采样（会把笔画间的空白也算进
  /// 覆盖目标），此方法让覆盖率真实反映"描到了多少笔画"。
  Future<List<ui.Offset>> _generateGlyphSamples(TraceGlyphTarget target) async {
    final layout = _layoutGlyph(target.text, _canvasSize);
    try {
      final recorder = ui.PictureRecorder();
      final canvas = ui.Canvas(recorder);
      final textPainter = TextPainter(
        text: TextSpan(
          text: target.text,
          style: TextStyle(
            fontSize: layout.fontSize,
            fontWeight: FontWeight.w900,
            color: const ui.Color(0xFF000000),
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout(maxWidth: _canvasSize);
      textPainter.paint(canvas, layout.offset);

      final picture = recorder.endRecording();
      final image = await picture.toImage(
        _canvasSize.toInt(),
        _canvasSize.toInt(),
      );
      final byteData =
          await image.toByteData(format: ui.ImageByteFormat.rawRgba);
      image.dispose();
      picture.dispose();

      if (byteData == null) return _bboxGlyphSampling(target);

      final pixels = byteData.buffer.asUint8List();
      final canvasInt = _canvasSize.toInt();
      final samples = <ui.Offset>[];

      const step = 4; // 4px 步长，平衡精度和性能
      const alphaThreshold = 40;
      for (int y = 0; y < canvasInt; y += step) {
        for (int x = 0; x < canvasInt; x += step) {
          final alpha = pixels[(y * canvasInt + x) * 4 + 3];
          if (alpha > alphaThreshold) {
            samples.add(ui.Offset(x.toDouble(), y.toDouble()));
          }
        }
      }

      if (samples.isEmpty) return _bboxGlyphSampling(target);
      return samples;
    } catch (_) {
      // 离屏渲染不可用时（如部分 web 环境），退回包围盒采样
      return _bboxGlyphSampling(target);
    }
  }

  /// 包围盒采样（降级方案）：在字形包围盒内按网格取点
  List<ui.Offset> _bboxGlyphSampling(TraceGlyphTarget target) {
    final samples = <ui.Offset>[];

    final layout = _layoutGlyph(target.text, _canvasSize);
    final textPainter = TextPainter(
      text: TextSpan(
        text: target.text,
        style: TextStyle(
          fontSize: layout.fontSize,
          fontWeight: FontWeight.w900,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: _canvasSize);

    final boxes = textPainter.getBoxesForSelection(
      TextSelection(baseOffset: 0, extentOffset: target.text.length),
    );

    if (boxes.isEmpty) return samples;

    const step = 5.0;
    for (final box in boxes) {
      final left = box.left + layout.offset.dx;
      final top = box.top + layout.offset.dy;
      final right = box.right + layout.offset.dx;
      final bottom = box.bottom + layout.offset.dy;

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

  /// 重置
  void _reset() {
    setState(() {
      _segments.clear();
      _coveredPoints.clear();
      _activePoint = null;
      _attempts++;
      _coverage = 0.0;
      _solved = false;
      _warning = null;
    });
  }

  /// 更新覆盖率
  void _updateCoverage(_Segment segment) {
    if (_samplePoints.isEmpty) return;

    const tolerance = _canvasSize * 0.045;

    for (int i = 0; i < _samplePoints.length; i++) {
      if (_coveredPoints.contains(i)) continue;

      if (_distanceToSegment(_samplePoints[i], segment) <= tolerance) {
        _coveredPoints.add(i);
      }
    }

    setState(() {
      _coverage = _coveredPoints.length / _samplePoints.length;
    });
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

  // 当前活动指针 id（多指触控时只跟踪第一根手指）
  int? _activePointerId;

  /// 指针按下
  void _handlePointerDown(PointerDownEvent event) {
    if (_solved || _activePointerId != null) return;

    setState(() {
      _activePointerId = event.pointer;
      _warning = null;
      _activePoint = _normalizePosition(event.localPosition);
    });
  }

  /// 指针移动
  void _handlePointerMove(PointerMoveEvent event) {
    if (_activePoint == null || _solved) return;
    if (event.pointer != _activePointerId) return;

    final nextPoint = _normalizePosition(event.localPosition);
    final segment = _Segment(_activePoint!, nextPoint);

    setState(() {
      _segments.add(segment);
      _activePoint = nextPoint;
    });

    _updateCoverage(segment);
  }

  /// 指针抬起
  void _handlePointerUp(PointerEvent event) {
    if (event.pointer != _activePointerId) return;
    _activePointerId = null;
    _activePoint = null;

    if (!_solved && _coverage < widget.minCoverage) {
      setState(() {
        _warning = '继续沿着浅色路径描一描，尽量覆盖更多位置。';
      });
    }
  }

  /// 手势坐标 -> 画布坐标
  ///
  /// 必须以画布（CustomPaint）自身的 RenderBox 为基准换算，
  /// 不能用整个 Card 的尺寸（否则笔画会整体偏移、压缩）。
  ui.Offset _normalizePosition(Offset localPosition) {
    // GestureDetector 直接包裹 CustomPaint，localPosition 已经是
    // 画布坐标系；仅在画布实际尺寸与逻辑尺寸不一致时做等比缩放。
    final renderBox = _paintKey.currentContext?.findRenderObject() as RenderBox?;
    if (renderBox == null || renderBox.size.width <= 0) {
      return ui.Offset(localPosition.dx, localPosition.dy);
    }

    final size = renderBox.size;
    final scaleX = _canvasSize / size.width;
    final scaleY = _canvasSize / size.height;

    return ui.Offset(
      localPosition.dx * scaleX,
      localPosition.dy * scaleY,
    );
  }

  /// 提交完成
  void _submitSolution() {
    if (_solved) return;

    setState(() => _solved = true);

    // 计算得分：覆盖率 - (尝试次数-1) * 4，最低 70 分
    final score =
        (_coverage * 100 - (_attempts - 1) * 4).clamp(70.0, 100.0).toInt();

    widget.onSolved(TraceResult(
      coverage: _coverage,
      attempts: _attempts,
      score: score,
    ));
  }

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
            // 标题栏
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textColor,
                  ),
                ),
                GestureDetector(
                  onTap: _reset,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
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
                        SizedBox(width: 4),
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
            ),

            const SizedBox(height: 12),

            // 描红画布（固定正方形，painter 与手势共用同一坐标系）
            Center(
              child: Container(
                width: _canvasSize,
                height: _canvasSize,
                clipBehavior: Clip.antiAlias,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: Colors.grey.shade300,
                    width: 1,
                  ),
                ),
                child: Listener(
                  behavior: HitTestBehavior.opaque,
                  onPointerDown: _handlePointerDown,
                  onPointerMove: _handlePointerMove,
                  onPointerUp: _handlePointerUp,
                  onPointerCancel: _handlePointerUp,
                  child: RawGestureDetector(
                    // 占位拖拽识别器：抢赢手势竞技场，阻止外层
                    // SingleChildScrollView / PageView 把竖向描红
                    // 笔画当成页面滚动或横向翻页。
                    gestures: {
                      VerticalDragGestureRecognizer:
                          GestureRecognizerFactoryWithHandlers<
                            VerticalDragGestureRecognizer
                          >(
                            () => VerticalDragGestureRecognizer(),
                            (instance) {
                              instance.onUpdate = (_) {};
                              instance.onEnd = (_) {};
                            },
                          ),
                      HorizontalDragGestureRecognizer:
                          GestureRecognizerFactoryWithHandlers<
                            HorizontalDragGestureRecognizer
                          >(
                            () => HorizontalDragGestureRecognizer(),
                            (instance) {
                              instance.onUpdate = (_) {};
                              instance.onEnd = (_) {};
                            },
                          ),
                    },
                    child: CustomPaint(
                      key: _paintKey,
                      painter: _TracePathPainter(
                        target: widget.target,
                        segments: _segments,
                        canvasSize: _canvasSize,
                      ),
                      size: const Size(_canvasSize, _canvasSize),
                    ),
                  ),
                ),
              ),
            ),

            const SizedBox(height: 12),

            // 结果展示
            if (_solved) _buildSolvedState() else _buildProgressState(),
          ],
        ),
      ),
    );
  }

  /// 已完成状态
  Widget _buildSolvedState() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: AppTheme.primaryColor.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.check_circle_rounded,
              size: 18, color: AppTheme.primaryColor),
          SizedBox(width: 8),
          Text(
            '描摹完成',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: AppTheme.primaryColor,
            ),
          ),
        ],
      ),
    );
  }

  /// 进行中状态
  Widget _buildProgressState() {
    return Column(
      children: [
        // 进度条
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: _coverage,
            minHeight: 8,
            backgroundColor: AppTheme.active.isDarkSurface
                ? AppTheme.active.line
                : Colors.grey.shade200,
            valueColor: AlwaysStoppedAnimation(
              _coverage >= widget.minCoverage
                  ? AppTheme.accentColor
                  : AppTheme.primaryColor,
            ),
          ),
        ),

        const SizedBox(height: 8),

        // 警告信息
        if (_warning != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              _warning!,
              style: TextStyle(
                fontSize: 12,
                color: AppTheme.textSecondary,
              ),
            ),
          ),

        // 状态文字
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              '覆盖率 ${(_coverage * 100).toInt()}%',
              style: TextStyle(
                fontSize: 12,
                color: AppTheme.textSecondary,
              ),
            ),
            Text(
              '尝试次数: $_attempts',
              style: TextStyle(
                fontSize: 12,
                color: AppTheme.textSecondary,
              ),
            ),
          ],
        ),

        const SizedBox(height: 12),

        // 操作按钮
        Row(
          children: [
            Expanded(
              child: ElevatedButton(
                onPressed: _submitSolution,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primaryColor,
                  foregroundColor: AppTheme.active.onPrimary,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text(
                  '写好了，进入下一项',
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton(
                onPressed: _reset,
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
          ],
        ),
      ],
    );
  }
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

/// 计算字形在画布中的字号与居中偏移
///
/// 采样与绘制共用此函数，保证参考字和覆盖点完全对齐。
/// 字号取画布的 86%，让字尽量占满米字格（留出笔画描边余量）。
_GlyphLayout _layoutGlyph(String text, double canvasSize) {
  final fontSize = canvasSize * 0.86;
  final textPainter = TextPainter(
    text: TextSpan(
      text: text,
      style: TextStyle(fontSize: fontSize, fontWeight: FontWeight.w900),
    ),
    textDirection: TextDirection.ltr,
  )..layout(maxWidth: canvasSize);

  return _GlyphLayout(
    fontSize,
    ui.Offset(
      (canvasSize - textPainter.width) / 2,
      (canvasSize - textPainter.height) / 2,
    ),
  );
}

/// 描红画布绘制器
class _TracePathPainter extends CustomPainter {
  final dynamic target;
  final List<_Segment> segments;
  final double canvasSize;

  _TracePathPainter({
    required this.target,
    required this.segments,
    required this.canvasSize,
  });

  @override
  void paint(Canvas canvas, Size size) {
    // 绘制背景
    canvas.drawRect(
      Rect.fromLTWH(0, 0, canvasSize, canvasSize),
      Paint()..color = const ui.Color(0xFFF8FAFC),
    );

    // 绘制参考目标
    _drawGuide(canvas);

    // 绘制网格
    _drawGrid(canvas);

    // 绘制用户笔画
    _drawUserStrokes(canvas);
  }

  /// 绘制参考目标
  void _drawGuide(Canvas canvas) {
    final guidePaint = Paint()
      ..color = const ui.Color(0xFFCBD5E1)
      ..style = ui.PaintingStyle.stroke
      ..strokeWidth = 8
      ..strokeCap = ui.StrokeCap.round
      ..strokeJoin = ui.StrokeJoin.round;

    if (target is TraceGlyphTarget) {
      // 绘制文字（与采样共用同一布局，保证对齐）
      final glyphTarget = target as TraceGlyphTarget;
      final layout = _layoutGlyph(glyphTarget.text, canvasSize);
      final textPainter = TextPainter(
        text: TextSpan(
          text: glyphTarget.text,
          style: TextStyle(
            fontSize: layout.fontSize,
            fontWeight: FontWeight.w900,
            color: const ui.Color(0xFFCBD5E1),
          ),
        ),
        textDirection: TextDirection.ltr,
        textAlign: TextAlign.center,
      );

      textPainter.layout(maxWidth: canvasSize);
      textPainter.paint(canvas, layout.offset);
    } else if (target is TracePolylineTarget) {
      // 绘制折线
      final polylineTarget = target as TracePolylineTarget;
      if (polylineTarget.points.length >= 2) {
        final path = ui.Path();
        path.moveTo(polylineTarget.points[0].dx, polylineTarget.points[0].dy);
        for (int i = 1; i < polylineTarget.points.length; i++) {
          path.lineTo(polylineTarget.points[i].dx, polylineTarget.points[i].dy);
        }
        canvas.drawPath(path, guidePaint);
      }
    }
  }

  /// 绘制网格
  void _drawGrid(Canvas canvas) {
    final gridPaint = Paint()
      ..color = const ui.Color(0xFFE2E8F0)
      ..style = ui.PaintingStyle.stroke
      ..strokeWidth = 1;

    for (double step = 0; step <= canvasSize; step += 32) {
      canvas.drawLine(
        ui.Offset(step, 0),
        ui.Offset(step, canvasSize),
        gridPaint,
      );
      canvas.drawLine(
        ui.Offset(0, step),
        ui.Offset(canvasSize, step),
        gridPaint,
      );
    }
  }

  /// 绘制用户笔画
  void _drawUserStrokes(Canvas canvas) {
    final strokePaint = Paint()
      ..color = const ui.Color(0xFF0EA5E9)
      ..style = ui.PaintingStyle.stroke
      ..strokeWidth = 8
      ..strokeCap = ui.StrokeCap.round
      ..strokeJoin = ui.StrokeJoin.round;

    for (final segment in segments) {
      canvas.drawLine(segment.start, segment.end, strokePaint);
    }
  }

  @override
  bool shouldRepaint(covariant _TracePathPainter oldDelegate) {
    return segments.length != oldDelegate.segments.length ||
        canvasSize != oldDelegate.canvasSize;
  }
}
