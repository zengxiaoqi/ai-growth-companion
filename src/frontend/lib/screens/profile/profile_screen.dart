import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../theme/child_theme.dart';
import '../../components/child_home_experience.dart';
import '../../providers/user_provider.dart';
import '../../providers/learning_provider.dart';
import '../../providers/content_provider.dart';
import '../achievement/achievement_data.dart';
import '../achievement/achievement_screen.dart';
import '../child/child_account_dialogs.dart';
import 'profile_menus.dart';

/// 孩子端「我的」页 —— 与 v2 主题（四皮肤 + 年龄密度）对齐。
///
/// 信息层级：页头（家长端 / 家长模式下仅标题）→ 身份贴纸卡（点击编辑资料）
/// → 徽章预览（看全部跳成就页）→ 外观主题（即时换肤）→ 设置分组 → 退出登录。
///
/// 顶部「设置」齿轮已移除：原设置页里真正有用的东西全部并入这里
/// （主题皮肤、清除缓存、版本与检查更新、开源许可、通知、资料），
/// 只留一个「我的」作为唯一入口，少一层跳转。
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final userProvider = context.watch<UserProvider>();
    final learningProvider = context.watch<LearningProvider>();
    final contents = context.watch<ContentProvider>().contents;
    final user = userProvider.currentUser ?? {};
    final name = user['name']?.toString() ?? '小朋友';
    final age = user['age'] is int ? user['age'] as int : 5;
    final palette = ChildThemePalette.of(context);
    final completed = learningProvider.completedContents.length;
    final isParent = userProvider.activeRole == 'parent';

    void openAchievements() {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => AchievementScreen(
            completedCount: completed,
            totalContents: contents.length,
          ),
        ),
      );
    }

    final earned =
        kChildAchievements.where((a) => completed >= a.threshold).length;

    return BubbleBackground(
      child: SafeArea(
        bottom: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildPageHeader(context, palette, isParent),
              const SizedBox(height: 14),
              _buildProfileHeader(context, palette, userProvider, name, age,
                  completed),
              const SizedBox(height: 22),
              ChildSectionTitle(
                title: '我的徽章',
                icon: Icons.workspace_premium_rounded,
                trailing: _allBadgesButton(palette, openAchievements),
              ),
              const SizedBox(height: 12),
              _buildBadgeStrip(context, palette, completed, openAchievements),
              // 家长端不走孩子皮肤（app.dart 里强制 honey），
              // 皮肤选择器放在家长页只会点了没反应，因此只对孩子展示。
              if (!isParent) ...[
                const SizedBox(height: 24),
                ChildSectionTitle(
                  title: '外观主题',
                  icon: Icons.palette_rounded,
                  trailing: Text('点一下即时换肤',
                      style: TextStyle(fontSize: 12, color: palette.ink2)),
                ),
                const SizedBox(height: 12),
                _buildThemeStrip(context, palette),
              ],
              const SizedBox(height: 24),
              ChildSectionTitle(
                title: '设置',
                icon: Icons.tune_rounded,
              ),
              const SizedBox(height: 12),
              _buildSettingsSection(context, userProvider, palette, isParent),
              const SizedBox(height: 22),
              _buildLogoutButton(context, userProvider, palette),
              if (earned > 0)
                Padding(
                  padding: const EdgeInsets.only(top: 14),
                  child: Center(
                    child: Text('已点亮 $earned 枚徽章',
                        style: TextStyle(fontSize: 12, color: palette.ink2)),
                  ),
                ),
              const SizedBox(height: 10),
              _buildSafetyFooter(palette),
            ],
          ),
        ),
      ),
    );
  }

  /// 页头：标题 + 家长端切换。
  ///
  /// 原来的「设置」齿轮已删除 —— 设置项全部并入下方分组，
  /// 不再需要一个单独的设置页和一次跳转。
  Widget _buildPageHeader(
      BuildContext context, ChildThemePalette palette, bool isParent) {
    return Row(
      children: [
        Expanded(
          child: Text('我的',
              style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: palette.ink)),
        ),
        if (!isParent)
          _HeaderIconButton(
            icon: Icons.swap_horiz_rounded,
            tooltip: '切换到家长端',
            onTap: () => showSwitchToParentDialog(context),
            palette: palette,
          ),
      ],
    );
  }

  Widget _allBadgesButton(ChildThemePalette palette, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('看全部',
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: palette.pop)),
            Icon(Icons.chevron_right_rounded, size: 18, color: palette.pop),
          ],
        ),
      ),
    );
  }

  /// 身份贴纸卡：头像 + 名字 + 年龄 + 今日完成数（真实数据，不造数字）。
  /// 整卡可点 → 直接编辑资料，省掉「设置里再找个人资料」这一步。
  Widget _buildProfileHeader(BuildContext context, ChildThemePalette palette,
      UserProvider userProvider, String name, int age, int completedCount) {
    return ChildJelly(
      onTap: () => showProfileEditSheet(context, userProvider),
      child: ChildSticker(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        strong: true,
        child: Row(children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: palette.soft,
              shape: BoxShape.circle,
              border: palette.isCartoon
                  ? Border.all(color: palette.edge, width: 3)
                  : null,
            ),
            child: const Center(
              child: Text('👧', style: TextStyle(fontSize: 38)),
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
          Column(
            children: [
              Icon(Icons.edit_rounded, size: 15, color: palette.ink2),
              const SizedBox(height: 2),
              Text('编辑',
                  style: TextStyle(
                      fontSize: 10.5,
                      fontWeight: FontWeight.w700,
                      color: palette.ink2)),
            ],
          ),
        ]),
      ),
    );
  }

  /// 徽章预览：一行 4 枚 + 「全部」入口。
  ///
  /// 原来用横滑列表，第 5 枚总是被屏幕边缘切一半（看着像 bug）；
  /// 改成固定一行，末尾放一个「全部 N 枚」贴纸，点进去才是成就页。
  Widget _buildBadgeStrip(
    BuildContext context,
    ChildThemePalette palette,
    int completed,
    VoidCallback onOpen,
  ) {
    final preview = kChildAchievements.take(4).toList();

    return Row(
      children: [
        for (var i = 0; i < preview.length; i++) ...[
          Expanded(
            child: _MiniBadge(
              item: preview[i],
              color: palette.subjects[i % palette.subjects.length],
              unlocked: completed >= preview[i].threshold,
              onTap: onOpen,
            ),
          ),
          const SizedBox(width: 8),
        ],
        Expanded(
          child: GestureDetector(
            onTap: onOpen,
            child: Container(
              height: 88,
              decoration: BoxDecoration(
                color: Color.alphaBlend(
                    palette.pop.withValues(alpha: 0.10), palette.card),
                borderRadius: BorderRadius.circular(palette.radiusMd),
                border: Border.all(
                    color: palette.pop.withValues(alpha: 0.45),
                    width: palette.isCartoon ? 2 : 1.2),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.add_rounded, size: 22, color: palette.pop),
                  const SizedBox(height: 4),
                  Text('全部',
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          color: palette.pop)),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  /// 外观主题：五套皮肤横滑选择，点一下 [ChildThemeController] 即时换肤。
  ///
  /// 这块原先藏在设置页最深处（要滚两屏才看到），但它是「我的」页里
  /// 最值得被孩子自己玩的功能，所以直接铺到首页面上。
  Widget _buildThemeStrip(BuildContext context, ChildThemePalette palette) {
    final controller = context.watch<ChildThemeController>();

    return SizedBox(
      height: 92,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: EdgeInsets.zero,
        physics: const BouncingScrollPhysics(),
        itemCount: kChildThemeOptions.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, index) {
          final option = kChildThemeOptions[index];
          final selected = controller.mode == option.mode;
          final swatches = option.swatches;

          return ChildJelly(
            onTap: () =>
                context.read<ChildThemeController>().setMode(option.mode),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              width: 92,
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
              decoration: BoxDecoration(
                color: Color.alphaBlend(
                    swatches.first.withValues(alpha: selected ? 0.20 : 0.08),
                    palette.card),
                borderRadius: BorderRadius.circular(palette.radiusMd),
                border: Border.all(
                  color: selected
                      ? palette.pop
                      : (palette.isCartoon
                          ? palette.line
                          : palette.line.withValues(alpha: 0.85)),
                  width: selected ? 2.5 : (palette.isCartoon ? 2 : 1),
                ),
                boxShadow: selected
                    ? <BoxShadow>[
                        BoxShadow(
                          color: palette.pop.withValues(alpha: 0.28),
                          offset: const Offset(0, 3),
                          blurRadius: 0,
                        ),
                      ]
                    : null,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      for (final c in swatches.take(3))
                        Container(
                          width: 11,
                          height: 11,
                          margin: const EdgeInsets.only(right: 3),
                          decoration: BoxDecoration(
                            color: c,
                            shape: BoxShape.circle,
                            border: Border.all(color: palette.card, width: 1.5),
                          ),
                        ),
                    ],
                  ),
                  Text(
                    option.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      color: palette.ink,
                    ),
                  ),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          option.ageLabel,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                            color: palette.ink2,
                          ),
                        ),
                      ),
                      if (selected)
                        Icon(Icons.check_circle_rounded,
                            size: 14, color: palette.pop),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  /// 设置分组：原设置页里仍有用的入口全部收进这一份列表。
  ///
  /// 「字体大小 / 深色模式 / 音量 / 保存设置」这几个开关在原设置页里
  /// 只改本地 state，不影响任何实际表现（字号没接 MediaQuery、
  /// 深色由「星际小队」皮肤提供、音量没有音频通道），因此没有搬过来；
  /// 换成能真正生效的「主题 + 清除缓存 + 版本/更新 + 许可」。
  Widget _buildSettingsSection(BuildContext context, UserProvider userProvider,
      ChildThemePalette palette, bool isParent) {
    final settings = <({IconData icon, String title, String subtitle, Color color, VoidCallback onTap})>[
      (
        icon: Icons.person_rounded,
        title: '个人资料',
        subtitle: isParent ? '昵称 · 手机号' : '昵称 · 年龄 · 头像',
        color: palette.subjects[0],
        onTap: () => showProfileEditSheet(context, userProvider),
      ),
      (
        icon: Icons.notifications_rounded,
        title: '通知设置',
        subtitle: '学习提醒时间与提醒声音',
        color: palette.subjects[1],
        onTap: () => showNotificationSettingsSheet(context),
      ),
      (
        icon: Icons.lock_rounded,
        title: '隐私设置',
        subtitle: '数据说明 · 清除本机学习缓存',
        color: palette.subjects[3],
        onTap: () => showPrivacySheet(context),
      ),
      (
        icon: Icons.chat_bubble_rounded,
        title: '帮助与反馈',
        subtitle: '常见问题 · 意见反馈',
        color: palette.subjects[4],
        onTap: () => showHelpFeedbackSheet(context),
      ),
      (
        icon: Icons.info_rounded,
        title: '关于我们',
        subtitle: '版本信息 · 检查更新',
        color: palette.subjects[5],
        onTap: () => showAboutSheet(context),
      ),
      (
        icon: Icons.menu_book_rounded,
        title: '开源数据与许可',
        subtitle: '汉字笔顺 · 插图 · 拼音数据来源',
        color: palette.subjects[2],
        onTap: () => showAttributionSheet(context),
      ),
    ];

    return ChildSticker(
      width: double.infinity,
      padding: EdgeInsets.zero,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(palette.radiusLg),
        child: Column(
          children: settings.asMap().entries.map((entry) {
            final item = entry.value;
            return _SettingItem(
              icon: item.icon,
              title: item.title,
              subtitle: item.subtitle,
              color: item.color,
              isLast: entry.key == settings.length - 1,
              onTap: item.onTap,
            );
          }).toList(),
        ),
      ),
    );
  }

  /// 页尾安全承诺：原设置页「内容安全 · 已启用」那一行的轻量化落点。
  Widget _buildSafetyFooter(ChildThemePalette palette) {
    return Center(
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.verified_user_rounded, size: 13, color: palette.ink2),
          const SizedBox(width: 5),
          Text(
            '内容安全实时过滤 · 无广告无追踪',
            style: TextStyle(fontSize: 11.5, color: palette.ink2),
          ),
        ],
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
              title: Row(
                children: [
                  Icon(Icons.logout_rounded, size: 22, color: palette.pop),
                  const SizedBox(width: 8),
                  Text('退出登录',
                      style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: palette.ink)),
                ],
              ),
              content: Text('确定要退出登录吗？', style: TextStyle(color: palette.ink2)),
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

/// 页头右侧的圆形图标按钮（家长端切换）。
class _HeaderIconButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;
  final ChildThemePalette palette;

  const _HeaderIconButton({
    required this.icon,
    required this.tooltip,
    required this.onTap,
    required this.palette,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          width: 42,
          height: 42,
          decoration: BoxDecoration(
            color: palette.soft,
            borderRadius: BorderRadius.circular(14),
            border: palette.isCartoon
                ? Border.all(color: palette.line, width: 2)
                : null,
          ),
          child: Icon(icon, size: 20, color: palette.ink2),
        ),
      ),
    );
  }
}

