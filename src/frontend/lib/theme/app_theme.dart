import 'package:flutter/material.dart';

class AppTheme {
  // 品牌色彩 - 童趣柔和色调
  static const Color primaryColor = Color(0xFFFF85A2);    // 樱花粉
  static const Color secondaryColor = Color(0xFF7EC8E3); // 天空蓝
  static const Color accentColor = Color(0xFF7ED957);     // 草地绿
  static const Color warningColor = Color(0xFFFF9B85);   // 珊瑚红
  static const Color backgroundColor = Color(0xFFFFF8E8); // 奶白色
  static const Color textColor = Color(0xFF4A4A4A);      // 深灰
  static const Color textSecondary = Color(0xFF9E9E9E);  // 中灰
  
  // 童趣可爱风额外颜色
  static const Color softPink = Color(0xFFFFB6C1);      // 浅粉
  static const Color softPurple = Color(0xFFDDA0DD);    // 浅紫
  static const Color softYellow = Color(0xFFFFE4B5);     // 浅黄
  static const Color softBlue = Color(0xFF87CEEB);       // 浅蓝
  static const Color softOrange = Color(0xFFFFDAB9);     // 浅橙
  static const Color softMint = Color(0xFF98FB98);       // 薄荷绿
  
  // 儿童色彩（明亮活泼）
  static const List<Color> childColors = [
    Color(0xFFFF85A2), // 粉
    Color(0xFF7EC8E3), // 蓝
    Color(0xFF7ED957), // 绿
    Color(0xFFFF9B85), // 红
    Color(0xFFDDA0DD), // 紫
    Color(0xFFFFCE4E), // 黄
  ];
  
  // 渐变色配置
  static const LinearGradient primaryGradient = LinearGradient(
    colors: [primaryColor, Color(0xFFFFA5B9)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );
  
  static const LinearGradient secondaryGradient = LinearGradient(
    colors: [secondaryColor, Color(0xFFA8D8EA)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );
  
  static const LinearGradient rainbowGradient = LinearGradient(
    colors: [primaryColor, secondaryColor, accentColor, softYellow],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );
  
  // 圆角配置
  static const double cardRadius = 20.0;
  static const double buttonRadius = 24.0;
  static const double smallRadius = 12.0;
  
  // 阴影配置 - 柔和发光效果
  static List<BoxShadow> softShadow([Color? color]) {
    return [
      BoxShadow(
        color: (color ?? primaryColor).withOpacity(0.15),
        blurRadius: 20,
        offset: const Offset(0, 8),
      ),
    ];
  }
  
  static List<BoxShadow> glowShadow([Color? color]) {
    return [
      BoxShadow(
        color: (color ?? primaryColor).withOpacity(0.3),
        blurRadius: 30,
        spreadRadius: 2,
        offset: const Offset(0, 5),
      ),
    ];
  }

  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: primaryColor,
        brightness: Brightness.light,
        primary: primaryColor,
        secondary: secondaryColor,
        surface: backgroundColor,
      ),
      scaffoldBackgroundColor: backgroundColor,
      fontFamily: 'PingFang',
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        titleTextStyle: TextStyle(
          fontFamily: 'PingFang',
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
            fontWeight: FontWeight.bold,
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
        unselectedItemColor: textSecondary.withOpacity(0.6),
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
          borderRadius: BorderRadius.circular(20),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(20),
          borderSide: BorderSide(color: Colors.grey.shade200),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(20),
          borderSide: const BorderSide(color: primaryColor, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        hintStyle: TextStyle(color: textSecondary.withOpacity(0.6)),
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
          fontWeight: FontWeight.bold,
          color: textColor,
        ),
        headlineMedium: TextStyle(
          fontSize: 24,
          fontWeight: FontWeight.bold,
          color: textColor,
        ),
        titleLarge: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.bold,
          color: textColor,
        ),
        titleMedium: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w600,
          color: textColor,
        ),
        bodyLarge: TextStyle(
          fontSize: 16,
          color: textColor,
        ),
        bodyMedium: TextStyle(
          fontSize: 14,
          color: textColor,
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
    this.color = const Color(0xFFFFCE4E),
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

// 泡泡背景组件
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
          child: _buildBubble(30, Colors.white.withOpacity(0.5)),
        ),
        Positioned(
          top: 120,
          right: 30,
          child: _buildBubble(20, Colors.white.withOpacity(0.4)),
        ),
        Positioned(
          bottom: 150,
          left: 40,
          child: _buildBubble(25, Colors.white.withOpacity(0.3)),
        ),
        Positioned(
          bottom: 80,
          right: 50,
          child: _buildBubble(35, Colors.white.withOpacity(0.4)),
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