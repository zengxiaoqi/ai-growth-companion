import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../providers/user_provider.dart';
import '../../services/storage_service.dart';
import '../../components/top_bar.dart';
import '../profile/profile_screen.dart';
import '../achievement/achievement_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _darkMode = false;
  bool _largeFont = false;
  bool _notification = true;
  double _volume = 80;
  bool _isSaving = false;
  bool _saveSuccess = false;

  @override
  Widget build(BuildContext context) {
    final userProvider = context.watch<UserProvider>();
    final user = userProvider.currentUser ?? {};
    final name = user['name'] ?? '用户';
    final phone = user['phone'] ?? '';
    final type = user['type'] ?? 'child';

    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      body: Column(
        children: [
          // 顶部导航
          TopBar(
            title: '设置',
            leftSlot: IconButton(
              onPressed: () => Navigator.pop(context),
              icon: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppTheme.backgroundColor,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.arrow_back_rounded, size: 20, color: AppTheme.textColor),
              ),
            ),
          ),

          // 内容
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Column(
                children: [
                  // 用户信息卡片
                  _buildUserCard(name, phone, type),
                  const SizedBox(height: 16),

                  // 快捷入口
                  _buildQuickLinks(),
                  const SizedBox(height: 16),

                  // 显示与声音
                  _buildDisplaySettings(),
                  const SizedBox(height: 16),

                  // 通知设置
                  _buildNotificationSection(),
                  const SizedBox(height: 16),

                  // 缓存与存储
                  _buildCacheSection(),
                  const SizedBox(height: 16),

                  // 关于
                  _buildAboutSection(),
                  const SizedBox(height: 16),

                  // 保存按钮
                  _buildSaveButton(),
                  const SizedBox(height: 12),

                  // 退出登录
                  _buildLogoutButton(userProvider),
                  const SizedBox(height: 32),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  // 用户信息卡片
  Widget _buildUserCard(String name, String phone, String type) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: AppTheme.primaryColor.withOpacity(0.06),
            blurRadius: 15,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        children: [
          // 头像
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: AppTheme.primaryColor.withOpacity(0.15),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Center(
              child: Text(
                name.isNotEmpty ? name[0] : '?',
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.primaryColor,
                ),
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.textColor,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${type == 'parent' ? '家长端' : '学生端'} · $phone',
                  style: const TextStyle(
                    fontSize: 14,
                    color: AppTheme.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // 快捷入口
  Widget _buildQuickLinks() {
    return _SettingsCard(
      title: '快捷入口',
      children: [
        Row(
          children: [
            Expanded(
              child: _QuickLinkButton(
                icon: Icons.account_circle_rounded,
                label: '个人资料',
                subtitle: '头像、昵称、年龄',
                color: AppTheme.secondaryColor,
                onTap: () {
                  Navigator.push(context, MaterialPageRoute(builder: (_) => const ProfileScreen()));
                },
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _QuickLinkButton(
                icon: Icons.emoji_events_rounded,
                label: '我的成就',
                subtitle: '徽章、里程碑',
                color: AppTheme.accentColor,
                onTap: () {
                  Navigator.push(context, MaterialPageRoute(builder: (_) => const AchievementScreen()));
                },
              ),
            ),
          ],
        ),
      ],
    );
  }

  // 显示与声音设置
  Widget _buildDisplaySettings() {
    return _SettingsCard(
      title: '显示与声音',
      children: [
        _SettingsRow(
          icon: Icons.text_fields_rounded,
          title: '字体大小',
          description: _largeFont ? '放大字号' : '标准字号',
          color: AppTheme.primaryColor,
          trailing: _buildSwitch(
            value: _largeFont,
            onChanged: (v) => setState(() => _largeFont = v),
          ),
        ),
        const SizedBox(height: 10),
        _SettingsRow(
          icon: Icons.dark_mode_rounded,
          title: '深色模式',
          description: _darkMode ? '已开启' : '已关闭',
          color: AppTheme.primaryColor,
          trailing: _buildSwitch(
            value: _darkMode,
            onChanged: (v) => setState(() => _darkMode = v),
          ),
        ),
        const SizedBox(height: 10),
        _SettingsRow(
          icon: Icons.volume_up_rounded,
          title: '音量',
          description: '当前 ${_volume.toInt()}%',
          color: AppTheme.primaryColor,
          trailing: SizedBox(
            width: 120,
            child: SliderTheme(
              data: SliderThemeData(
                activeTrackColor: AppTheme.primaryColor,
                inactiveTrackColor: AppTheme.primaryColor.withOpacity(0.2),
                thumbColor: AppTheme.primaryColor,
                trackHeight: 4,
                thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 8),
              ),
              child: Slider(
                value: _volume,
                min: 0,
                max: 100,
                onChanged: (v) => setState(() => _volume = v),
              ),
            ),
          ),
        ),
      ],
    );
  }

  // Switch 开关
  Widget _buildSwitch({required bool value, required ValueChanged<bool> onChanged}) {
    return GestureDetector(
      onTap: () => onChanged(!value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        width: 48,
        height: 28,
        decoration: BoxDecoration(
          color: value ? AppTheme.primaryColor : AppTheme.textSecondary.withOpacity(0.35),
          borderRadius: BorderRadius.circular(14),
        ),
        child: AnimatedAlign(
          duration: const Duration(milliseconds: 200),
          alignment: value ? Alignment.centerRight : Alignment.centerLeft,
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 4),
            width: 20,
            height: 20,
            decoration: BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.1),
                  blurRadius: 4,
                  offset: const Offset(0, 1),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // 关于
  Widget _buildAboutSection() {
    return _SettingsCard(
      title: '关于',
      children: [
        _SettingsRow(
          icon: Icons.shield_rounded,
          title: '内容安全',
          description: '实时过滤不适宜内容，保护学习环境',
          color: AppTheme.primaryColor,
          trailing: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: AppTheme.accentColor.withOpacity(0.15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Text(
              '已启用',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: AppTheme.accentColor,
              ),
            ),
          ),
        ),
        const SizedBox(height: 10),
        _SettingsRow(
          icon: Icons.info_outline_rounded,
          title: '应用版本',
          description: '灵犀伴学 Flutter 端',
          color: AppTheme.primaryColor,
          trailing: const Text(
            'v1.0.0',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.bold,
              color: AppTheme.textSecondary,
            ),
          ),
        ),
      ],
    );
  }

  // 通知设置
  Widget _buildNotificationSection() {
    return _SettingsCard(
      title: '通知',
      children: [
        _SettingsRow(
          icon: Icons.notifications_active_rounded,
          title: '推送通知',
          description: _notification ? '接收学习提醒和消息' : '已关闭',
          color: AppTheme.secondaryColor,
          trailing: _buildSwitch(
            value: _notification,
            onChanged: (v) => setState(() => _notification = v),
          ),
        ),
        const SizedBox(height: 10),
        _SettingsRow(
          icon: Icons.schedule_rounded,
          title: '学习提醒',
          description: '每日定时提醒学习',
          color: AppTheme.accentColor,
          trailing: _buildSwitch(
            value: _notification,
            onChanged: (v) => setState(() {}),
          ),
        ),
      ],
    );
  }

  // 缓存与存储
  Widget _buildCacheSection() {
    return _SettingsCard(
      title: '存储',
      children: [
        GestureDetector(
          onTap: () async {
            final storage = context.read<StorageService>();
            await storage.clearCache();
            if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: const Text('缓存已清除'),
                  backgroundColor: AppTheme.accentColor,
                  behavior: SnackBarBehavior.floating,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
              );
            }
          },
          child: _SettingsRow(
            icon: Icons.cleaning_services_rounded,
            title: '清除缓存',
            description: '清除学习记录和临时数据',
            color: AppTheme.warningColor,
            trailing: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: AppTheme.warningColor.withOpacity(0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                '清除',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.warningColor,
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  // 保存按钮
  Widget _buildSaveButton() {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: ElevatedButton(
        onPressed: _isSaving
            ? null
            : () async {
                setState(() {
                  _isSaving = true;
                  _saveSuccess = false;
                });
                // 模拟保存
                await Future.delayed(const Duration(milliseconds: 500));
                if (mounted) {
                  setState(() {
                    _isSaving = false;
                    _saveSuccess = true;
                  });
                  Future.delayed(const Duration(seconds: 2), () {
                    if (mounted) setState(() => _saveSuccess = false);
                  });
                }
              },
        style: ElevatedButton.styleFrom(
          backgroundColor: _saveSuccess ? AppTheme.accentColor : AppTheme.primaryColor,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          elevation: 0,
        ),
        child: _isSaving
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5),
              )
            : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    _saveSuccess ? Icons.check_circle_rounded : Icons.save_rounded,
                    color: Colors.white,
                    size: 20,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    _saveSuccess ? '保存成功' : '保存设置',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
      ),
    );
  }

  // 退出登录按钮
  Widget _buildLogoutButton(UserProvider userProvider) {
    return SizedBox(
      width: double.infinity,
      child: GestureDetector(
        onTap: () {
          showDialog(
            context: context,
            builder: (ctx) => AlertDialog(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
              title: const Row(
                children: [
                  Text('🚪 ', style: TextStyle(fontSize: 24)),
                  Text('退出登录'),
                ],
              ),
              content: const Text('确定要退出登录吗？'),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('取消'),
                ),
                ElevatedButton(
                  onPressed: () {
                    Navigator.pop(ctx);
                    userProvider.logout();
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.red[400],
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                  child: const Text('确定', style: TextStyle(color: Colors.white)),
                ),
              ],
            ),
          );
        },
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 16),
          decoration: BoxDecoration(
            color: Colors.red.shade50,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Colors.red.shade200),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.logout_rounded, color: Colors.red.shade400, size: 20),
              const SizedBox(width: 8),
              Text(
                '退出登录',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: Colors.red.shade400,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// 设置卡片容器
class _SettingsCard extends StatelessWidget {
  final String title;
  final List<Widget> children;

  const _SettingsCard({required this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: AppTheme.primaryColor.withOpacity(0.06),
            blurRadius: 15,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title.toUpperCase(),
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.bold,
              letterSpacing: 1,
              color: AppTheme.textSecondary,
            ),
          ),
          const SizedBox(height: 14),
          ...children,
        ],
      ),
    );
  }
}

// 设置行
class _SettingsRow extends StatelessWidget {
  final IconData icon;
  final String title;
  final String description;
  final Color color;
  final Widget trailing;

  const _SettingsRow({
    required this.icon,
    required this.title,
    required this.description,
    required this.color,
    required this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: AppTheme.backgroundColor,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, size: 20, color: color),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.textColor,
                ),
              ),
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
        trailing,
      ],
    );
  }
}

// 快捷入口按钮
class _QuickLinkButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final String subtitle;
  final Color color;
  final VoidCallback onTap;

  const _QuickLinkButton({
    required this.icon,
    required this.label,
    required this.subtitle,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppTheme.backgroundColor,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: color.withOpacity(0.15),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, size: 20, color: color),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textColor,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppTheme.textSecondary,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
