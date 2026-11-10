import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Adds the per-child 碎碎念 casual-tool override to parent_controls.
 *
 * `simple-json` maps to a nullable `text` column on both SQLite and
 * PostgreSQL, matching what `synchronize` emits for the entity so the
 * migration chain and the entity metadata never drift.
 *
 * Guarded with hasTable/hasColumn so it is a no-op on a database where
 * `synchronize` already added the column.
 */
export class AddCasualToolsToParentControls1762800000000 implements MigrationInterface {
  name = 'AddCasualToolsToParentControls1762800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('parent_controls'))) return;
    if (await queryRunner.hasColumn('parent_controls', 'casualTools')) return;
    await queryRunner.addColumn(
      'parent_controls',
      new TableColumn({ name: 'casualTools', type: 'text', isNullable: true }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('parent_controls'))) return;
    if (await queryRunner.hasColumn('parent_controls', 'casualTools')) {
      await queryRunner.dropColumn('parent_controls', 'casualTools');
    }
  }
}