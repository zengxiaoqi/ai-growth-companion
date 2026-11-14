import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Knowledge cards (P1-3 grounding): per-topic facts that constrain question
 * and course generation. Schema matches what `synchronize` emits for
 * KnowledgeCard — see test/unit/migration-baseline.spec.ts.
 */
export class CreateKnowledgeCards1794600000000 implements MigrationInterface {
  name = 'CreateKnowledgeCards1794600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.connection.options.type === 'postgres';
    const DATE = isPostgres ? 'timestamp' : 'datetime';
    const NOW = isPostgres ? 'now()' : "datetime('now')";

    await queryRunner.createTable(
      new Table({
        name: 'knowledge_cards',
        columns: [
          {
            name: 'id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'topic', type: 'varchar', length: '100' },
          { name: 'aliases', type: 'text', isNullable: true },
          { name: 'ageGroup', type: 'varchar', length: '10' },
          { name: 'domain', type: 'varchar', length: '20', isNullable: true },
          { name: 'facts', type: 'text', isNullable: true },
          { name: 'misconceptions', type: 'text', isNullable: true },
          { name: 'vocabulary', type: 'text', isNullable: true },
          { name: 'quizSeeds', type: 'text', isNullable: true },
          { name: 'status', type: 'varchar', length: '10', default: "'draft'" },
          { name: 'createdAt', type: DATE, default: NOW },
          { name: 'updatedAt', type: DATE, default: NOW },
        ],
      }),
      true,
    );

    try {
      await queryRunner.createIndex(
        'knowledge_cards',
        new TableIndex({
          name: 'IDX_d647ba7f635ae87085191dea1e',
          columnNames: ['topic', 'ageGroup'],
          isUnique: true,
        }),
      );
    } catch {
      // Already present (synchronize-built database) — same schema either way.
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('knowledge_cards', true);
  }
}