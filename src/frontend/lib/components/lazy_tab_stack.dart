import 'package:flutter/material.dart';

/// 懒加载 + 帧调度隔离的 Tab 容器。
///
/// 为什么不用裸 [IndexedStack]：
/// - 裸 IndexedStack 会把**所有** tab 一次性 build 出来。孩子端主壳的四个 tab
///   里有 3 个重页面（学习 / AI 对话 / 我的），启动瞬间就要建完整棵树，冷启动
///   在模拟器和低端机上会直接卡住首帧。
/// - 更严重的是 IndexedStack **不会**停掉隐藏 tab 的 Ticker：隐藏页里的
///   `CircularProgressIndicator`、`AnimationController.repeat()` 会继续每秒
///   驱动 60 帧，整个 App 永远不空闲 —— 实测会让主线程被帧调度占满，点一下
///   25s 无响应直接 ANR。
///
/// 这里做两件事：
/// 1. 懒建：[index] 指向的 tab（以及历史访问过的 tab）才真正 build，其余先
///    占位 `SizedBox.shrink()`。首次访问后才进入 widget 列表，之后一直保留，
///    滚动位置与已加载数据不会丢。
/// 2. 隔离：[TickerMode] 只对当前 tab 打开。隐藏 tab 的动画/ticker 全部暂停，
///    App 空闲时不再空转出帧。
class LazyTabStack extends StatefulWidget {
  const LazyTabStack({
    super.key,
    required this.index,
    required this.children,
  });

  /// 当前显示的 tab 下标。
  final int index;

  /// 全部 tab 的内容，顺序与底部导航一致（必须是常驻同一个 widget 实例，
  /// 否则每次 build 重新创建会丢 State）。
  final List<Widget> children;

  @override
  State<LazyTabStack> createState() => _LazyTabStackState();
}

class _LazyTabStackState extends State<LazyTabStack> {
  /// 已经 build 过的 tab 下标；构建后永久保留，保证 State 不丢。
  final Set<int> _built = <int>{};

  @override
  void initState() {
    super.initState();
    _built.add(widget.index);
  }

  @override
  void didUpdateWidget(LazyTabStack oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.index != widget.index) {
      _built.add(widget.index);
    }
  }

  @override
  Widget build(BuildContext context) {
    return IndexedStack(
      index: widget.index,
      children: <Widget>[
        for (var i = 0; i < widget.children.length; i++)
          TickerMode(
            enabled: i == widget.index,
            child: _built.contains(i)
                ? widget.children[i]
                : const SizedBox.shrink(),
          ),
      ],
    );
  }
}
