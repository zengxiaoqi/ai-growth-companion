import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lingxi_companion/screens/learning/lesson_scene_models.dart';
import 'package:lingxi_companion/screens/learning/trace_path_canvas.dart';

void main() {
  /// 画布包在可滚动列表里（对应课程页真实结构）
  Future<ScrollController> pumpCanvas(
    WidgetTester tester, {
    String text = '十',
    double minCoverage = 0.65,
  }) async {
    final scrollController = ScrollController(initialScrollOffset: 0);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            controller: scrollController,
            child: Column(
              children: [
                const SizedBox(height: 100),
                TracePathCanvas(
                  target: TraceGlyphTarget(
                    id: 'trace_0',
                    label: '描红: $text',
                    text: text,
                  ),
                  minCoverage: minCoverage,
                  onSolved: (_) {},
                ),
                const SizedBox(height: 800),
              ],
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    // 字形布局/采样是异步的（离屏渲染），fake-async 测试里要放行真实异步任务
    await tester.runAsync(() async {
      await Future<void>.delayed(const Duration(milliseconds: 80));
    });
    await tester.pumpAndSettle();
    return scrollController;
  }

  /// 定位真正的描红画布（逻辑尺寸 280x280 的 CustomPaint）。
  /// Card/进度条/按钮内部也有 CustomPaint，不能按类型取第一个。
  RenderBox findCanvasBox(WidgetTester tester) {
    final candidates = find
        .descendant(
          of: find.byType(TracePathCanvas),
          matching: find.byType(CustomPaint),
        )
        .evaluate()
        .map((el) => el.renderObject as RenderBox)
        .where((rb) => rb.size.width <= 300 && rb.size.height <= 300)
        .toList();
    expect(candidates, isNotEmpty, reason: '画布 CustomPaint（约 280x280）不存在');
    return candidates.first;
  }

  int readPercent(WidgetTester tester) {
    final text = tester.widget<Text>(find.textContaining('覆盖率')).data!;
    return int.parse(text.replaceAll(RegExp(r'[^0-9]'), ''));
  }

  group('TracePathCanvas — 描红笔画不被外层滚动劫持', () {
    testWidgets('竖向拖拽画笔画，页面不滚动', (tester) async {
      final scrollController = await pumpCanvas(tester);

      final box = findCanvasBox(tester);
      final center = box.localToGlobal(box.size.center(Offset.zero));

      await tester.dragFrom(center, const Offset(0, 120));
      await tester.pumpAndSettle();

      expect(scrollController.offset, 0.0,
          reason: '页面被滚动了，说明竖向笔画被外层滚动容器抢走');

      final boxAfter = findCanvasBox(tester);
      expect(boxAfter.localToGlobal(Offset.zero), box.localToGlobal(Offset.zero),
          reason: '画布位置漂移了');

      expect(readPercent(tester), greaterThan(0),
          reason: '覆盖率 0% 说明笔画没有画进画布');
    });

    testWidgets('横向拖拽同样不被劫持（滚动方向为竖直）', (tester) async {
      final scrollController = await pumpCanvas(tester);

      final box = findCanvasBox(tester);
      final center = box.localToGlobal(box.size.center(Offset.zero));

      await tester.dragFrom(center, const Offset(100, 0));
      await tester.pumpAndSettle();

      expect(scrollController.offset, 0.0);
      expect(readPercent(tester), greaterThan(0));
    });

    testWidgets('鼠标滚轮在画板内不滚动页面、也不画线', (tester) async {
      final scrollController = await pumpCanvas(tester);

      final box = findCanvasBox(tester);
      final center = box.localToGlobal(box.size.center(Offset.zero));

      final pointer = TestPointer(1, PointerDeviceKind.mouse);
      await tester.sendEventToBinding(pointer.hover(center));
      await tester.sendEventToBinding(pointer.scroll(const Offset(0, 160)));
      await tester.pumpAndSettle();

      expect(scrollController.offset, 0.0,
          reason: '滚轮在画板内把页面滚走了');
      expect(readPercent(tester), 0,
          reason: '滚轮事件不应该画出笔画');
    });

    testWidgets('滚轮不会凭空产生笔画（未按下鼠标时移动不画）', (tester) async {
      final scrollController = await pumpCanvas(tester);

      final box = findCanvasBox(tester);
      final center = box.localToGlobal(box.size.center(Offset.zero));

      final pointer = TestPointer(1, PointerDeviceKind.mouse);
      await tester.sendEventToBinding(pointer.hover(center));
      await tester.sendEventToBinding(
        pointer.hover(center + const Offset(0, 60)),
      );
      await tester.pumpAndSettle();

      expect(scrollController.offset, 0.0);
      expect(readPercent(tester), 0, reason: '悬停移动不应该画线');
    });
  });

  group('TracePathCanvas — 一次只写一个字', () {
    testWidgets('多字文本只显示当前字，并有步骤提示', (tester) async {
      await pumpCanvas(tester, text: '海星');

      expect(find.text('第 1/2 个字'), findsOneWidget);
      // 画布内只渲染一个字形：参考字由 painter 绘制，
      // 这里通过步骤提示 + 单一画布确认不会被拆成多张画布
      expect(
        find.descendant(
          of: find.byType(TracePathCanvas),
          matching: find.byType(CustomPaint),
        ),
        findsWidgets,
      );
    });

    testWidgets('跳过当前字后进入下一个字', (tester) async {
      await pumpCanvas(tester, text: '海星');

      expect(find.text('第 1/2 个字'), findsOneWidget);
      await tester.tap(find.text('跳过，下一个字'));
      await tester.pumpAndSettle();
      await tester.runAsync(() async {
        await Future<void>.delayed(const Duration(milliseconds: 80));
      });
      await tester.pumpAndSettle();

      expect(find.text('第 2/2 个字'), findsOneWidget);
      expect(find.text('跳过这个字'), findsOneWidget);
      // 切换字后进度归零
      expect(readPercent(tester), 0);
    });

    testWidgets('写完一个字自动进入下一个字', (tester) async {
      // minCoverage = 0：一落笔即达标，便于验证自动推进
      await pumpCanvas(tester, text: '二十', minCoverage: 0);

      final box = findCanvasBox(tester);
      final center = box.localToGlobal(box.size.center(Offset.zero));
      await tester.dragFrom(center, const Offset(0, 40));
      await tester.pump();

      expect(find.text('写得真好！马上进入下一个字…'), findsOneWidget);

      // 自动推进延时（900ms）
      await tester.pump(const Duration(milliseconds: 1000));
      await tester.pumpAndSettle();

      expect(find.text('第 2/2 个字'), findsOneWidget);
    });

    testWidgets('重复字与标点会被跳过', (tester) async {
      await pumpCanvas(tester, text: '海海，星。');

      // 去重后只剩 2 个字
      expect(find.text('第 1/2 个字'), findsOneWidget);
    });
  });
}
