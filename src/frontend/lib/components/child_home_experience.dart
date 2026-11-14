import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/child_density.dart';
import '../theme/child_theme.dart';

/// 孩子端首页体验组件（Flutter 版）。
///
/// 设计来源：`docs/child-ui-redesign-v1-20261112.html` 与
/// `docs/child-ui-themes-v2-20261112.html`，与 Web 端
/// `src/frontend-web/src/components/ChildHomeExperience.tsx` 同一套信息架构：
///
///   问候（小犀 + 气泡）→ 进度 → 唯一主任务 Hero → 次要动作 → AI 入口
///   → 今天的小发现（横滑）→ 大图标学科 → 今天要做的事
///
/// 两条原则：
///   1. 首屏只给一个主任务；任何数据缺失都回退到内置内容，
///      孩子端不出现「暂无 / 暂时不可用」这类空状态。
///   2. 三档年龄密度不是三套组件：所有组件读同一份 [ChildDensity]，
///      未传时默认中档，保证组件可独立使用且家长端行为稳定。
///
/// 卡通感来自「贴纸」：粗描边 + 实体下阴影 + 轻微倾斜 + 果冻按压，
/// 由 [ChildSticker] / [ChildJelly] 统一提供；honey 皮肤保持原绘本观感。

// ════════════════════════════════════════════════════════════════════
//  基础视觉原子
// ════════════════════════════════════════════════════════════════════

/// 贴纸卡片：卡通皮肤下是「粗描边 + 实体下阴影」，honey 下是柔和投影。
class ChildSticker extends StatelessWidget {
  const ChildSticker({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.radius,
    this.background,
    this.gradient,
    this.strong = false,
    this.minHeight,
    this.width,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double? radius;
  final Color? background;
  final Gradient? gradient;

  /// 更大一圈的投影，用于主任务这类重点卡片。
  final bool strong;

  final double? minHeight;
  final double? width;

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    final cartoon = palette.isCartoon;
    final r = radius ?? palette.radiusLg;

    return Container(
      width: width,
      constraints:
          minHeight == null ? null : BoxConstraints(minHeight: minHeight!),
      padding: padding,
      decoration: BoxDecoration(
        color: gradient == null ? (background ?? palette.card) : null,
        gradient: gradient,
        borderRadius: BorderRadius.circular(r),
        border: Border.all(
          color: cartoon
              ? Color.lerp(palette.line, palette.ink, 0.22)!
              : palette.line.withValues(alpha: 0.7),
          width: cartoon ? palette.borderW : 1,
        ),
        boxShadow: cartoon
            ? <BoxShadow>[
                BoxShadow(
                  color: palette.line,
                  offset: Offset(0, strong ? 6 : 4),
                  blurRadius: 0,
                ),
              ]
            : <BoxShadow>[
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.06),
                  offset: const Offset(0, 8),
                  blurRadius: 20,
                ),
              ],
      ),
      child: child,
    );
  }
}

/// 果冻按压：按下微缩并下坠，松开回弹，还原 Web 端 `tactile-press`。
class ChildJelly extends StatefulWidget {
  const ChildJelly({
    super.key,
    required this.child,
    this.onTap,
    this.tiltDegrees = 0,
    this.enabled = true,
  });

  final Widget child;
  final VoidCallback? onTap;

  /// 卡片轻微倾斜角（正值顺时针），卡通皮肤用 ±0.8° 制造手作感。
  final double tiltDegrees;

  final bool enabled;

  @override
  State<ChildJelly> createState() => _ChildJellyState();
}

class _ChildJellyState extends State<ChildJelly> {
  bool _pressed = false;

  void _setPressed(bool value) {
    if (!mounted || _pressed == value) return;
    setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    final reduced = MediaQuery.of(context).disableAnimations;
    const duration = Duration(milliseconds: 140);

    Widget content = widget.child;
    if (widget.tiltDegrees != 0 && !reduced) {
      content = Transform.rotate(
        angle: widget.tiltDegrees * math.pi / 180,
        child: content,
      );
    }

    if (!widget.enabled) return content;

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) => _setPressed(true),
      onTapUp: (_) {
        _setPressed(false);
        widget.onTap?.call();
      },
      onTapCancel: () => _setPressed(false),
      child: AnimatedScale(
        scale: _pressed ? 0.97 : 1,
        duration: reduced ? Duration.zero : duration,
        curve: Curves.easeOut,
        child: AnimatedSlide(
          offset: _pressed ? const Offset(0, 0.02) : Offset.zero,
          duration: reduced ? Duration.zero : duration,
          curve: Curves.easeOut,
          child: content,
        ),
      ),
    );
  }
}

