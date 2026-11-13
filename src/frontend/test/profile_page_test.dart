import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:lingxi_companion/providers/content_provider.dart';
import 'package:lingxi_companion/providers/learning_provider.dart';
import 'package:lingxi_companion/providers/user_provider.dart';
import 'package:lingxi_companion/screens/profile/profile_screen.dart';
import 'package:lingxi_companion/services/api_service.dart';
import 'package:lingxi_companion/services/storage_service.dart';
import 'package:lingxi_companion/theme/child_theme.dart';

/// 「我的」页吸收原设置页后的回归测试：
///   1. 页头不再有设置齿轮，设置能力全部落在页面内的分组里；
///   2. 外观主题可以直接换肤（不再需要进设置页）；
///   3. 资料编辑等入口仍在，且都走弹层、不再跳单独的设置页。

Future<ChildThemeController> _pumpProfile(
  WidgetTester tester, {
  ChildThemeKey key = ChildThemeKey.honey,
}) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  final storage = StorageService(prefs);
  final controller = ChildThemeController(storage);

  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<UserProvider>.value(
          value: UserProvider(storage),
        ),
        ChangeNotifierProvider<LearningProvider>.value(
          value: LearningProvider(storage),
        ),
        ChangeNotifierProvider<ContentProvider>.value(
          value: ContentProvider(ApiService()),
        ),
        ChangeNotifierProvider<ChildThemeController>.value(value: controller),
        Provider<StorageService>.value(value: storage),
      ],
      child: MaterialApp(
        theme: buildChildTheme(key),
        home: const Scaffold(body: ProfileScreen()),
      ),
    ),
  );
  await tester.pump();
  return controller;
}

void main() {
  testWidgets('页头不再有设置齿轮，设置项合并进页面分组', (tester) async {
    await _pumpProfile(tester);

    // 原来的右上角设置入口已移除
    expect(find.byIcon(Icons.settings_rounded), findsNothing);
    expect(find.text('我的'), findsOneWidget);

    // 分组标题与六个设置入口都在同一页
    expect(find.text('设置'), findsOneWidget);
    for (final title in <String>[
      '个人资料',
      '通知设置',
      '隐私设置',
      '帮助与反馈',
      '关于我们',
      '开源数据与许可',
    ]) {
      expect(find.text(title), findsOneWidget, reason: '缺少设置入口：$title');
    }
  });

  testWidgets('外观主题可直接换肤，并写回偏好', (tester) async {
    final controller = await _pumpProfile(tester);

    expect(find.text('外观主题'), findsOneWidget);
    expect(controller.mode, ChildThemeMode.auto);

    await tester.tap(find.text('糖果云朵国'));
    await tester.pumpAndSettle();

    expect(controller.mode, ChildThemeMode.candy);
    expect(controller.resolvedKey, ChildThemeKey.candy);
  });

  testWidgets('点身份卡进入资料编辑弹层，不回退到独立设置页', (tester) async {
    await _pumpProfile(tester);

    await tester.tap(find.text('编辑'));
    await tester.pumpAndSettle();

    expect(find.text('昵称'), findsOneWidget);
    expect(find.text('保存'), findsOneWidget);
  });
}
