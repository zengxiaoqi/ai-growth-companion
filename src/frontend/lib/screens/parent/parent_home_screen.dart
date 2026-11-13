// 家长端主壳与首页 —— 对齐孩子端 v2 视觉语言（2026-11-14）。
//
// 与孩子端保持同一套设计原子：BubbleBackground 纸面、ChildSticker 贴纸卡、
// ChildJelly 果冻按压、ChildSectionTitle 区块标题、ChildMoreGrid 图标网格。
// 家长端在 app.dart 里被固定为 honey 皮肤并挂上色板 extension，因此这些
// 组件拿到的永远是蜜黄 token，不会随孩子端换肤变成深色。
//
// 三条改造原则（沿用孩子端优化经验）：
//   1. 去掉常驻 TopBar：问候/孩子切换/通知/端切换都收进页面自己的头部；
//   2. 不再写死假数据：今日概览接真实接口，拿不到就显示「--」，不编数字；
//   3. 16 项平铺菜单收敛成「常用工具网格 + 可折叠分组」，首页只有一个焦点。

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../components/activity_card.dart';
import '../../components/bottom_nav.dart';
import '../../components/child_fun_page.dart';
import '../../components/child_home_experience.dart';
import '../../components/notification_panel.dart';
import '../../providers/user_provider.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../../theme/child_theme.dart';
import '../ai_chat_screen.dart';
import '../learning/learning_home_screen.dart';
import '../profile/profile_screen.dart';
import 'child_selector.dart';

class ParentHomeScreen extends StatefulWidget {
  const ParentHomeScreen({super.key});

  /// 「报告」不再占一个底部 tab：它作为独立子页面从「我的」进入，
  /// 与孩子端「成就并入我的」是同一种导航收敛。
  /// 公开给回归测试断言导航结构，避免为了测 4 个 tab 而拉起整页数据。
  static const List<BottomNavItem> navItems = <BottomNavItem>[
    BottomNavItem(key: 'home', label: '首页', icon: Icons.home_rounded),
    BottomNavItem(key: 'learning', label: '学习', icon: Icons.school_rounded),
    BottomNavItem(
        key: 'ai', label: 'AI', icon: Icons.smart_toy_rounded, isAccent: true),
    BottomNavItem(key: 'profile', label: '我的', icon: Icons.person_rounded),
  ];

  @override
  State<ParentHomeScreen> createState() => _ParentHomeScreenState();
}

class _ParentHomeScreenState extends State<ParentHomeScreen> {
  int _currentIndex = 0;

  late final List<Widget> _screens;

  @override
  void initState() {
    super.initState();
    _screens = <Widget>[
      ParentHomeContent(
        onOpenLearning: () => setState(() => _currentIndex = 1),
      ),
      // 学习页与孩子端共用同一个 widget，无任何角色分支；
      // AI 对话页也共用同一份排版，只用 isParentMode 换文案/密度/会话归属。
      const LearningHomeScreen(),
      const AIChatScreen(isParentMode: true),
      const ProfileScreen(),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    return Scaffold(
      backgroundColor: palette.paper,
      // IndexedStack 保留各 tab 的滚动位置与已加载数据，
      // 切回首页不会重新拉接口（孩子端主壳同样用 IndexedStack）。
      body: IndexedStack(index: _currentIndex, children: _screens),
      bottomNavigationBar: SafeArea(
        top: false,
        child: BottomNav(
          items: ParentHomeScreen.navItems,
          currentIndex: _currentIndex,
          onTap: (index) => setState(() => _currentIndex = index),
        ),
      ),
    );
  }
}

/// 家长端首页内容 —— 加载孩子列表、今日概览、最近学习记录。
class ParentHomeContent extends StatefulWidget {
  const ParentHomeContent({super.key, this.onOpenLearning});

  /// 「今天还没开始」空态里的引导按钮：切到「学习」tab。
  final VoidCallback? onOpenLearning;

