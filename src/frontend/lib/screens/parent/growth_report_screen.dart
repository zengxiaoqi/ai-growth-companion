import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:provider/provider.dart';

import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import 'child_selector.dart';

/// 成长报告：展示孩子的学习统计、技能进度、成就和 AI 建议
class GrowthReportScreen extends StatefulWidget {
  final int? initialChildId;

  const GrowthReportScreen({
    super.key,
    this.initialChildId,
  });

  @override
  State<GrowthReportScreen> createState() => _GrowthReportScreenState();
}

class _GrowthReportScreenState extends State<GrowthReportScreen> {
  bool _isLoading = true;
  String? _error;
  List<Map<String, dynamic>> _children = [];
  int? _selectedChildId;
  String _period = 'weekly'; // daily / weekly / monthly

  // 报告数据
  int _totalTimeMinutes = 0;
  int _totalLessons = 0;
  int _avgScore = 0;
  List<_DailyStat> _dailyStats = [];
  Map<String, int> _skillProgress = {};
  List<_Achievement> _achievements = [];
  List<String> _aiInsights = [];

  // 领域配置
  static const _domains = {
    'language': {'label': '语言', 'color': Color(0xFF006384)},
    'math': {'label': '数学', 'color': Color(0xFF586000)},
    'science': {'label': '科学', 'color': Color(0xFF705900)},
    'art': {'label': '艺术', 'color': Color(0xFFb9ae6e)},
    'social': {'label': '社会', 'color': Color(0xFFb02500)},
  };

  static const _periodTabs = [
    {'key': 'daily', 'label': '日报'},
    {'key': 'weekly', 'label': '周报'},
    {'key': 'monthly', 'label': '月报'},
  ];

