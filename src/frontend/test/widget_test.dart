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
        ],
        child: const LingxiApp(),
      ),
    );

    // UserProvider._loadUser() runs synchronously in the constructor,
    // so by the time the first frame renders, isLoading is already false.
    // With no user logged in (empty SharedPreferences), LoginScreen is shown.
    await tester.pump();

    // Should show login screen since no user is logged in
    expect(find.text('欢迎回来'), findsOneWidget);

    // Advance clock to settle any pending animations
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
