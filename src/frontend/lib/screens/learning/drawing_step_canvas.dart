import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';

/// 自由画板步骤（art 领域「画」一步）。
///
/// 完成判定 = 有效笔画数 ≥ minStrokes；完成后展示 checklist 自评再上报。
/// 手势处理沿用描红画板的 EagerGestureRecognizer 方案，画板内手指不会
/// 被外层滚动容器抢走。
class DrawingStepCanvas extends StatefulWidget {
  final Map<String, dynamic> data;
  final bool isCompleted;
  final void Function(int score, Map<String, dynamic> interactionData)
      onComplete;

  const DrawingStepCanvas({
    super.key,
    required this.data,
    required this.isCompleted,
    required this.onComplete,
  });

  @override
  State<DrawingStepCanvas> createState() => _DrawingStepCanvasState();
}

class _Stroke {
  final List<Offset> points = [];
  final Color color;
  final double width;
  final bool isEraser;

  _Stroke({
    required this.color,
    required this.width,
    this.isEraser = false,
  });
}

class _DrawingStepCanvasState extends State<DrawingStepCanvas> {
  static const Color _canvasBg = Colors.white;
  static const List<Color> _defaultColors = [
    Color(0xFFFF6B6B),
    Color(0xFFFFA94D),
    Color(0xFFFFD43B),
    Color(0xFF69DB7C),
    Color(0xFF4DABF7),
    Color(0xFF9775FA),
    Color(0xFFF783AC),
    Color(0xFF495057),
  ];

  final List<_Stroke> _strokes = [];
  final Set<Color> _colorsUsed = {};
  _Stroke? _current;

  Color _selectedColor = _defaultColors.first;
  double _brushWidth = 8;
  bool _eraserOn = false;
  bool _showChecklist = false;

  late final String _prompt;
  late final String _reference;
  late final List<Color> _palette;
  late final int _minStrokes;
  late final List<String> _checklist;

  @override
  void initState() {
    super.initState();
    final d = widget.data;
    _prompt = d['prompt']?.toString() ?? '画出你心里的样子吧！';
    _reference = d['reference']?.toString() ?? '';
    _minStrokes = (d['minStrokes'] is num)
        ? (d['minStrokes'] as num).toInt().clamp(1, 30)
        : 6;
    _checklist = _stringList(d['checklist']);
    final colors = _stringList(d['suggestedColors'])
        .map(_parseHexColor)
        .whereType<Color>()
        .toList();
    _palette = colors.isNotEmpty ? colors : _defaultColors;
    _selectedColor = _palette.first;
  }

  static List<String> _stringList(dynamic value) {
    if (value is! List) return const [];
    return value
        .map((e) => e?.toString().trim() ?? '')
        .where((e) => e.isNotEmpty)
        .toList();
  }

  static Color? _parseHexColor(String hex) {
    var h = hex.replaceFirst('#', '');
    if (h.length == 3) {
      h = h.split('').map((c) => '$c$c').join();
    }
    if (h.length != 6) return null;
    final v = int.tryParse(h, radix: 16);
    if (v == null) return null;
    return Color(0xFF000000 | v);
  }

  int get _inkStrokeCount =>
      _strokes.where((s) => !s.isEraser && s.points.length > 1).length;

  bool get _canComplete => _inkStrokeCount >= _minStrokes;

  void _startStroke(Offset point) {
    final stroke = _Stroke(
      color: _eraserOn ? _canvasBg : _selectedColor,
      width: _eraserOn ? _brushWidth * 3 : _brushWidth,
      isEraser: _eraserOn,
    );
    stroke.points.add(point);
    setState(() {
      _strokes.add(stroke);
      _current = stroke;
      if (!_eraserOn) _colorsUsed.add(_selectedColor);
    });
  }

  void _extendStroke(Offset point) {
    final stroke = _current;
    if (stroke == null) return;
    setState(() => stroke.points.add(point));
  }

  void _endStroke() {
    _current = null;
  }

  void _clearCanvas() {
    setState(() {
      _strokes.clear();
      _colorsUsed.clear();
      _current = null;
      _showChecklist = false;
    });
  }

  void _finish() {
    widget.onComplete(85, {
      'strokes': _inkStrokeCount,
      'colorsUsed': _colorsUsed.length,
    });
  }

