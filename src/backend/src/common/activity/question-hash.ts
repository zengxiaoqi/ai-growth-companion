/**
 * question-hash — stable identity for bank questions.
 *
 * The hash is the join key across the whole loop: ingest dedups on it,
 * select excludes recently served hashes, and result feedback aligns
 * answers to questions by recomputing it from the stored activity.
 * Option order does not affect identity (shuffled options = same question).
 */

import { createHash } from 'crypto';

const ITEM_LIST_KEY: Record<string, string> = {
  quiz: 'questions',
  true_false: 'statements',
  fill_blank: 'sentences',
};

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function sha1(text: string): string {
  return createHash('sha1').update(text).digest('hex');
}

function stripVolatileKeys(value: any, keys: Set<string>): any {
  if (Array.isArray(value)) return value.map((v) => stripVolatileKeys(v, keys));
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (!keys.has(k)) out[k] = stripVolatileKeys(v, keys);
    }
    return out;
  }
  return value;
}

/** Hash of one quiz/statement/sentence item (or a whole group activity). */
export function computeQuestionHash(activityType: string, item: any): string {
  if (activityType === 'quiz') {
    const options = (Array.isArray(item?.options) ? item.options : [])
      .map(normalizeText)
      .sort();
    return sha1(`quiz|${normalizeText(item?.question)}|${options.join('|')}`);
  }
  if (activityType === 'true_false') {
    return sha1(`true_false|${normalizeText(item?.statement)}|${item?.isCorrect === true}`);
  }
  if (activityType === 'fill_blank') {
    const options = (Array.isArray(item?.options) ? item.options : [])
      .map(normalizeText)
      .sort();
    return sha1(`fill_blank|${normalizeText(item?.text)}|${options.join('|')}`);
  }
  // Group types (matching / connection / drag_sort / ...): one row per activity.
  const canonical = stripVolatileKeys(item, new Set(['id', 'matchId', 'uuid', 'servedQuestionIds']));
  if (Array.isArray(canonical?.pairs)) {
    canonical.pairs.sort((a: any, b: any) =>
      normalizeText(a?.left).localeCompare(normalizeText(b?.left)),
    );
  }
  return sha1(`${activityType}|${JSON.stringify(canonical ?? {})}`);
}

/** Split an activity into bank items (per-question for item types, whole for groups). */
export function splitActivityItems(activity: any): any[] {
  const type = String(activity?.type ?? '');
  const listKey = ITEM_LIST_KEY[type];
  if (listKey) {
    return Array.isArray(activity?.[listKey]) ? activity[listKey].filter(Boolean) : [];
  }
  return activity ? [activity] : [];
}

/** Hashes parallel to splitActivityItems output. */
export function computeActivityQuestionHashes(activity: any): string[] {
  const type = String(activity?.type ?? '');
  return splitActivityItems(activity).map((item) => computeQuestionHash(type, item));
}

/**
 * Per-item correctness from a game result, aligned with splitActivityItems.
 * Returns null when the result carries no usable answer data.
 *
 * Frontend shapes (no client change needed):
 * - quiz: interactionData.answers = selected option indexes
 * - true_false: interactionData.answers = booleans
 * - fill_blank: interactionData.userAnswers = strings
 * - group types: aggregate correctAnswers/score vs totalQuestions
 */
export function extractItemCorrectness(activity: any, result: any): boolean[] | null {
  const type = String(activity?.type ?? '');
  const items = splitActivityItems(activity);
  if (items.length === 0 || !result) return null;
  const interaction = result.interactionData ?? {};

  if (type === 'quiz') {
    const answers = interaction.answers ?? result.answers;
    if (!Array.isArray(answers) || answers.length < items.length) return null;
    return items.map((item, i) => Number(answers[i]) === Number(item?.correctIndex));
  }
  if (type === 'true_false') {
    const answers = interaction.answers ?? result.answers;
    if (!Array.isArray(answers) || answers.length < items.length) return null;
    return items.map((item, i) => Boolean(answers[i]) === (item?.isCorrect === true));
  }
  if (type === 'fill_blank') {
    const answers = interaction.userAnswers ?? result.userAnswers;
    if (!Array.isArray(answers) || answers.length < items.length) return null;
    return items.map((item, i) => normalizeText(answers[i]) === normalizeText(item?.answer));
  }

  const total = Number(result.totalQuestions ?? items.length) || items.length;
  const correct = Number(result.correctAnswers ?? result.score ?? 0);
  return [correct >= total / 2];
}