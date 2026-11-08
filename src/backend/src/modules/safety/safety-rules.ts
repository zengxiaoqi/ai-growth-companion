import { readFileSync } from 'node:fs';
import type { SafetyCategory } from './safety.types';
import { SAFETY_CATEGORIES } from './safety.types';

/**
 * The same words as `config/safety_rules.yaml`. Kept in code because the
 * file is *augmentable* — deleting it must leave the shipped detection
 * intact, not disarm it (fail-closed).
 *
 * Ported verbatim from 碎碎念 `agent/safety/detector.py`.
 */
export const DEFAULT_RULES: Record<SafetyCategory, string[]> = {
  self_harm: ['想死', '不想活', '活着没意思', '伤害自己', '打自己', '自杀'],
  violence: ['有人打我', '打我了', '别打我', '欺负我', '他碰我', '她碰我', '有人欺负'],
  danger: ['救命', '着火了', '失火了', '有坏人', '坏人来了', '快跑啊', '救我'],
};

/** One compiled (category, term) pair. */
export type CompiledTerm = [SafetyCategory, string];

export interface SafetyRuleSet {
  terms: CompiledTerm[];
  /** `file` when the YAML was usable, `builtin` after any failure. */
  origin: 'file' | 'builtin';
  /** Why the file was rejected — logged once at startup. */
  reason?: string;
}

export function builtinRuleSet(reason?: string): SafetyRuleSet {
  const terms: CompiledTerm[] = [];
  for (const category of SAFETY_CATEGORIES) {
    for (const term of DEFAULT_RULES[category]) {
      terms.push([category, term]);
    }
  }
  return { terms, origin: 'builtin', reason };
}

/**
 * Parse the documented shape without a YAML dependency:
 *
 * ```yaml
 * categories:
 *   self_harm:
 *     terms:
 *       - 想死
 * ```
 *
 * The backend ships no YAML parser of its own, and the file's shape is
 * fixed and documented, so a 40-line reader beats adding a dependency to
 * parse six keys. Anything unexpected returns an empty list, which the
 * caller treats as "file unusable" and falls back to the built-in table —
 * the same fail-closed path as a malformed YAML.
 */
export function parseSafetyRulesYaml(source: string): CompiledTerm[] {
  const terms: CompiledTerm[] = [];
  let inCategories = false;
  let current: SafetyCategory | null = null;
  let inTerms = false;
  let currentIndent = -1;

  for (const rawLine of source.split(/\r?\n/)) {
    const withoutComment = stripComment(rawLine);
    if (!withoutComment.trim()) continue;
    const indent = withoutComment.length - withoutComment.trimStart().length;
    const line = withoutComment.trim();

    if (!inCategories) {
      if (/^categories\s*:\s*$/.test(line)) inCategories = true;
      continue;
    }

    // A top-level key other than `categories` ends the section.
    if (indent === 0 && !line.startsWith('-')) break;

    // `terms:` is checked *before* the category pattern on purpose:
    // `terms` matches `[a-z_]+:` just as well as a category name does, and
    // treating it as one would silently empty the list.
    if (/^terms\s*:\s*$/.test(line)) {
      inTerms = current != null;
      continue;
    }

    const inlineMatch = /^terms\s*:\s*\[(.*)\]\s*$/.exec(line);
    if (inlineMatch) {
      if (current) {
        for (const piece of inlineMatch[1].split(',')) {
          const term = unquote(piece.trim());
          if (term) terms.push([current, term]);
        }
      }
      inTerms = current != null;
      continue;
    }

    const categoryMatch = /^([a-z_]+)\s*:\s*$/.exec(line);
    if (categoryMatch) {
      const name = categoryMatch[1];
      if ((SAFETY_CATEGORIES as readonly string[]).includes(name)) {
        current = name as SafetyCategory;
        currentIndent = indent;
        inTerms = false;
      } else {
        // Unknown category: skip its block rather than guessing a mapping.
        current = null;
        inTerms = false;
      }
      continue;
    }

    const itemMatch = /^-\s*(.+)$/.exec(line);
    if (itemMatch && current && inTerms) {
      const term = unquote(itemMatch[1].trim());
      if (term) terms.push([current, term]);
      continue;
    }

    // Indentation dropped below the category: leave this block.
    if (current && indent <= currentIndent) {
      current = null;
      inTerms = false;
    }
  }

  return terms;
}

/**
 * Read the word lists, falling back to the built-in table.
 *
 * A missing or malformed file keeps the built-in list: a deployer who
 * fat-fingers the YAML must not silently run with no safety detection.
 */
export function loadSafetyRules(filePath?: string): SafetyRuleSet {
  if (!filePath) return builtinRuleSet('no rules file configured');
  let source: string;
  try {
    source = readFileSync(filePath, 'utf8');
  } catch (err) {
    return builtinRuleSet(`could not read ${filePath}: ${(err as Error).message}`);
  }
  const terms = parseSafetyRulesYaml(source);
  if (terms.length === 0) {
    return builtinRuleSet(`no terms found in ${filePath}`);
  }
  return { terms, origin: 'file' };
}

function stripComment(line: string): string {
  const hash = line.indexOf('#');
  if (hash < 0) return line;
  // Only treat `#` as a comment when it starts the line or follows space,
  // so a term like `#1` is not silently truncated.
  const before = line.slice(0, hash);
  if (hash === 0 || /\s$/.test(before)) return before;
  return line;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}
