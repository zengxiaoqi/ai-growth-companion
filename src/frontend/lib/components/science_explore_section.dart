import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../utils/app_logger.dart';
import '../services/public_api_service.dart';

final _log = AppLogger('ScienceExploreSection');

/// 学习中心 — 科学探索单元
///
/// 一个独立、自加载的小卡片网格，聚合 4 个公共 API 数据源：
///   - ISS 实时位置（lat/lng/altitude/velocity）
///   - 最近 24h 地震（USGS GeoJSON，按震级降序前 5）
///   - 水果百科（Fruityvice，随机 6 个）
///   - 日出日落（与 child_home 天气卡片共用源，这里展示孩子所在城市）
///
/// 每个子卡片点击 → 全屏详情 sheet。
/// 整个区块失败时降级为"现在数据暂时不可用"占位，不报错。
class ScienceExploreSection extends StatefulWidget {
  const ScienceExploreSection({super.key});

  @override
  State<ScienceExploreSection> createState() => _ScienceExploreSectionState();
}

class _ScienceExploreSectionState extends State<ScienceExploreSection> {
  // 数据状态
  Map<String, dynamic>? _issData;
  List<Map<String, dynamic>> _earthquakes = [];
  List<Map<String, dynamic>> _fruits = [];
  bool _loadingIss = true;
  bool _loadingEq = true;
  bool _loadingFruits = true;

  @override
  void initState() {
    super.initState();
    _loadAll();
  }

  Future<void> _loadAll() async {
    await Future.wait([
      _loadIss(),
      _loadEarthquakes(),
      _loadFruits(),
    ]);
  }

  Future<void> _loadIss() async {
    try {
      final data = await PublicApiService.instance.getIssPosition();
      if (!mounted) return;
      setState(() {
        _issData = data;
        _loadingIss = false;
      });
    } catch (e) {
      _log.warning('ISS load failed: $e');
      if (!mounted) return;
      setState(() => _loadingIss = false);
    }
  }

  Future<void> _loadEarthquakes() async {
    try {
      final data = await PublicApiService.instance.getEarthquakes();
      if (!mounted) return;
      final features = (data?['features'] as List?) ?? [];
      // 解析 + 按震级降序
      final parsed = features.map((f) {
        final props = (f as Map)['properties'] as Map? ?? const {};
        return <String, dynamic>{
          'mag': props['magnitude'] ?? props['mag'] ?? 0,
          'place': props['place'] ?? '未知位置',
          'time': props['time'],
          'url': props['url'] ?? props['detail'],
        };
      }).toList();
      parsed.sort((a, b) {
        final am = (a['mag'] as num?)?.toDouble() ?? 0;
        final bm = (b['mag'] as num?)?.toDouble() ?? 0;
        return bm.compareTo(am);
      });
      setState(() {
        _earthquakes = parsed.take(5).toList();
        _loadingEq = false;
      });
    } catch (e) {
      _log.warning('Earthquakes load failed: $e');
      if (!mounted) return;
      setState(() => _loadingEq = false);
    }
  }

