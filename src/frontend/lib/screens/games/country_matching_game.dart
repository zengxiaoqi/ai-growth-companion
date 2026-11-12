import 'package:flutter/material.dart';

import '../../components/child_fun_page.dart';
import '../../components/child_home_experience.dart';
import '../../components/gradient_button.dart';
import '../../services/public_api_service.dart';
import '../../theme/child_theme.dart';
import '../../utils/app_logger.dart';
import 'matching_game.dart';

final _log = AppLogger('CountryMatchingGame');

/// 国旗配对游戏（国家 ↔ 首都）。
///
/// 从后端 `/api/public/country/all` 拉取国家数据包，随机选 6 国，
/// 构造 [MatchingGame] 期望的 `pairs` 结构。
///
/// 外壳走 [ChildFunPage]：跟随皮肤换色，并自带 Scaffold（否则 Text 会退回
/// Flutter 错误文本样式，出现满屏黄色下划线）。
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
      if (!mounted) return;
      if (list == null || list.isEmpty) {
        setState(() {
          _error = '国家数据暂时不可用';
          _loading = false;
        });
        return;
      }
      final valid = list.where((c) {
        final capital = (c['capital'] as List?)?.firstOrNull;
        return capital != null && capital.toString().isNotEmpty;
      }).toList();
      valid.shuffle();
      final picked = valid.take(6).toList();
      if (picked.length < 3) {
        setState(() {
          _error = '可用国家数量不足';
          _loading = false;
        });
        return;
      }
      final pairs = picked.map((c) {
        final name = (c['name'] as Map?)?['common'] ?? '未知';
        final capital = (c['capital'] as List?)?.firstOrNull ?? '未知';
        return <String, dynamic>{
          'id': 'country_${c['cca3'] ?? c['cca2'] ?? name}',
          'left': name,
          'right': capital,
        };
      }).toList();
      setState(() {
        _gameData = <String, dynamic>{
          'title': '国旗配对',
          'subtitle': '把国家名和首都配起来',
          'leftTitle': '国家',
          'rightTitle': '首都',
          'pairs': pairs,
        };
        _loading = false;
      });
    } catch (e) {
      _log.warning('Country matching load failed: $e');
      if (!mounted) return;
      setState(() {
        _error = '网络好像不太顺畅';
        _loading = false;
      });
    }
  }

  void _retry() {
    setState(() {
      _loading = true;
      _error = null;
    });
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);

    // 配对中：MatchingGame 只返回一个 Column，需要外面包一层 Scaffold + 滚动区。
    if (_gameData != null) {
      return Scaffold(
        backgroundColor: palette.paper,
        body: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            child: MatchingGame(
              data: _gameData!,
              onExit: widget.onExit,
              onFinished: widget.onFinished,
            ),
          ),
        ),
      );
    }

    return ChildFunPage(
      title: '国旗配对',
      subtitle: '把国家和首都配起来',
      icon: Icons.flag_rounded,
      onBack: widget.onExit,
      scrollable: false,
      child: Center(
        child: _loading
            ? _buildLoading(palette)
            : _buildError(context, palette),
      ),
    );
  }

  Widget _buildLoading(ChildThemePalette palette) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Container(
          width: 96,
          height: 96,
          decoration: BoxDecoration(
            color: Color.alphaBlend(
              palette.pop.withValues(alpha: 0.14),
              palette.card,
            ),
            shape: BoxShape.circle,
            border: palette.isCartoon
                ? Border.all(color: palette.pop, width: 3)
                : null,
          ),
          child: Icon(Icons.public_rounded, size: 46, color: palette.pop),
        ),
        const SizedBox(height: 20),
        SizedBox(
          width: 132,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              minHeight: 8,
              backgroundColor: palette.soft,
              color: palette.pop,
            ),
          ),
        ),
        const SizedBox(height: 16),
        Text(
          '正在环游世界…',
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w700,
            color: palette.ink,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          '正在收集国家数据',
          style: TextStyle(fontSize: 12.5, color: palette.ink2),
        ),
      ],
    );
  }

  Widget _buildError(BuildContext context, ChildThemePalette palette) {
    return ChildSticker(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
      background: palette.card,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Container(
            width: 82,
            height: 82,
            decoration: BoxDecoration(
              color: Color.alphaBlend(
                palette.subjects[0].withValues(alpha: 0.16),
                palette.card,
              ),
              shape: BoxShape.circle,
            ),
            child: Icon(
              Icons.cloud_off_rounded,
              size: 40,
              color: palette.subjects[0],
            ),
          ),
          const SizedBox(height: 18),
          Text(
            '数据加载失败',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: palette.ink,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            _error ?? '请稍后重试',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13.5, height: 1.5, color: palette.ink2),
          ),
          const SizedBox(height: 22),
          GradientButton(
            text: '重试',
            icon: Icons.refresh_rounded,
            minWidth: 168,
            gradient: LinearGradient(
              colors: <Color>[palette.cta, palette.pop],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            onPressed: _retry,
          ),
          const SizedBox(height: 6),
          TextButton(
            onPressed: widget.onExit,
            child: Text(
              '返回首页',
              style: TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.w600,
                color: palette.ink2,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
