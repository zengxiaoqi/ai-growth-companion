/// Single source of truth for the chat-mode enumeration on the client.
/// Mirrors src/backend/src/agent-framework/core/types/chat-mode.ts.
library;

enum ChatMode { defaultMode, casual, english }

extension ChatModeX on ChatMode {
  String get wire => switch (this) {
        ChatMode.defaultMode => 'default',
        ChatMode.casual => 'casual',
        ChatMode.english => 'english',
      };

  bool get isEnglish => this == ChatMode.english;
  bool get isCasual => this == ChatMode.casual;
}

/// Unknown / null → defaultMode; never throws.
ChatMode chatModeFromWire(String? raw) => switch (raw) {
      'english' => ChatMode.english,
      'casual' => ChatMode.casual,
      _ => ChatMode.defaultMode,
    };