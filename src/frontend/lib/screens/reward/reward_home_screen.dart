// 积分奖惩系统 - 首页（打卡面板）

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../components/app_card.dart';
import '../../providers/user_provider.dart';
import '../../providers/reward_provider.dart';
import '../../models/reward_models.dart';
import 'gift_shop_screen.dart';
import 'growth_report_screen.dart';

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
    final userId = userProvider.currentUser?['id'] as int? ?? 1;
    final childId = userProvider.activeChildId ?? userId;

    await Future.wait([
      rewardProvider.loadBehaviors(userId),
      rewardProvider.loadGifts(userId),
      rewardProvider.loadPointRecords(childId),
      rewardProvider.loadRedemptions(childId),
      rewardProvider.loadSummary(childId),
    ]);
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
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: AppTheme.primaryGradient,
        borderRadius: const BorderRadius.only(
          bottomLeft: Radius.circular(24),
          bottomRight: Radius.circular(24),
        ),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildStatItem(
                icon: Icons.stars_rounded,
                label: '总积分',
                value: '${summary?.totalPoints ?? 0}',
              ),
              _buildStatItem(
                icon: Icons.today_rounded,
                label: '今日',
                value: '+${summary?.todayPoints ?? 0}',
              ),
              _buildStatItem(
                icon: Icons.local_fire_department_rounded,
                label: '连续',
                value: '${summary?.streak ?? 0}天',
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatItem({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Column(
      children: [
        Icon(icon, color: Colors.white, size: 28),
        const SizedBox(height: 8),
        Text(
          value,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 24,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.8),
            fontSize: 12,
          ),
        ),
      ],
    );
  }

  Widget _buildTabBar() {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: [
          _buildTab(0, '打卡', Icons.check_circle_outline),
          _buildTab(1, '商城', Icons.card_giftcard),
          _buildTab(2, '报告', Icons.insights),
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
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            gradient: isSelected ? AppTheme.primaryGradient : null,
            color: isSelected ? null : Colors.transparent,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                size: 18,
                color: isSelected ? Colors.white : AppTheme.textSecondary,
              ),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  color: isSelected ? Colors.white : AppTheme.textSecondary,
                  fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                  fontSize: 14,
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
              const SectionHeader(title: '今日打卡', emoji: '✅'),
              const SizedBox(height: 12),
              ...todayRecords.map((r) => _buildTodayRecordCard(r)),
              const SizedBox(height: 20),
            ],
            // 按分类显示行为模板
            ...categories.entries.expand((entry) => [
                  SectionHeader(title: entry.key, emoji: _getCategoryEmoji(entry.key)),
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
    return AppCard(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          // Emoji 图标
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: (isPositive ? AppTheme.secondaryColor : AppTheme.warningColor)
                  .withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Text(template.emoji, style: const TextStyle(fontSize: 24)),
          ),
          const SizedBox(width: 12),
          // 行为信息
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  template.name,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${isPositive ? '+' : ''}${template.points} 积分',
                  style: TextStyle(
                    color: isPositive ? AppTheme.accentColor : AppTheme.warningColor,
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
          // 打卡按钮
          ElevatedButton(
            onPressed: () => _handleCheckIn(context, template, reward),
            style: ElevatedButton.styleFrom(
              backgroundColor: isPositive ? AppTheme.accentColor : AppTheme.warningColor,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(20),
              ),
            ),
            child: Text(isPositive ? '打卡' : '扣分'),
          ),
        ],
      ),
    );
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
}

// 商城面板
class _GiftShopPanel extends StatelessWidget {
  const _GiftShopPanel();

  @override
  Widget build(BuildContext context) {
    return const GiftShopPanel();
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

// AnimatedContainer 包装器
class AnimatedContainer extends StatelessWidget {
  final Duration duration;
  final EdgeInsetsGeometry? padding;
  final BoxDecoration? decoration;
  final Widget? child;

  const AnimatedContainer({
    super.key,
    required this.duration,
    this.padding,
    this.decoration,
    this.child,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: duration,
      padding: padding,
      decoration: decoration,
      child: child,
    );
  }
}

// 简化的 SectionHeader
class SectionHeader extends StatelessWidget {
  final String title;
  final String emoji;

  const SectionHeader({
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
