import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../theme/child_theme.dart';

/// 「更多好玩」等二级页面的统一外壳。
///
/// 统一解决三件事：
/// 1. **必须有 Scaffold**——直接 push 的页面若没有 Material 祖先，`Text`
///    会退回 Flutter 的错误文本样式（黄色双下划线），知识问答 / 国旗配对
///    截图里满屏黄线就是这么来的；
/// 2. 背景统一成 `palette.paper + BubbleBackground`，不再各写一套蓝/绿渐变；
/// 3. 头部统一「圆形返回 + 大标题 + 副标题 + 右侧贴纸图标」，与成就页一致。
class ChildFunPage extends StatelessWidget {
  const ChildFunPage({
    super.key,
    required this.title,
    required this.child,
    this.subtitle,
    this.icon,
    this.accent,
    this.onBack,
    this.actions = const <Widget>[],
    this.scrollable = true,
    this.padding = const EdgeInsets.fromLTRB(20, 0, 20, 28),
    this.footer,
    this.floatingActionButton,
    this.resizeToAvoidBottomInset = true,
  });

  /// 页面大标题。
  final String title;

  /// 一句话说明，放在标题下方。
  final String? subtitle;

  /// 右上角贴纸图标（Material 图标，不用 emoji：MuMu / 老安卓缺字形会渲染成方框）。
  final IconData? icon;

  /// 强调色，默认跟随皮肤 `palette.pop`。
  final Color? accent;

  /// 返回按钮回调；缺省时走 `Navigator.maybePop`。
  final VoidCallback? onBack;

  /// 标题右侧额外动作。
  final List<Widget> actions;

  /// 页面内容。
  final Widget child;

  /// 内容是否可滚动。列表页/需要自己控制滚动的页面传 false。
  final bool scrollable;

  final EdgeInsetsGeometry padding;

  /// 固定在底部的操作区（如「开始答题」）。
  final Widget? footer;

  /// 右下角悬浮按钮（如「诗词游戏」入口）。
  final Widget? floatingActionButton;

  final bool resizeToAvoidBottomInset;

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);

    return Scaffold(
      backgroundColor: palette.paper,
      resizeToAvoidBottomInset: resizeToAvoidBottomInset,
      floatingActionButton: floatingActionButton,
      body: BubbleBackground(
        child: SafeArea(
          child: Column(
            children: <Widget>[
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                child: _buildHeader(context, palette),
              ),
              const SizedBox(height: 14),
              Expanded(
                child: scrollable
                    ? SingleChildScrollView(
                        padding: padding,
                        physics: const BouncingScrollPhysics(),
                        child: child,
                      )
                    : Padding(padding: padding, child: child),
              ),
              if (footer != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                  child: footer,
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context, ChildThemePalette palette) {
    final tint = accent ?? palette.pop;

    return Row(
      children: <Widget>[
        GestureDetector(
          onTap: onBack ?? () => Navigator.of(context).maybePop(),
          child: Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: palette.card,
              shape: BoxShape.circle,
              border: palette.isCartoon
                  ? Border.all(color: palette.line, width: 2)
                  : null,
            ),
            child: Icon(Icons.arrow_back_rounded, size: 22, color: palette.ink),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 24,
                  height: 1.15,
                  fontWeight: FontWeight.w800,
                  color: palette.ink,
                ),
              ),
              if (subtitle != null && subtitle!.isNotEmpty) ...<Widget>[
                const SizedBox(height: 3),
                Text(
                  subtitle!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 13, color: palette.ink2),
                ),
              ],
            ],
          ),
        ),
        ...actions,
        if (icon != null) ...<Widget>[
          const SizedBox(width: 8),
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: Color.alphaBlend(tint.withValues(alpha: 0.16), palette.card),
              shape: BoxShape.circle,
              border: palette.isCartoon
                  ? Border.all(color: tint.withValues(alpha: 0.55), width: 2)
                  : null,
            ),
            child: Icon(icon, size: 22, color: tint),
          ),
        ],
      ],
    );
  }
}

/// 二级页头部的圆形图标按钮（刷新 / 搜索等），与返回按钮同一套造型。
class ChildFunIconButton extends StatelessWidget {
  const ChildFunIconButton({
    super.key,
    required this.icon,
    required this.onPressed,
    this.tooltip,
  });

  final IconData icon;
  final VoidCallback onPressed;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    final button = GestureDetector(
      onTap: onPressed,
      child: Container(
        width: 42,
        height: 42,
        decoration: BoxDecoration(
          color: palette.card,
          shape: BoxShape.circle,
          border: palette.isCartoon
              ? Border.all(color: palette.line, width: 2)
              : null,
        ),
        child: Icon(icon, size: 20, color: palette.ink),
      ),
    );
    if (tooltip == null) return button;
    return Tooltip(message: tooltip!, child: button);
  }
}

/// 二级页顶部的「主视觉」贴纸：大图标 + 一行说明 + 若干信息小块。
///
/// 用主色渐变（cta → pop），四套皮肤自动换色，不再各页写死蓝/绿。
class ChildFunHero extends StatelessWidget {
  const ChildFunHero({
    super.key,
    required this.icon,
    required this.title,
    this.meta = const <String>[],
    this.trailing,
  });

  final IconData icon;
  final String title;

  /// 底部一行小信息，例如「10 道题」「约 3 分钟」。
  final List<String> meta;

  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);

    return Container(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: <Color>[palette.cta, palette.pop],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(palette.radiusLg),
        border: palette.isCartoon
            ? Border.all(color: palette.line, width: palette.borderW)
            : null,
        boxShadow: palette.isCartoon
            ? <BoxShadow>[
                BoxShadow(
                  color: palette.line,
                  offset: const Offset(0, 5),
                  blurRadius: 0,
                ),
              ]
            : <BoxShadow>[
                BoxShadow(
                  color: palette.pop.withValues(alpha: 0.22),
                  offset: const Offset(0, 8),
                  blurRadius: 18,
                ),
              ],
      ),
      child: Row(
        children: <Widget>[
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: palette.ctaInk.withValues(alpha: 0.16),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 28, color: palette.ctaInk),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Text(
                  title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 16,
                    height: 1.3,
                    fontWeight: FontWeight.w800,
                    color: palette.ctaInk,
                  ),
                ),
                if (meta.isNotEmpty) ...<Widget>[
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: meta
                        .map(
                          (m) => Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: palette.ctaInk.withValues(alpha: 0.14),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              m,
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: palette.ctaInk,
                              ),
                            ),
                          ),
                        )
                        .toList(),
                  ),
                ],
              ],
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}
