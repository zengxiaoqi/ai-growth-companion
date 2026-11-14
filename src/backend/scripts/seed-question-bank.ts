/**
 * One-shot cold start: static curriculum quizItems → question_items.
 * Human-authored curriculum questions land as source 'curriculum', status
 * 'active'. Hash-dedup means re-runs are idempotent and never clobber rows
 * that already accumulated serving statistics.
 *
 * Run from src/backend:
 *   npx ts-node scripts/seed-question-bank.ts [dbPath]
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { DataSource, In } from 'typeorm';
import { QuestionItem } from '../src/database/entities/question-item.entity';
import { CreateQuestionItems1794700000000 } from '../src/database/migrations/1794700000000-CreateQuestionItems';
import { getCoursePackCurriculumSeed } from '../src/modules/learning/course-curriculum-fallback';
import { computeQuestionHash } from '../src/common/activity/question-hash';

const AGE_DIRS: Array<{ ageGroup: '3-4' | '5-6'; dir: string }> = [
  { ageGroup: '3-4', dir: '3-4-years' },
  { ageGroup: '5-6', dir: '5-6-years' },
];

async function main() {
  const dbPath = process.argv[2] || process.env.DB_PATH || 'lingxi.db';
  // Same driver resolution as AppModule: native better-sqlite3 when the
  // addon loads, sql.js (file-backed, autoSave) otherwise.
  let driverOptions: Record<string, any>;
  try {
    const Database = require('better-sqlite3');
    const probe = new Database(':memory:');
    probe.close();
    driverOptions = { type: 'better-sqlite3', database: dbPath };
  } catch {
    driverOptions = { type: 'sqljs', location: dbPath, autoSave: true };
  }
  const dataSource = new DataSource({
    ...driverOptions,
    entities: [QuestionItem],
    synchronize: false,
    logging: false,
  } as any);
  await dataSource.initialize();

  const runner = dataSource.createQueryRunner();
  if (!(await runner.hasTable('question_items'))) {
    await new CreateQuestionItems1794700000000().up(runner);
    console.log('created question_items table');
  }
  await runner.release();

  const repo = dataSource.getRepository(QuestionItem);
  let created = 0;
  let skipped = 0;

  for (const { ageGroup, dir } of AGE_DIRS) {
    const contentDir = path.resolve(__dirname, '../../content', dir);
    if (!fs.existsSync(contentDir)) {
      console.warn(`content dir missing: ${contentDir}`);
      continue;
    }
    const difficulty = ageGroup === '3-4' ? 1 : 2;

    for (const file of fs.readdirSync(contentDir).filter((f) => f.endsWith('.json'))) {
      let record: { name?: string; title?: string; domain?: string };
      try {
        record = JSON.parse(fs.readFileSync(path.join(contentDir, file), 'utf-8'));
      } catch {
        console.warn(`skip unreadable ${file}`);
        continue;
      }
      const topic = (record.name || record.title || '').trim();
      if (!topic) continue;

      const seed = getCoursePackCurriculumSeed({ topic, ageGroup, domain: record.domain as any });
      const quizItems = seed?.quizItems ?? [];
      if (quizItems.length === 0) {
        skipped += 1;
        continue;
      }

      // Convert curriculum {question, options, answer} → bank quiz payload.
      const payloads = quizItems
        .map((item) => {
          const options = Array.from(new Set(item.options)).slice(0, 6);
          const correctIndex = options.indexOf(item.answer);
          if (!item.question || options.length < 2 || correctIndex < 0) return null;
          return {
            question: item.question,
            options,
            correctIndex,
            explanation: `正确答案是：${item.answer}`,
          };
        })
        .filter(Boolean) as Array<Record<string, any>>;

      const hashes = payloads.map((p) => computeQuestionHash('quiz', p));
      const existing = hashes.length
        ? await repo.find({ where: { questionHash: In(hashes) }, select: ['questionHash'] })
        : [];
      const known = new Set(existing.map((row) => row.questionHash));

      let topicCreated = 0;
      for (let i = 0; i < payloads.length; i += 1) {
        if (known.has(hashes[i])) {
          skipped += 1;
          continue;
        }
        known.add(hashes[i]);
        await repo.save(
          repo.create({
            uuid: randomUUID(),
            topic,
            ageGroup,
            domain: record.domain ?? null,
            difficulty,
            activityType: 'quiz',
            questionHash: hashes[i],
            payload: payloads[i],
            source: 'curriculum',
            status: 'active',
            qualityScore: 100,
          }),
        );
        created += 1;
        topicCreated += 1;
      }
      if (topicCreated > 0) console.log(`+ ${ageGroup} ${topic} (${topicCreated} questions)`);
    }
  }

  console.log(`done: created=${created} skipped=${skipped}`);
  await dataSource.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});