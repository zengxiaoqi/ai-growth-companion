/// 中英混合 TTS 切句工具（纯函数，无 Flutter 依赖，便于单测）。
///
/// 英语陪练教练的回复按句以单一语言为主（prompt 已约束）：
/// - 按句末标点 。！？.!?… 切句，保留标点；
/// - 含 CJK 的句子用中文音色整句朗读（中文句最多嵌 2 个英文单词）；
/// - 纯英文句用英文音色，按水平调速（enRate）。
/// 不做句内二次切分，避免韵律破碎。
library;

/// 一个 TTS 播放片段：文本 + 音色 + 语速。
class TtsSegment {
  final String text;
  final String voice;
  final String? rate;

  const TtsSegment({required this.text, required this.voice, this.rate});
}

class TtsSentenceSplitter {
  static const String zhVoice = 'zh-CN-XiaoyiNeural';
  static const String enVoice = 'en-US-AriaNeural';

  /// 句末标点（含省略号）。连续标点归入同一句尾。
  static final RegExp _sentenceRe = RegExp(r'[^。！？.!?…]+[。！？.!?…]*');

  /// CJK 统一表意文字：命中即视为中文句。
  static final RegExp _cjkRe = RegExp(r'[\u4e00-\u9fff]');

  /// 将文本切分为按句的 TTS 片段。
  ///
  /// [enRate] 仅作用于纯英文句（如 L1 '-10%' / L3 '+12%'）；
  /// 中文句 rate 为 null，由 TtsService 走默认语速。
  static List<TtsSegment> split(String text, {String? enRate}) {
    final segments = <TtsSegment>[];
    for (final match in _sentenceRe.allMatches(text)) {
      final sentence = match.group(0)!.trim();
      if (sentence.isEmpty) continue;
      final hasCjk = _cjkRe.hasMatch(sentence);
      segments.add(TtsSegment(
        text: sentence,
        voice: hasCjk ? zhVoice : enVoice,
        rate: hasCjk ? null : enRate,
      ));
    }
    return segments;
  }
}