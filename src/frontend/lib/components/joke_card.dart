import 'package:flutter/material.dart';

import '../utils/app_logger.dart';
import '../services/public_api_service.dart';

final _log = AppLogger('JokeCard');

/// 儿童笑话卡片
///
/// 从 JokeAPI v2 拉取儿童安全笑话（safe-mode），展示在儿童首页。
/// 支持 single（单段）和 twopart（问答式）两种笑话类型。
class JokeCard extends StatefulWidget {
  const JokeCard({super.key});

  @override
  State<JokeCard> createState() => _JokeCardState();
}

class _JokeCardState extends State<JokeCard> {
  Map<String, dynamic>? _joke;
  bool _loading = false;
  bool _error = false;
  bool _showPunchline = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = false;
      _showPunchline = false;
    });
    try {
      final j = await PublicApiService.instance.getJoke();
      if (!mounted) return;
      setState(() {
        _joke = j;
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
          colors: [Color(0xFFFCE4EC), Color(0xFFF8BBD0)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.pink.withValues(alpha: 0.2),
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
                const Text('😄', style: TextStyle(fontSize: 28)),
                const SizedBox(width: 10),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '每日一笑',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFFAD1457),
                        ),
                      ),
                      Text(
                        '笑一笑，心情好！',
                        style: TextStyle(
                          fontSize: 12,
                          color: Color(0xFFD81B60),
                        ),
                      ),
                    ],
                  ),
                ),
                if (!_loading)
                  IconButton(
                    icon: const Icon(Icons.refresh, color: Color(0xFFAD1457)),
                    onPressed: _load,
                    tooltip: '换一个',
                  ),
              ],
            ),
            const SizedBox(height: 16),
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
              color: Color(0xFFD81B60),
              strokeWidth: 2.5,
            ),
          ),
        ),
      );
    }

    if (_error || _joke == null) {
      return Column(
        children: [
          const Text('🎭', style: TextStyle(fontSize: 36)),
          const SizedBox(height: 8),
          const Text(
            '暂时无法获取笑话',
            style: TextStyle(color: Color(0xFFD81B60)),
          ),
          const SizedBox(height: 12),
          ElevatedButton(
            onPressed: _load,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFD81B60),
              foregroundColor: Colors.white,
            ),
            child: const Text('重试'),
          ),
        ],
      );
    }

    final type = _joke!['type'] as String? ?? 'single';
    final category = _joke!['category'] as String? ?? '';

    if (type == 'single') {
      // 单段笑话
      final joke = _joke!['joke'] as String? ?? '';
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (category.isNotEmpty) _categoryTag(category),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.7),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Text(
              joke,
              style: const TextStyle(
                fontSize: 15,
                height: 1.6,
                color: Color(0xFF4A0020),
              ),
            ),
          ),
        ],
      );
    }

    // twopart 笑话：setup + delivery
    final setup = _joke!['setup'] as String? ?? '';
    final delivery = _joke!['delivery'] as String? ?? '';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (category.isNotEmpty) _categoryTag(category),
        // 问题部分
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.7),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Text(
            setup,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              height: 1.6,
              color: Color(0xFF4A0020),
            ),
          ),
        ),
        const SizedBox(height: 12),
        // 答案部分（点击显示）
        if (_showPunchline)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFFFFC107).withValues(alpha: 0.3),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: const Color(0xFFFFC107).withValues(alpha: 0.5),
              ),
            ),
            child: Text(
              delivery,
              style: const TextStyle(
                fontSize: 15,
                height: 1.6,
                fontWeight: FontWeight.bold,
                color: Color(0xFF4A0020),
              ),
            ),
          )
        else
          Center(
            child: ElevatedButton.icon(
              onPressed: () => setState(() => _showPunchline = true),
              icon: const Icon(Icons.lightbulb_outline, size: 18),
              label: const Text('看看答案'),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFFFC107),
                foregroundColor: const Color(0xFF4A0020),
              ),
            ),
          ),
      ],
    );
  }

  Widget _categoryTag(String category) {
    const labels = {
      'Programming': '💻 编程',
      'Misc': '🌟 综合',
      'Pun': '🎪 谐音',
      'Dark': '🌙 暗黑',
      'Christmas': '🎄 圣诞',
      'Spooky': '👻 恐怖',
    };
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.8),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        labels[category] ?? category,
        style: const TextStyle(
          fontSize: 11,
          color: Color(0xFFAD1457),
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
}
