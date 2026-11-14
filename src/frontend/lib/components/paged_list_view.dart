// 分页列表：长列表按页「挂载」，滚到底再翻下一页，没到位的行用骨架占位。
//
// 为什么要它：
//   学习页 / 学科课程页 / 作业管理页原本都用 `ListView(children: [...全部卡片])`
//   一次性构造整份列表。课程或作业一多（几十上百条），debug 包要在主线程连续
//   inflate 一大棵子树，首帧几秒、滑动掉帧（之前模拟器 ANR 的放大器之一）。
//   这里只做两件事：
//     1. 只构造当前页范围内的条目，已挂载的保留不重建；
//     2. 下一页没到之前用**静态**骨架行占位（不跑动画，避免再引入常驻出帧）。
//
// 两种分页模式：
//   - 本地分页：数据一次给全（例如接口一次返回的作业列表），只传 itemCount；
//   - 服务端分页：多传 hasMore + onLoadMore，滚到底自动请求下一页。
//
// 用法：
// ```dart
// PagedListView(
//   header: [<标题、筛选条等不参与分页的头部>],
//   itemCount: items.length,
//   pageSize: 8,
//   itemBuilder: (context, i) => CourseTile(items[i]),
//   skeletonBuilder: (_) => const PagedSkeletonTile(),
// )
// ```

import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollCacheExtent;

import '../theme/child_theme.dart';

/// 分页 + 骨架渲染的列表。
class PagedListView extends StatefulWidget {
  const PagedListView({
    super.key,
    required this.itemCount,
    required this.itemBuilder,
    this.header = const <Widget>[],
    this.pageSize = 8,
    this.skeletonBuilder,
    this.skeletonCount = 3,
    this.hasMore = false,
    this.onLoadMore,
    this.padding = EdgeInsets.zero,
    this.physics,
    this.cacheExtent = 420,
    this.endHint,
  })  : assert(pageSize > 0, 'pageSize 必须大于 0'),
        assert(skeletonCount >= 0, 'skeletonCount 不能为负');

  /// 条目总数（服务端分页时为「已加载条目数」）。
  final int itemCount;

  /// 条目构建器，只会对当前已挂载的索引调用。
  final Widget Function(BuildContext context, int index) itemBuilder;

  /// 列表头部（标题、筛选条…），不参与分页，随列表一起滚动。
  final List<Widget> header;

  /// 本地分页每页条目数；服务端分页时无意义（由接口 limit 决定）。
  final int pageSize;

  /// 骨架行构建器，默认 [PagedSkeletonTile]。
  final WidgetBuilder? skeletonBuilder;

  /// 一页骨架行数量。
  final int skeletonCount;

  /// 服务端是否还有下一页。
  final bool hasMore;

  /// 拉取下一页；返回后由父级更新 [itemCount] / [hasMore]。
  final Future<void> Function()? onLoadMore;

  final EdgeInsetsGeometry padding;
  final ScrollPhysics? physics;

  /// 视口外预渲染范围（逻辑像素）；条目重的页面不要调太大。
  final double cacheExtent;

  /// 全部加载完后列表底部的提示（如「已经到底啦」），不传则不显示。
  final Widget? endHint;

  @override
  State<PagedListView> createState() => _PagedListViewState();
}

class _PagedListViewState extends State<PagedListView> {
  final ScrollController _scrollController = ScrollController();

  /// 本地分页的可见条数上限。
  int _visible = 0;
  bool _loadingMore = false;
  bool _stalled = false;
  bool _autoFillScheduled = false;

  bool get _remotePaged => widget.onLoadMore != null;

  /// 当前已挂载的条目数。
  int get _loaded {
    if (widget.itemCount <= 0) return 0;
    if (_remotePaged) return widget.itemCount;
    return math.min(_visible, widget.itemCount);
  }

  /// 是否还有可翻的页。
  bool get _canLoadMore {
    if (_stalled) return false;
    if (_remotePaged) return widget.hasMore;
    return _loaded < widget.itemCount;
  }

  @override
  void initState() {
    super.initState();
    _visible = widget.pageSize;
    _scrollController.addListener(_handleScroll);
    _scheduleAutoFill();
  }

  @override
  void didUpdateWidget(covariant PagedListView oldWidget) {
    super.didUpdateWidget(oldWidget);

    if (widget.itemCount != oldWidget.itemCount) {
      // 换了一批数据（刷新 / 切换孩子）：允许重新自动填充
      _stalled = false;
      // 条目变少说明是第一页重来，页码也回到第一页
      if (widget.itemCount < oldWidget.itemCount) {
        _visible = widget.pageSize;
      }
    }
    _scheduleAutoFill();
  }

