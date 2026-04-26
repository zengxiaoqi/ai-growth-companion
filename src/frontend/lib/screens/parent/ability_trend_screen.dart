import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../components/top_bar.dart';
import '../../providers/user_provider.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import 'child_selector.dart';

/// 家长端能力趋势页：
/// 提供 7/30/90 天范围切换，展示多维度折线趋势。
class AbilityTrendScreen extends StatefulWidget {
  const AbilityTrendScreen({super.key});

  @override
  State<AbilityTrendScreen> createState() => _AbilityTrendScreenState();
}

class _AbilityTrendScreenState extends State<AbilityTrendScreen> {
  static const List<_DomainMeta> _domains = [
    _DomainMeta(key: 'language', label: '语言', color: Color(0xFF006384)),
    _DomainMeta(key: 'math', label: '数学', color: Color(0xFF586000)),
    _DomainMeta(key: 'science', label: '科学', color: Color(0xFF705900)),
    _DomainMeta(key: 'art', label: '艺术', color: Color(0xFFB9AE6E)),
    _DomainMeta(key: 'social', label: '社交', color: Color(0xFFB02500)),
  ];

  int _rangeDays = 30;
  bool _isLoadingChildren = true;
  bool _isLoadingTrend = false;

  List<Map<String, dynamic>> _children = [];
  int? _selectedChildId;
  List<Map<String, dynamic>> _trendRows = [];

  @override
  void initState() {
    super.initState();
    _loadChildren();
  }

  Future<void> _loadChildren() async {
    // 先加载可选孩子
    final parentId = _currentParentId;
    if (parentId == null) {
      setState(() {
        _isLoadingChildren = false;
        _children = [];
      });
      return;
    }

    final api = context.read<ApiService>();
    final raw = await api.getChildrenByParent(parentId);
    final children = raw
        .whereType<Map>()
        .map((e) => e.map((k, v) => MapEntry(k.toString(), v)))
        .toList();

    if (!mounted) return;

    setState(() {
      _children = children;
      _selectedChildId = _toInt(children.isNotEmpty ? children.first['id'] : null);
      _isLoadingChildren = false;
    });

    if (_selectedChildId != null) {
      await _loadTrendData();
    }
  }

  Future<void> _loadTrendData() async {
    // 按选中时间范围换算周数，拉取后端聚合趋势
    final childId = _selectedChildId;
    if (childId == null) return;

    setState(() => _isLoadingTrend = true);

    final api = context.read<ApiService>();
    final rows = await api.getAbilityTrend(childId, weeks: _weeksFromDays(_rangeDays));
    final normalized = rows
        .whereType<Map>()
        .map((e) => e.map((k, v) => MapEntry(k.toString(), v)))
        .toList();

    if (!mounted) return;

    setState(() {
      _trendRows = normalized;
      _isLoadingTrend = false;
    });
  }

  Future<void> _onChildChanged(Map<String, dynamic> child) async {
    final nextId = _toInt(child['id']);
    if (nextId == null || nextId == _selectedChildId) return;

    setState(() {
      _selectedChildId = nextId;
      _trendRows = [];
    });

    await _loadTrendData();
  }

