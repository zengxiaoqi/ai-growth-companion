import 'package:flutter/material.dart';

import 'child_theme.dart';

/// 全局活动色板：所有 `AppTheme.xxx` 动态取色的来源。
///
/// - 默认 [ChildThemePalette.honey]，未接入换肤同步前行为与旧 static const 一致。
/// - 孩子端由 `_HomeScreen` 在 build 时同步为当前皮肤；
///   家长端 / 登录前同步回 honey，保证家长端恒为蜜黄不串色。
/// - 业务代码仍写 `AppTheme.primaryColor`，无需关心当前端与皮肤。
class AppTheme {
  // ── 蜜黄基准值（const） ──
  // 供 [AppTheme.lightTheme]、[ChildThemePalette.honey] 的 const 构造与
  // const 构造参数默认值使用；动态取色走下方同名 getter 代理 [active]。
  static const Color honeyPrimary = Color(0xFF705900); // 深蜜黄（主操作色，白字对比达标）
  static const Color honeySecondary = Color(0xFF006384); // 深天蓝
  static const Color honeyAccent = Color(0xFF586000); // 橄榄绿
  static const Color honeyBackground = Color(0xFFFFF7D5); // 奶油黄
  static const Color honeyText = Color(0xFF352F00); // 深橄榄灰
  static const Color honeyTextSecondary = Color(0xFF655C25); // 中橄榄灰

  // 语义化颜色 - 用于状态反馈（不随皮肤变化，保持全局一致）
  static const Color warningColor = Color(0xFFB02500); // 深珊瑚红（错误/警示）
  static const Color successColor = Color(0xFF4CAF50); // 成功绿
  static const Color errorColor = Color(0xFFB02500); // 错误红
  static const Color infoColor = Color(0xFF006384); // 信息蓝
  static const Color disabledColor = Color(0xFFBDBDBD); // 禁用灰

  // 柔和辅助色蜜黄基准（低饱和，融入蜜黄主题）
  static const Color honeySoftPink = Color(0xFFF2C1C8); // 柔粉
  static const Color honeySoftPurple = Color(0xFFC9C0DE); // 柔紫
  static const Color honeySoftYellow = Color(0xFFFBE6A2); // 柔蜜黄
  static const Color honeySoftBlue = Color(0xFFBDD7EA); // 柔天蓝
  static const Color honeySoftOrange = Color(0xFFF5D5B8); // 柔橙
  static const Color honeySoftMint = Color(0xFFC5DED3); // 柔薄荷

  // 蜜黄基准学科分类色（低饱和，仅用于区分，不做大面积铺色）
  static const List<Color> honeyChildColors = [
    Color(0xFFC26B5A), // 陶土红（语言）
    Color(0xFF4A8F86), // 青碧（数学）
    Color(0xFF6F9E7F), // 苔绿（科学）
    Color(0xFFC98A5A), // 琥珀（艺术）
    Color(0xFF9A8FB8), // 柔堇（社会）
    Color(0xFFD9B13B), // 蜜黄（通用）
  ];

  // ── 全局活动色板 ──
  static ChildThemePalette active = ChildThemePalette.honey;

  static bool get _isHoney => identical(active, ChildThemePalette.honey);

  static Color _mix(Color a, Color b, double t) => Color.lerp(a, b, t)!;

  // ── 动态取色（原 static const 的同名代理） ──
  // 品牌色彩
  static Color get primaryColor => active.pop;
  static Color get secondaryColor => active.popSecondary;
  static Color get accentColor =>
      _isHoney ? honeyAccent : _mix(active.subjects[2], Colors.black, 0.25);
  static Color get backgroundColor => active.paper;
  static Color get textColor => active.ink;
  static Color get textSecondary => active.ink2;

  // 柔和辅助色：honey 保持原值零回归；其他皮肤从卡片底色向学科色轻柔混合。
  // 派生逻辑收敛在 [ChildThemePalette]，这里只做代理，避免两套口径漂移。
  static Color get softPink => active.softPink;
  static Color get softBlue => active.softBlue;
  static Color get softMint => active.softMint;
  static Color get softOrange => active.softOrange;
  static Color get softPurple => active.softPurple;
  static Color get softYellow => active.soft;

  // 儿童分类色
  static List<Color> get childColors => active.subjects;

