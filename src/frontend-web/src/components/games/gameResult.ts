import type { ActivityResult } from '@/types';

/**
 * Shared ActivityResult builder for parameterized games (plan B).
 *
 * All new activity types must go through this helper so score is always a
 * 0-100 percentage and correctAnswers/totalQuestions stay consistent with the
 * existing `/assignments/:id/complete` write-back path.
 */
export interface GameResultInput {
  correctAnswers: number;
  totalQuestions: number;
  startedAt?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interactionData?: Record<string, any>;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export function buildGameResult(input: GameResultInput): ActivityResult {
  const total = clampInt(input.totalQuestions, 0, 1000);
  const correct = clampInt(input.correctAnswers, 0, total);
  const timeSpent =
    typeof input.startedAt === 'number' && Number.isFinite(input.startedAt)
      ? Math.max(0, Math.round((Date.now() - input.startedAt) / 1000))
      : undefined;

  return {
    score: total > 0 ? Math.round((correct / total) * 100) : 0,
    totalQuestions: total,
    correctAnswers: correct,
    ...(timeSpent === undefined ? {} : { timeSpent }),
    interactionData: input.interactionData ?? {},
  };
}
