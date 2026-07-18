import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../utils/app_logger.dart';
import '../services/public_api_service.dart';

final _log = AppLogger('CountryCard');

/// 孩子端首页 — 每日一国卡片
///
/// 数据来源：后端 `/api/public/country/daily`
/// 后端按日期 seed 返回一个国家（30 国数据包，REST Countries v3.1 shape）。
/// 展示：国旗 + 国名 + 首都 + 语言 + 人口 + 在地图上的位置
/// 点击 → 全屏详情页（[CountryDetailSheet]）。
class CountryCard extends StatefulWidget {
  const CountryCard({super.key});

  @override
  State<CountryCard> createState() => _CountryCardState();
}

class _CountryCardState extends State<CountryCard> {
  Map<String, dynamic>? _data;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await PublicApiService.instance.getDailyCountry();
      if (!mounted) return;
      setState(() {
        _data = data;
        _loading = false;
      });
    } catch (e) {
      _log.warning('CountryCard load failed: $e');
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _loading || _data == null ? null : () => _showDetail(context),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF8FD8B5), Color(0xFF6BC89A)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(AppTheme.cardRadius),
          boxShadow: AppTheme.softShadow(const Color(0xFF6BC89A)),
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

  // ---------- 加载态 ----------
  Widget _buildLoading() {
    return Row(
      children: [
        Container(
          width: 56,
          height: 38,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.4),
            borderRadius: BorderRadius.circular(8),
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
              width: 140,
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

  // ---------- 错误态 ----------
  Widget _buildError() {
    return Row(
      children: [
        const Text('🌍', style: TextStyle(fontSize: 36)),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                '每日一国',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
              Text(
                '现在看不到国家，等一会儿再来看看吧~',
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

  // ---------- 数据态 ----------
  Widget _buildCard() {
    final data = _data!;
    final name = (data['name'] as Map?)?['common'] ?? '未知';
    final flagUrl = (data['flags'] as Map?)?['png'] as String?;
    final capital = (data['capital'] as List?)?.firstOrNull ?? '未知';
    final languages =
        ((data['languages'] as Map?)?.values.toList())?.join('、') ?? '未知';
    final population = data['population'];
    final region = data['region'] ?? '未知';

    return Row(
      children: [
        // 国旗（flagcdn.com 320 png）
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: flagUrl != null
              ? Image.network(
                  flagUrl,
                  width: 56,
                  height: 38,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(
                    width: 56,
                    height: 38,
                    color: Colors.white.withValues(alpha: 0.3),
                    child: const Icon(Icons.flag, color: Colors.white, size: 20),
                  ),
                )
              : Container(
                  width: 56,
                  height: 38,
                  color: Colors.white.withValues(alpha: 0.3),
                  child: const Icon(Icons.flag, color: Colors.white, size: 20),
                ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Row(
                children: [
                  Text('🌍', style: TextStyle(fontSize: 14)),
                  SizedBox(width: 4),
                  Text(
                    '每日一国',
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
                name,
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 4),
              Wrap(
                spacing: 8,
                runSpacing: 2,
                children: [
                  _chip('🏛️ 首都: $capital'),
                  _chip('🗣️ $languages'),
                  if (population is int)
                    _chip('👥 ${_formatPopulation(population)}'),
                  _chip('📍 $region'),
                ],
              ),
            ],
          ),
        ),
        const Icon(Icons.arrow_forward_ios_rounded,
            color: Colors.white, size: 18),
      ],
    );
  }

  Widget _chip(String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.25),
        borderRadius: BorderRadius.circular(AppTheme.buttonRadius),
      ),
      child: Text(
        text,
        style: const TextStyle(fontSize: 11, color: Colors.white),
      ),
    );
  }

  String _formatPopulation(int p) {
    if (p >= 100000000) {
      return '${(p / 100000000).toStringAsFixed(1)} 亿人';
    } else if (p >= 10000) {
      return '${(p / 10000).toStringAsFixed(0)} 万人';
    }
    return '$p 人';
  }

  // ---------- 详情弹窗 ----------
  void _showDetail(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => _CountryDetailSheet(data: _data!),
    );
  }
}

// ============================================================
//  国家详情 Sheet
// ============================================================
class _CountryDetailSheet extends StatelessWidget {
  final Map<String, dynamic> data;

  const _CountryDetailSheet({required this.data});

  @override
  Widget build(BuildContext context) {
    final name = (data['name'] as Map?)?['common'] ?? '未知';
    final official = (data['name'] as Map?)?['official'];
    final flagUrl = (data['flags'] as Map?)?['png'] as String?;
    final flagAlt = (data['flags'] as Map?)?['alt'] as String? ?? name;
    final capital = (data['capital'] as List?)?.firstOrNull ?? '未知';
    final languages =
        ((data['languages'] as Map?)?.values.toList())?.join('、') ?? '未知';
    final population = data['population'];
    final region = data['region'] ?? '未知';
    final mapsUrl = (data['maps'] as Map?)?['googleMaps'] as String?;

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.all(8),
      padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFFFF8E8), Colors.white],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
        borderRadius: BorderRadius.circular(28),
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 顶部：国旗 + 国名 + 关闭按钮
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: flagUrl != null
                      ? Image.network(
                          flagUrl,
                          width: 100,
                          height: 68,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => Container(
                            width: 100,
                            height: 68,
                            color: AppTheme.softMint,
                            child: const Icon(Icons.flag, size: 32),
                          ),
                        )
                      : Container(
                          width: 100,
                          height: 68,
                          color: AppTheme.softMint,
                          child: const Icon(Icons.flag, size: 32),
                        ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        style: const TextStyle(
                          fontSize: 26,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.textColor,
                        ),
                      ),
                      if (official != null && official != name)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text(
                            official,
                            style: const TextStyle(
                              fontSize: 13,
                              color: AppTheme.textSecondary,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close, color: AppTheme.textSecondary),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (flagAlt != name)
              Padding(
                padding: const EdgeInsets.only(left: 4),
                child: Text(
                  flagAlt,
                  style: TextStyle(
                    fontSize: 11,
                    color: Colors.grey.shade500,
                    fontStyle: FontStyle.italic,
                  ),
                ),
              ),
            const SizedBox(height: 20),
            _detailRow('🏛️', '首都', '$capital'),
            _detailRow('🗣️', '语言', languages),
            if (population is int)
              _detailRow('👥', '人口', _formatPopulation(population)),
            _detailRow('📍', '所在地区', '$region'),
            const SizedBox(height: 16),
            if (mapsUrl != null)
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.secondaryColor,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  icon: const Icon(Icons.map_rounded),
                  label: const Text(
                    '在地图上看位置',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                  ),
                  onPressed: () {
                    // 通过 url_launcher 之外的轻量方式：复制到剪贴板
                    // 实际项目可接 url_launcher（已有依赖时直接用）
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text('地图链接：$mapsUrl'),
                        behavior: SnackBarBehavior.floating,
                      ),
                    );
                  },
                ),
              ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('关闭',
                    style: TextStyle(color: AppTheme.textSecondary)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _detailRow(String emoji, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Text(emoji, style: const TextStyle(fontSize: 22)),
          const SizedBox(width: 12),
          Text(
            '$label：',
            style: const TextStyle(
              fontSize: 15,
              color: AppTheme.textSecondary,
              fontWeight: FontWeight.w500,
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 15,
                color: AppTheme.textColor,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _formatPopulation(int p) {
    if (p >= 100000000) {
      return '${(p / 100000000).toStringAsFixed(2)} 亿人';
    } else if (p >= 10000) {
      return '${(p / 10000).toStringAsFixed(0)} 万人';
    }
    return '$p 人';
  }
}
