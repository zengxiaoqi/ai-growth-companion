import { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { MemoryWriteService } from '../../src/modules/memory/memory-write.service';
import type { Memory } from '../../src/modules/memory/memory.entity';
import type { MemoryVectorService } from '../../src/modules/memory/memory-vector.service';
import type {
  Conversation,
  ConversationMessage,
} from '../../src/database/entities/conversation.entity';

interface Saved {
  rows: any[];
}

const CHILD_TURNS = [
  { id: 11, content: '我最喜欢霸王龙，尤其是三角龙' },
  { id: 12, content: '这是我们的秘密，别告诉妈妈' },
];

function buildService(
  options: {
    turns?: Array<{ id: number; content: string }>;
    duplicate?: boolean;
    sessionExists?: boolean;
    env?: Record<string, string>;
  } = {},
): { service: MemoryWriteService; saved: Saved } {
  const saved: Saved = { rows: [] };
  const memoryRepo = {
    create: (entity: any) => entity,
    save: async (entity: any) => {
      saved.rows.push(entity);
      return { ...entity, id: 42 };
    },
    findOne: async () => (options.duplicate ? { id: 7 } : null),
  } as unknown as Repository<Memory>;

  const conversationRepo = {
    findOne: async () =>
      options.sessionExists === false ? null : ({ id: 7, uuid: 'session-uuid' } as Conversation),
  } as unknown as Repository<Conversation>;

  const messageRepo = {
    find: async () => (options.turns ?? CHILD_TURNS) as ConversationMessage[],
  } as unknown as Repository<ConversationMessage>;

  const vectorService = {
    enabled: false,
    model: '',
    embed: async () => null,
  } as unknown as MemoryVectorService;

  const config = {
    get: (key: string, fallback?: string) => options.env?.[key] ?? fallback,
  } as unknown as ConfigService;

  return {
    service: new MemoryWriteService(
      memoryRepo,
      conversationRepo,
      messageRepo,
      vectorService,
      config,
    ),
    saved,
  };
}

/**
 * The four gates, one assertion group each. These are the product promise
 * turned into code: "every quote is real", "a secret stays a secret",
 * "one memory per thing per day".
 *
 * Ported from 碎碎念's `tests/memory/test_extract.py`.
 */
describe('MemoryWriteService — the four gates', () => {
  it('gate 1: discards a low-confidence candidate', async () => {
    const { service, saved } = buildService();
    const result = await service.save({
      childId: 1,
      sessionId: 'session-uuid',
      content: '孩子喜欢霸王龙',
      verbatimQuote: '我最喜欢霸王龙',
      confidence: 0.5,
    });
    expect(result).toEqual({ stored: false, reason: 'low_confidence' });
    expect(saved.rows).toHaveLength(0);
  });

  it('gate 2: discards a quote the child never said', async () => {
    const { service, saved } = buildService();
    const result = await service.save({
      childId: 1,
      sessionId: 'session-uuid',
      content: '孩子养了一只喷火龙',
      verbatimQuote: '我养了一只喷火龙',
      confidence: 0.95,
    });
    expect(result).toEqual({ stored: false, reason: 'quote_mismatch' });
    expect(saved.rows).toHaveLength(0);
  });

  it('gate 2: stores the transcript’s own slice, not the model’s version', async () => {
    const { service, saved } = buildService();
    const result = await service.save({
      childId: 1,
      sessionId: 'session-uuid',
      content: '孩子最喜欢霸王龙，尤其是三角龙',
      // The model dropped the comma, so only the normalized tier matches —
      // and what gets stored is the transcript's punctuation, not the
      // model's tidier version.
      verbatimQuote: '我最喜欢霸王龙尤其是三角龙',
      confidence: 0.9,
    });
    expect(result.stored).toBe(true);
    expect(result.tier).toBe('normalized');
    expect(result.resolvedQuote).toBe('我最喜欢霸王龙，尤其是三角龙');
    expect(saved.rows[0].verbatimQuote).toBe('我最喜欢霸王龙，尤其是三角龙');
  });

  it('gate 2: refuses to store anything when the conversation is unknown', async () => {
    const { service } = buildService({ sessionExists: false });
    const result = await service.save({
      childId: 1,
      sessionId: 'unknown-session',
      content: '孩子喜欢霸王龙',
      verbatimQuote: '我最喜欢霸王龙',
    });
    expect(result).toEqual({ stored: false, reason: 'no_session' });
  });

  it('gate 3: forces L2 when the child asked for secrecy, whatever the model claimed', async () => {
    const { service, saved } = buildService();
    const result = await service.save({
      childId: 1,
      sessionId: 'session-uuid',
      content: '孩子说了一件事并要求保密',
      verbatimQuote: '这是我们的秘密',
      sensitivity: 'L0', // the model disagrees; the code wins
    });
    expect(result.stored).toBe(true);
    expect(result.sensitivity).toBe('L2');
    expect(saved.rows[0].sensitivity).toBe('L2');
  });

  it('gate 3: keeps a non-secret at the declared level', async () => {
    const { service, saved } = buildService();
    await service.save({
      childId: 1,
      sessionId: 'session-uuid',
      content: '孩子最喜欢霸王龙',
      verbatimQuote: '我最喜欢霸王龙',
      sensitivity: 'L1',
    });
    expect(saved.rows[0].sensitivity).toBe('L1');
  });

  it('gate 4: refuses the same content twice in one day', async () => {
    const { service, saved } = buildService({ duplicate: true });
    const result = await service.save({
      childId: 1,
      sessionId: 'session-uuid',
      content: '孩子最喜欢霸王龙',
      verbatimQuote: '我最喜欢霸王龙',
    });
    expect(result).toEqual({ stored: false, reason: 'duplicate' });
    expect(saved.rows).toHaveLength(0);
  });

  it('rejects an empty content before anything else', async () => {
    const { service } = buildService();
    const result = await service.save({
      childId: 1,
      sessionId: 'session-uuid',
      content: '   ',
      verbatimQuote: '我最喜欢霸王龙',
    });
    expect(result).toEqual({ stored: false, reason: 'empty_content' });
  });

  it('points the memory back at the message it came from', async () => {
    const { service, saved } = buildService();
    await service.save({
      childId: 1,
      sessionId: 'session-uuid',
      content: '孩子最喜欢霸王龙',
      verbatimQuote: '我最喜欢霸王龙',
    });
    expect(saved.rows[0].sourceMessageIds).toEqual([11]);
  });

  it('drops an unparseable date instead of guessing', async () => {
    const { service, saved } = buildService();
    await service.save({
      childId: 1,
      sessionId: 'session-uuid',
      content: '孩子下周四要去春游',
      verbatimQuote: '我最喜欢霸王龙',
      kind: 'event',
      occurredAt: '下周四',
    });
    expect(saved.rows[0].occurredAt).toBeNull();
  });

  it('keeps a real date', async () => {
    const { service, saved } = buildService();
    await service.save({
      childId: 1,
      sessionId: 'session-uuid',
      content: '春游',
      verbatimQuote: '我最喜欢霸王龙',
      kind: 'event',
      occurredAt: '2026-04-10',
    });
    expect(saved.rows[0].occurredAt).toBe('2026-04-10');
  });
});
