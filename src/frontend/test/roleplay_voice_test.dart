import 'package:flutter_test/flutter_test.dart';
import 'package:lingxi_companion/utils/roleplay_voice.dart';

void main() {
  group('roleplay voice age adaptation', () {
    test('3-4 岁放慢语速，5-6 岁用自然语速', () {
      expect(roleplayTtsRate('3-4 岁'), '-10%');
      expect(roleplayTtsRate('5-6 岁'), '+0%');
      expect(roleplayTtsRate(''), '+0%');
    });

    test('低龄提示更短更口语化', () {
      expect(roleplayListenHint('3-4 岁'), contains('仔细听'));
      expect(roleplayListenHint('5-6 岁'), contains('认真听'));
      expect(roleplayOptionHint('3-4 岁'), contains('点一点'));
      expect(roleplayOptionHint('5-6 岁'), isNot(contains('点一点')));
    });
  });

  group('roleplayTtsTimeout', () {
    test('短句也有至少 8 秒兜底，避免卡在正在说话', () {
      expect(roleplayTtsTimeout('你好', rate: '+0%'),
          const Duration(seconds: 8));
    });

    test('慢速长句给更长时间但不超过 25 秒', () {
      final slow = roleplayTtsTimeout('小熊说' * 9, rate: '-10%');
      final normal = roleplayTtsTimeout('小熊说' * 9, rate: '+0%');
      expect(slow > normal, isTrue);
      expect(roleplayTtsTimeout('小熊说' * 40, rate: '-10%'),
          const Duration(seconds: 25));
    });
  });
}
