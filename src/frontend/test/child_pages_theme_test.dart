import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lingxi_companion/components/app_card.dart';
import 'package:lingxi_companion/components/gradient_button.dart';
import 'package:lingxi_companion/screens/achievement/achievement_data.dart';
import 'package:lingxi_companion/screens/achievement/achievement_screen.dart';
import 'package:lingxi_companion/theme/child_theme.dart';

/// 「成就 / 我的 / 对话」这批后续页面接入 v2 主题后的回归测试：
/// 换一份皮肤，卡片底色、徽章列数、按钮文字色都应跟随，不再写死白色。

Widget _harness(ChildThemeKey key, Widget child) {
  return MaterialApp(
    theme: buildChildTheme(key),
    home: Scaffold(body: child),
  );
}

ChildThemePalette _palette(ChildThemeKey key) => ChildThemePalette.ofKey(key);

void main() {
  group('AppCard 默认底色', () {
    testWidgets('未指定 color 时跟随当前皮肤卡片色', (tester) async {
      await tester.pumpWidget(_harness(
        ChildThemeKey.space,
        const AppCard(child: Text('卡片')),
      ));

      final container = tester.widget<Container>(
        find
            .descendant(
              of: find.byType(AppCard),
              matching: find.byType(Container),
            )
            .first,
      );
      final decoration = container.decoration as BoxDecoration;
      expect(decoration.color, _palette(ChildThemeKey.space).card);
    });

    testWidgets('卡通皮肤加粗描边', (tester) async {
      await tester.pumpWidget(_harness(
        ChildThemeKey.candy,
        const AppCard(child: Text('卡片')),
      ));
      final container = tester.widget<Container>(
        find
            .descendant(
              of: find.byType(AppCard),
              matching: find.byType(Container),
            )
            .first,
      );
      expect((container.decoration as BoxDecoration).border, isNotNull);
    });

    testWidgets('honey 皮肤不加描边', (tester) async {
      await tester.pumpWidget(_harness(
        ChildThemeKey.honey,
        const AppCard(child: Text('卡片')),
      ));
      final container = tester.widget<Container>(
        find
            .descendant(
              of: find.byType(AppCard),
              matching: find.byType(Container),
            )
            .first,
      );
      expect((container.decoration as BoxDecoration).border, isNull);
    });
  });

  group('GradientButton 文字色', () {
    testWidgets('默认跟随皮肤主行动按钮文字色', (tester) async {
      await tester.pumpWidget(_harness(
        ChildThemeKey.candy,
        GradientButton(text: '开始', onPressed: () {}),
      ));
      final text = tester.widget<Text>(find.text('开始'));
      expect(text.style?.color, _palette(ChildThemeKey.candy).ctaInk);
    });
  });

  group('成就页', () {
    testWidgets('低龄档两列、高龄档三列', (tester) async {
      await tester.pumpWidget(_harness(
        ChildThemeKey.candy,
        const AchievementScreen(),
      ));
      await tester.pump(const Duration(seconds: 2));
      var grid = tester.widget<GridView>(find.byType(GridView));
      expect(
        (grid.gridDelegate as SliverGridDelegateWithFixedCrossAxisCount)
            .crossAxisCount,
        2,
      );

      await tester.pumpWidget(_harness(
        ChildThemeKey.space,
        const AchievementScreen(),
      ));
      await tester.pump(const Duration(seconds: 2));
      grid = tester.widget<GridView>(find.byType(GridView));
      expect(
        (grid.gridDelegate as SliverGridDelegateWithFixedCrossAxisCount)
            .crossAxisCount,
        3,
      );
    });

    testWidgets('徽章内容与共享数据一致，低龄档不显示描述', (tester) async {
      await tester.pumpWidget(_harness(
        ChildThemeKey.candy,
        const AchievementScreen(),
      ));
      await tester.pump(const Duration(seconds: 2));

      expect(find.text(kChildAchievements.first.name), findsOneWidget);
      // level 0 的 showMeta 为 false：卡片上不出现达成条件文案
      expect(find.text(kChildAchievements.first.desc), findsNothing);
    });

    testWidgets('高龄档显示达成条件', (tester) async {
      await tester.pumpWidget(_harness(
        ChildThemeKey.space,
        const AchievementScreen(),
      ));
      await tester.pump(const Duration(seconds: 2));
      expect(find.text(kChildAchievements.first.desc), findsOneWidget);
    });

    testWidgets('页面不出现写死白底的大卡片', (tester) async {
      await tester.pumpWidget(_harness(
        ChildThemeKey.space,
        const AchievementScreen(),
      ));
      await tester.pump(const Duration(seconds: 2));

      // space 皮肤卡片色为深紫，整个页面不应再有纯白 BoxDecoration
      final containers = tester.widgetList<Container>(find.byType(Container));
      final whiteCards = containers.where((c) {
        final d = c.decoration;
        return d is BoxDecoration && d.color == Colors.white;
      });
      expect(whiteCards, isEmpty);
    });
  });
}
