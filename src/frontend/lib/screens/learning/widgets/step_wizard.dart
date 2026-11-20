import 'package:flutter/material.dart';

import '../../../theme/app_theme.dart';
import '../../../theme/child_theme.dart';

/// 向导中的一页：一次只给孩子看一个任务。
///
/// [done] 决定「下一步」是否点亮——只有孩子完成当前页的互动后才翻页。
class WizardPage {
  /// 页眉小标签，例如「第 1 句 / 共 3 句」「问题 2 / 3」。
  final String? label;
  final Widget content;
  final bool done;

  const WizardPage({
    this.label,
    required this.content,
    required this.done,
  });
}

/// 翻页式分步向导。
///
/// 一次只显示一页，完成当前页的互动后「下一步」才亮起；可以返回上一页。
/// 最后一页完成后调用 [onAllDone]，由外部记录步骤完成并进入下一课程步骤。
///
/// 不使用手势滑动直接翻页（避免孩子误触跳过任务），只通过底部按钮推进。
class StepWizard extends StatefulWidget {
  final List<WizardPage> pages;

  /// 全部页面完成后的回调（通常是记录步骤完成）。
  final VoidCallback onAllDone;

  /// 固定在顶部、不随翻页变化的内容（例如学习目标横幅）。
  final Widget? header;

  /// 整节已经完成时，底部按钮显示的文案。
  final bool allDone;

  const StepWizard({
    super.key,
    required this.pages,
    required this.onAllDone,
    this.header,
    this.allDone = false,
  });

  @override
  State<StepWizard> createState() => _StepWizardState();
}

class _StepWizardState extends State<StepWizard> {
  int _index = 0;
  bool _forward = true;

  WizardPage get _page => widget.pages[_index];
  bool get _isLast => _index == widget.pages.length - 1;
  bool get _canNext => widget.allDone || _page.done;

  void _next() {
    if (!_canNext) return;
    if (_isLast) {
      widget.onAllDone();
      return;
    }
    setState(() {
      _forward = true;
      _index++;
    });
  }

  void _prev() {
    if (_index == 0) return;
    setState(() {
      _forward = false;
      _index--;
    });
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppTheme.active;
    final pages = widget.pages;
    if (pages.isEmpty) {
      return const Center(child: Text('暂无学习内容'));
    }
    // 页码可能因数据变化收缩，夹住避免越界。
    if (_index >= pages.length) _index = pages.length - 1;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (widget.header != null) widget.header!,
        _buildProgress(palette),
        Expanded(
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 320),
            switchInCurve: Curves.easeOutCubic,
            switchOutCurve: Curves.easeInCubic,
            transitionBuilder: (child, animation) => SlideTransition(
              position: Tween<Offset>(
                begin: Offset(_forward ? 1 : -1, 0),
                end: Offset.zero,
              ).animate(animation),
              child: FadeTransition(opacity: animation, child: child),
            ),
            child: SingleChildScrollView(
              // 每页内容是一张卡片；滚动只是小屏兜底，视觉上仍是一步一屏。
              key: ValueKey<int>(_index),
              padding: const EdgeInsets.only(top: 12, bottom: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (_page.label != null) ...[
                    _buildPageLabel(_page.label!, palette),
                    const SizedBox(height: 10),
                  ],
                  _page.content,
                ],
              ),
            ),
          ),
        ),
        _buildNav(palette),
      ],
    );
  }

  Widget _buildProgress(ChildThemePalette palette) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Expanded(
            child: Row(
              children: [
                for (var i = 0; i < widget.pages.length; i++) ...[
                  if (i > 0) const SizedBox(width: 6),
                  Expanded(
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 250),
                      height: 6,
                      decoration: BoxDecoration(
                        color: i < _index
                            ? AppTheme.primaryColor.withValues(alpha: 0.55)
                            : i == _index
                                ? AppTheme.primaryColor
                                : palette.line.withValues(alpha: 0.55),
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 12),
          Text(
            '第 ${_index + 1} / ${widget.pages.length} 步',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppTheme.textSecondary,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPageLabel(String label, ChildThemePalette palette) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: AppTheme.primaryColor.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: AppTheme.primaryColor,
        ),
      ),
    );
  }

  Widget _buildNav(ChildThemePalette palette) {
    final label = widget.allDone
        ? '已完成'
        : _isLast
            ? '完成这一步'
            : '下一步';

    return Container(
      padding: const EdgeInsets.only(top: 10, bottom: 4),
      decoration: BoxDecoration(
        border: Border(
          top: BorderSide(color: palette.line.withValues(alpha: 0.5), width: 1),
        ),
      ),
      child: Row(
        children: [
          // 返回上一步
          SizedBox(
            height: 50,
            child: TextButton.icon(
              onPressed: _index > 0 ? _prev : null,
              icon: const Icon(Icons.arrow_back_rounded, size: 18),
              label: const Text('上一步'),
              style: TextButton.styleFrom(
                foregroundColor: _index > 0
                    ? AppTheme.primaryColor
                    : AppTheme.textSecondary.withValues(alpha: 0.3),
              ),
            ),
          ),
          const SizedBox(width: 8),
          // 下一步 / 完成；未完成任务时点亮灰、并提示
          Expanded(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 250),
              height: 50,
              child: FilledButton.icon(
                onPressed: _canNext ? _next : null,
                icon: Icon(
                  widget.allDone
                      ? Icons.check_circle_rounded
                      : _isLast
                          ? Icons.flag_rounded
                          : Icons.arrow_forward_rounded,
                  size: 18,
                ),
                label: Text(
                  _canNext
                      ? label
                      : widget.allDone
                          ? label
                          : '先完成这一步哦',
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                style: FilledButton.styleFrom(
                  backgroundColor: _canNext
                      ? AppTheme.primaryColor
                      : palette.line.withValues(alpha: 0.45),
                  foregroundColor: _canNext
                      ? palette.onPrimary
                      : palette.ink2,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