  @override
  State<ParentHomeContent> createState() => _ParentHomeContentState();
}

class _ParentHomeContentState extends State<ParentHomeContent> {
  bool _isLoading = true;
  bool _loaded = false;
  String? _loadError;
  List<Map<String, dynamic>> _children = <Map<String, dynamic>>[];
  int? _localSelectedChildId;

  // 今日概览 / 最近动态：真实接口数据，null 表示拿不到，不编造数字。
  Map<String, dynamic>? _todayStats;
  List<Map<String, dynamic>> _recentRecords = <Map<String, dynamic>>[];

  final Set<String> _expandedGroups = <String>{'教学工具'};

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_loaded) _loadInitialData();
  }

  Future<void> _loadInitialData() async {
    final userProvider = context.read<UserProvider>();
    if (!mounted) return;

    _localSelectedChildId ??= userProvider.activeChildId;
    setState(() {
      _isLoading = true;
      _loadError = null;
    });

    final currentUser = userProvider.currentUser;
    final parentId = currentUser?['parentId'] is int
        ? currentUser!['parentId'] as int
        : currentUser?['id'] is int
            ? currentUser!['id'] as int
            : null;

    if (parentId == null || parentId <= 0) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _loaded = true;
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
        _loadError = childList.isEmpty ? '尚未绑定孩子，请先添加孩子' : null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _loaded = true;
        _loadError = '加载孩子列表失败，请重试';
      });
    }

    // 概览数据与孩子列表解耦：统计接口挂了不影响切换器与菜单。
    await _loadChildData();
  }

  Future<void> _loadChildData() async {
    final childId = _localSelectedChildId;
    if (childId == null) {
      if (!mounted) return;
      setState(() {
        _todayStats = null;
        _recentRecords = <Map<String, dynamic>>[];
      });
      return;
    }

    final api = context.read<ApiService>();
    Map<String, dynamic>? stats;
    List<dynamic> history = <dynamic>[];
    try {
      stats = await api.getTodayStatsDetail(childId);
    } catch (_) {
      stats = null;
    }
    try {
      history = await api.getLearningHistory(childId, limit: 3);
    } catch (_) {
      history = <dynamic>[];
    }

    if (!mounted) return;
    setState(() {
      _todayStats = stats;
      _recentRecords = history
          .whereType<Map>()
          .map((r) => r.map((k, v) => MapEntry(k.toString(), v)))
          .toList();
    });
  }

  void _onChildChanged(Map<String, dynamic> child) {
    final childId = _toInt(child['id']);
    if (childId == null) return;
    setState(() {
      _localSelectedChildId = childId;
      _todayStats = null;
      _recentRecords = <Map<String, dynamic>>[];
    });
    context.read<UserProvider>().setActiveChildId(childId);
    if (Navigator.of(context).canPop()) Navigator.of(context).pop();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('已切换到 ${child['name'] ?? '孩子'}'),
        duration: const Duration(seconds: 1),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
    _loadChildData();
  }

  Future<void> _go(String route, {bool refreshOnReturn = false}) async {
    await Navigator.pushNamed(context, route);
    if (!mounted) return;
    if (refreshOnReturn) {
      _loaded = false;
      await _loadInitialData();
    }
  }

  int? _toInt(dynamic value) {
    if (value is int) return value;
    return int.tryParse(value?.toString() ?? '');
  }

  String get _selectedChildName {
    for (final child in _children) {
      if (_toInt(child['id']) == _localSelectedChildId) {
        return child['name']?.toString() ?? '孩子';
      }
    }
    return _children.isEmpty ? '孩子' : '孩子';
  }

  @override
  Widget build(BuildContext context) {
    final userProvider = context.watch<UserProvider>();
    final palette = ChildThemePalette.of(context);
    final userName = userProvider.currentUser?['name']?.toString() ?? '家长';

    return BubbleBackground(
      child: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: palette.pop,
          onRefresh: () async {
            _loaded = false;
            await _loadInitialData();
          },
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                _buildHeader(context, palette, userName),
                if (_isLoading)
                  const Padding(
                    padding: EdgeInsets.only(top: 10),
                    child: LinearProgressIndicator(minHeight: 2),
                  ),
                const SizedBox(height: 18),
                _buildChildRow(context, palette),
                const SizedBox(height: 20),
                _buildOverviewCard(context, palette),
                const SizedBox(height: 28),
                ChildMoreGrid(
                  title: '常用工具',
                  entries: _buildQuickEntries(context),
                ),
                const SizedBox(height: 28),
                _buildRecentSection(context, palette),
                const SizedBox(height: 28),
                _buildActivitySection(palette),
                const SizedBox(height: 28),
                _buildAllToolsSection(context, palette),
                const SizedBox(height: 28),
                _buildSafetyFooter(palette),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// 页面自带头部：问候 + 日期，右侧通知与「学生端」切换。
  /// 原来的常驻 TopBar 已移除，首页内容自己避让状态栏。
  Widget _buildHeader(
      BuildContext context, ChildThemePalette palette, String userName) {
    final now = DateTime.now();
    final hour = now.hour;
    final greeting = hour < 11
        ? '早上好'
        : hour < 14
            ? '中午好'
            : hour < 18
                ? '下午好'
                : '晚上好';
    const weekdays = <String>['一', '二', '三', '四', '五', '六', '日'];

    return Row(
      children: <Widget>[
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                '$greeting，$userName',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  height: 1.2,
                  color: palette.ink,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '${now.month}月${now.day}日 周${weekdays[now.weekday - 1]} · 一起看看孩子的成长',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 12.5, color: palette.ink2),
              ),
            ],
          ),
        ),
        ChildFunIconButton(
          icon: Icons.notifications_none_rounded,
          tooltip: '通知',
          onPressed: () => _showNotificationPanel(context),
        ),
        const SizedBox(width: 8),
        ChildFunIconButton(
          icon: Icons.swap_horiz_rounded,
          tooltip: '切换到学生端',
          onPressed: () => switchToChildFromParent(context),
        ),
      ],
    );
  }

  /// 孩子切换器：无孩子时给可重试的贴纸提示，而不是静默隐藏。
  Widget _buildChildRow(BuildContext context, ChildThemePalette palette) {
    if (_children.isEmpty) {
      return ChildSticker(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: <Widget>[
            Icon(Icons.warning_amber_rounded, size: 20, color: palette.pop),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                _loadError ?? (_isLoading ? '正在加载孩子列表…' : '尚未绑定孩子'),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 13, color: palette.ink),
              ),
            ),
            const SizedBox(width: 8),
            ChildJelly(
              onTap: () {
                _loaded = false;
                _loadInitialData();
              },
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                decoration: BoxDecoration(
                  color: palette.soft,
                  borderRadius: BorderRadius.circular(palette.radiusSm),
                ),
                child: Text(
                  '重试',
                  style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                      color: palette.pop),
                ),
              ),
            ),
          ],
        ),
      );
    }

    return Row(
      children: <Widget>[
        SizedBox(
          width: 190,
          child: ChildSelector(
            children: _children,
            selectedChildId: _localSelectedChildId,
            onChildChanged: _onChildChanged,
            mode: ChildSelectorMode.dropdown,
            title: '',
          ),
        ),
        const Spacer(),
        ChildJelly(
          onTap: () => _go('/parent/childManager', refreshOnReturn: true),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
            decoration: BoxDecoration(
              color: palette.soft,
              borderRadius: BorderRadius.circular(palette.radiusSm),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Icon(Icons.family_restroom_rounded,
                    size: 16, color: palette.pop),
                const SizedBox(width: 5),
                Text(
                  '${_children.length} 个孩子',
                  style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                      color: palette.ink),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  /// 首屏唯一焦点：选中孩子 + 今日真实学习数据 + 报告入口。
  Widget _buildOverviewCard(BuildContext context, ChildThemePalette palette) {
    final stats = _todayStats;
    final minutes = _statInt(stats, 'totalMinutes');
    final completed = _statInt(stats, 'completedCount');
    final records = _statInt(stats, 'recordsCount');
    final hasData = stats != null;

    return ChildSticker(
      width: double.infinity,
      strong: true,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: Color.alphaBlend(
                      palette.pop.withValues(alpha: 0.16), palette.card),
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.child_care_rounded,
                    size: 24, color: palette.pop),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      _selectedChildName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: palette.ink),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      hasData ? '今日学习概览' : '今天的成长数据',
                      style: TextStyle(fontSize: 12, color: palette.ink2),
                    ),
                  ],
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: palette.soft,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  hasData ? '实时' : '待更新',
                  style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: palette.ink2),
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Row(
            children: <Widget>[
              _OverviewStat(
                palette: palette,
                value: minutes == null ? '--' : '$minutes',
                unit: '分钟',
                label: '学习时长',
              ),
              _OverviewStat(
                palette: palette,
                value: completed == null ? '--' : '$completed',
                unit: '个',
                label: '完成内容',
              ),
              _OverviewStat(
                palette: palette,
                value: records == null ? '--' : '$records',
                unit: '次',
                label: '学习记录',
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: <Widget>[
              Expanded(
                child: ChildJelly(
                  onTap: () => _go('/parent/growthReport'),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: BoxDecoration(
                      color: palette.cta,
                      borderRadius:
                          BorderRadius.circular(palette.radiusMd),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: <Widget>[
                        Icon(Icons.assessment_rounded,
                            size: 18, color: palette.ctaInk),
                        const SizedBox(width: 7),
                        Text(
                          '查看成长报告',
                          style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w800,
                              color: palette.ctaInk),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              ChildJelly(
                onTap: () => widget.onOpenLearning?.call(),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: palette.soft,
                    borderRadius: BorderRadius.circular(palette.radiusMd),
                  ),
                  child: Text(
                    '去学习',
                    style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: palette.ink),
                  ),
                ),
              ),
            ],
          ),
          if (!hasData && !_isLoading)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(
                '暂时取不到今天的学习数据，下拉可刷新',
                style: TextStyle(fontSize: 11.5, color: palette.ink2),
              ),
            ),
        ],
      ),
    );
  }

  int? _statInt(Map<String, dynamic>? stats, String key) {
    if (stats == null) return null;
    return _toInt(stats[key]);
  }

  List<ChildMoreEntry> _buildQuickEntries(BuildContext context) {
    return <ChildMoreEntry>[
      ChildMoreEntry(
        icon: Icons.assessment_rounded,
        label: '成长报告',
        onTap: () => _go('/parent/growthReport'),
      ),
      ChildMoreEntry(
        icon: Icons.auto_awesome_rounded,
        label: 'AI 备课',
        onTap: () => _go('/parent/lessonGenerator'),
      ),
      ChildMoreEntry(
        icon: Icons.assignment_rounded,
        label: '作业管理',
        onTap: () => _go('/parent/assignmentManager'),
      ),
      ChildMoreEntry(
        icon: Icons.security_rounded,
        label: '家长控制',
        onTap: () => _go('/parent/parentalControls'),
      ),
      ChildMoreEntry(
        icon: Icons.family_restroom_rounded,
        label: '孩子管理',
        onTap: () => _go('/parent/childManager', refreshOnReturn: true),
      ),
      ChildMoreEntry(
        icon: Icons.psychology_rounded,
        label: '能力洞察',
        onTap: () => _go('/parent/aiInsights'),
      ),
      ChildMoreEntry(
        icon: Icons.movie_creation_rounded,
        label: '生成视频',
        onTap: () => _go('/parent/quickVideoGenerator'),
      ),
      ChildMoreEntry(
        icon: Icons.auto_stories_rounded,
        label: '诗词鉴赏',
        onTap: () => _go('/poetry'),
      ),
    ];
  }

  /// 今日动态：最近 3 条真实学习记录；空态给一个可行动作。
  Widget _buildRecentSection(BuildContext context, ChildThemePalette palette) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        ChildSectionTitle(
          title: '今日动态',
          icon: Icons.history_rounded,
          trailing: Text(
            '最近 ${_recentRecords.length} 条',
            style: TextStyle(fontSize: 12, color: palette.ink2),
          ),
        ),
        const SizedBox(height: 12),
        if (_recentRecords.isEmpty)
          ChildSticker(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            child: Row(
              children: <Widget>[
                Icon(Icons.hourglass_empty_rounded,
                    size: 22, color: palette.ink2),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    '今天还没有学习记录，陪孩子开始第一课吧',
                    style: TextStyle(fontSize: 13.5, color: palette.ink),
                  ),
                ),
                ChildJelly(
                  onTap: () => widget.onOpenLearning?.call(),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: palette.soft,
                      borderRadius: BorderRadius.circular(palette.radiusSm),
                    ),
                    child: Text('去学习',
                        style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                            color: palette.pop)),
                  ),
                ),
              ],
            ),
          )
        else
          ChildSticker(
            width: double.infinity,
            padding: EdgeInsets.zero,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(palette.radiusLg),
              child: Column(
                children: <Widget>[
                  for (var i = 0; i < _recentRecords.length; i++)
                    _RecentRow(
                      record: _recentRecords[i],
                      palette: palette,
                      color: palette.subjects[i % palette.subjects.length],
                      isLast: i == _recentRecords.length - 1,
                    ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildActivitySection(ChildThemePalette palette) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: const <Widget>[
        ChildSectionTitle(
            title: '亲子时光', icon: Icons.family_restroom_rounded),
        SizedBox(height: 12),
        ActivityCard(),
      ],
    );
  }

  /// 全部功能：三组分栏 + 折叠，替代原来 16 张平铺 ListTile。
  Widget _buildAllToolsSection(
      BuildContext context, ChildThemePalette palette) {
    final groups = _buildGroups(palette);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        ChildSectionTitle(
          title: '全部功能',
          icon: Icons.apps_rounded,
          trailing: Text('${groups.fold<int>(0, (n, g) => n + g.entries.length)} 项',
              style: TextStyle(fontSize: 12, color: palette.ink2)),
        ),
        const SizedBox(height: 12),
        for (final group in groups) ...<Widget>[
          _ToolGroup(
            group: group,
            palette: palette,
            expanded: _expandedGroups.contains(group.title),
            onToggle: () {
              setState(() {
                if (_expandedGroups.contains(group.title)) {
                  _expandedGroups.remove(group.title);
                } else {
                  _expandedGroups.add(group.title);
                }
              });
            },
            onOpen: (entry) =>
                _go(entry.route, refreshOnReturn: entry.refreshOnReturn),
          ),
          const SizedBox(height: 10),
        ],
      ],
    );
  }

  List<_ToolGroupData> _buildGroups(ChildThemePalette palette) {
    var colorIndex = 0;
    Color nextColor() =>
        palette.subjects[colorIndex++ % palette.subjects.length];

    return <_ToolGroupData>[
      _ToolGroupData(
        title: '教学工具',
        icon: Icons.school_rounded,
        entries: <_ToolEntry>[
          _ToolEntry(Icons.auto_awesome_rounded, 'AI 课程生成',
              '为孩子智能生成学习课程', nextColor(), '/parent/lessonGenerator'),
          _ToolEntry(Icons.assignment_rounded, '作业管理', '布置与检查孩子作业',
              nextColor(), '/parent/assignmentManager'),
          _ToolEntry(Icons.drafts_rounded, '课程草稿', '管理 AI 生成的课程草稿',
              nextColor(), '/parent/draftManager'),
          _ToolEntry(Icons.inventory_2_rounded, '课程包管理', '查看和管理课程包',
              nextColor(), '/parent/coursePackManager'),
          _ToolEntry(Icons.movie_creation_rounded, '快速视频生成',
              '一键生成教学动画视频', nextColor(), '/parent/quickVideoGenerator'),
          _ToolEntry(Icons.security_rounded, '家长控制', '学习时长与内容限制',
              nextColor(), '/parent/parentalControls'),
        ],
      ),
      _ToolGroupData(
        title: '成长数据',
        icon: Icons.insights_rounded,
        entries: <_ToolEntry>[
          _ToolEntry(Icons.assessment_rounded, '成长报告',
              '日 / 周 / 月学习报告', nextColor(), '/parent/growthReport'),
          _ToolEntry(Icons.psychology_rounded, 'AI 能力洞察',
              '能力发展与趋势解读', nextColor(), '/parent/aiInsights'),
          _ToolEntry(Icons.radar_rounded, '能力雷达', '多维能力分布',
              nextColor(), '/parent/abilityRadar'),
          _ToolEntry(Icons.trending_up_rounded, '能力趋势', '能力成长曲线',
              nextColor(), '/parent/abilityTrend'),
          _ToolEntry(Icons.emoji_events_rounded, '积分管理',
              '孩子积分与礼品兑换', nextColor(), '/reward/home'),
        ],
      ),
      _ToolGroupData(
        title: '内容与孩子',
        icon: Icons.menu_book_rounded,
        entries: <_ToolEntry>[
          _ToolEntry(Icons.family_restroom_rounded, '孩子管理',
              '添加、编辑孩子账号', nextColor(), '/parent/childManager',
              refreshOnReturn: true),
          _ToolEntry(Icons.menu_book_rounded, '知识书',
              '上传书籍，AI 提取知识', nextColor(), '/book-skill/upload'),
          _ToolEntry(Icons.auto_stories_rounded, '诗词鉴赏',
              '古诗词注解、翻译与朗读', nextColor(), '/poetry'),
          _ToolEntry(Icons.sports_esports_rounded, '诗词游戏',
              '飞花令、接龙、填字', nextColor(), '/poetry/game'),
          _ToolEntry(Icons.download_rounded, '视频下载',
              '无水印下载教学视频', nextColor(), '/parent/videoDownload'),
        ],
      ),
    ];
  }

  Widget _buildSafetyFooter(ChildThemePalette palette) {
    return Center(
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          Icon(Icons.verified_user_rounded, size: 13, color: palette.ink2),
          const SizedBox(width: 5),
          Text('内容安全实时过滤 · 无广告无追踪',
              style: TextStyle(fontSize: 11.5, color: palette.ink2)),
        ],
      ),
    );
  }

  void _showNotificationPanel(BuildContext context) {
    final userId = context.read<UserProvider>().currentUser?['id'] as int?;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => NotificationPanel(userId: userId),
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 首页私有原子
// ────────────────────────────────────────────────────────────────────────────

class _OverviewStat extends StatelessWidget {
  const _OverviewStat({
    required this.palette,
    required this.value,
    required this.unit,
    required this.label,
  });

  final ChildThemePalette palette;
  final String value;
  final String unit;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: <Widget>[
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: <Widget>[
              Text(
                value,
                style: TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w900,
                    color: palette.pop),
              ),
              const SizedBox(width: 3),
              Text(unit,
                  style: TextStyle(fontSize: 12, color: palette.ink2)),
            ],
          ),
          const SizedBox(height: 4),
          Text(label,
              style: TextStyle(fontSize: 12, color: palette.ink2)),
        ],
      ),
    );
  }
}