  @override
  void initState() {
    super.initState();
    _selectedChildId = widget.initialChildId;
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadData());
  }

  Future<void> _loadData() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final api = context.read<ApiService>();
      final parentId = 1; // TODO: 从 UserProvider 获取

      // 加载孩子列表
      final children = await api.getChildrenByParent(parentId);
      final childList = children
          .whereType<Map>()
          .map((c) => c.map((k, v) => MapEntry(k.toString(), v)))
          .toList();

      if (_selectedChildId == null && childList.isNotEmpty) {
        _selectedChildId = _toInt(childList.first['id']);
      }

      // 加载报告数据
      if (_selectedChildId != null) {
        // 加载报告
        try {
          final report = await api.getReport(
            userId: _selectedChildId!,
            period: _period,
          );
          if (report != null) {
            _parseReport(report);
          }
        } catch (_) {
          // 报告接口可能不存在，使用模拟数据
        }

        // 加载成就
        try {
          final achs = await api.getAchievements(_selectedChildId!);
          _achievements = achs
              .whereType<Map>()
              .map((a) {
                final m = a.map((k, v) => MapEntry(k.toString(), v));
                return _Achievement(
                  id: _toInt(m['id']) ?? 0,
                  name: m['name']?.toString() ?? '',
                  description: m['description']?.toString() ?? '',
                  progress: _toInt(m['progress']) ?? 0,
                  totalRequired: _toInt(m['totalRequired']) ?? 1,
                  unlocked: m['unlockedAt'] != null,
                );
              })
              .where((a) => a.name.isNotEmpty)
              .take(4)
              .toList();
        } catch (_) {
          _achievements = [];
        }
      }

      if (!mounted) return;
      setState(() {
        _children = childList;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '加载失败：$e';
        _isLoading = false;
      });
    }
  }

  void _parseReport(Map<String, dynamic> report) {
    final totalTime = _toInt(report['totalLearningTime']) ?? 0;
    _totalTimeMinutes = (totalTime / 60).round();
    _totalLessons = _toInt(report['totalLessonsCompleted']) ?? 0;
    _avgScore = _toInt(report['averageScore']) ?? 0;

    // 每日统计
    final dailyRaw = report['dailyStats'];
    if (dailyRaw is List) {
      _dailyStats = dailyRaw
          .whereType<Map>()
          .map((item) {
            final m = item.map((k, v) => MapEntry(k.toString(), v));
            final date = m['date']?.toString() ?? '';
            return _DailyStat(
              label: date.isNotEmpty
                  ? _formatDate(date)
                  : '',
              minutes: (_toInt(m['totalTime']) ?? 0) ~/ 60,
              lessons: _toInt(m['completedLessons']) ?? 0,
            );
          })
          .where((d) => d.label.isNotEmpty)
          .toList();
    }

    // 技能进度
    final sp = report['skillProgress'];
    if (sp is Map) {
      _skillProgress = sp.map((k, v) => MapEntry(k.toString(), _toInt(v) ?? 0));
    }

    // AI 建议
    final insights = report['insights'];
    if (insights is List) {
      _aiInsights = insights
          .whereType<String>()
          .where((s) => s.isNotEmpty)
          .toList();
    }
  }

  String _formatDate(String dateStr) {
    try {
      final date = DateTime.parse(dateStr);
      return '${date.month}月${date.day}日';
    } catch (_) {
      return dateStr;
    }
  }

  int? _toInt(dynamic value) {
    if (value is int) return value;
    return int.tryParse(value?.toString() ?? '');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      body: SafeArea(
        child: Column(
          children: [
            // 顶部标题栏
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(Icons.arrow_back_rounded, size: 20),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    '成长报告',
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const Spacer(),
                  IconButton(
                    onPressed: _isLoading ? null : _loadData,
                    icon: const Icon(Icons.refresh_rounded),
                  ),
                ],
              ),
            ),

            // 孩子选择器
            if (_children.isNotEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: ChildSelector(
                  children: _children,
                  selectedChildId: _selectedChildId,
                  onChildChanged: (child) {
                    setState(() => _selectedChildId = _toInt(child['id']));
                    _loadData();
                  },
                ),
              ),

            const SizedBox(height: 8),

            // 周期切换
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: _buildPeriodSelector(theme),
            ),

            const SizedBox(height: 8),

            // 内容区域
            Expanded(
              child: _isLoading
                  ? const Center(
                      child: CircularProgressIndicator(
                        color: AppTheme.primaryColor,
                      ),
                    )
                  : _error != null
                      ? _buildErrorState()
                      : _buildContent(theme),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPeriodSelector(ThemeData theme) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.grey.shade100,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: _periodTabs.map((tab) {
          final isSelected = _period == tab['key'];
          return Expanded(
            child: GestureDetector(
              onTap: () {
                setState(() => _period = tab['key'] as String);
                _loadData();
              },
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 8),
                decoration: BoxDecoration(
                  color: isSelected ? Colors.white : Colors.transparent,
                  borderRadius: BorderRadius.circular(10),
                  boxShadow: isSelected
                      ? [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.05),
                            blurRadius: 8,
                            offset: const Offset(0, 2),
                          ),
                        ]
                      : null,
                ),
                child: Text(
                  tab['label'] as String,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                    color: isSelected
                        ? AppTheme.primaryColor
                        : AppTheme.textSecondary,
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildErrorState() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.error_outline_rounded,
              size: 48, color: AppTheme.warningColor),
          const SizedBox(height: 12),
          Text(_error ?? '加载失败'),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: _loadData,
            icon: const Icon(Icons.refresh_rounded),
            label: const Text('重试'),
          ),
        ],
      ),
    );
  }

  Widget _buildContent(ThemeData theme) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 统计卡片
          _buildStatCards(theme),
          const SizedBox(height: 16),

          // 每日学习柱状图
          _buildDailyChart(theme),
          const SizedBox(height: 16),

          // 技能进度
          _buildSkillProgress(theme),
          const SizedBox(height: 16),

          // 成就亮点
          _buildAchievements(theme),
          const SizedBox(height: 16),

          // AI 学习建议
          _buildAIInsights(theme),
        ],
      ),
    );
  }

  Widget _buildStatCards(ThemeData theme) {
    return Row(
      children: [
        Expanded(
          child: _buildStatCard(
            theme: theme,
            icon: Icons.timer_rounded,
            iconBg: AppTheme.secondaryColor.withOpacity(0.12),
            iconColor: AppTheme.secondaryColor,
            label: '总学习时长',
            value: '$_totalTimeMinutes',
            unit: '分钟',
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _buildStatCard(
            theme: theme,
            icon: Icons.school_rounded,
            iconBg: AppTheme.accentColor.withOpacity(0.12),
            iconColor: AppTheme.accentColor,
            label: '完成课程',
            value: '$_totalLessons',
            unit: '节',
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _buildStatCard(
            theme: theme,
            icon: Icons.emoji_events_rounded,
            iconBg: AppTheme.primaryColor.withOpacity(0.12),
            iconColor: AppTheme.primaryColor,
            label: '平均得分',
            value: '$_avgScore',
            unit: '分',
          ),
        ),
      ],
    );
  }

  Widget _buildStatCard({
    required ThemeData theme,
    required IconData icon,
    required Color iconBg,
    required Color iconColor,
    required String label,
    required String value,
    required String unit,
  }) {
    return Card(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: Colors.grey.shade200),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: iconBg,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, size: 20, color: iconColor),
            ),
            const SizedBox(height: 8),
            Text(
              label,
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppTheme.textSecondary,
              ),
            ),
            const SizedBox(height: 2),
            Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Text(
                  value,
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: iconColor,
                  ),
                ),
                const SizedBox(width: 2),
                Text(
                  unit,
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textSecondary,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDailyChart(ThemeData theme) {
    return Card(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(color: Colors.grey.shade200),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  '每日学习统计',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppTheme.secondaryColor.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '近7天',
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: AppTheme.secondaryColor,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            if (_dailyStats.isEmpty)
              SizedBox(
                height: 200,
                child: Center(
                  child: Text(
                    '暂无学习数据',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: AppTheme.textSecondary,
                    ),
                  ),
                ),
              )
            else
              SizedBox(
                height: 200,
                child: BarChart(
                  BarChartData(
                    alignment: BarChartAlignment.spaceAround,
                    maxY: _dailyStats.map((d) => d.minutes).fold(0, (a, b) => a > b ? a : b) * 1.2,
                    barTouchData: BarTouchData(
                      enabled: true,
                      touchTooltipData: BarTouchTooltipData(
                        getTooltipItem: (group, groupIndex, rod, rodIndex) {
                          final stat = _dailyStats[groupIndex];
                          return BarTooltipItem(
                            '${stat.label}\n${stat.minutes}分钟 · ${stat.lessons}节',
                            const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                              fontSize: 12,
                            ),
                          );
                        },
                      ),
                    ),
                    titlesData: FlTitlesData(
                      leftTitles: const AxisTitles(
                        sideTitles: SideTitles(showTitles: false),
                      ),
                      topTitles: const AxisTitles(
                        sideTitles: SideTitles(showTitles: false),
                      ),
                      rightTitles: const AxisTitles(
                        sideTitles: SideTitles(showTitles: false),
                      ),
                      bottomTitles: AxisTitles(
                        sideTitles: SideTitles(
                          showTitles: true,
                          getTitlesWidget: (value, meta) {
                            final index = value.toInt();
                            if (index >= 0 && index < _dailyStats.length) {
                              return Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Text(
                                  _dailyStats[index].label,
                                  style: const TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w600,
                                    color: AppTheme.textSecondary,
                                  ),
                                ),
                              );
                            }
                            return const SizedBox.shrink();
                          },
                        ),
                      ),
                    ),
                    gridData: const FlGridData(show: false),
                    borderData: FlBorderData(show: false),
                    barGroups: _dailyStats.asMap().entries.map((entry) {
                      final index = entry.key;
                      final stat = entry.value;
                      final isMax = stat.minutes ==
                          _dailyStats.map((d) => d.minutes).reduce((a, b) => a > b ? a : b);
                      return BarChartGroupData(
                        x: index,
                        barRods: [
                          BarChartRodData(
                            toY: stat.minutes.toDouble(),
                            width: 20,
                            borderRadius: const BorderRadius.vertical(
                              top: Radius.circular(6),
                            ),
                            gradient: LinearGradient(
                              colors: isMax
                                  ? [AppTheme.primaryColor, AppTheme.primaryColor.withOpacity(0.7)]
                                  : [AppTheme.secondaryColor.withOpacity(0.6), AppTheme.secondaryColor.withOpacity(0.3)],
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                            ),
                          ),
                        ],
                      );
                    }).toList(),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildSkillProgress(ThemeData theme) {
    return Card(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(color: Colors.grey.shade200),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '技能进度',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 16),
            ..._domains.entries.map((entry) {
              final domain = entry.key;
              final config = entry.value;
              final progress = _skillProgress[domain] ?? 0;
              return Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 32,
                          height: 32,
                          decoration: BoxDecoration(
                            color: config['color'] as Color,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Center(
                            child: Text(
                              (config['label'] as String)[0],
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 12,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Text(
                          config['label'] as String,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const Spacer(),
                        Text(
                          '$progress%',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: config['color'] as Color,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(999),
                      child: LinearProgressIndicator(
                        value: progress / 100,
                        minHeight: 8,
                        backgroundColor: (config['color'] as Color).withOpacity(0.12),
                        color: config['color'] as Color,
                      ),
                    ),
                  ],
                ),
              );
            }),
          ],
        ),
      ),
    );
  }

  Widget _buildAchievements(ThemeData theme) {
    return Card(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(color: Colors.grey.shade200),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.emoji_events_rounded,
                    color: AppTheme.primaryColor, size: 22),
                const SizedBox(width: 8),
                Text(
                  '成就亮点',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (_achievements.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Text(
                  '暂无成就',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: AppTheme.textSecondary,
                  ),
                ),
              )
            else
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  mainAxisSpacing: 10,
                  crossAxisSpacing: 10,
                  childAspectRatio: 1.4,
                ),
                itemCount: _achievements.length,
                itemBuilder: (context, index) {
                  final ach = _achievements[index];
                  final percent =
                      (ach.progress / ach.totalRequired * 100).clamp(0, 100);
                  return Container(
                    decoration: BoxDecoration(
                      color: ach.unlocked
                          ? AppTheme.primaryColor.withOpacity(0.08)
                          : Colors.grey.shade50,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: ach.unlocked
                            ? AppTheme.primaryColor.withOpacity(0.2)
                            : Colors.grey.shade200,
                      ),
                    ),
                    padding: const EdgeInsets.all(10),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('🏅', style: TextStyle(fontSize: 20)),
                        const SizedBox(height: 4),
                        Text(
                          ach.name,
                          style: theme.textTheme.bodySmall?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 4),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(999),
                          child: LinearProgressIndicator(
                            value: percent / 100,
                            minHeight: 4,
                            backgroundColor: Colors.grey.shade200,
                            color: AppTheme.primaryColor,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${ach.progress}/${ach.totalRequired}',
                          style: theme.textTheme.bodySmall?.copyWith(
                            fontSize: 10,
                            color: AppTheme.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildAIInsights(ThemeData theme) {
    return Card(
      elevation: 0,
      color: AppTheme.secondaryColor,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
      ),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              AppTheme.secondaryColor,
              AppTheme.secondaryColor.withOpacity(0.85),
            ],
          ),
        ),
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.auto_awesome_rounded,
                          size: 14, color: Colors.white),
                      const SizedBox(width: 4),
                      Text(
                        'AI 洞察',
                        style: theme.textTheme.bodySmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            if (_aiInsights.isEmpty)
              Text(
                '继续学习后，AI 会根据最新表现给出更个性化的建议。',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: Colors.white.withOpacity(0.8),
                ),
              )
            else ...[
              Text(
                _aiInsights.first,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                  height: 1.4,
                ),
              ),
              if (_aiInsights.length > 1) ...[
                const SizedBox(height: 12),
                ..._aiInsights.skip(1).take(2).map((insight) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.trending_up_rounded,
                            size: 16, color: Colors.white70),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            insight,
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: Colors.white.withOpacity(0.8),
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                }),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class _DailyStat {
  final String label;
  final int minutes;
  final int lessons;

  const _DailyStat({
    required this.label,
    required this.minutes,
    required this.lessons,
  });
}

class _Achievement {
  final int id;
  final String name;
  final String description;
  final int progress;
  final int totalRequired;
  final bool unlocked;

  const _Achievement({
    required this.id,
    required this.name,
    required this.description,
    required this.progress,
    required this.totalRequired,
    required this.unlocked,
  });
}
