import {
  CHAT_MODES,
  CHAT_MODE_SET,
  isChatMode,
  normalizeChatMode,
} from '../../src/agent-framework/core/types/chat-mode';

describe('chat-mode registry', () => {
  it('pins the canonical mode list', () => {
    expect([...CHAT_MODES]).toEqual(['default', 'casual', 'english']);
  });

  it('isChatMode guards members', () => {
    expect(isChatMode('casual')).toBe(true);
    expect(isChatMode('english')).toBe(true);
    expect(isChatMode('default')).toBe(true);
    expect(isChatMode('bogus')).toBe(false);
    expect(isChatMode(undefined)).toBe(false);
  });

  it('CHAT_MODE_SET matches the tuple', () => {
    expect(CHAT_MODE_SET.size).toBe(CHAT_MODES.length);
  });

  it('normalizeChatMode passes casual/english/default through', () => {
    expect(normalizeChatMode('casual')).toBe('casual');
    expect(normalizeChatMode('english')).toBe('english');
    expect(normalizeChatMode('default')).toBe('default');
  });

  it('normalizeChatMode maps unknown/undefined/null to default', () => {
    expect(normalizeChatMode(undefined)).toBe('default');
    expect(normalizeChatMode(null)).toBe('default');
    expect(normalizeChatMode('bogus')).toBe('default');
    expect(normalizeChatMode(42)).toBe('default');
  });

  it('is equivalent to the legacy ternary', () => {
    const legacy = (mode?: string) =>
      mode === 'casual' ? 'casual' : mode === 'english' ? 'english' : 'default';
    for (const raw of ['casual', 'english', 'default', 'bogus', undefined]) {
      expect(normalizeChatMode(raw)).toBe(legacy(raw));
    }
  });
});