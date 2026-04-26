import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';

enum ChildSelectorMode { dropdown, bottomSheet }

/// 孩子选择器组件
/// 支持下拉模式和底部弹窗模式
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

  Widget _buildDropdown(
    BuildContext context,
    Map<String, dynamic>? selectedChild,
  ) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: AppTheme.primaryColor.withOpacity(0.06),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        children: [
          _buildAvatar(selectedChild),
          const SizedBox(width: 12),
          Expanded(
            child: DropdownButtonHideUnderline(
              child: DropdownButton<int>(
                isExpanded: true,
                value: selectedChildId,
                hint: const Text('请选择孩子'),
                items: children
                    .map((child) {
                      final id = _toInt(child['id']);
                      if (id == null) return null;
                      return DropdownMenuItem<int>(
                        value: id,
                        child: Text(_childLabel(child)),
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
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: children.isEmpty ? null : () => _showChildPicker(context),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: AppTheme.primaryColor.withOpacity(0.06),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          children: [
            _buildAvatar(selectedChild),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    selectedChild == null ? '暂无可选孩子' : _childLabel(selectedChild),
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.textColor,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            Icon(
              Icons.keyboard_arrow_down_rounded,
              color: children.isEmpty ? Colors.grey.shade400 : AppTheme.textSecondary,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAvatar(Map<String, dynamic>? child) {
    final name = child?['name']?.toString() ?? '';
    final display = name.isNotEmpty ? name.substring(0, 1) : '宝';

    return CircleAvatar(
      radius: 18,
      backgroundColor: AppTheme.secondaryColor.withOpacity(0.18),
      child: Text(
        display,
        style: const TextStyle(
          fontWeight: FontWeight.bold,
          color: AppTheme.secondaryColor,
        ),
      ),
    );
  }

  Future<void> _showChildPicker(BuildContext context) async {
    await showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      showDragHandle: true,
      backgroundColor: Colors.white,
      builder: (context) {
        return ListView.separated(
          padding: const EdgeInsets.fromLTRB(16, 6, 16, 16),
          itemCount: children.length,
          separatorBuilder: (_, __) => const Divider(height: 1),
          itemBuilder: (context, index) {
            final child = children[index];
            final id = _toInt(child['id']);
            final selected = id == selectedChildId;

            return ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 4),
              leading: _buildAvatar(child),
              title: Text(
                child['name']?.toString() ?? '未命名孩子',
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              subtitle: Text(_buildChildSubtitle(child)),
              trailing: selected
                  ? const Icon(Icons.check_circle_rounded, color: AppTheme.primaryColor)
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
    return '$name · ${age}岁';
  }

  String _buildChildSubtitle(Map<String, dynamic> child) {
    final age = _toInt(child['age']);
    if (age == null) {
      return '未设置年龄';
    }
    return '${age}岁';
  }
}
