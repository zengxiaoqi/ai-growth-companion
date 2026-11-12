import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:lingxi_companion/services/storage_service.dart';
import 'package:lingxi_companion/theme/app_theme.dart';
import 'package:lingxi_companion/theme/child_theme.dart';

void main() {
  late StorageService storage;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    storage = StorageService(prefs);
  });

  group('parseChildThemeMode（持久化容错解析）', () {
    test('合法枚举名可解析', () {
      for (final mode in ChildThemeMode.values) {
        expect(parseChildThemeMode(mode.name), mode);
        expect(childThemeModeToStorage(mode), mode.name);
      }
    });

    test('非法值 / 空值 / 大小写不符一律回退 auto', () {
      expect(parseChildThemeMode('nope'), ChildThemeMode.auto);
      expect(parseChildThemeMode(''), ChildThemeMode.auto);
      expect(parseChildThemeMode('HONEY'), ChildThemeMode.auto);
      expect(parseChildThemeMode(null), ChildThemeMode.auto);
    });
  });

  group('ChildThemeController.resolvedKey（按年龄推断）', () {
    test('默认 auto 且无年龄 → honey', () {
      final c = ChildThemeController(storage);
      expect(c.mode, ChildThemeMode.auto);
      expect(c.age, isNull);
      expect(c.resolvedKey, ChildThemeKey.honey);
    });

    test('auto 边界：<4.5 candy，<5.5 forest，>=5.5 space', () {
      final c = ChildThemeController(storage);
      c.setAge(3);
      expect(c.resolvedKey, ChildThemeKey.candy);
      c.setAge(4.4);
      expect(c.resolvedKey, ChildThemeKey.candy);
      c.setAge(4.5);
      expect(c.resolvedKey, ChildThemeKey.forest);
      c.setAge(5.4);
      expect(c.resolvedKey, ChildThemeKey.forest);
      c.setAge(5.5);
      expect(c.resolvedKey, ChildThemeKey.space);
      c.setAge(6);
      expect(c.resolvedKey, ChildThemeKey.space);
    });

    test('字符串年龄可解析，null 清空回退 honey', () {
      final c = ChildThemeController(storage);
      c.setAge('5');
      expect(c.resolvedKey, ChildThemeKey.forest);
      c.setAge('abc');
      expect(c.resolvedKey, ChildThemeKey.honey);
      c.setAge(3);
      c.setAge(null);
      expect(c.resolvedKey, ChildThemeKey.honey);
    });

    test('固定 mode 不受年龄影响', () async {
      final c = ChildThemeController(storage);
      await c.setMode(ChildThemeMode.candy);
      c.setAge(6);
      expect(c.resolvedKey, ChildThemeKey.candy);
    });

    test('setMode 落盘后可被新 controller 恢复', () async {
      final c = ChildThemeController(storage);
      await c.setMode(ChildThemeMode.forest);
      expect(storage.getChildThemeMode(), 'forest');
      expect(ChildThemeController(storage).mode, ChildThemeMode.forest);
    });
  });

  group('buildChildTheme', () {
    test('挂上对应 palette 扩展并套用 paper 底色', () {
      final theme = buildChildTheme(ChildThemeKey.candy);
      expect(theme.extension<ChildThemePalette>(), ChildThemePalette.candy);
      expect(theme.scaffoldBackgroundColor, const Color(0xFFFFF2F7));
    });

    test('space 使用 Brightness.dark 的 ColorScheme', () {
      final theme = buildChildTheme(ChildThemeKey.space);
      expect(theme.colorScheme.brightness, Brightness.dark);
      expect(theme.brightness, Brightness.dark);
      expect(theme.extension<ChildThemePalette>(), ChildThemePalette.space);
    });

    test('honey 保持 light 且挂 honey 色板', () {
      final theme = buildChildTheme(ChildThemeKey.honey);
      expect(theme.colorScheme.brightness, Brightness.light);
      expect(theme.extension<ChildThemePalette>(), ChildThemePalette.honey);
    });
  });

  group('ChildThemePalette', () {
    test('copyWith 只替换传入字段', () {
      final p = ChildThemePalette.candy.copyWith(pop: Colors.black);
      expect(p.pop, Colors.black);
      expect(p.paper, ChildThemePalette.candy.paper);
    });

    test('lerp 插值且非同类型回退自身', () {
      final mid = ChildThemePalette.candy.lerp(ChildThemePalette.forest, 0.5);
      expect(mid.radiusLg, 31);
      expect(ChildThemePalette.candy.lerp(null, 0.5), ChildThemePalette.candy);
    });
  });

  group('AppTheme 静态取色代理（历史代码零迁移换肤）', () {
    test('active=honey 时全部 getter 与蜜黄基准一致', () {
      AppTheme.active = ChildThemePalette.honey;
      expect(AppTheme.primaryColor, AppTheme.honeyPrimary);
      expect(AppTheme.backgroundColor, AppTheme.honeyBackground);
      expect(AppTheme.textColor, AppTheme.honeyText);
      expect(AppTheme.textSecondary, AppTheme.honeyTextSecondary);
      expect(AppTheme.cardRadius, AppTheme.honeyCardRadius);
      expect(AppTheme.softYellow, AppTheme.honeySoftYellow);
      expect(AppTheme.childColors, AppTheme.honeyChildColors);
    });

    test('active=candy 时 getter 跟随糖果皮肤，圆角变大、文字变粉调', () {
      AppTheme.active = ChildThemePalette.candy;
      expect(AppTheme.primaryColor, ChildThemePalette.candy.pop);
      expect(AppTheme.backgroundColor, ChildThemePalette.candy.paper);
      expect(AppTheme.textColor, ChildThemePalette.candy.ink);
      expect(AppTheme.cardRadius, 34); // candy radiusLg
      expect(AppTheme.buttonRadius, 26);
      expect(AppTheme.softYellow, ChildThemePalette.candy.soft);
      // 语义色不随皮肤变化
      expect(AppTheme.warningColor, const Color(0xFFB02500));
      expect(AppTheme.successColor, const Color(0xFF4CAF50));
    });

    testWidgets('真实 widget 里的 AppTheme.textColor 随 active 换色', (tester) async {
      const probeKey = Key('probe');
      Widget probe(Color color) => Directionality(
            textDirection: TextDirection.ltr,
            child: Text('x', key: probeKey, style: TextStyle(color: color)),
          );

      AppTheme.active = ChildThemePalette.honey;
      await tester.pumpWidget(probe(AppTheme.textColor));
      var text = tester.widget<Text>(find.byKey(probeKey));
      expect(text.style!.color, AppTheme.honeyText);

      AppTheme.active = ChildThemePalette.space;
      await tester.pumpWidget(probe(AppTheme.textColor));
      text = tester.widget<Text>(find.byKey(probeKey));
      expect(text.style!.color, ChildThemePalette.space.ink);
    });

    testWidgets('lightTheme 恒为蜜黄（家长端不串色）', (tester) async {
      AppTheme.active = ChildThemePalette.candy;
      final theme = AppTheme.lightTheme;
      expect(theme.scaffoldBackgroundColor, AppTheme.honeyBackground);
      expect(theme.colorScheme.primary, AppTheme.honeyPrimary);
      // active 仍为 candy，静态 getter 不受 lightTheme 影响
      expect(AppTheme.primaryColor, ChildThemePalette.candy.pop);
      AppTheme.active = ChildThemePalette.honey;
    });
  });
}
