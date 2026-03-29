import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../providers/user_provider.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final userProvider = context.watch<UserProvider>();
    final user = userProvider.currentUser ?? {};
    final name = user['name'] ?? '小朋友';
    final age = user['age'] ?? 5;

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            // 头像
            Container(
              width: 100,
              height: 100,
              decoration: BoxDecoration(
                color: AppTheme.primaryColor.withOpacity(0.2),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.child_care,
                size: 50,
                color: AppTheme.primaryColor,
              ),
            ),
            const SizedBox(height: 16),
            
            // 名字
            Text(
              name,
              style: const TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
            ),
            Text(
              '$age 岁',
              style: TextStyle(
                fontSize: 16,
                color: Colors.grey[600],
              ),
            ),
            const SizedBox(height: 24),
            
            // 设置列表
            _SettingItem(
              icon: Icons.person_outline,
              title: '个人资料',
              onTap: () {},
            ),
            _SettingItem(
              icon: Icons.notifications_outlined,
              title: '通知设置',
              onTap: () {},
            ),
            _SettingItem(
              icon: Icons.lock_outline,
              title: '隐私设置',
              onTap: () {},
            ),
            _SettingItem(
              icon: Icons.help_outline,
              title: '帮助与反馈',
              onTap: () {},
            ),
            _SettingItem(
              icon: Icons.info_outline,
              title: '关于我们',
              onTap: () {},
            ),
            const SizedBox(height: 24),
            
            // 退出登录
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  userProvider.logout();
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red[400],
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: const Text('退出登录'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SettingItem extends StatelessWidget {
  final IconData icon;
  final String title;
  final VoidCallback onTap;

  const _SettingItem({
    required this.icon,
    required this.title,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
      ),
      child: ListTile(
        leading: Icon(icon, color: AppTheme.primaryColor),
        title: Text(title),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}