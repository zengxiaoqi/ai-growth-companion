import 'package:flutter/material.dart';

import '../theme/child_theme.dart';
import '../utils/app_logger.dart';
import '../services/public_api_service.dart';
import 'dictionary_sheet.dart';

final _log = AppLogger('EnglishPoetryCard');

/// 英文经典诗歌卡片
///
/// 从 PoetryDB (poetrydb.org) 拉取随机英文经典诗歌，
/// 展示在儿童学习首页，培养英文语感。
///
/// 数据结构：{title, author, lines: [...], linecount: "N"}
/// lines 包含空字符串表示诗节分隔。
///
/// 视觉口径（2026-11-13 修订）：
/// - 颜色全部走当前皮肤 token（`palette.card` / `soft` / `ink` / `pop`），
///   四套皮肤（honey / candy / forest / space）都不会出现「浅底浅字」；
/// - 正文**固定视口高度**，超出内部滚动 —— 长诗不再把整个学习页越撑越长。
class EnglishPoetryCard extends StatefulWidget {
  const EnglishPoetryCard({super.key});

  @override
  State<EnglishPoetryCard> createState() => _EnglishPoetryCardState();
}

class _EnglishPoetryCardState extends State<EnglishPoetryCard> {
  /// 正文字数超过视口时的滚动控制器（用于滚动条与「还有内容」渐隐）。
  final ScrollController _poemScroll = ScrollController();

  /// 诗歌正文视口高度：固定值让卡片高度稳定，长诗内部滚动。
  /// 取 200 ≈ 6 行正文，手机上不至于把整个学习页推得太长。
  static const double _poemViewportHeight = 200;

  Map<String, dynamic>? _poem;
  bool _loading = false;
  bool _error = false;
  String? _titleTranslation;
  bool _translatingTitle = false;

