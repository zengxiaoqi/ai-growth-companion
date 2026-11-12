import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// 启动屏 ——「星空启程」。
///
/// 设计思路：
/// 1. **首帧无缝**：底色 [BrandSplashColors.deep] 与 Android 原生启动屏
///    （`res/values/colors.xml#splash_bg_deep`）完全一致，引擎接管后背景
///    再由纯色「绽放」成极光渐变，视觉上是一段连续动画而不是两次闪屏。
/// 2. **一镜到底**：图标浮入 → 光晕晕开 → 标题逐字浮现 → 副标题 → 进度条，
///    全部挂在一条 intro 时间轴上；另有 ambient 循环负责呼吸、星闪与流星。
/// 3. **零依赖**：星野/光斑/流光全部用 [CustomPainter] 绘制，Web 端同样可用。
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  /// 启动图资源路径（图标同时被原生启动屏使用）。
  static const assetPath = 'assets/images/app_icon.png';

  /// 预热启动图，需在 `runApp` 之前 await。
  ///
  /// 图片解码是异步的，若不预热，Flutter 启动屏的头几帧只有背景没有图标，
  /// 会与原生启动屏「对不上」。预热后首帧即有图标，两段启动画面无缝衔接。
  static Future<void> precacheLogo() {
    final completer = Completer<void>();
    const provider = AssetImage(assetPath);
    final stream = provider.resolve(ImageConfiguration.empty);
    late final ImageStreamListener listener;
    void finish() {
      if (!completer.isCompleted) completer.complete();
      stream.removeListener(listener);
    }

    listener = ImageStreamListener(
      (_, __) => finish(),
      onError: (_, __) => finish(),
    );
    stream.addListener(listener);
    return completer.future;
  }

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

/// 品牌启动配色（与原生启动屏、App 图标同源）。
abstract class BrandSplashColors {
  /// 原生启动屏底色，也是本页第一帧底色。
  static const deep = Color(0xFF241243);
  static const gradientTop = Color(0xFF2A1650);
  static const gradientMid = Color(0xFF3D1F78);
  static const gradientLow = Color(0xFF6B3FBE);
  static const gradientBottom = Color(0xFF9B57CE);
  static const pink = Color(0xFFFF8FBE);
  static const periwinkle = Color(0xFF8E7BFF);
  static const mint = Color(0xFF7FE7DA);
}

