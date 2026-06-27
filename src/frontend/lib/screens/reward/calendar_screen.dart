// 打卡日历页面

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../components/app_card.dart';
import '../../providers/user_provider.dart';
import '../../providers/reward_provider.dart';

class CalendarScreen extends StatefulWidget {
  const CalendarScreen({super.key});

  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  late DateTime _currentMonth;

  @override
  void initState() {
    super.initState();
    _currentMonth = DateTime.now();
    _loadCalendar();
  }

  Future<void> _loadCalendar() async {
    final userProvider = context.read<UserProvider>();
    final rewardProvider = context.read<RewardProvider>();
    final childId = userProvider.activeChildId ??
        userProvider.currentUser?['id'] as int? ?? 1;

    await rewardProvider.loadCalendarData(
      childId,
      year: _currentMonth.year,
      month: _currentMonth.month,
    );
  }

  void _prevMonth() {
    setState(() {
      _currentMonth = DateTime(_currentMonth.year, _currentMonth.month - 1, 1);
    });
    _loadCalendar();
  }

  void _nextMonth() {
    final now = DateTime.now();
    final next = DateTime(_currentMonth.year, _currentMonth.month + 1, 1);
    if (next.isAfter(DateTime(now.year, now.month, 1))) return; // 不能超过当月
    setState(() => _currentMonth = next);
    _loadCalendar();
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<RewardProvider>(
      builder: (context, reward, _) {
        final calendarData = reward.calendarData;
        final dailyData = calendarData?['dailyData'] as Map<String, dynamic>? ?? {};

        return SingleChildScrollView(
          padding: const EdgeInsets.only(bottom: 20),
          child: Column(
            children: [
              // 月份导航
              _buildMonthNav(),
              // 月度统计
              if (calendarData != null) _buildMonthSummary(calendarData),
              // 日历
              _buildCalendar(dailyData),
              const SizedBox(height: 12),
            ],
          ),
        );
      },
    );
  }

