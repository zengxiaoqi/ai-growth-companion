import { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { MemoryRecallService, queryFragments } from '../../src/modules/memory/memory-recall.service';
import type { Memory } from '../../src/modules/memory/memory.entity';
import type { MemoryVectorService } from '../../src/modules/memory/memory-vector.service';

interface Captured {
  wheres: Array<{ sql: string; params?: Record<string, unknown> }>;
}

function memory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: 1,
    childId: 1,
    kind: 'preference',
    content: '孩子最喜欢霸王龙',
    verbatimQuote: '我最喜欢霸王龙',
    confidence: 0.9,
    sensitivity: 'L0',
    occurredAt: null,
    sourceMessageIds: [1],
    vector: null,
    embedModel: null,
    createdAt: new Date(),
    ...overrides,
  } as Memory;
}

function buildService(
  rows: Memory[] | (() => Promise<Memory[]>),
  options: {
    env?: Record<string, string>;
    embed?: (text: string, timeoutMs: number) => Promise<number[] | null>;
  } = {},
): { service: MemoryRecallService; captured: Captured } {
  const captured: Captured = { wheres: [] };
  const qb: any = {
    where(sql: string, params?: Record<string, unknown>) {
      captured.wheres.push({ sql, params });
      return qb;
    },
    andWhere(sql: string, params?: Record<string, unknown>) {
      captured.wheres.push({ sql, params });
      return qb;
    },
    orderBy() {
      return qb;
    },
    take() {
      return qb;
    },
    getMany: typeof rows === 'function' ? rows : async () => rows,
  };
  const repo = { createQueryBuilder: () => qb } as unknown as Repository<Memory>;
  const vectors = {
    enabled: true,
    model: 'test',
    embed: options.embed ?? (async () => null),
  } as unknown as MemoryVectorService;
  const config = {
    get: (key: string, fallback?: string) => options.env?.[key] ?? fallback,
  } as unknown as ConfigService;
  return { service: new MemoryRecallService(repo, vectors, config), captured };
}

/**
 * Recall has four exits and two hard rules:
 *  - L2 is unreachable because the *query* excludes it, not because a
 *    caller remembered to filter;
 *  - a slow or missing semantic channel drops out instead of degrading
 *    the whole recall.
 *
 * Ported from 碎碎念's `tests/memory/test_recall.py`.
 */
