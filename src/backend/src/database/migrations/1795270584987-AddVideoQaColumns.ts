import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Video QA columns added to the entity after the baseline migration froze.
 *
 * Production runs with `synchronize: false`, so these columns were never
 * created on databases whose schema came from migrations — the video queue
 * then failed every tick with `no such column: VideoGenerationTask.qaScore`.
 *
 * Column definitions mirror exactly what `synchronize` emits for the entity
 * (see test/unit/migration-baseline.spec.ts). hasTable/hasColumn guards keep
 * this a no-op on development databases that already have the columns.
 */
export class AddVideoQaColumns1795270584987 implements MigrationInterface {
  name = 'AddVideoQaColumns1795270584987';

  private static readonly TABLE = 'video_generation_tasks';

  private static readonly COLUMNS: TableColumn[] = [
    new TableColumn({ name: 'qaScore', type: 'integer', isNullable: true }),
    new TableColumn({ name: 'qaPassed', type: 'boolean', isNullable: true }),
    new TableColumn({ name: 'qaRounds', type: 'integer', default: 0 }),
    new TableColumn({ name: 'actualEngine', type: 'varchar', length: '30', isNullable: true }),
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable(AddVideoQaColumns1795270584987.TABLE))) return;
    for (const column of AddVideoQaColumns1795270584987.COLUMNS) {
      if (await queryRunner.hasColumn(AddVideoQaColumns1795270584987.TABLE, column.name)) continue;
      await queryRunner.addColumn(AddVideoQaColumns1795270584987.TABLE, column);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable(AddVideoQaColumns1795270584987.TABLE))) return;
    for (const column of [...AddVideoQaColumns1795270584987.COLUMNS].reverse()) {
      if (await queryRunner.hasColumn(AddVideoQaColumns1795270584987.TABLE, column.name)) {
        await queryRunner.dropColumn(AddVideoQaColumns1795270584987.TABLE, column.name);
      }
    }
  }
}