class _RecentRow extends StatelessWidget {
  const _RecentRow({
    required this.record,
    required this.palette,
    required this.color,
    required this.isLast,
  });

  final Map<String, dynamic> record;
  final ChildThemePalette palette;
  final Color color;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final content = record['content'];
    String title = '学习内容';
    if (content is Map) {
      final candidate = content['title'] ?? content['topic'];
      if (candidate != null && candidate.toString().trim().isNotEmpty) {
        title = candidate.toString();
      }
    } else {
      final candidate = record['contentTitle'] ?? record['title'];
      if (candidate != null && candidate.toString().trim().isNotEmpty) {
        title = candidate.toString();
      }
    }

    final status = record['status']?.toString() == 'completed' ? '已完成' : '学习中';
    String time = '';
    final rawTime = record['startedAt'] ?? record['completedAt'];
    if (rawTime != null) {
      final dt = DateTime.tryParse(rawTime.toString());
      if (dt != null) {
        time = '${dt.month}月${dt.day}日 ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
      }
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
      decoration: BoxDecoration(
        border: isLast
            ? null
            : Border(bottom: BorderSide(color: palette.line, width: 1)),
      ),
      child: Row(
        children: <Widget>[
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: Color.alphaBlend(
                  color.withValues(alpha: 0.16), palette.card),
              borderRadius: BorderRadius.circular(11),
            ),
            child: Icon(Icons.auto_stories_rounded, size: 19, color: color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: palette.ink)),
                const SizedBox(height: 2),
                Text(
                  time.isEmpty ? status : '$time · $status',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 11.5, color: palette.ink2),
                ),
              ],
            ),
          ),
          Icon(Icons.chevron_right_rounded, size: 20, color: palette.ink2),
        ],
      ),
    );
  }
}

