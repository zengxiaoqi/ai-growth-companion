import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../theme/app_theme.dart';
import '../../../services/tts_service.dart';

/// Twemoji 离线插图：manifest 记录已落地的 emoji→svg 文件名，
/// 缺资产时降级为系统 emoji 文本，绝不白屏。
class TwemojiAssets {
  TwemojiAssets._();

  static Map<String, String>? _manifest;
  static Future<Map<String, String>>? _loading;

  static Future<Map<String, String>> manifest() {
    if (_manifest != null) return Future.value(_manifest!);
    return _loading ??= () async {
      try {
        final raw = await rootBundle.loadString('assets/twemoji/manifest.json');
        final decoded = jsonDecode(raw) as Map<String, dynamic>;
        _manifest = decoded.map((k, v) => MapEntry(k, v.toString()));
      } catch (_) {
        _manifest = {};
      }
      return _manifest!;
    }();
  }

  /// 与抓取脚本同一套 hex 规则：小写码点、去 fe0f、多码点 '-' 连接。
  static String hexName(String emoji) {
    final points = emoji.runes
        .where((r) => r != 0xFE0F)
        .map((r) => r.toRadixString(16))
        .join('-');
    return '$points.svg';
  }
}

class TwemojiImage extends StatelessWidget {
  final String emoji;
  final double size;

  const TwemojiImage({super.key, required this.emoji, this.size = 44});

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Map<String, String>>(
      future: TwemojiAssets.manifest(),
      builder: (context, snapshot) {
        final manifest = snapshot.data;
        final file = manifest?[emoji] ??
            (manifest != null && manifest.containsValue(TwemojiAssets.hexName(emoji))
                ? TwemojiAssets.hexName(emoji)
                : null);
        if (file == null) {
          return Text(emoji, style: TextStyle(fontSize: size * 0.82));
        }
        return SvgPicture.asset(
          'assets/twemoji/$file',
          width: size,
          height: size,
          placeholderBuilder: (_) =>
              Text(emoji, style: TextStyle(fontSize: size * 0.82)),
        );
      },
    );
  }
}

/// 一排/一网格 emoji 插图。
class IllustrationGrid extends StatelessWidget {
  final List<String> emojis;
  final double size;

  const IllustrationGrid({
    super.key,
    required this.emojis,
    this.size = 44,
  });

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: [
        for (final emoji in emojis)
          TwemojiImage(emoji: emoji, size: size),
      ],
    );
  }
}

/// 点一点数一数：孩子逐个点 emoji 计数，点完自动庆祝并朗读总数。
class EmojiCountingGame extends StatefulWidget {
  final List<String> items;
  final String? question;

  const EmojiCountingGame({
    super.key,
    required this.items,
    this.question,
  });

  @override
  State<EmojiCountingGame> createState() => _EmojiCountingGameState();
}

class _EmojiCountingGameState extends State<EmojiCountingGame> {
  final Set<int> _tapped = {};
  final TtsService _tts = TtsService();
  bool _celebrated = false;

  int get _total => widget.items.length;

  Future<void> _tap(int index) async {
    if (_tapped.contains(index)) return;
    setState(() => _tapped.add(index));
    if (_tapped.length == _total && !_celebrated) {
      _celebrated = true;
      await _tts.speak('数对了！一共有$_total个。你真棒！');
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppTheme.active;
    final done = _tapped.length == _total;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (widget.question != null && widget.question!.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Text(
              widget.question!,
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: palette.ink,
              ),
            ),
          ),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            for (var i = 0; i < widget.items.length; i++)
              GestureDetector(
                onTap: () => _tap(i),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: _tapped.contains(i)
                        ? palette.pop.withValues(alpha: 0.16)
                        : palette.soft,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: _tapped.contains(i)
                          ? palette.pop
                          : palette.line.withValues(alpha: 0.6),
                      width: 2,
                    ),
                  ),
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      TwemojiImage(emoji: widget.items[i], size: 44),
                      if (_tapped.contains(i))
                        Positioned(
                          right: -6,
                          top: -6,
                          child: Container(
                            padding: const EdgeInsets.all(3),
                            decoration: BoxDecoration(
                              color: palette.pop,
                              shape: BoxShape.circle,
                            ),
                            child: Text(
                              '${_tapped.toList().indexOf(i) + 1}',
                              style: const TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w800,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 10),
        Text(
          done
              ? '🎉 一共有 $_total 个，数对啦！'
              : '点一点上面的图案，数数一共有几个（已数 ${_tapped.length} 个）',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: done ? palette.pop : palette.ink2,
          ),
        ),
      ],
    );
  }
}