  Future<void> _loadFruits() async {
    try {
      final data = await PublicApiService.instance.getFruits();
      if (!mounted) return;
      // 打乱并取 6 个
      final list = (data ?? []).cast<Map<String, dynamic>>().toList();
      list.shuffle();
      setState(() {
        _fruits = list.take(6).toList();
        _loadingFruits = false;
      });
    } catch (e) {
      _log.warning('Fruits load failed: $e');
      if (!mounted) return;
      setState(() => _loadingFruits = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Text('🔭', style: TextStyle(fontSize: 22)),
              SizedBox(width: 8),
              Text(
                '科学探索',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.textColor,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            '看看世界正在发生什么',
            style: TextStyle(
              fontSize: 13,
              color: AppTheme.textSecondary,
            ),
          ),
          const SizedBox(height: 16),
          // ISS 卡
          _buildIssCard(context),
          const SizedBox(height: 12),
          // 地震卡
          _buildEarthquakeCard(context),
          const SizedBox(height: 12),
          // 水果百科网格
          _buildFruitsGrid(context),
        ],
      ),
    );
  }

  // ============== ISS ==============
  Widget _buildIssCard(BuildContext context) {
    return GestureDetector(
      onTap: _loadingIss || _issData == null
          ? null
          : () => _showIssDetail(context),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF4A4E69), Color(0xFF22223B)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF4A4E69).withValues(alpha: 0.3),
              blurRadius: 16,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: _loadingIss ? _buildInlineLoading() : _buildIssContent(),
      ),
    );
  }

  Widget _buildIssContent() {
    if (_issData == null) {
      return Row(
        children: [
          const Text('🛰️', style: TextStyle(fontSize: 28)),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              '空间站数据暂时不可用',
              style: TextStyle(
                fontSize: 13,
                color: Colors.white.withValues(alpha: 0.7),
              ),
            ),
          ),
          IconButton(
            icon: Icon(Icons.refresh, color: Colors.white.withValues(alpha: 0.7)),
            onPressed: _loadIss,
          ),
        ],
      );
    }
    final lat = _numFmt(_issData!['latitude']);
    final lng = _numFmt(_issData!['longitude']);
    final alt = _numFmt(_issData!['altitude_km']);
    final vel = _numFmt(_issData!['velocity_kmh']);
    return Row(
      children: [
        const Text('🛰️', style: TextStyle(fontSize: 32)),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                '国际空间站现在在哪里？',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 6),
              Wrap(
                spacing: 10,
                runSpacing: 4,
                children: [
                  _miniChip('纬度', lat),
                  _miniChip('经度', lng),
                  _miniChip('高度', '$alt km'),
                  _miniChip('速度', '$vel km/h'),
                ],
              ),
            ],
          ),
        ),
        const Icon(Icons.arrow_forward_ios_rounded,
            color: Colors.white70, size: 16),
      ],
    );
  }

  Widget _miniChip(String label, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        '$label: $value',
        style: const TextStyle(fontSize: 11, color: Colors.white),
      ),
    );
  }

  void _showIssDetail(BuildContext context) {
    final data = _issData!;
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        margin: const EdgeInsets.all(8),
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF22223B), Color(0xFF4A4E69)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
          borderRadius: BorderRadius.circular(28),
        ),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Text('🛰️', style: TextStyle(fontSize: 40)),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Text(
                      '国际空间站',
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, color: Colors.white70),
                    onPressed: () => Navigator.pop(ctx),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              _issInfoRow('纬度', _numFmt(data['latitude'])),
              _issInfoRow('经度', _numFmt(data['longitude'])),
              _issInfoRow('高度', '${_numFmt(data['altitude_km'])} km'),
              _issInfoRow('速度', '${_numFmt(data['velocity_kmh'])} km/h'),
              _issInfoRow('可见性', (data['visibility'] as String?) ?? '未知'),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('💡', style: TextStyle(fontSize: 18)),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        '国际空间站每 90 分钟绕地球一圈，'
                        '每天可以看到 16 次日出和日落！'
                        '它飞得很快，比子弹还快 20 倍。',
                        style: TextStyle(
                          fontSize: 14,
                          color: Colors.white,
                          height: 1.5,
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

  Widget _issInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          SizedBox(
            width: 80,
            child: Text(
              label,
              style: TextStyle(
                fontSize: 14,
                color: Colors.white.withValues(alpha: 0.7),
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 16,
                color: Colors.white,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ============== 地震 ==============
  Widget _buildEarthquakeCard(BuildContext context) {
    return GestureDetector(
      onTap: _loadingEq || _earthquakes.isEmpty
          ? null
          : () => _showEarthquakeDetail(context),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFFE07A5F), Color(0xFFD88C77)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(20),
          boxShadow: AppTheme.softShadow(const Color(0xFFE07A5F)),
        ),
        child: _loadingEq ? _buildInlineLoading() : _buildEqContent(),
      ),
    );
  }

  Widget _buildEqContent() {
    if (_earthquakes.isEmpty) {
      return Row(
        children: [
          const Text('🌎', style: TextStyle(fontSize: 28)),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              '最近没有显著地震',
              style: TextStyle(
                fontSize: 13,
                color: Colors.white.withValues(alpha: 0.9),
              ),
            ),
          ),
          IconButton(
            icon: Icon(Icons.refresh, color: Colors.white.withValues(alpha: 0.9)),
            onPressed: _loadEarthquakes,
          ),
        ],
      );
    }
    final top = _earthquakes.first;
    return Row(
      children: [
        const Text('🌎', style: TextStyle(fontSize: 32)),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                '最近地震',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '最大 ${_numFmt(top['mag'])} 级 — ${top['place']}',
                style: const TextStyle(
                  fontSize: 13,
                  color: Colors.white,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
        const Icon(Icons.arrow_forward_ios_rounded,
            color: Colors.white70, size: 16),
      ],
    );
  }

  void _showEarthquakeDetail(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        margin: const EdgeInsets.all(8),
        padding: const EdgeInsets.all(24),
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
              Row(
                children: [
                  const Text('🌎', style: TextStyle(fontSize: 36)),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Text(
                      '最近 24 小时地震',
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.textColor,
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close,
                        color: AppTheme.textSecondary),
                    onPressed: () => Navigator.pop(ctx),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                '展示震级 ≥ 2.5 的地震（共 ${_earthquakes.length} 条），'
                '按震级从大到小排序。',
                style: TextStyle(
                  fontSize: 12,
                  color: AppTheme.textSecondary,
                ),
              ),
              const SizedBox(height: 16),
              ..._earthquakes.map((e) => _earthquakeRow(e)),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppTheme.backgroundColor,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('💡', style: TextStyle(fontSize: 18)),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        '震级每增加 1 级，能量大约增加 32 倍。'
                        '地球每年大约发生 50 万次可测地震，但绝大多数都很小。',
                        style: TextStyle(
                          fontSize: 14,
                          color: AppTheme.textColor,
                          height: 1.5,
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

  Widget _earthquakeRow(Map<String, dynamic> e) {
    final mag = _numFmt(e['mag']);
    final place = e['place'] ?? '未知';
    final color = _magColor(double.tryParse(mag) ?? 0);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              mag,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              place,
              style: const TextStyle(
                fontSize: 14,
                color: AppTheme.textColor,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  Color _magColor(double m) {
    if (m >= 6) return const Color(0xFFD32F2F);
    if (m >= 5) return const Color(0xFFFF9800);
    if (m >= 4) return const Color(0xFFFFC107);
    return const Color(0xFF8BC34A);
  }

  // ============== 水果百科 ==============
  Widget _buildFruitsGrid(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: AppTheme.softShadow(const Color(0xFF7ED957)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('🍎', style: TextStyle(fontSize: 22)),
              const SizedBox(width: 8),
              const Text(
                '水果百科',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.textColor,
                ),
              ),
              const Spacer(),
              if (!_loadingFruits)
                IconButton(
                  icon: const Icon(Icons.refresh,
                      color: AppTheme.textSecondary, size: 18),
                  onPressed: () {
                    setState(() => _loadingFruits = true);
                    _loadFruits();
                  },
                ),
            ],
          ),
          const SizedBox(height: 12),
          if (_loadingFruits)
            _buildInlineLoading()
          else if (_fruits.isEmpty)
            Text(
              '水果数据暂时不可用',
              style: TextStyle(
                fontSize: 13,
                color: AppTheme.textSecondary,
              ),
            )
          else
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                childAspectRatio: 1.0,
              ),
              itemCount: _fruits.length,
              itemBuilder: (ctx, i) =>
                  _FruitTile(fruit: _fruits[i], onTap: () => _showFruitDetail(ctx, _fruits[i])),
            ),
        ],
      ),
    );
  }

  void _showFruitDetail(BuildContext context, Map<String, dynamic> fruit) {
    final name = fruit['name'] ?? '未知';
    final family = fruit['family'] ?? '未知';
    final genus = fruit['genus'] ?? '未知';
    final carbs = (fruit['nutritions'] as Map?)?['carbohydrates'];
    final protein = (fruit['nutritions'] as Map?)?['protein'];
    final calories = (fruit['nutritions'] as Map?)?['calories'];
    final sugar = (fruit['nutritions'] as Map?)?['sugar'];

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        margin: const EdgeInsets.all(8),
        padding: const EdgeInsets.all(24),
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
                Text(_fruitEmoji(name), style: const TextStyle(fontSize: 36)),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    name,
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textColor,
                    ),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close,
                      color: AppTheme.textSecondary),
                  onPressed: () => Navigator.pop(ctx),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _fruitInfoRow('科', '$family'),
            _fruitInfoRow('属', '$genus'),
            if (calories != null) _fruitInfoRow('热量', '$calories kcal/100g'),
            if (carbs != null) _fruitInfoRow('碳水', '${_numFmt(carbs)} g/100g'),
            if (protein != null) _fruitInfoRow('蛋白质', '${_numFmt(protein)} g/100g'),
            if (sugar != null) _fruitInfoRow('糖', '${_numFmt(sugar)} g/100g'),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppTheme.backgroundColor,
                borderRadius: BorderRadius.circular(14),
              ),
              child: const Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('💡', style: TextStyle(fontSize: 18)),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '水果含丰富的维生素和纤维，'
                      '每天吃 200-350 克水果对身体很好。'
                      '但也别吃太多糖分高的水果哦！',
                      style: TextStyle(
                        fontSize: 14,
                        color: AppTheme.textColor,
                        height: 1.5,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
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
                child: const Text('我知道啦',
                    style: TextStyle(fontWeight: FontWeight.bold)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _fruitInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(
            width: 80,
            child: Text(
              label,
              style: TextStyle(
                fontSize: 13,
                color: AppTheme.textSecondary,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 14,
                color: AppTheme.textColor,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _fruitEmoji(String name) {
    final n = name.toLowerCase();
    final map = {
      'apple': '🍎', 'banana': '🍌', 'orange': '🍊', 'pear': '🍐',
      'strawberry': '🍓', 'blueberry': '🫐', 'grape': '🍇',
      'watermelon': '🍉', 'lemon': '🍋', 'peach': '🍑',
      'cherry': '🍒', 'pineapple': '🍍', 'mango': '🥭',
      'kiwi': '🥝', 'tomato': '🍅', 'persimmon': '🍅',
    };
    for (final key in map.keys) {
      if (n.contains(key)) return map[key]!;
    }
    return '🍎';
  }

  // ============== 通用 ==============
  Widget _buildInlineLoading() {
    return Row(
      children: [
        const SizedBox(
          width: 22,
          height: 22,
          child: CircularProgressIndicator(
            color: Colors.white70,
            strokeWidth: 2.5,
          ),
        ),
        const SizedBox(width: 12),
        Text(
          '加载中...',
          style: TextStyle(
            fontSize: 13,
            color: Colors.white.withValues(alpha: 0.8),
          ),
        ),
      ],
    );
  }

  String _numFmt(dynamic v) {
    if (v == null) return '-';
    if (v is num) {
      if (v.abs() >= 1000) return v.toStringAsFixed(0);
      if (v.abs() >= 100) return v.toStringAsFixed(1);
      return v.toStringAsFixed(2);
    }
    return '$v';
  }
}

// ============== 水果 tile ==============
class _FruitTile extends StatelessWidget {
  final Map<String, dynamic> fruit;
  final VoidCallback onTap;

  const _FruitTile({required this.fruit, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final name = fruit['name'] ?? '未知';
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
        decoration: BoxDecoration(
          color: AppTheme.softMint.withValues(alpha: 0.3),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              _fruitEmoji(name),
              style: const TextStyle(fontSize: 28),
            ),
            const SizedBox(height: 4),
            Text(
              name,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppTheme.textColor,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }

  String _fruitEmoji(String name) {
    final n = name.toLowerCase();
    final map = {
      'apple': '🍎', 'banana': '🍌', 'orange': '🍊', 'pear': '🍐',
      'strawberry': '🍓', 'blueberry': '🫐', 'grape': '🍇',
      'watermelon': '🍉', 'lemon': '🍋', 'peach': '🍑',
      'cherry': '🍒', 'pineapple': '🍍', 'mango': '🥭',
      'kiwi': '🥝', 'tomato': '🍅', 'persimmon': '🍅',
    };
    for (final key in map.keys) {
      if (n.contains(key)) return map[key]!;
    }
    return '🍎';
  }
}
