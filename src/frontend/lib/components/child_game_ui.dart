import 'package:flutter/material.dart';

import '../services/child_game_voice.dart';

/// 幼儿游戏共享 UI 组件库。
///
/// 设计原则（针对 3-6 岁）：
/// - **图形优先**：每张卡片由一个大 emoji / 大字形做主视觉，文字只做小标签；
/// - **大触摸区**：主操作卡 ≥ 88px，按钮 ≥ 52px，误差容忍度高；
/// - **即时反馈**：按压回弹、状态变色、答对星星庆祝、答错摇晃提示；
/// - **语音陪伴**：统一的大喇叭重听按钮 + 静音开关，播报时按钮呼吸；
/// - **文本兜底**：语音失败时指令始终可见，不阻塞任何操作。
///
/// 本文件只负责「长什么样 / 怎么点」，不参与任何题型逻辑与结果契约。
class ChildGamePalette {
  static const Color cream = Color(0xFFFFF9E8);
  static const Color creamDeep = Color(0xFFFFEBC2);
  static const Color sunshine = Color(0xFFFFC94D);
  static const Color coral = Color(0xFFFF8E7C);
  static const Color sky = Color(0xFF79C7F2);
  static const Color mint = Color(0xFF74D6A6);
  static const Color lilac = Color(0xFFB7A2F2);
  static const Color ink = Color(0xFF3B3012);
  static const Color inkSoft = Color(0xFF7B6B3F);
  static const Color success = Color(0xFF37A96B);
  static const Color retry = Color(0xFFE46B4A);

  /// 每张卡片轮换一个柔和底色，避免整屏只有白卡片。
  static const List<Color> tints = [
    Color(0xFFFFF0CF),
    Color(0xFFE4F3FF),
    Color(0xFFE7F7EC),
    Color(0xFFFFE9E4),
    Color(0xFFF0EAFF),
    Color(0xFFFFF3E0),
  ];

  static Color tintFor(int index) => tints[index % tints.length];

  static const LinearGradient background = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFFFFDF3), Color(0xFFFFF0CC), Color(0xFFF3F6FF)],
  );
}

/// 一个「视觉主图」：通常是 emoji，描红题里是汉字/数字字形。
class ChildVisual {
  final String glyph;
  final bool isTextGlyph;

  const ChildVisual(this.glyph, {this.isTextGlyph = false});
}

const Map<String, String> _shapeEmoji = {
  'circle': '⭕',
  'star': '⭐',
  'heart': '❤️',
  'triangle': '🔺',
  'square': '🔷',
  'flower': '🌸',
  'sun': '☀️',
  'moon': '🌙',
  'cloud': '☁️',
  'fish': '🐟',
};

/// MuMu / 老 Android 的 emoji 字体较旧：Unicode 11 之后的新图形会渲染成
/// 「方框带叉」的豆腐块，部分 dingbat 会退化成黑白字形（实测 🧺 🪷 ☃️）。
/// 内容工厂随时可能生成更新的 emoji，所以在**渲染层**统一做兼容，而不是
/// 只改某一份样例数据：语义映射优先，其余按稳定 hash 换成已验证可用的图形。
const Map<String, String> _compatEmoji = {
  '🪷': '🌸', // 荷花：实测缺字
  '🧺': '🏠', // 篮子 / 送回家：实测缺字
  '☃': '⛄', // 文字雪人：实测黑白异形
  '🃏': '🎲', '🦊': '🐻', '🦉': '🐦', '🦋': '🌸', '🦆': '🐤',
  '🧩': '🎨', '🧸': '🎈', '🪁': '🎈', '🧱': '🎨',
  '🟦': '🔷', '🟡': '☀️', '🟢': '🍀', '🟣': '🍇', '🟠': '🍊',
  '⛰': '🌋', '🌧': '☔', '🖍': '🎨',
};

/// 只在老字体上确认可用的彩色图形，用于兜底未知的新 emoji。
const List<String> _legacySafeGlyphs = [
  '🌸', '🌷', '🍀', '🌈', '⭐', '🎈', '🎁', '🐻', '🐦', '🍎',
  '🍉', '🍒', '🎉', '⛄', '☀️', '🌙', '🐟', '🚗', '⚽', '📚',
  '🎨', '✏️', '🏠', '🐱', '🍇',
];