describe('MemoryRecallService', () => {
  describe('queryFragments', () => {
    it('cuts a Chinese question into matchable pieces', () => {
      const fragments = queryFragments('还记得我说的霸王龙吗');
      expect(fragments).toContain('霸王');
      expect(fragments).toContain('王龙');
    });

    it('returns an empty list when every window is purely grammatical', () => {
      // Each two-character window is made of function words only.
      expect(queryFragments('的吗呢')).toHaveLength(0);
    });

    it('caps the number of pieces', () => {
      const fragments = queryFragments('霸王龙恐龙三角龙翼龙飞龙', 4);
      expect(fragments).toHaveLength(4);
    });
  });

  describe('the four exits', () => {
    it('first_day when the child has no memories at all', async () => {
      const { service } = buildService([]);
      const result = await service.recall({ childId: 1, query: '霸王龙' });
      expect(result.outcome).toBe('first_day');
      expect(result.hits).toEqual([]);
    });

    it('miss when memories exist but nothing passes the gate', async () => {
      const { service } = buildService([memory({ verbatimQuote: '我最喜欢西瓜', content: '喜欢西瓜' })]);
      const result = await service.recall({ childId: 1, query: '霸王龙' });
      expect(result.outcome).toBe('miss');
    });

    it('hit when the child names the word they used', async () => {
      const { service } = buildService([memory()]);
      const result = await service.recall({ childId: 1, query: '还记得我说的霸王龙吗' });
      expect(result.outcome).toBe('hit');
      expect(result.hits[0].verbatimQuote).toBe('我最喜欢霸王龙');
    });

    it('degraded when the database fails', async () => {
      const { service } = buildService(async () => {
        throw new Error('connection reset');
      });
      const result = await service.recall({ childId: 1, query: '霸王龙' });
      expect(result.outcome).toBe('degraded');
    });

    it('degraded when the database exceeds its deadline', async () => {
      const { service } = buildService(
        () => new Promise<Memory[]>(() => undefined),
        { env: { MEMORY_DB_TIMEOUT_MS: '20' } },
      );
      const result = await service.recall({ childId: 1, query: '霸王龙' });
      expect(result.outcome).toBe('degraded');
    });
  });

  describe('L2 is excluded in SQL', () => {
    it('puts the secrecy tier in the WHERE clause, not in a post-filter', async () => {
      const { service, captured } = buildService([memory()]);
      await service.recall({ childId: 1, query: '霸王龙' });

      const secretClause = captured.wheres.find((entry) =>
        entry.sql.includes('sensitivity'),
      );
      expect(secretClause).toBeDefined();
      expect(secretClause!.params).toMatchObject({ secret: 'L2' });
    });

    it('never surfaces an L2 row even if one reaches the candidate list', async () => {
      const { service } = buildService([
        memory({ sensitivity: 'L2', verbatimQuote: '我最喜欢霸王龙' }),
      ]);
      const result = await service.recall({ childId: 1, query: '霸王龙' });
      expect(result.outcome).toBe('miss');
    });
  });

  describe('the gate rejects grammar-boundary coincidence', () => {
    it('does not answer 「我的鞋放在哪里了」 with the shoe-biting story', async () => {
      const { service } = buildService([
        memory({
          kind: 'detail',
          content: '它最爱咬孩子的鞋带',
          verbatimQuote: '它最爱咬我的鞋带',
        }),
      ]);
      const result = await service.recall({ childId: 1, query: '我的鞋放在哪里了' });
      // 「我的」「的鞋」 both hit, but neither is a content word — this is
      // exactly the false positive the pass rule exists to stop.
      expect(result.outcome).toBe('miss');
    });
  });

  describe('the semantic channel', () => {
    it('drops out silently when the embed call times out', async () => {
      const { service } = buildService([memory()], {
        embed: () => new Promise((resolve) => setTimeout(() => resolve(null), 50)),
        env: { MEMORY_VECTOR_TIMEOUT_MS: '5' },
      });
      // The literal channel already matched, so a dead vector channel must
      // not turn this into `degraded`.
      const result = await service.recall({ childId: 1, query: '霸王龙' });
      expect(result.outcome).toBe('hit');
    });

    it('admits a paraphrase above the cosine floor and refuses one below it', async () => {
      const target = [1, 0, 0];
      const rows = [memory({ verbatimQuote: '我喜欢那个大个子恐龙', content: '喜欢大个子恐龙', vector: target })];

      const above = buildService(rows, { embed: async () => [0.9, 0.1, 0] });
      expect((await above.service.recall({ childId: 1, query: '霸王龙' })).outcome).toBe('hit');

      const below = buildService(rows, { embed: async () => [0, 1, 0] });
      expect((await below.service.recall({ childId: 1, query: '霸王龙' })).outcome).toBe('miss');
    });
  });

  describe('ranking', () => {
    it('orders by the fused score and respects the limit', async () => {
      const rows = [
        memory({ id: 1, verbatimQuote: '霸王龙很凶', content: '霸王龙' }),
        memory({ id: 2, verbatimQuote: '我喜欢霸王龙', content: '霸王龙和三角龙' }),
        memory({ id: 3, verbatimQuote: '三角龙吃草', content: '三角龙' }),
      ];
      const { service } = buildService(rows);
      const result = await service.recall({ childId: 1, query: '霸王龙三角龙', limit: 2 });
      expect(result.outcome).toBe('hit');
      expect(result.hits).toHaveLength(2);
      expect(result.hits[0].score).toBeGreaterThanOrEqual(result.hits[1].score);
    });

    it('lets a dated event inside the window outrank an undated one', async () => {
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      const rows = [
        memory({ id: 1, kind: 'event', verbatimQuote: '下周要去春游', content: '春游', occurredAt: null }),
        memory({ id: 2, kind: 'event', verbatimQuote: '明天要去春游', content: '春游', occurredAt: tomorrow }),
      ];
      const { service } = buildService(rows);
      const result = await service.recall({ childId: 1, query: '春游' });
      expect(result.hits[0].occurredAt).toBe(tomorrow);
    });
  });
});
