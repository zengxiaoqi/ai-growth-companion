// 积分明细页面

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../components/app_card.dart';
import '../../providers/user_provider.dart';
import '../../providers/reward_provider.dart';
import '../../models/reward_models.dart';

class PointHistoryScreen extends StatefulWidget {
  const PointHistoryScreen({super.key});

  @override
  State<PointHistoryScreen> createState() => _PointHistoryScreenState();
}

class _PointHistoryScreenState extends State<PointHistoryScreen> {
  bool _isLoadingMore = false;
  int _currentPage = 1;
  bool _hasMore = true;

  Future<void> _loadMore() async {
    if (_isLoadingMore || !_hasMore) return;
    setState(() => _isLoadingMore = true);

    final userProvider = context.read<UserProvider>();
    final rewardProvider = context.read<RewardProvider>();
    final childId = await userProvider.resolveChildId();
    if (childId == null) {
      if (mounted) setState(() => _isLoadingMore = false);
      return;
    }

    _currentPage++;
    await rewardProvider.loadPointRecords(childId, page: _currentPage, limit: 30, append: true);

    if (mounted) {
      setState(() {
        _isLoadingMore = false;
        // 如果返回的记录少于 limit，说明没有更多了
        _hasMore = rewardProvider.pointRecords.length >= _currentPage * 30;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<RewardProvider>(
      builder: (context, reward, _) {
        final records = reward.pointRecords;
        final summary = reward.summary;

        // 按日期分组
        final groupedRecords = <String, List<PointRecord>>{};
        for (final r in records) {
          final key =
              '${r.recordedAt.year}-${r.recordedAt.month.toString().padLeft(2, '0')}-${r.recordedAt.day.toString().padLeft(2, '0')}';
          groupedRecords.putIfAbsent(key, () => []).add(r);
        }

        return NotificationListener<ScrollNotification>(
          onNotification: (notification) {
            if (notification is ScrollEndNotification &&
                notification.metrics.extentAfter < 200) {
              _loadMore();
            }
            return false;
          },
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // 积分概览
              if (summary != null) _buildPointsSummary(summary),
              const SizedBox(height: 16),
              // 积分明细标题
              Row(
                children: [
                  const Text(
                    '积分明细',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
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
              const SizedBox(height: 12),
              // 按日期分组显示
              if (groupedRecords.isEmpty)
                _buildEmptyState()
              else
                ...groupedRecords.entries.expand((entry) => [
                      _buildDateHeader(entry.key),
                      const SizedBox(height: 8),
                      ...entry.value.map((r) => _buildRecordCard(r)),
                      const SizedBox(height: 12),
                    ]),
              // 加载更多
              if (_isLoadingMore)
                const Center(
                  child: Padding(
                    padding: EdgeInsets.all(16),
                    child: CircularProgressIndicator(),
                  ),
                )
              else if (_hasMore && records.isNotEmpty)
                Center(
                  child: TextButton(
                    onPressed: _loadMore,
                    child: const Text('加载更多'),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildPointsSummary(PointsSummary summary) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: AppTheme.primaryGradient,
        borderRadius: BorderRadius.circular(20),
        boxShadow: AppTheme.softShadow(AppTheme.primaryColor),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildSummaryItem(
                icon: Icons.stars_rounded,
                label: '总积分',
                value: '${summary.totalPoints}',
              ),
              _buildSummaryItem(
                icon: Icons.today_rounded,
                label: '今日',
                value: '+${summary.todayPoints}',
              ),
              _buildSummaryItem(
                icon: Icons.date_range_rounded,
                label: '本月',
                value: '+${summary.monthPoints}',
              ),
              _buildSummaryItem(
                icon: Icons.local_fire_department_rounded,
                label: '连续',
                value: '${summary.streak}天',
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSummaryItem({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Column(
      children: [
        Icon(icon, color: Colors.white, size: 22),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.bold,
          ),
        ),
        Text(
          label,
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.8),
            fontSize: 11,
          ),
        ),
      ],
    );
  }

  Widget _buildDateHeader(String dateKey) {
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
    final dayRecords = context
        .read<RewardProvider>()
        .pointRecords
        .where((r) {
          final rd = DateTime(r.recordedAt.year, r.recordedAt.month, r.recordedAt.day);
          return rd == dateOnly;
        })
        .toList();
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

    return AppCard(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.all(12),
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

  Widget _buildEmptyState() {
    return Container(
      padding: const EdgeInsets.all(40),
      child: Column(
        children: [
          Icon(
            Icons.receipt_long_rounded,
            size: 64,
            color: AppTheme.textSecondary.withValues(alpha: 0.3),
          ),
          const SizedBox(height: 16),
          Text(
            '暂无积分记录',
            style: TextStyle(
              color: AppTheme.textSecondary,
              fontSize: 16,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '去打卡页面完成日常任务吧！',
            style: TextStyle(
              color: AppTheme.textSecondary.withValues(alpha: 0.7),
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }
}
