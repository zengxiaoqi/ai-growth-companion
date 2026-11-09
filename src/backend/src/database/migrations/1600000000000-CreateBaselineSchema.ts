import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableColumnOptions,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

/**
 * Baseline for the schema that predates migrations.
 *
 * Until now the 29 tables below existed only as a side effect of
 * `synchronize: true`. That made `DB_SYNCHRONIZE=false` impossible: turning
 * it off left a fresh database with no tables at all. This migration is the
 * missing starting point.
 *
 * Two properties matter more than the DDL itself:
 *
 * 1. **It is a no-op on an existing database.** Every table is created with
 *    `ifNotExists`, so a deployment whose tables were already built by
 *    `synchronize` records the migration as applied and changes nothing.
 *    Only an empty database gets the full schema.
 * 2. **It reproduces the converged schema exactly.** A mismatch would show
 *    up as a diff the next time anyone ran `synchronize`, so
 *    `test/unit/migration-baseline.spec.ts` asserts that building the
 *    schema from migrations leaves nothing for `synchronize` to do.
 *
 * Column types are dialect-aware because `synchronize` is: it emits
 * `datetime` + `datetime('now')` on SQLite and `timestamp` + `now()` on
 * PostgreSQL. Writing a fixed type would make the baseline disagree with
 * the entities on one of the two.
 *
 * Two tables in this schema used to be declared twice, which is what made
 * a baseline necessary in the first place: two `@Entity()` classes for one
 * table cannot both be satisfied, so `synchronize` rebuilt the table on
 * every boot, each pass undoing the previous one. Both duplicates are gone,
 * and the schema below is what a single declaration now produces:
 *
 * - `poems` was declared by a legacy `database/entities/poem.entity.ts`
 *   that nothing imported. It was deleted, and `reconcilePoems()` clears
 *   the six columns it had added to databases that already exist.
 * - `conversations` / `conversation_messages` were declared by both
 *   `agent-framework/conversation/entities/` and
 *   `modules/ai/conversation/`. Those two copies were deleted as well and
 *   the single remaining declaration lives in
 *   `database/entities/conversation.entity.ts`, so the columns here
 *   (`actorType`, `summary`, `messageCount` included) are the entity's own
 *   columns rather than the union of two disagreements.
 *
 * `test/unit/entity-declarations.spec.ts` keeps it that way: it fails if a
 * second class ever claims either table again.
 */
export class CreateBaselineSchema1600000000000 implements MigrationInterface {
  name = 'CreateBaselineSchema1600000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Match what `synchronize` emits for this driver, so the two never
    // disagree about a column.
    const isPostgres = queryRunner.connection.options.type === 'postgres';
    const DATE = isPostgres ? 'timestamp' : 'datetime';
    const NOW = isPostgres ? 'now()' : "datetime('now')";

    // A `Table` column's default is concatenated verbatim into
    // `DEFAULT (...)`, with no quoting and no normalisation. Strings
    // therefore carry their own quotes above, and booleans have to be
    // spelled the way each driver stores them — `0`/`1` on SQLite, where
    // `synchronize` writes numbers, and `false`/`true` on PostgreSQL.
    const bool = (value: boolean): string | number => (isPostgres ? String(value) : value ? 1 : 0);

    const createdAt = (name = 'createdAt'): TableColumnOptions => ({
      name,
      type: DATE,
      default: NOW,
    });
    const updatedAt = (name = 'updatedAt'): TableColumnOptions => ({
      name,
      type: DATE,
      default: NOW,
    });
    const id = (): TableColumnOptions => ({
      name: 'id',
      type: 'integer',
      isPrimary: true,
      isGenerated: true,
      generationStrategy: 'increment',
    });

    // ── Identity ────────────────────────────────────────────────────────
    await this.create(
      queryRunner,
      new Table({
        name: 'users',
        columns: [
          id(),
          { name: 'phone', type: 'varchar', isNullable: true, isUnique: true },
          { name: 'password', type: 'varchar' },
          { name: 'name', type: 'varchar', length: '100' },
          { name: 'type', type: 'varchar', default: "'child'" },
          { name: 'avatar', type: 'varchar', isNullable: true },
          { name: 'age', type: 'integer', isNullable: true },
          { name: 'gender', type: 'varchar', isNullable: true },
          { name: 'parentId', type: 'integer', isNullable: true },
          { name: 'pin', type: 'varchar', isNullable: true },
          { name: 'loginCode', type: 'varchar', isNullable: true },
          { name: 'settings', type: 'text', isNullable: true },
          createdAt(),
          updatedAt(),
        ],
      }),
    );

