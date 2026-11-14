import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lingxi_companion/screens/profile/profile_menus.dart';
import 'package:lingxi_companion/theme/app_theme.dart';
import 'package:lingxi_companion/theme/child_theme.dart';

/// 「我的」页弹层取色的回归测试。
///
/// 这批 sheet 以前全量读 `AppTheme.xxx` 静态 getter —— 那条通道依赖全局
/// `AppTheme.active`，不注册 Theme 依赖，切肤后弹层不会重建。改成
/// `ChildThemePalette.of(context)` 之后，弹层底色/卡片色必须跟着当前皮肤走。

Widget _harness(ChildThemeKey key, {required String label}) {
  return MaterialApp(
    theme: buildChildTheme(key),
    home: Builder(
      builder: (context) => Scaffold(
        body: Center(
          child: ElevatedButton(
            onPressed: () => showPrivacySheet(context),
            child: Text(label),
          ),
        ),
      ),
    ),
  );
}

/// 弹层里出现的所有装饰色。
List<Color> _decorationColors(WidgetTester tester) {
  return tester
      .widgetList<Container>(find.byType(Container))
      .map((c) => c.decoration)
      .whereType<BoxDecoration>()
      .map((d) => d.color)
      .whereType<Color>()
      .toList();
}

Future<void> _openSheet(WidgetTester tester, ChildThemeKey key) async {
  await tester.pumpWidget(_harness(key, label: '打开隐私设置'));
  await tester.tap(find.text('打开隐私设置'));
  await tester.pumpAndSettle();
}

void main() {
  group('隐私设置弹层跟随皮肤取色', () {
    testWidgets('space 皮肤下弹层底色是深紫纸面，而不是蜜黄', (tester) async {
      await _openSheet(tester, ChildThemeKey.space);

      final colors = _decorationColors(tester);
      expect(colors, contains(ChildThemePalette.space.paper));
      // 旧实现会拿到 honey 的奶油黄（AppTheme.active 未同步时）——必须没有。
      expect(colors, isNot(contains(ChildThemePalette.honey.paper)));
    });

    testWidgets('space 皮肤下卡片用深紫卡片色，不出现纯白卡片', (tester) async {
      await _openSheet(tester, ChildThemeKey.space);

      final colors = _decorationColors(tester);
      expect(colors, contains(ChildThemePalette.space.card));
      expect(colors, isNot(contains(Colors.white)));
    });

    testWidgets('honey 皮肤保持原绘本色值（零视觉回归）', (tester) async {
      await _openSheet(tester, ChildThemeKey.honey);

      final colors = _decorationColors(tester);
      expect(colors, contains(AppTheme.honeyBackground));
      expect(colors, contains(Colors.white));
    });
  });

  group('AppTheme 静态取色与色板同源', () {
    test('soft 系列与 active 色板一致，不出现两套口径', () {
      final saved = AppTheme.active;
      const palettes = <ChildThemePalette>[
        ChildThemePalette.honey,
        ChildThemePalette.candy,
        ChildThemePalette.forest,
        ChildThemePalette.space,
      ];
      for (final palette in palettes) {
        AppTheme.active = palette;
        expect(AppTheme.softPink, palette.softPink);
        expect(AppTheme.softMint, palette.softMint);
        expect(AppTheme.softPurple, palette.softPurple);
        expect(AppTheme.secondaryColor, palette.popSecondary);
        expect(AppTheme.textColor, palette.ink);
      }
      AppTheme.active = saved;
    });
  });
}
