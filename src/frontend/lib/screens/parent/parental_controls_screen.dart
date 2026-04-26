import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/user_provider.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import 'child_selector.dart';

/// 家长控制面板：学习时间限制、内容过滤、休息提醒等
class ParentalControlsScreen extends StatefulWidget {
  final int? initialChildId;

  const ParentalControlsScreen({
    super.key,
    this.initialChildId,
  });

  @override
  State<ParentalControlsScreen> createState() => _ParentalControlsScreenState();
}

class _ParentalControlsScreenState extends State<ParentalControlsScreen> {
  bool _isLoading = true;
  bool _isSaving = false;
  String? _error;
  List<Map<String, dynamic>> _children = [];
  int? _selectedChildId;

  // 控制项
  int _dailyLimitMinutes = 30;
  bool _eyeProtectionEnabled = true;
  int _restReminderMinutes = 20;
  bool _contentFilterEnabled = true;
  bool _appLockEnabled = false;
  List<String> _allowedDomains = ['language', 'math', 'science', 'art', 'social'];
  List<String> _blockedTopics = [];

  static const _allDomains = [
    {'key': 'language', 'label': '语言', 'icon': Icons.language_rounded, 'color': Color(0xFF006384)},
    {'key': 'math', 'label': '数学', 'icon': Icons.calculate_rounded, 'color': Color(0xFF586000)},
    {'key': 'science', 'label': '科学', 'icon': Icons.science_rounded, 'color': Color(0xFF705900)},
    {'key': 'art', 'label': '艺术', 'icon': Icons.palette_rounded, 'color': Color(0xFFb9ae6e)},
    {'key': 'social', 'label': '社会', 'icon': Icons.people_rounded, 'color': Color(0xFFb02500)},
  ];

  static const _timeOptions = [15, 20, 30, 45, 60, 90, 120];
  static const _restOptions = [10, 15, 20, 25, 30];

