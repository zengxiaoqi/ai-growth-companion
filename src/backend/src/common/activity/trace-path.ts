/**
 * trace_path — parameter contract for the glyph-tracing activity type
 * ("trace along the dashed glyph with your finger").
 *
 * Same plan-B rules as drag-sort.ts / memory-flip.ts / pattern-next.ts: the
 * LLM only ever produces JSON parameters, rendering lives in the clients, and
 * this module is shared by BOTH generateActivity tool chains (legacy
 * `modules/ai/agent/tools` and `agent-framework/tools/impl`).
 *
 * Geometry decision (docs/ohmygame-integration-plan.md Appendix H.2): the LLM
 * NEVER produces coordinates. Clients derive sample points from the glyph
 * itself (Flutter TextPainter boxes / Web measured glyph outlines), so the
 * only geometry-ish parameter is the 1-2 character `text`. The polyline mode
 * of the legacy course interactions is NOT open to LLM generation here.
 *
 * Scoring semantics (consistent across both clients): each glyph that reaches
 * `minCoverage` counts as one unit; score = completed / total * 100.
 *
 * Inference note: the structural key is `targets`. No legacy activity type or
 * client inference chain uses a bare `targets` array (verified in both
 * executors and both normalizers), so inference is unambiguous, but it still
 * runs before the generic fallbacks for robustness.
 */

export interface TracePathTarget {
  id: string;
  /** Always 'glyph' for LLM-generated activities; polyline is course-only. */
  kind: 'glyph';
  /** 1-2 characters: common CJK ideographs, digits or ASCII letters. */
  text: string;
  /** Human-readable name shown to the child; defaults to the glyph text. */
  label: string;
}

export interface TracePathActivity {
  type: 'trace_path';
  title: string;
  topic: string;
  ageGroup: string;
  domain?: string;
  prompt?: string;
  targets: TracePathTarget[];
  minCoverage: number;
  passingScore: number;
  timeLimitSec: number;
}

export interface TracePathValidation {
  ok: boolean;
  reason?: string;
  /** Score produced by a perfect playthrough (0-100). */
  score?: number;
  total?: number;
}

export interface TracePathPlaythrough {
  ok: boolean;
  reason?: string;
  score: number;
  total: number;
}

export const TRACE_PATH_LIMITS = {
  minTargets: 2,
  maxTargets: 4,
  maxGlyphChars: 2,
  minGlyphChars: 1,
  minCoverage: 0.5,
  maxCoverage: 0.85,
  defaultCoverage: 0.7,
  maxTitleLength: 40,
  maxPromptLength: 20,
  maxLabelLength: 12,
  minTimeLimitSec: 30,
  maxTimeLimitSec: 300,
  defaultPassingScore: 80,
  defaultTimeLimitSec: 180,
} as const;

/**
 * Glyph whitelist: common CJK ideographs, ASCII digits and letters only.
 * Emoji and rare CJK extension blocks are rejected — clients render glyphs
 * via the platform font, and unrenderable glyphs degrade coverage sampling
 * to a whole-canvas grid, which would silently disable the judgement.
 */
const GLYPH_TEXT_RE = /^[\u4e00-\u9fa5a-zA-Z0-9]+$/u;

export function isValidGlyphText(text: string): boolean {
  const chars = Array.from(text);
  return (
    chars.length >= TRACE_PATH_LIMITS.minGlyphChars &&
    chars.length <= TRACE_PATH_LIMITS.maxGlyphChars &&
    GLYPH_TEXT_RE.test(text)
  );
}

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

export interface TracePathContext {
  topic: string;
  ageGroup: string;
  domain?: string;
}

/**
 * Convert untrusted LLM output into a strict, bounded parameter object.
 * Throws with a human-readable reason so the tool's existing 3-attempt
 * reflection loop can feed the failure back to the model.
 */
