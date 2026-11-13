import 'package:flutter/material.dart';

import '../../../theme/app_theme.dart';
import '../../../services/tts_service.dart';
import 'illustration_grid.dart';

/// 故事/课文卡：分段正文 + 逐句朗读高亮，可挂互动数一数。
class StoryCard extends StatefulWidget {
  final String title;
  final String text;
  final Map<String, dynamic>? interactive;
  final List<String> extras;

  const StoryCard({
    super.key,
    this.title = '',
    required this.text,
    this.interactive,
    this.extras = const [],
  });

  @override
  State<StoryCard> createState() => _StoryCardState();
}

class _StoryCardState extends State<StoryCard> {
  final TtsService _tts = TtsService();
  bool _isPlaying = false;
  int _currentSentence = -1;

  static final RegExp _sentenceRe = RegExp(r'[^。！？.!?…\n]+[。！？.!?…]*');

  /// 全文按句切分（跨段连续编号），供朗读高亮定位。
  List<({String text, int paragraph, int start})> get _sentences {
    final result = <({String text, int paragraph, int start})>[];
    final paragraphs = widget.text.split(RegExp(r'\n\s*\n'));
    var offset = 0;
    for (var p = 0; p < paragraphs.length; p++) {
      for (final match in _sentenceRe.allMatches(paragraphs[p])) {
        final sentence = match.group(0)!.trim();
        if (sentence.isEmpty) continue;
        result.add((text: sentence, paragraph: p, start: offset));
        offset += 1;
      }
    }
    return result;
  }

  List<String> get _paragraphs => widget.text
      .split(RegExp(r'\n\s*\n'))
      .map((p) => p.trim())
      .where((p) => p.isNotEmpty)
      .toList();

  Future<void> _toggleTts() async {
    if (_isPlaying) {
      await _tts.stop();
      if (mounted) {
        setState(() {
          _isPlaying = false;
          _currentSentence = -1;
        });
      }
      return;
    }

    final sentences = _sentences;
    if (sentences.isEmpty) return;
    setState(() {
      _isPlaying = true;
      _currentSentence = 0;
    });

    for (var i = 0; i < sentences.length; i++) {
      if (!mounted || !_isPlaying) break;
      setState(() => _currentSentence = i);
      try {
        await _tts.speak(sentences[i].text);
        await _tts.onComplete;
      } catch (_) {
        break;
      }
      await Future.delayed(const Duration(milliseconds: 220));
    }

    if (mounted) {
      setState(() {
        _isPlaying = false;
        _currentSentence = -1;
      });
    }
  }

  @override
  void dispose() {
    _tts.stop();
    super.dispose();
  }

  /// 把一段正文渲染成带高亮的富文本：当前朗读句变色加粗。
  Widget _buildParagraph(String paragraph, int paragraphIndex) {
    final palette = AppTheme.active;
    final sentences = _sentences;
    final spans = <TextSpan>[];
    var cursor = 0;
    for (var i = 0; i < sentences.length; i++) {
      final s = sentences[i];
      if (s.paragraph != paragraphIndex) continue;
      final idx = paragraph.indexOf(s.text, cursor);
      if (idx < 0) continue;
      if (idx > cursor) {
        spans.add(TextSpan(text: paragraph.substring(cursor, idx)));
      }
      final active = i == _currentSentence;
      spans.add(TextSpan(
        text: s.text,
        style: active
            ? TextStyle(
                color: palette.pop,
                fontWeight: FontWeight.w800,
                backgroundColor: palette.pop.withValues(alpha: 0.12),
              )
            : null,
      ));
      cursor = idx + s.text.length;
    }
    if (cursor < paragraph.length) {
      spans.add(TextSpan(text: paragraph.substring(cursor)));
    }
    if (spans.isEmpty) {
      spans.add(TextSpan(text: paragraph));
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Text.rich(
        TextSpan(
          style: TextStyle(
            fontSize: 16,
            height: 1.85,
            letterSpacing: 0.2,
            color: palette.ink,
          ),
          children: spans,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppTheme.active;
    final paragraphs = _paragraphs;
    final interactive = widget.interactive;
    final interactiveItems = (interactive?['items'] is List)
        ? (interactive!['items'] as List).map((e) => e.toString()).toList()
        : const <String>[];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            if (widget.title.isNotEmpty)
              Expanded(
                child: Text(
                  widget.title,
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    color: palette.ink,
                  ),
                ),
              ),
            FilledButton.tonalIcon(
              onPressed: _toggleTts,
              icon: Icon(
                _isPlaying ? Icons.stop_rounded : Icons.volume_up_rounded,
                size: 18,
              ),
              label: Text(_isPlaying ? '停止' : '朗读'),
            ),
          ],
        ),
        const SizedBox(height: 10),
        for (var i = 0; i < paragraphs.length; i++)
          _buildParagraph(paragraphs[i], i),
        if (widget.extras.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final extra in widget.extras)
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: palette.pop.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      extra,
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                        color: palette.ink,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        if (interactive != null &&
            interactive['type'] == 'count' &&
            interactiveItems.isNotEmpty) ...[
          const SizedBox(height: 6),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: palette.soft,
              borderRadius: BorderRadius.circular(14),
            ),
            child: EmojiCountingGame(
              items: interactiveItems,
              question: interactive['question']?.toString(),
            ),
          ),
        ],
      ],
    );
  }
}