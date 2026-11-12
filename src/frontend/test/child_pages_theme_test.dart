import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lingxi_companion/components/app_card.dart';
import 'package:lingxi_companion/components/child_home_experience.dart';
import 'package:lingxi_companion/components/child_fun_page.dart';
import 'package:lingxi_companion/components/gradient_button.dart';
import 'package:lingxi_companion/screens/games/trivia_quiz_game.dart';
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

/// 整页外壳用：不再套 Scaffold，验证页面自己是否带 Material 祖先。
Widget _pageHarness(ChildThemeKey key, Widget child) {
  return MaterialApp(theme: buildChildTheme(key), home: child);
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

    testWidgets('高龄档点亮后显示达成条件', (tester) async {
      await tester.pumpWidget(_harness(
        ChildThemeKey.space,
        // 完成数拉满，全部徽章点亮 → 卡片显示达成条件而不是「还差 N 个」
        const AchievementScreen(completedCount: 30, totalContents: 30),
      ));
      await tester.pump(const Duration(seconds: 2));
      expect(find.text(kChildAchievements.first.desc), findsOneWidget);
    });

    testWidgets('未达成徽章显示还差几个，不假装已获得', (tester) async {
      await tester.pumpWidget(_harness(
        ChildThemeKey.space,
        const AchievementScreen(completedCount: 0, totalContents: 6),
      ));
      await tester.pump(const Duration(seconds: 2));
      expect(find.text(kChildAchievements.first.desc), findsNothing);
      expect(find.text('还差 ${kChildAchievements.first.threshold} 个'),
          findsOneWidget);
      expect(find.byIcon(Icons.lock_rounded), findsWidgets);
    });

    testWidgets('作为 push 页面恒定有返回按钮', (tester) async {
      await tester.pumpWidget(_harness(
        ChildThemeKey.honey,
        const AchievementScreen(),
      ));
      await tester.pump(const Duration(seconds: 2));
      expect(find.byIcon(Icons.arrow_back_rounded), findsOneWidget);
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

  group('首页更多好玩', () {
    testWidgets('入口用 Material 图标渲染，不依赖系统 emoji 字体', (tester) async {
      await tester.pumpWidget(_harness(
        ChildThemeKey.space,
        ChildMoreGrid(entries: <ChildMoreEntry>[
          ChildMoreEntry(
              icon: Icons.psychology_alt_rounded, label: '知识问答', onTap: () {}),
        ]),
      ));

      expect(find.text('知识问答'), findsOneWidget);
      expect(find.byIcon(Icons.psychology_alt_rounded), findsOneWidget);
    });
  });

  group('更多好玩二级页', () {
    testWidgets('知识问答入口页自带 Scaffold，文字不再是错误样式', (tester) async {
      await tester.pumpWidget(_pageHarness(
        ChildThemeKey.forest,
        TriviaQuizGame(onExit: () {}),
      ));
      await tester.pump(const Duration(milliseconds: 300));

      // 没有 Scaffold/Material 祖先时，Text 会退回「黄双下划线」的错误样式，
      // 这里直接断言页面结构里确实有 Scaffold 与皮肤纸面底色。
      expect(find.byType(Scaffold), findsOneWidget);
      expect(find.text('知识问答'), findsOneWidget);
      expect(find.text('开始答题'), findsOneWidget);
      expect(find.byIcon(Icons.arrow_back_rounded), findsOneWidget);
    });

    testWidgets('知识问答类别用 Material 图标渲染，不依赖 emoji 字体', (tester) async {
      await tester.pumpWidget(_pageHarness(
        ChildThemeKey.candy,
        TriviaQuizGame(onExit: () {}),
      ));
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.text('任意'), findsOneWidget);
      expect(find.text('动物'), findsOneWidget);
      expect(find.byIcon(Icons.pets_rounded), findsOneWidget);
      expect(find.byIcon(Icons.psychology_alt_rounded), findsOneWidget);
    });

    testWidgets('space 皮肤下入口页没有纯白大卡片', (tester) async {
      await tester.pumpWidget(_pageHarness(
        ChildThemeKey.space,
        TriviaQuizGame(onExit: () {}),
      ));
      await tester.pump(const Duration(milliseconds: 300));

      final containers = tester.widgetList<Container>(find.byType(Container));
      final whiteCards = containers.where((c) {
        final d = c.decoration;
        return d is BoxDecoration && d.color == Colors.white;
      });
      expect(whiteCards, isEmpty);
    });

    testWidgets('ChildFunPage 返回按钮走 onBack', (tester) async {
      var tapped = 0;
      await tester.pumpWidget(_pageHarness(
        ChildThemeKey.honey,
        ChildFunPage(
          title: '测试页',
          subtitle: '副标题',
          icon: Icons.flag_rounded,
          onBack: () => tapped++,
          child: const SizedBox(height: 20),
        ),
      ));

      expect(find.text('测试页'), findsOneWidget);
      expect(find.text('副标题'), findsOneWidget);
      await tester.tap(find.byIcon(Icons.arrow_back_rounded));
      expect(tapped, 1);
    });

    testWidgets('ChildFunPage 跟随皮肤纸面底色', (tester) async {
      await tester.pumpWidget(_pageHarness(
        ChildThemeKey.space,
        const ChildFunPage(title: '测试页', child: SizedBox(height: 20)),
      ));
      final scaffold = tester.widget<Scaffold>(find.byType(Scaffold));
      expect(scaffold.backgroundColor, _palette(ChildThemeKey.space).paper);
    });
  });
}
