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
import 'package:provider/provider.dart';

void main() {
  testWidgets('App shows splash screen initially', (WidgetTester tester) async {
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
        ],
        child: const LingxiApp(),
      ),
    );

    // 首帧应显示 SplashScreen
    // pump() 不推进时钟，Timer 不会触发，SplashScreen 保持可见
    await tester.pump();

    // Should show splash screen since no user is logged in and loading is deferred
    expect(find.text('灵犀伴学'), findsOneWidget);

    // 推进时钟让延迟加载 Timer 触发，避免测试结束时存在 pending timer
    await tester.pump(const Duration(milliseconds: 30));
    await tester.pump();
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
        ],
        child: const LingxiApp(),
      ),
    );

    await tester.pump();

    // 推进时钟让延迟加载 Timer 触发，避免测试结束时存在 pending timer
    await tester.pump(const Duration(milliseconds: 30));
    await tester.pump();

    // Verify MaterialApp is present
    final materialApp = tester.widget<MaterialApp>(find.byType(MaterialApp));
    expect(materialApp.title, '灵犀伴学');
  });
}