    // ── Content ─────────────────────────────────────────────────────────
    await this.create(
      queryRunner,
      new Table({
        name: 'contents',
        columns: [
          id(),
          { name: 'uuid', type: 'varchar', length: '36', isUnique: true },
          { name: 'title', type: 'varchar', length: '200' },
          { name: 'subtitle', type: 'varchar', isNullable: true },
          { name: 'ageRange', type: 'varchar', length: '20' },
          { name: 'domain', type: 'varchar', length: '50' },
          { name: 'topic', type: 'varchar', isNullable: true },
          { name: 'difficulty', type: 'integer', default: 1 },
          { name: 'durationMinutes', type: 'integer', default: 5 },
          { name: 'contentType', type: 'varchar', length: '50' },
          { name: 'content', type: 'text' },
          { name: 'mediaUrls', type: 'text' },
          { name: 'status', type: 'varchar', default: "'draft'" },
          { name: 'parentId', type: 'integer', isNullable: true },
          { name: 'childId', type: 'integer', isNullable: true },
          createdAt(),
          updatedAt(),
        ],
      }),
    );

    // ── Poetry reference tables ─────────────────────────────────────────
    // The poetry module points its own connection at an external read-only
    // poetry.db, but the entity glob also registers these three on the main
    // connection, so they exist in the main database too.
    await this.create(
      queryRunner,
      new Table({
        name: 'authors',
        columns: [
          id(),
          { name: 'name', type: 'varchar' },
          { name: 'name_zh_hant', type: 'varchar', isNullable: true },
          { name: 'dynasty_id', type: 'integer', isNullable: true },
        ],
      }),
    );

    await this.create(
      queryRunner,
      new Table({
        name: 'dynasties',
        columns: [
          id(),
          { name: 'name', type: 'varchar' },
          { name: 'name_zh_hant', type: 'varchar', isNullable: true },
          { name: 'sort_order', type: 'integer', isNullable: true },
        ],
      }),
    );

