// 积分奖惩系统 - 首页（打卡面板）

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../components/app_card.dart';
import '../../components/stat_card.dart';
import '../../components/task_card.dart';
import '../../components/points_badge.dart';
import '../../providers/user_provider.dart';
import '../../providers/reward_provider.dart';
import '../../services/api_service.dart';
import '../../models/reward_models.dart';
import 'gift_shop_screen.dart';
import 'growth_report_screen.dart';
import 'calendar_screen.dart';

class RewardHomeScreen extends StatefulWidget {
  const RewardHomeScreen({super.key});

  @override
  State<RewardHomeScreen> createState() => _RewardHomeScreenState();
}

class _RewardHomeScreenState extends State<RewardHomeScreen> {
  int _currentTab = 0;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    final userProvider = context.read<UserProvider>();
    final rewardProvider = context.read<RewardProvider>();
    final currentUser = userProvider.currentUser;
    final userId = currentUser?['id'] as int? ?? 1;
    final userType = currentUser?['type']?.toString() ?? 'child';
    
    // 解析 childId：activeChildId 优先，家长未设置时自动获取第一个孩子
    int? childId = userProvider.activeChildId;
    if (childId == null && userType == 'parent') {
      try {
        final api = context.read<ApiService>();
        final children = await api.getChildrenByParent(userId);
        if (children.isNotEmpty) {
          final firstChild = children.first;
          childId = firstChild['id'] is int 
              ? firstChild['id'] as int 
              : int.tryParse(firstChild['id']?.toString() ?? '');
          if (childId != null) {
            await userProvider.setActiveChildId(childId);
          }
        }
      } catch (e) {
        // 获取孩子列表失败，使用默认值
      }
    }
    childId ??= userId;

    // 先并行加载基础数据
    await Future.wait([
      rewardProvider.loadBehaviors(userId),
      rewardProvider.loadGifts(userId),
      rewardProvider.loadPointRecords(childId!),
      rewardProvider.loadRedemptions(childId),
    ]);
    
    // 确保今日记录在积分记录加载完成后单独加载
    // 避免并发导致的竞态条件（loadTodayRecords 会修改 _pointRecords）
    await rewardProvider.loadTodayRecords(childId);
    