class _ToolEntry {
  const _ToolEntry(
    this.icon,
    this.title,
    this.subtitle,
    this.color,
    this.route, {
    this.refreshOnReturn = false,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  final String route;
  final bool refreshOnReturn;
}

class _ToolGroupData {
  const _ToolGroupData({
    required this.title,
    required this.icon,
    required this.entries,
  });

  final String title;
  final IconData icon;
  final List<_ToolEntry> entries;
}

class _ToolGroup extends StatelessWidget {
  const _ToolGroup({
    required this.group,
    required this.palette,
    required this.expanded,
    required this.onToggle,
    required this.onOpen,
  });

  final _ToolGroupData group;
  final ChildThemePalette palette;
  final bool expanded;
  final VoidCallback onToggle;
  final ValueChanged<_ToolEntry> onOpen;

  @override
  Widget build(BuildContext context) {
    return ChildSticker(
      width: double.infinity,
      padding: EdgeInsets.zero,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(palette.radiusLg),
        child: Column(
          children: <Widget>[
            GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: onToggle,
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
                child: Row(
                  children: <Widget>[
                    Icon(group.icon, size: 19, color: palette.pop),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(group.title,
                          style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                              color: palette.ink)),
                    ),
                    Text('${group.entries.length} 项',
                        style:
                            TextStyle(fontSize: 11.5, color: palette.ink2)),
                    const SizedBox(width: 6),
                    AnimatedRotation(
                      turns: expanded ? 0.5 : 0,
                      duration: const Duration(milliseconds: 180),
                      child: Icon(Icons.keyboard_arrow_down_rounded,
                          size: 20, color: palette.ink2),
                    ),
                  ],
                ),
              ),
            ),
            AnimatedCrossFade(
              firstChild: const SizedBox(width: double.infinity),
              secondChild: Column(
                children: <Widget>[
                  for (final entry in group.entries)
                    ChildJelly(
                      onTap: () => onOpen(entry),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 10),
                        decoration: BoxDecoration(
                          border: Border(
                            top: BorderSide(color: palette.line, width: 1),
                          ),
                        ),
                        child: Row(
                          children: <Widget>[
                            Container(
                              width: 34,
                              height: 34,
                              decoration: BoxDecoration(
                                color: Color.alphaBlend(
                                    entry.color.withValues(alpha: 0.16),
                                    palette.card),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Icon(entry.icon,
                                  size: 18, color: entry.color),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: <Widget>[
                                  Text(entry.title,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                          fontSize: 14,
                                          fontWeight: FontWeight.w600,
                                          color: palette.ink)),
                                  const SizedBox(height: 1),
                                  Text(entry.subtitle,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                          fontSize: 11.5,
                                          color: palette.ink2)),
                                ],
                              ),
                            ),
                            Icon(Icons.chevron_right_rounded,
                                size: 20, color: palette.ink2),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
              crossFadeState: expanded
                  ? CrossFadeState.showSecond
                  : CrossFadeState.showFirst,
              duration: const Duration(milliseconds: 180),
            ),
          ],
        ),
      ),
    );
  }
}
