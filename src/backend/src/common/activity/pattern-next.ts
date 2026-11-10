/**
 * pattern_next — parameter contract for the pattern-recognition activity
 * type ("what comes next in the sequence?").
 *
 * Same plan-B rules as drag-sort.ts / memory-flip.ts: the LLM only ever
 * produces JSON parameters, rendering lives in the clients, and this module
 * is shared by BOTH generateActivity tool chains (legacy
 * `modules/ai/agent/tools` and `agent-framework/tools/impl`).
 *
 * Scoring semantics (child-friendly, consistent across both clients): the
 * child may retry until the correct option is chosen, but only a FIRST-TRY
 * correct answer scores. Score is 100 or 0 with total=1.
 *
 * Inference note: the structural keys are `sequence` + `options`. No legacy
 * activity type uses `sequence`, so inference is unambiguous, but it MUST run
 * before the generic fallbacks for robustness.
 */

export interface PatternNextItem {
  id: string;
  label: string;
  icon?: string;
}

export interface PatternNextOption {
  id: string;
  label: string;
  icon?: string;
}

export interface PatternNextActivity {
  type: 'pattern_next';
  title: string;
  topic: string;
  ageGroup: string;
  domain?: string;
  prompt?: string;
  sequence: PatternNextItem[];
  options: PatternNextOption[];
  answerIndex: number;
  passingScore: number;
  timeLimitSec: number;
}

export interface PatternNextValidation {
  ok: boolean;
  reason?: string;
  /** Score produced by a perfect playthrough (0-100). */
  score?: number;
  total?: number;
}

export interface PatternNextPlaythrough {
  ok: boolean;
  reason?: string;
  score: number;
  total: number;
  /** Deterministic perfect playthrough: pick answerIndex on the first try. */
  correct: boolean;
}

export const PATTERN_NEXT_LIMITS = {
  minSequence: 2,
  maxSequence: 8,
  minOptions: 2,
  maxOptions: 4,
  maxTitleLength: 40,
  maxPromptLength: 60,
  maxLabelLength: 12,
  maxIconLength: 8,
  minTimeLimitSec: 30,
  maxTimeLimitSec: 300,
  defaultPassingScore: 80,
  defaultTimeLimitSec: 120,
} as const;

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

export interface PatternNextContext {
  topic: string;
  ageGroup: string;
  domain?: string;
}

/**
 * Convert untrusted LLM output into a strict, bounded parameter object.
 * Throws with a human-readable reason so the tool's existing 3-attempt
 * reflection loop can feed the failure back to the model.
 */
