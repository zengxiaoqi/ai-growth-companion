import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../components/top_bar.dart';
import '../../providers/user_provider.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import 'child_selector.dart';

/// 家长端能力雷达页：
/// 1. 选择孩子
/// 2. 拉取能力评估
/// 3. 对比当前与上月
class AbilityRadarScreen extends StatefulWidget {
  const AbilityRadarScreen({super.key});

  @override
  State<AbilityRadarScreen> createState() => _AbilityRadarScreenState();
}

class _AbilityRadarScreenState extends State<AbilityRadarScreen> {
  static const List<_DomainMeta> _domains = [
    _DomainMeta(key: 'language', label: '语言', color: Color(0xFF006384)),
    _DomainMeta(key: 'math', label: '数学', color: Color(0xFF586000)),
    _DomainMeta(key: 'science', label: '科学', color: Color(0xFF705900)),
    _DomainMeta(key: 'art', label: '艺术', color: Color(0xFFB9AE6E)),
    _DomainMeta(key: 'social', label: '社交', color: Color(0xFFB02500)),
  ];

  bool _isLoadingChildren = true;
  bool _isLoadingAbility = false;
  List<Map<String, dynamic>> _children = [];
  int? _selectedChildId;
  List<Map<String, dynamic>> _abilityRecords = [];

  @override
  void initState() {
    super.initState();
    _loadChildren();
  }

