import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../components/app_update_prompt.dart';
import '../../providers/user_provider.dart';
import '../../services/app_update_service.dart';
import '../../theme/app_theme.dart';

/// 「我的」页面各菜单项的功能弹层集合：
/// 关于我们（含版本信息 + 检查更新）、个人资料、通知设置、隐私设置、帮助与反馈。

// ─────────────────────────────────────────────────────────────
// 通用外壳：底部圆角弹层
// ─────────────────────────────────────────────────────────────

Future<T?> _showSheet<T>(BuildContext context, Widget child, {double heightFactor = 0.62}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => Container(
      height: MediaQuery.of(context).size.height * heightFactor,
      decoration: const BoxDecoration(
        color: AppTheme.backgroundColor,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: child,
    ),
  );
}

Widget _sheetHandle() => Center(
      child: Container(
        margin: const EdgeInsets.only(top: 12, bottom: 4),
        width: 44,
        height: 5,
        decoration: BoxDecoration(
          color: AppTheme.textSecondary.withValues(alpha: 0.3),
          borderRadius: BorderRadius.circular(3),
        ),
      ),
    );

Widget _sheetTitle(String emoji, String title) => Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
      child: Row(
        children: [
          Text(emoji, style: const TextStyle(fontSize: 22)),
          const SizedBox(width: 10),
          Text(
            title,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: AppTheme.textColor,
            ),
          ),
        ],
      ),
    );

void _toast(BuildContext context, String message, {Color color = AppTheme.successColor}) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(message),
      backgroundColor: color,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      duration: const Duration(seconds: 2),
    ),
  );
}

// ─────────────────────────────────────────────────────────────
// 1. 关于我们（版本信息 + 检查更新）
// ─────────────────────────────────────────────────────────────

Future<void> showAboutSheet(BuildContext context) {
  return _showSheet(
    context,
    const _AboutSheet(),
    heightFactor: 0.6,
  );
}

class _AboutSheet extends StatefulWidget {
  const _AboutSheet();

  @override
  State<_AboutSheet> createState() => _AboutSheetState();
}

class _AboutSheetState extends State<_AboutSheet> {
  String _versionText = 'v1.0.0';
  String _buildText = '';

  @override
  void initState() {
    super.initState();
    _loadVersion();
  }

