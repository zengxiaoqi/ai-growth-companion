/**
 * Single source of truth for the chat-mode enumeration.
 * Mirrors ACTIVITY_TYPES: const tuple → union → Set → guard. normalizeChatMode
 * replaces the duplicated mode ternaries in ai.controller and ai.service.
 *
 * Maintained in parallel with src/frontend/lib/utils/chat_mode.dart.
 */

export const CHAT_MODES = ['default', 'casual', 'english'] as const;

export type ChatMode = (typeof CHAT_MODES)[number];

export const CHAT_MODE_SET: ReadonlySet<string> = new Set<string>(CHAT_MODES);

export function isChatMode(value: unknown): value is ChatMode {
  return typeof value === 'string' && CHAT_MODE_SET.has(value);
}

/** Unknown / undefined → 'default'; never throws. */
export function normalizeChatMode(raw: unknown): ChatMode {
  return isChatMode(raw) ? raw : 'default';
}