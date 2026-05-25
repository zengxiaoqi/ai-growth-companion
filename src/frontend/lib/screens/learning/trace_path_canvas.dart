import 'dart:ui' as ui;
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

  // Key 用于重建 CustomPaint
  int _redrawKey = 0;

  @override
  void initState() {
    super.initState();
    _initSamplePoints();
  }

  @override
  void didUpdateWidget(TracePathCanvas oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.target != oldWidget.target) {
      _initSamplePoints();
      _reset();
    }
  }

  /// 初始化采样点
  void _initSamplePoints() {
    _samplePoints = [];
    final target = widget.target;

    if (target is TraceGlyphTarget) {
      _samplePoints = _generateGlyphSamples(target);
    } else if (target is TracePolylineTarget) {
      _samplePoints = _generatePolylineSamples(target);
    }
  }

  /// 生成文字采样点（基于 TextPainter 实际渲染）
  ///
  /// 使用 TextPainter.getBoxesForSelection 获取文字字形的准确
  /// 包围盒，在包围盒内部生成采样点。相比之前的全画布均匀网格，
  /// 此方法只在实际有文字笔画的区域内采样，大幅提升覆盖率计算精度。
  List<ui.Offset> _generateGlyphSamples(TraceGlyphTarget target) {
    final samples = <ui.Offset>[];

    final textPainter = TextPainter(
      text: TextSpan(
        text: target.text,
        style: TextStyle(
          fontSize: target.fontSize ?? 180,
          fontWeight: FontWeight.w900,
        ),
      ),
      textDirection: TextDirection.ltr,
      textAlign: TextAlign.center,
    );

    textPainter.layout(maxWidth: _canvasSize);

    // 计算文字居中偏移
    final offsetX = (_canvasSize - textPainter.width) / 2;
    final offsetY = (_canvasSize - textPainter.height) / 2 + 8;

    // 获取每个字形的包围盒（由 TextPainter 实际排版计算得出）
    final boxes = textPainter.getBoxesForSelection(
      TextSelection(baseOffset: 0, extentOffset: target.text.length),
    );

    if (boxes.isEmpty) {
      // 降级：如果无法获取包围盒，回退到均匀网格
      return _simpleGlyphSampling(target);
    }

    // 在包围盒区域内生成采样点
    const step = 5.0; // 5px 步长，平衡精度和性能
    for (final box in boxes) {
      final left = box.left + offsetX;
      final top = box.top + offsetY;
      final right = box.right + offsetX;
      final bottom = box.bottom + offsetY;

      for (double y = top; y <= bottom; y += step) {
        for (double x = left; x <= right; x += step) {
          samples.add(ui.Offset(x, y));
        }
      }
    }

    return samples;
  }

  /// 简化的文字采样（网格方式）
  List<ui.Offset> _simpleGlyphSampling(TraceGlyphTarget target) {
    final samples = <ui.Offset>[];
    // 简化：使用网格采样
    for (double y = 20; y < _canvasSize - 20; y += 4) {
      for (double x = 20; x < _canvasSize - 20; x += 4) {
        samples.add(ui.Offset(x, y));
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
      _redrawKey++;
    });
  }

  /// 更新覆盖率
  void _updateCoverage(_Segment segment) {
    if (_samplePoints.isEmpty) return;

    final tolerance = _canvasSize * 0.045;

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

    final t = ((point.dx - segment.start.dx) * dx +
            (point.dy - segment.start.dy) * dy) /
        (dx * dx + dy * dy)
        .clamp(0.0, 1.0);

    final px = segment.start.dx + t * dx;
    final py = segment.start.dy + t * dy;

    return (ui.Offset(px, py) - point).distance;
  }

  /// 指针按下
  void _handlePointerDown(Offset position) {
    if (_solved) return;

    setState(() {
      _warning = null;
      _activePoint = _normalizePosition(position);
    });
  }

  /// 指针移动
  void _handlePointerMove(Offset position) {
    if (_activePoint == null || _solved) return;

    final nextPoint = _normalizePosition(position);
    final segment = _Segment(_activePoint!, nextPoint);

    setState(() {
      _segments.add(segment);
      _activePoint = nextPoint;
    });

    _updateCoverage(segment);
    _redrawKey++;
  }

  /// 指针抬起
  void _handlePointerUp() {
    _activePoint = null;

    if (!_solved && _coverage < widget.minCoverage) {
      setState(() {
        _warning = '继续沿着浅色路径描一描，尽量覆盖更多位置。';
      });
    }
  }

  /// 归一化坐标（0-1 -> 画布坐标）
  ui.Offset _normalizePosition(Offset position) {
    final renderBox = context.findRenderObject() as RenderBox?;
    if (renderBox == null) return ui.Offset.zero;

    final size = renderBox.size;
    // 假设是正方形容器
    final canvasSize = size.width < size.height ? size.width : size.height;

    return ui.Offset(
      (position.dx / canvasSize) * _canvasSize,
      (position.dy / canvasSize) * _canvasSize,
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
                  style: const TextStyle(
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
                      color: Colors.grey.shade100,
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
            ),

            const SizedBox(height: 12),

            // 描红画布
            Center(
              child: AspectRatio(
                aspectRatio: 1,
                child: Container(
                  constraints: const BoxConstraints(maxWidth: 280),
                  clipBehavior: Clip.antiAlias,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: Colors.grey.shade300,
                      width: 1,
                    ),
                  ),
                  child: GestureDetector(
                    onPanStart: (details) =>
                        _handlePointerDown(details.localPosition),
                    onPanUpdate: (details) =>
                        _handlePointerMove(details.localPosition),
                    onPanEnd: (_) => _handlePointerUp(),
                    child: CustomPaint(
                      key: ValueKey(_redrawKey),
                      painter: _TracePathPainter(
                        target: widget.target,
                        segments: _segments,
                        canvasSize: _canvasSize,
                      ),
                      size: Size(_canvasSize, _canvasSize),
                    ),
                  ),
                ),
              ),
            ),

            const SizedBox(height: 12),

            // 结果展示
            if (_solved)
              _buildSolvedState()
            else
              _buildProgressState(),
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
          const SizedBox(width: 8),
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
            backgroundColor: Colors.grey.shade200,
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
                  foregroundColor: Colors.white,
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
                  side: BorderSide(color: Colors.grey.shade300),
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
      // 绘制文字
      final glyphTarget = target as TraceGlyphTarget;
      final textPainter = TextPainter(
        text: TextSpan(
          text: glyphTarget.text,
          style: TextStyle(
            fontSize: glyphTarget.fontSize ?? 180,
            fontWeight: FontWeight.w900,
            color: const ui.Color(0xFFCBD5E1),
          ),
        ),
        textDirection: TextDirection.ltr,
        textAlign: TextAlign.center,
      );

      textPainter.layout(maxWidth: canvasSize);
      final offset = ui.Offset(
        (canvasSize - textPainter.width) / 2,
        (canvasSize - textPainter.height) / 2 + 8,
      );

      textPainter.paint(canvas, offset);
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

