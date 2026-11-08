import { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { CareService } from '../../src/modules/care/care.service';
import type { CareCue } from '../../src/modules/care/care-cue.entity';

function build(options: { cues?: CareCue[]; askedRecently?: number; env?: Record<string, string> } = {}) {
  const rows = options.cues ?? [];
  const saved: CareCue[] = [];
  const updates: Array<{ where: any; patch: any }> = [];
  const repo = {
    create: (entity: any) => entity,
    save: async (entity: any) => {
      saved.push(entity);
      return entity;
    },
    find: async ({ where }: any = {}) =>
      rows.filter((candidate) => {
        // The stub has to honour the SQL predicates the service relies on,
        // otherwise it would happily return a cue that is not due yet.
        if (where?.status && candidate.status !== where.status) return false;
        const dueBefore = where?.dueAt?.value;
        if (dueBefore && candidate.dueAt > dueBefore) return false;
        return true;
      }),
    count: async () => options.askedRecently ?? 0,
    update: async (where: any, patch: any) => {
      updates.push({ where, patch });
      return { affected: 1 };
    },
    findOne: async ({ where }: any) => rows.find((cue) => cue.id === where.id) ?? null,
  } as unknown as Repository<CareCue>;
  const config = {
    get: (key: string, fallback?: string) => options.env?.[key] ?? fallback,
  } as unknown as ConfigService;
  return { service: new CareService(repo, config), saved, updates };
}

function cue(overrides: Partial<CareCue> = {}): CareCue {
  return {
    id: 1,
    childId: 1,
    memoryId: 10,
    topic: '春游',
    dueAt: '2026-04-09',
    status: 'pending',
    postponeCount: 0,
    sentAt: null,
    createdAt: new Date(),
    ...overrides,
  } as CareCue;
}

/**
 * Proactive care is the only part of the system that starts a
 * conversation, so its limits matter more than its features: one question
 * per day, only in the afternoon, and never about something that already
 * happened long ago.
 */
describe('CareService', () => {
  const afternoon = new Date('2026-04-10T16:00:00');
  const morning = new Date('2026-04-10T08:00:00');
  const evening = new Date('2026-04-10T21:30:00');

  it('returns a due cue inside the window', async () => {
    const { service } = build({ cues: [cue({ dueAt: '2026-04-10' })] });
    const result = await service.dueCue(1, afternoon);
    expect(result).not.toBeNull();
    expect(result!.topic).toBe('春游');
    expect(result!.status).toBe('asked');
  });

  it('refuses to open a conversation in the morning', async () => {
    const { service } = build({ cues: [cue({ dueAt: '2026-04-10' })] });
    expect(await service.dueCue(1, morning)).toBeNull();
  });

  it('refuses to open a conversation late at night', async () => {
    const { service } = build({ cues: [cue({ dueAt: '2026-04-10' })] });
    expect(await service.dueCue(1, evening)).toBeNull();
  });

  it('refuses when something was already asked in the last 24 hours', async () => {
    const { service } = build({ cues: [cue({ dueAt: '2026-04-10' })], askedRecently: 1 });
    expect(await service.dueCue(1, afternoon)).toBeNull();
  });

  it('ignores a cue that is not due yet', async () => {
    const { service } = build({ cues: [cue({ dueAt: '2026-04-20' })] });
    expect(await service.dueCue(1, afternoon)).toBeNull();
  });

  it('gives up on a cue that has been postponed too many times', async () => {
    const { service } = build({ cues: [cue({ dueAt: '2026-04-10', postponeCount: 3 })] });
    expect(await service.dueCue(1, afternoon)).toBeNull();
  });

  it('does nothing when the feature is switched off', async () => {
    const { service } = build({
      cues: [cue({ dueAt: '2026-04-10' })],
      env: { CARE_ENABLED: 'false' },
    });
    expect(await service.dueCue(1, afternoon)).toBeNull();
  });

  it('expires stale cues on every open, even outside the care window', async () => {
    // There is no scheduler in this project. `dueCue` owns the cleanup, so
    // a morning chat (which can never open with a cue) still retires one
    // that has gone stale.
    const { service, updates } = build();
    expect(await service.dueCue(1, morning)).toBeNull();
    expect(updates).toHaveLength(1);
    expect(updates[0].patch).toEqual({ status: 'expired' });
    expect(updates[0].where.status).toBe('pending');
  });

  it('does not clean up when the feature is switched off', async () => {
    const { service, updates } = build({ env: { CARE_ENABLED: 'false' } });
    await service.dueCue(1, afternoon);
    expect(updates).toHaveLength(0);
  });

  describe('schedule', () => {
    it('accepts a real date', async () => {
      const { service, saved } = build();
      await service.schedule({ childId: 1, topic: '春游', dueAt: '2026-04-09' });
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({ childId: 1, dueAt: '2026-04-09', status: 'pending' });
    });

    it('refuses a relative or malformed date rather than guessing', async () => {
      const { service, saved } = build();
      await service.schedule({ childId: 1, topic: '春游', dueAt: '下周四' });
      await service.schedule({ childId: 1, topic: '春游', dueAt: '2026-4-9' });
      expect(saved).toHaveLength(0);
    });

    it('refuses an empty topic', async () => {
      const { service, saved } = build();
      await service.schedule({ childId: 1, topic: '  ', dueAt: '2026-04-09' });
      expect(saved).toHaveLength(0);
    });
  });
});