  @override
  Widget build(BuildContext context) {
    if (widget.isCompleted) {
      return _completedBanner('画得真棒！');
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _promptCard(),
        const SizedBox(height: 10),
        SizedBox(height: 300, child: _canvas()),
        const SizedBox(height: 10),
        _toolbar(),
        const SizedBox(height: 10),
        _progressRow(),
        if (_showChecklist) ...[
          const SizedBox(height: 10),
          _checklistCard(),
        ],
      ],
    );
  }

  Widget _completedBanner(String text) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppTheme.successColor.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          const Text('🎨', style: TextStyle(fontSize: 28)),
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

  Widget _promptCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF0F6),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFF783AC).withValues(alpha: 0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _prompt,
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: AppTheme.textColor,
            ),
          ),
          if (_reference.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              '小提示：$_reference',
              style: TextStyle(fontSize: 13, color: AppTheme.textSecondary),
            ),
          ],
        ],
      ),
    );
  }

  Widget _canvas() {
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: Container(
        decoration: BoxDecoration(
          color: _canvasBg,
          border: Border.all(color: AppTheme.active.line, width: 2),
          borderRadius: BorderRadius.circular(16),
        ),
        child: RawGestureDetector(
          behavior: HitTestBehavior.opaque,
          gestures: <Type, GestureRecognizerFactory>{
            EagerGestureRecognizer:
                GestureRecognizerFactoryWithHandlers<EagerGestureRecognizer>(
              () => EagerGestureRecognizer(),
              (_) {},
            ),
          },
          child: Listener(
            onPointerDown: (e) => _startStroke(e.localPosition),
            onPointerMove: (e) => _extendStroke(e.localPosition),
            onPointerUp: (_) => _endStroke(),
            onPointerCancel: (_) => _endStroke(),
            child: CustomPaint(
              painter: _FreeDrawPainter(strokes: _strokes),
              child: const SizedBox.expand(),
            ),
          ),
        ),
      ),
    );
  }

  Widget _toolbar() {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        for (final color in _palette)
          GestureDetector(
            onTap: () => setState(() {
              _selectedColor = color;
              _eraserOn = false;
            }),
            child: Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: color,
                shape: BoxShape.circle,
                border: Border.all(
                  color: !_eraserOn && _selectedColor == color
                      ? AppTheme.textColor
                      : Colors.white,
                  width: 3,
                ),
              ),
            ),
          ),
        _toolButton(
          icon: Icons.brush_rounded,
          label: '细',
          active: !_eraserOn && _brushWidth == 5,
          onTap: () => setState(() {
            _brushWidth = 5;
            _eraserOn = false;
          }),
        ),
        _toolButton(
          icon: Icons.brush_rounded,
          label: '粗',
          active: !_eraserOn && _brushWidth == 12,
          onTap: () => setState(() {
            _brushWidth = 12;
            _eraserOn = false;
          }),
        ),
        _toolButton(
          icon: Icons.auto_fix_normal_rounded,
          label: '橡皮',
          active: _eraserOn,
          onTap: () => setState(() => _eraserOn = !_eraserOn),
        ),
        _toolButton(
          icon: Icons.delete_outline_rounded,
          label: '清空',
          active: false,
          onTap: _clearCanvas,
        ),
      ],
    );
  }

  Widget _toolButton({
    required IconData icon,
    required String label,
    required bool active,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        decoration: BoxDecoration(
          color: active
              ? AppTheme.primaryColor.withValues(alpha: 0.15)
              : AppTheme.active.card,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: active ? AppTheme.primaryColor : AppTheme.active.line,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: AppTheme.textColor),
            const SizedBox(width: 4),
            Text(
              label,
              style: TextStyle(fontSize: 13, color: AppTheme.textColor),
            ),
          ],
        ),
      ),
    );
  }

  Widget _progressRow() {
    final done = _inkStrokeCount;
    return Row(
      children: [
        Expanded(
          child: Text(
            '已画 $done 笔${_canComplete ? '，画好啦！' : '，目标 $_minStrokes 笔'}',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: _canComplete
                  ? AppTheme.successColor
                  : AppTheme.textSecondary,
            ),
          ),
        ),
        ElevatedButton(
          onPressed: _canComplete
              ? () {
                  if (_checklist.isEmpty) {
                    _finish();
                  } else {
                    setState(() => _showChecklist = true);
                  }
                }
              : null,
          style: ElevatedButton.styleFrom(
            backgroundColor: AppTheme.primaryColor,
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(999),
            ),
          ),
          child: const Text('我画好了'),
        ),
      ],
    );
  }

  Widget _checklistCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.active.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.active.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '看看你的画里有没有这些？',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: AppTheme.textColor,
            ),
          ),
          const SizedBox(height: 8),
          for (final item in _checklist)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('🌟', style: TextStyle(fontSize: 14)),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      item,
                      style: TextStyle(
                        fontSize: 14,
                        color: AppTheme.textColor,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 6),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _finish,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.successColor,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              child: const Text('都有啦，完成！'),
            ),
          ),
        ],
      ),
    );
  }
}

class _FreeDrawPainter extends CustomPainter {
  final List<_Stroke> strokes;

  _FreeDrawPainter({required this.strokes});

  @override
  void paint(Canvas canvas, Size size) {
    for (final stroke in strokes) {
      if (stroke.points.isEmpty) continue;
      final paint = Paint()
        ..color = stroke.color
        ..strokeWidth = stroke.width
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..style = PaintingStyle.stroke;
      if (stroke.points.length == 1) {
        canvas.drawCircle(
          stroke.points.first,
          stroke.width / 2,
          Paint()..color = stroke.color,
        );
        continue;
      }
      final path = Path()..moveTo(stroke.points.first.dx, stroke.points.first.dy);
      for (var i = 1; i < stroke.points.length; i++) {
        path.lineTo(stroke.points[i].dx, stroke.points[i].dy);
      }
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(_FreeDrawPainter oldDelegate) => true;
}