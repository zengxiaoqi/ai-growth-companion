import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/user_provider.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import 'child_selector.dart';

/// 家长端 AI 洞察面板
/// 功能：
/// 1. 展示 AI 洞察（从成长报告 API 获取）
/// 2. 主洞察（大字显示）+ 次要洞察（列表）
/// 3. 美观的卡片设计，带装饰背景
/// 4. "调整学习计划"按钮
/// 5. 空状态处理
class AIInsightsPanel extends StatefulWidget {
  final VoidCallback? onAdjustPlan;

  const AIInsightsPanel({super.key, this.onAdjustPlan});

  @override
  State<AIInsightsPanel> createState() => _AIInsightsPanelState();
}

class _AIInsightsPanelState extends State<AIInsightsPanel> {
  // 数据状态
  bool _isLoadingChildren = true;
  bool _isLoadingInsights = false;
  List<Map<String, dynamic>> _children = [];
  int? _selectedChildId;
  List<String> _insights = [];

  @override
  void initState() {
    super.initState();
    _loadChildren();
  }

  // ========== 数据加载 ==========

  /// 加载孩子列表
  Future<void> _loadChildren() async {
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
      await _loadInsights();
    }
  }

  /// 加载 AI 洞察
  Future<void> _loadInsights() async {
    final childId = _selectedChildId;
    if (childId == null) return;

    setState(() {
      _isLoadingInsights = true;
    });

    final api = context.read<ApiService>();
    final report = await api.getGrowthReport(userId: childId, period: 'weekly');

    if (!mounted) return;

    List<String> insightsList = [];

    if (report != null && !report.containsKey('error')) {
      // 从报告的 insights 字段获取
      final insightsField = report['insights'];
      if (insightsField is List) {
        insightsList = insightsField.map((e) => e?.toString() ?? '').where((s) => s.isNotEmpty).toList();
      }
    }

    // 如果没有洞察数据，使用默认提示
    if (insightsList.isEmpty) {
      insightsList = _getDefaultInsights();
    }

    setState(() {
      _insights = insightsList;
      _isLoadingInsights = false;
    });
  }

  /// 获取默认洞察（当 API 无数据时）
  List<String> _getDefaultInsights() {
    // 查找当前选中孩子的名字
    final childName = _findChildName(_selectedChildId);
    return [
      '$childName本周保持了稳定的学习节奏。',
      '持续陪伴学习并及时复盘，可以更快看到能力提升趋势。',
    ];
  }

  /// 查找孩子名字
  String _findChildName(int? childId) {
    if (childId == null) return '孩子';
    for (final child in _children) {
      if (_toInt(child['id']) == childId) {
        return child['name']?.toString() ?? '孩子';
      }
    }
    return '孩子';
  }

  /// 切换孩子
  void _onChildChanged(Map<String, dynamic> child) {
    final nextId = _toInt(child['id']);
    if (nextId == null || nextId == _selectedChildId) return;

    setState(() {
      _selectedChildId = nextId;
      _insights = [];
    });

    _loadInsights();
  }

  /// 调整学习计划
  void _handleAdjustPlan() {
    if (widget.onAdjustPlan != null) {
      widget.onAdjustPlan!();
    } else {
      // 默认弹窗提示
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('调整学习计划功能开发中...')),
      );
    }
  }

  // ========== UI 构建 ==========

  @override
  Widget build(BuildContext context) {
    if (_isLoadingChildren) {
      return const Center(child: CircularProgressIndicator(color: AppTheme.primaryColor));
    }

    if (_children.isEmpty) {
      return const _EmptyState(
        title: '暂无孩子账号',
        description: '请先在家长端关联孩子，之后可查看 AI 洞察。',
      );
    }

    return Column(
      children: [
        // 孩子选择器（仅在独立使用时显示）
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: ChildSelector(
            children: _children,
            selectedChildId: _selectedChildId,
            onChildChanged: _onChildChanged,
            mode: ChildSelectorMode.bottomSheet,
            title: '查看孩子',
          ),
        ),
        // 洞察卡片
        Expanded(
          child: _isLoadingInsights
              ? const Center(child: CircularProgressIndicator(color: AppTheme.primaryColor))
              : _buildInsightsCard(),
        ),
      ],
    );
  }

  /// 洞察卡片
  Widget _buildInsightsCard() {
    // 取第一条作为主洞察，其余为次要洞察
    final primaryInsight = _insights.isNotEmpty ? _insights.first : '';
    final extraInsights = _insights.length > 1 ? _insights.sublist(1, _insights.length.clamp(1, 3)) : <String>[];

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      child: Card(
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(24),
            gradient: LinearGradient(
              colors: [
                Colors.white,
                AppTheme.secondaryColor.withOpacity(0.08),
              ],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
          child: Stack(
            children: [
              // 装饰背景 - 模糊光晕
              Positioned(
                right: -30,
                top: -30,
                child: Container(
                  width: 120,
                  height: 120,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(
                      colors: [
                        AppTheme.secondaryColor.withOpacity(0.25),
                        AppTheme.secondaryColor.withOpacity(0),
                      ],
                    ),
                  ),
                ),
              ),
              Positioned(
                right: 20,
                bottom: 40,
                child: Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(
                      colors: [
                        AppTheme.accentColor.withOpacity(0.15),
                        AppTheme.accentColor.withOpacity(0),
                      ],
                    ),
                  ),
                ),
              ),
              // 主内容
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 22, 20, 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // AI 洞察标签
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: AppTheme.secondaryColor.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(
                            Icons.auto_awesome_rounded,
                            size: 14,
                            color: AppTheme.secondaryColor,
                          ),
                          const SizedBox(width: 6),
                          const Text(
                            'AI 洞察',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                              color: AppTheme.secondaryColor,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    // 主洞察（大字）
                    Text(
                      primaryInsight.isNotEmpty ? primaryInsight : '本周保持了稳定的学习节奏。',
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                        height: 1.35,
                        color: AppTheme.textColor,
                      ),
                    ),
                    const SizedBox(height: 12),
                    // 次要洞察（列表）
                    if (extraInsights.isNotEmpty)
                      ...extraInsights.asMap().entries.map((entry) {
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Container(
                                margin: const EdgeInsets.only(top: 6),
                                width: 5,
                                height: 5,
                                decoration: BoxDecoration(
                                  color: AppTheme.textSecondary.withOpacity(0.5),
                                  shape: BoxShape.circle,
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  entry.value,
                                  style: const TextStyle(
                                    fontSize: 14,
                                    height: 1.5,
                                    color: AppTheme.textSecondary,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        );
                      })
                    else
                      Text(
                        '持续陪伴学习并及时复盘，可以更快看到能力提升趋势。',
                        style: TextStyle(
                          fontSize: 14,
                          height: 1.5,
                          color: AppTheme.textSecondary.withOpacity(0.8),
                        ),
                      ),
                    const SizedBox(height: 20),
                    // 调整学习计划按钮
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: ElevatedButton.icon(
                        onPressed: _handleAdjustPlan,
                        icon: const Icon(Icons.tune_rounded, size: 20),
                        label: const Text('调整学习计划'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.secondaryColor,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                          textStyle: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.bold,
                          ),
                          elevation: 0,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ========== 工具方法 ==========

  int? get _currentParentId {
    final user = context.read<UserProvider>().currentUser;
    return _toInt(user?['id']);
  }

  int? _toInt(dynamic value) {
    if (value is int) return value;
    return int.tryParse(value?.toString() ?? '');
  }
}

/// 空状态组件（独立使用时的展示）
class _EmptyState extends StatelessWidget {
  final String title;
  final String description;

  const _EmptyState({
    required this.title,
    required this.description,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.lightbulb_outline_rounded,
              color: AppTheme.textSecondary.withOpacity(0.4),
              size: 48,
            ),
            const SizedBox(height: 12),
            Text(
              title,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: AppTheme.textColor,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              description,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 13,
                color: AppTheme.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
