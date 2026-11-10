/**
 * tap_target — parameter contract for the listen-and-tap activity type
 * ("hear the instruction, tap the right picture").
 *
 * Same plan-B rules as the other parameterized types: the LLM only ever
 * produces JSON parameters, rendering lives in the clients, and this module
 * is shared by BOTH generateActivity tool chains (legacy
 * `modules/ai/agent/tools` and `agent-framework/tools/impl`).
 *
 * Timing decision (docs/ohmygame-integration-plan.md Appendix H.1): the LLM
 * never produces timing data. Clients lock taps until the spoken prompt
 * finishes (Web `useGameVoice.isPlaying` / Flutter `TtsService.onComplete`)
 * and degrade to showing the text immediately when TTS is unavailable.
 *
 * Answerability rule: every round's prompt MUST contain the label of each
 * correct target (validate + sanitize both enforce it) — a child who
 * understood the instruction must always be able to answer.
 *
 * Scoring semantics (child-friendly, consistent across both clients): each
 * round is one judgement. A round is "clean" when the child taps only
 * correct targets and completes the round without touching a decoy.
 * score = round(cleanRounds / totalRounds * 100). Per Appendix H.1 there is
 * NO per-round countdown: only the global timeLimitSec (30-300).
 *
 * Inference note: the structural key is `rounds`; grep-verified that no
 * legacy activity type, executor, normalizer or game renderer uses a bare
 * `rounds` array anywhere in the repo, so inference is unambiguous.
 */

export interface TapTargetItem {
  id: string;
  label: string;
  icon?: string;
}

export interface TapTargetRound {
  id: string;
  prompt: string;
  targets: TapTargetItem[];
  /** 1-2 target ids that must be tapped to complete the round. */
  correctIds: string[];
}

export interface TapTargetActivity {
  type: 'tap_target';
  title: string;
  topic: string;
  ageGroup: string;
  domain?: string;
  rounds: TapTargetRound[];
  passingScore: number;
  timeLimitSec: number;
}

export interface TapTargetValidation {
  ok: boolean;
  reason?: string;
  /** Score produced by a perfect playthrough (0-100). */
  score?: number;
  total?: number;
}

export interface TapTargetPlaythrough {
  ok: boolean;
  reason?: string;
  score: number;
  total: number;
}

