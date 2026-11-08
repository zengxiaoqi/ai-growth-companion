import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { loadSafetyRules, type CompiledTerm, type SafetyRuleSet } from './safety-rules';
import type { SafetyCategory, SafetyFlag } from './safety.types';

/** Characters kept around a match in the audit snippet. */
const SNIPPET_CONTEXT = 10;

/**
 * First-layer rule detector.
 *
 * A local word-list matcher that turns a message into safety flags in
 * well under a millisecond — no LLM, no network, no model files. Its
 * independence from the dialogue LLM is the whole point: a child saying
 * 「救命」 gets intercepted even if every model backend is down.
 *
 * The honest scope statement applies: a word list only catches explicit
 * cries for help. It is the fast floor, not the safety net; the async
 * classifier owns the implicit signals.
 *
 * Ported from 碎碎念 `agent/safety/detector.py`.
 */
@Injectable()
export class SafetyDetector implements OnModuleInit {
  private readonly logger = new Logger(SafetyDetector.name);
  private rules: SafetyRuleSet = { terms: [], origin: 'builtin' };

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const filePath = this.configService.get<string>('SAFETY_RULES_FILE');
    this.rules = loadSafetyRules(filePath);
    if (this.rules.origin === 'builtin') {
      this.logger.warn(
        `safety word lists: using built-in table (${this.rules.reason ?? 'no file'})`,
      );
    } else {
      this.logger.log(`safety word lists loaded: ${this.rules.terms.length} terms`);
    }
  }

  /** Which table is actually in force; surfaced for the health check. */
  get origin(): 'file' | 'builtin' {
    return this.rules.origin;
  }

  /** Term count, exposed for tests and diagnostics. */
  get termCount(): number {
    return this.rules.terms.length;
  }

  /**
   * Return one flag per distinct (category, term) hit.
   *
   * Duplicate hits of the same term collapse; two different terms in one
   * category stay separate, because 「救命」 and 「有坏人」 in the same
   * sentence is stronger evidence than either alone.
   */
  detect(text: string | null | undefined): SafetyFlag[] {
    if (!text) return [];
    const flags: SafetyFlag[] = [];
    const seen = new Set<string>();
    for (const [category, term] of this.rules.terms as CompiledTerm[]) {
      const key = `${category}\u0000${term}`;
      if (seen.has(key)) continue;
      if (!text.includes(term)) continue;
      seen.add(key);
      flags.push({
        category,
        level: 'critical',
        source: 'rules',
        snippet: snippet(text, term),
      });
    }
    return flags;
  }

  /** Categories present in `flags`, deduplicated, order-stable. */
  static categoriesOf(flags: SafetyFlag[]): SafetyCategory[] {
    const seen = new Set<SafetyCategory>();
    const out: SafetyCategory[] = [];
    for (const flag of flags) {
      if (seen.has(flag.category)) continue;
      seen.add(flag.category);
      out.push(flag.category);
    }
    return out;
  }
}

/** A short excerpt around the match, for the audit trail only. */
function snippet(text: string, term: string): string {
  const position = text.indexOf(term);
  if (position < 0) return '';
  const start = Math.max(position - SNIPPET_CONTEXT, 0);
  const end = Math.min(position + term.length + SNIPPET_CONTEXT, text.length);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.slice(start, end)}${suffix}`;
}