  Future<void> _onRangeChanged(int days) async {
    if (days == _rangeDays) return;
    setState(() => _rangeDays = days);
    await _loadTrendData();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      body: Column(
        children: [
          TopBar(
            title: '能力趋势',
            subtitle: '多维能力变化曲线',
            leftSlot: IconButton(
              onPressed: () => Navigator.of(context).pop(),
              icon: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppTheme.backgroundColor,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.arrow_back_rounded, size: 20, color: AppTheme.textColor),
              ),
            ),
          ),
          Expanded(child: _buildBody()),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (_isLoadingChildren) {
      return const Center(child: CircularProgressIndicator(color: AppTheme.primaryColor));
    }

    if (_children.isEmpty) {
      return const _EmptyState(
        title: '暂无孩子账号',
        description: '请先关联孩子，再查看能力趋势图。',
      );
    }

    final pointsByDomain = _buildLineSpots();
    final hasData = pointsByDomain.values.any((spots) => spots.any((s) => s.y > 0));

    return RefreshIndicator(
      color: AppTheme.primaryColor,
      onRefresh: _loadTrendData,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          ChildSelector(
            children: _children,
            selectedChildId: _selectedChildId,
            onChildChanged: _onChildChanged,
            mode: ChildSelectorMode.bottomSheet,
          ),
          const SizedBox(height: 14),
          _buildRangePicker(),
          const SizedBox(height: 14),
          _buildTrendCard(pointsByDomain, hasData),
          const SizedBox(height: 14),
          _buildLegendCard(),
        ],
      ),
    );
  }

  Widget _buildRangePicker() {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: SegmentedButton<int>(
          segments: const [
            ButtonSegment<int>(value: 7, label: Text('7天')),
            ButtonSegment<int>(value: 30, label: Text('30天')),
            ButtonSegment<int>(value: 90, label: Text('90天')),
          ],
          selected: {_rangeDays},
          onSelectionChanged: (value) {
            if (value.isNotEmpty) {
              _onRangeChanged(value.first);
            }
          },
        ),
      ),
    );
  }

  Widget _buildTrendCard(Map<String, List<FlSpot>> pointsByDomain, bool hasData) {
    final double maxX = _trendRows.isEmpty ? 0 : (_trendRows.length - 1).toDouble();

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '能力趋势折线图',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.textColor),
            ),
            const SizedBox(height: 4),
            Text(
              '最近 ${_rangeDays} 天的能力变化',
              style: const TextStyle(fontSize: 13, color: AppTheme.textSecondary),
            ),
            const SizedBox(height: 14),
            if (_isLoadingTrend)
              const SizedBox(
                height: 300,
                child: Center(child: CircularProgressIndicator(color: AppTheme.primaryColor)),
              )
            else if (!hasData)
              const SizedBox(
                height: 300,
                child: _EmptyState(
                  title: '暂无趋势数据',
                  description: '持续学习后将自动生成趋势曲线。',
                ),
              )
            else
              SizedBox(
                height: 300,
                child: LineChart(
                  LineChartData(
                    minX: 0,
                    maxX: maxX,
                    minY: 0,
                    maxY: 100,
                    lineTouchData: const LineTouchData(enabled: true),
                    gridData: FlGridData(
                      show: true,
                      drawVerticalLine: true,
                      horizontalInterval: 20,
                      verticalInterval: 1,
                      getDrawingHorizontalLine: (_) => FlLine(
                        color: AppTheme.textSecondary.withOpacity(0.14),
                        strokeWidth: 1,
                      ),
                      getDrawingVerticalLine: (_) => FlLine(
                        color: AppTheme.textSecondary.withOpacity(0.08),
                        strokeWidth: 1,
                      ),
                    ),
                    borderData: FlBorderData(
                      show: true,
                      border: Border.all(color: AppTheme.textSecondary.withOpacity(0.16)),
                    ),
                    titlesData: FlTitlesData(
                      topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                      rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                      leftTitles: AxisTitles(
                        sideTitles: SideTitles(
                          showTitles: true,
                          reservedSize: 34,
                          interval: 20,
                          getTitlesWidget: (value, _) => Text(
                            '${value.toInt()}',
                            style: const TextStyle(fontSize: 10, color: AppTheme.textSecondary),
                          ),
                        ),
                      ),
                      bottomTitles: AxisTitles(
                        sideTitles: SideTitles(
                          showTitles: true,
                          reservedSize: 26,
                          interval: 1,
                          getTitlesWidget: (value, _) {
                            final index = value.toInt();
                            if (index < 0 || index >= _trendRows.length) {
                              return const SizedBox.shrink();
                            }
                            final label = _trendRows[index]['week']?.toString() ?? '';
                            return Padding(
                              padding: const EdgeInsets.only(top: 6),
                              child: Text(
                                label,
                                style: const TextStyle(fontSize: 10, color: AppTheme.textSecondary),
                              ),
                            );
                          },
                        ),
                      ),
                    ),
                    lineBarsData: _domains.map((domain) {
                      final points = pointsByDomain[domain.key] ?? const <FlSpot>[];
                      return LineChartBarData(
                        spots: points,
                        color: domain.color,
                        isCurved: true,
                        barWidth: 2.6,
                        isStrokeCapRound: true,
                        dotData: FlDotData(
                          show: true,
                          getDotPainter: (spot, _, __, ___) {
                            return FlDotCirclePainter(
                              radius: 2.6,
                              color: domain.color,
                              strokeWidth: 1,
                              strokeColor: Colors.white,
                            );
                          },
                        ),
                        belowBarData: BarAreaData(
                          show: true,
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [
                              domain.color.withOpacity(0.18),
                              domain.color.withOpacity(0.0),
                            ],
                          ),
                        ),
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

  Widget _buildLegendCard() {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Wrap(
          spacing: 14,
          runSpacing: 10,
          children: _domains
              .map(
                (d) => _LegendDot(
                  color: d.color,
                  text: d.label,
                ),
              )
              .toList(),
        ),
      ),
    );
  }

  Map<String, List<FlSpot>> _buildLineSpots() {
    // 将每周趋势数据映射为折线点位
    final map = <String, List<FlSpot>>{};
    for (final domain in _domains) {
      map[domain.key] = <FlSpot>[];
    }

    for (var i = 0; i < _trendRows.length; i++) {
      final row = _trendRows[i];
      for (final domain in _domains) {
        final y = _toScore(row[domain.key]);
        map[domain.key]!.add(FlSpot(i.toDouble(), y));
      }
    }

    return map;
  }

  int _weeksFromDays(int days) {
    if (days <= 7) return 1;
    if (days <= 30) return 4;
    return 12;
  }

  int? get _currentParentId {
    final user = context.read<UserProvider>().currentUser;
    return _toInt(user?['id']);
  }

  int? _toInt(dynamic value) {
    if (value is int) return value;
    return int.tryParse(value?.toString() ?? '');
  }

  double _toScore(dynamic value) {
    final score = value is num ? value.toDouble() : double.tryParse(value?.toString() ?? '') ?? 0;
    return score.clamp(0, 100).toDouble();
  }
}

class _LegendDot extends StatelessWidget {
  final Color color;
  final String text;

  const _LegendDot({required this.color, required this.text});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 6),
        Text(text, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
      ],
    );
  }
}

class _EmptyState extends StatelessWidget {
  final String title;
  final String description;

  const _EmptyState({required this.title, required this.description});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.show_chart_rounded, color: AppTheme.textSecondary.withOpacity(0.45), size: 42),
            const SizedBox(height: 10),
            Text(
              title,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppTheme.textColor),
            ),
            const SizedBox(height: 4),
            Text(
              description,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13, color: AppTheme.textSecondary),
            ),
          ],
        ),
      ),
    );
  }
}

class _DomainMeta {
  final String key;
  final String label;
  final Color color;

  const _DomainMeta({required this.key, required this.label, required this.color});
}