    // 今日记录加载完成后，刷新汇总数据（确保积分显示正确）
    await rewardProvider.loadSummary(childId);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      appBar: AppBar(
        title: const Text('积分奖惩'),
        backgroundColor: AppTheme.primaryColor,
        foregroundColor: Colors.white,
        elevation: 0,
      ),
      body: Consumer<RewardProvider>(
        builder: (context, reward, _) {
          return Column(
            children: [
              // 积分概览卡片
              _buildPointsOverview(reward.summary),
              // Tab 切换
              _buildTabBar(),
              // 内容区域
              Expanded(
                child: IndexedStack(
                  index: _currentTab,
                  children: const [
                    _CheckInPanel(),
                    _GiftShopPanel(),
                    _CalendarPanel(),
                    _GrowthReportPanel(),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildPointsOverview(PointsSummary? summary) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      decoration: BoxDecoration(
        gradient: AppTheme.primaryGradient,
        borderRadius: const BorderRadius.only(
          bottomLeft: Radius.circular(32),
          bottomRight: Radius.circular(32),
        ),
      ),
      child: Row(
        children: [
          AnimatedStatCard(
            label: '总积分',
            value: '${summary?.totalPoints ?? 0}',
            icon: Icons.star_rounded,
            color: Colors.white,
          ),
          const SizedBox(width: 12),
          AnimatedStatCard(
            label: '今日',
            value: '+${summary?.todayPoints ?? 0}',
            icon: Icons.today_rounded,
            color: Colors.white,
          ),
          const SizedBox(width: 12),
          AnimatedStatCard(
            label: '连续',
            value: '${summary?.streak ?? 0}天',
            icon: Icons.local_fire_department_rounded,
            color: Colors.white,
          ),
        ],
      ),
    );
  }

  Widget _buildTabBar() {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: AppTheme.subtleShadow(),
      ),
      child: Row(
        children: [
          _buildTab(0, '打卡', Icons.check_circle_outline),
          _buildTab(1, '商城', Icons.card_giftcard),
          _buildTab(2, '日历', Icons.calendar_today),
          _buildTab(3, '报告', Icons.insights),
        ],
      ),
    );
  }

  Widget _buildTab(int index, String label, IconData icon) {
    final isSelected = _currentTab == index;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _currentTab = index),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeInOut,
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            gradient: isSelected ? AppTheme.primaryGradient : null,
            color: isSelected ? null : Colors.transparent,
            borderRadius: BorderRadius.circular(16),
            boxShadow: isSelected ? AppTheme.softShadow(AppTheme.primaryColor) : null,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 200),
                child: Icon(
                  icon,
                  key: ValueKey('$index-$isSelected'),
                  size: 18,
                  color: isSelected ? Colors.white : AppTheme.textSecondary,
                ),
              ),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  color: isSelected ? Colors.white : AppTheme.textSecondary,
                  fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                  fontSize: 13,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// 打卡面板
class _CheckInPanel extends StatelessWidget {
  const _CheckInPanel();

  @override
  Widget build(BuildContext context) {
    return Consumer<RewardProvider>(
      builder: (context, reward, _) {
        final templates = reward.behaviors;
        final todayRecords = reward.todayRecords;

        if (templates.isEmpty) {
          return const Center(child: Text('暂无行为模板'));
        }

        // 按分类分组
        final categories = <String, List<BehaviorTemplate>>{};
        for (final t in templates) {
          categories.putIfAbsent(t.category, () => []).add(t);
        }

        return ListView(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          children: [
            // 今日打卡记录
            if (todayRecords.isNotEmpty) ...[
              const _RewardSectionHeader(title: '今日打卡', emoji: '✅'),
              const SizedBox(height: 12),
              ...todayRecords.map((r) => _buildTodayRecordCard(r)),
              const SizedBox(height: 20),
            ],
            // 按分类显示行为模板
            ...categories.entries.expand((entry) => [
                  _RewardSectionHeader(title: entry.key, emoji: _getCategoryEmoji(entry.key)),
                  const SizedBox(height: 12),
                  ...entry.value.map((t) => _buildBehaviorCard(context, t, reward)),
                  const SizedBox(height: 12),
                ]),
          ],
        );
      },
    );
  }

  Widget _buildTodayRecordCard(PointRecord record) {
    final isPositive = record.points >= 0;
    return AppCard(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: (isPositive ? AppTheme.accentColor : AppTheme.warningColor)
                  .withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              isPositive ? Icons.check_circle : Icons.remove_circle,
              color: isPositive ? AppTheme.accentColor : AppTheme.warningColor,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  record.behaviorName,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  '${record.recordedAt.hour}:${record.recordedAt.minute.toString().padLeft(2, '0')}',
                  style: TextStyle(
                    color: AppTheme.textSecondary,
                    fontSize: 11,
                  ),
                ),
              ],
            ),
          ),
          Text(
            '${isPositive ? '+' : ''}${record.points}',
            style: TextStyle(
              color: isPositive ? AppTheme.accentColor : AppTheme.warningColor,
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBehaviorCard(
      BuildContext context, BehaviorTemplate template, RewardProvider reward) {
    final isPositive = template.points >= 0;
    
    // 检查今日是否已打卡该行为
    final alreadyCheckedIn = reward.todayRecords.any(
      (r) => r.behaviorName == template.name,
    );
    
    // 根据分类选择合适的图标
    final iconData = _getIconForCategory(template.category);
    
    return AnimatedTaskCard(
      title: template.name,
      subtitle: '${isPositive ? '+' : ''}${template.points} 积分',
      icon: iconData.icon,
      iconColor: isPositive ? iconData.color : AppTheme.warningColor,
      isCompleted: alreadyCheckedIn,
      onTap: alreadyCheckedIn ? null : () => _handleCheckIn(context, template, reward),
    );
  }
  
  _IconData _getIconForCategory(String category) {
    switch (category) {
      case '日常习惯':
        return _IconData(Icons.wb_sunny_rounded, AppTheme.secondaryColor);
      case '学习活动':
        return _IconData(Icons.menu_book_rounded, AppTheme.primaryColor);
      case '额外加分':
        return _IconData(Icons.star_rounded, AppTheme.accentColor);
      case '扣分行为':
        return _IconData(Icons.warning_amber_rounded, AppTheme.warningColor);
      default:
        return _IconData(Icons.check_circle_outline, AppTheme.textSecondary);
    }
  }

  String _getCategoryEmoji(String category) {
    switch (category) {
      case '日常习惯':
        return '🌅';
      case '学习活动':
        return '📚';
      case '额外加分':
        return '⭐';
      case '扣分行为':
        return '⚠️';
      default:
        return '📋';
    }
  }

  Future<void> _handleCheckIn(
    BuildContext context,
    BehaviorTemplate template,
    RewardProvider reward,
  ) async {
    final userProvider = context.read<UserProvider>();
    final userId = userProvider.currentUser?['id'] as int? ?? 1;
    final childId = userProvider.activeChildId ?? userId;

    final record = await reward.recordPoints(
      childId: childId,
      behaviorName: template.name,
      points: template.points,
      templateId: template.id,
      recordedBy: userId,
    );

    if (context.mounted) {
      if (record != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              template.points >= 0
                  ? '✅ ${template.name} +${template.points}积分'
                  : '⚠️ ${template.name} ${template.points}积分',
            ),
            backgroundColor:
                template.points >= 0 ? AppTheme.accentColor : AppTheme.warningColor,
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('操作失败: ${reward.error ?? "未知错误"}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }
}

class _IconData {
  final IconData icon;
  final Color color;
  _IconData(this.icon, this.color);
}

// 商城面板
class _GiftShopPanel extends StatelessWidget {
  const _GiftShopPanel();

  @override
  Widget build(BuildContext context) {
    return const GiftShopPanel();
  }
}

// 日历面板
class _CalendarPanel extends StatelessWidget {
  const _CalendarPanel();

  @override
  Widget build(BuildContext context) {
    return const CalendarScreen();
  }
}

// 报告面板
class _GrowthReportPanel extends StatelessWidget {
  const _GrowthReportPanel();

  @override
  Widget build(BuildContext context) {
    return const GrowthReportPanel();
  }
}

// 简化的 SectionHeader (renamed to avoid conflict with components/section_header.dart)
class _RewardSectionHeader extends StatelessWidget {
  final String title;
  final String emoji;

  const _RewardSectionHeader({
    super.key,
    required this.title,
    this.emoji = '',
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          if (emoji.isNotEmpty) ...[
            Text(emoji, style: const TextStyle(fontSize: 18)),
            const SizedBox(width: 8),
          ],
          Text(
            title,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}

// 简化的 GrowthReportPanel
class GrowthReportPanel extends StatelessWidget {
  const GrowthReportPanel({super.key});

  @override
  Widget build(BuildContext context) {
    return const RewardGrowthReportScreen();
  }
}

// 简化的 GiftShopPanel
class GiftShopPanel extends StatelessWidget {
  const GiftShopPanel({super.key});

  @override
  Widget build(BuildContext context) {
    return const GiftShopScreen();
  }
}
