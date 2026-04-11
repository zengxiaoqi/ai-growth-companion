import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'theme/app_theme.dart';
import 'providers/user_provider.dart';
import 'screens/splash_screen.dart';
import 'screens/child/child_home_screen.dart';
import 'screens/parent/parent_home_screen.dart';

class LingxiApp extends StatelessWidget {
  const LingxiApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '灵犀伴学',
      theme: AppTheme.lightTheme,
      debugShowCheckedModeBanner: false,
      home: Consumer<UserProvider>(
        builder: (context, userProvider, _) {
          // 根据用户状态显示不同界面
          if (userProvider.isLoading) {
            return const SplashScreen();
          }
          
          if (!userProvider.isLoggedIn) {
            return const SplashScreen();
          }
          
          // 根据用户类型跳转
          if (userProvider.currentUser?["type"] == 'child') {
            return const ChildHomeScreen();
          } else {
            return const ParentHomeScreen();
          }
        },
      ),
    );
  }
}