  Widget _buildMonthNav() {
    final monthNames = [
      '', '一月', '二月', '三月', '四月', '五月', '六月',
      '七月', '八月', '九月', '十月', '十一月', '十二月'
    ];
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: AppTheme.primaryColor.withValues(alpha: 0.08),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        children: [
          IconButton(
            onPressed: _prevMonth,
            icon: Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: AppTheme.primaryColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.chevron_left_rounded, size: 20),
            ),
            color: AppTheme.primaryColor,
          ),
          Expanded(
            child: Center(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.calendar_month_rounded,
                    color: AppTheme.primaryColor,
                    size: 20,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '${_currentMonth.year}年 ${monthNames[_currentMonth.month]}',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.textColor,
                    ),
                  ),
                ],
              ),
            ),
          ),
          IconButton(
            onPressed: _nextMonth,
            icon: Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: AppTheme.primaryColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.chevron_right_rounded, size: 20),
            ),
            color: AppTheme.primaryColor,
          ),
        ],
      ),
    );
  }

  Widget _buildMonthSummary(Map<String, dynamic> data) {
    final totalPoints = data['totalPoints'] as int? ?? 0;
    final totalRecords = data['totalRecords'] as int? ?? 0;
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: AppTheme.primaryGradient,
        borderRadius: BorderRadius.circular(20),
        boxShadow: AppTheme.softShadow(AppTheme.primaryColor),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _buildSummaryItem('本月积分', '+$totalPoints', Icons.star_rounded),
          Container(
            width: 1,
            height: 40,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  Colors.white.withValues(alpha: 0),
                  Colors.white.withValues(alpha: 0.4),
                  Colors.white.withValues(alpha: 0),
                ],
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
              ),
            ),
          ),
          _buildSummaryItem('打卡次数', '$totalRecords', Icons.check_circle_rounded),
        ],
      ),
    );
  }

  Widget _buildSummaryItem(String label, String value, IconData icon) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.2),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, color: Colors.white, size: 22),
        ),
        const SizedBox(height: 8),
        Text(
          value,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 22,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.85),
            fontSize: 12,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }

  Widget _buildCalendar(Map<String, dynamic> dailyData) {
    final year = _currentMonth.year;
    final month = _currentMonth.month;
    final firstDay = DateTime(year, month, 1);
    final lastDay = DateTime(year, month + 1, 0);
    final daysInMonth = lastDay.day;
    // 周一为起始（0=周一，6=周日）
    final startWeekday = (firstDay.weekday - 1) % 7;

    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Column(
        children: [
          // 星期标题
          Row(
            children: ['一', '二', '三', '四', '五', '六', '日']
                .map((d) => Expanded(
                      child: Center(
                        child: Text(
                          d,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: (d == '六' || d == '日')
                                ? AppTheme.softOrange
                                : AppTheme.textSecondary,
                          ),
                        ),
                      ),
                    ))
                .toList(),
          ),
          const SizedBox(height: 8),
          // 日期网格
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 7,
              mainAxisSpacing: 4,
              crossAxisSpacing: 4,
            ),
            itemCount: startWeekday + daysInMonth,
            itemBuilder: (context, index) {
              if (index < startWeekday) {
                return const SizedBox.shrink();
              }
              final day = index - startWeekday + 1;
              final dateKey =
                  '$year-${month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';
              final dayData = dailyData[dateKey] as Map<String, dynamic>?;
              final hasRecord = dayData != null;
              final points = dayData?['points'] as int? ?? 0;
              final date = DateTime(year, month, day);
              final isToday = date == today;
              final isFuture = date.isAfter(today);
              final weekday = date.weekday;
              final isWeekend = weekday == 6 || weekday == 7;

              return GestureDetector(
                onTap: hasRecord && !isFuture
                    ? () => _showDayDetail(dateKey, date)
                    : null,
                child: Container(
                  decoration: BoxDecoration(
                    color: isToday
                        ? AppTheme.primaryColor.withValues(alpha: 0.15)
                        : hasRecord
                            ? (points >= 0
                                ? AppTheme.accentColor.withValues(alpha: 0.1)
                                : AppTheme.warningColor.withValues(alpha: 0.1))
                            : Colors.transparent,
                    borderRadius: BorderRadius.circular(10),
                    border: isToday
                        ? Border.all(color: AppTheme.primaryColor, width: 1.5)
                        : null,
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        '$day',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: isToday ? FontWeight.bold : FontWeight.normal,
                          color: isFuture
                              ? AppTheme.textSecondary.withValues(alpha: 0.4)
                              : isWeekend
                                  ? AppTheme.softOrange
                                  : AppTheme.textColor,
                        ),
                      ),
                      if (hasRecord) ...[
                        const SizedBox(height: 2),
                        Container(
                          width: 6,
                          height: 6,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: points >= 0
                                ? AppTheme.accentColor
                                : AppTheme.warningColor,
                          ),
                        ),
                        Text(
                          '${points > 0 ? '+' : ''}$points',
                          style: TextStyle(
                            fontSize: 9,
                            color: points >= 0
                                ? AppTheme.accentColor
                                : AppTheme.warningColor,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ] else if (!isFuture) ...[
                        const SizedBox(height: 2),
                        Container(
                          width: 6,
                          height: 6,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: Colors.grey.shade300,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  void _showDayDetail(String dateKey, DateTime date) async {
    final userProvider = context.read<UserProvider>();
    final rewardProvider = context.read<RewardProvider>();
    final childId = userProvider.activeChildId ??
        userProvider.currentUser?['id'] as int? ?? 1;

    final records = await rewardProvider.loadDayRecords(childId, dateKey);

    if (!mounted) return;

    final monthNames = [
      '', '一月', '二月', '三月', '四月', '五月', '六月',
      '七月', '八月', '九月', '十月', '十一月', '十二月'
    ];
    final weekdayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return Container(
          padding: const EdgeInsets.all(20),
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(ctx).size.height * 0.6,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.calendar_today_rounded,
                      color: AppTheme.primaryColor, size: 20),
                  const SizedBox(width: 8),
                  Text(
                    '${monthNames[date.month]}${date.day}日 ${weekdayNames[date.weekday - 1]}',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              if (records.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(20),
                  child: Text('暂无记录', style: TextStyle(color: AppTheme.textSecondary)),
                )
              else
                Expanded(
                  child: ListView.builder(
                    itemCount: records.length,
                    itemBuilder: (context, index) {
                      final r = records[index];
                      final isPositive = r.points >= 0;
                      return AppCard(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.all(12),
                        child: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(8),
                              decoration: BoxDecoration(
                                color: (isPositive
                                        ? AppTheme.accentColor
                                        : AppTheme.warningColor)
                                    .withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Icon(
                                isPositive
                                    ? Icons.check_circle
                                    : Icons.remove_circle,
                                color: isPositive
                                    ? AppTheme.accentColor
                                    : AppTheme.warningColor,
                                size: 18,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    r.behaviorName,
                                    style: const TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  Text(
                                    '${r.recordedAt.hour}:${r.recordedAt.minute.toString().padLeft(2, '0')}',
                                    style: const TextStyle(
                                      color: AppTheme.textSecondary,
                                      fontSize: 11,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Text(
                              '${isPositive ? '+' : ''}${r.points}',
                              style: TextStyle(
                                color: isPositive
                                    ? AppTheme.accentColor
                                    : AppTheme.warningColor,
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}
