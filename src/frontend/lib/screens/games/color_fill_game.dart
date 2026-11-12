import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../components/child_game_ui.dart';
import '../../services/child_game_voice.dart';
import '../../theme/app_theme.dart';
import 'game_completion_screen.dart';

/// 按色号涂色游戏（方案 B 第五种参数化题型）。
///
/// 与 Web 端 ColorFillGame 使用同一套参数契约与计分规则（附录 H.3）：
/// - LLM 只提供 shape/colorKey 枚举，**不提供任何坐标或路径**——
///   区域由内置形状库绘制并按网格排布，色值由双端常量表保证一致；
/// - 孩子先选色块再点区域；区域可重涂（以最后一次为准），
///   每个区域第一次就涂对记 firstTry；
/// - 计分：score = round(firstTry / regions * 100)；
/// - 回传 regionResults（id/colorKey/firstTry）供成长报告使用。
class ColorFillGame extends StatefulWidget {
  final Map<String, dynamic> data;
  final VoidCallback onExit;
  final ValueChanged<Map<String, dynamic>>? onFinished;

  const ColorFillGame({
    super.key,
    required this.data,
    required this.onExit,
    this.onFinished,
  });

  @override
  State<ColorFillGame> createState() => _ColorFillGameState();
}

const List<String> _kShapes = [
  'circle',
  'star',
  'heart',
  'triangle',
  'square',
  'flower',
  'sun',
  'moon',
  'cloud',
  'fish',
];

const List<String> _kColors = [
  'red',
  'blue',
  'yellow',
  'green',
  'orange',
  'purple',
  'pink',
  'brown',
  'black',
  'white',
];

/// 与 Web 端 COLOR_VALUES 保持一致（附录 H.3：双端常量表保证色值一致）。
const Map<String, Color> _kColorValues = {
  'red': Color(0xFFEF4444),
  'blue': Color(0xFF3B82F6),
  'yellow': Color(0xFFFACC15),
  'green': Color(0xFF22C55E),
  'orange': Color(0xFFF97316),
  'purple': Color(0xFFA855F7),
  'pink': Color(0xFFEC4899),
  'brown': Color(0xFFA16207),
  'black': Color(0xFF27272A),
  'white': Color(0xFFFFFFFF),
};

const Map<String, String> _kColorLabels = {
  'red': '红色',
  'blue': '蓝色',
  'yellow': '黄色',
  'green': '绿色',
  'orange': '橙色',
  'purple': '紫色',
  'pink': '粉色',
  'brown': '棕色',
  'black': '黑色',
  'white': '白色',
};

class _FillRegion {
  final String id;
  final String shape;
  final String colorKey;

  const _FillRegion({required this.id, required this.shape, required this.colorKey});
}

String _clip(String value, int maxRunes) {
  if (value.runes.length <= maxRunes) return value;
  return String.fromCharCodes(value.runes.take(maxRunes));
}

int _toInt(dynamic value, int fallback) {
  return int.tryParse(value?.toString() ?? '') ?? fallback;
}

String _cleanId(String value) {
  return value.trim().replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '');
}

class _ColorFillGameState extends State<ColorFillGame> {
  static const int _maxRegions = 6;
  static const int _maxPalette = 8;

  List<_FillRegion> _regions = const [];
  List<String> _palette = const [];
  int _passingScore = 80;
  int _timeLimitSec = 120;
  late int _startedAt;

  String? _selectedColor;
  final Map<String, String> _fills = <String, String>{};
  final Map<String, bool> _firstTry = <String, bool>{};
  ChildFeedback? _feedback;
  int _cheerKey = 0;
  bool _finished = false;
  bool _completedCalled = false;
  late final ChildGameVoice _voice;