  // 渐变 - 同色系微渐变
  static LinearGradient get primaryGradient => _isHoney
      ? honeyPrimaryGradient
      : LinearGradient(
          colors: [
            active.pop,
            _mix(active.pop, Colors.white, 0.35),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        );

  static LinearGradient get secondaryGradient => _isHoney
      ? honeySecondaryGradient
      : LinearGradient(
          colors: [
            active.subjects[1],
            _mix(active.subjects[1], Colors.white, 0.35),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        );

  static LinearGradient get rainbowGradient => _isHoney
      ? honeyRainbowGradient
      : LinearGradient(
          colors: [active.cta, active.pop],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        );

  // 蜜黄渐变基准（供 getter 的 honey 分支与 const 场景使用）
  static const LinearGradient honeyPrimaryGradient = LinearGradient(
    colors: [Color(0xFFFDD34D), Color(0xFFFFE587)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const LinearGradient honeySecondaryGradient = LinearGradient(
    colors: [Color(0xFF97DAFF), Color(0xFFC3E8FF)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const LinearGradient honeyRainbowGradient = LinearGradient(
    colors: [Color(0xFFFDD34D), Color(0xFFF5C243)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  // 节日主题渐变（不随皮肤变化）
  static const LinearGradient festivalGradient = LinearGradient(
    colors: [Color(0xFFE8895B), Color(0xFFDE7E50)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  // 成功状态渐变（不随皮肤变化）
  static const LinearGradient successGradient = LinearGradient(
    colors: [Color(0xFF4CAF50), Color(0xFF6FBF73)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  // 温暖渐变（用于奖励/成就，不随皮肤变化）
  static const LinearGradient warmGradient = LinearGradient(
    colors: [Color(0xFFF2B85C), Color(0xFFE8A33D)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  // ── 圆角配置（随皮肤变化：candy 更大圆角、space 收紧） ──
  static double get cardRadius => active.radiusLg;
  static double get buttonRadius => active.radiusMd;
  static double get smallRadius => active.radiusSm;

  // 蜜黄圆角基准
  static const double honeyCardRadius = 20.0;
  static const double honeyButtonRadius = 14.0;
  static const double honeySmallRadius = 12.0;

  // 间距系统 - 统一间距规范
  static const double spacingXxs = 4.0;
  static const double spacingXs = 8.0;
  static const double spacingSm = 12.0;
  static const double spacingMd = 16.0;
  static const double spacingLg = 20.0;
  static const double spacingXl = 24.0;
  static const double spacingXxl = 32.0;

  // 图标尺寸系统
  static const double iconXs = 16.0;
  static const double iconSm = 20.0;
  static const double iconMd = 24.0;
  static const double iconLg = 32.0;
  static const double iconXl = 48.0;

  // 阴影配置 - 中性柔和阴影（深度来自表面层次，不用彩色发光）
  static List<BoxShadow> softShadow([Color? color]) {
    return [
      BoxShadow(
        color: Colors.black.withValues(alpha: 0.06),
        blurRadius: 20,
        offset: const Offset(0, 8),
      ),
    ];
  }

  // 兼容保留：原彩色发光阴影已收敛为中性层次阴影
  static List<BoxShadow> glowShadow([Color? color]) {
    return [
      BoxShadow(
        color: Colors.black.withValues(alpha: 0.08),
        blurRadius: 24,
        offset: const Offset(0, 12),
      ),
      BoxShadow(
        color: Colors.black.withValues(alpha: 0.03),
        blurRadius: 8,
        offset: const Offset(0, 4),
      ),
    ];
  }

  // 增强阴影系统 - 多层阴影实现更真实的效果
  static List<BoxShadow> elevatedShadow([Color? color]) {
    return [
      BoxShadow(
        color: (color ?? Colors.black).withValues(alpha: 0.08),
        blurRadius: 24,
        offset: const Offset(0, 12),
      ),
      BoxShadow(
        color: (color ?? Colors.black).withValues(alpha: 0.03),
        blurRadius: 8,
        offset: const Offset(0, 4),
      ),
    ];
  }

  // 轻微阴影 - 用于卡片悬浮效果
  static List<BoxShadow> subtleShadow([Color? color]) {
    return [
      BoxShadow(
        color: (color ?? Colors.black).withValues(alpha: 0.05),
        blurRadius: 12,
        offset: const Offset(0, 4),
      ),
    ];
  }

  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
      colorScheme: ColorScheme.fromSeed(
        seedColor: honeyPrimary,
        brightness: Brightness.light,
        primary: honeyPrimary,
        secondary: honeySecondary,
        surface: honeyBackground,
      ),
      scaffoldBackgroundColor: honeyBackground,
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        titleTextStyle: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.bold,
          color: honeyText,
        ),
        iconTheme: IconThemeData(color: honeyText),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: honeyPrimary,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(honeyButtonRadius),
          ),
          elevation: 0,
          textStyle: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      cardTheme: CardThemeData(
        color: Colors.white,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(honeyCardRadius),
        ),
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: Colors.white,
        selectedItemColor: honeyPrimary,
        unselectedItemColor: honeyTextSecondary.withValues(alpha: 0.6),
        type: BottomNavigationBarType.fixed,
        elevation: 0,
        selectedLabelStyle: const TextStyle(
          fontWeight: FontWeight.bold,
          fontSize: 12,
        ),
        unselectedLabelStyle: const TextStyle(
          fontSize: 11,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        // 略深于白色卡片，否则白卡上的输入框只剩一圈极淡的描边，看不出可点。
        fillColor: const Color(0xFFF8F6EE),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: const Color(0xFFE6E1D4)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: honeyPrimary, width: 2),
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        hintStyle: TextStyle(color: honeyTextSecondary.withValues(alpha: 0.6)),
      ),
      // 添加浮动按钮主题
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: honeyPrimary,
        foregroundColor: Colors.white,
        elevation: 5,
        shape: CircleBorder(),
      ),
      // 添加文本主题
      textTheme: const TextTheme(
        headlineLarge: TextStyle(
          fontSize: 28,
          fontWeight: FontWeight.w600,
          color: honeyText,
          height: 1.3,
        ),
        headlineMedium: TextStyle(
          fontSize: 24,
          fontWeight: FontWeight.w600,
          color: honeyText,
          height: 1.3,
        ),
        headlineSmall: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          color: honeyText,
          height: 1.4,
        ),
        titleLarge: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          color: honeyText,
          height: 1.4,
        ),
        titleMedium: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w600,
          color: honeyText,
          height: 1.4,
        ),
        titleSmall: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w500,
          color: honeyText,
          height: 1.5,
        ),
        bodyLarge: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w400,
          color: honeyText,
          height: 1.5,
        ),
        bodyMedium: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w400,
          color: honeyText,
          height: 1.5,
        ),
        bodySmall: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w400,
          color: honeyTextSecondary,
          height: 1.5,
        ),
        labelLarge: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w600,
          color: honeyText,
          height: 1.4,
        ),
        labelMedium: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w500,
          color: honeyTextSecondary,
          height: 1.4,
        ),
        labelSmall: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w500,
          color: honeyTextSecondary,
          height: 1.4,
        ),
      ),
    );
  }
}

