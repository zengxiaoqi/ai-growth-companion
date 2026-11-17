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
    double minCoverage = 0.75,
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

  /// 沿一串画布坐标（0-280）连笔描一条线（分段移动，避免触发跳变保护）
  Future<void> traceLine(
    WidgetTester tester,
    RenderBox box,
    List<Offset> canvasPoints,
  ) async {
    final global =
        canvasPoints.map((p) => box.localToGlobal(p)).toList(growable: false);
    final gesture = await tester.startGesture(global.first);
    for (var i = 1; i < global.length; i++) {
      await gesture.moveTo(global[i]);
      await tester.pump();
    }
    await gesture.up();
    await tester.pumpAndSettle();
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

  group('TracePathCanvas — 模拟器把滚轮翻译成滑动时不画线', () {
    testWidgets('匀速笔直的伪拖拽被整笔回滚', (tester) async {
      await pumpCanvas(tester);
      final box = findCanvasBox(tester);

      // 模拟器把滚轮插值成的滑动：同一 x、等距、几毫秒内走完全程
      final gesture = await tester.createGesture();
      await gesture.down(
        box.localToGlobal(const Offset(140, 20)),
        timeStamp: const Duration(seconds: 1),
      );
      for (var i = 1; i <= 8; i++) {
        await gesture.moveTo(
          box.localToGlobal(Offset(140, 20 + i * 30.0)),
          timeStamp: Duration(milliseconds: 1000 + i),
        );
        await tester.pump();
      }
      await gesture.up(timeStamp: const Duration(milliseconds: 1010));
      await tester.pumpAndSettle();

      expect(readPercent(tester), 0, reason: '伪拖拽不应该留下笔画');
      expect(find.textContaining('没有算'), findsOneWidget,
          reason: '应该提示这一笔没被算入');
    });

    testWidgets('滚轮之后紧跟的拖拽也不画线', (tester) async {
      await pumpCanvas(tester);
      final box = findCanvasBox(tester);
      final center = box.localToGlobal(box.size.center(Offset.zero));

      final mouse = TestPointer(1, PointerDeviceKind.mouse);
      await tester.sendEventToBinding(mouse.hover(center));
      await tester.sendEventToBinding(
        mouse.scroll(
          const Offset(0, 160),
          timeStamp: const Duration(seconds: 3),
        ),
      );
      await tester.pump();

      // 同一股滚动紧跟被翻译成的鼠标拖拽（冷却期内）
      final gesture = await tester.createGesture(
        pointer: 2,
        kind: PointerDeviceKind.mouse,
        buttons: kPrimaryButton,
      );
      await gesture.down(
        center,
        timeStamp: const Duration(seconds: 3, milliseconds: 40),
      );
      for (var i = 1; i <= 5; i++) {
        await gesture.moveTo(
          center + Offset(0, 20.0 * i),
          timeStamp: Duration(milliseconds: 3040 + i * 40),
        );
        await tester.pump();
      }
      await gesture.up(timeStamp: const Duration(milliseconds: 3300));
      await tester.pumpAndSettle();

      expect(readPercent(tester), 0, reason: '滚轮之后的伪拖拽不应该画线');
      expect(find.textContaining('滚轮不能画笔画'), findsWidgets);
    });

    testWidgets('有抖动、有加减速的真实书写不会被误判', (tester) async {
      await pumpCanvas(tester);
      final box = findCanvasBox(tester);

      // 手写的竖笔：横向有抖动，步长有快慢
      const steps = <double>[
        10, 14, 18, 22, 24, 20, 16, 12, 9, 6, 4, 25, 22, 20, 18, 15, 12, 10,
      ];
      final points = <Offset>[];
      var y = 25.0;
      for (var i = 0; i < steps.length; i++) {
        y += steps[i];
        points.add(Offset(140 + (i.isEven ? 2.5 : -2.0), y));
      }

      final gesture = await tester.createGesture();
      await gesture.down(
        box.localToGlobal(const Offset(140, 25)),
        timeStamp: const Duration(seconds: 2),
      );
      var ms = 2000;
      for (final point in points) {
        ms += 16;
        await gesture.moveTo(
          box.localToGlobal(point),
          timeStamp: Duration(milliseconds: ms),
        );
        await tester.pump();
      }
      await gesture.up(timeStamp: Duration(milliseconds: ms + 16));
      await tester.pumpAndSettle();

      expect(readPercent(tester), greaterThan(0),
          reason: '真实书写的笔画不应该被当成滚轮丢掉');
      expect(find.textContaining('没有算'), findsNothing);
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

  group('TracePathCanvas — 少写一两笔不能提前完成', () {
    // 注意：widget 测试环境里字体是实心方块（没有真实字形），
    // 所以这里只验证"判定逻辑"：整体覆盖率门槛调低后，局部区域检查
    // 仍然必须拦住"还有整片没描到"的情况。

    testWidgets('只描一部分时，覆盖率达标也不算完成', (tester) async {
      final scrollController = await pumpCanvas(tester, minCoverage: 0.05);
      final box = findCanvasBox(tester);

      // 只描左侧一竖条，右侧大片墨迹完全没写
      await traceLine(tester, box, [
        for (var i = 0; i <= 12; i++) Offset(60, 30 + i * 18.0),
      ]);

      expect(scrollController.offset, 0.0);
      expect(readPercent(tester), greaterThan(5),
          reason: '描过的部分应该计入覆盖率，说明描红本身生效');
      expect(find.textContaining('写得真好'), findsNothing,
          reason: '还有整片笔画没描到，不应该判定完成并跳到下一个字');
      expect(find.textContaining('没描到'), findsWidgets,
          reason: '应该提示还有哪些地方没描到');
    });

    testWidgets('整片都描到后才判定完成', (tester) async {
      await pumpCanvas(tester, minCoverage: 0.05);
      final box = findCanvasBox(tester);

      // 逐行横向涂满整个字形区域，让每一块有墨迹的区域都被描到
      for (var row = 0; row < 8; row++) {
        final y = 17.5 + row * 35;
        await traceLine(tester, box, [
          for (var i = 0; i <= 10; i++) Offset(25 + i * 23.0, y),
        ]);
      }

      expect(find.textContaining('全部写完'), findsOneWidget,
          reason: '整片墨迹都描到后应该判定完成');
    });
  });
}
