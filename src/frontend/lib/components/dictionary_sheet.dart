import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../utils/app_logger.dart';
import '../services/public_api_service.dart';

final _log = AppLogger('DictionarySheet');

/// 词典查词弹窗
///
/// 调用后端 `/api/public/dictionary/:word` 获取 Free Dictionary API 数据，
/// 展示：单词、音标、发音（点击 🔊 播 audio url）、词性 + 释义 + 例句。
///
/// 用法：
/// ```dart
/// DictionarySheet.show(context, word: 'hello');
/// // 或在文本上长按，传入选中文本
/// ```
class DictionarySheet extends StatefulWidget {
  final String word;

  const DictionarySheet({super.key, required this.word});

  /// 便捷入口：以 bottom sheet 形式弹出
  static void show(BuildContext context, {required String word}) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => DictionarySheet(word: word.toLowerCase().trim()),
    );
  }

  @override
  State<DictionarySheet> createState() => _DictionarySheetState();
}

class _DictionarySheetState extends State<DictionarySheet> {
  List<dynamic>? _entries;
  bool _loading = true;
  String? _error;
  bool _notFound = false;

  // 音频播放
  final AudioPlayer _player = AudioPlayer();
  bool _playing = false;
  String? _playingUrl;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _player.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final list = await PublicApiService.instance.getDictionaryEntry(widget.word);
      if (!mounted) return;
      if (list == null || list.isEmpty) {
        setState(() {
          _notFound = true;
          _loading = false;
        });
        return;
      }
      setState(() {
        _entries = list;
        _loading = false;
      });
    } catch (e) {
      _log.warning('DictionarySheet load failed: $e');
      if (!mounted) return;
      setState(() {
        _error = '查询失败：$e';
        _loading = false;
      });
    }
  }

  Future<void> _playAudio(String url) async {
    if (url.isEmpty) return;
    if (_playing && _playingUrl == url) {
      await _player.stop();
      setState(() => _playing = false);
      return;
    }
    try {
      setState(() {
        _playing = true;
        _playingUrl = url;
      });
      await _player.play(UrlSource(url));
    } catch (e) {
      _log.warning('Audio play failed: $e');
      if (!mounted) return;
      setState(() => _playing = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('发音播放失败：$e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.of(context).size.height;
    return Container(
      height: screenHeight * 0.75,
      margin: const EdgeInsets.all(8),
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFFFF8E8), Colors.white],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
        borderRadius: BorderRadius.circular(28),
      ),
      child: Column(
        children: [
          // 顶部 drag handle
          Center(
            child: Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          // 标题栏：单词 + 关闭
          Row(
            children: [
              const Text('📖', style: TextStyle(fontSize: 22)),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  '词典查询',
                  style: TextStyle(
                    fontSize: 14,
                    color: AppTheme.textSecondary,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close, color: AppTheme.textSecondary),
                onPressed: () => Navigator.pop(context),
              ),
            ],
          ),
          const Divider(height: 1),
          const SizedBox(height: 12),
          Expanded(child: _buildBody()),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(color: AppTheme.primaryColor),
            SizedBox(height: 12),
            Text(
              '正在查词...',
              style: TextStyle(color: AppTheme.textSecondary, fontSize: 14),
            ),
          ],
        ),
      );
    }

    if (_notFound) {
      return _buildNotFound();
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('⚠️', style: TextStyle(fontSize: 48)),
            const SizedBox(height: 12),
            Text(
              _error!,
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppTheme.textSecondary),
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () {
                setState(() {
                  _loading = true;
                  _error = null;
                });
                _load();
              },
              child: const Text('重试'),
            ),
          ],
        ),
      );
    }

    final entries = _entries ?? const [];
    return ListView.builder(
      itemCount: entries.length,
      itemBuilder: (ctx, i) => _buildEntry(entries[i] as Map),
    );
  }

  Widget _buildNotFound() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('🔍', style: TextStyle(fontSize: 56)),
          const SizedBox(height: 16),
          Text(
            '未找到 "$_wordText"',
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: AppTheme.textColor,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            '可能是拼写有误，或者这个词不在词典中。',
            style: TextStyle(color: AppTheme.textSecondary, fontSize: 13),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          const Text(
            '💡 小提示',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: AppTheme.primaryColor,
            ),
          ),
          const SizedBox(height: 8),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 24),
            child: Text(
              '英文单词记得全部小写哦！比如查询 "hello" 而不是 "Hello"。',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: AppTheme.textSecondary),
            ),
          ),
        ],
      ),
    );
  }

  String get _wordText => widget.word;

  Widget _buildEntry(Map entry) {
    final word = entry['word'] as String? ?? widget.word;
    final phonetics = (entry['phonetics'] as List?) ?? const [];
    final meanings = (entry['meanings'] as List?) ?? const [];
    // 找一个有 audio 的音标
    final phoneticWithAudio = phonetics.firstWhere(
      (p) => (p['audio'] as String?)?.isNotEmpty == true,
      orElse: () => null,
    );
    final audioUrl = (phoneticWithAudio?['audio'] as String?) ?? '';
    final phoneticText = phonetics
        .map((p) => (p['text'] as String?) ?? '')
        .firstWhere((t) => t.isNotEmpty, orElse: () => '');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 单词行
        Row(
          children: [
            Expanded(
              child: Text(
                word,
                style: const TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.textColor,
                ),
              ),
            ),
            if (audioUrl.isNotEmpty)
              IconButton(
                icon: Icon(
                  _playing && _playingUrl == audioUrl
                      ? Icons.pause_circle_filled
                      : Icons.volume_up_rounded,
                  color: AppTheme.primaryColor,
                  size: 32,
                ),
                onPressed: () => _playAudio(audioUrl),
              ),
          ],
        ),
        if (phoneticText.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(left: 2, bottom: 12),
            child: Text(
              phoneticText,
              style: TextStyle(
                fontSize: 16,
                color: Colors.grey.shade600,
                fontStyle: FontStyle.italic,
              ),
            ),
          ),
        // 词性 + 释义
        ...meanings.map((m) => _buildMeaning(m as Map)),
        const SizedBox(height: 16),
        const Divider(),
        const SizedBox(height: 8),
      ],
    );
  }

  Widget _buildMeaning(Map m) {
    final partOfSpeech = m['partOfSpeech'] as String? ?? '';
    final definitions = (m['definitions'] as List?) ?? const [];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          margin: const EdgeInsets.only(top: 12, bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: AppTheme.primaryColor.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(
            _posLabel(partOfSpeech),
            style: const TextStyle(
              fontSize: 13,
              color: AppTheme.primaryColor,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        ...definitions.take(3).map((d) => _buildDefinition(d as Map)),
      ],
    );
  }

  Widget _buildDefinition(Map d) {
    final definition = d['definition'] as String? ?? '';
    final example = d['example'] as String?;
    final synonyms = (d['synonyms'] as List?) ?? const [];

    return Padding(
      padding: const EdgeInsets.only(left: 8, bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('•', style: TextStyle(fontSize: 14, color: AppTheme.textSecondary)),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  definition,
                  style: const TextStyle(
                    fontSize: 14,
                    color: AppTheme.textColor,
                    height: 1.5,
                  ),
                ),
              ),
            ],
          ),
          if (example != null && example.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(left: 14, top: 2),
              child: Text(
                '例：$example',
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey.shade600,
                  fontStyle: FontStyle.italic,
                ),
              ),
            ),
          if (synonyms.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(left: 14, top: 2),
              child: Wrap(
                spacing: 6,
                runSpacing: 2,
                children: synonyms
                    .take(5)
                    .map((s) => Text(
                          '$s',
                          style: TextStyle(
                            fontSize: 11,
                            color: AppTheme.secondaryColor,
                          ),
                        ))
                    .toList(),
              ),
            ),
        ],
      ),
    );
  }

  String _posLabel(String pos) {
    const labels = {
      'noun': 'n. 名词',
      'verb': 'v. 动词',
      'adjective': 'adj. 形容词',
      'adverb': 'adv. 副词',
      'pronoun': 'pron. 代词',
      'preposition': 'prep. 介词',
      'conjunction': 'conj. 连词',
      'interjection': 'interj. 感叹词',
      'determiner': 'det. 限定词',
      'exclamation': 'excl. 感叹词',
    };
    return labels[pos] ?? pos;
  }
}
