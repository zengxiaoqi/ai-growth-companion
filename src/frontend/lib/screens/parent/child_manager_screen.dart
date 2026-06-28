import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';

/// 孩子管理页面 - 添加/编辑/删除孩子
class ChildManagerScreen extends StatefulWidget {
  const ChildManagerScreen({super.key});

  @override
  State<ChildManagerScreen> createState() => _ChildManagerScreenState();
}

class _ChildManagerScreenState extends State<ChildManagerScreen> {
  List<Map<String, dynamic>> _children = [];
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadChildren();
  }

  Future<void> _loadChildren() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      if (!mounted) return;
      final api = context.read<ApiService>();
      final children = await api.getChildren();
      if (!mounted) return;
      setState(() {
        _children = children.map((c) => Map<String, dynamic>.from(c)).toList();
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '加载失败: $e';
        _isLoading = false;
      });
    }
  }

  void _showAddChildDialog() {
    showDialog(
      context: context,
      builder: (context) => _ChildFormDialog(
        onSubmit: (data) async {
          final api = context.read<ApiService>();
          final result = await api.addChild(
            name: data['name'] as String,
            phone: data['phone'] as String?,
            age: data['age'] as int?,
            gender: data['gender'] as String?,
          );
          if (result != null) {
            await _loadChildren();
            return true;
          }
          return false;
        },
      ),
    );
  }

  void _showEditChildDialog(Map<String, dynamic> child) {
    showDialog(
      context: context,
      builder: (context) => _ChildFormDialog(
        child: child,
        onSubmit: (data) async {
          final api = context.read<ApiService>();
          final childId = child['id'] as int;
          final result = await api.updateChild(
            childId,
            name: data['name'] as String?,
            phone: data['phone'] as String?,
            age: data['age'] as int?,
            gender: data['gender'] as String?,
          );
          if (result != null) {
            await _loadChildren();
            return true;
          }
          return false;
        },
      ),
    );
  }

  Future<void> _deleteChild(Map<String, dynamic> child) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('确认删除'),
        content: Text('确定要删除孩子"${child['name']}"吗？此操作不可恢复。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('删除'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      if (!mounted) return;
      final api = context.read<ApiService>();
      final childId = child['id'] as int;
      final success = await api.deleteChild(childId);
      if (success) {
        await _loadChildren();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('删除成功')),
          );
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('删除失败')),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('孩子管理'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: _showAddChildDialog,
            tooltip: '添加孩子',
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline, size: 48, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(_error!, style: TextStyle(color: Colors.grey[600])),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _loadChildren,
              child: const Text('重试'),
            ),
          ],
        ),
      );
    }

    if (_children.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.child_care, size: 64, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(
              '还没有添加孩子',
              style: TextStyle(fontSize: 16, color: Colors.grey[600]),
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: _showAddChildDialog,
              icon: const Icon(Icons.add),
              label: const Text('添加孩子'),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadChildren,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
        itemCount: _children.length + 1,
        itemBuilder: (context, index) {
          if (index < _children.length) {
            final child = _children[index];
            return _ChildCard(
              child: child,
              onEdit: () => _showEditChildDialog(child),
              onDelete: () => _deleteChild(child),
            );
          }
          // 末尾的添加按钮
          return Card(
            margin: const EdgeInsets.only(top: 4),
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: BorderSide(
                color: AppTheme.primaryColor.withValues(alpha: 0.3),
                width: 1.5,
              ),
            ),
            color: AppTheme.primaryColor.withValues(alpha: 0.05),
            child: ListTile(
              onTap: _showAddChildDialog,
              leading: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppTheme.primaryColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(Icons.person_add, color: AppTheme.primaryColor),
              ),
              title: Text(
                '添加孩子',
                style: TextStyle(
                  color: AppTheme.primaryColor,
                  fontWeight: FontWeight.w600,
                ),
              ),
              subtitle: Text(
                '支持管理多个孩子',
                style: TextStyle(fontSize: 12, color: AppTheme.textSecondary),
              ),
              trailing: Icon(Icons.add, color: AppTheme.primaryColor),
            ),
          );
        },
      ),
    );
  }
}