/// 小犀吉祥物：首页大角色带主题色光晕与轻微摆动。
class ChildMascot extends StatefulWidget {
  const ChildMascot({super.key, this.size = 64, this.bob = true});

  final double size;
  final bool bob;

  @override
  State<ChildMascot> createState() => _ChildMascotState();
}

class _ChildMascotState extends State<ChildMascot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 3400),
      vsync: this,
    );
    if (widget.bob) _controller.repeat(reverse: true);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // 系统「减少动态效果」时停摆，避免眩晕（对齐 Web 的 prefers-reduced-motion）。
    if (MediaQuery.of(context).disableAnimations) {
      _controller.stop();
    } else if (widget.bob && !_controller.isAnimating) {
      _controller.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);

    final image = Image.asset(
      'assets/images/mascot.png',
      width: widget.size,
      height: widget.size,
      fit: BoxFit.contain,
      errorBuilder: (_, __, ___) => Text(
        '🦄',
        style: TextStyle(fontSize: widget.size * 0.72),
      ),
    );

    Widget mascot = Container(
      width: widget.size,
      height: widget.size,
      decoration: palette.isCartoon
          ? BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(
                colors: <Color>[
                  palette.pop.withValues(alpha: 0.22),
                  palette.pop.withValues(alpha: 0),
                ],
              ),
            )
          : null,
      alignment: Alignment.center,
      child: image,
    );

    if (!widget.bob) return mascot;

    // RepaintBoundary：摆动只重绘这 64px 的小图，不要把整页（多张卡片+阴影）
    // 一起拉着每帧重绘。它在隐藏 tab 里也会被 TickerMode 停掉。
    return RepaintBoundary(
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          final t = _controller.value;
          final dy = -5 * math.sin(t * math.pi);
          final rotate = (-2 + 4 * t) * math.pi / 180;
          return Transform.translate(
            offset: Offset(0, dy),
            child: Transform.rotate(angle: rotate, child: child),
          );
        },
        child: mascot,
      ),
    );
  }
}

/// 章节标题 + 主题小挂饰（卡通皮肤右侧挂一个符号）。
class ChildSectionTitle extends StatelessWidget {
  const ChildSectionTitle({
    super.key,
    required this.title,
    required this.icon,
    this.trailing,
  });

  final String title;
  final IconData icon;
  final Widget? trailing;

  static const Map<ChildThemeKey, String> _sparks = <ChildThemeKey, String>{
    ChildThemeKey.honey: '',
    ChildThemeKey.candy: '✦',
    ChildThemeKey.forest: '❧',
    ChildThemeKey.space: '✧',
  };

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    final spark = _sparks[palette.themeKey] ?? '';

    return Row(
      children: <Widget>[
        Icon(icon, size: 20, color: palette.pop),
        const SizedBox(width: 8),
        Text(
          title,
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w700,
            color: palette.ink,
          ),
        ),
        if (spark.isNotEmpty) ...<Widget>[
          const SizedBox(width: 6),
          Text(
            spark,
            style: TextStyle(
              fontSize: 18,
              color: palette.pop.withValues(alpha: 0.85),
            ),
          ),
        ],
        const Spacer(),
        if (trailing != null) trailing!,
      ],
    );
  }
}

