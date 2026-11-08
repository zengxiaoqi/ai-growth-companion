import 'reflect-metadata';
import { DataSource, getMetadataArgsStorage } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { CreateBaselineSchema1600000000000 } from '../../src/database/migrations/1600000000000-CreateBaselineSchema';
import { CreateMemoryAndSafetyTables1700000000000 } from '../../src/database/migrations/1700000000000-CreateMemoryAndSafetyTables';

/**
 * The baseline migration has exactly one job worth testing: after it runs, the
 * database must look identical to what `synchronize` would have produced.
 *
 * That is a stronger claim than "the tables exist". It means the migration can
 * be trusted as the source of truth, because a schema built from migrations
 * leaves nothing for `synchronize` to change — no missing column, no wrong
 * length, no reordered default. Without this assertion a baseline drifts from
 * the entities the moment somebody adds a column, and the drift only surfaces
 * as a production `ALTER` nobody reviewed.
 */

/** Every entity the application registers, discovered the way AppModule does. */
function loadEntities(): Function[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.entity.ts')) files.push(full);
    }
  };
  walk(path.join(__dirname, '../../src'));
  for (const file of files) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(file);
  }
  return getMetadataArgsStorage()
    .tables.map((table) => table.target)
    .filter((target): target is Function => typeof target === 'function');
}

async function buildFromMigrations(): Promise<DataSource> {
  const dataSource = new DataSource({
    type: 'sqljs',
    database: new Uint8Array(),
    entities: loadEntities() as any[],
    migrations: [
      CreateBaselineSchema1600000000000,
      CreateMemoryAndSafetyTables1700000000000,
    ] as any[],
    migrationsRun: false,
    synchronize: false,
    logging: false,
  });
  await dataSource.initialize();
  await dataSource.runMigrations({ transaction: 'none' });
  return dataSource;
}

describe('baseline migration', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await buildFromMigrations();
  }, 60000);

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('creates every table the entities declare', async () => {
    const rows: Array<{ name: string }> = await dataSource.query(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    );
    const present = new Set(rows.map((row) => row.name));
    const declared = new Set(
      dataSource.entityMetadatas.map((meta) => meta.tableName),
    );
    const missing = [...declared].filter((table) => !present.has(table));
    expect(missing).toEqual([]);
  });

  it('leaves nothing for synchronize to change', async () => {
    const builder = dataSource.driver.createSchemaBuilder();
    const { upQueries, downQueries } = await (builder as any).log();

    // Print the diff on failure so a drifted column names itself.
    if (upQueries.length > 0) {
      // eslint-disable-next-line no-console
      console.log(
        'pending schema changes:\n' +
          upQueries.map((query: any) => `  ${query.query}`).join('\n'),
      );
    }
    expect(upQueries).toHaveLength(0);
    expect(downQueries).toHaveLength(0);
  }, 60000);

  it('records both migrations as applied', async () => {
    const rows: Array<{ name: string }> = await dataSource.query(
      `SELECT name FROM migrations ORDER BY timestamp`,
    );
    expect(rows.map((row) => row.name)).toEqual([
      'CreateBaselineSchema1600000000000',
      'CreateMemoryAndSafetyTables1700000000000',
    ]);
  });

  it('is re-runnable against a database that already has the schema', async () => {
    // Simulates the real upgrade path: a deployment whose tables were built
    // by `synchronize` before migrations existed, and which already holds
    // rows. The baseline must skip every table, keep the data, and record
    // itself as applied.
    const existing = new DataSource({
      type: 'sqljs',
      database: new Uint8Array(),
      entities: loadEntities() as any[],
      synchronize: true,
      migrations: [CreateBaselineSchema1600000000000] as any[],
      migrationsRun: false,
      logging: false,
    });
    await existing.initialize();
    await existing.query(
      `INSERT INTO "users" ("phone", "password", "name", "type")
       VALUES ('13800000000', 'hash', '小明', 'child')`,
    );

    const applied = await existing.runMigrations({ transaction: 'none' });
    expect(applied).toHaveLength(1);

    const users: Array<{ name: string }> = await existing.query(
      `SELECT "name" FROM "users"`,
    );
    expect(users).toEqual([{ name: '小明' }]);
    await existing.destroy();
  }, 60000);

  it('drops the columns left behind by the deleted legacy Poem entity', async () => {
    // A database that `synchronize` had already touched carries `author`,
    // `dynasty` and friends on `poems`. Two of them are NOT NULL and nothing
    // can fill them, so the baseline removes them.
    const legacy = new DataSource({
      type: 'sqljs',
      database: new Uint8Array(),
      entities: loadEntities() as any[],
      migrations: [CreateBaselineSchema1600000000000] as any[],
      migrationsRun: false,
      synchronize: false,
      logging: false,
    });
    await legacy.initialize();
    await legacy.query(
      `CREATE TABLE "poems" (
         "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
         "title" varchar(200) NOT NULL,
         "author" varchar(100) NOT NULL,
         "dynasty" varchar(20) NOT NULL,
         "content" text NOT NULL,
         "popularity" integer NOT NULL DEFAULT (0)
       )`,
    );

    await legacy.runMigrations({ transaction: 'none' });

    const runner = legacy.createQueryRunner();
    const table = await runner.getTable('poems');
    expect(table).toBeDefined();
    for (const column of ['author', 'dynasty', 'popularity']) {
      expect(table!.findColumnByName(column)).toBeUndefined();
    }
    // The poetry module's own columns are the ones that survive.
    expect(table!.findColumnByName('title')).toBeDefined();
    expect(table!.findColumnByName('author_id')).toBeDefined();
    await runner.release();
    await legacy.destroy();
  }, 60000);

  it('adds the conversation columns that post-date an older database', async () => {
    // `createTable(..., ifNotExists)` skips a table that already exists, so
    // a database built before `actorType` / `summary` / `messageCount` were
    // added would stay one column short forever once `synchronize` is off.
    // The baseline closes that gap explicitly.
    const older = new DataSource({
      type: 'sqljs',
      database: new Uint8Array(),
      entities: loadEntities() as any[],
      synchronize: true,
      migrations: [CreateBaselineSchema1600000000000] as any[],
      migrationsRun: false,
      logging: false,
    });
    await older.initialize();

    // Reconstruct the pre-upgrade shape by removing the later columns.
    for (const column of ['actorType', 'summary', 'messageCount']) {
      await older.query(`ALTER TABLE "conversations" DROP COLUMN "${column}"`);
    }
    await older.query(
      `INSERT INTO "conversations" ("uuid", "childId", "status")
       VALUES ('conv-old', 7, 'active')`,
    );

    await older.runMigrations({ transaction: 'none' });

    const runner = older.createQueryRunner();
    const table = await runner.getTable('conversations');
    for (const column of ['actorType', 'summary', 'messageCount']) {
      expect(table!.findColumnByName(column)).toBeDefined();
    }

    const rows: Array<{ actorType: string; messageCount: number; summary: string | null }> =
      await older.query(
        `SELECT "actorType", "messageCount", "summary" FROM "conversations" WHERE "uuid" = 'conv-old'`,
      );
    // The defaults have to land on the row that was already there, not just
    // on the column definition.
    expect(rows).toEqual([{ actorType: 'child', messageCount: 0, summary: null }]);

    // And the database now matches the entities exactly.
    const pending = await (older.driver.createSchemaBuilder() as any).log();
    expect(pending.upQueries).toHaveLength(0);

    await runner.release();
    await older.destroy();
  }, 60000);
});
