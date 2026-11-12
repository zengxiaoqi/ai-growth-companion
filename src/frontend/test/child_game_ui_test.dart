import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lingxi_companion/components/child_game_ui.dart';
import 'package:lingxi_companion/services/child_game_voice.dart';

void main() {
  group('childVisual — 纯文字的题目数据也必须图形化', () {
    test('icon 优先，并去掉首尾空白', () {
      final visual = childVisual(icon: '  🐱  ', label: '小猫', shape: 'circle');
      expect(visual.glyph, '🐱');
      expect(visual.isTextGlyph, isFalse);
    });

    test('shape 映射成表情，不落到文字', () {
      expect(childVisual(label: '任意', shape: 'star').glyph, '⭐');
      expect(childVisual(label: '任意', shape: 'cloud').glyph, '☁️');
    });

    test('中文关键词兜底（内容工厂生成的纯文案也能出图）', () {
      expect(childVisual(label: '春天的花朵').glyph, '🌸');
      expect(childVisual(label: '红色').glyph, '🔴');
      // 具体物体优先于泛化颜色词：🍎 比 🔴 更有画面感。
      expect(childVisual(label: '红色的苹果').glyph, '🍎');
    });

    test('完全无提示时仍给出图形，且同一 label 结果稳定', () {
      final a = childVisual(label: '抽象概念甲');
      final b = childVisual(label: '抽象概念甲');
      expect(a.glyph, b.glyph);
      expect(a.glyph, isNot('抽象概念甲'));
      expect(a.glyph.runes.isNotEmpty, isTrue);
    });

    test('不同 label 会分散到多个图形，避免满屏同一个表情', () {
      final glyphs = <String>{};
      for (var i = 0; i < 24; i++) {
        glyphs.add(childVisual(label: '未知项目编号$i').glyph);
      }
      expect(glyphs.length, greaterThan(1));
    });
  });

  group('safeChildGlyph — 老 Android / MuMu emoji 字体兼容', () {
    test('实测缺字的图形按语义替换', () {
      expect(safeChildGlyph('🪷'), '🌸'); // 荷花
      expect(safeChildGlyph('🧺'), '🏠'); // 篮子 / 送回家
      expect(safeChildGlyph('☃️'), '⛄'); // 黑白文字雪人
      expect(safeChildGlyph('🃏'), '🎲');
    });

    test('已验证可用的老 emoji 与带变体选择符的组合原样保留', () {
      expect(safeChildGlyph('🐱'), '🐱');
      expect(safeChildGlyph('🌸'), '🌸');
      expect(safeChildGlyph('🎉'), '🎉');
      expect(safeChildGlyph('❄️'), '❄️');
      expect(safeChildGlyph('1️⃣'), '1️⃣');
    });

    test('内容工厂生成未知的新 emoji 时兜底成可用图形，且结果稳定', () {
      const unknown = '🫧'; // Unicode 14，老字体一定没有
      final a = safeChildGlyph(unknown);
      expect(a, safeChildGlyph(unknown));
      expect(a, isNot(unknown));
      expect(a.runes.isNotEmpty, isTrue);
      expect(safeChildGlyph(''), '');
    });

    testWidgets('卡片渲染时不会出现豆腐块图形', (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: Center(
            child: ChildVisualTile(
              visual: childVisual(icon: '🪷', label: '荷花'),
              label: '荷花',
            ),
          ),
        ),
      ));
      await tester.pumpAndSettle();

      expect(find.text('🌸'), findsOneWidget);
      expect(find.text('🪷'), findsNothing);
    });

    testWidgets('描红字形是汉字，不能被兼容映射改写', (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: Center(
            child: ChildVisualTile(
              visual: const ChildVisual('火', isTextGlyph: true),
              label: '火',
            ),
          ),
        ),
      ));
      await tester.pumpAndSettle();

      expect(find.text('火'), findsNWidgets(2), reason: '大字形 + 小标签');
    });
  });

  group('childSpeechText — 播报不读表情符号', () {
    test('剥掉 emoji，保留中文指令', () {
      expect(childSpeechText('🎉 太棒啦，放对了！ ⭐'), '太棒啦，放对了！');
      expect(childSpeechText('  🧺 把小卡片送回家  '), '把小卡片送回家');
    });
  });

  group('ChildGameVoice — 语音失败时不能把孩子卡住', () {
    test('播报期间 speaking=true，结束后归零，且文本已 trim', () async {
      final gate = Completer<void>();
      final spoken = <String>[];
      final voice = ChildGameVoice(speakHandler: (text) async {
        spoken.add(text);
        await gate.future;
      });

      final pending = voice.speak('  把小猫送回家  ');
      expect(spoken, ['把小猫送回家']);
      expect(voice.speaking, isTrue);

      gate.complete();
      await pending;
      expect(voice.speaking, isFalse);

      voice.dispose();
    });

    test('播报抛错时静默降级：不抛异常、立即解锁', () async {
      final voice = ChildGameVoice(
        speakHandler: (_) async => throw Exception('no network'),
      );

      await expectLater(voice.speak('请点一点小鸟'), completes);
      expect(voice.speaking, isFalse);
      expect(voice.enabled, isTrue, reason: '降级不等于关掉语音开关');

      voice.dispose();
    });

    test('静音时不发起播报，重新开启后可用', () async {
      var calls = 0;
      final voice = ChildGameVoice(
        enabled: false,
        speakHandler: (_) async {
          calls++;
        },
      );

      await voice.speak('请涂成红色');
      expect(calls, 0);
      expect(voice.speaking, isFalse, reason: '静音时点击不能被锁定');

      voice.toggle();
      expect(voice.enabled, isTrue);
      await voice.speak('请涂成红色');
      expect(calls, 1);

      voice.dispose();
    });

    test('新播报会取消旧播报的等待（generation 不串台）', () async {
      final firstGate = Completer<void>();
      final secondGate = Completer<void>();
      var call = 0;
      final voice = ChildGameVoice(speakHandler: (_) async {
        call++;
        await (call == 1 ? firstGate.future : secondGate.future);
      });

      final first = voice.speak('第一轮指令');
      final second = voice.speak('第二轮指令');
      expect(voice.speaking, isTrue);

      firstGate.complete();
      await first;
      expect(voice.speaking, isTrue, reason: '旧播报结束不能清掉新播报的锁定');

      secondGate.complete();
      await second;
      expect(voice.speaking, isFalse);

      voice.dispose();
    });

    test('stop() 立即解锁且不会留下陈旧回调', () async {
      final gate = Completer<void>();
      final voice = ChildGameVoice(speakHandler: (_) async => gate.future);

      final pending = voice.speak('等待播报');
      expect(voice.speaking, isTrue);

      voice.stop();
      expect(voice.speaking, isFalse);

      gate.complete();
      await pending;
      expect(voice.speaking, isFalse);

      voice.dispose();
    });
  });

  group('ChildVisualTile — 大触摸区与图形优先', () {
    testWidgets('默认尺寸足够大，点击能触发回调，图形和文字同时可见',
        (tester) async {
      var taps = 0;
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: Center(
            child: ChildVisualTile(
              visual: const ChildVisual('🐱'),
              label: '小猫',
              semanticLabel: '选择卡片 小猫',
              onTap: () => taps++,
            ),
          ),
        ),
      ));
      await tester.pumpAndSettle();

      final size = tester.getSize(find.byType(ChildVisualTile));
      expect(size.width, greaterThanOrEqualTo(88));
      expect(size.height, greaterThanOrEqualTo(88));
      expect(find.text('🐱'), findsOneWidget);
      expect(find.text('小猫'), findsOneWidget);

      await tester.tap(find.byType(ChildVisualTile));
      await tester.pump();
      expect(taps, 1);
    });

    testWidgets('六种状态都能渲染（含播报锁定时的 dimmed）', (tester) async {
      for (final state in ChildTileState.values) {
        await tester.pumpWidget(MaterialApp(
          home: Scaffold(
            body: Center(
              child: ChildVisualTile(
                visual: const ChildVisual('🌸'),
                label: '花朵',
                state: state,
              ),
            ),
          ),
        ));
        await tester.pump();
        expect(find.text('🌸'), findsOneWidget, reason: '$state 时图形仍应可见');
        expect(tester.takeException(), isNull);
      }
    });
  });

  group('ChildGameShell — 指令常显、重听与静音', () {
    testWidgets('静音时指令文本仍常显，开启语音后重听能播报', (tester) async {
      const prompt = '请点一点小鸟和花朵';
      final spoken = <String>[];
      final voice = ChildGameVoice(
        enabled: false,
        speakHandler: (text) async {
          spoken.add(text);
        },
      );

      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: ChildGameShell(
              title: '听指令点一点',
              mascot: '👂',
              prompt: prompt,
              replayText: prompt,
              stepLabel: '第 1 / 2 轮',
              current: 1,
              total: 2,
              voice: voice,
              child: const SizedBox(height: 40),
            ),
          ),
        ),
      ));
      await tester.pumpAndSettle();

      // 语音不是答题门槛：即使静音，指令也完整显示。
      expect(find.text(prompt), findsOneWidget);
      expect(find.text('1 / 2'), findsOneWidget);
      expect(find.byIcon(Icons.volume_off_rounded), findsNWidgets(2));

      await tester.tap(find.bySemanticsLabel('开启语音'));
      await tester.pump();
      expect(voice.enabled, isTrue);

      await tester.tap(find.bySemanticsLabel('再听一遍指令'));
      await tester.pump();
      expect(spoken, [prompt]);

      voice.dispose();
    });

    testWidgets('答对反馈横幅显示鼓励语与星星庆祝', (tester) async {
      final voice = ChildGameVoice(speakHandler: (_) async {});
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: ChildGameShell(
              title: '分类小游戏',
              prompt: '把卡片送回家',
              replayText: '把卡片送回家',
              current: 2,
              total: 4,
              voice: voice,
              feedback: const ChildFeedback.cheer('放对啦！'),
              cheerKey: 1,
              child: const SizedBox(height: 40),
            ),
          ),
        ),
      ));
      await tester.pumpAndSettle();

      expect(find.text('放对啦！'), findsOneWidget);
      expect(find.text('🎉'), findsOneWidget);
      expect(find.text('2 / 4'), findsOneWidget);

      voice.dispose();
    });
  });
}
