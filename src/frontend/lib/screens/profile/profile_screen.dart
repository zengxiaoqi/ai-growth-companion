import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../theme/child_theme.dart';
import '../../components/child_home_experience.dart';
import '../../providers/user_provider.dart';
import '../../providers/learning_provider.dart';
import '../achievement/achievement_data.dart';
import '../achievement/achievement_screen.dart';
import 'profile_menus.dart';

/// 孩子端「我的」页 —— 与 v2 主题（四皮肤 + 年龄密度）对齐。
///
/// 信息层级：身份贴纸卡 → 徽章预览（可跳成就页）→ 设置分组 → 退出登录。
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final userProvider = context.watch<UserProvider>();
    final learningProvider = context.watch<LearningProvider>();
    final user = userProvider.currentUser ?? {};
    final name = user['name']?.toString() ?? '小朋友';
    final age = user['age'] is int ? user['age'] as int : 5;
    final palette = ChildThemePalette.of(context);

    return BubbleBackground(
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('我的',
                  style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w800,
                      color: palette.ink)),
              const SizedBox(height: 16),
              _buildProfileHeader(palette, name, age,
                  learningProvider.completedContents.length),
              const SizedBox(height: 22),
              _sectionTitle(palette, '我的徽章', '🏅',
                  action: '看全部',
                  onAction: () => Navigator.of(context).push(
                        MaterialPageRoute(
                            builder: (_) =>
                                const AchievementScreen(showBack: true)),
                      )),
              const SizedBox(height: 12),
              _buildBadgeStrip(context, palette),
              const SizedBox(height: 24),
              _sectionTitle(palette, '设置', '⚙️'),
              const SizedBox(height: 12),
              _buildSettingsSection(context, userProvider, palette),
              const SizedBox(height: 24),
              _buildLogoutButton(context, userProvider, palette),
            ],
          ),
        ),
      ),
    );
  }

  Widget _sectionTitle(ChildThemePalette palette, String title, String emoji,
      {String? action, VoidCallback? onAction}) {
    return Row(children: [
      Text(emoji, style: const TextStyle(fontSize: 18)),
      const SizedBox(width: 6),
      Expanded(
        child: Text(title,
            style: TextStyle(
                fontSize: 17, fontWeight: FontWeight.w800, color: palette.ink)),
      ),
      if (action != null)
        GestureDetector(
          onTap: onAction,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Text(action,
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: palette.pop)),
              Icon(Icons.chevron_right_rounded, size: 18, color: palette.pop),
            ]),
          ),
        ),
    ]);
  }

  /// 身份贴纸卡：头像 + 名字 + 年龄 + 今日完成数（真实数据，不造数字）
  Widget _buildProfileHeader(
      ChildThemePalette palette, String name, int age, int completedCount) {
    return ChildSticker(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      strong: true,
      child: Row(children: [
        Container(
          width: 76,
          height: 76,
          decoration: BoxDecoration(
            color: palette.soft,
            shape: BoxShape.circle,
            border: palette.isCartoon
                ? Border.all(color: palette.edge, width: 3)
                : null,
          ),
          child: const Center(
            child: Text('👧', style: TextStyle(fontSize: 40)),
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                      color: palette.ink)),
              const SizedBox(height: 6),
              Row(children: [
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: palette.soft,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Text('$age 岁',
                      style: TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                          color: palette.ink2)),
                ),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    completedCount > 0 ? '今天完成 $completedCount 个' : '今天还没开始',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12.5, color: palette.ink2),
                  ),
                ),
              ]),
            ],
          ),
        ),
        const Text('🦄', style: TextStyle(fontSize: 28)),
      ]),
    );
  }

  /// 徽章横滑预览：内容与成就页同源，点击进成就页看详情
  Widget _buildBadgeStrip(BuildContext context, ChildThemePalette palette) {
    return SizedBox(
      height: 96,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.only(right: 20),
        itemCount: kChildAchievements.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, index) {
          final a = kChildAchievements[index];
          final color = palette.subjects[index % palette.subjects.length];
          return GestureDetector(
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(
                  builder: (_) => const AchievementScreen(showBack: true)),
            ),
            child: Container(
              width: 82,
              padding: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                color: palette.card,
                borderRadius: BorderRadius.circular(palette.radiusMd),
                border: palette.isCartoon
                    ? Border.all(color: palette.line, width: 2)
                    : null,
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: Color.alphaBlend(
                          color.withValues(alpha: 0.16), palette.card),
                      shape: BoxShape.circle,
                    ),
                    child: Text(a.icon, style: const TextStyle(fontSize: 20)),
                  ),
                  const SizedBox(height: 6),
                  Text(a.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: palette.ink2)),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildSettingsSection(BuildContext context, UserProvider userProvider,
      ChildThemePalette palette) {
    final settings = [
      {
        'icon': Icons.person_rounded,
        'title': '个人资料',
        'emoji': '👤',
        'color': palette.subjects[0]
      },
      {
        'icon': Icons.notifications_rounded,
        'title': '通知设置',
        'emoji': '🔔',
        'color': palette.subjects[1]
      },
      {
        'icon': Icons.lock_rounded,
        'title': '隐私设置',
        'emoji': '🔒',
        'color': palette.subjects[3]
      },
      {
        'icon': Icons.help_rounded,
        'title': '帮助与反馈',
        'emoji': '💬',
        'color': palette.subjects[4]
      },
      {
        'icon': Icons.info_rounded,
        'title': '关于我们',
        'emoji': 'ℹ️',
        'color': palette.subjects[5]
      },
    ];

    void onSettingTap(String title) {
      switch (title) {
        case '个人资料':
          showProfileEditSheet(context, userProvider);
          return;
        case '通知设置':
          showNotificationSettingsSheet(context);
          return;
        case '隐私设置':
          showPrivacySheet(context);
          return;
        case '帮助与反馈':
          showHelpFeedbackSheet(context);
          return;
        case '关于我们':
          showAboutSheet(context);
          return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('$title — 功能开发中，敬请期待 ✨'),
          behavior: SnackBarBehavior.floating,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          duration: const Duration(seconds: 2),
        ),
      );
    }

    return ChildSticker(
      width: double.infinity,
      padding: EdgeInsets.zero,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(palette.radiusLg),
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
              onTap: () => onSettingTap(item['title'] as String),
            );
          }).toList(),
        ),
      ),
    );
  }

  /// 退出登录：孩子端弱化为「描边浅红」，不再用整屏最抢眼的红渐变
  Widget _buildLogoutButton(BuildContext context, UserProvider userProvider,
      ChildThemePalette palette) {
    return SizedBox(
      width: double.infinity,
      child: GestureDetector(
        onTap: () {
          showDialog(
            context: context,
            builder: (context) => AlertDialog(
              backgroundColor: palette.card,
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
                  onPressed: () async {
                    Navigator.pop(context);
                    await userProvider.logout();
                    // Consumer 会自动重建 home 为 LoginScreen
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      Navigator.of(context, rootNavigator: true)
                          .popUntil((route) => route.isFirst);
                    });
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.red[400],
                    foregroundColor: Colors.white,
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
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(
            color: palette.card,
            borderRadius: BorderRadius.circular(palette.radiusLg),
            border: Border.all(
                color: Colors.red.withValues(alpha: 0.45),
                width: palette.isCartoon ? 2 : 1.5),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.logout_rounded,
                  size: 20, color: Colors.red.withValues(alpha: 0.85)),
              const SizedBox(width: 8),
              Text(
                '退出登录',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: Colors.red.withValues(alpha: 0.85),
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
    final palette = ChildThemePalette.of(context);
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
          color: _isPressed
              ? Color.alphaBlend(
                  widget.color.withValues(alpha: 0.10), palette.card)
              : Colors.transparent,
          border: widget.isLast
              ? null
              : Border(
                  bottom: BorderSide(
                      color: palette.line, width: palette.isCartoon ? 1.5 : 1)),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(9),
                decoration: BoxDecoration(
                  color: Color.alphaBlend(
                      widget.color.withValues(alpha: 0.16), palette.card),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(widget.emoji, style: const TextStyle(fontSize: 19)),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Text(
                  widget.title,
                  style: TextStyle(
                    fontSize: 15.5,
                    fontWeight: FontWeight.w600,
                    color: palette.ink,
                  ),
                ),
              ),
              Icon(
                Icons.chevron_right_rounded,
                color: palette.ink2,
                size: 22,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