/// 孩子卡片
class _ChildCard extends StatelessWidget {
  final Map<String, dynamic> child;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  const _ChildCard({
    required this.child,
    required this.onEdit,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final name = child['name'] as String? ?? '未命名';
    final age = child['age'] as int?;
    final gender = child['gender'] as String?;
    final phone = child['phone'] as String?;

    String genderText = '';
    if (gender == 'male') {
      genderText = '男';
    } else if (gender == 'female') {
      genderText = '女';
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: AppTheme.primaryColor.withValues(alpha: 0.1),
          child: Icon(
            Icons.child_care,
            color: AppTheme.primaryColor,
          ),
        ),
        title: Text(
          name,
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (age != null || genderText.isNotEmpty)
              Text(
                [
                  if (age != null) '$age岁',
                  if (genderText.isNotEmpty) genderText,
                ].join(' · '),
              ),
            if (phone != null && phone.isNotEmpty)
              Text(
                phone,
                style: TextStyle(color: Colors.grey[600], fontSize: 12),
              ),
          ],
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              icon: const Icon(Icons.edit, size: 20),
              onPressed: onEdit,
              tooltip: '编辑',
            ),
            IconButton(
              icon: const Icon(Icons.delete, size: 20, color: Colors.red),
              onPressed: onDelete,
              tooltip: '删除',
            ),
          ],
        ),
      ),
    );
  }
}

/// 添加/编辑孩子表单对话框
class _ChildFormDialog extends StatefulWidget {
  final Map<String, dynamic>? child;
  final Future<bool> Function(Map<String, dynamic> data) onSubmit;

  const _ChildFormDialog({
    this.child,
    required this.onSubmit,
  });

  @override
  State<_ChildFormDialog> createState() => _ChildFormDialogState();
}

class _ChildFormDialogState extends State<_ChildFormDialog> {
  final _formKey = GlobalKey<FormState>();
  late TextEditingController _nameController;
  late TextEditingController _phoneController;
  late TextEditingController _ageController;
  String? _gender;
  bool _isSubmitting = false;

  bool get isEditing => widget.child != null;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.child?['name'] as String? ?? '');
    _phoneController = TextEditingController(text: widget.child?['phone'] as String? ?? '');
    _ageController = TextEditingController(
      text: widget.child?['age']?.toString() ?? '',
    );
    _gender = widget.child?['gender'] as String?;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _ageController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isSubmitting = true);

    final data = <String, dynamic>{
      'name': _nameController.text.trim(),
    };

    if (_phoneController.text.trim().isNotEmpty) {
      data['phone'] = _phoneController.text.trim();
    }

    if (_ageController.text.trim().isNotEmpty) {
      data['age'] = int.tryParse(_ageController.text.trim());
    }

    if (_gender != null) {
      data['gender'] = _gender;
    }

    final success = await widget.onSubmit(data);

    if (mounted) {
      setState(() => _isSubmitting = false);
      if (success) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(isEditing ? '修改成功' : '添加成功')),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('操作失败，请重试')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(isEditing ? '编辑孩子信息' : '添加孩子'),
      content: SingleChildScrollView(
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                controller: _nameController,
                decoration: const InputDecoration(
                  labelText: '姓名 *',
                  hintText: '请输入孩子姓名',
                  prefixIcon: Icon(Icons.person),
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return '请输入姓名';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _phoneController,
                decoration: const InputDecoration(
                  labelText: '手机号',
                  hintText: '可选，用于孩子登录',
                  prefixIcon: Icon(Icons.phone),
                ),
                keyboardType: TextInputType.phone,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _ageController,
                decoration: const InputDecoration(
                  labelText: '年龄',
                  hintText: '可选',
                  prefixIcon: Icon(Icons.cake),
                ),
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: _gender,
                decoration: const InputDecoration(
                  labelText: '性别',
                  prefixIcon: Icon(Icons.wc),
                ),
                items: const [
                  DropdownMenuItem(value: 'male', child: Text('男')),
                  DropdownMenuItem(value: 'female', child: Text('女')),
                ],
                onChanged: (value) => setState(() => _gender = value),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _isSubmitting ? null : () => Navigator.pop(context),
          child: const Text('取消'),
        ),
        ElevatedButton(
          onPressed: _isSubmitting ? null : _submit,
          child: _isSubmitting
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(isEditing ? '保存' : '添加'),
        ),
      ],
    );
  }
}
