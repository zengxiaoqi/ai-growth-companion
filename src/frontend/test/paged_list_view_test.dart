import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lingxi_companion/components/app_card.dart';
import 'package:lingxi_companion/components/paged_list_view.dart';

/// 分页列表的行为验证：
///   - 本地分页：首屏只挂载第一页，滚动到底再放下一页；
///   - 服务端分页：滚到底触发 onLoadMore，父级追加数据后渲染新条目；
///   - 骨架占位：还有下一页时列表里出现骨架行（且是静态的，不跑动画）。

const double _itemHeight = 100;

Widget _item(int index) {
  return SizedBox(
    height: _itemHeight,
    child: Text('item-$index', key: ValueKey<String>('item-$index')),
  );
}

Widget _harness(Widget child) {
  return MaterialApp(
    home: Scaffold(body: child),
  );
}

/// 列表里当前已挂载的条目 index 集合。
Set<int> _mountedIndexes(WidgetTester tester) {
  final result = <int>{};
  for (final element in find.byType(Text).evaluate()) {
    final text = (element.widget as Text).data;
    if (text == null || !text.startsWith('item-')) continue;
    final index = int.tryParse(text.substring(5));
    if (index != null) result.add(index);
  }
  return result;
}

void main() {
  testWidgets('本地分页：首屏只挂第一页，滚到底才追加下一页', (tester) async {
    await tester.pumpWidget(
      _harness(
        PagedListView(
          itemCount: 100,
          pageSize: 6,
          itemBuilder: (context, index) => _item(index),
        ),
      ),
    );

    // 6 * 100 = 600 > 视口高度，不会触发自动填充，首屏就是第一页
    expect(_mountedIndexes(tester), <int>{0, 1, 2, 3, 4, 5});

    // 库里还有 94 条，但都没被挂载
    expect(find.byKey(const ValueKey<String>('item-6')), findsNothing);

    await tester.drag(find.byType(PagedListView), const Offset(0, -1200));
    await tester.pumpAndSettle();

    final mounted = _mountedIndexes(tester);
    expect(mounted.contains(6), isTrue, reason: '滚到底后应放出第二页');
    expect(mounted.reduce((a, b) => a > b ? a : b) < 12, isTrue,
        reason: '一次只多放一页，不能把 100 条全挂上');
  });

  testWidgets('服务端分页：滚到底回调 onLoadMore，父级追加后渲染新条目', (tester) async {
    var itemCount = 12;
    var loadMoreCalls = 0;
    late StateSetter setListState;

    await tester.pumpWidget(
      _harness(
        StatefulBuilder(
          builder: (context, setState) {
            setListState = setState;
            return PagedListView(
              itemCount: itemCount,
              hasMore: itemCount < 24,
              onLoadMore: () async {
                loadMoreCalls++;
                itemCount += 12;
                setListState(() {});
              },
              itemBuilder: (context, index) => _item(index),
            );
          },
        ),
      ),
    );

    expect(loadMoreCalls, 0);
    expect(find.byKey(const ValueKey<String>('item-12')), findsNothing);

    await tester.drag(find.byType(PagedListView), const Offset(0, -2000));
    await tester.pumpAndSettle();

    expect(loadMoreCalls, 1, reason: '滚到底只请求一次下一页');
    expect(find.byKey(const ValueKey<String>('item-12')), findsOneWidget);
  });

  testWidgets('还有下一页时底部有骨架行，且骨架不含动画', (tester) async {
    // 用一个永远不返回的 onLoadMore 模拟「下一页在路上」，
    // 让列表停在等数据的状态，此时底部应被骨架行占住。
    final pending = Completer<void>();

    await tester.pumpWidget(
      _harness(
        PagedListView(
          itemCount: 8,
          hasMore: true,
          skeletonCount: 3,
          onLoadMore: () => pending.future,
          itemBuilder: (context, index) => _item(index),
        ),
      ),
    );
    await tester.pump();

    expect(find.byType(PagedSkeletonTile), findsNothing,
        reason: '骨架在视口外，滚到底才需要');

    await tester.drag(find.byType(PagedListView), const Offset(0, -600));
    await tester.pump();

    final skeletons = find.byType(PagedSkeletonTile);
    expect(skeletons, findsWidgets);

    // 骨架刻意是静态色块：不含 shimmer 的 repeat 动画，等待期间不驱动帧
    expect(find.byType(ShimmerPlaceholder), findsNothing);
  });

  testWidgets('全部加载完后显示 endHint，头部跟随列表滚动', (tester) async {
    await tester.pumpWidget(
      _harness(
        PagedListView(
          header: const <Widget>[
            SizedBox(height: 80, child: Text('header')),
          ],
          itemCount: 4,
          pageSize: 8,
          endHint: const Text('已经到底啦'),
          itemBuilder: (context, index) => _item(index),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('header'), findsOneWidget);
    expect(find.text('已经到底啦'), findsOneWidget);
  });
}
