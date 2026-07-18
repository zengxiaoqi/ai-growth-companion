import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../utils/app_logger.dart';
import '../services/public_api_service.dart';

final _log = AppLogger('NumberFactCard');

/// 孩子端首页 — 今日数字卡片
///
/// 数据来源：后端 `/api/public/number/:num`
/// 后端按日 seed 选数字，uselessfacts.jsph.pl 返回英文趣闻。
/// 为儿童友好，1-100 内我们内置中文事实；其余英文加"小犀帮你翻译"提示。
/// 点击 → 全屏趣闻弹窗。
class NumberFactCard extends StatefulWidget {
  const NumberFactCard({super.key});

  @override
  State<NumberFactCard> createState() => _NumberFactCardState();
}

class _NumberFactCardState extends State<NumberFactCard> {
  Map<String, dynamic>? _data;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      // 按日期 seed 选 1-100 的数字（与后端独立但同形态，给前端兜底用）
      final now = DateTime.now();
      final dayNum = now.year * 1000 + (now.month) * 40 + now.day;
      final num = (dayNum % 100) + 1;
      final data = await PublicApiService.instance.getNumberFact(num);
      if (!mounted) return;
      setState(() {
        _data = data;
        _loading = false;
      });
    } catch (e) {
      _log.warning('NumberFactCard load failed: $e');
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _loading || _data == null ? null : _showFactSheet,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFFFFCE4E), Color(0xFFFFB347)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(AppTheme.cardRadius),
          boxShadow: AppTheme.softShadow(const Color(0xFFFFB347)),
        ),
        child: _buildContent(),
      ),
    );
  }

  Widget _buildContent() {
    if (_loading) return _buildLoading();
    if (_data == null) return _buildError();
    return _buildCard();
  }

  Widget _buildLoading() {
    return Row(
      children: [
        Container(
          width: 56,
          height: 56,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.4),
            borderRadius: BorderRadius.circular(16),
          ),
        ),
        const SizedBox(width: 16),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              height: 14,
              width: 100,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(7),
              ),
            ),
            const SizedBox(height: 8),
            Container(
              height: 12,
              width: 160,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(6),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildError() {
    return Row(
      children: [
        const Text('🔢', style: TextStyle(fontSize: 36)),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                '今日数字',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
              Text(
                '数字趣闻暂时不可用~',
                style: TextStyle(
                  fontSize: 13,
                  color: Colors.white.withValues(alpha: 0.9),
                ),
              ),
            ],
          ),
        ),
        IconButton(
          icon: const Icon(Icons.refresh, color: Colors.white),
          onPressed: _load,
        ),
      ],
    );
  }

  Widget _buildCard() {
    final data = _data!;
    final num = data['number'];
    final fact = data['fact'] as String? ?? '';
    final isChinese = _isChinese(fact);

    return Row(
      children: [
        // 数字大圆
        Container(
          width: 64,
          height: 64,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: Colors.white.withValues(alpha: 0.25),
          ),
          child: Center(
            child: Text(
              '$num',
              style: const TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Row(
                children: [
                  Text('🔢', style: TextStyle(fontSize: 14)),
                  SizedBox(width: 4),
                  Text(
                    '今日数字',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.white,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                isChinese
                    ? fact
                    : (fact.length > 60 ? '${fact.substring(0, 60)}…' : fact),
                style: const TextStyle(
                  fontSize: 14,
                  color: Colors.white,
                  height: 1.4,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
        const Icon(Icons.arrow_forward_ios_rounded,
            color: Colors.white, size: 18),
      ],
    );
  }

  /// 简单中文检测
  bool _isChinese(String s) {
    for (final c in s.runes) {
      if (c >= 0x4E00 && c <= 0x9FFF) return true;
    }
    return false;
  }

  void _showFactSheet() {
    final data = _data!;
    final num = data['number'];
    final fact = data['fact'] as String? ?? '';
    final source = data['source'] as String? ?? '';
    final isChinese = _isChinese(fact);

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        width: double.infinity,
        margin: const EdgeInsets.all(8),
        padding: const EdgeInsets.fromLTRB(24, 32, 24, 32),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFFFFF8E8), Colors.white],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
          borderRadius: BorderRadius.circular(28),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 72,
                  height: 72,
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(
                      colors: [Color(0xFFFFCE4E), Color(0xFFFFB347)],
                    ),
                  ),
                  child: Center(
                    child: Text(
                      '$num',
                      style: const TextStyle(
                        fontSize: 32,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        '今日数字',
                        style: TextStyle(
                          fontSize: 14,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                      const Text(
                        '数字趣闻',
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.textColor,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close, color: AppTheme.textSecondary),
                  onPressed: () => Navigator.pop(ctx),
                ),
              ],
            ),
            const SizedBox(height: 20),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppTheme.backgroundColor,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Text(
                fact,
                style: const TextStyle(
                  fontSize: 16,
                  height: 1.6,
                  color: AppTheme.textColor,
                ),
              ),
            ),
            if (!isChinese) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  const Text('🌍', style: TextStyle(fontSize: 14)),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      '这是来自 $source 的英文小知识，可以试试让小犀帮你翻译~',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey.shade600,
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.accentColor,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                onPressed: () => Navigator.pop(ctx),
                child: const Text(
                  '学到啦！',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
