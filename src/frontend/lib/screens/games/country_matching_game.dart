import 'package:flutter/material.dart';

import '../../utils/app_logger.dart';
import '../../services/public_api_service.dart';
import 'matching_game.dart';

final _log = AppLogger('CountryMatchingGame');

/// 国旗配对游戏（国家 ↔ 首都）
///
/// 从后端 `/api/public/country/all` 拉取 30 国数据包，随机选 6 国，
/// 构造 [MatchingGame] 期望的 `pairs` 结构：
///   left = 国名（中文）
///   right = 首都（中文）
///
/// 左列打乱、右列独立打乱，由 [MatchingGame] 内部负责。
class CountryMatchingGame extends StatefulWidget {
  final VoidCallback onExit;
  final GameFinishedCallback? onFinished;

  const CountryMatchingGame({
    super.key,
    required this.onExit,
    this.onFinished,
  });

  @override
  State<CountryMatchingGame> createState() => _CountryMatchingGameState();
}

class _CountryMatchingGameState extends State<CountryMatchingGame> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _gameData;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final list = await PublicApiService.instance.getAllCountries();
      if (list == null || list.isEmpty) {
        if (!mounted) return;
        setState(() {
          _error = '国家数据暂时不可用';
          _loading = false;
        });
        return;
      }
      // 过滤出有首都的，随机选 6 个
      final valid = list.where((c) {
        final capital = (c['capital'] as List?)?.firstOrNull;
        return capital != null && capital.toString().isNotEmpty;
      }).toList();
      valid.shuffle();
      final picked = valid.take(6).toList();
      if (picked.length < 3) {
        if (!mounted) return;
        setState(() {
          _error = '可用国家数量不足';
          _loading = false;
        });
        return;
      }
      final pairs = picked.map((c) {
        final name = (c['name'] as Map?)?['common'] ?? '未知';
        final capital = (c['capital'] as List?)?.firstOrNull ?? '未知';
        return {
          'id': 'country_${c['cca3'] ?? c['cca2'] ?? name}',
          'left': name,
          'right': capital,
        };
      }).toList();
      if (!mounted) return;
      setState(() {
        _gameData = {
          'title': '🌍 国旗配对',
          'subtitle': '把国家名和首都配起来',
          'pairs': pairs,
        };
        _loading = false;
      });
    } catch (e) {
      _log.warning('Country matching load failed: $e');
      if (!mounted) return;
      setState(() {
        _error = '加载失败：$e';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_gameData != null) {
      return MatchingGame(
        data: _gameData!,
        onExit: widget.onExit,
        onFinished: widget.onFinished,
      );
    }

    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF8FD8B5), Color(0xFF6BC89A)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back_rounded,
                        color: Colors.white),
                    onPressed: widget.onExit,
                  ),
                  const Text(
                    '🌍 国旗配对',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: Center(
                child: _loading
                    ? const Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          SizedBox(
                            width: 32,
                            height: 32,
                            child: CircularProgressIndicator(
                              color: Colors.white,
                              strokeWidth: 3,
                            ),
                          ),
                          SizedBox(height: 16),
                          Text(
                            '正在准备国家数据...',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 14,
                            ),
                          ),
                        ],
                      )
                    : Padding(
                        padding: const EdgeInsets.all(32),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Text('🌍', style: TextStyle(fontSize: 56)),
                            const SizedBox(height: 16),
                            Text(
                              _error ?? '数据加载失败',
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 16,
                              ),
                            ),
                            const SizedBox(height: 24),
                            ElevatedButton(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: Colors.white,
                                foregroundColor: const Color(0xFF6BC89A),
                              ),
                              onPressed: () {
                                setState(() {
                                  _loading = true;
                                  _error = null;
                                });
                                _load();
                              },
                              child: const Text('重试'),
                            ),
                            const SizedBox(height: 16),
                            TextButton(
                              onPressed: widget.onExit,
                              child: const Text(
                                '返回',
                                style: TextStyle(color: Colors.white),
                              ),
                            ),
                          ],
                        ),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
