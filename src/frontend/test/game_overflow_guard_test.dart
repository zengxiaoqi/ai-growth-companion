import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:lingxi_companion/screens/games/game_renderer.dart';
import 'package:lingxi_companion/services/api_service.dart';

/// 回归测试：课程「练」步骤把游戏放进固定高度的 Expanded 里，
 /// 固定布局的题型（quiz 等）内容超高时不能溢出（黄黑条纹 BOTTOM OVERFLOWED）。
void main() {
  Widget buildHarness({required double height}) {
    final quizData = <String, dynamic>{
      'type': 'quiz',
      'title': '认识颜色 测评',
      'questions': [
        for (var i = 0; i < 3; i++)
          {
            'question': '第${i + 1}题：今天学习认识颜色后，你记住了什么？',
            'options': ['一个关键词', '一个故事', '一个游戏', '一首儿歌'],
            'correctIndex': 0,
          },
      ],
    };
    return MaterialApp(
      home: Scaffold(
        body: Provider<ApiService>.value(
          value: ApiService(),
          child: SizedBox(
            // 故意压低高度，模拟小屏课程步骤里内容超过一屏的场景。
            height: height,
            child: GameRenderer(
              activityType: 'quiz',
              initialData: quizData,
              onExit: () {},
            ),
          ),
        ),
      ),
    );
  }

  testWidgets('quiz 在小高度容器里不抛出 overflow 异常', (tester) async {
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(buildHarness(height: 380));
    await tester.pumpAndSettle();

    final errors = tester.takeException();
    expect(errors, isNull,
        reason: '固定高度 + 超长题目内容不应溢出（Flutter 会画黄黑条纹）');
  });
}