export function sanitizeTracePathParams(
  raw: any,
  ctx: TracePathContext,
): TracePathActivity {
  const rawTargets = Array.isArray(raw?.targets) ? raw.targets : [];
  const usedIds = new Set<string>();
  const usedTexts = new Set<string>();
  const targets: TracePathTarget[] = [];

  for (
    let i = 0;
    i < rawTargets.length && targets.length < TRACE_PATH_LIMITS.maxTargets;
    i++
  ) {
    const entry = rawTargets[i];
    // The polyline mode is for hand-made course content only; coordinates from
    // an LLM cannot be validated for shape correctness, so refuse loudly.
    if (entry?.kind != null && toText(entry.kind) !== 'glyph') {
      throw new Error(
        `targets[${i}].kind '${toText(entry.kind)}' is not supported; LLM generation only accepts glyph targets`,
      );
    }
    const text = safeText(entry?.text, `targets[${i}].text`, 8);
    if (!isValidGlyphText(text)) {
      throw new Error(
        `targets[${i}].text must be 1-2 common CJK/digit/letter characters, got: ${text || '(empty)'}`,
      );
    }
    // Tracing the same glyph twice has no learning value and breaks the
    // per-glyph progress bookkeeping.
    if (usedTexts.has(text)) {
      throw new Error(`targets[${i}] duplicates glyph text: ${text}`);
    }
    usedTexts.add(text);
    const label = safeText(entry?.label, `targets[${i}].label`, TRACE_PATH_LIMITS.maxLabelLength, text);
    const id = uniqueId(safeId(entry?.id, `g${i + 1}`), usedIds);
    targets.push({ id, kind: 'glyph', text, label });
  }

  if (targets.length < TRACE_PATH_LIMITS.minTargets) {
    throw new Error(
      `trace_path needs at least ${TRACE_PATH_LIMITS.minTargets} valid glyph targets`,
    );
  }

  const rawCoverage = Number(raw?.minCoverage);
  const minCoverage =
    Number.isFinite(rawCoverage) && rawCoverage > 0
      ? clamp(rawCoverage, TRACE_PATH_LIMITS.minCoverage, TRACE_PATH_LIMITS.maxCoverage)
      : TRACE_PATH_LIMITS.defaultCoverage;

  const title = safeText(
    raw?.title,
    'title',
    TRACE_PATH_LIMITS.maxTitleLength,
    `${ctx.topic}描红`,
  );
  const prompt = safeText(raw?.prompt, 'prompt', TRACE_PATH_LIMITS.maxPromptLength);

  const activity: TracePathActivity = {
    type: 'trace_path',
    title,
    topic: toText(ctx.topic),
    ageGroup: toText(ctx.ageGroup),
    targets,
    minCoverage: Math.round(minCoverage * 100) / 100,
    passingScore: clamp(
      Number.isFinite(Number(raw?.passingScore)) ? Math.trunc(Number(raw?.passingScore)) : TRACE_PATH_LIMITS.defaultPassingScore,
      0,
      100,
    ),
    timeLimitSec: clamp(
      Number.isFinite(Number(raw?.timeLimitSec)) ? Math.trunc(Number(raw?.timeLimitSec)) : TRACE_PATH_LIMITS.defaultTimeLimitSec,
      TRACE_PATH_LIMITS.minTimeLimitSec,
      TRACE_PATH_LIMITS.maxTimeLimitSec,
    ),
  };
  if (ctx.domain) activity.domain = toText(ctx.domain);
  if (prompt) activity.prompt = prompt;

  return activity;
}

/**
 * Deterministic playtest: glyph sampling is guaranteed non-empty for
 * whitelisted characters, so a full sweep over every glyph reaches COMPLETE.
 */
export function simulateTracePathPlay(activity: TracePathActivity): TracePathPlaythrough {
  const ok =
    activity.targets.length >= TRACE_PATH_LIMITS.minTargets &&
    activity.targets.every((t) => t.kind === 'glyph' && isValidGlyphText(t.text));
  return {
    ok,
    reason: ok ? undefined : 'glyph targets do not form a playable tracing board',
    score: ok ? 100 : 0,
    total: activity.targets.length,
  };
}

