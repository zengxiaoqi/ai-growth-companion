import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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

  /// 绑定已有孩子（两步验证：手机号 + loginCode）
  void _showLinkChildDialog() {
    final phoneController = TextEditingController();
    final codeController = TextEditingController();
    bool isSubmitting = false;

    showDialog(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (ctx, setState) {
            return AlertDialog(
              title: const Text('绑定已有孩子'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    '请输入孩子账号的手机号和6位登录验证码完成绑定',
                    style: TextStyle(fontSize: 13, color: AppTheme.textSecondary),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: phoneController,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(
                      labelText: '孩子手机号',
                      hintText: '孩子注册时填写的手机号',
                      prefixIcon: Icon(Icons.phone),
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: codeController,
                    textCapitalization: TextCapitalization.characters,
                    maxLength: 6,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 6,
                    ),
                    decoration: const InputDecoration(
                      labelText: '登录验证码',
                      hintText: '6位',
                      counterText: '',
                      prefixIcon: Icon(Icons.vpn_key),
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.orange.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.info_outline, size: 16, color: Colors.orange[700]),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            '验证码可在孩子账号的设置页查看，或由已绑定的家长在孩子管理页查看。',
                            style: TextStyle(fontSize: 11, color: Colors.orange[700]),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: isSubmitting ? null : () => Navigator.pop(dialogContext),
                  child: const Text('取消'),
                ),
                ElevatedButton(
                  onPressed: isSubmitting
                      ? null
                      : () async {
                          final phone = phoneController.text.trim();
                          final code = codeController.text.trim().toUpperCase();
                          if (phone.isEmpty || code.length != 6) {
                            ScaffoldMessenger.of(ctx).showSnackBar(
                              const SnackBar(content: Text('请填写手机号和6位验证码')),
                            );
                            return;
                          }

                          setState(() => isSubmitting = true);
                          try {
                            final api = ctx.read<ApiService>();
                            final result = await api.linkChild(phone, code);
                            if (!mounted) return;
                            Navigator.pop(dialogContext);

                            if (result == null) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('绑定失败，请检查手机号和验证码')),
                              );
                            } else {
                              await _loadChildren();
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text('已成功绑定 ${result['name'] ?? '孩子'}')),
                              );
                            }
                          } catch (e) {
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text('绑定失败: $e')),
                              );
                            }
                          } finally {
                            if (mounted) setState(() => isSubmitting = false);
                          }
                        },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primaryColor,
                  ),
                  child: isSubmitting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 2,
                          ),
                        )
                      : const Text('绑定'),
                ),
              ],
            );
          },
        );
      },
    );
  }

  /// 重新生成孩子的登录验证码
  Future<void> _regenerateLoginCode(Map<String, dynamic> child) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('重新生成验证码'),
        content: Text('将为"${child['name']}"生成新的6位登录验证码，旧验证码将失效。确定继续？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('确定'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;
    if (!mounted) return;

    final api = context.read<ApiService>();
    final childId = child['id'] as int;
    final result = await api.regenerateLoginCode(childId);

    if (!mounted) return;
    if (result != null && result['loginCode'] != null) {
      await _loadChildren();
      // 弹窗展示新验证码
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('新验证码'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('请记录新的登录验证码：'),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                decoration: BoxDecoration(
                  color: AppTheme.primaryColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  result['loginCode'].toString(),
                  style: const TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 8,
                    color: AppTheme.primaryColor,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                '孩子可用此验证码在登录页"孩子快捷登录"处登录',
                style: TextStyle(fontSize: 12, color: AppTheme.textSecondary),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('知道了'),
            ),
          ],
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('生成失败，请重试')),
      );
    }
  }

  /// 设置自定义登录验证码
  Future<void> _setLoginCode(Map<String, dynamic> child) async {
    final codeController = TextEditingController(
      text: (child['loginCode'] as String?) ?? '',
    );
    bool isSubmitting = false;

    showDialog(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (ctx, setState) {
            return AlertDialog(
              title: Text('设置验证码 — ${child['name']}'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    '输入6位自定义验证码（大写字母+数字，不含 I/O/0/1）',
                    style: TextStyle(fontSize: 13, color: AppTheme.textSecondary),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: codeController,
                    textCapitalization: TextCapitalization.characters,
                    maxLength: 6,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 6,
                    ),
                    decoration: const InputDecoration(
                      labelText: '自定义验证码',
                      hintText: '6位',
                      counterText: '',
                      prefixIcon: Icon(Icons.vpn_key),
                      border: OutlineInputBorder(),
                    ),
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: isSubmitting ? null : () => Navigator.pop(dialogContext),
                  child: const Text('取消'),
                ),
                ElevatedButton(
                  onPressed: isSubmitting
                      ? null
                      : () async {
                          final code = codeController.text.trim().toUpperCase();
                          if (code.length != 6) {
                            ScaffoldMessenger.of(ctx).showSnackBar(
                              const SnackBar(content: Text('验证码必须是6位')),
                            );
                            return;
                          }

                          setState(() => isSubmitting = true);
                          final api = ctx.read<ApiService>();
                          final childId = child['id'] as int;
                          final result = await api.setLoginCode(childId, code);

                          if (!mounted) return;
                          Navigator.pop(dialogContext);

                          if (result != null && result['error'] == null) {
                            await _loadChildren();
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text('验证码已设置为 $code')),
                              );
                            }
                          } else {
                            final errMsg = result?['error'] ?? '设置失败';
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text(errMsg)),
                              );
                            }
                          }
                          if (mounted) setState(() => isSubmitting = false);
                        },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primaryColor,
                  ),
                  child: isSubmitting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 2,
                          ),
                        )
                      : const Text('保存'),
                ),
              ],
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('孩子管理'),
        actions: [
          IconButton(
            icon: const Icon(Icons.link),
            onPressed: _showLinkChildDialog,
            tooltip: '绑定已有孩子',
          ),
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
              onRegenerateCode: () => _regenerateLoginCode(child),
              onSetCode: () => _setLoginCode(child),
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
  final VoidCallback onRegenerateCode;
  final VoidCallback onSetCode;

  const _ChildCard({
    required this.child,
    required this.onEdit,
    required this.onDelete,
    required this.onRegenerateCode,
    required this.onSetCode,
  });

  @override
  Widget build(BuildContext context) {
    final name = child['name'] as String? ?? '未命名';
    final age = child['age'] as int?;
    final gender = child['gender'] as String?;
    final phone = child['phone'] as String?;
    final loginCode = child['loginCode'] as String?;

    String genderText = '';
    if (gender == 'male') {
      genderText = '男';
    } else if (gender == 'female') {
      genderText = '女';
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ExpansionTile(
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
        children: [
          // 登录验证码展示区
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.primaryColor.withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: AppTheme.primaryColor.withValues(alpha: 0.2),
                  width: 1,
                ),
              ),
              child: Column(
                children: [
                  Row(
                    children: [
                      const Icon(Icons.vpn_key, size: 18, color: AppTheme.primaryColor),
                      const SizedBox(width: 8),
                      const Text('登录验证码', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                      const Spacer(),
                      GestureDetector(
                        onTap: () {
                          final code = child['loginCode'] as String?;
                          if (code != null && code.isNotEmpty) {
                            Clipboard.setData(ClipboardData(text: code));
                            // 用 context 的 ScaffoldMessenger
                            final messenger = ScaffoldMessenger.of(context);
                            messenger.showSnackBar(
                              const SnackBar(
                                content: Text('验证码已复制到剪贴板'),
                                duration: Duration(seconds: 2),
                              ),
                            );
                          }
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppTheme.primaryColor.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.copy, size: 14, color: AppTheme.primaryColor),
                              const SizedBox(width: 4),
                              Text(
                                '复制',
                                style: TextStyle(fontSize: 12, color: AppTheme.primaryColor),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  // 验证码文本（可点击复制）
                  GestureDetector(
                    onTap: () {
                      final code = child['loginCode'] as String?;
                      if (code != null && code.isNotEmpty) {
                        Clipboard.setData(ClipboardData(text: code));
                        final messenger = ScaffoldMessenger.of(context);
                        messenger.showSnackBar(
                          const SnackBar(
                            content: Text('验证码已复制到剪贴板'),
                            duration: Duration(seconds: 2),
                          ),
                        );
                      }
                    },
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.grey[300]!),
                      ),
                      child: Center(
                        child: Text(
                          loginCode ?? '未生成',
                          style: TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.bold,
                            letterSpacing: 6,
                            color: loginCode != null ? AppTheme.primaryColor : Colors.grey,
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  // 操作按钮行
                  Row(
                    children: [
                      Expanded(
                        child: TextButton.icon(
                          onPressed: onSetCode,
                          icon: const Icon(Icons.edit, size: 16),
                          label: const Text('自定义', style: TextStyle(fontSize: 12)),
                          style: TextButton.styleFrom(
                            foregroundColor: AppTheme.primaryColor,
                          ),
                        ),
                      ),
                      Expanded(
                        child: TextButton.icon(
                          onPressed: onRegenerateCode,
                          icon: const Icon(Icons.refresh, size: 16),
                          label: const Text('随机生成', style: TextStyle(fontSize: 12)),
                          style: TextButton.styleFrom(
                            foregroundColor: Colors.grey[600],
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
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
