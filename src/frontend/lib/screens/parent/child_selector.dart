import 'package:flutter/material.dart';

import '../../theme/child_theme.dart';

enum ChildSelectorMode { dropdown, bottomSheet }

/// 孩子选择器组件（家长首页 / 成长报告页共用）。
///
/// 颜色统一走 [ChildThemePalette]：家长端拿到 honey，孩子端跟随当前皮肤，
/// 不再写死 Colors.white —— 深色皮肤下白底白字会直接读不了。
class ChildSelector extends StatelessWidget {
  final List<Map<String, dynamic>> children;
  final int? selectedChildId;
  final ValueChanged<Map<String, dynamic>> onChildChanged;
  final ChildSelectorMode mode;
  final String title;

  const ChildSelector({
    super.key,
    required this.children,
    required this.selectedChildId,
    required this.onChildChanged,
    this.mode = ChildSelectorMode.bottomSheet,
    this.title = '当前孩子',
  });

  @override
  Widget build(BuildContext context) {
    final selectedChild = _findChildById(selectedChildId);

    if (mode == ChildSelectorMode.dropdown) {
      return _buildDropdown(context, selectedChild);
    }

    return _buildBottomSheetSelector(context, selectedChild);
  }

  BoxDecoration _selectorDecoration(ChildThemePalette palette) {
    return BoxDecoration(
      color: palette.card,
      borderRadius: BorderRadius.circular(16),
      border: palette.isCartoon
          ? Border.all(color: palette.line, width: palette.borderW)
          : Border.all(color: palette.line, width: 1),
      boxShadow: [
        BoxShadow(
          color: palette.pop.withValues(alpha: 0.08),
          blurRadius: 12,
          offset: const Offset(0, 4),
        ),
      ],
    );
  }

  Widget _buildDropdown(
    BuildContext context,
    Map<String, dynamic>? selectedChild,
  ) {
    final palette = ChildThemePalette.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: _selectorDecoration(palette),
      child: Row(
        children: [
          _buildAvatar(selectedChild, palette),
          const SizedBox(width: 12),
          Expanded(
            child: DropdownButtonHideUnderline(
              child: DropdownButton<int>(
                isExpanded: true,
                value: selectedChildId,
                hint: Text('请选择孩子',
                    style: TextStyle(fontSize: 13, color: palette.ink2)),
                items: children
                    .map((child) {
                      final id = _toInt(child['id']);
                      if (id == null) return null;
                      return DropdownMenuItem<int>(
                        value: id,
                        child: Text(_childLabel(child),
                            style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: palette.ink)),
                      );
                    })
                    .whereType<DropdownMenuItem<int>>()
                    .toList(),
                onChanged: children.isEmpty
                    ? null
                    : (value) {
                        final child = _findChildById(value);
                        if (child != null) {
                          onChildChanged(child);
                        }
                      },
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBottomSheetSelector(
    BuildContext context,
    Map<String, dynamic>? selectedChild,
  ) {
    final palette = ChildThemePalette.of(context);
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: children.isEmpty ? null : () => _showChildPicker(context),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: _selectorDecoration(palette),
        child: Row(
          children: [
            _buildAvatar(selectedChild, palette),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(fontSize: 12, color: palette.ink2),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    selectedChild == null
                        ? '暂无可选孩子'
                        : _childLabel(selectedChild),
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: palette.ink,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            Icon(
              Icons.keyboard_arrow_down_rounded,
              color: children.isEmpty
                  ? palette.ink2.withValues(alpha: 0.5)
                  : palette.ink2,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAvatar(Map<String, dynamic>? child, ChildThemePalette palette) {
    final name = child?['name']?.toString() ?? '';
    final display = name.isNotEmpty ? name.substring(0, 1) : '宝';

    return CircleAvatar(
      radius: 18,
      backgroundColor:
          Color.alphaBlend(palette.pop.withValues(alpha: 0.16), palette.card),
      child: Text(
        display,
        style: TextStyle(fontWeight: FontWeight.bold, color: palette.pop),
      ),
    );
  }

  Future<void> _showChildPicker(BuildContext context) async {
    final palette = ChildThemePalette.of(context);
    await showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      showDragHandle: true,
      backgroundColor: palette.card,
      builder: (context) {
        return ListView.separated(
          padding: const EdgeInsets.fromLTRB(16, 6, 16, 16),
          itemCount: children.length,
          separatorBuilder: (_, __) =>
              Divider(height: 1, color: palette.line),
          itemBuilder: (context, index) {
            final child = children[index];
            final id = _toInt(child['id']);
            final selected = id == selectedChildId;

            return ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 4),
              leading: _buildAvatar(child, palette),
              title: Text(
                child['name']?.toString() ?? '未命名孩子',
                style: TextStyle(
                    fontWeight: FontWeight.w700, color: palette.ink),
              ),
              subtitle: Text(_buildChildSubtitle(child),
                  style: TextStyle(color: palette.ink2)),
              trailing: selected
                  ? Icon(Icons.check_circle_rounded, color: palette.pop)
                  : null,
              onTap: () {
                Navigator.of(context).pop();
                onChildChanged(child);
              },
            );
          },
        );
      },
    );
  }

  Map<String, dynamic>? _findChildById(int? id) {
    if (id == null) return null;
    for (final child in children) {
      if (_toInt(child['id']) == id) {
        return child;
      }
    }
    return null;
  }

  int? _toInt(dynamic value) {
    if (value is int) return value;
    return int.tryParse(value?.toString() ?? '');
  }

  String _childLabel(Map<String, dynamic> child) {
    final name = child['name']?.toString() ?? '未命名';
    final age = _toInt(child['age']);
    if (age == null) return name;
    return '$name · $age岁';
  }

  String _buildChildSubtitle(Map<String, dynamic> child) {
    final age = _toInt(child['age']);
    if (age == null) {
      return '未设置年龄';
    }
    return '$age岁';
  }
}