// 装饰组件 - 可爱星星
class StarDecoration extends StatelessWidget {
  final double size;
  final Color color;

  const StarDecoration({
    super.key,
    this.size = 20,
    this.color = const Color(0xFFE3BC45),
  });

  @override
  Widget build(BuildContext context) {
    return Icon(
      Icons.star_rounded,
      size: size,
      color: color,
    );
  }
}

// 装饰组件 - 可爱云朵
class CloudDecoration extends StatelessWidget {
  final double size;
  final Color color;

  const CloudDecoration({
    super.key,
    this.size = 40,
    this.color = Colors.white,
  });

  @override
  Widget build(BuildContext context) {
    return Icon(
      Icons.cloud_rounded,
      size: size,
      color: color,
    );
  }
}

// 装饰组件 - 爱心
class HeartDecoration extends StatelessWidget {
  final double size;
  final Color? color;

  const HeartDecoration({
    super.key,
    this.size = 20,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Icon(
      Icons.favorite_rounded,
      size: size,
      // 未指定颜色时跟随当前皮肤主色（const 默认参数无法引用动态 getter）
      color: color ?? AppTheme.primaryColor,
    );
  }
}

// 泡泡背景组件 - 柔化的静态纸面元素（低透明度，不做漂浮装饰）
class BubbleBackground extends StatelessWidget {
  final Widget child;

  const BubbleBackground({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    // space 是深色纸面：白色泡泡会变成灰污点，改用主题青绿做微光晕；
    // 浅色皮肤继续用白色柔光点。
    final isDark = palette.themeKey == ChildThemeKey.space;
    final base = isDark ? palette.cta : Colors.white;
    final a = isDark ? [0.05, 0.04, 0.035, 0.045] : [0.18, 0.14, 0.10, 0.15];

    return Stack(
      children: [
        // 背景装饰
        Positioned(
          top: 50,
          left: 20,
          child: _buildBubble(30, base.withValues(alpha: a[0])),
        ),
        Positioned(
          top: 120,
          right: 30,
          child: _buildBubble(20, base.withValues(alpha: a[1])),
        ),
        Positioned(
          bottom: 150,
          left: 40,
          child: _buildBubble(25, base.withValues(alpha: a[2])),
        ),
        Positioned(
          bottom: 80,
          right: 50,
          child: _buildBubble(35, base.withValues(alpha: a[3])),
        ),
        child,
      ],
    );
  }

  Widget _buildBubble(double size, Color color) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
      ),
    );
  }
}
