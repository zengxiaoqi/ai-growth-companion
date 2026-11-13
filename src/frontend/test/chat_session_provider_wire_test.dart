import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:lingxi_companion/providers/chat_session_provider.dart';
import 'package:lingxi_companion/services/api_service.dart';

/// Captures the `mode` wire value handed to the SSE endpoint so the text/voice
/// routing asymmetry stays pinned: text non-english sends `null` (full agent
/// routing), voice non-english sends `'casual'` (short spoken replies), english
/// sends `'english'` on both paths. Blanket `.wire` would silently break this.
class _CapturingApiService extends ApiService {
  final List<String?> capturedModes = <String?>[];

  @override
  Future<Map<String, dynamic>?> createAIChatSession() async => {'sessionId': 'sess-1'};

  @override
  Future<List<dynamic>> getAIChatMessages(String sessionId) async => [];

  @override
  Stream<Map<String, dynamic>> sendAIChatMessageStream(
    String message, {
    int? childId,
    int? parentId,
    String? sessionId,
    int? bookId,
    String? bookTitle,
    String? mode,
    bool regenerate = false,
  }) {
    capturedModes.add(mode);
    return Stream<Map<String, dynamic>>.fromIterable([
      {'type': 'token', 'content': 'hi'},
      {'type': 'done', 'sessionId': sessionId ?? 'sess-1'},
    ]);
  }
}

void main() {
  group('voice turn wire mode', () {
    test('non-english sends casual', () async {
      final api = _CapturingApiService();
      final provider = ChatSessionProvider(api);
      await provider.createNewSession();

      await provider.sendVoiceTurn('hello');

      expect(api.capturedModes.single, 'casual');
    });

    test('english sends english', () async {
      final api = _CapturingApiService();
      final provider = ChatSessionProvider(api);
      await provider.createNewSession(mode: 'english');

      await provider.sendVoiceTurn('hello');

      expect(api.capturedModes.single, 'english');
    });
  });

  group('text turn wire mode', () {
    // sendMessage awaits two post-frame callbacks and runs a periodic thinking
    // timer + stream timeout. Under testWidgets' fake clock those continuations
    // are not driven by pump(), so run the whole turn in real async and draw
    // frames manually to release the awaits; real timers then cancel cleanly.
    Future<void> driveTextTurn(WidgetTester tester, ChatSessionProvider provider) async {
      await tester.runAsync(() async {
        final future = provider.sendMessage('hi');
        var done = false;
        unawaited(future.then((_) => done = true));
        for (var i = 0; i < 100 && !done; i++) {
          tester.binding.scheduleFrame();
          tester.binding.handleBeginFrame(Duration.zero);
          tester.binding.handleDrawFrame();
          await Future<void>.delayed(const Duration(milliseconds: 5));
        }
        await future;
      });
    }

    testWidgets('non-english sends null', (tester) async {
      final api = _CapturingApiService();
      final provider = ChatSessionProvider(api);
      await provider.createNewSession();

      await driveTextTurn(tester, provider);

      expect(api.capturedModes.single, isNull);
    });

    testWidgets('english sends english', (tester) async {
      final api = _CapturingApiService();
      final provider = ChatSessionProvider(api);
      await provider.createNewSession(mode: 'english');

      await driveTextTurn(tester, provider);

      expect(api.capturedModes.single, 'english');
    });
  });
}