  @override
  void initState() {
    super.initState();
    _voice = ChildGameVoice();
    _voice.addListener(_onVoiceChanged);
    _reset();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _voice.speak(_introSpeech());
    });
  }

  @override
  void dispose() {
    _voice.removeListener(_onVoiceChanged);
    _voice.dispose();
    super.dispose();
  }

  void _onVoiceChanged() {
    if (mounted) setState(() {});
  }

  String _introSpeech() {
    final title = widget.data['title']?.toString() ?? '涂色游戏';
    return '我们来玩$title。${_promptText()}';
  }

  void _reset() {
    _palette = _parsePalette(widget.data['palette']);
    _regions = _parseRegions(widget.data['regions']);
    _passingScore = _toInt(widget.data['passingScore'], 80).clamp(0, 100).toInt();
    _timeLimitSec = _toInt(widget.data['timeLimitSec'], 120).clamp(30, 300).toInt();
    _startedAt = DateTime.now().millisecondsSinceEpoch;
    _selectedColor = null;
    _fills.clear();
    _firstTry.clear();
    _feedback = null;
    _cheerKey = 0;
    _finished = false;
    _completedCalled = false;
  }

  List<String> _parsePalette(dynamic raw) {
    if (raw is! List) return const [];
    final seen = <String>{};
    final result = <String>[];
    for (final entry in raw) {
      final color = entry?.toString() ?? '';
      if (!_kColors.contains(color) || seen.contains(color)) continue;
      seen.add(color);
      result.add(color);
      if (result.length >= _maxPalette) break;
    }
    return result;
  }

  List<_FillRegion> _parseRegions(dynamic raw) {
    if (raw is! List) return const [];
    final paletteSet = _palette.toSet();
    final usedIds = <String>{};
    final result = <_FillRegion>[];
    for (var i = 0; i < raw.length && result.length < _maxRegions; i++) {
      final entry = raw[i];
      if (entry is! Map) continue;
      final map = entry.map((k, v) => MapEntry(k.toString(), v));
      final shape = map['shape']?.toString() ?? '';
      final colorKey = map['colorKey']?.toString() ?? '';
      // 未知形状/颜色、色盘里没有对应色块的区域：无法涂色，直接丢弃。
      if (!_kShapes.contains(shape) ||
          !_kColors.contains(colorKey) ||
          !paletteSet.contains(colorKey)) {
        continue;
      }
      var id = _cleanId(map['id']?.toString() ?? '');
      if (id.isEmpty) id = 's${i + 1}';
      id = _clip(id, 32);
      var suffix = 2;
      while (usedIds.contains(id)) {
        id = 's${i + 1}_${suffix++}';
      }
      usedIds.add(id);
      result.add(_FillRegion(id: id, shape: shape, colorKey: colorKey));
    }
    return result;
  }

  int get _correctCount => _regions
      .where((region) => _fills[region.id] == region.colorKey)
      .length;

  void _tapRegion(_FillRegion region) {
    if (_finished || _completedCalled) return;
    final selected = _selectedColor;
    if (selected == null) {
      setState(() => _feedback = const ChildFeedback.tip('先在下面选一个颜色吧！'));
      _voice.speak('先在下面选一个颜色吧');
      return;
    }
    if (_fills[region.id] == selected) return;

    // 区域第一次上色决定 firstTry；重涂保留原有判定（以最后一次状态为准）。
    if (!_fills.containsKey(region.id)) {
      _firstTry[region.id] = selected == region.colorKey;
    }
    setState(() {
      _fills[region.id] = selected;
      if (_correctCount == _regions.length) {
        _finish();
      } else if (selected == region.colorKey) {
        _feedback = const ChildFeedback.cheer('涂对啦，真好看！');
        _cheerKey += 1;
        _voice.speak('涂对啦，真好看！');
      } else {
        _feedback = const ChildFeedback.think('这个颜色好像不太对，换一个试试');
        _voice.speak('换个颜色试试看');
      }
    });
  }

  void _finish() {
    if (_completedCalled) return;
    _completedCalled = true;
    final total = _regions.length;
    final regionResults = _regions
        .map((region) => <String, dynamic>{
              'id': region.id,
              'colorKey': region.colorKey,
              'firstTry': _firstTry[region.id] == true,
            })
        .toList();
    final firstTryCount = regionResults
        .where((entry) => entry['firstTry'] == true)
        .length;
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
        'activityType': 'color_fill',
        'engine': 'parameterized',
        'passingScore': _passingScore,
        'timeLimitSec': _timeLimitSec,
        'regionResults': regionResults,
      },
    });

    setState(() {
      _finished = true;
      _feedback = null;
    });
  }

  String _promptText() {
    final raw = (widget.data['prompt']?.toString() ?? '').trim();
    return raw.isNotEmpty ? raw : '选一个颜色，给图形涂上漂亮的颜色吧！';
  }

  Widget _buildRegionCard(_FillRegion region, int index) {
    final filled = _fills.containsKey(region.id);
    final correct = _fills[region.id] == region.colorKey;
    final fillColor = filled
        ? (_kColorValues[_fills[region.id]] ?? Colors.grey)
        : Colors.grey.withValues(alpha: 0.25);
    final borderColor = correct
        ? ChildGamePalette.success
        : filled
            ? ChildGamePalette.retry
            : ChildGamePalette.inkSoft.withValues(alpha: 0.3);
    final targetColor = _kColorValues[region.colorKey] ?? Colors.grey;
    final glyph = childVisual(shape: region.shape, label: region.shape).glyph;

    return Semantics(
      button: true,
      label: '给图形涂上${_kColorLabels[region.colorKey]}',
      child: GestureDetector(
        onTap: () => _tapRegion(region),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 240),
          width: 112,
          height: 122,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.92),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: borderColor, width: correct ? 3 : 2),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.07),
                blurRadius: 10,
                offset: const Offset(0, 5),
              ),
            ],
          ),
          child: Stack(
            children: [
              Positioned.fill(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(10, 8, 10, 24),
                  child: CustomPaint(
                    painter: _ShapePainter(shape: region.shape, fill: fillColor),
                  ),
                ),
              ),
              Positioned(
                top: 4,
                right: 8,
                child: Text(glyph, style: const TextStyle(fontSize: 18)),
              ),
              Positioned(
                bottom: 6,
                left: 0,
                right: 0,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      width: 12,
                      height: 12,
                      decoration: BoxDecoration(
                        color: targetColor,
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: ChildGamePalette.inkSoft.withValues(alpha: 0.4),
                        ),
                      ),
                    ),
                    const SizedBox(width: 4),
                    Text(
                      _kColorLabels[region.colorKey] ?? '',
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w900,
                        color: ChildGamePalette.ink,
                      ),
                    ),
                  ],
                ),
              ),
              if (correct)
                const Positioned(
                  top: 4,
                  left: 8,
                  child: Text('✅', style: TextStyle(fontSize: 16)),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildColorSwatch(String color) {
    final selected = _selectedColor == color;
    return Semantics(
      button: true,
      label: '选择${_kColorLabels[color]}',
      child: GestureDetector(
        onTap: () {
          setState(() {
            _selectedColor = color;
            _feedback = null;
          });
          _voice.speak('你选了${_kColorLabels[color]}');
        },
        child: AnimatedScale(
          scale: selected ? 1.12 : 1.0,
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutBack,
          child: Container(
            width: 68,
            height: 78,
            padding: const EdgeInsets.symmetric(vertical: 6),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.85),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: selected
                    ? ChildGamePalette.coral
                    : ChildGamePalette.inkSoft.withValues(alpha: 0.25),
                width: selected ? 3 : 1.5,
              ),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: _kColorValues[color],
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: ChildGamePalette.inkSoft.withValues(alpha: 0.35),
                      width: 1.5,
                    ),
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  _kColorLabels[color] ?? '',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w900,
                    color: ChildGamePalette.ink,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_regions.length < 2 || _palette.length < 2) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.palette_outlined,
                size: 48, color: AppTheme.textSecondary),
            const SizedBox(height: 12),
            const Text('暂无涂色题目'),
            const SizedBox(height: 12),
            FilledButton(onPressed: widget.onExit, child: const Text('返回')),
          ],
        ),
      );
    }

    if (_finished) {
      final firstTryCount = _firstTry.values.where((v) => v).length;
      return GameCompletionScreen(
        title: widget.data['title']?.toString() ?? '涂色游戏',
        score: firstTryCount,
        total: _regions.length,
        onPlayAgain: () => setState(_reset),
        onBack: widget.onExit,
      );
    }

    final prompt = _promptText();

    return ChildGameShell(
      title: widget.data['title']?.toString() ?? '涂色游戏',
      mascot: '🎨',
      prompt: prompt,
      replayText: '先选颜色，再点图形。$prompt',
      stepLabel: '选颜色 → 点图形',
      current: _correctCount,
      total: _regions.length,
      voice: _voice,
      feedback: _feedback,
      cheerKey: _cheerKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.78),
              borderRadius: BorderRadius.circular(22),
            ),
            child: Wrap(
              spacing: 10,
              runSpacing: 10,
              alignment: WrapAlignment.center,
              children: [
                for (var i = 0; i < _regions.length; i++)
                  _buildRegionCard(_regions[i], i),
              ],
            ),
          ),
          const SizedBox(height: 14),
          const Row(
            children: [
              Text('🎨', style: TextStyle(fontSize: 20)),
              SizedBox(width: 6),
              Text(
                '先点一个大颜色',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w900,
                  color: ChildGamePalette.inkSoft,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.78),
              borderRadius: BorderRadius.circular(22),
              border: Border.all(
                color: ChildGamePalette.sunshine.withValues(alpha: 0.5),
                width: 2,
              ),
            ),
            child: Wrap(
              spacing: 10,
              runSpacing: 10,
              alignment: WrapAlignment.center,
              children: [
                for (final color in _palette) _buildColorSwatch(color),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// 内置形状库绘制器（附录 H.3：形状是组件资产，不是 AI 生成内容）。
class _ShapePainter extends CustomPainter {
  final String shape;
  final Color fill;

  _ShapePainter({required this.shape, required this.fill});

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    final shorter = math.min(size.width, size.height);
    canvas.translate((size.width - shorter) / 2, (size.height - shorter) / 2);
    canvas.scale(shorter / 100);

    final paint = Paint()
      ..color = fill
      ..style = PaintingStyle.fill;
    final outline = Paint()
      ..color = const Color(0x73505058)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;

    final path = _shapePath(shape);
    if (path != null) {
      canvas.drawPath(path, paint);
      canvas.drawPath(path, outline);
    } else if (shape == 'flower') {
      for (final angle in const [0, 60, 120, 180, 240, 300]) {
        final rad = angle * math.pi / 180;
        canvas.drawCircle(
          Offset(50 + 22 * math.cos(rad), 50 + 22 * math.sin(rad)),
          15,
          paint,
        );
        canvas.drawCircle(
          Offset(50 + 22 * math.cos(rad), 50 + 22 * math.sin(rad)),
          15,
          outline,
        );
      }
      canvas.drawCircle(const Offset(50, 50), 13, paint);
      canvas.drawCircle(const Offset(50, 50), 13, outline);
    } else if (shape == 'sun') {
      final ray = Paint()
        ..color = fill
        ..style = PaintingStyle.stroke
        ..strokeWidth = 7
        ..strokeCap = StrokeCap.round;
      for (final angle in const [0, 45, 90, 135, 180, 225, 270, 315]) {
        final rad = angle * math.pi / 180;
        canvas.drawLine(
          Offset(50 + 26 * math.cos(rad), 50 + 26 * math.sin(rad)),
          Offset(50 + 42 * math.cos(rad), 50 + 42 * math.sin(rad)),
          ray,
        );
      }
      canvas.drawCircle(const Offset(50, 50), 22, paint);
      canvas.drawCircle(const Offset(50, 50), 22, outline);
    } else if (shape == 'circle') {
      canvas.drawCircle(const Offset(50, 50), 36, paint);
      canvas.drawCircle(const Offset(50, 50), 36, outline);
    } else if (shape == 'square') {
      final rect = RRect.fromRectAndRadius(
        const Rect.fromLTWH(15, 15, 70, 70),
        const Radius.circular(10),
      );
      canvas.drawRRect(rect, paint);
      canvas.drawRRect(rect, outline);
    }
    canvas.restore();
  }

  Path? _shapePath(String shape) {
    switch (shape) {
      case 'triangle':
        return Path()
          ..moveTo(50, 12)
          ..lineTo(92, 86)
          ..lineTo(8, 86)
          ..close();
      case 'star':
        return Path()
          ..moveTo(50, 6)
          ..lineTo(61, 38)
          ..lineTo(95, 38)
          ..lineTo(67, 58)
          ..lineTo(78, 92)
          ..lineTo(50, 71)
          ..lineTo(22, 92)
          ..lineTo(33, 58)
          ..lineTo(5, 38)
          ..lineTo(39, 38)
          ..close();
      case 'heart':
        return Path()
          ..moveTo(50, 88)
          ..cubicTo(22, 64, 8, 44, 19, 27)
          ..cubicTo(28, 13, 45, 15, 50, 29)
          ..cubicTo(55, 15, 72, 13, 81, 27)
          ..cubicTo(92, 44, 78, 64, 50, 88)
          ..close();
      case 'moon':
        return Path()
          ..moveTo(62, 10)
          ..arcToPoint(const Offset(62, 90),
              radius: const Radius.circular(42), largeArc: true, clockwise: false)
          ..arcToPoint(const Offset(62, 10),
              radius: const Radius.circular(34), largeArc: true, clockwise: true)
          ..close();
      case 'cloud':
        return Path()
          ..moveTo(24, 74)
          ..arcToPoint(const Offset(26, 41),
              radius: const Radius.circular(17), clockwise: false)
          ..arcToPoint(const Offset(67, 32),
              radius: const Radius.circular(22), clockwise: false)
          ..arcToPoint(const Offset(78, 74),
              radius: const Radius.circular(17), clockwise: false)
          ..close();
      case 'fish':
        return Path()
          ..moveTo(14, 52)
          ..cubicTo(26, 32, 56, 30, 70, 46)
          ..lineTo(90, 34)
          ..lineTo(86, 52)
          ..lineTo(90, 70)
          ..lineTo(70, 58)
          ..cubicTo(56, 74, 26, 72, 14, 52)
          ..close();
      default:
        return null;
    }
  }

  @override
  bool shouldRepaint(_ShapePainter oldDelegate) =>
      oldDelegate.shape != shape || oldDelegate.fill != fill;
}