  @override
  void dispose() {
    _scrollController.removeListener(_handleScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _handleScroll() {
    if (!_scrollController.hasClients) return;
    final position = _scrollController.position;
    if (position.pixels >= position.maxScrollExtent - 360) {
      _loadNextPage();
    }
  }

  Future<void> _loadNextPage() async {
    if (_loadingMore || !mounted) return;

    final remote = _remotePaged && widget.hasMore && !_stalled;
    final local = !_remotePaged && _loaded < widget.itemCount;
    if (!remote && !local) return;

    // 本地分页：直接把下一页露出来即可，无需请求
    if (!remote) {
      setState(() {
        _visible = math.min(widget.itemCount, _visible + widget.pageSize);
      });
      _scheduleAutoFill();
      return;
    }

    final before = widget.itemCount;
    setState(() => _loadingMore = true);
    try {
      await widget.onLoadMore!();
    } catch (_) {
      // 父级自己会展示错误态，这里只保证不卡在 loading
    }
    if (!mounted) return;
    setState(() => _loadingMore = false);

    if (widget.itemCount <= before && widget.hasMore) {
      // 服务端返回空页却仍声称有更多：停止自动翻页，避免死循环
      _stalled = true;
    }
    _scheduleAutoFill();
  }

  /// 内容不足一屏时自动往下翻，直到能滚动或没有更多。
  void _scheduleAutoFill() {
    if (_autoFillScheduled) return;
    _autoFillScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _autoFillScheduled = false;
      if (!mounted || _loadingMore || !_canLoadMore) return;
      if (!_scrollController.hasClients) return;
      if (_scrollController.position.maxScrollExtent > 16) return;
      _loadNextPage();
    });
  }

  @override
  Widget build(BuildContext context) {
    final loaded = _loaded;
    final skeletonRows = (_loadingMore || _canLoadMore) ? widget.skeletonCount : 0;
    final showEndHint = widget.endHint != null &&
        loaded > 0 &&
        !_loadingMore &&
        !_canLoadMore;

    final headerCount = widget.header.length;

    return ListView.builder(
      controller: _scrollController,
      padding: widget.padding,
      physics: widget.physics,
      scrollCacheExtent: ScrollCacheExtent.pixels(widget.cacheExtent),
      itemCount: headerCount + loaded + skeletonRows + (showEndHint ? 1 : 0),
      itemBuilder: (context, index) {
        if (index < headerCount) return widget.header[index];

        final itemIndex = index - headerCount;
        if (itemIndex < loaded) {
          return widget.itemBuilder(context, itemIndex);
        }

        final skeletonIndex = itemIndex - loaded;
        if (skeletonIndex < skeletonRows) {
          return widget.skeletonBuilder?.call(context) ??
              const PagedSkeletonTile();
        }

        return widget.endHint!;
      },
    );
  }
}

/// 静态骨架行：图标块 + 两行文本条。
///
/// 刻意不用 `ShimmerPlaceholder`：它的高光是 `repeat()` 动画，而骨架行常在列表
/// 底部常驻等待下一页，会让 App 在没有用户操作时继续按帧出图 —— 这正是之前
/// 模拟器 ANR 的成因之一。这里用纯静态色块，等待期间零动画开销。
class PagedSkeletonTile extends StatelessWidget {
  const PagedSkeletonTile({
    super.key,
    this.height = 96,
    this.leadingSize = 44,
    this.margin = const EdgeInsets.only(bottom: 12),
    this.radius = 16,
  });

  final double height;
  final double leadingSize;
  final EdgeInsetsGeometry margin;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    // 骨架色跟着皮肤走：浅色皮肤≈浅灰，深色皮肤≈略亮的紫灰
    final base = Color.alphaBlend(palette.ink2.withValues(alpha: 0.10), palette.card);
    final strong = Color.alphaBlend(palette.ink2.withValues(alpha: 0.17), palette.card);
    final surface = Color.alphaBlend(palette.ink2.withValues(alpha: 0.04), palette.card);

    Widget bar(Color color, double barHeight, double widthFactor) {
      return FractionallySizedBox(
        alignment: Alignment.centerLeft,
        widthFactor: widthFactor,
        child: Container(
          height: barHeight,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(barHeight / 2),
          ),
        ),
      );
    }

    return Padding(
      padding: margin,
      child: Container(
        height: height,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: surface,
          borderRadius: BorderRadius.circular(radius),
          border: Border.all(color: base.withValues(alpha: 0.55), width: 1),
        ),
        child: Row(
          children: <Widget>[
            Container(
              width: leadingSize,
              height: leadingSize,
              decoration: BoxDecoration(
                color: base,
                borderRadius: BorderRadius.circular(leadingSize * 0.3),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  bar(strong, 13, 0.62),
                  const SizedBox(height: 10),
                  bar(base, 10, 0.88),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