  Future<void> _loadChildren() async {
    // 先加载家长关联的孩子列表
    final parentId = _currentParentId;
    if (parentId == null) {
      setState(() {
        _isLoadingChildren = false;
        _children = [];
      });
      return;
    }

    final api = context.read<ApiService>();
    final rawChildren = await api.getChildrenByParent(parentId);
    final children = rawChildren
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
      await _loadAbilityData();
    }
  }

  Future<void> _loadAbilityData() async {
    // 根据当前孩子加载能力评估明细
    final childId = _selectedChildId;
    if (childId == null) return;

    setState(() => _isLoadingAbility = true);

    final api = context.read<ApiService>();
    final records = await api.getAbilityAssessment(childId);
    final normalized = records
        .whereType<Map>()
        .map((e) => e.map((k, v) => MapEntry(k.toString(), v)))
        .toList();

    if (!mounted) return;

    setState(() {
      _abilityRecords = normalized;
      _isLoadingAbility = false;
    });
  }

  Future<void> _onChildChanged(Map<String, dynamic> child) async {
    final nextId = _toInt(child['id']);
    if (nextId == null || nextId == _selectedChildId) return;

    setState(() {
      _selectedChildId = nextId;
      _abilityRecords = [];
    });

    await _loadAbilityData();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      body: Column(
        children: [
          TopBar(
            title: '能力雷达',
            subtitle: '当前 vs 上月',
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
        description: '请先在家长端关联孩子，之后可查看能力雷达。',
      );
    }

    final chart = _buildRadarCompare();
    final hasData = chart.currentValues.any((v) => v > 0) || chart.previousValues.any((v) => v > 0);

    return RefreshIndicator(
      color: AppTheme.primaryColor,
      onRefresh: _loadAbilityData,
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
          _buildRadarCard(chart, hasData),
          const SizedBox(height: 14),
          _buildDomainList(chart),
        ],
      ),
    );
  }

  Widget _buildRadarCard(_RadarCompare chart, bool hasData) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '五维能力评估',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.textColor),
            ),
            const SizedBox(height: 4),
            const Text(
              '从语言、数学、科学、艺术、社交观察孩子的成长变化',
              style: TextStyle(fontSize: 13, color: AppTheme.textSecondary),
            ),
            const SizedBox(height: 14),
            if (_isLoadingAbility)
              const SizedBox(
                height: 280,
                child: Center(child: CircularProgressIndicator(color: AppTheme.primaryColor)),
              )
            else if (!hasData)
              const SizedBox(
                height: 280,
                child: _EmptyState(
                  title: '暂无能力数据',
                  description: '完成学习后会逐步生成能力雷达图。',
                ),
              )
            else
              SizedBox(
                height: 280,
                child: RadarChart(
                  RadarChartData(
                    radarShape: RadarShape.polygon,
                    tickCount: 5,
                    titleTextStyle: const TextStyle(
                      color: AppTheme.textColor,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                    ticksTextStyle: const TextStyle(
                      color: AppTheme.textSecondary,
                      fontSize: 10,
                    ),
                    tickBorderData: BorderSide(
                      color: AppTheme.textSecondary.withOpacity(0.15),
                      width: 1,
                    ),
                    gridBorderData: BorderSide(
                      color: AppTheme.textSecondary.withOpacity(0.15),
                      width: 1,
                    ),
                    titlePositionPercentageOffset: 0.2,
                    getTitle: (index, _) {
                      if (index < 0 || index >= _domains.length) {
                        return const RadarChartTitle(text: '');
                      }
                      return RadarChartTitle(text: _domains[index].label);
                    },
                    dataSets: [
                      RadarDataSet(
                        fillColor: AppTheme.primaryColor.withOpacity(0.28),
                        borderColor: AppTheme.primaryColor,
                        borderWidth: 2,
                        entryRadius: 3,
                        dataEntries: chart.currentValues.map((v) => RadarEntry(value: v)).toList(),
                      ),
                      RadarDataSet(
                        fillColor: AppTheme.secondaryColor.withOpacity(0.16),
                        borderColor: AppTheme.secondaryColor,
                        borderWidth: 2,
                        entryRadius: 3,
                        dataEntries: chart.previousValues.map((v) => RadarEntry(value: v)).toList(),
                      ),
                    ],
                    borderData: FlBorderData(show: false),
                    radarBackgroundColor: Colors.transparent,
                  ),
                  swapAnimationDuration: const Duration(milliseconds: 400),
                ),
              ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 18,
              children: const [
                _LegendDot(color: AppTheme.primaryColor, text: '当前'),
                _LegendDot(color: AppTheme.secondaryColor, text: '上月'),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDomainList(_RadarCompare chart) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          children: List.generate(_domains.length, (index) {
            final domain = _domains[index];
            final current = chart.currentValues[index];
            final previous = chart.previousValues[index];
            final delta = current - previous;

            return Padding(
              padding: EdgeInsets.only(bottom: index == _domains.length - 1 ? 0 : 12),
              child: Row(
                children: [
                  Container(
                    width: 8,
                    height: 24,
                    decoration: BoxDecoration(
                      color: domain.color,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      domain.label,
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                    ),
                  ),
                  Text(
                    '${current.toStringAsFixed(0)}分',
                    style: const TextStyle(fontWeight: FontWeight.w700, color: AppTheme.textColor),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    delta == 0 ? '持平' : '${delta > 0 ? '+' : ''}${delta.toStringAsFixed(0)}',
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: delta >= 0 ? const Color(0xFF0B8F55) : const Color(0xFFB3261E),
                    ),
                  ),
                ],
              ),
            );
          }),
        ),
      ),
    );
  }

  _RadarCompare _buildRadarCompare() {
    // 以最近一条作为当前值，优先找一个月前的数据作为对比值
    final now = DateTime.now();
    final lastMonth = DateTime(now.year, now.month - 1, now.day);

    final grouped = <String, List<Map<String, dynamic>>>{};
    for (final domain in _domains) {
      grouped[domain.key] = [];
    }

    for (final row in _abilityRecords) {
      final domain = row['domain']?.toString() ?? '';
      if (!grouped.containsKey(domain)) continue;
      grouped[domain]!.add(row);
    }

    for (final entries in grouped.values) {
      entries.sort((a, b) {
        final at = _toDateTime(a['assessedAt']);
        final bt = _toDateTime(b['assessedAt']);
        if (at == null && bt == null) return 0;
        if (at == null) return 1;
        if (bt == null) return -1;
        return bt.compareTo(at);
      });
    }

    final current = <double>[];
    final previous = <double>[];

    for (final domain in _domains) {
      final entries = grouped[domain.key] ?? [];
      if (entries.isEmpty) {
        current.add(0);
        previous.add(0);
        continue;
      }

      final latestScore = _toScore(entries.first['score']);
      double previousScore = 0;

      for (final row in entries) {
        final assessedAt = _toDateTime(row['assessedAt']);
        if (assessedAt != null && assessedAt.isBefore(lastMonth)) {
          previousScore = _toScore(row['score']);
          break;
        }
      }

      if (previousScore == 0 && entries.length > 1) {
        previousScore = _toScore(entries[1]['score']);
      }

      current.add(latestScore);
      previous.add(previousScore);
    }

    return _RadarCompare(currentValues: current, previousValues: previous);
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

  DateTime? _toDateTime(dynamic value) {
    if (value == null) return null;
    return DateTime.tryParse(value.toString());
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
        Text(text, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12)),
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
            Icon(Icons.insights_rounded, color: AppTheme.textSecondary.withOpacity(0.45), size: 42),
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

class _RadarCompare {
  final List<double> currentValues;
  final List<double> previousValues;

  const _RadarCompare({required this.currentValues, required this.previousValues});
}

class _DomainMeta {
  final String key;
  final String label;
  final Color color;

  const _DomainMeta({required this.key, required this.label, required this.color});
}
