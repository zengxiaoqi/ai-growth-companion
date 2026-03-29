import 'package:flutter/material.dart';

class AppTheme {
  // 品牌色彩
  static const Color primaryColor = Color(0xFFFF9F43);    // 温暖橙
  static const Color secondaryColor = Color(0xFF54A0FF); // 天空蓝
  static const Color accentColor = Color(0xFF26DE81);    // 草地绿
  static const Color warningColor = Color(0xFFFF6B6B);   // 珊瑚红
  static const Color backgroundColor = Color(0xFFFFF9F0); // 奶白色
  static const Color textColor = Color(0xFF2D3436);      // 深灰
  static const Color textSecondary = Color(0xFF636E72);  // 中灰
  
  // 儿童色彩（明亮活泼）
  static const List<Color> childColors = [
    Color(0xFFFF9F43), // 橙
    Color(0xFF54A0FF), // 蓝
    Color(0xFF26DE81), // 绿
    Color(0xFFFF6B6B), // 红
    Color(0xFFA55EEA), // 紫
    Color(0xFFFFCE4E), // 黄
  ];
  
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
        backgroundColor: backgroundColor,
        foregroundColor: textColor,
        elevation: 0,
        centerTitle: true,
        titleTextStyle: TextStyle(
          fontFamily: 'PingFang',
          fontSize: 18,
          fontWeight: FontWeight.w600,
          color: textColor,
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: primaryColor,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      cardTheme: CardThemeData(
        color: Colors.white,
        elevation: 2,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: Colors.white,
        selectedItemColor: primaryColor,
        unselectedItemColor: textSecondary,
        type: BottomNavigationBarType.fixed,
        elevation: 8,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: Colors.grey.shade200),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: primaryColor, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      ),
    );
  }
}