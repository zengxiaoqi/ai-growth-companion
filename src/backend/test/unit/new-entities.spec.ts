import { DataSource } from 'typeorm';
import { Conversation, ConversationMessage } from '../../src/database/entities/conversation.entity';
import { CareCue } from '../../src/modules/care/care-cue.entity';
import { Memory } from '../../src/modules/memory/memory.entity';
import { RecallAudit } from '../../src/modules/memory/recall-audit.entity';
import { SafetyEvent } from '../../src/modules/safety/safety-event.entity';

/**
 * The new entities have to survive a real database, not just the type
 * checker. This runs TypeORM against in-memory SQLite — the development
 * path — and writes one row per table, which is what catches the classic
 * cross-dialect mistakes (`simple-json` on a driver that cannot store it,
 * a nullable column that is not, an index on a missing property).
 *
 * PostgreSQL is not exercised here; the migration is written to be
 * dialect-neutral (`text` for JSON, `varchar(10)` for dates,
 * `CURRENT_TIMESTAMP` for defaults) so the same shapes apply.
 */
describe('new entities on SQLite', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    // `sqljs` rather than `better-sqlite3`: the native bindings are not
    // guaranteed to be built in every environment, and this test is about
    // entity definitions, not about the driver.
    dataSource = new DataSource({
      type: 'sqljs',
      entities: [Memory, RecallAudit, SafetyEvent, CareCue, Conversation, ConversationMessage],
      synchronize: true,
      autoSave: false,
      logging: false,
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('creates all four tables', async () => {
    const rows = await dataSource.query("SELECT name FROM sqlite_master WHERE type = 'table'");
    const tables = rows.map((row: { name: string }) => row.name);
    expect(tables).toEqual(
      expect.arrayContaining(['memories', 'recall_audits', 'safety_events', 'care_cues']),
    );
  });

  it('round-trips a memory, including the JSON columns', async () => {
    const repo = dataSource.getRepository(Memory);
    const saved = await repo.save(
      repo.create({
        childId: 1,
        kind: 'preference',
        content: '孩子最喜欢霸王龙',
        verbatimQuote: '我最喜欢霸王龙',
        confidence: 0.92,
        sensitivity: 'L0',
        occurredAt: '2026-04-10',
        sourceMessageIds: [11, 12],
        vector: [0.1, 0.2, 0.3],
        embedModel: 'test-model',
      }),
    );

    const found = await repo.findOneByOrFail({ id: saved.id });
    expect(found.sourceMessageIds).toEqual([11, 12]);
    expect(found.vector).toEqual([0.1, 0.2, 0.3]);
    expect(found.occurredAt).toBe('2026-04-10');
    expect(found.sensitivity).toBe('L0');
    expect(found.createdAt).toBeInstanceOf(Date);
  });

  it('can exclude L2 with a WHERE clause, the way recall does', async () => {
    const repo = dataSource.getRepository(Memory);
    await repo.save([
      repo.create({
        childId: 2,
        kind: 'detail',
        content: '公开的记忆',
        verbatimQuote: '公开的记忆',
        sensitivity: 'L0',
      }),
      repo.create({
        childId: 2,
        kind: 'detail',
        content: '秘密',
        verbatimQuote: '这是秘密',
        sensitivity: 'L2',
      }),
    ]);

    const visible = await repo
      .createQueryBuilder('m')
      .where('m.childId = :childId', { childId: 2 })
      .andWhere('(m.sensitivity IS NULL OR m.sensitivity <> :secret)', { secret: 'L2' })
      .getMany();

    expect(visible).toHaveLength(1);
    expect(visible[0].content).toBe('公开的记忆');
  });

  it('round-trips a safety event with a nullable parent', async () => {
    const repo = dataSource.getRepository(SafetyEvent);
    const saved = await repo.save(
      repo.create({
        childId: 3,
        category: 'danger',
        level: 'critical',
        source: 'rules',
        excerpt: '…救命…',
        action: 'intercepted',
      }),
    );
    const found = await repo.findOneByOrFail({ id: saved.id });
    expect(found.parentId).toBeNull();
    expect(found.notifiedAt).toBeNull();
    expect(found.excerpt).toBe('…救命…');
  });

  it('round-trips a care cue and its status transitions', async () => {
    const repo = dataSource.getRepository(CareCue);
    const saved = await repo.save(
      repo.create({
        childId: 4,
        memoryId: 1,
        topic: '春游',
        dueAt: '2026-04-09',
        status: 'pending',
      }),
    );
    expect(saved.postponeCount).toBe(0);

    await repo.update(saved.id, { status: 'asked', sentAt: new Date() });
    const found = await repo.findOneByOrFail({ id: saved.id });
    expect(found.status).toBe('asked');
    expect(found.sentAt).toBeInstanceOf(Date);
  });

  it('round-trips a recall audit row', async () => {
    const repo = dataSource.getRepository(RecallAudit);
    const saved = await repo.save(
      repo.create({
        childId: 5,
        tool: 'recall',
        outcome: 'miss',
        reason: null,
        hits: 0,
        latencyMs: 12,
        query: '霸王龙',
      }),
    );
    const found = await repo.findOneByOrFail({ id: saved.id });
    expect(found.outcome).toBe('miss');
    expect(found.reason).toBeNull();
  });
});