class _SplashScreenState extends State<SplashScreen>
    with TickerProviderStateMixin {
  /// 入场时间轴（一次性）
  late final AnimationController _intro;

  /// 环境循环（呼吸 / 星闪 / 流星 / 光点漂浮）
  late final AnimationController _ambient;

  late final List<_Star> _stars;

  @override
  void initState() {
    super.initState();

    // 星野用固定种子生成：每次启动布局一致，不会「随机乱跳」
    final rnd = math.Random(20261112);
    _stars = List<_Star>.generate(72, (i) {
      final big = i % 18 == 0;
      return _Star(
        x: rnd.nextDouble(),
        y: rnd.nextDouble() * 0.94,
        r: big
            ? 0.0032 + rnd.nextDouble() * 0.0016
            : 0.0007 + rnd.nextDouble() * 0.0011,
        phase: rnd.nextDouble() * math.pi * 2,
        speed: 0.22 + rnd.nextDouble() * 0.55,
        alpha: big ? 0.9 : 0.35 + rnd.nextDouble() * 0.5,
        big: big,
      );
    });

    _intro = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..forward();

    _ambient = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 9),
    )..repeat();
  }

  @override
  void dispose() {
    _intro.dispose();
    _ambient.dispose();
    super.dispose();
  }

  /// 某个时间区间的缓动值（0~1）
  double _phase(double begin, double end, Curve curve) =>
      curve.transform(Interval(begin, end).transform(_intro.value));

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    // 与 Android 12+ 系统启动屏的图标尺寸对齐：SplashScreen API 把图标画在
    // 240dp 容器里、实际约 160dp（实测截图占屏宽 43%）。之前取 0.355 屏宽
    // 在 360dp 机型上只有 128dp，切换瞬间会有「图标缩一圈」的跳变。
    final logoSize =
        (math.min(size.width * 0.44, size.height * 0.24)).clamp(118.0, 160.0);

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        statusBarBrightness: Brightness.dark,
        systemNavigationBarColor: BrandSplashColors.deep,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
      child: Scaffold(
        backgroundColor: BrandSplashColors.deep,
        body: Stack(
          fit: StackFit.expand,
          children: [
            // ── 背景：拆成「静态底图」与「逐帧星野」两层 ──
            //
            // 底色/渐变/光斑/暗角都是大面积的 gradient 填充，若和星野挤在
            // 同一个 painter 里，就得每帧重画好几次全屏。分开后静态层只在
            // bloom 变化的那 300ms 重绘，之后由 RepaintBoundary 直接复用，
            // 每帧只剩几十个星点 —— 中低端机也不会掉帧。
            RepaintBoundary(
              child: AnimatedBuilder(
                animation: _intro,
                builder: (context, _) {
                  // reveal = 0 时整页就是原生启动屏那层纯色 #241243，
                  // 系统 splash 切到 Flutter 是**同一帧、同一像素**，看不
                  // 出接缝；随后 540ms 内渐变从图标位置向外「漫」开。
                  // 这样「一开始就在动」，而不是先愣一块纯色。
                  return CustomPaint(
                    painter: _BackdropPainter(
                      reveal: _phase(0.0, 0.38, Curves.easeOutCubic),
                    ),
                  );
                },
              ),
            ),
            RepaintBoundary(
              child: AnimatedBuilder(
                animation: Listenable.merge([_intro, _ambient]),
                builder: (context, _) {
                  final t = _ambient.value;
                  // 流星：每 9s 循环里飞一次
                  final raw = (t - 0.5) / 0.14;
                  return CustomPaint(
                    painter: _StarsPainter(
                      t: t,
                      stars: _stars,
                      meteor: raw >= 0 && raw <= 1 ? raw : -1,
                      // 首帧不能有星星：原生启动屏那屏是干净的纯色 + 图标，
                      // 一上来就满天星会立刻暴露「这是另一个界面」。
                      fade: _phase(0.06, 0.32, Curves.easeOut),
                    ),
                  );
                },
              ),
            ),

            // ── 主体 ──
            SafeArea(
              minimum: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                children: [
                  const Spacer(flex: 56),
                  _LogoBlock(size: logoSize, intro: _intro, ambient: _ambient),
                  const SizedBox(height: 34),
                  _Wordmark(intro: _intro),
                  const SizedBox(height: 16),
                  _Tagline(intro: _intro),
                  const Spacer(flex: 34),
                  _LoadingBlock(intro: _intro, ambient: _ambient),
                  const SizedBox(height: 34),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// 图标
// ─────────────────────────────────────────────────────────────

class _LogoBlock extends StatelessWidget {
  const _LogoBlock({
    required this.size,
    required this.intro,
    required this.ambient,
  });

  final double size;
  final Animation<double> intro;
  final Animation<double> ambient;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.center,
        children: [
          // 光晕 + 环绕星屑
          OverflowBox(
            maxWidth: size * 2.9,
            maxHeight: size * 2.9,
            child: AnimatedBuilder(
              animation: Listenable.merge([intro, ambient]),
              builder: (context, _) => CustomPaint(
                size: Size.square(size * 2.9),
                painter: _HaloOrbitPainter(
                  halo: Curves.easeOutCubic
                      .transform(Interval(0.02, 0.34).transform(intro.value)),
                  intro: intro.value,
                  t: ambient.value,
                  iconSize: size,
                ),
              ),
            ),
          ),
          // 图标本体
          Semantics(
            label: '灵犀伴学',
            image: true,
            child: AnimatedBuilder(
              animation: Listenable.merge([intro, ambient]),
              builder: (context, child) {
                // 图标本身**不做缩放/淡入**：首帧必须和原生启动屏的图标
                // 同位置、同大小、同透明度，否则会「消失再出现」地闪一下。
                // 只有投影随入场浮上来 —— 系统那屏的图标没有影子，首帧就
                // 带投影会让它看起来「忽然变重」。
                final breath = math.sin(ambient.value * math.pi * 2);
                final lift = Curves.easeOut.transform(
                  Interval(0.0, 0.35).transform(intro.value),
                );
                return Transform.translate(
                  offset: Offset(0, 3.5 * breath),
                  child: Transform.scale(
                    scale: 1 + 0.012 * breath,
                    child: Container(
                      width: size,
                      height: size,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(size * 0.23),
                        boxShadow: [
                          BoxShadow(
                            color: const Color(0xFF2A0B4F)
                                .withValues(alpha: 0.30 * lift),
                            blurRadius: size * (0.08 + 0.14 * lift),
                            offset: Offset(0, size * 0.10 * lift),
                          ),
                        ],
                      ),
                      child: child,
                    ),
                  ),
                );
              },
              child: Stack(
                children: [
                  Image.asset(
                    SplashScreen.assetPath,
                    width: size,
                    height: size,
                    filterQuality: FilterQuality.medium,
                    excludeFromSemantics: true,
                    gaplessPlayback: true,
                  ),
                  // 一道缓慢扫过的高光，让图标「有玻璃质感」
                  ClipRRect(
                    borderRadius: BorderRadius.circular(size * 0.23),
                    child: AnimatedBuilder(
                      animation: ambient,
                      builder: (context, _) {
                        final p = (ambient.value * 1.6) % 1.0;
                        return Transform.translate(
                          offset: Offset(size * (p * 2.6 - 1.3), 0),
                          child: Transform.rotate(
                            angle: -0.35,
                            child: Container(
                              width: size * 0.28,
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  colors: [
                                    Colors.white.withValues(alpha: 0),
                                    Colors.white.withValues(alpha: 0.16),
                                    Colors.white.withValues(alpha: 0),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// 文字
// ─────────────────────────────────────────────────────────────

class _Wordmark extends StatelessWidget {
  const _Wordmark({required this.intro});

  final Animation<double> intro;

  static const _chars = ['灵', '犀', '伴', '学'];

  static const _style = TextStyle(
    fontSize: 31,
    height: 1.18,
    fontWeight: FontWeight.w700,
    letterSpacing: 1,
    color: Colors.white,
    shadows: [
      Shadow(color: Color(0x66FF8FBE), blurRadius: 26),
      Shadow(color: Color(0x33000000), blurRadius: 12, offset: Offset(0, 3)),
    ],
  );

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < _chars.length; i++)
          AnimatedBuilder(
            animation: intro,
            builder: (context, child) {
              final start = 0.30 + i * 0.065;
              final v = Curves.easeOutCubic
                  .transform(Interval(start, start + 0.28).transform(intro.value));
              return Opacity(
                opacity: v,
                child: Transform.translate(
                  offset: Offset(0, 16 * (1 - v)),
                  child: child,
                ),
              );
            },
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2),
              child: Text(_chars[i], style: _style),
            ),
          ),
      ],
    );
  }
}

class _Tagline extends StatelessWidget {
  const _Tagline({required this.intro});

  final Animation<double> intro;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: intro,
      builder: (context, child) {
        final v = Curves.easeOutCubic
            .transform(Interval(0.62, 0.94).transform(intro.value));
        return Opacity(
          opacity: v * 0.78,
          child: Transform.translate(offset: Offset(0, 10 * (1 - v)), child: child),
        );
      },
      child: const Text(
        'AI 陪伴 · 共同成长',
        style: TextStyle(
          fontSize: 12.5,
          height: 1.4,
          fontWeight: FontWeight.w500,
          letterSpacing: 3.2,
          color: Colors.white,
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// 底部加载指示
// ─────────────────────────────────────────────────────────────

class _LoadingBlock extends StatelessWidget {
  const _LoadingBlock({required this.intro, required this.ambient});

  final Animation<double> intro;
  final Animation<double> ambient;

  @override
  Widget build(BuildContext context) {
    // 整块淡入：首帧与原生启动屏一致（只有底色 + 图标），随后再浮现进度
    return AnimatedBuilder(
      animation: intro,
      builder: (context, child) {
        final v = Curves.easeOutCubic
            .transform(Interval(0.28, 0.62).transform(intro.value));
        return Opacity(opacity: v, child: child);
      },
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AnimatedBuilder(
            animation: intro,
            builder: (context, child) {
              final v = Curves.easeOutCubic
                  .transform(Interval(0.5, 0.9).transform(intro.value));
              return Opacity(opacity: v * 0.62, child: child);
            },
            child: const Text(
              '正在唤醒小灵犀',
              style: TextStyle(
                fontSize: 11.5,
                height: 1.4,
                fontWeight: FontWeight.w500,
                letterSpacing: 2.4,
                color: Colors.white,
              ),
            ),
          ),
          const SizedBox(height: 14),
          AnimatedBuilder(
            animation: Listenable.merge([intro, ambient]),
            builder: (context, _) {
              final grow = Curves.easeInOutCubic
                  .transform(Interval(0.05, 1.0).transform(intro.value));
              // 整个入场期间持续前进，切页前不会「走到 90% 就卡住」
              final fill = 0.12 + 0.80 * grow;
              final pulse = 0.75 + 0.25 * math.sin(ambient.value * math.pi * 4);
              return SizedBox(
                width: 118,
                height: 3,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    DecoratedBox(
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.14),
                        borderRadius: BorderRadius.circular(2),
                      ),
                      child: const SizedBox.expand(),
                    ),
                    // 已加载部分：一条渐亮的光带，让「在加载」这件事看得见
                    Align(
                      alignment: Alignment.centerLeft,
                      child: FractionallySizedBox(
                        widthFactor: fill.clamp(0.0, 1.0),
                        child: Container(
                          height: 3,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(2),
                            gradient: LinearGradient(
                              colors: [
                                BrandSplashColors.pink.withValues(alpha: 0.5),
                                Colors.white.withValues(alpha: 0.9),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                    Align(
                      alignment: Alignment(2 * fill - 1, 0),
                      child: Container(
                        width: 7,
                        height: 7,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: Colors.white.withValues(alpha: pulse),
                          boxShadow: [
                            BoxShadow(
                              color: BrandSplashColors.pink
                                  .withValues(alpha: 0.85 * pulse),
                              blurRadius: 10,
                              spreadRadius: 1.5,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// 绘制
// ─────────────────────────────────────────────────────────────

class _Star {
  const _Star({
    required this.x,
    required this.y,
    required this.r,
    required this.phase,
    required this.speed,
    required this.alpha,
    required this.big,
  });

  final double x;
  final double y;
  final double r;
  final double phase;
  final double speed;
  final double alpha;
  final bool big;
}

/// 静态背景层：底色 + 品牌渐变 + 极光光斑 + 暗角。
///
/// [reveal] 从 0 走到 1：
/// - `0`   → 整页就是原生启动屏那层纯色 `#241243`，系统 splash 切过来
///           是同一像素，看不出接缝；
/// - `0~1` → 渐变像光一样从图标位置向外漫开，远场仍压回纯色；
/// - `1`   → 完整极光底，遮罩撤掉，之后 [shouldRepaint] 恒为 false，
///           整层被外层 RepaintBoundary 复用，不参与逐帧绘制。
///
/// 真实设备上「纯色停留很久」的观感，一半来自原生 splash 等待，一半来自
/// 首帧是一块死色。把首帧做成纯色（对齐原生）再让它立刻漫开，两件事一起
/// 解决：既无接缝，又不会有「卡住」的错觉。
class _BackdropPainter extends CustomPainter {
  _BackdropPainter({required this.reveal});

  final double reveal;

  /// 图标在屏幕上的纵向中心，与主体布局对齐；渐变从这里扩散。
  static const double _originY = 0.47;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;

    // 1. 底色（与原生启动屏同一色值，首帧必须一模一样）
    canvas.drawRect(rect, Paint()..color = BrandSplashColors.deep);

    final r = reveal.clamp(0.0, 1.0);
    if (r <= 0.001) return;

    // 2. 品牌渐变
    canvas.drawRect(
      rect,
      Paint()
        ..shader = ui.Gradient.linear(
          Offset(size.width * 0.08, 0),
          Offset(size.width * 0.92, size.height),
          const [
            BrandSplashColors.gradientTop,
            BrandSplashColors.gradientMid,
            BrandSplashColors.gradientLow,
            BrandSplashColors.gradientBottom,
          ],
          const [0.0, 0.40, 0.72, 1.0],
        ),
    );

    // 3. 极光光斑（固定在静态层；大面积 radial 每帧重画非常贵）
    final glow = Curves.easeOut.transform(r);
    _glow(
      canvas,
      Offset(size.width * 0.80, size.height * 0.90),
      size.width * 0.92,
      BrandSplashColors.pink,
      0.34 * glow,
    );
    _glow(
      canvas,
      Offset(size.width * 0.10, size.height * 0.04),
      size.width * 0.78,
      BrandSplashColors.periwinkle,
      0.30 * glow,
    );
    _glow(
      canvas,
      Offset(size.width * 0.92, size.height * 0.24),
      size.width * 0.5,
      BrandSplashColors.mint,
      0.12 * glow,
    );

    // 4. 径向扩散：远场遮回纯色，让渐变看起来是「从图标处亮起来」的。
    //
    //    遮罩铺满整屏、靠渐变断点推进 —— 而不是画一个越来越大的圆。
    //    圆画法在半径处会从 1.0 的 alpha 突然断到 0，边界是一道硬边；
    //    用 drawRect + 断点推进，边界永远是柔和的「亮到暗」过渡。
    if (r < 0.999) {
      final origin = Offset(size.width * 0.5, size.height * _originY);
      // 保证 r=1 时断点已在屏幕对角之外，全屏无遮罩
      final maxRadius = math.sqrt(
            size.width * size.width + size.height * size.height,
          ) *
          0.62;
      canvas.drawRect(
        rect,
        Paint()
          ..shader = ui.Gradient.radial(
            origin,
            maxRadius,
            [BrandSplashColors.deep.withValues(alpha: 0), BrandSplashColors.deep],
            [(r * 0.88).clamp(0.0, 0.999), r.clamp(0.001, 1.0)],
          ),
      );
    }

    // 5. 暗角：让中心更聚焦
    canvas.drawRect(
      rect,
      Paint()
        ..shader = ui.Gradient.radial(
          Offset(size.width * 0.5, size.height * _originY),
          size.width * 1.15,
          const [Color(0x00000000), Color(0x59000000)],
          const [0.42, 1.0],
        ),
    );
  }

  void _glow(
    Canvas canvas,
    Offset center,
    double radius,
    Color color,
    double opacity,
  ) {
    if (opacity <= 0.002) return;
    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..shader = ui.Gradient.radial(center, radius, [
          color.withValues(alpha: opacity),
          color.withValues(alpha: 0),
        ]),
    );
  }

  @override
  bool shouldRepaint(_BackdropPainter old) => old.reveal != reveal;
}

/// 逐帧层：星野闪烁 + 流星。只有几十个点/线段，成本很低。
class _StarsPainter extends CustomPainter {
  _StarsPainter({
    required this.t,
    required this.stars,
    required this.meteor,
    required this.fade,
  });

  final double t;
  final List<_Star> stars;

  /// < 0 表示当前没有流星；0~1 为流星飞行进度
  final double meteor;

  /// 整体淡入系数：首帧必须是 0，逐帧层一上来就抢戏会破坏无缝。
  final double fade;

  @override
  void paint(Canvas canvas, Size size) {
    if (fade <= 0.002) return;
    for (final s in stars) {
      final twinkle = 0.45 +
          0.55 * (0.5 + 0.5 * math.sin(t * math.pi * 2 * s.speed + s.phase));
      final alpha = (s.alpha * twinkle * fade).clamp(0.0, 1.0);
      final center = Offset(s.x * size.width, s.y * size.height);
      final radius = s.r * size.width;
      if (s.big) {
        _sparkle(
          canvas,
          center,
          radius * 2.6,
          Colors.white.withValues(alpha: alpha),
          glow: true,
        );
      } else {
        canvas.drawCircle(
          center,
          radius * 1.25,
          Paint()..color = Colors.white.withValues(alpha: alpha),
        );
      }
    }

    if (meteor >= 0 && meteor <= 1) {
      final start = Offset(size.width * 0.98, size.height * 0.06);
      final end = Offset(size.width * 0.32, size.height * 0.30);
      final head = Offset.lerp(start, end, meteor)!;
      final tail = Offset.lerp(start, end, math.max(0.0, meteor - 0.22))!;
      final opacity =
          (math.sin(meteor * math.pi) * 0.9 * fade).clamp(0.0, 1.0);
      if (opacity > 0.01) {
        canvas.drawLine(
          tail,
          head,
          Paint()
            ..strokeWidth = 1.6
            ..strokeCap = StrokeCap.round
            ..shader = ui.Gradient.linear(
              tail,
              head,
              [
                Colors.white.withValues(alpha: 0),
                Colors.white.withValues(alpha: opacity),
              ],
            ),
        );
        canvas.drawCircle(
          head,
          1.8,
          Paint()
            ..color = Colors.white.withValues(alpha: opacity)
            ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3),
        );
      }
    }
  }

  @override
  bool shouldRepaint(_StarsPainter old) =>
      old.t != t || old.meteor != meteor || old.fade != fade;
}

class _HaloOrbitPainter extends CustomPainter {
  _HaloOrbitPainter({
    required this.halo,
    required this.intro,
    required this.t,
    required this.iconSize,
  });

  final double halo;
  final double intro;
  final double t;
  final double iconSize;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);

    // 入场时从图标向外扩散的两圈微光涟漪
    for (var i = 0; i < 2; i++) {
      final raw = (intro - 0.28 - i * 0.09) / 0.58;
      if (raw <= 0 || raw >= 1) continue;
      final p = 1 - math.pow(1 - raw, 3).toDouble();
      final radius = iconSize * (0.62 + 1.05 * p);
      final alpha = (1 - p) * (1 - p) * 0.22;
      if (alpha < 0.004) continue;
      // 不用 MaskFilter.blur（大面积模糊在中低端 GPU 上很贵）：
      // 用「宽而淡 + 窄而亮」两层描边模拟柔光边缘，视觉等价、成本低得多。
      canvas.drawCircle(
        center,
        radius,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 6
          ..color = Colors.white.withValues(alpha: alpha * 0.32),
      );
      canvas.drawCircle(
        center,
        radius,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.6
          ..color = Colors.white.withValues(alpha: alpha),
      );
    }

    // 图标外圈光晕
    if (halo > 0.002) {
      final radius = iconSize * (0.64 + 0.42 * halo);
      canvas.drawCircle(
        center,
        radius,
        Paint()
          ..shader = ui.Gradient.radial(center, radius, [
            Colors.white.withValues(alpha: 0.22 * halo),
            BrandSplashColors.pink.withValues(alpha: 0.12 * halo),
            Colors.white.withValues(alpha: 0),
          ], const [0.0, 0.55, 1.0]),
      );
    }

    // 环绕星屑
    if (halo > 0.05) {
      const count = 3;
      for (var i = 0; i < count; i++) {
        final angle = t * math.pi * 2 * 0.35 + i * (math.pi * 2 / count);
        final orbit = iconSize * (0.86 + 0.05 * math.sin(t * math.pi * 4 + i));
        final pos = center +
            Offset(math.cos(angle) * orbit, math.sin(angle) * orbit * 0.94);
        final flicker = 0.45 + 0.55 * (0.5 + 0.5 * math.sin(t * math.pi * 6 + i * 2));
        _sparkle(
          canvas,
          pos,
          iconSize * (0.045 + 0.012 * flicker),
          Colors.white.withValues(alpha: halo * flicker * 0.85),
          glow: true,
        );
      }
    }
  }

  @override
  bool shouldRepaint(_HaloOrbitPainter old) =>
      old.t != t ||
      old.halo != halo ||
      old.intro != intro ||
      old.iconSize != iconSize;
}

/// 四角星（十字光芒）路径
void _sparkle(Canvas canvas, Offset center, double radius, Color color,
    {bool glow = false}) {
  final path = Path()
    ..moveTo(center.dx, center.dy - radius)
    ..quadraticBezierTo(center.dx + radius * 0.14, center.dy - radius * 0.14,
        center.dx + radius, center.dy)
    ..quadraticBezierTo(center.dx + radius * 0.14, center.dy + radius * 0.14,
        center.dx, center.dy + radius)
    ..quadraticBezierTo(center.dx - radius * 0.14, center.dy + radius * 0.14,
        center.dx - radius, center.dy)
    ..quadraticBezierTo(center.dx - radius * 0.14, center.dy - radius * 0.14,
        center.dx, center.dy - radius)
    ..close();

  if (glow) {
    canvas.drawCircle(
      center,
      radius * 0.9,
      Paint()
        ..color = color.withValues(alpha: color.a * 0.5)
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, radius * 0.9),
    );
  }
  canvas.drawPath(path, Paint()..color = color);
}