/// 老 Android emoji 字体基本缺失的码点区间（Unicode 9~14 新增动物/物件、
/// 12/13 彩色几何），外加几个会退化成黑白字形的 dingbat。
bool _isLegacyUnsupported(int cp) =>
    (cp >= 0x1F7D0 && cp <= 0x1F7FF) ||
    (cp >= 0x1F980 && cp <= 0x1FAFF) ||
    cp == 0x1F327 ||
    cp == 0x26F0 ||
    cp == 0x2603 ||
    cp == 0x1F58D;

int _glyphHash(String value) {
  var hash = 0;
  for (final rune in value.runes) {
    hash = (hash * 31 + rune) & 0x7FFFFFFF;
  }
  return hash;
}

/// 把任意题目图形转换成老 Android 也能完整显示的图形。
///
/// - 已验证可用的老 emoji 原样返回（🐱 / 🌸 / 🎉 / 🤔 …）；
/// - 已知缺字的图形按语义替换（🪷→🌸、🧺→🏠、☃️→⛄）；
/// - 未来内容工厂生成的未知新 emoji，按 glyph 的稳定 hash 兜底，绝不空屏；
/// - 描红题的汉字/数字是 `isTextGlyph`，调用方会跳过本函数。
String safeChildGlyph(String glyph) {
  if (glyph.isEmpty) return glyph;
  final buffer = StringBuffer();
  var replaced = false;
  for (final rune in glyph.runes) {
    // 变体选择符 / keycap：基础图形被替换时丢弃，否则保留（如 ❄️、1️⃣）。
    if (rune == 0xFE0F || rune == 0x20E3) {
      if (!replaced) buffer.writeCharCode(rune);
      continue;
    }
    final ch = String.fromCharCode(rune);
    final mapped = _compatEmoji[ch];
    if (mapped != null) {
      buffer.write(mapped);
      replaced = true;
    } else if (_isLegacyUnsupported(rune)) {
      buffer.write(
        _legacySafeGlyphs[_glyphHash(glyph) % _legacySafeGlyphs.length],
      );
      replaced = true;
    } else {
      buffer.write(ch);
    }
  }
  final result = buffer.toString();
  return result.isEmpty ? _legacySafeGlyphs.first : result;
}

/// 无 icon 时的中文关键词 → emoji 兜底，保证「不要都是文字」。
const Map<String, String> _keywordEmoji = {
  '春': '🌸', '夏': '☀️', '秋': '🍂', '冬': '❄️',
  '鸟': '🐦', '鱼': '🐟', '猫': '🐱', '狗': '🐶', '鸭': '🐤',
  '鸡': '🐔', '兔': '🐰', '熊': '🐻', '虎': '🐯', '象': '🐘',
  '花': '🌷', '树': '🌳', '草': '🌱', '叶': '🍃', '太阳': '☀️',
  '月亮': '🌙', '星': '⭐', '云': '☁️', '雨': '☔', '雪': '❄️',
  '苹果': '🍎', '香蕉': '🍌', '葡萄': '🍇', '西瓜': '🍉',
  '草莓': '🍓', '橙': '🍊', '桃': '🍑', '梨': '🍐',
  '车': '🚗', '船': '⛵', '飞机': '✈️', '球': '⚽',
  '书': '📚', '笔': '✏️', '山': '🌋', '水': '💧', '火': '🔥',
  '红': '🔴', '蓝': '🔵', '黄': '☀️', '绿': '🍀', '紫': '🍇',
  '一': '1️⃣', '二': '2️⃣', '三': '3️⃣', '四': '4️⃣', '五': '5️⃣',
  '1': '1️⃣', '2': '2️⃣', '3': '3️⃣', '4': '4️⃣', '5': '5️⃣',
  '6': '6️⃣', '7': '7️⃣', '8': '8️⃣', '9': '9️⃣', '10': '🔟',
};

const List<String> _fallbackEmoji = [
  '🐥', '🎈', '🍭', '🌈', '🐣', '🎠', '🎨', '🍓', '🍀', '🐳', '🌻', '🎁',
];