/** Pure validation used by unit tests and by the retry loop. */
export function validateTracePathParams(value: unknown): TracePathValidation {
  if (!value || typeof value !== 'object') return { ok: false, reason: 'not an object' };
  const activity = value as Partial<TracePathActivity>;

  if (activity.type !== 'trace_path') return { ok: false, reason: 'type must be trace_path' };
  if (!Array.isArray(activity.targets)) return { ok: false, reason: 'targets must be an array' };
  if (
    activity.targets.length < TRACE_PATH_LIMITS.minTargets ||
    activity.targets.length > TRACE_PATH_LIMITS.maxTargets
  ) {
    return { ok: false, reason: 'targets length out of range' };
  }

  const ids = new Set<string>();
  const texts = new Set<string>();
  for (const target of activity.targets) {
    if (!target || typeof target.id !== 'string' || !target.id) {
      return { ok: false, reason: 'target id missing' };
    }
    if (ids.has(target.id)) return { ok: false, reason: `duplicate target id ${target.id}` };
    ids.add(target.id);
    if (target.kind !== 'glyph') return { ok: false, reason: 'target kind must be glyph' };
    if (typeof target.text !== 'string' || !isValidGlyphText(target.text)) {
      return { ok: false, reason: `invalid glyph text ${target.text ?? ''}` };
    }
    if (texts.has(target.text)) {
      return { ok: false, reason: `duplicate glyph text ${target.text}` };
    }
    texts.add(target.text);
    if (!isSafeParamText(target.label || '') || !target.label) {
      return { ok: false, reason: `unsafe target label ${target.id}` };
    }
    if (charLength(target.label) > TRACE_PATH_LIMITS.maxLabelLength) {
      return { ok: false, reason: `target label too long ${target.id}` };
    }
  }

  const minCoverage = activity.minCoverage ?? TRACE_PATH_LIMITS.defaultCoverage;
  if (
    !Number.isFinite(minCoverage) ||
    minCoverage < TRACE_PATH_LIMITS.minCoverage ||
    minCoverage > TRACE_PATH_LIMITS.maxCoverage
  ) {
    return {
      ok: false,
      reason: `minCoverage must be ${TRACE_PATH_LIMITS.minCoverage}-${TRACE_PATH_LIMITS.maxCoverage}`,
    };
  }

  const passingScore = activity.passingScore ?? TRACE_PATH_LIMITS.defaultPassingScore;
  if (!Number.isFinite(passingScore) || passingScore < 0 || passingScore > 100) {
    return { ok: false, reason: 'passingScore must be 0-100' };
  }
  const timeLimitSec = activity.timeLimitSec ?? TRACE_PATH_LIMITS.defaultTimeLimitSec;
  if (
    !Number.isFinite(timeLimitSec) ||
    timeLimitSec < TRACE_PATH_LIMITS.minTimeLimitSec ||
    timeLimitSec > TRACE_PATH_LIMITS.maxTimeLimitSec
  ) {
    return { ok: false, reason: 'timeLimitSec out of range' };
  }

  const play = simulateTracePathPlay(activity as TracePathActivity);
  if (!play.ok) return { ok: false, reason: play.reason || 'playtest failed' };
  return { ok: true, score: play.score, total: play.total };
}

/** Text from the activity body used by the topic-alignment checker. */
export function collectTracePathBodyText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const activity = value as Partial<TracePathActivity>;
  // Never leak into the legacy topic-alignment haystack: other activity types
  // must keep their original body-text behaviour.
  if (activity.type !== 'trace_path') return '';
  const parts: string[] = [toText(activity.title), toText(activity.prompt)];
  for (const target of Array.isArray(activity.targets) ? activity.targets : []) {
    parts.push(toText(target?.label), toText(target?.text));
  }
  return parts.filter(Boolean).join(' | ');
}
