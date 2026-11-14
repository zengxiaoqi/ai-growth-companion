import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Question bank (P1-2): reusable per-question items with serving statistics.
 * Schema matches what `synchronize` emits for QuestionItem — see
 * test/unit/migration-baseline.spec.ts.
 */
export class CreateQuestionItems1794700000000 implements MigrationInterface {
  name = 'CreateQuestionItems1794700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.connection.options.type === 'postgres';
    const DATE = isPostgres ? 'timestamp' : 'datetime';
    const NOW = isPostgres ? 'now()' : "datetime('now')";

    await queryRunner.createTable(
      new Table({
        name: 'question_items',
        columns: [
          {
            name: 'id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'uuid', type: 'varchar', length: '36' },
          { name: 'topic', type: 'varchar', length: '100' },
          { name: 'ageGroup', type: 'varchar', length: '10' },
          { name: 'domain', type: 'varchar', length: '20', isNullable: true },
          { name: 'difficulty', type: 'integer', default: 1 },
          { name: 'activityType', type: 'varchar', length: '30' },
          { name: 'questionHash', type: 'varchar', length: '64' },
          { name: 'payload', type: 'text', isNullable: true },
          { name: 'source', type: 'varchar', length: '20', default: "'llm'" },
          { name: 'status', type: 'varchar', length: '10', default: "'active'" },
          { name: 'qualityScore', type: 'integer', default: 100 },
          { name: 'timesServed', type: 'integer', default: 0 },
          { name: 'timesCorrect', type: 'integer', default: 0 },
          { name: 'createdAt', type: DATE, default: NOW },
          { name: 'lastServedAt', type: DATE, isNullable: true },
        ],
      }),
      true,
    );

    try {
      await queryRunner.createIndex(
        'question_items',
        new TableIndex({
          name: 'IDX_db70950ef73671f3e6ada28f56',
          columnNames: ['questionHash'],
          isUnique: true,
        }),
      );
    } catch {
      // Already present (synchronize-built database) — same schema either way.
    }

    try {
      await queryRunner.createIndex(
        'question_items',
        new TableIndex({
          name: 'IDX_fe6398acf54be6fe8ef4ce2c76',
          columnNames: ['topic', 'ageGroup', 'activityType', 'status'],
        }),
      );
    } catch {
      // Already present (synchronize-built database) — same schema either way.
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('question_items', true);
  }
}