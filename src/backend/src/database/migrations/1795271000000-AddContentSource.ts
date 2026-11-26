import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Quick-generated lessons need a stable cache discriminator. Older content
 * rows remain valid with a null source; only rows created by QuickVideoService
 * are marked quick_generate.
 */
export class AddContentSource1795271000000 implements MigrationInterface {
  name = 'AddContentSource1795271000000';

  private static readonly TABLE = 'contents';
  private static readonly COLUMN = 'source';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable(AddContentSource1795271000000.TABLE))) return;
    if (
      await queryRunner.hasColumn(
        AddContentSource1795271000000.TABLE,
        AddContentSource1795271000000.COLUMN,
      )
    ) {
      return;
    }
    await queryRunner.addColumn(
      AddContentSource1795271000000.TABLE,
      new TableColumn({
        name: AddContentSource1795271000000.COLUMN,
        type: 'varchar',
        length: '40',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable(AddContentSource1795271000000.TABLE))) return;
    if (
      await queryRunner.hasColumn(
        AddContentSource1795271000000.TABLE,
        AddContentSource1795271000000.COLUMN,
      )
    ) {
      await queryRunner.dropColumn(
        AddContentSource1795271000000.TABLE,
        AddContentSource1795271000000.COLUMN,
      );
    }
  }
}
