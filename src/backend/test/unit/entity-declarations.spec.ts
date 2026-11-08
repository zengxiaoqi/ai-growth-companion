/**
 * Guard: one table, one `@Entity()` class.
 *
 * TypeORM builds a schema per entity metadata. When two classes claim the
 * same table, `synchronize` cannot satisfy both: it ALTERs towards whichever
 * definition it processed last, and the next boot ALTERs back. The table is
 * rebuilt on every start, and any migration baseline written for it is
 * invalid the moment the other copy changes a column.
 *
 * That is not hypothetical — it happened twice in this codebase (`poems` and
 * `conversations`), and both times the symptom showed up as unexplained
 * churn rather than as an error. This test turns the symptom into a failing
 * assertion at the point the second declaration is introduced.
 *
 * It reads source text rather than entity metadata on purpose: metadata is
 * keyed by class, so a duplicate class would simply be a second entry and
 * nothing downstream would complain.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

const SRC_ROOT = join(__dirname, '../../src');

/** Every `*.entity.ts` file under `src/`, recursively. */
function entityFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...entityFiles(full));
    } else if (entry.endsWith('.entity.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Strip comments before scanning.
 *
 * Without this the doc comments that *explain* the rule match the pattern
 * that enforces it — `conversation.entity.ts` mentions
 * `@Entity('conversations')` twice while discussing the duplicate, which
 * reads as three declarations of the table.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

interface Declaration {
  table: string;
  file: string;
}

/**
 * `@Entity('name')` and bare `@Entity()` (which infers the table name from
 * the class). The bare form is reported with a placeholder so a duplicate
 * cannot hide behind it.
 */
function declarationsIn(file: string): Declaration[] {
  const source = stripComments(readFileSync(file, 'utf8'));
  const found: Declaration[] = [];
  const named = /@Entity\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = named.exec(source)) !== null) {
    found.push({ table: match[1], file: relative(SRC_ROOT, file).split(sep).join('/') });
  }
  if (/@Entity\(\s*\)/.test(source)) {
    found.push({
      table: '<inferred>',
      file: relative(SRC_ROOT, file).split(sep).join('/'),
    });
  }
  return found;
}

describe('entity declarations', () => {
  const declarations = entityFiles(SRC_ROOT).flatMap(declarationsIn);

  const byTable = new Map<string, string[]>();
  for (const { table, file } of declarations) {
    byTable.set(table, [...(byTable.get(table) ?? []), file]);
  }

  it('finds the entities at all (guards against the walker silently finding nothing)', () => {
    expect(declarations.length).toBeGreaterThan(30);
  });

  it('never declares the same table twice', () => {
    const duplicates = [...byTable.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([table, files]) => `${table}: ${files.join(', ')}`);

    expect(duplicates).toEqual([]);
  });

  it('declares conversations and conversation_messages exactly once', () => {
    // Named explicitly so a future refactor that renames the table still
    // has to come here and say so, rather than quietly reintroducing a
    // second copy under a new name.
    expect(byTable.get('conversations')).toEqual([
      'database/entities/conversation.entity.ts',
    ]);
    expect(byTable.get('conversation_messages')).toEqual([
      'database/entities/conversation.entity.ts',
    ]);
  });

  it('declares poems exactly once', () => {
    // The legacy `database/entities/poem.entity.ts` that used to be the
    // second declaration is gone; this pins that it stays gone.
    expect(byTable.get('poems')).toHaveLength(1);
  });
});
