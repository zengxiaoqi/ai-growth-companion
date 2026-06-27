// 积分明细页面

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../providers/user_provider.dart';
import '../../providers/reward_provider.dart';
import '../../models/reward_models.dart';

class PointsDetailScreen extends StatefulWidget {
  const PointsDetailScreen({super.key});

  @override
  State<PointsDetailScreen> createState() => _PointsDetailScreenState();
}

class _PointsDetailScreenState extends State<PointsDetailScreen> {
  String _filter = 'all'; // all, positive, negative

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    final userProvider = context.read<UserProvider>();
    final rewardProvider = context.read<RewardProvider>();
    final childId = await userProvider.resolveChildId();
    if (childId == null) return;
    await rewardProvider.loadPointRecords(childId, limit: 50);
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<RewardProvider>(
      builder: (context, reward, _) {
        final records = _filterRecords(reward.pointRecords);

        return Column(
          children: [
            // 筛选标签
            _buildFilterTabs(),
            // 统计摘要
            _buildStatsSummary(reward),
            // 记录列表
            Expanded(
              child: records.isEmpty
                  ? _buildEmptyState()
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: records.length,
                      itemBuilder: (context, index) {
                        final record = records[index];
                        return _buildRecordCard(record, reward);
                      },
                    ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildFilterTabs() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          _buildFilterChip('all', '全部'),
          const SizedBox(width: 8),
          _buildFilterChip('positive', '加分'),
          const SizedBox(width: 8),
          _buildFilterChip('negative', '扣分'),
        ],
      ),
    );
  }

  Widget _buildFilterChip(String value, String label) {
    final isSelected = _filter == value;
    return GestureDetector(
      onTap: () => setState(() => _filter = value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? AppTheme.primaryColor : Colors.grey.shade100,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: isSelected ? Colors.white : AppTheme.textColor,
            fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
            fontSize: 13,
          ),
        ),
      ),
    );
  }

  Widget _buildStatsSummary(RewardProvider reward) {
    final summary = reward.summary;
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: AppTheme.secondaryGradient,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _buildStatItem('总积分', '${summary?.totalPoints ?? 0}', Icons.star_rounded),
          Container(
            width: 1,
            height: 30,
            color: Colors.white.withValues(alpha: 0.3),
          ),
          _buildStatItem('今日', '+${summary?.todayPoints ?? 0}', Icons.today_rounded),
          Container(
            width: 1,
            height: 30,
            color: Colors.white.withValues(alpha: 0.3),
          ),
          _buildStatItem('本周', '+${summary?.weekPoints ?? 0}', Icons.date_range_rounded),
        ],
      ),
    );
  }

  Widget _buildStatItem(String label, String value, IconData icon) {
    return Column(
      children: [
        Icon(icon, color: Colors.white, size: 20),
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

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.receipt_long_outlined,
            size: 64,
            color: AppTheme.textSecondary.withValues(alpha: 0.5),
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
            '完成日常任务开始积累积分吧！',
            style: TextStyle(
              color: AppTheme.textSecondary.withValues(alpha: 0.7),
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRecordCard(PointRecord record, RewardProvider reward) {
    final isPositive = record.isPositive;
    final color = isPositive ? AppTheme.accentColor : AppTheme.warningColor;
    final date = record.recordedAt;
    final dateStr = '${date.month}/${date.day}';
    final timeStr =
        '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';

    return Dismissible(
      key: Key('record_${record.id}'),
      direction: DismissDirection.endToStart,
      background: Container(
        margin: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(
          color: AppTheme.warningColor,
          borderRadius: BorderRadius.circular(16),
        ),
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        child: const Icon(Icons.delete, color: Colors.white),
      ),
      confirmDismiss: (direction) async {
        return await _showDeleteConfirm(record);
      },
      onDismissed: (direction) async {
        await reward.deletePointRecord(record.id);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: const Text('已删除记录'),
              backgroundColor: AppTheme.textSecondary,
              behavior: SnackBarBehavior.floating,
            ),
          );
        }
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.04),
              blurRadius: 10,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          children: [
            // 左侧图标
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                isPositive ? Icons.arrow_upward_rounded : Icons.arrow_downward_rounded,
                color: color,
                size: 24,
              ),
            ),
            const SizedBox(width: 12),
            // 中间内容
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    record.behaviorName,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Text(
                        dateStr,
                        style: TextStyle(
                          color: AppTheme.textSecondary,
                          fontSize: 12,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        timeStr,
                        style: TextStyle(
                          color: AppTheme.textSecondary,
                          fontSize: 12,
                        ),
                      ),
                      if (record.note != null && record.note!.isNotEmpty) ...[
                        const SizedBox(width: 8),
                        Flexible(
                          child: Text(
                            record.note!,
                            style: TextStyle(
                              color: AppTheme.textSecondary,
                              fontSize: 12,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            // 右侧积分
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                '${isPositive ? '+' : ''}${record.points}',
                style: TextStyle(
                  color: color,
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<PointRecord> _filterRecords(List<PointRecord> records) {
    switch (_filter) {
      case 'positive':
        return records.where((r) => r.isPositive).toList();
      case 'negative':
        return records.where((r) => !r.isPositive).toList();
      default:
        return records;
    }
  }

  Future<bool> _showDeleteConfirm(PointRecord record) async {
    return await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            title: const Text('确认删除'),
            content: Text('确定要删除 "${record.behaviorName}" 的记录吗？'),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('取消'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(ctx, true),
                style: FilledButton.styleFrom(
                  backgroundColor: AppTheme.warningColor,
                ),
                child: const Text('删除'),
              ),
            ],
          ),
        ) ??
        false;
  }
}
