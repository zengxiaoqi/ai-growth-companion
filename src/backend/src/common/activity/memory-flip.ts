/**
 * memory_flip — parameter contract for the memory flip-card activity type.
 *
 * Same plan-B rules as drag-sort.ts: the LLM only ever produces JSON
 * parameters, rendering lives in the clients, and this module is shared by
 * BOTH generateActivity tool chains (legacy `modules/ai/agent/tools` and
 * `agent-framework/tools/impl`).
 *
 * Grid constraint (keeps boards child-friendly and complete):
 *   cards = pairs * 2, rows/cols in [2, 4]  =>  pairs in {2, 3, 4, 6, 8}
 *   2 -> 2x2, 3 -> 2x3, 4 -> 2x4, 6 -> 3x4, 8 -> 4x4
 *
 * Inference pitfall (same class as drag_sort's `items`): memory_flip carries
 * `pairs`, which the legacy structural inference maps to `matching`. Every
 * inference path MUST check `pairs + gridSize -> memory_flip` BEFORE the
 * generic `pairs -> matching` fallback or the payload is silently mis-typed.
 */

export interface MemoryFlipPair {
  id: string;
  label: string;
  icon?: string;
}

export interface MemoryFlipGridSize {
  rows: number;
  cols: number;
}

export interface MemoryFlipActivity {
  type: 'memory_flip';
  title: string;
  topic: string;
  ageGroup: string;
  domain?: string;
  prompt?: string;
  pairs: MemoryFlipPair[];
  gridSize: MemoryFlipGridSize;
  passingScore: number;
  timeLimitSec: number;
}

export interface MemoryFlipValidation {
  ok: boolean;
  reason?: string;
  /** Score produced by a perfect playthrough (0-100). */
  score?: number;
  total?: number;
}

export interface MemoryFlipPlaythrough {
  ok: boolean;
  reason?: string;
  score: number;
  total: number;
  /** Perfect playthrough: each pair is found with exactly one miss-free flip set. */
  flips: Array<{ pairId: string; cardA: string; cardB: string }>;
}

export const MEMORY_FLIP_LIMITS = {
  minPairs: 2,
  maxPairs: 8,
  minGridSide: 2,
  maxGridSide: 4,
  maxTitleLength: 40,
  maxPromptLength: 60,
  maxLabelLength: 12,
  maxIconLength: 8,
  minTimeLimitSec: 60,
  maxTimeLimitSec: 300,
  defaultPassingScore: 80,
  defaultTimeLimitSec: 180,
} as const;

/** Child-friendly boards: every legal pair count maps to exactly one grid. */
const PAIR_GRID: Record<number, MemoryFlipGridSize> = {
  2: { rows: 2, cols: 2 },
  3: { rows: 2, cols: 3 },
  4: { rows: 2, cols: 4 },
  6: { rows: 3, cols: 4 },
  8: { rows: 4, cols: 4 },
};

/** Backwards-compatible export for tests and client-side validation. */
export const MEMORY_FLIP_GRIDS: Readonly<Record<number, MemoryFlipGridSize>> = PAIR_GRID;

/**
 * Anything that could turn a "parameter" into executable content or a network
 * reference is rejected. Emoji and plain Chinese text are fine.
 */
const UNSAFE_TEXT_RE =
  /<\/?[a-z]|javascript:|data:text\/html|https?:\/\/|\/\/|on(?:click|error|load)\s*=|[\u0000-\u001f]/i;

function charLength(value: string): number {
  return Array.from(value).length;
}

export function isSafeParamText(value: string): boolean {
  return !UNSAFE_TEXT_RE.test(value);
}

function toText(value: unknown, fallback = ''): string {
  if (value == null) return fallback;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function toInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safeText(value: unknown, field: string, maxLength: number, fallback = ''): string {
  const text = toText(value, fallback);
  if (!text) return '';
  if (!isSafeParamText(text)) {
    throw new Error(`${field} contains forbidden markup, script or URL`);
  }
  if (charLength(text) > maxLength) {
    throw new Error(`${field} is too long (max ${maxLength} chars)`);
  }
  return text;
}

function safeId(value: unknown, fallback: string): string {
  const raw = toText(value, fallback)
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 32);
  return raw || fallback;
}

function uniqueId(candidate: string, used: Set<string>): string {
  let id = candidate;
  let suffix = 2;
  while (used.has(id)) {
    id = `${candidate.slice(0, 24)}_${suffix++}`;
  }
  used.add(id);
  return id;
}

export interface MemoryFlipContext {
  topic: string;
  ageGroup: string;
  domain?: string;
}

/**
 * Convert untrusted LLM output into a strict, bounded parameter object.
 * Throws with a human-readable reason so the tool's existing 3-attempt
 * reflection loop can feed the failure back to the model.
 */
