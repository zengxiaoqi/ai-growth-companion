/**
 * English practice level helpers — pure functions, no DB access.
 *
 * The english-practice coach adapts to a three-band level (L1/L2/L3) whose
 * score thresholds deliberately mirror AbilitiesService.getLevel
 * (beginner <60, intermediate 60-79, advanced ≥80). Cold start uses age only
 * and never writes a synthetic baseline row, so the parent trend chart's first
 * point is a real assessment and the EMA first-write keeps the raw score.
 */

export type EnglishLevel = 'L1' | 'L2' | 'L3';

export interface EnglishProfile {
  level: EnglishLevel;
  score: number | null;
  source: 'assessment' | 'cold-start';
}

/** Age-based default before any assessment exists: 3-4 → L1, otherwise L2. */
export function coldStartEnglishLevel(ageGroup: string): EnglishLevel {
  return ageGroup === '3-4' ? 'L1' : 'L2';
}

/** Map a 0-100 score to a level band (aligned with AbilitiesService.getLevel). */
export function scoreToEnglishLevel(score: number): EnglishLevel {
  if (score >= 80) return 'L3';
  if (score >= 60) return 'L2';
  return 'L1';
}

/** Resolve the current profile from the latest assessment, or cold-start by age. */
export function resolveEnglishProfile(
  latest: { score: number } | null | undefined,
  ageGroup: string,
): EnglishProfile {
  if (latest && typeof latest.score === 'number') {
    return {
      level: scoreToEnglishLevel(latest.score),
      score: latest.score,
      source: 'assessment',
    };
  }
  return { level: coldStartEnglishLevel(ageGroup), score: null, source: 'cold-start' };
}