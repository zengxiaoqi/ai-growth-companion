/**
 * One-shot cold start: static curriculum JSONs → knowledge_cards.
 * Facts come from the human-authored curriculum (source: 'curriculum'),
 * so cards land as 'active' without LLM review. Existing rows are never
 * overwritten — manual edits win.
 *
 * Run from src/backend:
 *   npx ts-node scripts/seed-knowledge-cards.ts [dbPath]
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { KnowledgeCard } from '../src/database/entities/knowledge-card.entity';
import { CreateKnowledgeCards1794600000000 } from '../src/database/migrations/1794600000000-CreateKnowledgeCards';
import { getCoursePackCurriculumSeed } from '../src/modules/learning/course-curriculum-fallback';
import { cardFromCurriculumSeed } from '../src/modules/learning/knowledge-card.service';

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
    entities: [KnowledgeCard],
    synchronize: false,
    logging: false,
  } as any);
  await dataSource.initialize();

  const runner = dataSource.createQueryRunner();
  if (!(await runner.hasTable('knowledge_cards'))) {
    await new CreateKnowledgeCards1794600000000().up(runner);
    console.log('created knowledge_cards table');
  }
  await runner.release();

  const repo = dataSource.getRepository(KnowledgeCard);
  let created = 0;
  let skipped = 0;

  for (const { ageGroup, dir } of AGE_DIRS) {
    const contentDir = path.resolve(__dirname, '../../content', dir);
    if (!fs.existsSync(contentDir)) {
      console.warn(`content dir missing: ${contentDir}`);
      continue;
    }
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

      const existing = await repo.findOne({ where: { topic, ageGroup } });
      if (existing) {
        skipped += 1;
        continue;
      }
      const seed = getCoursePackCurriculumSeed({ topic, ageGroup, domain: record.domain as any });
      if (!seed) {
        skipped += 1;
        continue;
      }
      const data = cardFromCurriculumSeed(topic, ageGroup, record.domain, seed);
      if (!data.facts || data.facts.length === 0) {
        skipped += 1;
        continue;
      }
      await repo.save(repo.create(data));
      created += 1;
      console.log(`+ ${ageGroup} ${topic} (${data.facts.length} facts, ${data.status})`);
    }
  }

  console.log(`done: created=${created} skipped=${skipped}`);
  await dataSource.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});