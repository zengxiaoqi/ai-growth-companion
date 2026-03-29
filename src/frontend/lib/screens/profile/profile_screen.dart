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

    return BubbleBackground(
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            children: [
              // 头像和名字
              _buildProfileHeader(name, age),
              const SizedBox(height: 32),
              
              // 设置列表
              _buildSettingsSection(),
              const SizedBox(height: 24),
              
              // 退出登录
              _buildLogoutButton(context, userProvider),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildProfileHeader(String name, int age) {
    return Column(
      children: [
        // 头像容器
        Container(
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: const LinearGradient(
              colors: [AppTheme.primaryColor, Color(0xFFFF9EBB)],
            ),
            boxShadow: AppTheme.glowShadow(AppTheme.primaryColor),
          ),
          child: Container(
            width: 100,
            height: 100,
            decoration: BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: AppTheme.primaryColor.withOpacity(0.2),
                  blurRadius: 20,
                ),
              ],
            ),
            child: const Center(
              child: Text('👧', style: TextStyle(fontSize: 50)),
            ),
          ),
        ),
        const SizedBox(height: 20),
        
        // 名字
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('✨', style: TextStyle(fontSize: 20)),
            const SizedBox(width: 8),
            Text(
              name,
              style: const TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.bold,
                color: AppTheme.textColor,
              ),
            ),
            const SizedBox(width: 8),
            const Text('✨', style: TextStyle(fontSize: 20)),
          ],
        ),
        const SizedBox(height: 8),
        
        // 年龄标签
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
          decoration: BoxDecoration(
            color: AppTheme.secondaryColor.withOpacity(0.15),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cake_rounded, size: 18, color: AppTheme.secondaryColor),
              const SizedBox(width: 6),
              Text(
                '$age 岁',
                style: const TextStyle(
                  fontSize: 16,
                  color: AppTheme.secondaryColor,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        
        // 装饰星星
        const Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            StarDecoration(size: 16, color: AppTheme.softYellow),
            SizedBox(width: 8),
            HeartDecoration(size: 16, color: AppTheme.primaryColor),
            SizedBox(width: 8),
            StarDecoration(size: 16, color: AppTheme.softPurple),
          ],
        ),
      ],
    );
  }

  Widget _buildSettingsSection() {
    final settings = [
      {'icon': Icons.person_rounded, 'title': '个人资料', 'emoji': '👤', 'color': AppTheme.primaryColor},
      {'icon': Icons.notifications_rounded, 'title': '通知设置', 'emoji': '🔔', 'color': AppTheme.secondaryColor},
      {'icon': Icons.lock_rounded, 'title': '隐私设置', 'emoji': '🔒', 'color': AppTheme.accentColor},
      {'icon': Icons.help_rounded, 'title': '帮助与反馈', 'emoji': '💬', 'color': AppTheme.softYellow},
      {'icon': Icons.info_rounded, 'title': '关于我们', 'emoji': 'ℹ️', 'color': AppTheme.softPurple},
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Row(
          children: [
            Text('⚙️', style: TextStyle(fontSize: 20)),
            SizedBox(width: 8),
            Text(
              '设置',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: AppTheme.textColor,
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(24),
            boxShadow: [
              BoxShadow(
                color: AppTheme.primaryColor.withOpacity(0.1),
                blurRadius: 20,
                offset: const Offset(0, 5),
              ),
            ],
          ),
          child: Column(
            children: settings.asMap().entries.map((entry) {
              final index = entry.key;
              final item = entry.value;
              final isLast = index == settings.length - 1;
              return _SettingItem(
                icon: item['icon'] as IconData,
                title: item['title'] as String,
                emoji: item['emoji'] as String,
                color: item['color'] as Color,
                isLast: isLast,
                onTap: () {},
              );
            }).toList(),
          ),
        ),
      ],
    );
  }

  Widget _buildLogoutButton(BuildContext context, UserProvider userProvider) {
    return SizedBox(
      width: double.infinity,
      child: GestureDetector(
        onTap: () {
          showDialog(
            context: context,
            builder: (context) => AlertDialog(
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(24),
              ),
              title: const Row(
                children: [
                  Text('🚪 ', style: TextStyle(fontSize: 24)),
                  Text('退出登录'),
                ],
              ),
              content: const Text('确定要退出登录吗？'),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('取消'),
                ),
                ElevatedButton(
                  onPressed: () {
                    Navigator.pop(context);
                    userProvider.logout();
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.red[400],
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  child: const Text('确定'),
                ),
              ],
            ),
          );
        },
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 18),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                Colors.red[300]!,
                Colors.red[400]!,
              ],
            ),
            borderRadius: BorderRadius.circular(24),
            boxShadow: [
              BoxShadow(
                color: Colors.red.withOpacity(0.3),
                blurRadius: 15,
                offset: const Offset(0, 5),
              ),
            ],
          ),
          child: const Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.logout_rounded, color: Colors.white),
              SizedBox(width: 8),
              Text(
                '退出登录',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SettingItem extends StatefulWidget {
  final IconData icon;
  final String title;
  final String emoji;
  final Color color;
  final bool isLast;
  final VoidCallback onTap;

  const _SettingItem({
    required this.icon,
    required this.title,
    required this.emoji,
    required this.color,
    required this.isLast,
    required this.onTap,
  });

  @override
  State<_SettingItem> createState() => _SettingItemState();
}

class _SettingItemState extends State<_SettingItem> {
  bool _isPressed = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => setState(() => _isPressed = true),
      onTapUp: (_) {
        setState(() => _isPressed = false);
        widget.onTap();
      },
      onTapCancel: () => setState(() => _isPressed = false),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 100),
        decoration: BoxDecoration(
          color: _isPressed ? widget.color.withOpacity(0.05) : Colors.transparent,
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(widget.isLast ? 24 : 0),
            bottom: Radius.circular(widget.isLast ? 24 : 0),
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: widget.color.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Text(widget.emoji, style: const TextStyle(fontSize: 20)),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Text(
                  widget.title,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textColor,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: widget.color.withOpacity(0.1),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  Icons.chevron_right_rounded,
                  color: widget.color,
                  size: 22,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}