    // ── Book skills ─────────────────────────────────────────────────────
    await this.create(
      queryRunner,
      new Table({
        name: 'book_skills',
        columns: [
          id(),
          { name: 'title', type: 'varchar' },
          { name: 'author', type: 'varchar', isNullable: true },
          { name: 'coverUrl', type: 'varchar', isNullable: true },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'filePath', type: 'varchar', isNullable: true },
          { name: 'fileType', type: 'varchar', isNullable: true },
          { name: 'fileSize', type: 'integer', default: 0 },
          { name: 'totalChapters', type: 'integer', default: 0 },
          { name: 'ageGroup', type: 'varchar', isNullable: true },
          { name: 'status', type: 'varchar', default: "'processing'" },
          { name: 'errorMessage', type: 'text', isNullable: true },
          { name: 'uploaderId', type: 'integer' },
          { name: 'viewCount', type: 'integer', default: 0 },
          createdAt(),
          updatedAt(),
        ],
      }),
    );

    await this.create(
      queryRunner,
      new Table({
        name: 'book_skill_chapters',
        columns: [
          id(),
          { name: 'bookSkillId', type: 'integer' },
          { name: 'index', type: 'integer' },
          { name: 'title', type: 'varchar' },
          { name: 'summary', type: 'text' },
          { name: 'content', type: 'text', isNullable: true },
          { name: 'keyPoints', type: 'text', isNullable: true },
        ],
        foreignKeys: [this.cascadeToBookSkill('FK_95c21de7b2d68567fa40cf5254e')],
      }),
    );

    await this.create(
      queryRunner,
      new Table({
        name: 'book_skill_patterns',
        columns: [
          id(),
          { name: 'bookSkillId', type: 'integer' },
          { name: 'name', type: 'varchar' },
          { name: 'description', type: 'text' },
          { name: 'category', type: 'varchar', isNullable: true },
        ],
        foreignKeys: [this.cascadeToBookSkill('FK_a87b39889837c463b3df3945693')],
      }),
    );

    await this.create(
      queryRunner,
      new Table({
        name: 'book_skill_terms',
        columns: [
          id(),
          { name: 'bookSkillId', type: 'integer' },
          { name: 'term', type: 'varchar' },
          { name: 'definition', type: 'text' },
          { name: 'chapterRef', type: 'varchar', isNullable: true },
        ],
        foreignKeys: [this.cascadeToBookSkill('FK_4bce42d717bc3acb1e22b2263c5')],
      }),
    );

    // ── Assignments and learning records ────────────────────────────────
    await this.create(
      queryRunner,
      new Table({
        name: 'assignments',
        columns: [
          id(),
          { name: 'uuid', type: 'varchar', length: '36', isUnique: true },
          { name: 'parentId', type: 'integer' },
          { name: 'childId', type: 'integer' },
          { name: 'contentId', type: 'integer', isNullable: true },
          { name: 'activityType', type: 'varchar', length: '50' },
          { name: 'activityData', type: 'text', isNullable: true },
          { name: 'domain', type: 'varchar', isNullable: true },
          { name: 'difficulty', type: 'integer', default: 1 },
          { name: 'dueDate', type: DATE, isNullable: true },
          { name: 'status', type: 'varchar', default: "'pending'" },
          { name: 'completedAt', type: DATE, isNullable: true },
          { name: 'score', type: 'integer', isNullable: true },
          { name: 'resultData', type: 'text', isNullable: true },
          createdAt(),
        ],
        foreignKeys: [
          this.fk('FK_0ceba30e4e7d574a3a43ccc3704', 'parentId', 'users'),
          this.fk('FK_11d6a63285f5bd94a95c4b2e899', 'childId', 'users'),
        ],
      }),
    );

    await this.create(
      queryRunner,
      new Table({
        name: 'learning_records',
        columns: [
          id(),
          { name: 'uuid', type: 'varchar', length: '36', isUnique: true },
          { name: 'userId', type: 'integer' },
          { name: 'contentId', type: 'integer', isNullable: true },
          createdAt('startedAt'),
          { name: 'completedAt', type: DATE, isNullable: true },
          { name: 'durationSeconds', type: 'integer', isNullable: true },
          { name: 'score', type: 'integer', isNullable: true },
          { name: 'answers', type: 'text', isNullable: true },
          { name: 'interactionData', type: 'text', isNullable: true },
          { name: 'status', type: 'varchar', default: "'in_progress'" },
        ],
        foreignKeys: [
          this.fk('FK_607525bbde0b3ef4b482f06e188', 'userId', 'users'),
          this.fk('FK_16c037b7a6ba3bef1f34ef40778', 'contentId', 'contents'),
        ],
      }),
    );

    // ── Poems ───────────────────────────────────────────────────────────
    // The poetry module reads from a separate read-only poetry.db, but the
    // entity glob also registers its Poem on this connection, so the table
    // exists in the main database too.
    await this.create(
      queryRunner,
      new Table({
        name: 'poems',
        columns: [
          id(),
          { name: 'title', type: 'varchar' },
          { name: 'content', type: 'text' },
          { name: 'author_id', type: 'integer', isNullable: true },
          { name: 'dynasty_id', type: 'integer', isNullable: true },
          { name: 'type', type: 'varchar', isNullable: true },
          { name: 'title_zh_hant', type: 'varchar', isNullable: true },
          { name: 'content_zh_hant', type: 'text', isNullable: true },
        ],
        foreignKeys: [
          this.fk('FK_53337109fb27e6649b480cfc8a2', 'author_id', 'authors'),
          this.fk('FK_60372acc48d88ba1f48deb192e3', 'dynasty_id', 'dynasties'),
        ],
      }),
    );
    await this.reconcilePoems(queryRunner);

    // Same reasoning as `reconcilePoems`, in the other direction: the
    // columns below were added to `conversations` after some databases were
    // already built, and `createTable(..., ifNotExists)` cannot add a column
    // to a table that already exists. Without this, turning `synchronize`
    // off would freeze those databases one column short of the entity.
    await this.reconcileConversations(queryRunner);

    await this.create(
      queryRunner,
      new Table({
        name: 'poem_annotations',
        columns: [
          { name: 'poemId', type: 'integer', isPrimary: true },
          { name: 'translation', type: 'text' },
          { name: 'notes', type: 'text' },
          { name: 'appreciation', type: 'text' },
          { name: 'source', type: 'varchar', length: '20', default: "'llm'" },
          { name: 'model', type: 'varchar', length: '100', isNullable: true },
          { name: 'createdAt', type: DATE, default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: DATE, default: 'CURRENT_TIMESTAMP' },
        ],
      }),
    );
    await this.index(queryRunner, 'poem_annotations', 'idx_poem_annotation_model', [
      'poemId',
      'model',
    ]);

    // ── Growth records ──────────────────────────────────────────────────
    await this.create(
      queryRunner,
      new Table({
        name: 'ability_assessments',
        columns: [
          id(),
          { name: 'uuid', type: 'varchar', length: '36', isUnique: true },
          { name: 'userId', type: 'integer' },
          { name: 'domain', type: 'varchar', length: '50' },
          { name: 'score', type: 'integer' },
          { name: 'level', type: 'varchar', isNullable: true },
          { name: 'evidence', type: 'text' },
          createdAt('assessedAt'),
        ],
      }),
    );

    await this.create(
      queryRunner,
      new Table({
        name: 'achievements',
        columns: [
          id(),
          { name: 'uuid', type: 'varchar', length: '36', isUnique: true },
          { name: 'userId', type: 'integer' },
          { name: 'achievementType', type: 'varchar', length: '50' },
          { name: 'achievementName', type: 'varchar', length: '100' },
          { name: 'description', type: 'varchar', isNullable: true },
          { name: 'icon', type: 'varchar', isNullable: true },
          createdAt('earnedAt'),
        ],
      }),
    );

    await this.create(
      queryRunner,
      new Table({
        name: 'learning_points',
        columns: [
          id(),
          { name: 'childId', type: 'integer' },
          { name: 'sessionId', type: 'varchar', length: '36', isNullable: true },
          { name: 'domain', type: 'varchar', length: '50', isNullable: true },
          { name: 'pointKey', type: 'varchar', length: '180' },
          { name: 'pointLabel', type: 'varchar', length: '255' },
          { name: 'source', type: 'varchar', length: '40', default: "'chat_summary'" },
          { name: 'lastLearnedAt', type: DATE },
          { name: 'cooldownUntil', type: DATE },
          { name: 'evidence', type: 'text', isNullable: true },
          createdAt(),
          updatedAt(),
        ],
      }),
    );
    await this.index(
      queryRunner,
      'learning_points',
      'IDX_de1caa8f3add4f7a55aeb90b83',
      ['childId', 'pointKey'],
      true,
    );

    await this.create(
      queryRunner,
      new Table({
        name: 'study_plan_records',
        columns: [
          id(),
          { name: 'childId', type: 'integer' },
          { name: 'parentId', type: 'integer', isNullable: true },
          { name: 'sourceType', type: 'varchar', length: '40', default: "'ai_generated'" },
          { name: 'sourceId', type: 'integer', isNullable: true },
          { name: 'title', type: 'varchar', length: '180' },
          { name: 'planContent', type: 'text', isNullable: true },
          { name: 'status', type: 'varchar', length: '20', default: "'active'" },
          { name: 'sessionId', type: 'varchar', length: '36', isNullable: true },
          createdAt(),
          updatedAt(),
        ],
      }),
    );

    await this.create(
      queryRunner,
      new Table({
        name: 'wrong_questions',
        columns: [
          id(),
          { name: 'childId', type: 'integer' },
          { name: 'sessionId', type: 'varchar', length: '36', isNullable: true },
          { name: 'domain', type: 'varchar', length: '50', isNullable: true },
          { name: 'activityType', type: 'varchar', length: '50', isNullable: true },
          { name: 'questionHash', type: 'varchar', length: '64' },
          { name: 'questionText', type: 'text' },
          { name: 'userAnswer', type: 'text', isNullable: true },
          { name: 'correctAnswer', type: 'text', isNullable: true },
          { name: 'explanation', type: 'text', isNullable: true },
          { name: 'status', type: 'varchar', length: '20', default: "'new'" },
          { name: 'occurredAt', type: DATE },
          { name: 'lastReviewedAt', type: DATE, isNullable: true },
          { name: 'metadata', type: 'text', isNullable: true },
          createdAt(),
          updatedAt(),
        ],
      }),
    );
    await this.index(
      queryRunner,
      'wrong_questions',
      'IDX_a51223eb891433076f20af7ab9',
      ['childId', 'questionHash'],
      true,
    );

    // ── Points and rewards ──────────────────────────────────────────────
    await this.create(
      queryRunner,
      new Table({
        name: 'behavior_templates',
        columns: [
          id(),
          { name: 'userId', type: 'integer' },
          { name: 'name', type: 'varchar', length: '100' },
          { name: 'emoji', type: 'varchar', length: '10', default: "'⭐'" },
          { name: 'iconImage', type: 'varchar', length: '500', isNullable: true },
          { name: 'points', type: 'integer' },
          { name: 'category', type: 'varchar', length: '20', default: "'daily'" },
          { name: 'isDefault', type: 'boolean', default: bool(false) },
          { name: 'isEnabled', type: 'boolean', default: bool(true) },
          { name: 'sortOrder', type: 'integer', default: 0 },
          createdAt(),
          updatedAt(),
        ],
      }),
    );

    await this.create(
      queryRunner,
      new Table({
        name: 'point_records',
        columns: [
          id(),
          { name: 'childId', type: 'integer' },
          { name: 'templateId', type: 'integer', isNullable: true },
          { name: 'behaviorName', type: 'varchar', length: '100' },
          { name: 'points', type: 'integer' },
          { name: 'note', type: 'varchar', length: '500', isNullable: true },
          { name: 'recordedBy', type: 'integer' },
          { name: 'recordedAt', type: DATE, default: 'CURRENT_TIMESTAMP' },
          createdAt(),
        ],
      }),
    );
    await this.index(queryRunner, 'point_records', 'IDX_363470de29aa61059b7d5e9b2a', [
      'childId',
      'recordedAt',
    ]);

    await this.create(
      queryRunner,
      new Table({
        name: 'gifts',
        columns: [
          id(),
          { name: 'userId', type: 'integer' },
          { name: 'name', type: 'varchar', length: '100' },
          { name: 'emoji', type: 'varchar', length: '10', default: "'🎁'" },
          { name: 'iconImage', type: 'varchar', length: '500', isNullable: true },
          { name: 'description', type: 'varchar', length: '500', isNullable: true },
          { name: 'pointsCost', type: 'integer' },
          { name: 'category', type: 'varchar', length: '20', default: "'other'" },
          { name: 'isEnabled', type: 'boolean', default: bool(true) },
          { name: 'stock', type: 'integer', default: -1 },
          { name: 'sortOrder', type: 'integer', default: 0 },
          createdAt(),
          updatedAt(),
        ],
      }),
    );

    await this.create(
      queryRunner,
      new Table({
        name: 'redemption_records',
        columns: [
          id(),
          { name: 'childId', type: 'integer' },
          { name: 'giftId', type: 'integer' },
          { name: 'giftName', type: 'varchar', length: '100' },
          { name: 'pointsCost', type: 'integer' },
          { name: 'status', type: 'varchar', length: '20', default: "'pending'" },
          { name: 'approvedBy', type: 'integer', isNullable: true },
          createdAt('redeemedAt'),
          { name: 'completedAt', type: DATE, isNullable: true },
          { name: 'note', type: 'varchar', length: '500', isNullable: true },
          updatedAt(),
        ],
      }),
    );
    await this.index(queryRunner, 'redemption_records', 'IDX_fc5efcc4869800d1361ad3291f', [
      'childId',
      'redeemedAt',
    ]);

    // ── Misc ────────────────────────────────────────────────────────────
    await this.create(
      queryRunner,
      new Table({
        name: 'emergency_calls',
        columns: [
          id(),
          { name: 'childId', type: 'integer' },
          { name: 'parentId', type: 'integer' },
          { name: 'parentPhone', type: 'varchar', isNullable: true },
          { name: 'status', type: 'varchar', default: "'pending'" },
          { name: 'smsResult', type: 'varchar', isNullable: true },
          { name: 'callResult', type: 'varchar', isNullable: true },
          { name: 'errorMessage', type: 'varchar', isNullable: true },
          { name: 'notificationStatus', type: 'varchar', isNullable: true },
          { name: 'notificationError', type: 'varchar', isNullable: true },
          createdAt(),
        ],
      }),
    );

    await this.create(
      queryRunner,
      new Table({
        name: 'fruits',
        columns: [
          id(),
          { name: 'name', type: 'varchar', length: '100', isUnique: true },
          { name: 'nameZh', type: 'varchar', length: '100', default: "''" },
          { name: 'family', type: 'varchar', length: '100', default: "''" },
          { name: 'genus', type: 'varchar', length: '100', default: "''" },
          { name: 'order', type: 'varchar', length: '100', default: "''" },
          { name: 'nutritions', type: 'text', isNullable: true },
          createdAt(),
          updatedAt(),
        ],
      }),
    );

    await this.create(
      queryRunner,
      new Table({
        name: 'notifications',
        columns: [
          id(),
          { name: 'userId', type: 'integer' },
          { name: 'title', type: 'varchar', length: '100' },
          { name: 'message', type: 'varchar', length: '500' },
          { name: 'type', type: 'varchar', default: "'system'" },
          { name: 'read', type: 'boolean', default: bool(false) },
          { name: 'relatedId', type: 'integer', isNullable: true },
          createdAt(),
        ],
      }),
    );

    await this.create(
      queryRunner,
      new Table({
        name: 'parent_controls',
        columns: [
          id(),
          { name: 'uuid', type: 'varchar', length: '36', isUnique: true },
          { name: 'parentId', type: 'integer' },
          { name: 'childId', type: 'integer' },
          { name: 'dailyLimitMinutes', type: 'integer', default: 30 },
          { name: 'allowedDomains', type: 'text', isNullable: true },
          { name: 'blockedTopics', type: 'text', isNullable: true },
          { name: 'studySchedule', type: 'text', isNullable: true },
          { name: 'notifications', type: 'text', isNullable: true },
          { name: 'eyeProtectionEnabled', type: 'boolean', default: bool(true) },
          { name: 'restReminderMinutes', type: 'integer', default: 20 },
          { name: 'contentFilterEnabled', type: 'boolean', default: bool(true) },
          createdAt(),
          updatedAt(),
        ],
      }),
    );

    // ── Video pipeline ──────────────────────────────────────────────────
    await this.create(
      queryRunner,
      new Table({
        name: 'video_downloads',
        columns: [
          id(),
          { name: 'parentId', type: 'integer' },
          { name: 'childId', type: 'integer', isNullable: true },
          { name: 'sourceUrl', type: 'varchar' },
          { name: 'title', type: 'varchar', isNullable: true },
          { name: 'thumbnail', type: 'varchar', isNullable: true },
          { name: 'platform', type: 'varchar', isNullable: true },
          { name: 'uploader', type: 'varchar', isNullable: true },
          { name: 'duration', type: 'integer', isNullable: true },
          { name: 'filePath', type: 'varchar', length: '500', isNullable: true },
          { name: 'fileSize', type: 'integer', isNullable: true },
          { name: 'status', type: 'varchar', default: "'pending'" },
          { name: 'errorMessage', type: 'varchar', length: '1000', isNullable: true },
          { name: 'publishedToChild', type: 'boolean', default: bool(false) },
          createdAt(),
        ],
      }),
    );
    await this.index(queryRunner, 'video_downloads', 'IDX_7d7104f3d5dad81347996ca1e7', [
      'parentId',
    ]);
    await this.index(queryRunner, 'video_downloads', 'IDX_7234251b1006ddb918df369bb7', ['childId']);
    await this.index(queryRunner, 'video_downloads', 'IDX_6d079ba66d52b09f6550e31de1', ['status']);

    await this.create(
      queryRunner,
      new Table({
        name: 'video_generation_tasks',
        columns: [
          id(),
          { name: 'uuid', type: 'varchar', length: '36', isUnique: true },
          { name: 'contentId', type: 'integer' },
          { name: 'childId', type: 'integer' },
          { name: 'provider', type: 'varchar', length: '80', default: "'third_party'" },
          { name: 'renderEngine', type: 'varchar', length: '20', default: "'auto'" },
          { name: 'cacheKey', type: 'varchar', length: '120' },
          { name: 'requestPayload', type: 'text', isNullable: true },
          { name: 'status', type: 'varchar', length: '16', default: "'pending'" },
          { name: 'progress', type: 'integer', default: 0 },
          { name: 'attemptCount', type: 'integer', default: 0 },
          { name: 'providerTaskId', type: 'varchar', length: '120', isNullable: true },
          { name: 'sourceVideoUrl', type: 'varchar', length: '500', isNullable: true },
          { name: 'localVideoPath', type: 'varchar', length: '500', isNullable: true },
          { name: 'errorMessage', type: 'varchar', length: '500', isNullable: true },
          { name: 'approvalStatus', type: 'varchar', length: '20', default: "'pending_approval'" },
          { name: 'rejectionReason', type: 'varchar', length: '500', isNullable: true },
          { name: 'startedAt', type: DATE, isNullable: true },
          { name: 'completedAt', type: DATE, isNullable: true },
          { name: 'expiresAt', type: DATE, isNullable: true },
          createdAt(),
          updatedAt(),
        ],
      }),
    );

    // ── Conversations (union of the two colliding entity classes) ───────
    await this.create(
      queryRunner,
      new Table({
        name: 'conversations',
        columns: [
          id(),
          { name: 'uuid', type: 'varchar', length: '36', isUnique: true },
          { name: 'childId', type: 'integer' },
          { name: 'status', type: 'varchar', default: "'active'" },
          { name: 'metadata', type: 'text', isNullable: true },
          createdAt(),
          updatedAt(),
          { name: 'actorType', type: 'varchar', default: "'child'" },
          { name: 'summary', type: 'text', isNullable: true },
          { name: 'messageCount', type: 'integer', default: 0 },
        ],
      }),
    );

    await this.create(
      queryRunner,
      new Table({
        name: 'conversation_messages',
        columns: [
          id(),
          { name: 'conversationId', type: 'integer' },
          { name: 'role', type: 'varchar', length: '20' },
          { name: 'content', type: 'text' },
          { name: 'toolCalls', type: 'text', isNullable: true },
          { name: 'toolResult', type: 'text', isNullable: true },
          { name: 'toolCallId', type: 'varchar', isNullable: true },
          { name: 'toolName', type: 'varchar', isNullable: true },
          createdAt(),
        ],
      }),
    );
  }

  /**
   * Reverse of `up()`, in dependency order.
   *
   * A baseline rollback drops the entire application schema. It exists so
   * `migration:revert` is not a no-op, not because it is a safe thing to
   * run: on a database with data this is total data loss.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'conversation_messages',
      'conversations',
      'video_generation_tasks',
      'video_downloads',
      'parent_controls',
      'notifications',
      'fruits',
      'emergency_calls',
      'redemption_records',
      'gifts',
      'point_records',
      'behavior_templates',
      'wrong_questions',
      'study_plan_records',
      'learning_points',
      'achievements',
      'ability_assessments',
      'poem_annotations',
      'poems',
      'learning_records',
      'assignments',
      'book_skill_terms',
      'book_skill_patterns',
      'book_skill_chapters',
      'book_skills',
      'dynasties',
      'authors',
      'contents',
      'users',
    ];
    for (const table of tables) {
      await queryRunner.dropTable(table, true);
    }
  }

  /**
   * Add the `conversations` columns that post-date some databases.
   *
   * `createTable(..., ifNotExists)` is all-or-nothing: on a database whose
   * tables were built by an older `synchronize`, the table exists, so the
   * whole definition is skipped — including the columns added since. That
   * leaves the database one column short of the entity, and with
   * `synchronize` off there is nothing left to close the gap.
   *
   * Only the three columns that were actually introduced later are handled;
   * the rest are part of the table's original shape. All three carry a
   * default or are nullable, so adding them to a populated table is safe.
   */
  private async reconcileConversations(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('conversations');
    if (!table) return;

    const added: TableColumnOptions[] = [
      { name: 'actorType', type: 'varchar', default: "'child'" },
      { name: 'summary', type: 'text', isNullable: true },
      { name: 'messageCount', type: 'integer', default: 0 },
    ];
    const missing = added.filter((column) => !table.findColumnByName(column.name));
    if (missing.length === 0) return;

    await queryRunner.addColumns(
      'conversations',
      missing.map((column) => new TableColumn(column)),
    );
  }

  /**
   * Bring an existing `poems` table in line with the entity that owns it.
   *
   * `poems` used to be declared twice: the poetry module's entity, and a
   * legacy `database/entities/poem.entity.ts` that nothing imported. The
   * legacy one contributed `author`, `dynasty`, `translation`,
   * `appreciation`, `popularity` and `firstChar` — columns no code ever
   * read from the main database, two of them `NOT NULL` and therefore
   * impossible for any writer to satisfy. They are removed here.
   *
   * The poetry module's own columns are added first, because a database
   * that was created before the poetry entities were registered can be
   * missing them, and dropping the legacy columns from such a table would
   * leave it unusable. Everything added is nullable, so this is safe on a
   * table that already holds rows.
   *
   * Foreign keys are not retro-fitted: SQLite cannot add a constraint
   * without rebuilding the table, and every database that `synchronize`
   * built already has them.
   */
  private async reconcilePoems(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('poems');
    if (!table) return;

    const poetryColumns: TableColumnOptions[] = [
      { name: 'author_id', type: 'integer', isNullable: true },
      { name: 'dynasty_id', type: 'integer', isNullable: true },
      { name: 'type', type: 'varchar', isNullable: true },
      { name: 'title_zh_hant', type: 'varchar', isNullable: true },
      { name: 'content_zh_hant', type: 'text', isNullable: true },
    ];
    const missing = poetryColumns.filter((column) => !table.findColumnByName(column.name));
    if (missing.length > 0) {
      await queryRunner.addColumns(
        'poems',
        missing.map((column) => new TableColumn(column)),
      );
    }

    const legacy = ['author', 'dynasty', 'translation', 'appreciation', 'popularity', 'firstChar'];
    const present = legacy.filter((name) => table.findColumnByName(name));
    if (present.length > 0) {
      await queryRunner.dropColumns('poems', present);
    }
  }

  /**
   * Create a table only if it is missing.
   *
   * On a database that `synchronize` already populated this is a no-op —
   * which is the whole point of a baseline added after the fact.
   */
  private async create(queryRunner: QueryRunner, table: Table): Promise<void> {
    await queryRunner.createTable(table, true);
  }

  /**
   * Index creation is best-effort.
   *
   * `ifNotExists` is portable on tables but not on indexes, and this
   * migration is expected to run against databases where `synchronize`
   * already created the same indexes. A duplicate-index error must not
   * abort the migration.
   */
  private async index(
    queryRunner: QueryRunner,
    table: string,
    name: string,
    columns: string[],
    isUnique = false,
  ): Promise<void> {
    try {
      await queryRunner.createIndex(
        table,
        new TableIndex({ name, columnNames: columns, isUnique }),
      );
    } catch {
      // Already present — the schema is what we wanted either way.
    }
  }

  private fk(name: string, column: string, referencedTable: string): TableForeignKey {
    return new TableForeignKey({
      name,
      columnNames: [column],
      referencedTableName: referencedTable,
      referencedColumnNames: ['id'],
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    });
  }

  private cascadeToBookSkill(name: string): TableForeignKey {
    return new TableForeignKey({
      name,
      columnNames: ['bookSkillId'],
      referencedTableName: 'book_skills',
      referencedColumnNames: ['id'],
      onDelete: 'CASCADE',
      onUpdate: 'NO ACTION',
    });
  }
}