export function sanitizeMemoryFlipParams(
  raw: any,
  ctx: MemoryFlipContext,
): MemoryFlipActivity {
  const rawPairs = Array.isArray(raw?.pairs) ? raw.pairs : [];
  const usedPairIds = new Set<string>();
  const usedFaces = new Set<string>();
  const pairs: MemoryFlipPair[] = [];

  for (let i = 0; i < rawPairs.length && pairs.length < MEMORY_FLIP_LIMITS.maxPairs; i++) {
    const entry = rawPairs[i];
    const label = safeText(entry?.label, `pairs[${i}].label`, MEMORY_FLIP_LIMITS.maxLabelLength);
    if (!label) continue;
    const icon = safeText(entry?.icon, `pairs[${i}].icon`, MEMORY_FLIP_LIMITS.maxIconLength);
    // Two pairs with an identical face (label+icon) would render as visually
    // identical cards and make "match the pair" ambiguous — reject that.
    const face = `${label}|${icon}`;
    if (usedFaces.has(face)) {
      throw new Error(`pairs[${i}] duplicates an existing label/icon face: ${label}`);
    }
    usedFaces.add(face);
    const id = uniqueId(safeId(entry?.id, `p${i + 1}`), usedPairIds);
    pairs.push(icon ? { id, label, icon } : { id, label });
  }

  if (pairs.length < MEMORY_FLIP_LIMITS.minPairs) {
    throw new Error(
      `memory_flip needs at least ${MEMORY_FLIP_LIMITS.minPairs} valid pairs with unique faces`,
    );
  }

  const pairCount = pairs.length;
  const grid = PAIR_GRID[pairCount];
  if (!grid) {
    throw new Error(
      `memory_flip supports ${Object.keys(PAIR_GRID).join('/')} pairs (got ${pairCount}); no child-friendly grid fits ${pairCount * 2} cards`,
    );
  }

  // If the model supplied a gridSize it must describe the same card count;
  // otherwise trust the derived grid (renderers always use rows*cols slots).
  const rawRows = toInt(raw?.gridSize?.rows, grid.rows);
  const rawCols = toInt(raw?.gridSize?.cols, grid.cols);
  if (rawRows * rawCols !== pairCount * 2) {
    throw new Error(
      `memory_flip gridSize ${rawRows}x${rawCols} does not fit ${pairCount} pairs (${pairCount * 2} cards); expected ${grid.rows}x${grid.cols}`,
    );
  }

  const title = safeText(
    raw?.title,
    'title',
    MEMORY_FLIP_LIMITS.maxTitleLength,
    `${ctx.topic}记忆翻牌`,
  );
  const prompt = safeText(raw?.prompt, 'prompt', MEMORY_FLIP_LIMITS.maxPromptLength);

  const activity: MemoryFlipActivity = {
    type: 'memory_flip',
    title,
    topic: toText(ctx.topic),
    ageGroup: toText(ctx.ageGroup),
    pairs,
    gridSize: { ...grid },
    passingScore: clamp(
      toInt(raw?.passingScore, MEMORY_FLIP_LIMITS.defaultPassingScore),
      0,
      100,
    ),
    timeLimitSec: clamp(
      toInt(raw?.timeLimitSec, MEMORY_FLIP_LIMITS.defaultTimeLimitSec),
      MEMORY_FLIP_LIMITS.minTimeLimitSec,
      MEMORY_FLIP_LIMITS.maxTimeLimitSec,
    ),
  };
  if (ctx.domain) activity.domain = toText(ctx.domain);
  if (prompt) activity.prompt = prompt;

  return activity;
}

/**
 * Deterministic playtest: flip every pair face-up as a perfect player would
 * and check the run reaches COMPLETE with a computable score.
 */
export function simulateMemoryFlipPlay(activity: MemoryFlipActivity): MemoryFlipPlaythrough {
  const total = activity.pairs.length;
  const grid = activity.gridSize;
  const flips = activity.pairs.map((pair) => ({
    pairId: pair.id,
    cardA: `${pair.id}#a`,
    cardB: `${pair.id}#b`,
  }));
  const gridOk =
    grid.rows >= MEMORY_FLIP_LIMITS.minGridSide &&
    grid.cols >= MEMORY_FLIP_LIMITS.minGridSide &&
    grid.rows <= MEMORY_FLIP_LIMITS.maxGridSide &&
    grid.cols <= MEMORY_FLIP_LIMITS.maxGridSide &&
    grid.rows * grid.cols === total * 2;
  const score = total > 0 && gridOk ? Math.round((total / total) * 100) : 0;
  return {
    ok: total > 0 && gridOk && score === 100,
    reason: total > 0
      ? gridOk
        ? undefined
        : 'grid size does not fit pairs'
      : 'no pairs to play',
    score,
    total,
    flips,
  };
}