export const TAP_TARGET_LIMITS = {
  minRounds: 3,
  maxRounds: 6,
  minTargets: 2,
  maxTargets: 4,
  maxCorrectIds: 2,
  maxTitleLength: 40,
  maxPromptLength: 20,
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

export interface TapTargetContext {
  topic: string;
  ageGroup: string;
  domain?: string;
}

/**
 * Convert untrusted LLM output into a strict, bounded parameter object.
 * Throws with a human-readable reason so the tool's existing 3-attempt
 * reflection loop can feed the failure back to the model.
 */
export function sanitizeTapTargetParams(
  raw: any,
  ctx: TapTargetContext,
): TapTargetActivity {
  const rawRounds = Array.isArray(raw?.rounds) ? raw.rounds : [];
  const usedRoundIds = new Set<string>();
  const rounds: TapTargetRound[] = [];

  for (
    let i = 0;
    i < rawRounds.length && rounds.length < TAP_TARGET_LIMITS.maxRounds;
    i++
  ) {
    const entry = rawRounds[i];
    const prompt = safeText(entry?.prompt, `rounds[${i}].prompt`, TAP_TARGET_LIMITS.maxPromptLength);
    if (!prompt) continue;

    const rawTargets = Array.isArray(entry?.targets) ? entry.targets : [];
    const usedTargetIds = new Set<string>();
    const usedLabels = new Set<string>();
    const targets: TapTargetItem[] = [];
    for (
      let t = 0;
      t < rawTargets.length && targets.length < TAP_TARGET_LIMITS.maxTargets;
      t++
    ) {
      const item = rawTargets[t];
      const label = safeText(item?.label, `rounds[${i}].targets[${t}].label`, TAP_TARGET_LIMITS.maxLabelLength);
      if (!label) continue;
      // Duplicate labels within a round would make the instruction ambiguous.
      if (usedLabels.has(label)) {
        throw new Error(
          `rounds[${i}].targets[${t}] duplicates an existing target label: ${label}`,
        );
      }
      usedLabels.add(label);
      const icon = safeText(item?.icon, `rounds[${i}].targets[${t}].icon`, TAP_TARGET_LIMITS.maxIconLength);
      const id = uniqueId(safeId(item?.id, `t${i + 1}_${t + 1}`), usedTargetIds);
      targets.push(icon ? { id, label, icon } : { id, label });
    }

    if (targets.length < TAP_TARGET_LIMITS.minTargets) {
      throw new Error(
        `rounds[${i}] needs at least ${TAP_TARGET_LIMITS.minTargets} valid targets`,
      );
    }

    const rawCorrect = Array.isArray(entry?.correctIds) ? entry.correctIds : [];
    const correctIds: string[] = [];
    const seenCorrect = new Set<string>();
    for (const candidate of rawCorrect) {
      const id = toText(candidate);
      if (!usedTargetIds.has(id) || seenCorrect.has(id)) continue;
      seenCorrect.add(id);
      correctIds.push(id);
      if (correctIds.length >= TAP_TARGET_LIMITS.maxCorrectIds) break;
    }
    if (correctIds.length < 1) {
      throw new Error(
        `rounds[${i}].correctIds must reference 1-${TAP_TARGET_LIMITS.maxCorrectIds} existing target ids`,
      );
    }

    // Answerability: the spoken instruction must name every correct target,
    // otherwise a child who understood the prompt still could not answer.
    for (const correctId of correctIds) {
      const target = targets.find((t) => t.id === correctId);
      if (target && !prompt.includes(target.label)) {
        throw new Error(
          `rounds[${i}].prompt must mention the correct target label '${target.label}' so the instruction is answerable`,
        );
      }
    }

    const id = uniqueId(safeId(entry?.id, `r${i + 1}`), usedRoundIds);
    rounds.push({ id, prompt, targets, correctIds });
  }

  if (rounds.length < TAP_TARGET_LIMITS.minRounds) {
    throw new Error(
      `tap_target needs at least ${TAP_TARGET_LIMITS.minRounds} valid rounds`,
    );
  }

  const title = safeText(
    raw?.title,
    'title',
    TAP_TARGET_LIMITS.maxTitleLength,
    `${ctx.topic}听指令`,
  );

  const activity: TapTargetActivity = {
    type: 'tap_target',
    title,
    topic: toText(ctx.topic),
    ageGroup: toText(ctx.ageGroup),
    rounds,
    passingScore: clamp(
      Number.isFinite(Number(raw?.passingScore)) ? Math.trunc(Number(raw?.passingScore)) : TAP_TARGET_LIMITS.defaultPassingScore,
      0,
      100,
    ),
    timeLimitSec: clamp(
      Number.isFinite(Number(raw?.timeLimitSec)) ? Math.trunc(Number(raw?.timeLimitSec)) : TAP_TARGET_LIMITS.defaultTimeLimitSec,
      TAP_TARGET_LIMITS.minTimeLimitSec,
      TAP_TARGET_LIMITS.maxTimeLimitSec,
    ),
  };
  if (ctx.domain) activity.domain = toText(ctx.domain);

  return activity;
}

/**
 * Deterministic playtest: simulate a child who understood the instruction
 * tapping exactly the correct targets per round — the run reaches COMPLETE
 * with every round clean (answerability is guaranteed by the prompt rule).
 */
export function simulateTapTargetPlay(activity: TapTargetActivity): TapTargetPlaythrough {
  const ok =
    activity.rounds.length >= TAP_TARGET_LIMITS.minRounds &&
    activity.rounds.every(
      (round) =>
        round.targets.length >= TAP_TARGET_LIMITS.minTargets &&
        round.correctIds.length >= 1 &&
        round.correctIds.every((id) => round.targets.some((t) => t.id === id)),
    );
  return {
    ok,
    reason: ok ? undefined : 'rounds do not form a playable listen-and-tap board',
    score: ok ? 100 : 0,
    total: activity.rounds.length,
  };
}

/** Pure validation used by unit tests and by the retry loop. */
export function validateTapTargetParams(value: unknown): TapTargetValidation {
  if (!value || typeof value !== 'object') return { ok: false, reason: 'not an object' };
  const activity = value as Partial<TapTargetActivity>;

  if (activity.type !== 'tap_target') return { ok: false, reason: 'type must be tap_target' };
  if (!Array.isArray(activity.rounds)) return { ok: false, reason: 'rounds must be an array' };
  if (
    activity.rounds.length < TAP_TARGET_LIMITS.minRounds ||
    activity.rounds.length > TAP_TARGET_LIMITS.maxRounds
  ) {
    return { ok: false, reason: 'rounds length out of range' };
  }

  const roundIds = new Set<string>();
  for (const round of activity.rounds) {
    if (!round || typeof round.id !== 'string' || !round.id) {
      return { ok: false, reason: 'round id missing' };
    }
    if (roundIds.has(round.id)) return { ok: false, reason: `duplicate round id ${round.id}` };
    roundIds.add(round.id);
    if (typeof round.prompt !== 'string' || !isSafeParamText(round.prompt) || !round.prompt) {
      return { ok: false, reason: `unsafe round prompt ${round.id}` };
    }
    if (charLength(round.prompt) > TAP_TARGET_LIMITS.maxPromptLength) {
      return { ok: false, reason: `round prompt too long ${round.id}` };
    }
    if (!Array.isArray(round.targets)) return { ok: false, reason: 'targets must be an array' };
    if (
      round.targets.length < TAP_TARGET_LIMITS.minTargets ||
      round.targets.length > TAP_TARGET_LIMITS.maxTargets
    ) {
      return { ok: false, reason: 'targets length out of range' };
    }

    const targetIds = new Set<string>();
    const labels = new Set<string>();
    for (const target of round.targets) {
      if (!target || typeof target.id !== 'string' || !target.id) {
        return { ok: false, reason: 'target id missing' };
      }
      if (targetIds.has(target.id)) {
        return { ok: false, reason: `duplicate target id ${target.id}` };
      }
      targetIds.add(target.id);
      if (!isSafeParamText(target.label || '') || !target.label) {
        return { ok: false, reason: `unsafe target label ${target.id}` };
      }
      if (labels.has(target.label)) {
        return { ok: false, reason: `duplicate target label ${target.label}` };
      }
      labels.add(target.label);
      if (target.icon && (!isSafeParamText(target.icon) || charLength(target.icon) > TAP_TARGET_LIMITS.maxIconLength)) {
        return { ok: false, reason: `unsafe target icon ${target.id}` };
      }
    }

    if (!Array.isArray(round.correctIds) || round.correctIds.length < 1) {
      return { ok: false, reason: 'correctIds must list at least one target' };
    }
    if (round.correctIds.length > TAP_TARGET_LIMITS.maxCorrectIds) {
      return { ok: false, reason: 'too many correctIds' };
    }
    for (const correctId of round.correctIds) {
      if (typeof correctId !== 'string' || !targetIds.has(correctId)) {
        return { ok: false, reason: `correctId ${correctId ?? ''} does not reference a target` };
      }
      const target = round.targets.find((t) => t.id === correctId);
      if (target && !round.prompt.includes(target.label)) {
        return {
          ok: false,
          reason: `prompt must mention correct target label '${target.label}'`,
        };
      }
    }
  }

  const passingScore = activity.passingScore ?? TAP_TARGET_LIMITS.defaultPassingScore;
  if (!Number.isFinite(passingScore) || passingScore < 0 || passingScore > 100) {
    return { ok: false, reason: 'passingScore must be 0-100' };
  }
  const timeLimitSec = activity.timeLimitSec ?? TAP_TARGET_LIMITS.defaultTimeLimitSec;
  if (
    !Number.isFinite(timeLimitSec) ||
    timeLimitSec < TAP_TARGET_LIMITS.minTimeLimitSec ||
    timeLimitSec > TAP_TARGET_LIMITS.maxTimeLimitSec
  ) {
    return { ok: false, reason: 'timeLimitSec out of range' };
  }

  const play = simulateTapTargetPlay(activity as TapTargetActivity);
  if (!play.ok) return { ok: false, reason: play.reason || 'playtest failed' };
  return { ok: true, score: play.score, total: play.total };
}

/** Text from the activity body used by the topic-alignment checker. */
export function collectTapTargetBodyText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const activity = value as Partial<TapTargetActivity>;
  // Never leak into the legacy topic-alignment haystack: other activity types
  // must keep their original body-text behaviour.
  if (activity.type !== 'tap_target') return '';
  const parts: string[] = [toText(activity.title)];
  for (const round of Array.isArray(activity.rounds) ? activity.rounds : []) {
    parts.push(toText(round?.prompt));
    for (const target of Array.isArray(round?.targets) ? round.targets : []) {
      parts.push(toText(target?.label), toText(target?.icon));
    }
  }
  return parts.filter(Boolean).join(' | ');
}