  Future<void> _loadVersion() async {
    if (!AppUpdateService.isSupported) return;
    try {
      final (code, name) = await AppUpdateService.instance.currentVersion();
      if (mounted && name.isNotEmpty) {
        setState(() {
          _versionText = 'v$name';
          _buildText = '(build $code)';
        });
      }
    } catch (_) {
      // 保持占位版本号
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        children: [
          _sheetHandle(),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
              child: Column(
                children: [
                  _sheetTitle('ℹ️', '关于我们'),
                  const SizedBox(height: 8),
                  // App 标识
                  Container(
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: Column(
                      children: [
                        Container(
                          width: 72,
                          height: 72,
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(
                              colors: [AppTheme.primaryColor, Color(0xFFFF9EBB)],
                            ),
                            borderRadius: BorderRadius.circular(20),
                            boxShadow: AppTheme.glowShadow(AppTheme.primaryColor),
                          ),
                          child: const Center(
                            child: Text('🦊', style: TextStyle(fontSize: 40)),
                          ),
                        ),
                        const SizedBox(height: 12),
                        const Text(
                          '灵犀伴学',
                          style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.bold,
                            color: AppTheme.textColor,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'AI 成长伙伴，让学习更有温度',
                          style: TextStyle(
                            fontSize: 13,
                            color: AppTheme.textSecondary,
                          ),
                        ),
                        const SizedBox(height: 12),
                        // 版本信息行
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                          decoration: BoxDecoration(
                            color: AppTheme.softYellow.withValues(alpha: 0.35),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.verified_rounded,
                                  size: 16, color: AppTheme.secondaryColor),
                              const SizedBox(width: 6),
                              Text(
                                '当前版本 $_versionText $_buildText',
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: AppTheme.secondaryColor,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  // 检查更新入口
                  _SheetCard(
                    color: AppTheme.infoColor,
                    icon: Icons.system_update_rounded,
                    title: '检查更新',
                    subtitle: AppUpdateService.isSupported
                        ? '检测新版本并自动下载安装'
                        : '应用内更新仅支持 Android 版',
                    trailing: const Icon(Icons.chevron_right_rounded, size: 22),
                    onTap: AppUpdateService.isSupported
                        ? () => AppUpdatePrompt.manualCheck(context)
                        : null,
                  ),
                  const SizedBox(height: 12),
                  _SheetCard(
                    color: AppTheme.softPurple,
                    icon: Icons.favorite_rounded,
                    title: '关于团队',
                    subtitle: '由灵犀伴学团队用心打造，陪伴每一位小朋友快乐成长。',
                    onTap: null,
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

// ─────────────────────────────────────────────────────────────
// 2. 个人资料（编辑姓名 / 年龄）
// ─────────────────────────────────────────────────────────────

Future<void> showProfileEditSheet(BuildContext context, UserProvider userProvider) {
  return _showSheet(
    context,
    _ProfileEditSheet(userProvider: userProvider),
    heightFactor: 0.55,
  );
}

class _ProfileEditSheet extends StatefulWidget {
  const _ProfileEditSheet({required this.userProvider});

  final UserProvider userProvider;

  @override
  State<_ProfileEditSheet> createState() => _ProfileEditSheetState();
}

class _ProfileEditSheetState extends State<_ProfileEditSheet> {
  late final TextEditingController _nameController;
  late double _age;
  late final bool _isParent;
  late final String _phone;

  @override
  void initState() {
    super.initState();
    final user = widget.userProvider.currentUser ?? {};
    _nameController = TextEditingController(text: (user['name'] ?? '').toString());
    _age = ((user['age'] ?? 8) as num).toDouble().clamp(3, 18);
    _isParent = user['type']?.toString() == 'parent';
    _phone = (user['phone'] ?? '').toString();
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      _toast(context, '昵称不能为空哦', color: AppTheme.warningColor);
      return;
    }
    await widget.userProvider.updateUserInfo({
      'name': name,
      if (!_isParent) 'age': _age.round(),
    });
    if (mounted) {
      Navigator.pop(context);
      _toast(context, '资料已更新 ✨');
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        children: [
          _sheetHandle(),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _sheetTitle(_isParent ? '👨‍👩‍👧' : '👤', _isParent ? '家长资料' : '个人资料'),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('昵称',
                            style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: AppTheme.textSecondary)),
                        const SizedBox(height: 8),
                        TextField(
                          controller: _nameController,
                          maxLength: 12,
                          decoration: InputDecoration(
                            counterText: '',
                            hintText: '输入昵称',
                            prefixIcon: const Icon(Icons.badge_rounded, size: 20),
                            filled: true,
                            fillColor: AppTheme.backgroundColor,
                            contentPadding:
                                const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(14),
                              borderSide: BorderSide.none,
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        if (_isParent) ...[
                          const Text('手机号',
                              style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  color: AppTheme.textSecondary)),
                          const SizedBox(height: 6),
                          Text(
                            _phone.isEmpty ? '未绑定' : _phone,
                            style: const TextStyle(
                                fontSize: 16, color: AppTheme.textColor),
                          ),
                        ] else ...[
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Text('年龄',
                                  style: TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w600,
                                      color: AppTheme.textSecondary)),
                              Container(
                                padding:
                                    const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                                decoration: BoxDecoration(
                                  color: AppTheme.secondaryColor.withValues(alpha: 0.12),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Text(
                                  '${_age.round()} 岁',
                                  style: const TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.bold,
                                      color: AppTheme.secondaryColor),
                                ),
                              ),
                            ],
                          ),
                          Slider(
                            value: _age,
                            min: 3,
                            max: 18,
                            divisions: 15,
                            activeColor: AppTheme.secondaryColor,
                            label: '${_age.round()} 岁',
                            onChanged: (v) => setState(() => _age = v),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _save,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.primaryColor,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16)),
                      ),
                      child: const Text('保存',
                          style:
                              TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    ),
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

// ─────────────────────────────────────────────────────────────
// 3. 通知设置（本地持久化）
// ─────────────────────────────────────────────────────────────

class _NotificationPrefs {
  static const keyReminder = 'study_reminder_enabled';
  static const keyHour = 'study_reminder_hour';
  static const keySound = 'study_reminder_sound';

  static Future<Map<String, dynamic>> load() async {
    final prefs = await SharedPreferences.getInstance();
    return {
      'enabled': prefs.getBool(keyReminder) ?? true,
      'hour': prefs.getInt(keyHour) ?? 19,
      'sound': prefs.getBool(keySound) ?? true,
    };
  }

  static Future<void> save({
    required bool enabled,
    required int hour,
    required bool sound,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(keyReminder, enabled);
    await prefs.setInt(keyHour, hour);
    await prefs.setBool(keySound, sound);
  }
}

Future<void> showNotificationSettingsSheet(BuildContext context) {
  return _showSheet(
    context,
    const _NotificationSheet(),
    heightFactor: 0.6,
  );
}

class _NotificationSheet extends StatefulWidget {
  const _NotificationSheet();

  @override
  State<_NotificationSheet> createState() => _NotificationSheetState();
}

class _NotificationSheetState extends State<_NotificationSheet> {
  bool _enabled = true;
  bool _sound = true;
  int _hour = 19;
  bool _dirty = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await _NotificationPrefs.load();
    if (mounted) {
      setState(() {
        _enabled = prefs['enabled'] as bool;
        _sound = prefs['sound'] as bool;
        _hour = prefs['hour'] as int;
      });
    }
  }

  Future<void> _save() async {
    await _NotificationPrefs.save(enabled: _enabled, hour: _hour, sound: _sound);
    if (mounted) {
      setState(() => _dirty = false);
      _toast(context, '通知设置已保存 🔔');
    }
  }

  String get _hourText => '每天 $_hour:00';

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        children: [
          _sheetHandle(),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
              child: Column(
                children: [
                  _sheetTitle('🔔', '通知设置'),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: Column(
                      children: [
                        _SwitchRow(
                          emoji: '📚',
                          title: '学习提醒',
                          subtitle: '每天定时提醒开始学习',
                          value: _enabled,
                          onChanged: (v) => setState(() {
                            _enabled = v;
                            _dirty = true;
                          }),
                        ),
                        const Divider(height: 1),
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          enabled: _enabled,
                          leading: const Text('⏰', style: TextStyle(fontSize: 20)),
                          title: const Text('提醒时间',
                              style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w600,
                                  color: AppTheme.textColor)),
                          subtitle: Text(_hourText,
                              style: const TextStyle(
                                  fontSize: 12, color: AppTheme.textSecondary)),
                          trailing: const Icon(Icons.chevron_right_rounded, size: 22),
                          onTap: _enabled
                              ? () async {
                                  final picked = await showTimePicker(
                                    context: context,
                                    initialTime: TimeOfDay(hour: _hour, minute: 0),
                                    builder: (context, child) => Theme(
                                      data: Theme.of(context)
                                          .copyWith(colorScheme: const ColorScheme.light(
                                        primary: AppTheme.secondaryColor,
                                      )),
                                      child: child!,
                                    ),
                                  );
                                  if (picked != null) {
                                    setState(() {
                                      _hour = picked.hour;
                                      _dirty = true;
                                    });
                                  }
                                }
                              : null,
                        ),
                        const Divider(height: 1),
                        _SwitchRow(
                          emoji: '🔊',
                          title: '提醒声音',
                          subtitle: '播放提示音（关闭则仅振动）',
                          value: _sound,
                          onChanged: (v) => setState(() {
                            _sound = v;
                            _dirty = true;
                          }),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _dirty ? _save : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.primaryColor,
                        foregroundColor: Colors.white,
                        disabledBackgroundColor:
                            AppTheme.textSecondary.withValues(alpha: 0.2),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16)),
                      ),
                      child: Text(_dirty ? '保存设置' : '已保存',
                          style: const TextStyle(
                              fontSize: 16, fontWeight: FontWeight.bold)),
                    ),
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

// ─────────────────────────────────────────────────────────────
// 4. 隐私设置（说明 + 清除学习缓存）
// ─────────────────────────────────────────────────────────────

Future<void> showPrivacySheet(BuildContext context) {
  return _showSheet(
    context,
    const _PrivacySheet(),
    heightFactor: 0.68,
  );
}

class _PrivacySheet extends StatelessWidget {
  const _PrivacySheet();

  static const _policies = [
    ('📁', '数据存储', '学习记录与偏好设置仅保存在本机，不会上传到公共服务器。'),
    ('🔒', '账号安全', '登录凭证加密存储，退出登录即清除本地会话。'),
    ('🚫', '无广告承诺', '应用不含任何第三方广告与追踪组件。'),
    ('👶', '儿童保护', '对话内容由 AI 安全策略保护，家长可随时查看与限制。'),
  ];

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        children: [
          _sheetHandle(),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _sheetTitle('🔒', '隐私设置'),
                  const SizedBox(height: 8),
                  ..._policies.map((p) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: _SheetCard(
                          color: AppTheme.softMint,
                          icon: null,
                          emoji: p.$1,
                          title: p.$2,
                          subtitle: p.$3,
                          onTap: null,
                        ),
                      )),
                  const SizedBox(height: 4),
                  _SheetCard(
                    color: AppTheme.warningColor,
                    emoji: '🧹',
                    title: '清除学习缓存',
                    subtitle: '清空本机学习进度记录（不影响账号与登录状态）',
                    trailing: const Icon(Icons.chevron_right_rounded, size: 22),
                    onTap: () => _confirmClearCache(context),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _confirmClearCache(BuildContext context) {
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: const Row(children: [
          Text('🧹 ', style: TextStyle(fontSize: 22)),
          Text('清除学习缓存'),
        ]),
        content: const Text('将清空本机保存的学习进度与完成记录，该操作不可恢复。确定继续吗？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('取消'),
          ),
          ElevatedButton(
            onPressed: () async {
              final prefs = await SharedPreferences.getInstance();
              await prefs.remove('completed_contents');
              await prefs.remove('today_minutes');
              if (dialogContext.mounted) Navigator.pop(dialogContext);
              if (context.mounted) _toast(context, '学习缓存已清除 🧹');
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.warningColor,
              foregroundColor: Colors.white,
            ),
            child: const Text('确定清除'),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// 5. 帮助与反馈（FAQ + 意见反馈本地保存）
// ─────────────────────────────────────────────────────────────

Future<void> showHelpFeedbackSheet(BuildContext context) {
  return _showSheet(
    context,
    const _HelpFeedbackSheet(),
    heightFactor: 0.74,
  );
}

class _HelpFeedbackSheet extends StatefulWidget {
  const _HelpFeedbackSheet();

  @override
  State<_HelpFeedbackSheet> createState() => _HelpFeedbackSheetState();
}

class _HelpFeedbackSheetState extends State<_HelpFeedbackSheet> {
  static const _faqs = [
    ('如何切换家长/孩子模式？', '在首页点击模式切换，家长模式需要输入家长密码验证。'),
    ('学习提醒不生效？', '请确认「通知设置」里已开启学习提醒，且提醒时间设置正确。'),
    ('如何更新到最新版本？', '进入「关于我们」，点击「检查更新」即可自动下载并安装新版本。'),
    ('对话内容安全吗？', '所有 AI 对话均经过儿童安全策略过滤，家长可在家长中心查看记录。'),
  ];

  final Set<int> _expanded = {};
  final TextEditingController _feedbackController = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _feedbackController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final text = _feedbackController.text.trim();
    if (text.isEmpty) {
      _toast(context, '先写点反馈内容吧', color: AppTheme.warningColor);
      return;
    }
    setState(() => _sending = true);
    try {
      final prefs = await SharedPreferences.getInstance();
      final list = prefs.getStringList('feedback_list') ?? [];
      list.add(jsonEncode({
        'content': text,
        'time': DateTime.now().toIso8601String(),
        'version': AppUpdateService.isSupported ? 'android' : 'web',
      }));
      await prefs.setStringList('feedback_list', list);
      if (mounted) {
        _feedbackController.clear();
        _toast(context, '感谢你的反馈，我们会认真阅读 💛');
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        children: [
          _sheetHandle(),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _sheetTitle('💬', '帮助与反馈'),
                  const SizedBox(height: 8),
                  const Text('常见问题',
                      style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.textSecondary)),
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: Column(
                      children: List.generate(_faqs.length, (i) {
                        final open = _expanded.contains(i);
                        return Column(
                          children: [
                            if (i > 0) const Divider(height: 1),
                            InkWell(
                              borderRadius: BorderRadius.circular(12),
                              onTap: () => setState(() =>
                                  open ? _expanded.remove(i) : _expanded.add(i)),
                              child: Padding(
                                padding:
                                    const EdgeInsets.symmetric(vertical: 14),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        '❓ ${_faqs[i].$1}',
                                        style: const TextStyle(
                                            fontSize: 15,
                                            fontWeight: FontWeight.w600,
                                            color: AppTheme.textColor),
                                      ),
                                    ),
                                    AnimatedRotation(
                                      turns: open ? 0.5 : 0,
                                      duration:
                                          const Duration(milliseconds: 150),
                                      child: const Icon(
                                          Icons.expand_more_rounded,
                                          size: 22,
                                          color: AppTheme.textSecondary),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            AnimatedCrossFade(
                              duration: const Duration(milliseconds: 150),
                              crossFadeState: open
                                  ? CrossFadeState.showSecond
                                  : CrossFadeState.showFirst,
                              firstChild: const SizedBox(width: double.infinity),
                              secondChild: Padding(
                                padding:
                                    const EdgeInsets.only(bottom: 14, left: 4),
                                child: Text(
                                  _faqs[i].$2,
                                  style: const TextStyle(
                                      fontSize: 14,
                                      height: 1.5,
                                      color: AppTheme.textSecondary),
                                ),
                              ),
                            ),
                          ],
                        );
                      }),
                    ),
                  ),
                  const SizedBox(height: 20),
                  const Text('意见反馈',
                      style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.textSecondary)),
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Column(
                      children: [
                        TextField(
                          controller: _feedbackController,
                          maxLines: 4,
                          maxLength: 300,
                          decoration: const InputDecoration(
                            hintText: '告诉我们你遇到的问题或建议…',
                            counterText: '',
                            border: InputBorder.none,
                          ),
                          style: const TextStyle(
                              fontSize: 14, color: AppTheme.textColor),
                        ),
                        const SizedBox(height: 8),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: _sending ? null : _submit,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppTheme.secondaryColor,
                              foregroundColor: Colors.white,
                              padding:
                                  const EdgeInsets.symmetric(vertical: 12),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(14)),
                            ),
                            child: Text(_sending ? '提交中…' : '提交反馈',
                                style: const TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.bold)),
                          ),
                        ),
                      ],
                    ),
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

// ─────────────────────────────────────────────────────────────
// 复用小组件
// ─────────────────────────────────────────────────────────────

class _SheetCard extends StatelessWidget {
  const _SheetCard({
    required this.color,
    required this.title,
    required this.subtitle,
    this.icon,
    this.emoji,
    this.trailing,
    this.onTap,
  });

  final Color color;
  final IconData? icon;
  final String? emoji;
  final String title;
  final String subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(14),
              ),
              child: emoji != null
                  ? Text(emoji!, style: const TextStyle(fontSize: 20))
                  : Icon(icon, size: 22, color: color),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.textColor)),
                  const SizedBox(height: 2),
                  Text(subtitle,
                      style: TextStyle(
                          fontSize: 12.5,
                          height: 1.4,
                          color: AppTheme.textSecondary)),
                ],
              ),
            ),
            if (trailing != null) trailing!,
          ],
        ),
      ),
    );
  }
}

class _SwitchRow extends StatelessWidget {
  const _SwitchRow({
    required this.emoji,
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onChanged,
  });

  final String emoji;
  final String title;
  final String subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Text(emoji, style: const TextStyle(fontSize: 20)),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.textColor)),
                Text(subtitle,
                    style: const TextStyle(
                        fontSize: 12, color: AppTheme.textSecondary)),
              ],
            ),
          ),
          Switch(
            value: value,
            activeThumbColor: AppTheme.secondaryColor,
            onChanged: onChanged,
          ),
        ],
      ),
    );
  }
}