  /// 正文是否有溢出（决定底部渐隐与「上下滑动」提示是否出现）。
  bool _overflowing = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _poemScroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = false;
      _overflowing = false;
    });
    if (_poemScroll.hasClients) {
      _poemScroll.jumpTo(0);
    }
    try {
      final p = await PublicApiService.instance.getRandomPoem();
      if (!mounted) return;
      setState(() {
        _poem = p;
        _loading = false;
      });
      _scheduleOverflowCheck();
      // 自动翻译诗歌标题
      if (p != null) {
        final title = p['title'] as String? ?? '';
        if (title.isNotEmpty) {
          _translateTitle(title);
        }
      }
    } catch (e) {
      _log.warning('load failed: $e');
      if (!mounted) return;
      setState(() {
        _error = true;
        _loading = false;
      });
    }
  }

  /// 布局完成后判断正文是否超出视口，用于出现「可滚动」的视觉提示。
  void _scheduleOverflowCheck() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_poemScroll.hasClients) return;
      final over = _poemScroll.position.maxScrollExtent > 1;
      if (over != _overflowing) {
        setState(() => _overflowing = over);
      }
    });
  }

  Future<void> _translateTitle(String title) async {
    setState(() => _translatingTitle = true);
    try {
      final result = await PublicApiService.instance.translate(title);
      if (!mounted) return;
      if (result != null) {
        final responseData = result['responseData'] as Map?;
        final translated = responseData?['translatedText'] as String?;
        if (translated != null && translated.isNotEmpty && translated != title) {
          setState(() {
            _titleTranslation = translated;
            _translatingTitle = false;
          });
          return;
        }
      }
      setState(() => _translatingTitle = false);
    } catch (e) {
      _log.warning('translate title failed: $e');
      if (!mounted) return;
      setState(() => _translatingTitle = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    final accent = palette.pop;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: <Color>[
            Color.alphaBlend(accent.withValues(alpha: 0.10), palette.card),
            palette.card,
          ],
        ),
        borderRadius: BorderRadius.circular(palette.radiusLg),
        border: Border.all(
          color: palette.isCartoon
              ? Color.lerp(palette.line, palette.ink, 0.22)!
              : palette.line.withValues(alpha: 0.7),
          width: palette.isCartoon ? palette.borderW : 1,
        ),
        boxShadow: palette.isCartoon
            ? <BoxShadow>[
                BoxShadow(
                  color: palette.line,
                  offset: const Offset(0, 4),
                  blurRadius: 0,
                ),
              ]
            : <BoxShadow>[
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.06),
                  offset: const Offset(0, 8),
                  blurRadius: 20,
                ),
              ],
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            _buildHeader(palette, accent),
            const SizedBox(height: 14),
            _buildContent(palette, accent),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(ChildThemePalette palette, Color accent) {
    return Row(
      children: <Widget>[
        Container(
          width: 40,
          height: 40,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: Color.alphaBlend(
              accent.withValues(alpha: 0.16),
              palette.card,
            ),
            borderRadius: BorderRadius.circular(palette.radiusSm),
          ),
          child: Icon(Icons.auto_stories_rounded, size: 20, color: accent),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Text(
                '英文诗歌赏读',
                style: TextStyle(
                  fontSize: 16,
                  height: 1.25,
                  fontWeight: FontWeight.w800,
                  color: palette.ink,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                '每天一首经典英文诗',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: palette.ink2,
                ),
              ),
            ],
          ),
        ),
        if (!_loading)
          _HeaderAction(
            palette: palette,
            icon: Icons.refresh_rounded,
            tooltip: '换一首',
            onTap: _load,
          ),
      ],
    );
  }

  Widget _buildContent(ChildThemePalette palette, Color accent) {
    if (_loading) {
      return SizedBox(
        height: _poemViewportHeight,
        child: Center(
          child: SizedBox(
            width: 24,
            height: 24,
            child: CircularProgressIndicator(
              color: accent,
              strokeWidth: 2.5,
            ),
          ),
        ),
      );
    }

    if (_error || _poem == null) {
      return SizedBox(
        height: _poemViewportHeight,
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Icon(Icons.cloud_off_rounded,
                  size: 32, color: palette.ink2.withValues(alpha: 0.7)),
              const SizedBox(height: 8),
              Text(
                '暂时无法获取诗歌',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: palette.ink2,
                ),
              ),
              const SizedBox(height: 12),
              TextButton.icon(
                onPressed: _load,
                icon: Icon(Icons.refresh_rounded, size: 16, color: accent),
                label: Text(
                  '再试一次',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: accent,
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }

    final title = _poem!['title'] as String? ?? 'Unknown';
    final author = _poem!['author'] as String? ?? 'Unknown';
    final lines = (_poem!['lines'] as List?)?.cast<String>() ?? const [];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        // 标题 + 作者
        Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          decoration: BoxDecoration(
            color: palette.soft,
            borderRadius: BorderRadius.circular(palette.radiusMd),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                title,
                style: TextStyle(
                  fontSize: 17,
                  height: 1.3,
                  fontWeight: FontWeight.w800,
                  fontStyle: FontStyle.italic,
                  color: palette.ink,
                ),
              ),
              if (_titleTranslation != null)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(
                    '《$_titleTranslation》',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: palette.ink2,
                    ),
                  ),
                ),
              if (_translatingTitle && _titleTranslation == null)
                Padding(
                  padding: const EdgeInsets.only(top: 3),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      SizedBox(
                        width: 10,
                        height: 10,
                        child: CircularProgressIndicator(
                          strokeWidth: 1.5,
                          color: accent,
                        ),
                      ),
                      const SizedBox(width: 5),
                      Text(
                        '翻译中…',
                        style: TextStyle(fontSize: 11, color: palette.ink2),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 3),
              Row(
                children: <Widget>[
                  Container(
                    width: 12,
                    height: 2,
                    decoration: BoxDecoration(
                      color: accent.withValues(alpha: 0.7),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      author,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: palette.ink2,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),

        // 正文：固定视口 + 内部滚动
        Stack(
          children: <Widget>[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
              decoration: BoxDecoration(
                color: Color.alphaBlend(
                  palette.ink.withValues(alpha: 0.03),
                  palette.soft,
                ),
                borderRadius: BorderRadius.circular(palette.radiusMd),
                border: Border.all(
                  color: palette.line.withValues(alpha: 0.6),
                ),
              ),
              child: SizedBox(
                height: _poemViewportHeight,
                child: RawScrollbar(
                  controller: _poemScroll,
                  thumbVisibility: _overflowing,
                  thickness: 3,
                  radius: const Radius.circular(3),
                  thumbColor: accent.withValues(alpha: 0.55),
                  child: SingleChildScrollView(
                    controller: _poemScroll,
                    // 内容没溢出时禁用内层滚动，否则会把页面的下滑手势吞掉，
                    // 孩子在诗歌卡上滑不动页面。
                    physics: _overflowing
                        ? const ClampingScrollPhysics()
                        : const NeverScrollableScrollPhysics(),
                    padding: const EdgeInsets.only(right: 6),
                    child: _PoemBody(
                      lines: lines,
                      palette: palette,
                      onMeasured: _scheduleOverflowCheck,
                    ),
                  ),
                ),
              ),
            ),
            // 还有内容时底部渐隐，暗示可以继续滑
            if (_overflowing)
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                height: 34,
                child: IgnorePointer(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.vertical(
                        bottom: Radius.circular(palette.radiusMd - 2),
                      ),
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: <Color>[
                          Color.alphaBlend(
                            palette.ink.withValues(alpha: 0.03),
                            palette.soft,
                          ).withValues(alpha: 0.0),
                          Color.alphaBlend(
                            palette.ink.withValues(alpha: 0.03),
                            palette.soft,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),

        const SizedBox(height: 10),
        // 操作提示：一行放得下，长诗再补「可滑动」
        Row(
          children: <Widget>[
            Icon(Icons.touch_app_rounded,
                size: 13, color: accent.withValues(alpha: 0.85)),
            const SizedBox(width: 5),
            Expanded(
              child: Text(
                _overflowing
                    ? '点单词查词 · 上下滑动读完整首'
                    : '点一下单词就能查词哦',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: palette.ink2,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// 页头小圆钮：统一按压反馈与皮肤配色。
class _HeaderAction extends StatelessWidget {
  const _HeaderAction({
    required this.palette,
    required this.icon,
    required this.tooltip,
    required this.onTap,
  });

  final ChildThemePalette palette;
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: Color.alphaBlend(
          palette.pop.withValues(alpha: 0.12),
          palette.card,
        ),
        shape: const CircleBorder(),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: SizedBox(
            width: 34,
            height: 34,
            child: Icon(icon, size: 18, color: palette.pop),
          ),
        ),
      ),
    );
  }
}

/// 诗歌正文 — 每个英文单词可点击直接查词，非英文片段纯展示。
///
/// 设计要点：
/// - 空行（诗节分隔）渲染为间距
/// - 英文单词渲染为可点击的下划线文本（Material InkWell 效果）
/// - 点击单词：直接打开 DictionarySheet（不依赖上下文菜单）
/// - 外层由卡片给定固定视口，这里只负责把整首诗铺开
class _PoemBody extends StatefulWidget {
  const _PoemBody({
    required this.lines,
    required this.palette,
    required this.onMeasured,
  });

  final List<String> lines;
  final ChildThemePalette palette;
  final VoidCallback onMeasured;

  @override
  State<_PoemBody> createState() => _PoemBodyState();
}

class _PoemBodyState extends State<_PoemBody> {
  @override
  void initState() {
    super.initState();
    // 内容高度变化（换诗）后重新判定是否溢出
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) widget.onMeasured();
    });
  }

  @override
  Widget build(BuildContext context) {
    final palette = widget.palette;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: widget.lines.map((line) {
        if (line.isEmpty) {
          return const SizedBox(height: 9);
        }
        return Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Text.rich(
            TextSpan(
              style: TextStyle(
                fontSize: 15,
                height: 1.6,
                color: palette.ink,
                fontFamily: 'serif',
              ),
              children: _buildSpans(context, line, palette),
            ),
          ),
        );
      }).toList(),
    );
  }

  /// 将一行切分为 [TextSpan] 列表：英文单词 → 可点击查词；其他 → 普通文本。
  List<InlineSpan> _buildSpans(
    BuildContext context,
    String line,
    ChildThemePalette palette,
  ) {
    final spans = <InlineSpan>[];
    final regex = RegExp(r"[A-Za-z]+(?:'[a-z]+)?");
    var lastEnd = 0;
    for (final m in regex.allMatches(line)) {
      if (m.start > lastEnd) {
        spans.add(TextSpan(text: line.substring(lastEnd, m.start)));
      }
      final word = m.group(0)!;
      spans.add(
        WidgetSpan(
          alignment: PlaceholderAlignment.baseline,
          baseline: TextBaseline.alphabetic,
          child: _WordChip(
            word: word,
            color: palette.pop,
            onTap: () => DictionarySheet.show(context, word: word),
          ),
        ),
      );
      lastEnd = m.end;
    }
    if (lastEnd < line.length) {
      spans.add(TextSpan(text: line.substring(lastEnd)));
    }
    return spans;
  }
}

/// 可点击的英文单词 chip：带点状下划线 + 水波纹反馈。
class _WordChip extends StatelessWidget {
  const _WordChip({
    required this.word,
    required this.color,
    required this.onTap,
  });

  final String word;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(3),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 1),
        child: Text(
          word,
          style: TextStyle(
            fontSize: 15,
            height: 1.6,
            color: color,
            fontFamily: 'serif',
            fontWeight: FontWeight.w600,
            decoration: TextDecoration.underline,
            decorationColor: color.withValues(alpha: 0.45),
            decorationStyle: TextDecorationStyle.dotted,
          ),
        ),
      ),
    );
  }
}
