/**
 * knowledge-card-registry — sync in-memory hooks so question/course generation
 * (AiModule) can read knowledge cards owned by LearningModule without a
 * circular DI dependency. KnowledgeCardService registers both hooks on init.
 */

import type { KnowledgeCardFact } from '../../database/entities/knowledge-card.entity';

export interface KnowledgeCardView {
  topic: string;
  aliases: string[];
  ageGroup: string;
  domain?: string | null;
  facts: KnowledgeCardFact[];
  misconceptions: string[];
  vocabulary: string[];
  quizSeeds: Array<{ question: string; options: string[]; answer: string }>;
}

type CardLookup = (topic: string, ageGroup: string) => KnowledgeCardView | null;
type CardEnsurer = (
  topic: string,
  ageGroup: string,
  domain?: string,
) => Promise<KnowledgeCardView | null>;

let lookupHook: CardLookup | null = null;
let ensurerHook: CardEnsurer | null = null;

export function registerKnowledgeCardLookup(hook: CardLookup | null): void {
  lookupHook = hook;
}

export function registerKnowledgeCardEnsurer(hook: CardEnsurer | null): void {
  ensurerHook = hook;
}

/** Sync lookup for prompt injection. Returns null when no card matches. */
export function findKnowledgeCard(topic: string, ageGroup: string): KnowledgeCardView | null {
  if (!lookupHook || !topic?.trim()) return null;
  try {
    return lookupHook(topic.trim(), ageGroup);
  } catch {
    return null;
  }
}

/** Async lookup-or-create for course generation. Never throws. */
export async function ensureKnowledgeCard(
  topic: string,
  ageGroup: string,
  domain?: string,
): Promise<KnowledgeCardView | null> {
  if (!ensurerHook || !topic?.trim()) return null;
  try {
    return await ensurerHook(topic.trim(), ageGroup, domain);
  } catch {
    return null;
  }
}

/** Facts as prompt/judge-ready lines. */
export function knowledgeCardFactLines(card: KnowledgeCardView): string[] {
  return card.facts.map((f) => `${f.unit}：${f.fact}`);
}