/// 把参数里的 icon / label / shape 统一解析成图形。
ChildVisual childVisual({
  String? icon,
  required String label,
  String? shape,
}) {
  final rawIcon = icon?.trim() ?? '';
  if (rawIcon.isNotEmpty) return ChildVisual(rawIcon);

  final shapeEmoji = _shapeEmoji[shape];
  if (shapeEmoji != null) return ChildVisual(shapeEmoji);

  for (final entry in _keywordEmoji.entries) {
    if (label.contains(entry.key)) return ChildVisual(entry.value);
  }

  var hash = 0;
  for (final rune in label.runes) {
    hash = (hash * 31 + rune) & 0x7FFFFFFF;
  }
  return ChildVisual(_fallbackEmoji[hash % _fallbackEmoji.length]);
}

/// 语音文本：剥掉 emoji，避免朗读时把表情读出来。
String childSpeechText(String text) => text
    .replaceAll(
      RegExp(
        r'[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}]',
        unicode: true,
      ),
      '',
    )
    .trim();

enum ChildTileState { normal, selected, correct, wrong, dimmed, revealed }

/// 大图形卡片：幼儿游戏的主要操作单元。
///
/// - 主视觉是 emoji / 大字形，文字只是下方的小标签；
/// - 最小 88x88 触摸区，按压 0.9 回弹，答对放大 1.06 并弹一下；
/// - 状态配色让「对 / 错 / 选中 / 待听」一眼可辨。
class ChildVisualTile extends StatefulWidget {
  final ChildVisual visual;
  final String label;
  final ChildTileState state;
  final VoidCallback? onTap;
  final double size;
  final Color? tint;
  final String? semanticLabel;

  const ChildVisualTile({
    super.key,
    required this.visual,
    required this.label,
    this.state = ChildTileState.normal,
    this.onTap,
    this.size = 104,
    this.tint,
    this.semanticLabel,
  });

  @override
  State<ChildVisualTile> createState() => _ChildVisualTileState();
}

class _ChildVisualTileState extends State<ChildVisualTile> {
  bool _pressed = false;

  Color _background() {
    switch (widget.state) {
      case ChildTileState.correct:
        return ChildGamePalette.success.withValues(alpha: 0.16);
      case ChildTileState.wrong:
        return ChildGamePalette.retry.withValues(alpha: 0.16);
      case ChildTileState.selected:
      case ChildTileState.revealed:
        return ChildGamePalette.sunshine.withValues(alpha: 0.34);
      case ChildTileState.dimmed:
        return Colors.white.withValues(alpha: 0.55);
      case ChildTileState.normal:
        return widget.tint ?? Colors.white;
    }
  }

  Color _border() {
    switch (widget.state) {
      case ChildTileState.correct:
        return ChildGamePalette.success;
      case ChildTileState.wrong:
        return ChildGamePalette.retry;
      case ChildTileState.selected:
      case ChildTileState.revealed:
        return ChildGamePalette.coral;
      case ChildTileState.dimmed:
        return Colors.grey.withValues(alpha: 0.28);
      case ChildTileState.normal:
        return ChildGamePalette.inkSoft.withValues(alpha: 0.22);
    }
  }

