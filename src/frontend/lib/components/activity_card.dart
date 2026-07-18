import 'package:flutter/material.dart';

import '../utils/app_logger.dart';
import '../services/public_api_service.dart';

final _log = AppLogger('ActivityCard');

/// 亲子活动推荐卡片
///
/// 从 Bored API (bored-api.appbrewery.com 镜像) 拉取儿童友好型活动建议，
/// 展示在家长首页，帮助家长发现适合和孩子一起做的事情。
///
/// 数据结构：{activity, type, participants, price, kidFriendly, ...}
class ActivityCard extends StatefulWidget {
  const ActivityCard({super.key});

  @override
  State<ActivityCard> createState() => _ActivityCardState();
}

class _ActivityCardState extends State<ActivityCard> {
  Map<String, dynamic>? _activity;
  bool _loading = false;
  bool _error = false;
  bool _expanded = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = false;
    });
    try {
      final a = await PublicApiService.instance.getKidFriendlyActivity();
      if (!mounted) return;
      setState(() {
        _activity = a;
        _loading = false;
      });
    } catch (e) {
      _log.warning('load failed: $e');
      if (!mounted) return;
      setState(() {
        _error = true;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 4),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFE8F5E9), Color(0xFFC8E6C9)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.green.withValues(alpha: 0.2),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 标题行
            Row(
              children: [
                const Text('🎲', style: TextStyle(fontSize: 28)),
                const SizedBox(width: 10),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '亲子活动推荐',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF2E7D32),
                        ),
                      ),
                      Text(
                        '今天和孩子做点什么？',
                        style: TextStyle(
                          fontSize: 12,
                          color: Color(0xFF4CAF50),
                        ),
                      ),
                    ],
                  ),
                ),
                // 换一个按钮
                if (!_loading)
                  IconButton(
                    icon: const Icon(Icons.refresh, color: Color(0xFF2E7D32)),
                    onPressed: _load,
                    tooltip: '换一个',
                  ),
              ],
            ),
            const SizedBox(height: 16),
            // 内容
            _buildContent(),
          ],
        ),
      ),
    );
  }

  Widget _buildContent() {
    if (_loading) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.symmetric(vertical: 16),
          child: SizedBox(
            width: 24,
            height: 24,
            child: CircularProgressIndicator(
              color: Color(0xFF4CAF50),
              strokeWidth: 2.5,
            ),
          ),
        ),
      );
    }

    if (_error || _activity == null) {
      return Column(
        children: [
          const Text('🌿', style: TextStyle(fontSize: 36)),
          const SizedBox(height: 8),
          const Text(
            '暂时无法获取活动推荐',
            style: TextStyle(color: Color(0xFF4CAF50)),
          ),
          const SizedBox(height: 12),
          ElevatedButton(
            onPressed: _load,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF4CAF50),
              foregroundColor: Colors.white,
            ),
            child: const Text('重试'),
          ),
        ],
      );
    }

    final activity = _activity!['activity'] as String? ?? '未知活动';
    final type = _activity!['type'] as String? ?? '';
    final participants = _activity!['participants']?.toString() ?? '?';
    final price = (_activity!['price'] as num?)?.toDouble() ?? 0;
    final accessibility = _activity!['accessibility'] as String? ?? '';
    final duration = _activity!['duration'] as String? ?? '';
    final kidFriendly = _activity!['kidFriendly'] == true;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 活动名称
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.7),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Text(
            activity,
            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w600,
              color: Color(0xFF1B5E20),
              height: 1.4,
            ),
          ),
        ),
        const SizedBox(height: 12),
        // 标签行
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            if (type.isNotEmpty) _tag('🎯', _typeLabel(type)),
            _tag('👥', '$participants 人'),
            _tag('💰', _priceLabel(price)),
            if (duration.isNotEmpty) _tag('⏱️', _durationLabel(duration)),
            if (kidFriendly)
              _tag('✅', '儿童友好', highlight: true),
          ],
        ),
        const SizedBox(height: 8),
        // 展开详情
        if (_expanded && accessibility.isNotEmpty) ...[
          const SizedBox(height: 8),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.5),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '📋 难度说明',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF2E7D32),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  accessibility,
                  style: const TextStyle(
                    fontSize: 13,
                    color: Color(0xFF4CAF50),
                  ),
                ),
              ],
            ),
          ),
        ],
        if (accessibility.isNotEmpty)
          GestureDetector(
            onTap: () => setState(() => _expanded = !_expanded),
            child: Container(
              margin: const EdgeInsets.only(top: 8),
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    _expanded ? '收起' : '查看难度',
                    style: const TextStyle(
                      fontSize: 12,
                      color: Color(0xFF4CAF50),
                      decoration: TextDecoration.underline,
                    ),
                  ),
                  Icon(
                    _expanded
                        ? Icons.keyboard_arrow_up_rounded
                        : Icons.keyboard_arrow_down_rounded,
                    size: 16,
                    color: const Color(0xFF4CAF50),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  Widget _tag(String emoji, String text, {bool highlight = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: highlight
            ? const Color(0xFF66BB6A)
            : Colors.white.withValues(alpha: 0.8),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(emoji, style: const TextStyle(fontSize: 14)),
          const SizedBox(width: 4),
          Text(
            text,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: highlight ? Colors.white : const Color(0xFF2E7D32),
            ),
          ),
        ],
      ),
    );
  }

  String _typeLabel(String type) {
    const labels = {
      'education': '学习',
      'recreational': '娱乐',
      'social': '社交',
      'diy': '手工',
      'charity': '公益',
      'cooking': '烹饪',
      'relaxation': '放松',
      'music': '音乐',
      'busywork': '日常',
    };
    return labels[type] ?? type;
  }

  String _priceLabel(double price) {
    if (price == 0) return '免费';
    if (price < 0.3) return '花费低';
    if (price < 0.6) return '花费中';
    return '花费较高';
  }

  String _durationLabel(String d) {
    const labels = {
      'seconds': '几秒',
      'minutes': '几分钟',
      'hours': '几小时',
      'days': '几天',
      'weeks': '几周',
    };
    return labels[d] ?? d;
  }
}