export function sanitizePatternNextParams(
  raw: any,
  ctx: PatternNextContext,
): PatternNextActivity {
  const rawSequence = Array.isArray(raw?.sequence) ? raw.sequence : [];
  const usedSeqIds = new Set<string>();
  const sequence: PatternNextItem[] = [];

  for (
    let i = 0;
    i < rawSequence.length && sequence.length < PATTERN_NEXT_LIMITS.maxSequence;
    i++
  ) {
    const entry = rawSequence[i];
    const label = safeText(entry?.label, `sequence[${i}].label`, PATTERN_NEXT_LIMITS.maxLabelLength);
    if (!label) continue;
    const icon = safeText(entry?.icon, `sequence[${i}].icon`, PATTERN_NEXT_LIMITS.maxIconLength);
    const id = uniqueId(safeId(entry?.id, `s${i + 1}`), usedSeqIds);
    sequence.push(icon ? { id, label, icon } : { id, label });
  }

  if (sequence.length < PATTERN_NEXT_LIMITS.minSequence) {
    throw new Error(
      `pattern_next needs at least ${PATTERN_NEXT_LIMITS.minSequence} valid sequence items`,
    );
  }

  const rawOptions = Array.isArray(raw?.options) ? raw.options : [];
  const usedOptionIds = new Set<string>();
  const usedOptionLabels = new Set<string>();
  const options: PatternNextOption[] = [];

  for (
    let i = 0;
    i < rawOptions.length && options.length < PATTERN_NEXT_LIMITS.maxOptions;
    i++
  ) {
    const entry = rawOptions[i];
    const label = safeText(entry?.label, `options[${i}].label`, PATTERN_NEXT_LIMITS.maxLabelLength);
    if (!label) continue;
    // Duplicate option labels would make the answer ambiguous for a child.
    if (usedOptionLabels.has(label)) {
      throw new Error(`options[${i}] duplicates an existing option label: ${label}`);
    }
    usedOptionLabels.add(label);
    const icon = safeText(entry?.icon, `options[${i}].icon`, PATTERN_NEXT_LIMITS.maxIconLength);
    const id = uniqueId(safeId(entry?.id, `o${i + 1}`), usedOptionIds);
    options.push(icon ? { id, label, icon } : { id, label });
  }

  if (options.length < PATTERN_NEXT_LIMITS.minOptions) {
    throw new Error(
      `pattern_next needs at least ${PATTERN_NEXT_LIMITS.minOptions} valid options with unique labels`,
    );
  }

  // Zero-based answerIndex; tolerate a 1-based answer from the model before
  // failing, mirroring the quiz tool's resolveCorrectIndex behaviour.
  let answerIndex = toInt(raw?.answerIndex, -1);
  if (answerIndex < 0 || answerIndex >= options.length) {
    const oneBased = answerIndex - 1;
    answerIndex = oneBased >= 0 && oneBased < options.length ? oneBased : -1;
  }
  if (answerIndex < 0) {
    throw new Error(
      `pattern_next answerIndex must point at one of the ${options.length} options`,
    );
  }

  const title = safeText(
    raw?.title,
    'title',
    PATTERN_NEXT_LIMITS.maxTitleLength,
    `${ctx.topic}规律接龙`,
  );
  const prompt = safeText(raw?.prompt, 'prompt', PATTERN_NEXT_LIMITS.maxPromptLength);

  const activity: PatternNextActivity = {
    type: 'pattern_next',
    title,
    topic: toText(ctx.topic),
    ageGroup: toText(ctx.ageGroup),
    sequence,
    options,
    answerIndex,
    passingScore: clamp(
      toInt(raw?.passingScore, PATTERN_NEXT_LIMITS.defaultPassingScore),
      0,
      100,
    ),
    timeLimitSec: clamp(
      toInt(raw?.timeLimitSec, PATTERN_NEXT_LIMITS.defaultTimeLimitSec),
      PATTERN_NEXT_LIMITS.minTimeLimitSec,
      PATTERN_NEXT_LIMITS.maxTimeLimitSec,
    ),
  };
  if (ctx.domain) activity.domain = toText(ctx.domain);
  if (prompt) activity.prompt = prompt;

  return activity;
}

/**
 * Deterministic playtest: pick the declared answer on the first try and check
 * the run reaches COMPLETE with a computable score.
 */
export function simulatePatternNextPlay(activity: PatternNextActivity): PatternNextPlaythrough {
  const ok =
    activity.sequence.length >= PATTERN_NEXT_LIMITS.minSequence &&
    activity.options.length >= PATTERN_NEXT_LIMITS.minOptions &&
    activity.answerIndex >= 0 &&
    activity.answerIndex < activity.options.length;
  return {
    ok,
    reason: ok ? undefined : 'sequence/options/answerIndex do not form a playable question',
    score: ok ? 100 : 0,
    total: 1,
    correct: ok,
  };
}

