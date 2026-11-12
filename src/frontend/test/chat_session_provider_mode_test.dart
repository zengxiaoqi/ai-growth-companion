import 'package:flutter_test/flutter_test.dart';
import 'package:lingxi_companion/providers/chat_session_provider.dart';
import 'package:lingxi_companion/services/api_service.dart';

/// Minimal fake: only the two endpoints the mode transitions touch.
class _FakeApiService extends ApiService {
  Map<String, dynamic>? createResult = {'sessionId': 'sess-1'};
  List<dynamic> messagesResult = [];

  @override
  Future<Map<String, dynamic>?> createAIChatSession() async => createResult;

  @override
  Future<List<dynamic>> getAIChatMessages(String sessionId) async => messagesResult;
}

void main() {
  group('ChatSessionSummary.fromJson chatMode', () {
    test('reads english from session metadata', () {
      final s = ChatSessionSummary.fromJson({
        'uuid': 'u1',
        'title': '英语陪练',
        'metadata': {'chatMode': 'english'},
      });
      expect(s.chatMode, 'english');
    });

    test('defaults to default when metadata is missing', () {
      final s = ChatSessionSummary.fromJson({'uuid': 'u1', 'title': 't'});
      expect(s.chatMode, 'default');
    });

    test('defaults to default when chatMode is absent in metadata', () {
      final s = ChatSessionSummary.fromJson({'uuid': 'u1', 'metadata': {}});
      expect(s.chatMode, 'default');
    });

    test('defaults to default when metadata is not a map', () {
      final s = ChatSessionSummary.fromJson({'uuid': 'u1', 'metadata': 'english'});
      expect(s.chatMode, 'default');
    });
  });

  group('ChatSessionProvider mode transitions', () {
    late _FakeApiService api;
    late ChatSessionProvider provider;

    setUp(() {
      api = _FakeApiService();
      provider = ChatSessionProvider(api);
    });

    test('starts in default mode with no english level', () {
      expect(provider.chatMode, 'default');
      expect(provider.isEnglishMode, isFalse);
      expect(provider.englishLevel, isNull);
    });

    test('createNewSession(mode: english) enters english mode with a Coco greeting', () async {
      await provider.createNewSession(mode: 'english');

      expect(provider.isEnglishMode, isTrue);
      expect(provider.chatMode, 'english');
      expect(provider.activeSession?.title, '英语陪练');
      expect(provider.activeSession?.chatMode, 'english');
      expect(
        provider.localMessages.any(
          (m) => m.role == 'assistant' && m.content.contains('Coco'),
        ),
        isTrue,
      );
    });

    test('createNewSession() exits back to default mode', () async {
      await provider.createNewSession(mode: 'english');
      await provider.createNewSession();

      expect(provider.isEnglishMode, isFalse);
      expect(provider.chatMode, 'default');
    });

    test('switchToSession restores english mode from the summary', () async {
      final englishSession = ChatSessionSummary(
        uuid: 'sess-en',
        title: '英语陪练',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
        chatMode: 'english',
      );

      await provider.switchToSession(englishSession);

      expect(provider.isEnglishMode, isTrue);
      expect(provider.englishLevel, isNull);
    });

    test('switchToSession restores default mode for a normal session', () async {
      await provider.createNewSession(mode: 'english');
      final normal = ChatSessionSummary(
        uuid: 'sess-normal',
        title: '新对话',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
        chatMode: 'default',
      );

      await provider.switchToSession(normal);

      expect(provider.isEnglishMode, isFalse);
      expect(provider.chatMode, 'default');
    });
  });
}