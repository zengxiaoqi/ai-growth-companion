/**
 * Single source of truth for the learning-domain enumeration.
 *
 * LEARNING_DOMAINS (the const tuple) is the canonical member list AND order.
 * LEARNING_DOMAIN_CATALOG is a Record keyed by LearningDomain, so adding a key
 * to the tuple without a catalog entry is a compile error (exhaustiveness guard).
 * Report / bento / ability-tool / recommend layers derive their lists, labels
 * and validation whitelists from here instead of re-declaring string literals.
 *
 * Maintained in parallel with the Flutter registry at
 * src/frontend/lib/utils/domain_registry.dart (no shared codegen) — keep the
 * key set, order and canonical labels identical on both sides.
 */

export const LEARNING_DOMAINS = [
  'language',
  'math',
  'science',
  'art',
  'social',
  'english',
] as const;

export type LearningDomain = (typeof LEARNING_DOMAINS)[number];

export interface LearningDomainDescriptor {
  /** Long display label, e.g. 语言表达 */
  label: string;
  /** Short display label, e.g. 语言 */
  shortLabel: string;
  color?: string;
  emoji?: string;
}

export const LEARNING_DOMAIN_CATALOG: Record<
  LearningDomain,
  LearningDomainDescriptor
> = {
  language: { label: '语言表达', shortLabel: '语言' },
  math: { label: '数学逻辑', shortLabel: '数学' },
  science: { label: '科学探索', shortLabel: '科学' },
  art: { label: '艺术创造', shortLabel: '艺术' },
  social: { label: '社会交往', shortLabel: '社交' },
  english: { label: '英语能力', shortLabel: '英语' },
};

/** Canonical iteration order (bento templates keep this name). */
export const DOMAIN_ORDER: readonly LearningDomain[] = LEARNING_DOMAINS;

export const LEARNING_DOMAIN_SET: ReadonlySet<string> = new Set<string>(
  LEARNING_DOMAINS,
);

export function isLearningDomain(value: unknown): value is LearningDomain {
  return typeof value === 'string' && LEARNING_DOMAIN_SET.has(value);
}

/** Long label; unknown domains fall back to the raw key. */
export function domainLabel(key: string): string {
  return isLearningDomain(key) ? LEARNING_DOMAIN_CATALOG[key].label : key;
}

/** Short label; unknown domains fall back to the raw key. */
export function domainShortLabel(key: string): string {
  return isLearningDomain(key) ? LEARNING_DOMAIN_CATALOG[key].shortLabel : key;
}