/** Pure validation used by unit tests and by the retry loop. */
export function validatePatternNextParams(value: unknown): PatternNextValidation {
  if (!value || typeof value !== 'object') return { ok: false, reason: 'not an object' };
  const activity = value as Partial<PatternNextActivity>;

  if (activity.type !== 'pattern_next') return { ok: false, reason: 'type must be pattern_next' };
  if (!Array.isArray(activity.sequence)) return { ok: false, reason: 'sequence must be an array' };
  if (
    activity.sequence.length < PATTERN_NEXT_LIMITS.minSequence ||
    activity.sequence.length > PATTERN_NEXT_LIMITS.maxSequence
  ) {
    return { ok: false, reason: 'sequence length out of range' };
  }
  if (!Array.isArray(activity.options)) return { ok: false, reason: 'options must be an array' };
  if (
    activity.options.length < PATTERN_NEXT_LIMITS.minOptions ||
    activity.options.length > PATTERN_NEXT_LIMITS.maxOptions
  ) {
    return { ok: false, reason: 'option count out of range' };
  }

  const seqIds = new Set<string>();
  for (const item of activity.sequence) {
    if (!item || typeof item.id !== 'string' || !item.id) {
      return { ok: false, reason: 'sequence item id missing' };
    }
    if (seqIds.has(item.id)) return { ok: false, reason: `duplicate sequence id ${item.id}` };
    seqIds.add(item.id);
    if (!isSafeParamText(item.label || '') || !item.label) {
      return { ok: false, reason: `unsafe sequence label ${item.id}` };
    }
    if (charLength(item.label) > PATTERN_NEXT_LIMITS.maxLabelLength) {
      return { ok: false, reason: `sequence label too long ${item.id}` };
    }
    if (item.icon && (!isSafeParamText(item.icon) || charLength(item.icon) > PATTERN_NEXT_LIMITS.maxIconLength)) {
      return { ok: false, reason: `unsafe sequence icon ${item.id}` };
    }
  }

  const optionIds = new Set<string>();
  const optionLabels = new Set<string>();
  for (const option of activity.options) {
    if (!option || typeof option.id !== 'string' || !option.id) {
      return { ok: false, reason: 'option id missing' };
    }
    if (optionIds.has(option.id)) return { ok: false, reason: `duplicate option id ${option.id}` };
    optionIds.add(option.id);
    if (!isSafeParamText(option.label || '') || !option.label) {
      return { ok: false, reason: `unsafe option label ${option.id}` };
    }
    if (charLength(option.label) > PATTERN_NEXT_LIMITS.maxLabelLength) {
      return { ok: false, reason: `option label too long ${option.id}` };
    }
    if (option.icon && (!isSafeParamText(option.icon) || charLength(option.icon) > PATTERN_NEXT_LIMITS.maxIconLength)) {
      return { ok: false, reason: `unsafe option icon ${option.id}` };
    }
    if (optionLabels.has(option.label)) {
      return { ok: false, reason: `duplicate option label ${option.label}` };
    }
    optionLabels.add(option.label);
  }

  if (
    !Number.isFinite(activity.answerIndex) ||
    activity.answerIndex < 0 ||
    activity.answerIndex >= activity.options.length
  ) {
    return { ok: false, reason: 'answerIndex must point at an existing option' };
  }

  const passingScore = activity.passingScore ?? PATTERN_NEXT_LIMITS.defaultPassingScore;
  if (!Number.isFinite(passingScore) || passingScore < 0 || passingScore > 100) {
    return { ok: false, reason: 'passingScore must be 0-100' };
  }
  const timeLimitSec = activity.timeLimitSec ?? PATTERN_NEXT_LIMITS.defaultTimeLimitSec;
  if (
    !Number.isFinite(timeLimitSec) ||
    timeLimitSec < PATTERN_NEXT_LIMITS.minTimeLimitSec ||
    timeLimitSec > PATTERN_NEXT_LIMITS.maxTimeLimitSec
  ) {
    return { ok: false, reason: 'timeLimitSec out of range' };
  }

  const play = simulatePatternNextPlay(activity as PatternNextActivity);
  if (!play.ok) return { ok: false, reason: play.reason || 'playtest failed' };
  return { ok: true, score: play.score, total: play.total };
}

/** Text from the activity body used by the topic-alignment checker. */
export function collectPatternNextBodyText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const activity = value as Partial<PatternNextActivity>;
  // Never leak into the legacy topic-alignment haystack: other activity types
  // must keep their original body-text behaviour.
  if (activity.type !== 'pattern_next') return '';
  const parts: string[] = [toText(activity.title), toText(activity.prompt)];
  for (const item of Array.isArray(activity.sequence) ? activity.sequence : []) {
    parts.push(toText(item?.label), toText(item?.icon));
  }
  for (const option of Array.isArray(activity.options) ? activity.options : []) {
    parts.push(toText(option?.label), toText(option?.icon));
  }
  return parts.filter(Boolean).join(' | ');
}
