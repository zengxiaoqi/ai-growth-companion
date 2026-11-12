import 'package:flutter_test/flutter_test.dart';
import 'package:lingxi_companion/utils/chat_mode.dart';

void main() {
  test('wire round-trips for every mode', () {
    for (final mode in ChatMode.values) {
      expect(chatModeFromWire(mode.wire), mode);
    }
  });

  test('wire values', () {
    expect(ChatMode.defaultMode.wire, 'default');
    expect(ChatMode.casual.wire, 'casual');
    expect(ChatMode.english.wire, 'english');
  });

  test('chatModeFromWire is tolerant', () {
    expect(chatModeFromWire(null), ChatMode.defaultMode);
    expect(chatModeFromWire('bogus'), ChatMode.defaultMode);
    expect(chatModeFromWire('english'), ChatMode.english);
    expect(chatModeFromWire('casual'), ChatMode.casual);
  });

  test('predicates', () {
    expect(ChatMode.english.isEnglish, isTrue);
    expect(ChatMode.english.isCasual, isFalse);
    expect(ChatMode.casual.isCasual, isTrue);
    expect(ChatMode.defaultMode.isEnglish, isFalse);
    expect(ChatMode.defaultMode.isCasual, isFalse);
  });
}