import 'package:flutter/material.dart';

class AppTheme {
  // 品牌色彩 - 蜜黄绘本色系（与 React Web 设计系统对齐）
  static const Color primaryColor = Color(0xFF705900);    // 深蜜黄（主操作色，白字对比达标）
  static const Color secondaryColor = Color(0xFF006384);  // 深天蓝
  static const Color accentColor = Color(0xFF586000);     // 橄榄绿
  static const Color warningColor = Color(0xFFB02500);    // 深珊瑚红（错误/警示）
  static const Color backgroundColor = Color(0xFFFFF7D5); // 奶油黄
  static const Color textColor = Color(0xFF352F00);       // 深橄榄灰
  static const Color textSecondary = Color(0xFF655C25);   // 中橄榄灰

  // 语义化颜色 - 用于状态反馈
  static const Color successColor = Color(0xFF4CAF50);   // 成功绿
  static const Color errorColor = Color(0xFFB02500);     // 错误红
  static const Color infoColor = Color(0xFF006384);      // 信息蓝
  static const Color disabledColor = Color(0xFFBDBDBD);  // 禁用灰

  // 柔和辅助色（低饱和，融入蜜黄主题）
  static const Color softPink = Color(0xFFF2C1C8);      // 柔粉
  static const Color softPurple = Color(0xFFC9C0DE);    // 柔紫
  static const Color softYellow = Color(0xFFFBE6A2);    // 柔蜜黄
  static const Color softBlue = Color(0xFFBDD7EA);       // 柔天蓝
  static const Color softOrange = Color(0xFFF5D5B8);     // 柔橙
  static const Color softMint = Color(0xFFC5DED3);       // 柔薄荷

  // 儿童分类色（低饱和，仅用于区分，不做大面积铺色）
  static const List<Color> childColors = [
    Color(0xFFC26B5A), // 陶土红（语言）
    Color(0xFF4A8F86), // 青碧（数学）
    Color(0xFF6F9E7F), // 苔绿（科学）
    Color(0xFFC98A5A), // 琥珀（艺术）
    Color(0xFF9A8FB8), // 柔堇（社会）
    Color(0xFFD9B13B), // 蜜黄（通用）
  ];

  // 渐变 - 同色系微渐变（仅允许同一色相内的轻微深浅变化）
  static const LinearGradient primaryGradient = LinearGradient(
    colors: [Color(0xFFFDD34D), Color(0xFFFFE587)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const LinearGradient secondaryGradient = LinearGradient(
    colors: [Color(0xFF97DAFF), Color(0xFFC3E8FF)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const LinearGradient rainbowGradient = LinearGradient(
    colors: [Color(0xFFFDD34D), Color(0xFFF5C243)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  // 节日主题渐变
  static const LinearGradient festivalGradient = LinearGradient(
    colors: [Color(0xFFE8895B), Color(0xFFDE7E50)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  // 成功状态渐变
  static const LinearGradient successGradient = LinearGradient(
    colors: [Color(0xFF4CAF50), Color(0xFF6FBF73)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  // 温暖渐变（用于奖励/成就）
  static const LinearGradient warmGradient = LinearGradient(
    colors: [Color(0xFFF2B85C), Color(0xFFE8A33D)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );
  
  // 圆角配置
  static const double cardRadius = 20.0;
  static const double buttonRadius = 14.0;
  static const double smallRadius = 12.0;

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
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
        colorScheme: ColorScheme.fromSeed(
        seedColor: primaryColor,
        brightness: Brightness.light,
        primary: primaryColor,
        secondary: secondaryColor,
        surface: backgroundColor,
      ),
scaffoldBackgroundColor: backgroundColor,
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
titleTextStyle: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.bold,
          color: textColor,
        ),
        iconTheme: IconThemeData(color: textColor),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: primaryColor,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(buttonRadius),
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
          borderRadius: BorderRadius.circular(cardRadius),
        ),
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: Colors.white,
        selectedItemColor: primaryColor,
        unselectedItemColor: textSecondary.withValues(alpha: 0.6),
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
        fillColor: Colors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: Colors.grey.shade200),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: primaryColor, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        hintStyle: TextStyle(color: textSecondary.withValues(alpha: 0.6)),
      ),
      // 添加浮动按钮主题
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: primaryColor,
        foregroundColor: Colors.white,
        elevation: 5,
        shape: CircleBorder(),
      ),
      // 添加文本主题
      textTheme: const TextTheme(
        headlineLarge: TextStyle(
          fontSize: 28,
          fontWeight: FontWeight.w600,
          color: textColor,
          height: 1.3,
        ),
        headlineMedium: TextStyle(
          fontSize: 24,
          fontWeight: FontWeight.w600,
          color: textColor,
          height: 1.3,
        ),
        headlineSmall: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          color: textColor,
          height: 1.4,
        ),
        titleLarge: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          color: textColor,
          height: 1.4,
        ),
        titleMedium: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w600,
          color: textColor,
          height: 1.4,
        ),
        titleSmall: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w500,
          color: textColor,
          height: 1.5,
        ),
        bodyLarge: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w400,
          color: textColor,
          height: 1.5,
        ),
        bodyMedium: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w400,
          color: textColor,
          height: 1.5,
        ),
        bodySmall: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w400,
          color: textSecondary,
          height: 1.5,
        ),
        labelLarge: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w600,
          color: textColor,
          height: 1.4,
        ),
        labelMedium: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w500,
          color: textSecondary,
          height: 1.4,
        ),
        labelSmall: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w500,
          color: textSecondary,
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
  final Color color;

  const HeartDecoration({
    super.key,
    this.size = 20,
    this.color = AppTheme.primaryColor,
  });

  @override
  Widget build(BuildContext context) {
    return Icon(
      Icons.favorite_rounded,
      size: size,
      color: color,
    );
  }
}

// 泡泡背景组件 - 柔化的静态纸面元素（低透明度，不做漂浮装饰）
class BubbleBackground extends StatelessWidget {
  final Widget child;

  const BubbleBackground({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        // 背景装饰
        Positioned(
          top: 50,
          left: 20,
          child: _buildBubble(30, Colors.white.withValues(alpha: 0.18)),
        ),
        Positioned(
          top: 120,
          right: 30,
          child: _buildBubble(20, Colors.white.withValues(alpha: 0.14)),
        ),
        Positioned(
          bottom: 150,
          left: 40,
          child: _buildBubble(25, Colors.white.withValues(alpha: 0.10)),
        ),
        Positioned(
          bottom: 80,
          right: 50,
          child: _buildBubble(35, Colors.white.withValues(alpha: 0.15)),
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