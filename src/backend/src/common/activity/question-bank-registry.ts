/**
 * question-bank-registry — async hooks so the generation chains (AiModule /
 * agent-framework) and completion paths (assignment / learning) can use the
 * question bank owned by GameModule without circular DI. QuestionBankService
 * registers on init; every wrapper is failure-proof (bank is best-effort).
 */

export interface QuestionBankSelectQuery {
  topic: string;
  ageGroup: string;
  type: string;
  difficulty?: number;
  childId?: number;
  count: number;
}

interface QuestionBankHooks {
  ingest: (activity: any, source?: string) => Promise<void>;
  select: (query: QuestionBankSelectQuery) => Promise<any | null>;
  recordResults: (childId: number, activity: any, result: any) => Promise<void>;
}

let hooks: QuestionBankHooks | null = null;

export function registerQuestionBankHooks(impl: QuestionBankHooks | null): void {
  hooks = impl;
}

/** Fire-and-forget ingest after successful generation. */
export function bankIngest(activity: any, source = 'llm'): void {
  if (!hooks || !activity) return;
  hooks.ingest(activity, source).catch(() => {
    // best-effort: generation must never fail because of the bank
  });
}

/** Returns a ready activity from the bank, or null when the bank can't serve. */
export async function bankSelect(query: QuestionBankSelectQuery): Promise<any | null> {
  if (!hooks) return null;
  try {
    return await hooks.select(query);
  } catch {
    return null;
  }
}

/** Fire-and-forget per-question feedback after a child finishes. */
export function bankRecordResults(childId: number, activity: any, result: any): void {
  if (!hooks || !activity || !result || !Number.isFinite(childId)) return;
  hooks.recordResults(childId, activity, result).catch(() => {
    // best-effort
  });
}