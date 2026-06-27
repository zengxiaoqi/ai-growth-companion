import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../../components/bottom_nav.dart';
import '../../components/top_bar.dart';
import '../../components/notification_panel.dart';
import '../../providers/user_provider.dart';
import '../learning/learning_home_screen.dart';
import '../profile/profile_screen.dart';
import 'growth_report_screen.dart';
import 'child_selector.dart';

class ParentHomeScreen extends StatefulWidget {
  const ParentHomeScreen({super.key});

  @override
  State<ParentHomeScreen> createState() => _ParentHomeScreenState();
}

class _ParentHomeScreenState extends State<ParentHomeScreen> {
  int _currentIndex = 0;

  static const _navItems = [
    BottomNavItem(key: 'home', label: '首页', icon: Icons.home_rounded),
    BottomNavItem(key: 'learning', label: '学习', icon: Icons.school_rounded),
    BottomNavItem(key: 'report', label: '报告', icon: Icons.assessment_rounded),
    BottomNavItem(key: 'profile', label: '我的', icon: Icons.person_rounded),
  ];

  late final List<Widget> _screens;

  @override
  void initState() {
    super.initState();
    _screens = [
      const ParentHomeContent(),
      const LearningHomeScreen(),
      const GrowthReportScreen(),
      const ProfileScreen(),
    ];
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      body: _screens[_currentIndex],
      bottomNavigationBar: SafeArea(
        top: false,
        child: BottomNav(
          items: _navItems,
          currentIndex: _currentIndex,
          onTap: (index) => setState(() => _currentIndex = index),
        ),
      ),
      extendBody: true,
    );
  }
}

/// 家长端首页内容 — 使用 StatefulWidget 以加载孩子列表并与 ChildSelector 交互
class ParentHomeContent extends StatefulWidget {
  const ParentHomeContent({super.key});

  @override
  State<ParentHomeContent> createState() => _ParentHomeContentState();
}

