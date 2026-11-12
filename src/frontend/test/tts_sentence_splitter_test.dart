import 'package:flutter_test/flutter_test.dart';
import 'package:lingxi_companion/utils/tts_sentence_splitter.dart';

void main() {
  group('TtsSentenceSplitter.split', () {
    test('pure English sentence uses the English voice with enRate', () {
      final segments = TtsSentenceSplitter.split('Say apple!', enRate: '-10%');
      expect(segments, hasLength(1));
      expect(segments[0].text, 'Say apple!');
      expect(segments[0].voice, TtsSentenceSplitter.enVoice);
      expect(segments[0].rate, '-10%');
    });

    test('pure Chinese sentence uses the Chinese voice with null rate', () {
      final segments = TtsSentenceSplitter.split('你好呀！', enRate: '+12%');
      expect(segments, hasLength(1));
      expect(segments[0].text, '你好呀！');
      expect(segments[0].voice, TtsSentenceSplitter.zhVoice);
      expect(segments[0].rate, isNull);
    });

    test('splits mixed replies per sentence and classifies each by CJK', () {
      final segments = TtsSentenceSplitter.split('Hello! 你好呀！Say apple!', enRate: '+0%');
      expect(segments.map((s) => s.text).toList(), ['Hello!', '你好呀！', 'Say apple!']);
      expect(segments.map((s) => s.voice).toList(), [
        TtsSentenceSplitter.enVoice,
        TtsSentenceSplitter.zhVoice,
        TtsSentenceSplitter.enVoice,
      ]);
      expect(segments.map((s) => s.rate).toList(), ['+0%', null, '+0%']);
    });

    test('a Chinese sentence with embedded English words stays on the Chinese voice', () {
      final segments = TtsSentenceSplitter.split('苹果就是 apple 哦。', enRate: '-10%');
      expect(segments, hasLength(1));
      expect(segments[0].voice, TtsSentenceSplitter.zhVoice);
      expect(segments[0].rate, isNull);
      expect(segments[0].text, '苹果就是 apple 哦。');
    });

    test('groups consecutive sentence-ending punctuation into one segment', () {
      final segments = TtsSentenceSplitter.split('Hello!! 你好。');
      expect(segments.map((s) => s.text).toList(), ['Hello!!', '你好。']);
    });

    test('captures a trailing sentence without punctuation', () {
      final segments = TtsSentenceSplitter.split('Good job');
      expect(segments, hasLength(1));
      expect(segments[0].text, 'Good job');
      expect(segments[0].voice, TtsSentenceSplitter.enVoice);
    });

    test('defaults enRate to null for English segments when not supplied', () {
      final segments = TtsSentenceSplitter.split('Hello!');
      expect(segments[0].rate, isNull);
    });

    test('returns an empty list for empty or whitespace-only input', () {
      expect(TtsSentenceSplitter.split(''), isEmpty);
      expect(TtsSentenceSplitter.split('   '), isEmpty);
    });

    test('handles ellipsis and question marks as sentence boundaries', () {
      final segments = TtsSentenceSplitter.split('What is this? 这是苹果…');
      expect(segments.map((s) => s.text).toList(), ['What is this?', '这是苹果…']);
      expect(segments[0].voice, TtsSentenceSplitter.enVoice);
      expect(segments[1].voice, TtsSentenceSplitter.zhVoice);
    });
  });
}