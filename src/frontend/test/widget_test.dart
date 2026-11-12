import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:lingxi_companion/app.dart';
import 'package:lingxi_companion/services/storage_service.dart';
import 'package:lingxi_companion/services/api_service.dart';
import 'package:lingxi_companion/services/ai_service.dart';
import 'package:lingxi_companion/providers/user_provider.dart';
import 'package:lingxi_companion/providers/learning_provider.dart';
import 'package:lingxi_companion/providers/content_provider.dart';
import 'package:lingxi_companion/theme/child_theme.dart';
import 'package:provider/provider.dart';

void main() {
  testWidgets('App shows login screen when not logged in', (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final storageService = StorageService(prefs);
    final apiService = ApiService();
    final aiService = AiService(apiService);

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          Provider<StorageService>.value(value: storageService),
          Provider<ApiService>.value(value: apiService),
          Provider<AiService>.value(value: aiService),
          ChangeNotifierProvider(
            create: (_) => UserProvider(storageService),
          ),
          ChangeNotifierProvider(
            create: (_) => LearningProvider(storageService),
          ),
          ChangeNotifierProvider(
            create: (_) => ContentProvider(apiService),
          ),
          ChangeNotifierProvider<ChildThemeController>(
            create: (_) => ChildThemeController(storageService),
          ),
        ],
        child: const LingxiApp(),
      ),
    );

    // 品牌启动屏的时长由 LingxiBootstrap 负责（本测试直接挂 LingxiApp，
    // 不经过引导层）。UserProvider 在构造时同步完成 _loadUser，
    // 所以首帧 isLoading 已是 false，直接落到登录页。
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    // Should show login screen since no user is logged in
    expect(find.text('欢迎回来'), findsOneWidget);
  });

  testWidgets('App renders MaterialApp with correct title', (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final storageService = StorageService(prefs);
    final apiService = ApiService();
    final aiService = AiService(apiService);

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          Provider<StorageService>.value(value: storageService),
          Provider<ApiService>.value(value: apiService),
          Provider<AiService>.value(value: aiService),
          ChangeNotifierProvider(
            create: (_) => UserProvider(storageService),
          ),
          ChangeNotifierProvider(
            create: (_) => LearningProvider(storageService),
          ),
          ChangeNotifierProvider(
            create: (_) => ContentProvider(apiService),
          ),
          ChangeNotifierProvider<ChildThemeController>(
            create: (_) => ChildThemeController(storageService),
          ),
        ],
        child: const LingxiApp(),
      ),
    );

    await tester.pump();

    // 推进时钟让交叉淡出动画结束，避免测试结束时存在 pending animation
    await tester.pump(const Duration(milliseconds: 500));

    // Verify MaterialApp is present
    final materialApp = tester.widget<MaterialApp>(find.byType(MaterialApp));
    expect(materialApp.title, '灵犀伴学');
  });
}