/** Pure validation used by unit tests and by the retry loop. */
export function validateMemoryFlipParams(value: unknown): MemoryFlipValidation {
  if (!value || typeof value !== 'object') return { ok: false, reason: 'not an object' };
  const activity = value as Partial<MemoryFlipActivity>;

  if (activity.type !== 'memory_flip') return { ok: false, reason: 'type must be memory_flip' };
  if (!Array.isArray(activity.pairs)) return { ok: false, reason: 'pairs must be an array' };
  if (
    activity.pairs.length < MEMORY_FLIP_LIMITS.minPairs ||
    activity.pairs.length > MEMORY_FLIP_LIMITS.maxPairs
  ) {
    return { ok: false, reason: 'pair count out of range' };
  }
  if (!PAIR_GRID[activity.pairs.length]) {
    return {
      ok: false,
      reason: `unsupported pair count ${activity.pairs.length}; legal counts are ${Object.keys(PAIR_GRID).join('/')}`,
    };
  }

  const pairIds = new Set<string>();
  const faces = new Set<string>();
  for (const pair of activity.pairs) {
    if (!pair || typeof pair.id !== 'string' || !pair.id) {
      return { ok: false, reason: 'pair.id missing' };
    }
    if (pairIds.has(pair.id)) return { ok: false, reason: `duplicate pair id ${pair.id}` };
    pairIds.add(pair.id);
    if (!isSafeParamText(pair.label || '') || !pair.label) {
      return { ok: false, reason: `unsafe pair label ${pair.id}` };
    }
    if (charLength(pair.label) > MEMORY_FLIP_LIMITS.maxLabelLength) {
      return { ok: false, reason: `pair label too long ${pair.id}` };
    }
    if (pair.icon && (!isSafeParamText(pair.icon) || charLength(pair.icon) > MEMORY_FLIP_LIMITS.maxIconLength)) {
      return { ok: false, reason: `unsafe pair icon ${pair.id}` };
    }
    const face = `${pair.label}|${pair.icon || ''}`;
    if (faces.has(face)) return { ok: false, reason: `duplicate pair face ${pair.id}` };
    faces.add(face);
  }

  const grid = activity.gridSize;
  if (
    !grid ||
    !Number.isFinite(grid.rows) ||
    !Number.isFinite(grid.cols) ||
    grid.rows < MEMORY_FLIP_LIMITS.minGridSide ||
    grid.cols < MEMORY_FLIP_LIMITS.minGridSide ||
    grid.rows > MEMORY_FLIP_LIMITS.maxGridSide ||
    grid.cols > MEMORY_FLIP_LIMITS.maxGridSide
  ) {
    return { ok: false, reason: 'gridSize out of range (rows/cols must be 2-4)' };
  }
  if (grid.rows * grid.cols !== activity.pairs.length * 2) {
    return {
      ok: false,
      reason: `gridSize ${grid.rows}x${grid.cols} does not fit ${activity.pairs.length} pairs`,
    };
  }

  const passingScore = activity.passingScore ?? MEMORY_FLIP_LIMITS.defaultPassingScore;
  if (!Number.isFinite(passingScore) || passingScore < 0 || passingScore > 100) {
    return { ok: false, reason: 'passingScore must be 0-100' };
  }
  const timeLimitSec = activity.timeLimitSec ?? MEMORY_FLIP_LIMITS.defaultTimeLimitSec;
  if (
    !Number.isFinite(timeLimitSec) ||
    timeLimitSec < MEMORY_FLIP_LIMITS.minTimeLimitSec ||
    timeLimitSec > MEMORY_FLIP_LIMITS.maxTimeLimitSec
  ) {
    return { ok: false, reason: 'timeLimitSec out of range' };
  }

  const play = simulateMemoryFlipPlay(activity as MemoryFlipActivity);
  if (!play.ok) return { ok: false, reason: play.reason || 'playtest failed' };
  return { ok: true, score: play.score, total: play.total };
}

/** Text from the activity body used by the topic-alignment checker. */
export function collectMemoryFlipBodyText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const activity = value as Partial<MemoryFlipActivity>;
  // Never leak into the legacy topic-alignment haystack: other activity types
  // must keep their original body-text behaviour.
  if (activity.type !== 'memory_flip') return '';
  const parts: string[] = [toText(activity.title), toText(activity.prompt)];
  for (const pair of Array.isArray(activity.pairs) ? activity.pairs : []) {
    parts.push(toText(pair?.label), toText(pair?.icon));
  }
  return parts.filter(Boolean).join(' | ');
}
