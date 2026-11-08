import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumnOptions,
  TableIndex,
} from 'typeorm';

/**
 * Tables added by the feature port from 碎碎念.
 *
 * Runs after `CreateBaselineSchema`, so a database built purely from
 * migrations ends up with the same 33 tables `synchronize` would have made.
 * Every table is created with `ifNotExists`, which makes the migration safe
 * to run against a database where `synchronize` already created them.
 *
 * Two conventions, both required for the schema to match what `synchronize`
 * emits (see `test/unit/migration-baseline.spec.ts`):
 *
 * - Integer columns are `integer`, not `int`. SQLite's `AUTOINCREMENT` only
 *   accepts a literal `INTEGER PRIMARY KEY`, and the schema comparison reads
 *   the declared type back verbatim.
 * - Date columns and their defaults follow the driver: `datetime` +
 *   `datetime('now')` on SQLite, `timestamp` + `now()` on PostgreSQL.
 *   `CURRENT_TIMESTAMP` would work at runtime but would disagree with the
 *   entity metadata, so the next `synchronize` would rebuild the tables.
 */
export class CreateMemoryAndSafetyTables1700000000000 implements MigrationInterface {
  name = 'CreateMemoryAndSafetyTables1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.connection.options.type === 'postgres';
    const DATE = isPostgres ? 'timestamp' : 'datetime';
    const NOW = isPostgres ? 'now()' : "datetime('now')";

    const id = (): TableColumnOptions => ({
      name: 'id',
      type: 'integer',
      isPrimary: true,
      isGenerated: true,
      generationStrategy: 'increment',
    });
    const createdAt = (): TableColumnOptions => ({
      name: 'createdAt',
      type: DATE,
      default: NOW,
    });

    await this.create(
      queryRunner,
      new Table({
        name: 'memories',
        columns: [
          id(),
          { name: 'childId', type: 'integer' },
          { name: 'kind', type: 'varchar', length: '16' },
          { name: 'content', type: 'text' },
          { name: 'verbatimQuote', type: 'text' },
          { name: 'confidence', type: 'float', default: 0 },
          { name: 'sensitivity', type: 'varchar', length: '2', default: "'L0'" },
          { name: 'occurredAt', type: 'varchar', length: '10', isNullable: true },
          { name: 'sourceMessageIds', type: 'text', isNullable: true },
          { name: 'vector', type: 'text', isNullable: true },
          { name: 'embedModel', type: 'varchar', length: '64', isNullable: true },
          createdAt(),
        ],
      }),
    );
    await this.index(queryRunner, 'memories', 'IDX_5d51f30f1e68ff521099227bd8', [
      'childId',
      'kind',
      'content',
    ]);
    await this.index(queryRunner, 'memories', 'IDX_324123e5fd5fc0aee269730e48', [
      'childId',
      'sensitivity',
      'occurredAt',
    ]);

    await this.create(
      queryRunner,
      new Table({
        name: 'safety_events',
        columns: [
          id(),
          { name: 'childId', type: 'integer' },
          { name: 'parentId', type: 'integer', isNullable: true },
          { name: 'category', type: 'varchar', length: '16' },
          { name: 'level', type: 'varchar', length: '16', default: "'critical'" },
          { name: 'source', type: 'varchar', length: '16', default: "'rules'" },
          { name: 'excerpt', type: 'text', isNullable: true },
          { name: 'action', type: 'varchar', length: '16', default: "'queued'" },
          { name: 'notifiedAt', type: DATE, isNullable: true },
          createdAt(),
        ],
      }),
    );
    await this.index(queryRunner, 'safety_events', 'IDX_90c05ae482f775c50f47240186', [
      'childId',
      'createdAt',
    ]);
    await this.index(queryRunner, 'safety_events', 'IDX_1bcd6714d4df270e0080a7dc92', [
      'parentId',
      'level',
    ]);

    await this.create(
      queryRunner,
      new Table({
        name: 'recall_audits',
        columns: [
          id(),
          { name: 'childId', type: 'integer' },
          { name: 'tool', type: 'varchar', length: '16' },
          { name: 'outcome', type: 'varchar', length: '16' },
          { name: 'reason', type: 'varchar', length: '32', isNullable: true },
          { name: 'hits', type: 'integer', default: 0 },
          { name: 'latencyMs', type: 'integer', default: 0 },
          { name: 'query', type: 'varchar', length: '200', isNullable: true },
          createdAt(),
        ],
      }),
    );
    await this.index(queryRunner, 'recall_audits', 'IDX_91d38b80b0b8560c9360b2c611', [
      'childId',
      'createdAt',
    ]);
    await this.index(queryRunner, 'recall_audits', 'IDX_cad45714ac25ccf0a40d58524b', [
      'tool',
      'outcome',
    ]);

    await this.create(
      queryRunner,
      new Table({
        name: 'care_cues',
        columns: [
          id(),
          { name: 'childId', type: 'integer' },
          { name: 'memoryId', type: 'integer', isNullable: true },
          { name: 'topic', type: 'text' },
          { name: 'dueAt', type: 'varchar', length: '10' },
          { name: 'status', type: 'varchar', length: '16', default: "'pending'" },
          { name: 'postponeCount', type: 'integer', default: 0 },
          { name: 'sentAt', type: DATE, isNullable: true },
          createdAt(),
        ],
      }),
    );
    await this.index(queryRunner, 'care_cues', 'IDX_a0c069838ad53d849fc4ec356e', [
      'childId',
      'status',
      'dueAt',
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('care_cues', true);
    await queryRunner.dropTable('recall_audits', true);
    await queryRunner.dropTable('safety_events', true);
    await queryRunner.dropTable('memories', true);
  }

  /** Create the table unless it is already there. */
  private async create(queryRunner: QueryRunner, table: Table): Promise<void> {
    await queryRunner.createTable(table, true);
  }

  /**
   * Index creation is best-effort: `ifNotExists` is portable on tables but
   * not on indexes, and this migration is expected to run against databases
   * where `synchronize` already created the same indexes.
   */
  private async index(
    queryRunner: QueryRunner,
    table: string,
    name: string,
    columns: string[],
  ): Promise<void> {
    try {
      await queryRunner.createIndex(table, new TableIndex({ name, columnNames: columns }));
    } catch {
      // Already present — the schema is what we wanted either way.
    }
  }
}
