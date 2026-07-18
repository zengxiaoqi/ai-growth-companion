import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../theme/app_theme.dart';
import '../utils/app_logger.dart';
import '../utils/wmo_weather_codes.dart';
import '../services/public_api_service.dart';
import '../services/storage_service.dart';

final _log = AppLogger('WeatherCard');

/// 孩子端首页 — 天气知识卡片
///
/// 数据来源：后端 `/api/public/weather/by-city?city=...`
/// 后端内部调用 Open-Meteo，返回 Open-Meteo 原生结构 + city/lat/lng 包装层。
/// 展示：
///   - 城市 + 温度 + 湿度 + 风速
///   - WMO weather_code → emoji + 儿童友好中文短语
///   - 今日日出 / 日落（来自 daily.sunrise/sunset）
///   - 点击 → "你知道吗？" 科普弹窗（来自 WmoWeatherInfo.fact）
///
/// 离线降级：失败时展示占位文案，不报错（儿童应用不允许崩溃）。
class WeatherCard extends StatefulWidget {
  const WeatherCard({super.key});

  @override
  State<WeatherCard> createState() => _WeatherCardState();
}

class _WeatherCardState extends State<WeatherCard> {
  Map<String, dynamic>? _data;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final city = context.read<StorageService>().getWeatherCity();
    try {
      final data = await PublicApiService.instance.getWeatherByCity(city);
      if (!mounted) return;
      setState(() {
        _data = data;
        _loading = false;
      });
    } catch (e) {
      _log.warning('WeatherCard load failed: $e');
      if (!mounted) return;
      setState(() {
        _error = '天气数据暂时不可用';
        _loading = false;
      });
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
            // 天空蓝渐变
            colors: [Color(0xFF7EC8E3), Color(0xFFB8E0F5)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(AppTheme.cardRadius),
          boxShadow: AppTheme.softShadow(const Color(0xFF7EC8E3)),
        ),
        child: _buildContent(),
      ),
    );
  }

  Widget _buildContent() {
    if (_loading) {
      return _buildLoading();
    }
    if (_data == null) {
      return _buildError();
    }
    return _buildWeather();
  }

  // ---------- 加载态 ----------
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
          child: const Center(
            child: SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(
                color: Colors.white,
                strokeWidth: 2.5,
              ),
            ),
          ),
        ),
        const SizedBox(width: 16),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              height: 14,
              width: 80,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(7),
              ),
            ),
            const SizedBox(height: 8),
            Container(
              height: 12,
              width: 120,
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

  // ---------- 错误态（离线降级） ----------
  Widget _buildError() {
    return Row(
      children: [
        const Text('🌥️', style: TextStyle(fontSize: 40)),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                '天气小贴士',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                _error ?? '现在看不到天气，等一会儿再来看看吧~',
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
  Widget _buildWeather() {
    final data = _data!;
    final city = data['city'] as String? ?? '未知';
    final weather = (data['weather'] as Map<String, dynamic>?) ?? const {};
    final current = (weather['current'] as Map<String, dynamic>?) ?? const {};
    final currentUnits =
        (weather['current_units'] as Map<String, dynamic>?) ?? const {};
    final daily = (weather['daily'] as Map<String, dynamic>?) ?? const {};

    final temp = current['temperature_2m'];
    final tempUnit = currentUnits['temperature_2m'] ?? '°C';
    final humidity = current['relative_humidity_2m'];
    final wind = current['wind_speed_10m'];
    final windUnit = currentUnits['wind_speed_10m'] ?? 'km/h';
    final codeRaw = current['weather_code'];
    final code = codeRaw is int ? codeRaw : int.tryParse('$codeRaw') ?? -1;
    final info = wmoWeatherInfo(code);

    // 日出日落（ISO 字符串 → HH:mm）
    final sunriseList = daily['sunrise'] as List?;
    final sunsetList = daily['sunset'] as List?;
    final sunrise = _formatTime(sunriseList?.firstOrNull as String?);
    final sunset = _formatTime(sunsetList?.firstOrNull as String?);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 第一行：城市 + emoji + 描述
        Row(
          children: [
            Text(info.emoji, style: const TextStyle(fontSize: 36)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.location_on,
                          color: Colors.white, size: 16),
                      const SizedBox(width: 4),
                      Flexible(
                        child: Text(
                          city,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  Text(
                    info.label,
                    style: TextStyle(
                      fontSize: 13,
                      color: Colors.white.withValues(alpha: 0.9),
                    ),
                  ),
                ],
              ),
            ),
            // 温度大字
            if (temp is num)
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      '$temp'.split('.').first,
                      style: const TextStyle(
                        fontSize: 40,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      tempUnit,
                      style: const TextStyle(
                        fontSize: 14,
                        color: Colors.white70,
                      ),
                    ),
                  ),
                ],
              ),
          ],
        ),
        const SizedBox(height: 12),
        // 第二行：湿度 / 风速 / 日出 / 日落
        Wrap(
          spacing: 12,
          runSpacing: 8,
          children: [
            if (humidity is num)
              _chip('💧', '湿度 $humidity%'),
            if (wind is num)
              _chip('🌬️', '风 $wind $windUnit'),
            if (sunrise != null) _chip('🌅', '日出 $sunrise'),
            if (sunset != null) _chip('🌇', '日落 $sunset'),
          ],
        ),
        const SizedBox(height: 8),
        // 提示：点击查看小知识
        Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            Text(
              '点我学天气知识 →',
              style: TextStyle(
                fontSize: 11,
                color: Colors.white.withValues(alpha: 0.8),
                decoration: TextDecoration.underline,
                decorationColor: Colors.white.withValues(alpha: 0.6),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _chip(String emoji, String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.25),
        borderRadius: BorderRadius.circular(AppTheme.buttonRadius),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(emoji, style: const TextStyle(fontSize: 13)),
          const SizedBox(width: 4),
          Text(
            text,
            style: const TextStyle(fontSize: 12, color: Colors.white),
          ),
        ],
      ),
    );
  }

  // ---------- 科普弹窗 ----------
  void _showFactSheet() {
    final data = _data!;
    final weather = (data['weather'] as Map<String, dynamic>?) ?? const {};
    final current = (weather['current'] as Map<String, dynamic>?) ?? const {};
    final codeRaw = current['weather_code'];
    final code = codeRaw is int ? codeRaw : int.tryParse('$codeRaw') ?? -1;
    final info = wmoWeatherInfo(code);

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(24, 32, 24, 32),
        margin: const EdgeInsets.all(8),
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
                Text(info.emoji, style: const TextStyle(fontSize: 48)),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    info.label,
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textColor,
                    ),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close, color: AppTheme.textSecondary),
                  onPressed: () => Navigator.pop(ctx),
                ),
              ],
            ),
            const SizedBox(height: 16),
            const Row(
              children: [
                Text('💡', style: TextStyle(fontSize: 20)),
                SizedBox(width: 8),
                Text(
                  '你知道吗？',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.primaryColor,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              info.fact,
              style: const TextStyle(
                fontSize: 15,
                height: 1.7,
                color: AppTheme.textColor,
              ),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primaryColor,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                onPressed: () => Navigator.pop(ctx),
                child: const Text(
                  '我知道啦！',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// ISO8601 → HH:mm
  String? _formatTime(String? iso) {
    if (iso == null) return null;
    try {
      final dt = DateTime.parse(iso);
      final h = dt.hour.toString().padLeft(2, '0');
      final m = dt.minute.toString().padLeft(2, '0');
      return '$h:$m';
    } catch (_) {
      return null;
    }
  }
}
