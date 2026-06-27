// 成长报告页面

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../components/app_card.dart';
import '../../providers/user_provider.dart';
import '../../providers/reward_provider.dart';
import '../../models/reward_models.dart';

class RewardGrowthReportScreen extends StatefulWidget {
  const RewardGrowthReportScreen({super.key});

  @override
  State<RewardGrowthReportScreen> createState() =>
      _RewardGrowthReportScreenState();
}

class _RewardGrowthReportScreenState extends State<RewardGrowthReportScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _animController;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );
    _loadData();
    _animController.forward();
  }

  Future<void> _loadData() async {
    final userProvider = context.read<UserProvider>();
    final rewardProvider = context.read<RewardProvider>();
    final childId = await userProvider.resolveChildId();
    if (childId == null) return;
    await rewardProvider.loadWeeklyStats(childId);
  }

  @override
  void dispose() {
    _animController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<RewardProvider>(
      builder: (context, reward, _) {
        final summary = reward.summary;
        final weeklyStats = reward.weeklyStats;
        final records = reward.pointRecords;

        return SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 总览卡片
              _buildOverviewCard(summary),
              const SizedBox(height: 20),

              // 本周趋势图
              _buildWeeklyChart(weeklyStats),
              const SizedBox(height: 20),

              // 行为排行
              _buildBehaviorRanking(records),
              const SizedBox(height: 20),

              // 兑换记录
              _buildRedemptionHistory(reward),
              const SizedBox(height: 20),

              // 积分明细
              _buildPointHistory(reward),
            ],
          ),
        );
      },
    );
  }

  Widget _buildOverviewCard(PointsSummary? summary) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: AppTheme.primaryGradient,
        borderRadius: BorderRadius.circular(24),
        boxShadow: AppTheme.softShadow(AppTheme.primaryColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.analytics_rounded, color: Colors.white, size: 20),
              ),
              const SizedBox(width: 10),
              const Text(
                '成长总览',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              _buildOverviewItem(
                icon: Icons.stars_rounded,
                label: '总积分',
                value: '${summary?.totalPoints ?? 0}',
              ),
              _buildOverviewItem(
                icon: Icons.today_rounded,
                label: '今日',
                value: '+${summary?.todayPoints ?? 0}',
              ),
              _buildOverviewItem(
                icon: Icons.date_range_rounded,
                label: '本周',
                value: '+${summary?.weekPoints ?? 0}',
              ),
              _buildOverviewItem(
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

  Widget _buildOverviewItem({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Expanded(
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(icon, color: Colors.white, size: 22),
          ),
          const SizedBox(height: 10),
          Text(
            value,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 20,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.8),
              fontSize: 11,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildWeeklyChart(List<WeeklyStat> stats) {
    if (stats.isEmpty) {
      return AppCard(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '本周趋势',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 20),
            Center(
              child: Text(
                '暂无数据',
                style: TextStyle(color: AppTheme.textSecondary),
              ),
            ),
          ],
        ),
      );
    }

    final maxPoints =
        stats.map((s) => s.points).reduce((a, b) => a > b ? a : b).clamp(1, 999);

    return AppCard(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '本周趋势',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 20),
          SizedBox(
            height: 150,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: stats.map((stat) {
                final height = (stat.points / maxPoints) * 120;
                final isToday = _isToday(stat.date);
                return Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        if (stat.points > 0)
                          Text(
                            '${stat.points}',
                            style: TextStyle(
                              color: isToday
                                  ? AppTheme.primaryColor
                                  : AppTheme.textSecondary,
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        const SizedBox(height: 4),
                        _AnimatedBar(
                          height: height.clamp(4.0, 120.0),
                          decoration: BoxDecoration(
                            gradient: isToday
                                ? AppTheme.primaryGradient
                                : LinearGradient(
                                    colors: [
                                      AppTheme.secondaryColor.withValues(alpha: 0.6),
                                      AppTheme.secondaryColor.withValues(alpha: 0.3),
                                    ],
                                    begin: Alignment.bottomCenter,
                                    end: Alignment.topCenter,
                                  ),
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          stat.date,
                          style: TextStyle(
                            color: isToday
                                ? AppTheme.primaryColor
                                : AppTheme.textSecondary,
                            fontSize: 12,
                            fontWeight:
                                isToday ? FontWeight.bold : FontWeight.normal,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBehaviorRanking(List<PointRecord> records) {
    // 按行为名称统计
    final Map<String, int> behaviorCount = {};
    final Map<String, int> behaviorPoints = {};

    for (final record in records) {
      behaviorCount[record.behaviorName] =
          (behaviorCount[record.behaviorName] ?? 0) + 1;
      behaviorPoints[record.behaviorName] =
          (behaviorPoints[record.behaviorName] ?? 0) + record.points;
    }

    final sortedBehaviors = behaviorCount.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    if (sortedBehaviors.isEmpty) {
      return const SizedBox.shrink();
    }

    return AppCard(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '行为排行',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 16),
          ...sortedBehaviors.take(5).map((entry) {
            final name = entry.key;
            final count = entry.value;
            final points = behaviorPoints[name] ?? 0;
            final maxCount = sortedBehaviors.first.value;
            final progress = count / maxCount;

            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(
                children: [
                  SizedBox(
                    width: 80,
                    child: Text(
                      name,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: LinearProgressIndicator(
                        value: progress,
                        backgroundColor: Colors.grey.shade200,
                        valueColor: AlwaysStoppedAnimation(
                          points >= 0
                              ? AppTheme.accentColor.withValues(alpha: 0.7)
                              : AppTheme.warningColor.withValues(alpha: 0.7),
                        ),
                        minHeight: 12,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '$count次',
                    style: TextStyle(
                      color: AppTheme.textSecondary,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildRedemptionHistory(RewardProvider reward) {
    final redemptions = reward.redemptions;
    if (redemptions.isEmpty) {
      return const SizedBox.shrink();
    }

    return AppCard(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '兑换记录',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 16),
          ...redemptions.take(5).map((r) {
            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.grey.shade50,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          r.giftName,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Text(
                          '${r.redeemedAt.month}/${r.redeemedAt.day} ${r.redeemedAt.hour}:${r.redeemedAt.minute.toString().padLeft(2, '0')}',
                          style: TextStyle(
                            color: AppTheme.textSecondary,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: _getStatusColor(r.status).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      r.statusText,
                      style: TextStyle(
                        color: _getStatusColor(r.status),
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '-${r.pointsCost}',
                    style: TextStyle(
                      color: AppTheme.warningColor,
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'pending':
        return AppTheme.softOrange;
      case 'approved':
        return AppTheme.accentColor;
      case 'completed':
        return AppTheme.secondaryColor;
      case 'cancelled':
        return AppTheme.textSecondary;
      default:
        return AppTheme.textSecondary;
    }
  }

  Widget _buildPointHistory(RewardProvider reward) {
    final records = reward.pointRecords;

    // 按日期分组
    final groupedRecords = <String, List<PointRecord>>{};
    for (final r in records) {
      final key =
          '${r.recordedAt.year}-${r.recordedAt.month.toString().padLeft(2, '0')}-${r.recordedAt.day.toString().padLeft(2, '0')}';
      groupedRecords.putIfAbsent(key, () => []).add(r);
    }

    if (records.isEmpty) {
      return const SizedBox.shrink();
    }

    return AppCard(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text(
                '积分明细',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const Spacer(),
              Text(
                '共 ${records.length} 条记录',
                style: const TextStyle(
                  color: AppTheme.textSecondary,
                  fontSize: 12,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          // 显示最近 10 条记录
          ...groupedRecords.entries.take(3).expand((entry) => [
                _buildDateHeader(entry.key, entry.value),
                const SizedBox(height: 8),
                ...entry.value.take(5).map((r) => _buildRecordCard(r)),
                const SizedBox(height: 12),
              ]),
        ],
      ),
    );
  }

  Widget _buildDateHeader(String dateKey, List<PointRecord> dayRecords) {
    final date = DateTime.parse(dateKey);
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final yesterday = today.subtract(const Duration(days: 1));
    final dateOnly = DateTime(date.year, date.month, date.day);

    String label;
    if (dateOnly == today) {
      label = '今天';
    } else if (dateOnly == yesterday) {
      label = '昨天';
    } else {
      final weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
      label = '${date.month}月${date.day}日 ${weekdays[date.weekday - 1]}';
    }

    // 计算当天积分
    final dayPoints = dayRecords.fold<int>(0, (sum, r) => sum + r.points);

    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        children: [
          Container(
            width: 4,
            height: 16,
            decoration: BoxDecoration(
              color: AppTheme.primaryColor,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            label,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: AppTheme.textColor,
            ),
          ),
          const Spacer(),
          Text(
            '${dayPoints >= 0 ? '+' : ''}$dayPoints 积分',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: dayPoints >= 0 ? AppTheme.accentColor : AppTheme.warningColor,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRecordCard(PointRecord record) {
    final isPositive = record.points >= 0;
    final isRedemption = record.behaviorName.startsWith('兑换:');

    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey.shade50,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: isRedemption
                  ? AppTheme.secondaryColor.withValues(alpha: 0.1)
                  : (isPositive
                      ? AppTheme.accentColor.withValues(alpha: 0.1)
                      : AppTheme.warningColor.withValues(alpha: 0.1)),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              isRedemption
                  ? Icons.card_giftcard_rounded
                  : (isPositive
                      ? Icons.check_circle_rounded
                      : Icons.remove_circle_rounded),
              color: isRedemption
                  ? AppTheme.secondaryColor
                  : (isPositive ? AppTheme.accentColor : AppTheme.warningColor),
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
                const SizedBox(height: 2),
                Text(
                  '${record.recordedAt.hour}:${record.recordedAt.minute.toString().padLeft(2, '0')}',
                  style: const TextStyle(
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
              color: isRedemption
                  ? AppTheme.secondaryColor
                  : (isPositive ? AppTheme.accentColor : AppTheme.warningColor),
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  bool _isToday(String dateStr) {
    final today = DateTime.now();
    final weekdays = ['一', '二', '三', '四', '五', '六', '日'];
    final todayWeekday = weekdays[today.weekday - 1];
    return dateStr == todayWeekday;
  }
}

class _AnimatedBar extends StatelessWidget {
  final double height;
  final BoxDecoration decoration;

  const _AnimatedBar({
    super.key,
    required this.height,
    required this.decoration,
  });

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: height),
      duration: const Duration(milliseconds: 600),
      curve: Curves.easeOutCubic,
      builder: (context, value, child) {
        return Container(
          height: value,
          decoration: decoration,
        );
      },
    );
  }
}