  @override
  Widget build(BuildContext context) {
    final enabled = widget.onTap != null;
    final dimmed = widget.state == ChildTileState.dimmed;
    final scale = _pressed
        ? 0.90
        : widget.state == ChildTileState.correct
            ? 1.06
            : 1.0;

    return Semantics(
      button: enabled,
      enabled: enabled,
      label: widget.semanticLabel ?? widget.label,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: enabled ? (_) => setState(() => _pressed = true) : null,
        onTapUp: enabled
            ? (_) {
                setState(() => _pressed = false);
                widget.onTap?.call();
              }
            : null,
        onTapCancel: enabled ? () => setState(() => _pressed = false) : null,
        child: AnimatedScale(
          scale: scale,
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutBack,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 240),
            curve: Curves.easeOut,
            width: widget.size,
            height: widget.size,
            decoration: BoxDecoration(
              color: _background(),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(
                color: _border(),
                width: widget.state == ChildTileState.normal ? 1.6 : 3,
              ),
              boxShadow: dimmed
                  ? null
                  : [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.07),
                        blurRadius: 10,
                        offset: const Offset(0, 5),
                      ),
                    ],
            ),
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
            child: Opacity(
              opacity: dimmed ? 0.55 : 1,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Expanded(
                    child: Center(
                      child: Text(
                        widget.visual.isTextGlyph
                            ? widget.visual.glyph
                            : safeChildGlyph(widget.visual.glyph),
                        textAlign: TextAlign.center,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: widget.visual.isTextGlyph
                              ? widget.size * 0.44
                              : widget.size * 0.42,
                          fontWeight: widget.visual.isTextGlyph
                              ? FontWeight.w900
                              : FontWeight.w600,
                          color: widget.visual.isTextGlyph
                              ? ChildGamePalette.ink
                              : null,
                          height: 1.1,
                        ),
                      ),
                    ),
                  ),
                  Text(
                    widget.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      color: ChildGamePalette.ink,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// 篮子里已放好的小图形（点击可取回）。
class ChildMiniChip extends StatelessWidget {
  final ChildVisual visual;
  final String label;
  final VoidCallback onTap;

  const ChildMiniChip({
    super.key,
    required this.visual,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: '取回$label',
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          width: 54,
          height: 54,
          decoration: BoxDecoration(
            color: ChildGamePalette.success.withValues(alpha: 0.14),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: ChildGamePalette.success.withValues(alpha: 0.6),
              width: 2,
            ),
          ),
          padding: const EdgeInsets.all(2),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                safeChildGlyph(visual.glyph),
                style: const TextStyle(fontSize: 25, height: 1.05),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w700,
                  color: ChildGamePalette.ink,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 大号主操作按钮（≥52px），用于「放到这里」「再听一次」等。
class ChildBigButton extends StatelessWidget {
  final String label;
  final String emoji;
  final VoidCallback? onTap;
  final Color color;
  final double height;

  const ChildBigButton({
    super.key,
    required this.label,
    this.emoji = '',
    this.onTap,
    this.color = ChildGamePalette.sunshine,
    this.height = 54,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          height: height,
          decoration: BoxDecoration(
            color: onTap == null
                ? Colors.grey.withValues(alpha: 0.25)
                : color.withValues(alpha: 0.85),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: color.withValues(alpha: 0.9),
              width: 2,
            ),
          ),
          alignment: Alignment.center,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (emoji.isNotEmpty) ...[
                Text(emoji, style: const TextStyle(fontSize: 22)),
                const SizedBox(width: 6),
              ],
              Text(
                label,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w900,
                  color: ChildGamePalette.ink,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 星星进度：一眼看到「还差几步」，比纯文字更适合幼儿。
class ChildStarProgress extends StatelessWidget {
  final int current;
  final int total;
  final String? caption;

  const ChildStarProgress({
    super.key,
    required this.current,
    required this.total,
    this.caption,
  });

  @override
  Widget build(BuildContext context) {
    final safeTotal = total < 1 ? 1 : total;
    final ratio = (current / safeTotal).clamp(0.0, 1.0).toDouble();
    final starCount = safeTotal > 8 ? 8 : safeTotal;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.78),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: ChildGamePalette.sunshine.withValues(alpha: 0.55),
          width: 1.6,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              for (var i = 0; i < starCount; i++)
                Padding(
                  padding: const EdgeInsets.only(right: 4),
                  child: Icon(
                    Icons.star_rounded,
                    size: 24,
                    color: (i / starCount) < ratio
                        ? ChildGamePalette.sunshine
                        : ChildGamePalette.inkSoft.withValues(alpha: 0.22),
                  ),
                ),
              const Spacer(),
              Text(
                caption ?? '$current / $safeTotal',
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w900,
                  color: ChildGamePalette.inkSoft,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: TweenAnimationBuilder<double>(
              tween: Tween<double>(begin: 0, end: ratio),
              duration: const Duration(milliseconds: 420),
              curve: Curves.easeOutCubic,
              builder: (context, value, _) => LinearProgressIndicator(
                value: value,
                minHeight: 9,
                backgroundColor: ChildGamePalette.creamDeep,
                valueColor: const AlwaysStoppedAnimation<Color>(
                  ChildGamePalette.coral,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

enum ChildFeedbackTone { cheer, think, tip }

@immutable
class ChildFeedback {
  final ChildFeedbackTone tone;
  final String text;

  const ChildFeedback(this.tone, this.text);

  const ChildFeedback.cheer(this.text) : tone = ChildFeedbackTone.cheer;

  const ChildFeedback.think(this.text) : tone = ChildFeedbackTone.think;

  const ChildFeedback.tip(this.text) : tone = ChildFeedbackTone.tip;

  String get emoji {
    switch (tone) {
      case ChildFeedbackTone.cheer:
        return '🎉';
      case ChildFeedbackTone.think:
        return '🤔';
      case ChildFeedbackTone.tip:
        return '💡';
    }
  }

  Color get color {
    switch (tone) {
      case ChildFeedbackTone.cheer:
        return ChildGamePalette.success;
      case ChildFeedbackTone.think:
        return ChildGamePalette.retry;
      case ChildFeedbackTone.tip:
        return ChildGamePalette.sky;
    }
  }
}

/// 答对时的一次性星星庆祝（不常驻动画，测试可 settle）。
class ChildStarBurst extends StatefulWidget {
  final int trigger;

  const ChildStarBurst({super.key, required this.trigger});

  @override
  State<ChildStarBurst> createState() => _ChildStarBurstState();
}

class _ChildStarBurstState extends State<ChildStarBurst>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 480),
    );
    _scale = Tween<double>(begin: 0.35, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOutBack),
    );
    if (widget.trigger > 0) _controller.forward(from: 0);
  }

  @override
  void didUpdateWidget(covariant ChildStarBurst oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.trigger != oldWidget.trigger && widget.trigger > 0) {
      _controller.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ScaleTransition(
      scale: _scale,
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('✨', style: TextStyle(fontSize: 18)),
          Text('⭐', style: TextStyle(fontSize: 22)),
          Text('✨', style: TextStyle(fontSize: 18)),
        ],
      ),
    );
  }
}

/// 反馈横幅：大图 + 短句 + 弹出动画，答对带星星庆祝。
class ChildFeedbackBanner extends StatelessWidget {
  final ChildFeedback? feedback;
  final int cheerKey;

  const ChildFeedbackBanner({
    super.key,
    required this.feedback,
    this.cheerKey = 0,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 260),
      transitionBuilder: (child, animation) => ScaleTransition(
        scale: CurvedAnimation(parent: animation, curve: Curves.easeOutBack),
        child: FadeTransition(opacity: animation, child: child),
      ),
      child: feedback == null
          ? const SizedBox.shrink(key: ValueKey('empty'))
          : Container(
              key: ValueKey('${feedback!.tone}-${feedback!.text}-$cheerKey'),
              margin: const EdgeInsets.only(top: 12),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: feedback!.color.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(22),
                border: Border.all(
                  color: feedback!.color.withValues(alpha: 0.65),
                  width: 2,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(feedback!.emoji, style: const TextStyle(fontSize: 30)),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(
                      feedback!.text,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w900,
                        color: ChildGamePalette.ink,
                      ),
                    ),
                  ),
                  if (feedback!.tone == ChildFeedbackTone.cheer) ...[
                    const SizedBox(width: 6),
                    ChildStarBurst(trigger: cheerKey),
                  ],
                ],
              ),
            ),
    );
  }
}

/// 大喇叭：重听当前指令；播报时呼吸放大；旁边可静音。
class ChildVoiceButton extends StatefulWidget {
  final ChildGameVoice voice;
  final String replayText;
  final double size;

