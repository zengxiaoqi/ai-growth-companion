import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lingxi_companion/screens/games/connection_game.dart';

/// 海洋动物连线题的真实数据结构（右侧描述很长，是历史上撑爆布局的元凶）。
Map<String, dynamic> _data() => {
      'title': '海洋动物 连线练习',
      'leftItems': [
        {'id': 'l1', 'label': '蓝鲸'},
        {'id': 'l2', 'label': '章鱼'},
        {'id': 'l3', 'label': '海豚'},
        {'id': 'l4', 'label': '海龟'},
      ],
      'rightItems': [
        {'id': 'r1', 'label': '海龟妈妈爬上岸，在沙坑里产卵'},
        {'id': 'r2', 'label': '蓝鲸是地球上最大的动物，比十头大象还重'},
        {'id': 'r3', 'label': '章鱼有八条腕足，遇到危险会喷墨逃跑'},
        {'id': 'r4', 'label': '海豚用头顶的鼻孔呼吸，要浮出水面换气'},
      ],
      'connections': [
        {'left': 'l1', 'right': 'r2'},
        {'left': 'l2', 'right': 'r3'},
        {'left': 'l3', 'right': 'r4'},
        {'left': 'l4', 'right': 'r1'},
      ],
    };

Widget _host({required double height, double width = 390}) => MaterialApp(
      home: Scaffold(
        body: Center(
          child: SizedBox(
            width: width,
            height: height,
            child: ConnectionGame(data: _data(), onExit: () {}),
          ),
        ),
      ),
    );

Future<void> _pumpAt(
  WidgetTester tester, {
  required double height,
  double width = 390,
}) async {
  tester.view.physicalSize = Size(width * 3, (height + 80) * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(_host(height: height, width: width));
  await tester.pump(const Duration(milliseconds: 300));
  await tester.pump(const Duration(milliseconds: 300));
}

void main() {
  group('连线题布局不再溢出', () {
    for (final height in [280.0, 360.0, 430.0, 620.0]) {
      testWidgets('高度 ${height.toInt()} 时长描述卡片不溢出', (tester) async {
        await _pumpAt(tester, height: height);
        expect(tester.takeException(), isNull);
        // 高度紧张时会隐藏与页面标题重复的题目标题。
        expect(
          find.text('海洋动物 连线练习'),
          height >= 330 ? findsWidgets : findsNothing,
        );
        expect(find.text('先连好一条线'), findsOneWidget);
      });
    }

    testWidgets('窄屏 320 宽也不溢出', (tester) async {
      await _pumpAt(tester, height: 430, width: 320);
      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('点左边再点右边可以建立连线并提交', (tester) async {
    await _pumpAt(tester, height: 620);

    await tester.tap(find.text('蓝鲸'));
    await tester.pumpAndSettle();
    expect(find.text('提交连线'), findsNothing);

    await tester.tap(find.text('蓝鲸是地球上最大的动物，比十头大象还重'));
    await tester.pumpAndSettle();

    // 连上一条线后提交按钮变为可用。
    expect(find.text('提交连线'), findsOneWidget);

    await tester.tap(find.text('提交连线'));
    await tester.pumpAndSettle();
    expect(find.text('查看结果'), findsOneWidget);
    expect(find.textContaining('连对'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('紧凑高度下隐藏重复的题目标题', (tester) async {
    await _pumpAt(tester, height: 280);
    expect(find.text('海洋动物 连线练习'), findsNothing);
  });
}