/// 徽章预览里的小贴纸
class _MiniBadge extends StatelessWidget {
  final ChildAchievement item;
  final Color color;
  final bool unlocked;
  final VoidCallback onTap;

  const _MiniBadge({
    required this.item,
    required this.color,
    required this.unlocked,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 88,
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
        decoration: BoxDecoration(
          color: palette.card,
          borderRadius: BorderRadius.circular(palette.radiusMd),
          border: palette.isCartoon
              ? Border.all(
                  color: unlocked
                      ? palette.line
                      : palette.line.withValues(alpha: 0.6),
                  width: 2)
              : null,
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 38,
              height: 38,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: Color.alphaBlend(
                    color.withValues(alpha: unlocked ? 0.16 : 0.07),
                    palette.card),
                shape: BoxShape.circle,
              ),
              child: Text(
                item.icon,
                style: TextStyle(
                  fontSize: 18,
                  color: unlocked ? null : palette.ink2,
                ),
              ),
            ),
            const SizedBox(height: 6),
            Text(item.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w700,
                    color: unlocked
                        ? palette.ink2
                        : palette.ink2.withValues(alpha: 0.7))),
          ],
        ),
      ),
    );
  }
}

class _SettingItem extends StatefulWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  final bool isLast;
  final VoidCallback onTap;

  const _SettingItem({
    required this.icon,
    required this.title,
    required this.subtitle,
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
      behavior: HitTestBehavior.opaque,
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
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Color.alphaBlend(
                      widget.color.withValues(alpha: 0.16), palette.card),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(widget.icon, size: 19, color: widget.color),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.title,
                      style: TextStyle(
                        fontSize: 15.5,
                        fontWeight: FontWeight.w600,
                        color: palette.ink,
                      ),
                    ),
                    const SizedBox(height: 1),
                    Text(
                      widget.subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 11.5, color: palette.ink2),
                    ),
                  ],
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
