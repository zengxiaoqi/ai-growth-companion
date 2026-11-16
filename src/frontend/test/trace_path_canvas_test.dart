import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lingxi_companion/screens/learning/lesson_scene_models.dart';
import 'package:lingxi_companion/screens/learning/trace_path_canvas.dart';

void main() {
  group('TracePathCanvas — 描红笔画不被外层滚动劫持', () {
    // 画布固定 280x280，包在可滚动的列表里（对应课程页真实结构）。
    // 竖向拖拽必须画进画布，而不是把页面滚走。
    Future<ScrollController> pumpCanvas(WidgetTester tester) async {
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
                      label: '描红: 十',
                      text: '十',
                    ),
                    minCoverage: 0.65,
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
      // 字形采样是异步的（离屏渲染），fake-async 测试里要放行真实异步任务
      await tester.runAsync(() async {
        await Future<void>.delayed(const Duration(milliseconds: 50));
      });
      await tester.pumpAndSettle();
      return scrollController;
    }

    /// 定位真正的描红画布（280x280 那个 CustomPaint）。
    /// 注意：Card/进度条/按钮内部也有 CustomPaint，不能按类型取第一个。
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
      expect(candidates, isNotEmpty,
          reason: '画布 CustomPaint（约 280x280）不存在');
      return candidates.first;
    }

    testWidgets('竖向拖拽画笔画，页面不滚动', (tester) async {
      final scrollController = await pumpCanvas(tester);

      final box = findCanvasBox(tester);
      final center = box.localToGlobal(box.size.center(Offset.zero));

      // 竖向拖拽一段竖线（远超滚动 slop）
      await tester.dragFrom(center, const Offset(0, 120));
      await tester.pumpAndSettle();

      // 页面不应滚动
      expect(scrollController.offset, 0.0,
          reason: '页面被滚动了，说明竖向笔画被外层滚动容器抢走');

      // 画布本身位置不变
      final boxAfter = findCanvasBox(tester);
      expect(
        boxAfter.localToGlobal(Offset.zero),
        box.localToGlobal(Offset.zero),
        reason: '画布位置漂移了',
      );

      // 有笔画落进画布：覆盖率应大于 0（画布中心在「十」的竖笔上）
      final coverageText =
          tester.widget<Text>(find.textContaining('覆盖率')).data!;
      final percent =
          int.parse(coverageText.replaceAll(RegExp(r'[^0-9]'), ''));
      expect(percent, greaterThan(0), reason: '覆盖率 0% 说明笔画没有画进画布');
    });

    testWidgets('横向拖拽同样不被劫持（滚动方向为竖直）', (tester) async {
      final scrollController = await pumpCanvas(tester);

      final box = findCanvasBox(tester);
      final center = box.localToGlobal(box.size.center(Offset.zero));

      await tester.dragFrom(center, const Offset(100, 0));
      await tester.pumpAndSettle();

      expect(scrollController.offset, 0.0);

      final coverageText =
          tester.widget<Text>(find.textContaining('覆盖率')).data!;
      final percent =
          int.parse(coverageText.replaceAll(RegExp(r'[^0-9]'), ''));
      expect(percent, greaterThan(0));
    });
  });
}
