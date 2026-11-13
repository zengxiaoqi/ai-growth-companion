import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lingxi_companion/screens/games/game_renderer.dart';
import 'package:lingxi_companion/screens/learning/widgets/hanzi_card.dart';
import 'package:lingxi_companion/screens/learning/widgets/lesson_section_renderer.dart';
import 'package:lingxi_companion/screens/learning/widgets/poem_card.dart';
import 'package:lingxi_companion/screens/learning/widgets/story_card.dart';

/// 直接读取仓库真实课程 JSON（不经过后端），验证 lesson_pack 按类型渲染：
/// 孩子看到的是字卡/诗歌/故事/插图/游戏，而不是原始 JSON 字符串。
List<Map<String, dynamic>> _sections(String relPath) {
  final raw = File('../content/$relPath').readAsStringSync();
  final json = jsonDecode(raw) as Map<String, dynamic>;
  final content = json['content'];
  return (content as List).whereType<Map<String, dynamic>>().toList();
}

Widget _wrap(Widget child) => MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(child: child),
      ),
    );

Future<void> _pump(WidgetTester tester, Widget child) async {
  await tester.pumpWidget(_wrap(child));
  await tester.pump(const Duration(milliseconds: 300));
  await tester.pump(const Duration(milliseconds: 300));
}

void _expectNoRawJson(WidgetTester tester) {
  expect(find.textContaining('{"'), findsNothing,
      reason: '原始 JSON 不允许上屏');
  expect(find.textContaining('strokes'), findsNothing);
}

void main() {
  testWidgets('汉字课渲染字卡+拼音，无原始 JSON', (tester) async {
    await _pump(tester, LessonSectionRenderer(sections: _sections('5-6-years/01-chinese-char.json')));
    _expectNoRawJson(tester);
    expect(find.byType(HanziCard), findsOneWidget);
    expect(find.text('日'), findsWidgets);
    expect(find.text('rì'), findsWidgets);
    expect(find.text('太阳'), findsWidgets);
  });

  testWidgets('数数课渲染故事+插图+点计数，无原始 JSON', (tester) async {
    await _pump(tester, LessonSectionRenderer(sections: _sections('3-4-years/02-counting.json')));
    _expectNoRawJson(tester);
    expect(find.byType(StoryCard), findsWidgets);
  });

  testWidgets('古诗课渲染诗歌卡，无原始 JSON', (tester) async {
    await _pump(tester, LessonSectionRenderer(sections: _sections('5-6-years/06-poetry.json')));
    _expectNoRawJson(tester);
    expect(find.byType(PoemCard), findsWidgets);
  });

  testWidgets('颜色课渲染分类游戏，无原始 JSON', (tester) async {
    await _pump(tester, LessonSectionRenderer(sections: _sections('3-4-years/01-colors.json')));
    _expectNoRawJson(tester);
    expect(find.byType(GameRenderer), findsWidgets);
  });

  testWidgets('找规律课渲染规律接龙游戏，无原始 JSON', (tester) async {
    await _pump(tester, LessonSectionRenderer(sections: _sections('5-6-years/10-pattern.json')));
    _expectNoRawJson(tester);
    expect(find.byType(GameRenderer), findsWidgets);
  });
}