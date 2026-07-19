import 'package:flutter/material.dart';

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
class EnglishPoetryCard extends StatefulWidget {
  const EnglishPoetryCard({super.key});

  @override
  State<EnglishPoetryCard> createState() => _EnglishPoetryCardState();
}

class _EnglishPoetryCardState extends State<EnglishPoetryCard> {
  Map<String, dynamic>? _poem;
  bool _loading = false;
  bool _error = false;
  String? _titleTranslation;
  bool _translatingTitle = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = false;
    });
    try {
      final p = await PublicApiService.instance.getRandomPoem();
      if (!mounted) return;
      setState(() {
        _poem = p;
        _loading = false;
      });
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
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFFFF3E0), Color(0xFFFFE0B2)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: const Color(0xFFFFB74D).withValues(alpha: 0.3),
          width: 1,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.orange.withValues(alpha: 0.15),
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
                const Text('📜', style: TextStyle(fontSize: 28)),
                const SizedBox(width: 10),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '英文诗歌赏读',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFFE65100),
                        ),
                      ),
                      Text(
                        '每天一首经典英文诗',
                        style: TextStyle(
                          fontSize: 12,
                          color: Color(0xFFF57C00),
                        ),
                      ),
                    ],
                  ),
                ),
                if (!_loading)
                  IconButton(
                    icon: const Icon(Icons.refresh, color: Color(0xFFE65100)),
                    onPressed: _load,
                    tooltip: '换一首',
                  ),
              ],
            ),
            const SizedBox(height: 16),
            // 内容
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
              color: Color(0xFFF57C00),
              strokeWidth: 2.5,
            ),
          ),
        ),
      );
    }

    if (_error || _poem == null) {
      return Column(
        children: [
          const Text('📭', style: TextStyle(fontSize: 36)),
          const SizedBox(height: 8),
          const Text(
            '暂时无法获取诗歌',
            style: TextStyle(color: Color(0xFFF57C00)),
          ),
          const SizedBox(height: 12),
          ElevatedButton(
            onPressed: _load,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFF57C00),
              foregroundColor: Colors.white,
            ),
            child: const Text('重试'),
          ),
        ],
      );
    }

    final title = _poem!['title'] as String? ?? 'Unknown';
    final author = _poem!['author'] as String? ?? 'Unknown';
    final lines = (_poem!['lines'] as List?)?.cast<String>() ?? const [];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 诗歌标题 + 作者
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.7),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFFBF360C),
                  fontStyle: FontStyle.italic,
                ),
              ),
              if (_titleTranslation != null)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(
                    '《$_titleTranslation》',
                    style: const TextStyle(
                      fontSize: 14,
                      color: Color(0xFFE65100),
                    ),
                  ),
                ),
              if (_translatingTitle && _titleTranslation == null)
                const Padding(
                  padding: EdgeInsets.only(top: 2),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SizedBox(
                        width: 12,
                        height: 12,
                        child: CircularProgressIndicator(
                          strokeWidth: 1.5,
                          color: Color(0xFFF57C00),
                        ),
                      ),
                      SizedBox(width: 4),
                      Text(
                        '翻译中...',
                        style: TextStyle(
                          fontSize: 11,
                          color: Color(0xFFF57C00),
                        ),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 4),
              Row(
                children: [
                  const Text(
                    '— ',
                    style: TextStyle(
                      color: Color(0xFFF57C00),
                      fontSize: 14,
                    ),
                  ),
                  Text(
                    author,
                    style: const TextStyle(
                      fontSize: 14,
                      color: Color(0xFFF57C00),
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        // 诗歌正文 — 全部展示，可选择复制 + 一键查词
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.5),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: const Color(0xFFFFCC80).withValues(alpha: 0.4),
            ),
          ),
          child: _PoemBody(lines: lines),
        ),
        const SizedBox(height: 12),
        // 学习提示
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: const Color(0xFFFFCC80).withValues(alpha: 0.25),
            borderRadius: BorderRadius.circular(10),
          ),
          child: const Row(
            children: [
              Text('💡', style: TextStyle(fontSize: 16)),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  '点击诗歌中的蓝色单词即可查词哦！',
                  style: TextStyle(
                    fontSize: 12,
                    color: Color(0xFFE65100),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// 诗歌正文 — 每个英文单词可点击直接查词，非英文片段纯展示。
///
/// 设计要点：
/// - 空行（诗节分隔）渲染为间距
/// - 英文单词渲染为带下划线的可点击 TextSpan（Material InkWell 效果）
/// - 点击单词：直接打开 DictionarySheet（不依赖上下文菜单）
/// - 同时保留 SelectableText 容器，使整行可选择/复制（系统级菜单）
class _PoemBody extends StatelessWidget {
  const _PoemBody({required this.lines});

  final List<String> lines;

  /// 将一行切分为 [TextSpan] 列表：英文单词 → 可点击查词；其他 → 普通文本。
  List<InlineSpan> _buildSpans(BuildContext context, String line) {
    final spans = <InlineSpan>[];
    // 匹配英文单词（含简写如 I'm / don't）或非英文片段
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

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: lines.map((line) {
        if (line.isEmpty) {
          return const SizedBox(height: 10);
        }
        return Padding(
          padding: const EdgeInsets.only(bottom: 3),
          child: SelectableText.rich(
            TextSpan(
              style: const TextStyle(
                fontSize: 15,
                height: 1.6,
                color: Color(0xFF3E2723),
                fontFamily: 'serif',
              ),
              children: _buildSpans(context, line),
            ),
          ),
        );
      }).toList(),
    );
  }
}

/// 可点击的英文单词 chip：带下划线 + InkWell 水波纹反馈。
class _WordChip extends StatelessWidget {
  const _WordChip({required this.word, required this.onTap});

  final String word;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      onTapDown: (_) {}, // 触摸反馈
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 1),
        child: Text(
          word,
          style: TextStyle(
            fontSize: 15,
            height: 1.6,
            color: const Color(0xFF1565C0),
            fontFamily: 'serif',
            decoration: TextDecoration.underline,
            decorationColor: const Color(0xFF1565C0).withValues(alpha: 0.4),
            decorationStyle: TextDecorationStyle.dotted,
          ),
        ),
      ),
    );
  }
}