  const ChildVoiceButton({
    super.key,
    required this.voice,
    required this.replayText,
    this.size = 56,
  });

  @override
  State<ChildVoiceButton> createState() => _ChildVoiceButtonState();
}

class _ChildVoiceButtonState extends State<ChildVoiceButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _pulse;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 620),
    );
    _pulse = Tween<double>(begin: 1.0, end: 1.12).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
    widget.voice.addListener(_sync);
    _sync();
  }

  void _sync() {
    if (!mounted) return;
    if (widget.voice.speaking && widget.voice.enabled) {
      if (!_controller.isAnimating) _controller.repeat(reverse: true);
    } else {
      _controller.stop();
      _controller.reset();
    }
    setState(() {});
  }

  @override
  void didUpdateWidget(covariant ChildVoiceButton oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.voice != widget.voice) {
      oldWidget.voice.removeListener(_sync);
      widget.voice.addListener(_sync);
      _sync();
    }
  }

  @override
  void dispose() {
    widget.voice.removeListener(_sync);
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final muted = !widget.voice.enabled;
    final speaking = widget.voice.speaking && !muted;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        AnimatedBuilder(
          animation: _pulse,
          builder: (context, _) => Transform.scale(
            scale: speaking ? _pulse.value : 1.0,
            child: Semantics(
              button: true,
              label: '再听一遍指令',
              child: GestureDetector(
                onTap: () => widget.voice.speak(widget.replayText),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 220),
                  width: widget.size,
                  height: widget.size,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: muted
                        ? Colors.grey.withValues(alpha: 0.22)
                        : speaking
                            ? ChildGamePalette.coral
                            : ChildGamePalette.sunshine,
                    border: Border.all(
                      color: muted ? Colors.grey : ChildGamePalette.inkSoft,
                      width: 2,
                    ),
                    boxShadow: speaking
                        ? [
                            BoxShadow(
                              color: ChildGamePalette.coral.withValues(alpha: 0.5),
                              blurRadius: 14,
                              spreadRadius: 3,
                            ),
                          ]
                        : null,
                  ),
                  child: Icon(
                    muted
                        ? Icons.volume_off_rounded
                        : Icons.volume_up_rounded,
                    size: widget.size * 0.52,
                    color: muted ? Colors.grey : ChildGamePalette.ink,
                  ),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(width: 4),
        Semantics(
          button: true,
          label: muted ? '开启语音' : '关闭语音',
          child: GestureDetector(
            onTap: widget.voice.toggle,
            child: Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.85),
                border: Border.all(
                  color: ChildGamePalette.inkSoft.withValues(alpha: 0.35),
                ),
              ),
              child: Icon(
                muted ? Icons.volume_off_rounded : Icons.volume_up_rounded,
                size: 18,
                color: ChildGamePalette.inkSoft,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// 六种参数化游戏统一外壳。
///
/// 只接管标题、吉祥物、语音气泡、星星进度、反馈横幅与背景；
/// 游戏主体通过 [child] 传入，`activityData` / 结果与计分逻辑完全不碰。
class ChildGameShell extends StatelessWidget {
  final String title;
  final String mascot;
  final String prompt;
  final String replayText;
  final String? stepLabel;
  final int current;
  final int total;
  final ChildGameVoice voice;
  final ChildFeedback? feedback;
  final int cheerKey;
  final Widget child;

  const ChildGameShell({
    super.key,
    required this.title,
    required this.prompt,
    required this.replayText,
    required this.voice,
    required this.child,
    this.mascot = '🐻',
    this.stepLabel,
    this.current = 0,
    this.total = 0,
    this.feedback,
    this.cheerKey = 0,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: ChildGamePalette.background,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(
          color: ChildGamePalette.sunshine.withValues(alpha: 0.45),
          width: 2,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 18),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                // 吉祥物：入场弹一下，给孩子一个「有伙伴陪我玩」的感觉。
                Container(
                  width: 54,
                  height: 54,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white.withValues(alpha: 0.9),
                    border: Border.all(
                      color: ChildGamePalette.sunshine,
                      width: 2.5,
                    ),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    safeChildGlyph(mascot),
                    style: const TextStyle(fontSize: 30),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w900,
                          color: ChildGamePalette.ink,
                        ),
                      ),
                      if (stepLabel != null)
                        Text(
                          stepLabel!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: ChildGamePalette.inkSoft,
                          ),
                        ),
                    ],
                  ),
                ),
                ChildVoiceButton(voice: voice, replayText: replayText),
              ],
            ),
            const SizedBox(height: 12),
            // 语音气泡：指令常显，语音只是陪伴不是门槛。
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.88),
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(6),
                  topRight: Radius.circular(22),
                  bottomLeft: Radius.circular(22),
                  bottomRight: Radius.circular(22),
                ),
                border: Border.all(
                  color: ChildGamePalette.sky.withValues(alpha: 0.55),
                  width: 1.8,
                ),
              ),
              child: Row(
                children: [
                  const Text('💬', style: TextStyle(fontSize: 24)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      prompt,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        height: 1.35,
                        color: ChildGamePalette.ink,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            ChildStarProgress(current: current, total: total),
            const SizedBox(height: 14),
            child,
            ChildFeedbackBanner(feedback: feedback, cheerKey: cheerKey),
          ],
        ),
      ),
    );
  }
}
