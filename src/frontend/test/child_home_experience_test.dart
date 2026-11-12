import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lingxi_companion/components/child_home_experience.dart';
import 'package:lingxi_companion/theme/child_density.dart';
import 'package:lingxi_companion/theme/child_theme.dart';

/// 首页体验组件的三档年龄密度 / 卡通贴纸行为验证。
///
/// 与 Web 端 `child-home-experience.test.tsx` 对齐：同一批组件换一份
/// [ChildDensity] 就应产出不同信息量，而不是三套各写一遍。

Widget _harness(ChildThemeKey key, Widget child) {
  return MaterialApp(
    theme: buildChildTheme(key),
    home: Scaffold(
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: child,
      ),
    ),
  );
}

ChildPrimaryTask _task() => ChildPrimaryTask(
      kicker: '今天先玩这个',
      title: '数字宝宝 1-5',
      meta: '跟着小犀数苹果',
      buttonLabel: '开始学习',
      onStart: () {},
    );

void main() {
  group('密度档位 token', () {
    test('三档开关与 Web 端口径一致', () {
      expect(childDensityForLevel(0).ctaHeight, 66);
      expect(childDensityForLevel(1).ctaHeight, 56);
      expect(childDensityForLevel(2).ctaHeight, 48);
      expect(childDensityForLevel(0).discoveryCards, 3);
      expect(childDensityForLevel(1).discoveryCards, 4);
      expect(childDensityForLevel(2).discoveryCards, 5);
      expect(childDensityForLevel(0).subjects, 4);
      expect(childDensityForLevel(1).subjects, 6);
    });

    test('非法档位回落中档', () {
      expect(childDensityForLevel(null).level, 1);
      expect(childDensityForLevel(9).level, 1);
      expect(childDensityForLevel('2').level, 2);
    });

    test('四套皮肤各自带密度档与皮肤 key', () {
      expect(ChildThemePalette.candy.level, 0);
      expect(ChildThemePalette.honey.level, 1);
      expect(ChildThemePalette.forest.level, 1);
      expect(ChildThemePalette.space.level, 2);
      expect(ChildThemePalette.candy.themeKey, ChildThemeKey.candy);
      expect(ChildThemePalette.space.themeKey, ChildThemeKey.space);
      expect(ChildThemePalette.candy.density.progressMode,
          ChildProgressMode.stars);
      expect(ChildThemePalette.space.density.progressMode,
          ChildProgressMode.checklist);
      expect(ChildThemePalette.candy.isCartoon, isTrue);
      expect(ChildThemePalette.honey.isCartoon, isFalse);
    });

    test('lerp 中途保留起点皮肤 key，过半后切到终点', () {
      final near = ChildThemePalette.candy.lerp(ChildThemePalette.space, 0.2);
      expect(near.themeKey, ChildThemeKey.candy);
      final far = ChildThemePalette.candy.lerp(ChildThemePalette.space, 0.8);
      expect(far.themeKey, ChildThemeKey.space);
    });
  });

  group('主任务 Hero 随密度变化', () {
    testWidgets('低龄档按钮 66px 且不展示摘要/次要动作', (tester) async {
      await tester.pumpWidget(
        _harness(
          ChildThemeKey.candy,
          ChildHomeHero(
            userName: '小明',
            task: _task(),
            stars: 2,
            density: childDensityForLevel(0),
            onOpenCompanion: () {},
            secondaryActions: <ChildSecondaryAction>[
              ChildSecondaryAction(
                  label: '听小犀讲故事', emoji: '🎧', onSelect: () {}),
              ChildSecondaryAction(
                  label: '看看我的成就', emoji: '🏅', onSelect: () {}),
            ],
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 200));

      final cta = tester.getSize(
        find
            .ancestor(
              of: find.text('开始学习'),
              matching: find.byType(SizedBox),
            )
            .first,
      );
      expect(cta.height, 66);

      // 低龄档 showMeta = false：主任务摘要与学科「点开看看」都不出现
      expect(find.text('跟着小犀数苹果'), findsNothing);
      // 纯图形星星进度
      expect(find.text('已收集 2 / 3'), findsOneWidget);
      // 只有 1 个主动作 → 次要动作全被裁掉
      expect(find.text('听小犀讲故事'), findsNothing);
    });

    testWidgets('中龄档按钮 56px、进度环、一个次要动作', (tester) async {
      await tester.pumpWidget(
        _harness(
          ChildThemeKey.forest,
          ChildHomeHero(
            userName: '小明',
            task: _task(),
            stars: 1,
            density: childDensityForLevel(1),
            onOpenCompanion: () {},
            secondaryActions: <ChildSecondaryAction>[
              ChildSecondaryAction(
                  label: '听小犀讲故事', emoji: '🎧', onSelect: () {}),
              ChildSecondaryAction(
                  label: '看看我的成就', emoji: '🏅', onSelect: () {}),
            ],
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 200));

      final cta = tester.getSize(
        find
            .ancestor(
              of: find.text('开始学习'),
              matching: find.byType(SizedBox),
            )
            .first,
      );
      expect(cta.height, 56);
      expect(find.text('今日进度'), findsOneWidget);
      expect(find.text('跟着小犀数苹果'), findsOneWidget);
      expect(find.text('听小犀讲故事'), findsOneWidget);
      expect(find.text('看看我的成就'), findsNothing);
    });

    testWidgets('高龄档按钮 48px、任务清单、两个次要动作', (tester) async {
      await tester.pumpWidget(
        _harness(
          ChildThemeKey.space,
          ChildHomeHero(
            userName: '小明',
            task: _task(),
            stars: 2,
            density: childDensityForLevel(2),
            onOpenCompanion: () {},
            secondaryActions: <ChildSecondaryAction>[
              ChildSecondaryAction(
                  label: '听小犀讲故事', emoji: '🎧', onSelect: () {}),
              ChildSecondaryAction(
                  label: '看看我的成就', emoji: '🏅', onSelect: () {}),
            ],
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 200));

      final cta = tester.getSize(
        find
            .ancestor(
              of: find.text('开始学习'),
              matching: find.byType(SizedBox),
            )
            .first,
      );
      expect(cta.height, 48);
      expect(find.text('今日小任务'), findsOneWidget);
      expect(find.text('今日主线 · Lv.3'), findsOneWidget);
      expect(find.text('听小犀讲故事'), findsOneWidget);
      expect(find.text('看看我的成就'), findsOneWidget);
    });
  });

  group('小发现与学科网格', () {
    testWidgets('低龄档 3 张探索卡、4 个学科（含音乐、无艺术）', (tester) async {
      await tester.pumpWidget(
        _harness(
          ChildThemeKey.candy,
          Column(
            children: <Widget>[
              ChildDiscoverySection(
                density: childDensityForLevel(0),
                onOpenCompanion: () {},
              ),
              ChildSubjectGrid(
                density: childDensityForLevel(0),
                onPick: (_) {},
                onMusic: () {},
              ),
            ],
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 200));

      expect(find.text('哇！小发现'), findsOneWidget);
      expect(find.text(kChildDiscoveries[0].title), findsOneWidget);
      expect(find.text(kChildDiscoveries[2].title), findsOneWidget);
      // 第 4 张在低龄档不渲染
      expect(find.text(kChildDiscoveries[3].title), findsNothing);

      expect(find.text('选一个大图标'), findsOneWidget);
      expect(find.text('语言'), findsOneWidget);
      expect(find.text('音乐'), findsOneWidget);
      expect(find.text('艺术'), findsNothing);
    });

    testWidgets('高龄档 5 张探索卡、6 个学科、卡片带摘要', (tester) async {
      await tester.pumpWidget(
        _harness(
          ChildThemeKey.space,
          Column(
            children: <Widget>[
              ChildDiscoverySection(
                density: childDensityForLevel(2),
                onOpenCompanion: () {},
              ),
              ChildSubjectGrid(
                density: childDensityForLevel(2),
                onPick: (_) {},
                onMusic: () {},
              ),
            ],
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 200));

      expect(find.text('今日情报站'), findsOneWidget);
      for (final item in kChildDiscoveries) {
        expect(find.text(item.title), findsOneWidget);
      }
      expect(find.text('星图课程'), findsOneWidget);
      expect(find.text('艺术'), findsOneWidget);
      expect(find.text('社会'), findsOneWidget);
      expect(find.text('点开看看 →'), findsNWidgets(6));
    });
  });

  group('今天要做的事', () {
    testWidgets('低龄档只露 1 条，可展开全部', (tester) async {
      final tasks = <ChildTodayTask>[
        for (var i = 0; i < 3; i++)
          ChildTodayTask(
            id: 't$i',
            title: '任务 $i',
            subtitle: '数学 · 难度 2',
            onOpen: () {},
          ),
      ];

      await tester.pumpWidget(
        _harness(
          ChildThemeKey.honey,
          ChildTodayTaskList(
            tasks: tasks,
            density: childDensityForLevel(0),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 200));

      expect(find.text('任务 0'), findsOneWidget);
      expect(find.text('任务 1'), findsNothing);
      expect(find.text('查看全部 (3)'), findsOneWidget);

      await tester.tap(find.text('查看全部 (3)'));
      await tester.pump(const Duration(milliseconds: 200));
      expect(find.text('任务 1'), findsOneWidget);
      expect(find.text('任务 2'), findsOneWidget);
    });

    testWidgets('空任务列表不渲染任何标题', (tester) async {
      await tester.pumpWidget(
        _harness(
          ChildThemeKey.honey,
          const ChildTodayTaskList(tasks: <ChildTodayTask>[]),
        ),
      );
      await tester.pump(const Duration(milliseconds: 200));
      expect(find.text('今天要做的事'), findsNothing);
    });
  });
}