  @override
  void initState() {
    super.initState();
    _selectedChildId = widget.initialChildId;
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadData());
  }

  Future<void> _loadData() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final api = context.read<ApiService>();
      final parentId = _currentParentId;
      if (parentId == null) {
        throw Exception('未获取到家长账号信息');
      }

      // 加载孩子列表
      final children = await api.getChildrenByParent(parentId);
      final childList = children
          .whereType<Map>()
          .map((c) => c.map((k, v) => MapEntry(k.toString(), v)))
          .toList();

      if (_selectedChildId == null && childList.isNotEmpty) {
        _selectedChildId = _toInt(childList.first['id']);
      }

      // 加载家长控制设置
      if (parentId > 0) {
        final controls = await api.getParentControls(parentId);
        if (controls != null) {
          _dailyLimitMinutes = _toInt(controls['dailyLimitMinutes']) ?? 30;
          _eyeProtectionEnabled = controls['eyeProtectionEnabled'] == true;
          _restReminderMinutes = _toInt(controls['restReminderMinutes']) ?? 20;
          _contentFilterEnabled = controls['contentFilterEnabled'] == null
              ? true
              : controls['contentFilterEnabled'] == true;

          final notifications = _toMap(controls['notifications']);
          _appLockEnabled = notifications['appLockEnabled'] == true;

          final domains = controls['allowedDomains'];
          if (domains is List) {
            _allowedDomains = domains.map((e) => e.toString()).toList();
          }

          final blocked = controls['blockedTopics'];
          if (blocked is List) {
            _blockedTopics = blocked.map((e) => e.toString()).toList();
          }
        }
      }

      if (!mounted) return;
      setState(() {
        _children = childList;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '加载失败：$e';
        _isLoading = false;
      });
    }
  }

  Future<void> _save() async {
    setState(() => _isSaving = true);
    try {
      final api = context.read<ApiService>();
      final parentId = _currentParentId;
      if (parentId == null) {
        throw Exception('未获取到家长账号信息');
      }
      final notifications = <String, dynamic>{'appLockEnabled': _appLockEnabled};
      await api.updateParentControls(parentId, {
        'dailyLimitMinutes': _dailyLimitMinutes,
        'eyeProtectionEnabled': _eyeProtectionEnabled,
        'restReminderMinutes': _restReminderMinutes,
        'contentFilterEnabled': _contentFilterEnabled,
        'notifications': notifications,
        'allowedDomains': _allowedDomains,
        'blockedTopics': _blockedTopics,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('设置已保存'),
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppTheme.accentColor,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('保存失败：$e'),
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppTheme.warningColor,
        ),
      );
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  int? _toInt(dynamic value) {
    if (value is int) return value;
    return int.tryParse(value?.toString() ?? '');
  }

  int? get _currentParentId {
    final user = context.read<UserProvider>().currentUser;
    return _toInt(user?['id']);
  }

  Map<String, dynamic> _toMap(dynamic value) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map) {
      return value.map((k, v) => MapEntry(k.toString(), v));
    }
    return {};
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      body: SafeArea(
        child: Column(
          children: [
            // 顶部标题栏
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(Icons.arrow_back_rounded, size: 20),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    '家长控制',
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
            ),

            // 孩子选择器
            if (_children.isNotEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: ChildSelector(
                  children: _children,
                  selectedChildId: _selectedChildId,
                  onChildChanged: (child) {
                    setState(() => _selectedChildId = _toInt(child['id']));
                    _loadData();
                  },
                ),
              ),

            const SizedBox(height: 8),

            // 内容区域
            Expanded(
              child: _isLoading
                  ? const Center(
                      child: CircularProgressIndicator(
                        color: AppTheme.primaryColor,
                      ),
                    )
                  : _error != null
                      ? _buildErrorState()
                      : _buildControls(theme),
            ),

            // 底部保存按钮
            if (!_isLoading && _error == null)
              Container(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.03),
                      blurRadius: 10,
                      offset: const Offset(0, -3),
                    ),
                  ],
                ),
                child: SizedBox(
                  height: 52,
                  child: FilledButton.icon(
                    onPressed: _isSaving ? null : _save,
                    icon: _isSaving
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.check_rounded),
                    label: Text(_isSaving ? '保存中...' : '保存设置'),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorState() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.error_outline_rounded,
              size: 48, color: AppTheme.warningColor),
          const SizedBox(height: 12),
          Text(_error ?? '加载失败'),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: _loadData,
            icon: const Icon(Icons.refresh_rounded),
            label: const Text('重试'),
          ),
        ],
      ),
    );
  }

  Widget _buildControls(ThemeData theme) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 学习时间限制
          _buildSection(
            theme: theme,
            title: '每日学习时间',
            icon: Icons.timer_rounded,
            iconColor: AppTheme.primaryColor,
            child: _buildTimeSelector(),
          ),
          const SizedBox(height: 16),

          // 护眼模式
          _buildSection(
            theme: theme,
            title: '护眼模式',
            icon: Icons.visibility_rounded,
            iconColor: AppTheme.accentColor,
            child: _buildSwitchRow(
              label: '开启护眼模式',
              description: '降低屏幕亮度，过滤蓝光',
              value: _eyeProtectionEnabled,
              onChanged: (v) => setState(() => _eyeProtectionEnabled = v),
            ),
          ),
          const SizedBox(height: 16),

          // 休息提醒
          _buildSection(
            theme: theme,
            title: '休息提醒',
            icon: Icons.notifications_active_rounded,
            iconColor: AppTheme.secondaryColor,
            child: _buildRestReminderSelector(),
          ),
          const SizedBox(height: 16),

          // 内容过滤
          _buildSection(
            theme: theme,
            title: '内容过滤',
            icon: Icons.filter_list_rounded,
            iconColor: AppTheme.warningColor,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildSwitchRow(
                  label: '开启内容过滤',
                  description: '过滤不适合的内容',
                  value: _contentFilterEnabled,
                  onChanged: (v) => setState(() => _contentFilterEnabled = v),
                ),
                if (_contentFilterEnabled) ...[
                  const SizedBox(height: 12),
                  Text(
                    '允许的学习领域',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _allDomains.map((domain) {
                      final key = domain['key'] as String;
                      final label = domain['label'] as String;
                      final icon = domain['icon'] as IconData;
                      final color = domain['color'] as Color;
                      final allowed = _allowedDomains.contains(key);

                      return FilterChip(
                        selected: allowed,
                        onSelected: (selected) {
                          setState(() {
                            if (selected) {
                              _allowedDomains.add(key);
                            } else {
                              _allowedDomains.remove(key);
                            }
                          });
                        },
                        label: Text(label),
                        avatar: Icon(icon, size: 16, color: color),
                        selectedColor: color.withOpacity(0.15),
                        checkmarkColor: color,
                      );
                    }).toList(),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),

          // 应用锁定
          _buildSection(
            theme: theme,
            title: '应用锁定',
            icon: Icons.lock_rounded,
            iconColor: AppTheme.accentColor,
            child: _buildSwitchRow(
              label: '开启应用锁定',
              description: '在非学习时间限制进入应用',
              value: _appLockEnabled,
              onChanged: (v) => setState(() => _appLockEnabled = v),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSection({
    required ThemeData theme,
    required String title,
    required IconData icon,
    required Color iconColor,
    required Widget child,
  }) {
    return Card(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(color: Colors.grey.shade200),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, color: iconColor, size: 22),
                const SizedBox(width: 8),
                Text(
                  title,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            child,
          ],
        ),
      ),
    );
  }

  Widget _buildTimeSelector() {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _timeOptions.map((minutes) {
        final isSelected = _dailyLimitMinutes == minutes;
        return ChoiceChip(
          selected: isSelected,
          onSelected: (selected) {
            if (selected) setState(() => _dailyLimitMinutes = minutes);
          },
          label: Text('${minutes}分钟'),
          selectedColor: AppTheme.primaryColor.withOpacity(0.15),
          checkmarkColor: AppTheme.primaryColor,
        );
      }).toList(),
    );
  }

  Widget _buildRestReminderSelector() {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _restOptions.map((minutes) {
        final isSelected = _restReminderMinutes == minutes;
        return ChoiceChip(
          selected: isSelected,
          onSelected: (selected) {
            if (selected) setState(() => _restReminderMinutes = minutes);
          },
          label: Text('每${minutes}分钟'),
          selectedColor: AppTheme.secondaryColor.withOpacity(0.15),
          checkmarkColor: AppTheme.secondaryColor,
        );
      }).toList(),
    );
  }

  Widget _buildSwitchRow({
    required String label,
    required String description,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textColor,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                description,
                style: const TextStyle(
                  fontSize: 12,
                  color: AppTheme.textSecondary,
                ),
              ),
            ],
          ),
        ),
        Switch(
          value: value,
          onChanged: onChanged,
          activeColor: AppTheme.primaryColor,
        ),
      ],
    );
  }
}
