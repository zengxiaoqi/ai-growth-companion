import 'package:flutter/material.dart';

import '../../../theme/app_theme.dart';
import '../../../services/tts_service.dart';

/// 古诗卡：逐句朗读 + 当前句高亮 + 诗意解读。
class PoemCard extends StatefulWidget {
  final String title;
  final String poet;
  final String content;
  final String meaning;

  const PoemCard({
    super.key,
    required this.title,
    this.poet = '',
    required this.content,
    this.meaning = '',
  });

  @override
  State<PoemCard> createState() => _PoemCardState();
}

class _PoemCardState extends State<PoemCard> {
  final TtsService _tts = TtsService();
  bool _isPlaying = false;
  int _currentLine = -1;

  List<String> get _lines {
    final lines = <String>[];
    for (final match
        in RegExp(r'[^。，！？、\n]+[。，！？、]?').allMatches(widget.content)) {
      final line = match.group(0)!.trim();
      if (line.isNotEmpty) lines.add(line);
    }
    return lines.isEmpty ? [widget.content] : lines;
  }

  Future<void> _toggleTts() async {
    if (_isPlaying) {
      await _tts.stop();
      if (mounted) {
        setState(() {
          _isPlaying = false;
          _currentLine = -1;
        });
      }
      return;
    }

    final lines = _lines;
    setState(() {
      _isPlaying = true;
      _currentLine = 0;
    });

    // 先读标题和作者，再逐句朗读（与诗歌详情页同一套循环模式）。
    final header = widget.poet.isEmpty
        ? widget.title
        : '${widget.title}。${widget.poet}';
    try {
      await _tts.speak(header);
      await _tts.onComplete;
    } catch (_) {}

    for (var i = 0; i < lines.length; i++) {
      if (!mounted || !_isPlaying) break;
      setState(() => _currentLine = i);
      try {
        await _tts.speak(lines[i]);
        await _tts.onComplete;
      } catch (_) {
        break;
      }
      await Future.delayed(const Duration(milliseconds: 350));
    }

    if (mounted) {
      setState(() {
        _isPlaying = false;
        _currentLine = -1;
      });
    }
  }

  @override
  void dispose() {
    _tts.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppTheme.active;
    final lines = _lines;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.title,
                    style: TextStyle(
                      fontSize: 19,
                      fontWeight: FontWeight.w800,
                      color: palette.ink,
                    ),
                  ),
                  if (widget.poet.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        widget.poet,
                        style: TextStyle(fontSize: 12, color: palette.ink2),
                      ),
                    ),
                ],
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
        const SizedBox(height: 12),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: palette.pop.withValues(alpha: 0.05),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (var i = 0; i < lines.length; i++)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: i == _currentLine
                          ? palette.pop.withValues(alpha: 0.16)
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      lines[i],
                      style: TextStyle(
                        fontSize: 18,
                        height: 1.6,
                        fontWeight: i == _currentLine
                            ? FontWeight.w800
                            : FontWeight.w600,
                        color: palette.ink,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        if (widget.meaning.isNotEmpty) ...[
          const SizedBox(height: 10),
          Text(
            '📝 ${widget.meaning}',
            style: TextStyle(
              fontSize: 13,
              height: 1.7,
              color: palette.ink2,
            ),
          ),
        ],
      ],
    );
  }
}