class _ParentHomeContentState extends State<ParentHomeContent> {
  bool _isLoading = true;
  bool _loaded = false;
  List<Map<String, dynamic>> _children = [];
  // 本地选中的孩子 ID（优先于 Provider，反映实时 UI）
  int? _localSelectedChildId;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_loaded) _loadInitialData();
  }

  Future<void> _loadInitialData() async {
    final userProvider = context.read<UserProvider>();
    if (!mounted) return;

    // 先从 Provider 恢复已保存的 activeChildId
    _localSelectedChildId = userProvider.activeChildId;
    setState(() => _isLoading = true);

    final currentUser = userProvider.currentUser;
    final parentId = currentUser?['parentId'] is int
        ? currentUser!['parentId'] as int
        : currentUser?['id'] is int
            ? currentUser!['id'] as int
            : null;

    if (parentId == null || parentId <= 0) {
      setState(() {
        _isLoading = false;
      });
      return;
    }

    try {
      final api = context.read<ApiService>();
      final children = await api.getChildrenByParent(parentId);
      final childList = children
          .whereType<Map>()
          .map((c) => c.map((k, v) => MapEntry(k.toString(), v)))
          .toList();

      // 如果本地尚未选择且 API 有数据，默认选中第一个
      if (_localSelectedChildId == null && childList.isNotEmpty) {
        final firstId = _toInt(childList.first['id']);
        if (firstId != null) {
          _localSelectedChildId = firstId;
          userProvider.setActiveChildId(firstId);
        }
      }

      if (!mounted) return;
      setState(() {
        _children = childList;
        _isLoading = false;
        _loaded = true;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _loaded = true;
      });
    }
  }

  /// 切换孩子：更新本地状态 & 同步到 Provider（持久化）
  void _onChildChanged(Map<String, dynamic> child) {
    final childId = _toInt(child['id']);
    if (childId == null) return;
    setState(() {
      _localSelectedChildId = childId;
    });
    context.read<UserProvider>().setActiveChildId(childId);
    // 弹出可能的底部弹窗遮罩
    if (Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    }
    // Toast 提示
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('已切换到 ${child['name']}'),
        duration: const Duration(seconds: 1),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  int? _toInt(dynamic value) {
    if (value is int) return value;
    return int.tryParse(value?.toString() ?? '');
  }

  @override
  Widget build(BuildContext context) {
    final userProvider = context.watch<UserProvider>();
    final userName = userProvider.currentUser?['name'] ?? '家长';
    final displayChildId = _localSelectedChildId ?? userProvider.activeChildId;

    return Stack(
      children: [
        Column(
          children: [
            TopBar(
              title: '灵犀伴学',
              subtitle: '$userName 家长',
              leftSlot: _buildChildSelector(displayChildId),
              actions: [
                TopBarAction(
                  key: 'notification',
                  label: '通知',
                  icon: Icons.notifications_none_rounded,
                  onTap: () => _showNotificationPanel(context),
                ),
              ],
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildWelcomeCard(userName),
                    const SizedBox(height: 20),
                    _buildTodayStudyCard(),
                    const SizedBox(height: 20),
                    _buildAbilityCard(),
                    const SizedBox(height: 20),
                    _buildMenuSection(context),
                    const SizedBox(height: 100),
                  ],
                ),
              ),
            ),
          ],
        ),
        // 加载中遮罩
        if (_isLoading)
          Container(
            color: Colors.white.withValues(alpha: 0.7),
            child: const Center(
              child: CircularProgressIndicator(),
            ),
          ),
      ],
    );
  }

  Widget _buildChildSelector(int? selectedId) {
    if (_children.isEmpty) {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: const EdgeInsets.only(left: 6),
      child: SizedBox(
        width: 180,
        child: ChildSelector(
          children: _children,
          selectedChildId: selectedId,
          onChildChanged: _onChildChanged,
          mode: ChildSelectorMode.dropdown,
          title: '',
        ),
      ),
    );
  }

  void _showNotificationPanel(BuildContext context) {
    final userProvider = context.read<UserProvider>();
    final userId = userProvider.currentUser?['id'] as int?;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => NotificationPanel(userId: userId),
    );
  }

  Widget _buildWelcomeCard(String userName) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppTheme.secondaryColor, Color(0xFF9AD0E8)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(24),
        boxShadow: AppTheme.glowShadow(AppTheme.secondaryColor),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.25),
              borderRadius: BorderRadius.circular(16),
            ),
            child: const Icon(Icons.family_restroom, color: Colors.white, size: 32),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$userName 家长',
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '孩子的成长，我来守护',
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.white.withValues(alpha: 0.85),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTodayStudyCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: AppTheme.softShadow(),
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '今日学习',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _StatItem(label: '学习时长', value: '25分钟'),
              _StatItem(label: '完成主题', value: '3个'),
              _StatItem(label: '获得星星', value: '15颗'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildAbilityCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: AppTheme.softShadow(),
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '能力雷达',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          SizedBox(height: 16),
          _AbilityBar(label: '语言', value: 0.8),
          _AbilityBar(label: '数学', value: 0.6),
          _AbilityBar(label: '科学', value: 0.75),
          _AbilityBar(label: '艺术', value: 0.7),
          _AbilityBar(label: '社交', value: 0.85),
        ],
      ),
    );
  }

  Widget _buildMenuSection(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '功能菜单',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 16),
        _MenuTile(
          icon: Icons.auto_awesome_rounded,
          title: 'AI 课程生成',
          subtitle: '为孩子智能生成学习课程',
          color: AppTheme.primaryColor,
          onTap: () => Navigator.pushNamed(context, '/parent/lessonGenerator'),
        ),
        _MenuTile(
          icon: Icons.psychology_rounded,
          title: 'AI 能力洞察',
          subtitle: '查看孩子能力发展与趋势',
          color: AppTheme.softPurple,
          onTap: () => Navigator.pushNamed(context, '/parent/aiInsights'),
        ),
        _MenuTile(
          icon: Icons.security_rounded,
          title: '家长控制',
          subtitle: '设置学习时长与内容限制',
          color: AppTheme.secondaryColor,
          onTap: () => Navigator.pushNamed(context, '/parent/parentalControls'),
        ),
        _MenuTile(
          icon: Icons.assessment_rounded,
          title: '学习报告',
          subtitle: '查看详细学习情况与报告',
          color: AppTheme.accentColor,
          onTap: () => Navigator.pushNamed(context, '/parent/growthReport'),
        ),
        _MenuTile(
          icon: Icons.assignment_rounded,
          title: '作业管理',
          subtitle: '布置与检查孩子作业',
          color: AppTheme.softOrange,
          onTap: () => Navigator.pushNamed(context, '/parent/assignmentManager'),
        ),
        _MenuTile(
          icon: Icons.drafts_rounded,
          title: '课程草稿',
          subtitle: '管理 AI 生成的课程草稿',
          color: AppTheme.softYellow,
          onTap: () => Navigator.pushNamed(context, '/parent/draftManager'),
        ),
        _MenuTile(
          icon: Icons.inventory_2_rounded,
          title: '课程包管理',
          subtitle: '查看和管理课程包',
          color: AppTheme.softMint,
          onTap: () => Navigator.pushNamed(context, '/parent/coursePackManager'),
        ),
        _MenuTile(
          icon: Icons.radar_rounded,
          title: '能力雷达',
          subtitle: '查看孩子多维能力分布',
          color: AppTheme.softBlue,
          onTap: () => Navigator.pushNamed(context, '/parent/abilityRadar'),
        ),
        _MenuTile(
          icon: Icons.trending_up_rounded,
          title: '能力趋势',
          subtitle: '追踪孩子能力成长曲线',
          color: AppTheme.softPurple,
          onTap: () => Navigator.pushNamed(context, '/parent/abilityTrend'),
        ),
        _MenuTile(
          icon: Icons.video_library_rounded,
          title: '快速视频生成',
          subtitle: 'AI 一键生成教学动画视频',
          color: AppTheme.softPink,
          onTap: () => Navigator.pushNamed(context, '/parent/quickVideoGenerator'),
        ),
        _MenuTile(
          icon: Icons.family_restroom_rounded,
          title: '孩子管理',
          subtitle: '添加、编辑或删除孩子账号',
          color: const Color(0xFF81C784),
          onTap: () => Navigator.pushNamed(context, '/parent/childManager'),
        ),
        _MenuTile(
          icon: Icons.emoji_events_rounded,
          title: '积分管理',
          subtitle: '查看孩子积分与兑换礼品',
          color: const Color(0xFFFFB74D),
          onTap: () => Navigator.pushNamed(context, '/reward/home'),
        ),
      ],
    );
  }
}

class _StatItem extends StatelessWidget {
  final String label;
  final String value;

  const _StatItem({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          value,
          style: const TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.bold,
            color: AppTheme.primaryColor,
          ),
        ),
        Text(
          label,
          style: const TextStyle(
            color: AppTheme.textSecondary,
          ),
        ),
      ],
    );
  }
}

class _AbilityBar extends StatelessWidget {
  final String label;
  final double value;

  const _AbilityBar({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          SizedBox(
            width: 50,
            child: Text(label),
          ),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: value,
                backgroundColor: Colors.grey.shade200,
                valueColor: AlwaysStoppedAnimation<Color>(
                  AppTheme.childColors[label.length % AppTheme.childColors.length],
                ),
                minHeight: 8,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Text('${(value * 100).toInt()}%'),
        ],
      ),
    );
  }
}

class _MenuTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  final VoidCallback? onTap;

  const _MenuTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.color,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      child: ListTile(
        leading: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, color: color),
        ),
        title: Text(title),
        subtitle: Text(subtitle, style: const TextStyle(fontSize: 12)),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}
