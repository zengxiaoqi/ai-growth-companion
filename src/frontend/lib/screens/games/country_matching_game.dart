import 'package:flutter/material.dart';

import '../../utils/app_logger.dart';
import '../../services/public_api_service.dart';
import 'matching_game.dart';

final _log = AppLogger('CountryMatchingGame');

/// 国旗配对游戏（国家 ↔ 首都）
///
/// 从后端 `/api/public/country/all` 拉取 30 国数据包，随机选 6 国，
/// 构造 [MatchingGame] 期望的 `pairs` 结构。
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

class _CountryMatchingGameState extends State<CountryMatchingGame>
    with TickerProviderStateMixin {
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
          'leftTitle': '🌍 国家',
          'rightTitle': '🏛️ 首都',
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
          colors: [Color(0xFF4CAE7C), Color(0xFF6BC89A), Color(0xFFD4F1E1)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: SafeArea(
        child: Stack(
          children: [
            // 漂浮的国旗装饰
            Positioned(
              top: 90,
              right: -10,
              child: _FloatingEmoji(
                emoji: '🇺🇸',
                size: 38,
                delay: const Duration(milliseconds: 0),
              ),
            ),
            Positioned(
              top: 170,
              left: 10,
              child: _FloatingEmoji(
                emoji: '🇨🇳',
                size: 32,
                delay: const Duration(milliseconds: 700),
              ),
            ),
            Positioned(
              top: 250,
              right: 30,
              child: _FloatingEmoji(
                emoji: '🇫🇷',
                size: 28,
                delay: const Duration(milliseconds: 1400),
              ),
            ),
            Column(
              children: [
                _buildTopBar(),
                _buildTitle(),
                Expanded(
                  child: Center(
                    child: _loading
                        ? _buildLoadingState()
                        : _buildErrorState(),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 16, 0),
      child: Row(
        children: [
          Material(
            color: Colors.white.withValues(alpha: 0.25),
            shape: const CircleBorder(),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: widget.onExit,
              child: const Padding(
                padding: EdgeInsets.all(10),
                child: Icon(Icons.arrow_back_rounded,
                    color: Colors.white, size: 24),
              ),
            ),
          ),
          const Spacer(),
          const Text('🌍', style: TextStyle(fontSize: 22)),
          const SizedBox(width: 8),
          const Text('🏳️', style: TextStyle(fontSize: 18)),
        ],
      ),
    );
  }

  Widget _buildTitle() {
    return Padding(
      padding: const EdgeInsets.only(top: 20, bottom: 8),
      child: Column(
        children: [
          // 大地球 icon，带浮动动画
          TweenAnimationBuilder<double>(
            duration: const Duration(seconds: 3),
            tween: Tween<double>(begin: -6, end: 6),
            curve: Curves.easeInOut,
            builder: (context, value, child) {
              return Transform.translate(
                offset: Offset(0, value),
                child: child,
              );
            },
            child: Container(
              width: 96,
              height: 96,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.3),
                shape: BoxShape.circle,
                border: Border.all(
                  color: Colors.white.withValues(alpha: 0.5),
                  width: 2,
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.white.withValues(alpha: 0.3),
                    blurRadius: 20,
                    spreadRadius: 2,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              alignment: Alignment.center,
              child: const Text('🌍', style: TextStyle(fontSize: 50)),
            ),
          ),
          const SizedBox(height: 16),
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 22, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.25),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.4),
                width: 1.5,
              ),
            ),
            child: const Text(
              '国旗配对',
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w800,
                color: Colors.white,
                letterSpacing: 2,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '把国家和首都配起来吧！',
            style: TextStyle(
              fontSize: 14,
              color: Colors.white.withValues(alpha: 0.85),
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLoadingState() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // 旋转地球
        TweenAnimationBuilder<double>(
          duration: const Duration(seconds: 4),
          tween: Tween<double>(begin: 0, end: 1),
          curve: Curves.linear,
          builder: (context, value, child) {
            return Transform.rotate(
              angle: value * 6.283,
              child: child,
            );
          },
          child: Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.25),
              shape: BoxShape.circle,
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.5),
                width: 2,
              ),
            ),
            alignment: Alignment.center,
            child: const Text('🌍', style: TextStyle(fontSize: 44)),
          ),
        ),
        const SizedBox(height: 24),
        const SizedBox(
          width: 28,
          height: 28,
          child: CircularProgressIndicator(
            color: Colors.white,
            strokeWidth: 3,
          ),
        ),
        const SizedBox(height: 16),
        const Text(
          '正在环游世界...',
          style: TextStyle(
            color: Colors.white,
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          '收集国家数据中',
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.7),
            fontSize: 13,
          ),
        ),
      ],
    );
  }

  Widget _buildErrorState() {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 90,
            height: 90,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.25),
              shape: BoxShape.circle,
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.4),
                width: 2,
              ),
            ),
            alignment: Alignment.center,
            child: const Text('🛰️', style: TextStyle(fontSize: 44)),
          ),
          const SizedBox(height: 20),
          const Text(
            '数据加载失败',
            style: TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            _error ?? '请稍后重试',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.85),
              fontSize: 14,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 28),
          // 重试按钮 - 弹簧反馈
          _SpringButton(
            onTap: () {
              setState(() {
                _loading = true;
                _error = null;
              });
              _load();
            },
            child: Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: 24, vertical: 14),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(18),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.15),
                    blurRadius: 14,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.refresh_rounded,
                      size: 22, color: Color(0xFF4CAE7C)),
                  SizedBox(width: 8),
                  Text(
                    '重试',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF4CAE7C),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          TextButton(
            onPressed: widget.onExit,
            child: Text(
              '返回首页',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.8),
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// 漂浮的 emoji 装饰
class _FloatingEmoji extends StatefulWidget {
  final String emoji;
  final double size;
  final Duration delay;

  const _FloatingEmoji({
    required this.emoji,
    required this.size,
    required this.delay,
  });

  @override
  State<_FloatingEmoji> createState() => _FloatingEmojiState();
}

class _FloatingEmojiState extends State<_FloatingEmoji>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(seconds: 5),
      vsync: this,
    );
    _anim = Tween<double>(begin: -10, end: 10).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
    Future.delayed(widget.delay, () {
      if (mounted) _controller.repeat(reverse: true);
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _anim,
      builder: (context, child) {
        return Transform.translate(
          offset: Offset(0, _anim.value),
          child: child,
        );
      },
      child: Text(
        widget.emoji,
        style: TextStyle(fontSize: widget.size),
      ),
    );
  }
}

/// 弹簧按钮
class _SpringButton extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;

  const _SpringButton({required this.child, this.onTap});

  @override
  State<_SpringButton> createState() => _SpringButtonState();
}

class _SpringButtonState extends State<_SpringButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 120),
      vsync: this,
    );
    _scale = Tween<double>(begin: 1.0, end: 0.96).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeIn),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: widget.onTap == null
          ? null
          : (_) => _controller.forward(),
      onTapUp: widget.onTap == null
          ? null
          : (_) {
              _controller.reverse();
              widget.onTap!();
            },
      onTapCancel: () => _controller.reverse(),
      child: AnimatedBuilder(
        animation: _scale,
        builder: (context, child) {
          return Transform.scale(scale: _scale.value, child: child);
        },
        child: widget.child,
      ),
    );
  }
}