/// 主任务 Hero 右上角的胶带贴纸。
class _TapeSticker extends StatelessWidget {
  const _TapeSticker();

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    if (!palette.isCartoon) return const SizedBox.shrink();
    return Transform.rotate(
      angle: 8 * math.pi / 180,
      child: Container(
        width: 64,
        height: 18,
        decoration: BoxDecoration(
          color: palette.cta,
          borderRadius: BorderRadius.circular(3),
          border: Border.all(
            color: Color.lerp(palette.line, palette.ink, 0.22)!,
            width: 2,
          ),
        ),
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════════
//  进度面板：纯图形星星 → 进度环 → 任务勾选清单
// ════════════════════════════════════════════════════════════════════

class ChildProgressPanel extends StatelessWidget {
  const ChildProgressPanel({
    super.key,
    required this.density,
    required this.stars,
  });

  final ChildDensity? density;

  /// 0–3 颗星。
  final int stars;

  ChildDensity get _density => density ?? childDensityForLevel(1);

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    final collected = stars.clamp(0, 3);

    switch (_density.progressMode) {
      case ChildProgressMode.stars:
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
          child: Row(
            children: <Widget>[
              Text(
                '今天的星星',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: palette.ink2,
                ),
              ),
              const SizedBox(width: 6),
              for (var i = 0; i < 3; i++)
                Padding(
                  padding: const EdgeInsets.only(right: 2),
                  child: Icon(
                    i < collected
                        ? Icons.star_rounded
                        : Icons.star_outline_rounded,
                    size: 28,
                    color: i < collected ? palette.pop : palette.line,
                  ),
                ),
              const Spacer(),
              Text(
                '已收集 $collected / 3',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: palette.ink2,
                ),
              ),
            ],
          ),
        );

      case ChildProgressMode.ring:
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: palette.soft,
            borderRadius: BorderRadius.circular(palette.radiusMd),
          ),
          child: Row(
            children: <Widget>[
              SizedBox(
                width: 48,
                height: 48,
                child: Stack(
                  alignment: Alignment.center,
                  children: <Widget>[
                    SizedBox(
                      width: 48,
                      height: 48,
                      child: CircularProgressIndicator(
                        value: collected / 3,
                        strokeWidth: 6,
                        // 轨道用 ink2 低透明度叠加，保证 honey 浅色底上也能看见环
                        backgroundColor: Color.alphaBlend(
                          palette.ink2.withValues(alpha: 0.22),
                          palette.soft,
                        ),
                        color: palette.pop,
                        strokeCap: StrokeCap.round,
                      ),
                    ),
                    Text(
                      '$collected/3',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        color: palette.ink,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      '今日进度',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: palette.ink,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      collected >= 3
                          ? '今天全部完成啦！'
                          : '再拿 ${3 - collected} 颗星星就集满啦',
                      style: TextStyle(fontSize: 12, color: palette.ink2),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );

      case ChildProgressMode.checklist:
        const rows = <String>['完成今天的主任务', '发现一个小知识', '和小犀聊聊天'];
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: palette.soft,
            borderRadius: BorderRadius.circular(palette.radiusMd),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Text(
                    '今日小任务',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: palette.ink,
                    ),
                  ),
                  const Spacer(),
                  Text(
                    '$collected / 3 完成',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: palette.ink2,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              for (var i = 0; i < rows.length; i++)
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(
                    children: <Widget>[
                      Container(
                        width: 20,
                        height: 20,
                        decoration: BoxDecoration(
                          color:
                              i < collected ? palette.pop : Colors.transparent,
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(
                            color: i < collected ? palette.pop : palette.line,
                          ),
                        ),
                        child: i < collected
                            ? Icon(Icons.check_rounded,
                                size: 14, color: palette.onPrimary)
                            : null,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        rows[i],
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: palette.ink2,
                          decoration: i < collected
                              ? TextDecoration.lineThrough
                              : TextDecoration.none,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        );
    }
  }
}

// ════════════════════════════════════════════════════════════════════
//  主任务 Hero
// ════════════════════════════════════════════════════════════════════

class ChildPrimaryTask {
  const ChildPrimaryTask({
    required this.kicker,
    required this.title,
    required this.meta,
    required this.buttonLabel,
    required this.onStart,
  });

  final String kicker;
  final String title;
  final String meta;
  final String buttonLabel;
  final VoidCallback onStart;
}

class ChildSecondaryAction {
  const ChildSecondaryAction({
    required this.label,
    required this.emoji,
    required this.onSelect,
  });

  final String label;
  final String emoji;
  final VoidCallback onSelect;
}

class ChildHomeHero extends StatelessWidget {
  const ChildHomeHero({
    super.key,
    required this.userName,
    required this.task,
    required this.stars,
    required this.onOpenCompanion,
    this.secondaryActions = const <ChildSecondaryAction>[],
    this.density,
  });

  final String userName;
  final ChildPrimaryTask task;
  final int stars;
  final VoidCallback onOpenCompanion;
  final List<ChildSecondaryAction> secondaryActions;
  final ChildDensity? density;

  ChildDensity get _density => density ?? childDensityForLevel(1);

  static const Map<ChildThemeKey, String> _glyphs = <ChildThemeKey, String>{
    ChildThemeKey.honey: '',
    ChildThemeKey.candy: '☁ ✨ 🍬',
    ChildThemeKey.forest: '🍃 ✨ 🍄',
    ChildThemeKey.space: '✦ 🚀 🪐',
  };

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    // 只取第一个符号：整串装饰在窄屏会被右边裁切。
    final glyph = (_glyphs[palette.themeKey] ?? '').split(' ').first;
    final extra = secondaryActions.take(_density.primaryActions - 1).toList();

    final titleSize = switch (_density.level) {
      0 => 26.0,
      2 => 22.0,
      _ => 24.0,
    };
    final buttonTextSize = switch (_density.level) {
      0 => 20.0,
      2 => 16.0,
      _ => 18.0,
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        // ── 问候：小犀 + 气泡 + 主题挂饰 ──
        Stack(
          clipBehavior: Clip.none,
          children: <Widget>[
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: <Widget>[
                ChildMascot(size: 64, bob: palette.isCartoon),
                const SizedBox(width: 10),
                Expanded(
                  child: ChildSticker(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 12),
                    radius: palette.radiusMd,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(
                          '嗨，$userName！',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                            color: palette.ink,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          _density.level == 0 ? '今天玩点什么呀？' : '今天想先玩什么呀？',
                          style: TextStyle(
                            fontSize: 13,
                            color: palette.ink2,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
            if (glyph.isNotEmpty)
              Positioned(
                right: 10,
                top: -16,
                child: Transform.rotate(
                  angle: -9 * math.pi / 180,
                  child: Text(
                    glyph,
                    style: TextStyle(
                      fontSize: 20,
                      color: palette.pop.withValues(alpha: 0.75),
                    ),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 16),

        // ── 进度 ──
        ChildProgressPanel(density: density, stars: stars),
        const SizedBox(height: 16),

        // ── 唯一主任务 ──
        Stack(
          clipBehavior: Clip.none,
          children: <Widget>[
            ChildSticker(
              strong: true,
              padding: const EdgeInsets.all(20),
              gradient: palette.isCartoon
                  ? LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: <Color>[
                        palette.card,
                        Color.alphaBlend(
                          palette.pop.withValues(alpha: 0.16),
                          palette.card,
                        ),
                      ],
                    )
                  : null,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Row(
                    children: <Widget>[
                      Expanded(
                        child: Text(
                          task.kicker,
                          style: TextStyle(
                            fontSize: 12,
                            letterSpacing: 1.2,
                            fontWeight: FontWeight.w700,
                            color: palette.ink2,
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: palette.isCartoon
                              ? palette.cta.withValues(alpha: 0.32)
                              : palette.soft,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          _density.level == 2 ? '今日主线 · Lv.3' : '今日主线',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            color: palette.ink,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Text(
                    task.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: titleSize,
                      height: 1.2,
                      fontWeight: FontWeight.w800,
                      color: palette.ink,
                    ),
                  ),
                  if (_density.showMeta) ...<Widget>[
                    const SizedBox(height: 6),
                    Text(
                      task.meta,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 13, color: palette.ink2),
                    ),
                  ],
                  const SizedBox(height: 16),
                  SizedBox(
                    height: _density.ctaHeight,
                    width: double.infinity,
                    child: ChildJelly(
                      onTap: task.onStart,
                      child: Container(
                        decoration: BoxDecoration(
                          color: palette.cta,
                          borderRadius: BorderRadius.circular(palette.radiusMd),
                          border: palette.isCartoon
                              ? Border.all(
                                  color: Color.lerp(
                                      palette.line, palette.ink, 0.22)!,
                                  width: palette.borderW,
                                )
                              : null,
                        ),
                        alignment: Alignment.center,
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: <Widget>[
                            Icon(Icons.play_arrow_rounded,
                                size: buttonTextSize + 4,
                                color: palette.ctaInk),
                            const SizedBox(width: 6),
                            Text(
                              task.buttonLabel,
                              style: TextStyle(
                                fontSize: buttonTextSize,
                                fontWeight: FontWeight.w800,
                                color: palette.ctaInk,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const Positioned(top: -4, right: 24, child: _TapeSticker()),
          ],
        ),

        // ── 次要动作（中/高龄档逐步解锁）──
        if (extra.isNotEmpty) ...<Widget>[
          const SizedBox(height: 10),
          Row(
            children: <Widget>[
              for (var i = 0; i < extra.length; i++) ...<Widget>[
                if (i > 0) const SizedBox(width: 8),
                Expanded(
                  child: ChildJelly(
                    onTap: extra[i].onSelect,
                    child: ChildSticker(
                      minHeight: 48,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 10),
                      radius: palette.radiusMd,
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: <Widget>[
                          Text(extra[i].emoji,
                              style: const TextStyle(fontSize: 16)),
                          const SizedBox(width: 6),
                          Flexible(
                            child: Text(
                              extra[i].label,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: palette.ink,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ],

        // ── 常驻 AI 入口 ──
        const SizedBox(height: 12),
        ChildJelly(
          onTap: onOpenCompanion,
          child: ChildSticker(
            padding: const EdgeInsets.all(12),
            radius: palette.radiusMd,
            child: Row(
              children: <Widget>[
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: palette.pop.withValues(alpha: 0.16),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(Icons.chat_bubble_rounded,
                      size: 22, color: palette.pop),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        '和小犀说说话',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: palette.ink,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '点一下就能聊天啦',
                        style: TextStyle(fontSize: 12, color: palette.ink2),
                      ),
                    ],
                  ),
                ),
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: palette.pop,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(Icons.chevron_right_rounded,
                      size: 22, color: palette.onPrimary),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

// ════════════════════════════════════════════════════════════════════
//  今天的小发现
// ════════════════════════════════════════════════════════════════════

class ChildDiscovery {
  const ChildDiscovery({
    required this.emoji,
    required this.title,
    required this.fact,
  });

  final String emoji;
  final String title;
  final String fact;
}

/// 内置兜底知识：即使后端全部为空，孩子端也始终有可探索的内容。
/// 与 Web 端 `DISCOVERIES` 同一份文案。
const List<ChildDiscovery> kChildDiscoveries = <ChildDiscovery>[
  ChildDiscovery(
    emoji: '☀️',
    title: '影子变短啦',
    fact: '中午太阳升得最高，影子就变得最短；傍晚太阳低低的，影子又被拉得好长好长。去量量自己的影子吧！',
  ),
  ChildDiscovery(
    emoji: '🌍',
    title: '认识日本',
    fact: '日本由很多小岛组成，有高高的富士山，春天开满粉色樱花，人们见面会弯腰问好。',
  ),
  ChildDiscovery(
    emoji: '🔢',
    title: '数字 7',
    fact: '7 藏在小瓢虫背上、彩虹的颜色里，还藏在一周的天数里。家里有哪些东西正好是 7 个？',
  ),
  ChildDiscovery(
    emoji: '💡',
    title: '蜗牛爱睡觉',
    fact: '天气太热太干时，蜗牛缩进壳里睡一个长长的觉，最长能睡好几年，等下过雨再出来散步。',
  ),
  ChildDiscovery(
    emoji: '😄',
    title: '笑一笑',
    fact: '为什么气球不喜欢读书呀？因为它一读书就「涨」得太大啦～ 笑一笑，今天又是棒棒的一天！',
  ),
];

class ChildDiscoverySection extends StatefulWidget {
  const ChildDiscoverySection({
    super.key,
    required this.onOpenCompanion,
    this.density,
  });

  final VoidCallback onOpenCompanion;
  final ChildDensity? density;

  ChildDensity get _density => density ?? childDensityForLevel(1);

  @override
  State<ChildDiscoverySection> createState() => _ChildDiscoverySectionState();
}

class _ChildDiscoverySectionState extends State<ChildDiscoverySection> {
  int _offset = 0;

  static const Map<int, String> _titles = <int, String>{
    0: '哇！小发现',
    1: '今天的小发现',
    2: '今日情报站',
  };

  static const Map<int, double> _widths = <int, double>{
    0: 176,
    1: 158,
    2: 148,
  };

  List<ChildDiscovery> get _visible {
    final count =
        widget._density.discoveryCards.clamp(1, kChildDiscoveries.length);
    return List<ChildDiscovery>.generate(
      count,
      (i) => kChildDiscoveries[(i + _offset) % kChildDiscoveries.length],
    );
  }

  void _showDetail(ChildDiscovery item) {
    final palette = ChildThemePalette.of(context);
    showDialog<void>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.45),
      builder: (dialogContext) => Dialog(
        backgroundColor: palette.card,
        insetPadding: const EdgeInsets.symmetric(horizontal: 24),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(palette.radiusLg),
          side: palette.isCartoon
              ? BorderSide(
                  color: Color.lerp(palette.line, palette.ink, 0.22)!,
                  width: palette.borderW,
                )
              : BorderSide.none,
        ),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: palette.pop.withValues(alpha: 0.16),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    alignment: Alignment.center,
                    child:
                        Text(item.emoji, style: const TextStyle(fontSize: 24)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(
                          item.title,
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            color: palette.ink,
                          ),
                        ),
                        Text(
                          '小犀的小发现',
                          style: TextStyle(fontSize: 12, color: palette.ink2),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.pop(dialogContext),
                    icon: Icon(Icons.close_rounded, color: palette.ink2),
                    tooltip: '关闭',
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                item.fact,
                style: TextStyle(fontSize: 14, height: 1.6, color: palette.ink),
              ),
              const SizedBox(height: 18),
              Row(
                children: <Widget>[
                  Expanded(
                    child: SizedBox(
                      height: 44,
                      child: ChildJelly(
                        onTap: () {
                          Navigator.pop(dialogContext);
                          widget.onOpenCompanion();
                        },
                        child: Container(
                          decoration: BoxDecoration(
                            color: palette.pop,
                            borderRadius:
                                BorderRadius.circular(palette.radiusMd),
                          ),
                          alignment: Alignment.center,
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: <Widget>[
                              Icon(Icons.chat_bubble_rounded,
                                  size: 16, color: palette.onPrimary),
                              const SizedBox(width: 6),
                              Text(
                                '让小犀讲给我听',
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  color: palette.onPrimary,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  SizedBox(
                    height: 44,
                    child: ChildJelly(
                      onTap: () => Navigator.pop(dialogContext),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        decoration: BoxDecoration(
                          color: palette.soft,
                          borderRadius: BorderRadius.circular(palette.radiusMd),
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          '知道啦',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: palette.ink,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    final items = _visible;
    final cardWidth = _widths[widget._density.level] ?? 158;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        ChildSectionTitle(
          title: _titles[widget._density.level] ?? '今天的小发现',
          icon: Icons.auto_awesome_rounded,
          trailing: ChildJelly(
            onTap: () => setState(
                () => _offset = (_offset + 1) % kChildDiscoveries.length),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: palette.soft,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                '换一批 ›',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: palette.ink2,
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 148,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            clipBehavior: Clip.none,
            padding: const EdgeInsets.only(bottom: 6, top: 2),
            itemCount: items.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (context, index) {
              final item = items[index];
              final tone = palette.subjects[index % palette.subjects.length];
              return SizedBox(
                width: cardWidth,
                child: ChildJelly(
                  onTap: () => _showDetail(item),
                  tiltDegrees:
                      palette.isCartoon ? (index.isEven ? -0.8 : 0.8) : 0,
                  child: ChildSticker(
                    padding: const EdgeInsets.all(14),
                    radius: palette.radiusMd,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: Color.alphaBlend(
                              tone.withValues(alpha: 0.22),
                              palette.card,
                            ),
                            borderRadius: BorderRadius.circular(14),
                            border: palette.isCartoon
                                ? Border.all(color: tone.withValues(alpha: 0.5))
                                : null,
                          ),
                          alignment: Alignment.center,
                          child: Text(item.emoji,
                              style: const TextStyle(fontSize: 22)),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          item.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                            color: palette.ink,
                          ),
                        ),
                        const Spacer(),
                        Text(
                          widget._density.showMeta
                              ? (item.fact.length > 16
                                  ? '${item.fact.substring(0, 16)}…'
                                  : item.fact)
                              : '点开看！',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            height: 1.4,
                            color: palette.ink2,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

// ════════════════════════════════════════════════════════════════════
//  大图标学科
// ════════════════════════════════════════════════════════════════════

enum ChildSubjectKey { language, math, science, art, social, music }

class ChildSubjectSpec {
  const ChildSubjectSpec({
    required this.key,
    required this.label,
    required this.icon,
  });

  final ChildSubjectKey key;
  final String label;
  final IconData icon;
}

const List<ChildSubjectSpec> kChildSubjects = <ChildSubjectSpec>[
  ChildSubjectSpec(
      key: ChildSubjectKey.language,
      label: '语言',
      icon: Icons.chat_bubble_rounded),
  ChildSubjectSpec(
      key: ChildSubjectKey.math, label: '数学', icon: Icons.calculate_rounded),
  ChildSubjectSpec(
      key: ChildSubjectKey.science, label: '科学', icon: Icons.science_rounded),
  ChildSubjectSpec(
      key: ChildSubjectKey.art, label: '艺术', icon: Icons.palette_rounded),
  ChildSubjectSpec(
      key: ChildSubjectKey.social, label: '社会', icon: Icons.groups_rounded),
  ChildSubjectSpec(
      key: ChildSubjectKey.music, label: '音乐', icon: Icons.music_note_rounded),
];

/// 低龄档只给 4 个学科，但「音乐」是独立业务入口，不能被裁掉，
/// 因此用「语言 / 数学 / 科学 / 音乐」而不是简单取前 4 个。
const Map<int, List<ChildSubjectKey>> _kSubjectOrder =
    <int, List<ChildSubjectKey>>{
  0: <ChildSubjectKey>[
    ChildSubjectKey.language,
    ChildSubjectKey.math,
    ChildSubjectKey.science,
    ChildSubjectKey.music,
  ],
  1: <ChildSubjectKey>[
    ChildSubjectKey.language,
    ChildSubjectKey.math,
    ChildSubjectKey.science,
    ChildSubjectKey.art,
    ChildSubjectKey.social,
    ChildSubjectKey.music,
  ],
  2: <ChildSubjectKey>[
    ChildSubjectKey.language,
    ChildSubjectKey.math,
    ChildSubjectKey.science,
    ChildSubjectKey.art,
    ChildSubjectKey.social,
    ChildSubjectKey.music,
  ],
};

const Map<int, String> _kSubjectTitles = <int, String>{
  0: '选一个大图标',
  1: '选个方向出发',
  2: '星图课程',
};

class ChildSubjectGrid extends StatelessWidget {
  const ChildSubjectGrid({
    super.key,
    required this.onPick,
    required this.onMusic,
    this.density,
  });

  /// 低龄档的「音乐」走 [onMusic]，不会传到这里。
  final void Function(ChildSubjectKey key) onPick;
  final VoidCallback onMusic;
  final ChildDensity? density;

  ChildDensity get _density => density ?? childDensityForLevel(1);

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    final order = _kSubjectOrder[_density.level] ?? _kSubjectOrder[1]!;
    final list = order
        .take(_density.subjects)
        .map((key) => kChildSubjects.firstWhere((s) => s.key == key))
        .toList();
    final columns = _density.subjectColumns;
    const gap = 10.0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        ChildSectionTitle(
          title: _kSubjectTitles[_density.level] ?? '选个方向出发',
          icon: Icons.menu_book_rounded,
          trailing: Text(
            '${list.length} 个',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: palette.ink2,
            ),
          ),
        ),
        const SizedBox(height: 12),
        LayoutBuilder(
          builder: (context, constraints) {
            final itemWidth =
                (constraints.maxWidth - gap * (columns - 1)) / columns;
            return Wrap(
              spacing: gap,
              runSpacing: gap,
              children: <Widget>[
                for (var i = 0; i < list.length; i++)
                  SizedBox(
                    width: itemWidth,
                    child: ChildJelly(
                      onTap: () => list[i].key == ChildSubjectKey.music
                          ? onMusic()
                          : onPick(list[i].key),
                      tiltDegrees:
                          palette.isCartoon ? (i.isEven ? -0.8 : 0.8) : 0,
                      child: ChildSticker(
                        minHeight: _density.subjectHeight,
                        padding: const EdgeInsets.symmetric(
                            vertical: 12, horizontal: 6),
                        radius: palette.radiusMd,
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: <Widget>[
                            Container(
                              width: _density.level == 0 ? 56 : 48,
                              height: _density.level == 0 ? 56 : 48,
                              decoration: BoxDecoration(
                                color: Color.alphaBlend(
                                  palette.subjects[i % palette.subjects.length]
                                      .withValues(alpha: 0.24),
                                  palette.card,
                                ),
                                borderRadius: BorderRadius.circular(14),
                                border: palette.isCartoon
                                    ? Border.all(
                                        color: palette.subjects[
                                                i % palette.subjects.length]
                                            .withValues(alpha: 0.55),
                                      )
                                    : null,
                              ),
                              alignment: Alignment.center,
                              child: Icon(
                                list[i].icon,
                                size: _density.level == 0 ? 30 : 26,
                                color: palette
                                    .subjects[i % palette.subjects.length],
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              list[i].label,
                              style: TextStyle(
                                fontSize: _density.level == 0 ? 15 : 14,
                                fontWeight: FontWeight.w800,
                                color: palette.ink,
                              ),
                            ),
                            if (_density.showMeta) ...<Widget>[
                              const SizedBox(height: 2),
                              Text(
                                '点开看看 →',
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600,
                                  color: palette.ink2,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}

// ════════════════════════════════════════════════════════════════════
//  今天要做的事
// ════════════════════════════════════════════════════════════════════

class ChildTodayTask {
  const ChildTodayTask({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.onOpen,
  });

  final String id;
  final String title;
  final String subtitle;
  final VoidCallback onOpen;
}

class ChildTodayTaskList extends StatefulWidget {
  const ChildTodayTaskList({
    super.key,
    required this.tasks,
    this.density,
  });

  final List<ChildTodayTask> tasks;
  final ChildDensity? density;

  ChildDensity get _density => density ?? childDensityForLevel(1);

  @override
  State<ChildTodayTaskList> createState() => _ChildTodayTaskListState();
}

class _ChildTodayTaskListState extends State<ChildTodayTaskList> {
  bool _showAll = false;

  @override
  Widget build(BuildContext context) {
    if (widget.tasks.isEmpty) return const SizedBox.shrink();
    final palette = ChildThemePalette.of(context);
    final collapsed = widget.tasks.take(widget._density.todayTasks).toList();
    final visible = _showAll ? widget.tasks : collapsed;
    final canExpand = widget.tasks.length > widget._density.todayTasks;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        ChildSectionTitle(
          title: '今天要做的事',
          icon: Icons.fact_check_rounded,
          trailing: canExpand
              ? ChildJelly(
                  onTap: () => setState(() => _showAll = !_showAll),
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: palette.soft,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      _showAll ? '收起' : '查看全部 (${widget.tasks.length})',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: palette.ink2,
                      ),
                    ),
                  ),
                )
              : null,
        ),
        const SizedBox(height: 12),
        for (final task in visible)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: ChildJelly(
              onTap: task.onOpen,
              child: ChildSticker(
                padding: const EdgeInsets.all(14),
                radius: palette.radiusMd,
                child: Row(
                  children: <Widget>[
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: palette.pop.withValues(alpha: 0.14),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(Icons.assignment_rounded,
                          size: 22, color: palette.pop),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(
                            task.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: palette.ink,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            task.subtitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 11, color: palette.ink2),
                          ),
                        ],
                      ),
                    ),
                    Icon(Icons.play_arrow_rounded,
                        size: 22, color: palette.pop),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}

// ════════════════════════════════════════════════════════════════════
//  更多好玩（紧凑图标网格，替代原来的大渐变横条）
// ════════════════════════════════════════════════════════════════════

class ChildMoreEntry {
  const ChildMoreEntry({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  /// 用 Material 图标而不是 emoji：emoji 依赖系统字体，
  /// 部分安卓/模拟器缺字形会渲染成方框（知识问答的 🧠 就是这样）。
  final IconData icon;
  final String label;
  final VoidCallback onTap;
}

class ChildMoreGrid extends StatelessWidget {
  const ChildMoreGrid({
    super.key,
    required this.entries,
    this.title = '更多好玩',
  });

  final List<ChildMoreEntry> entries;
  final String title;

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    if (entries.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        ChildSectionTitle(title: title, icon: Icons.widgets_rounded),
        const SizedBox(height: 12),
        LayoutBuilder(
          builder: (context, constraints) {
            const columns = 4;
            const gap = 8.0;
            final itemWidth =
                (constraints.maxWidth - gap * (columns - 1)) / columns;
            return Wrap(
              spacing: gap,
              runSpacing: 12,
              children: <Widget>[
                for (var i = 0; i < entries.length; i++)
                  SizedBox(
                    width: itemWidth,
                    child: ChildJelly(
                      onTap: entries[i].onTap,
                      child: Column(
                        children: <Widget>[
                          Container(
                            width: 52,
                            height: 52,
                            decoration: BoxDecoration(
                              color: Color.alphaBlend(
                                palette.subjects[i % palette.subjects.length]
                                    .withValues(alpha: 0.2),
                                palette.card,
                              ),
                              borderRadius: BorderRadius.circular(16),
                              border: palette.isCartoon
                                  ? Border.all(
                                      color: palette
                                          .subjects[i % palette.subjects.length]
                                          .withValues(alpha: 0.45),
                                    )
                                  : null,
                            ),
                            alignment: Alignment.center,
                            child: Icon(
                              entries[i].icon,
                              size: 26,
                              color:
                                  palette.subjects[i % palette.subjects.length],
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            entries[i].label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: palette.ink,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}
