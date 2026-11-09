import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { RecallAuditController } from '../../src/modules/memory/recall-audit.controller';
import { RecallAuditService } from '../../src/modules/memory/recall-audit.service';
import type { RecallAudit } from '../../src/modules/memory/recall-audit.entity';

const NOW = new Date('2026-11-08T12:00:00.000Z');

function row(over: Partial<RecallAudit>): RecallAudit {
  return {
    id: 1,
    childId: 7,
    tool: 'recall',
    outcome: 'hit',
    reason: null,
    hits: 1,
    latencyMs: 10,
    query: '上次那只霸王龙',
    createdAt: NOW,
    ...over,
  } as RecallAudit;
}

function build(rows: RecallAudit[], env: Record<string, string> = {}) {
  let deleted: any = null;
  let findWhere: any = null;
  const repo = {
    find: async (opts: any) => {
      findWhere = opts;
      return rows;
    },
    delete: async (where: any) => {
      deleted = where;
      return { affected: 2 };
    },
  } as unknown as Repository<RecallAudit>;
  const config = {
    get: (key: string, fallback?: any) => env[key] ?? fallback,
  } as unknown as ConfigService;
  const service = new RecallAuditService(repo, config);
  return { service, repo, config, getDeleted: () => deleted, getFindWhere: () => findWhere };
}

describe('RecallAuditService', () => {
  it('aggregates call rate, hit rate, rejection reasons and latency', async () => {
    const { service } = build([
      row({ outcome: 'hit', latencyMs: 10, createdAt: new Date('2026-11-07T09:00:00Z') }),
      row({ outcome: 'miss', latencyMs: 20, createdAt: new Date('2026-11-07T10:00:00Z') }),
      row({ outcome: 'hit', latencyMs: 30, createdAt: new Date('2026-11-08T09:00:00Z') }),
      row({ tool: 'save', outcome: 'stored', latencyMs: 40 }),
      row({ tool: 'save', outcome: 'rejected', reason: 'low_confidence', latencyMs: 50 }),
      row({ tool: 'save', outcome: 'rejected', reason: 'low_confidence', latencyMs: 60 }),
      row({ tool: 'save', outcome: 'rejected', reason: 'duplicate_today', latencyMs: 70 }),
      row({ outcome: 'first_day', latencyMs: 80 }),
    ]);

    const s = await service.summarize(7, 14, NOW);

    expect(s.totalCalls).toBe(8);
    expect(s.byTool).toEqual({ recall: 4, save: 4 });
    expect(s.hitRate).toBe(0.667);
    expect(s.missRate).toBe(0.333);
    expect(s.saveRejections).toEqual([
      { reason: 'low_confidence', count: 2 },
      { reason: 'duplicate_today', count: 1 },
    ]);
    expect(s.daily).toEqual([
      { date: '2026-11-07', calls: 2, hits: 1, misses: 1 },
      { date: '2026-11-08', calls: 6, hits: 1, misses: 0 },
    ]);
    expect(s.latencyMs.avg).toBe(45);
    expect(s.latencyMs.p95).toBe(80);
    expect(s.purgedRows).toBe(2);
  });

  it('never leaks the truncated query text', async () => {
    const { service } = build([row({})]);
    const json = JSON.stringify(await service.summarize(7, 14, NOW));
    expect(json).not.toContain('霸王龙');
    expect(json).not.toContain('query');
  });

  it('returns null rates when there were no recall decisions', async () => {
    const { service } = build([row({ tool: 'save', outcome: 'stored' })]);
    const s = await service.summarize(7, 14, NOW);
    expect(s.hitRate).toBeNull();
    expect(s.missRate).toBeNull();
    expect(s.latencyMs.avg).toBe(10);
  });

  it('returns an empty, well-formed summary for a quiet child', async () => {
    const { service } = build([]);
    const s = await service.summarize(7, 14, NOW);
    expect(s.totalCalls).toBe(0);
    expect(s.daily).toEqual([]);
    expect(s.saveRejections).toEqual([]);
    expect(s.latencyMs).toEqual({ avg: null, p95: null });
  });

  it('clamps the requested window and purges to the configured retention', async () => {
    const { service, getDeleted } = build([], { MEMORY_AUDIT_RETENTION_DAYS: '7' });
    const s = await service.summarize(7, 999, NOW);
    expect(s.windowDays).toBe(90);
    expect(s.retentionDays).toBe(7);
    expect(getDeleted().createdAt.value.getTime()).toBe(NOW.getTime() - 7 * 86_400_000);

    const short = await service.summarize(7, 0, NOW);
    expect(short.windowDays).toBe(1);
  });

  it('does not fail the read when cleanup fails', async () => {
    const { service, repo } = build([row({})]);
    (repo as any).delete = async () => {
      throw new Error('read-only replica');
    };
    const s = await service.summarize(7, 14, NOW);
    expect(s.purgedRows).toBe(0);
    expect(s.totalCalls).toBe(1);
  });
});

describe('RecallAuditController', () => {
  function controller(allowed: boolean) {
    const audits = { summarize: jest.fn().mockResolvedValue({ totalCalls: 3 }) };
    const users = { canAccessChild: jest.fn().mockResolvedValue(allowed) };
    return {
      controller: new RecallAuditController(audits as any, users as any),
      audits,
      users,
    };
  }

  it('returns the summary for the owning parent', async () => {
    const { controller: c, audits, users } = controller(true);
    const result = await c.summary('7', { user: { sub: 1, type: 'parent' } }, '30');
    expect(result).toEqual({ totalCalls: 3 });
    expect(users.canAccessChild).toHaveBeenCalledWith(1, 'parent', 7);
    expect(audits.summarize).toHaveBeenCalledWith(7, 30);
  });

  it('denies child accounts even for their own id', async () => {
    const { controller: c, audits } = controller(true);
    await expect(c.summary('7', { user: { sub: 7, type: 'child' } })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(audits.summarize).not.toHaveBeenCalled();
  });

  it("denies a parent asking about someone else's child", async () => {
    const { controller: c, audits } = controller(false);
    await expect(c.summary('99', { user: { sub: 1, type: 'parent' } })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(audits.summarize).not.toHaveBeenCalled();
  });

  it('rejects a malformed childId before touching the database', async () => {
    const { controller: c, users } = controller(true);
    await expect(c.summary('abc', { user: { sub: 1, type: 'parent' } })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(users.canAccessChild).not.toHaveBeenCalled();
  });
});
