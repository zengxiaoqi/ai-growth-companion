/**
 * color_fill — parameter contract for the color-by-number activity type
 * ("pick the right color from the palette and fill the shapes").
 *
 * Same plan-B rules as the other parameterized types: the LLM only ever
 * produces JSON parameters, rendering lives in the clients, and this module
 * is shared by BOTH generateActivity tool chains (legacy
 * `modules/ai/agent/tools` and `agent-framework/tools/impl`).
 *
 * Geometry decision (docs/ohmygame-integration-plan.md Appendix H.3): the LLM
 * NEVER produces coordinates or paths. Regions come from a fixed shape
 * library and are laid out on a deterministic client-side grid; colors come
 * from a fixed color table with per-platform constant values.
 *
 * Palette rule: palette must contain every region colorKey PLUS at least one
 * distractor color, otherwise the board degenerates ("only one swatch, no
 * cognition needed").
 *
 * Scoring semantics (child-friendly, consistent across both clients): the
 * child may repaint a region (last state wins), but only regions colored
 * correctly on their first coloring count towards the score (firstTry per
 * region). Score = round(correct / total * 100).
 *
 * Inference note: the structural key is `regions`. Grep-verified that no
 * legacy activity type, executor, normalizer or game renderer uses a bare
 * `regions` array anywhere in the repo, so inference is unambiguous.
 */

export type ColorFillShape =
  | 'circle'
  | 'star'
  | 'heart'
  | 'triangle'
  | 'square'
  | 'flower'
  | 'sun'
  | 'moon'
  | 'cloud'
  | 'fish';

export type ColorFillColor =
  | 'red'
  | 'blue'
  | 'yellow'
  | 'green'
  | 'orange'
  | 'purple'
  | 'pink'
  | 'brown'
  | 'black'
  | 'white';

export interface ColorFillRegion {
  id: string;
  shape: ColorFillShape;
  colorKey: ColorFillColor;
}

export interface ColorFillActivity {
  type: 'color_fill';
  title: string;
  topic: string;
  ageGroup: string;
  domain?: string;
  prompt?: string;
  regions: ColorFillRegion[];
  palette: ColorFillColor[];
  passingScore: number;
  timeLimitSec: number;
}

export interface ColorFillValidation {
  ok: boolean;
  reason?: string;
  /** Score produced by a perfect playthrough (0-100). */
  score?: number;
  total?: number;
}

export interface ColorFillPlaythrough {
  ok: boolean;
  reason?: string;
  score: number;
  total: number;
}

/** Fixed shape library, rendered by client code (SVG constants / CustomPainter). */
export const COLOR_FILL_SHAPES: readonly ColorFillShape[] = [
  'circle',
  'star',
  'heart',
  'triangle',
  'square',
  'flower',
  'sun',
  'moon',
  'cloud',
  'fish',
] as const;

/** Fixed color table; concrete color values live in per-platform constants. */
export const COLOR_FILL_COLORS: readonly ColorFillColor[] = [
  'red',
  'blue',
  'yellow',
  'green',
  'orange',
  'purple',
  'pink',
  'brown',
  'black',
  'white',
] as const;

export function isColorFillShape(value: unknown): value is ColorFillShape {
  return typeof value === 'string' && (COLOR_FILL_SHAPES as readonly string[]).includes(value);
}

export function isColorFillColor(value: unknown): value is ColorFillColor {
  return typeof value === 'string' && (COLOR_FILL_COLORS as readonly string[]).includes(value);
}

export const COLOR_FILL_LIMITS = {
  minRegions: 2,
  maxRegions: 6,
  minPalette: 3,
  maxPalette: 8,
  maxTitleLength: 40,
  maxPromptLength: 60,
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

export interface ColorFillContext {
  topic: string;
  ageGroup: string;
  domain?: string;
}

/**
 * Convert untrusted LLM output into a strict, bounded parameter object.
 * Throws with a human-readable reason so the tool's existing 3-attempt
 * reflection loop can feed the failure back to the model.
 */
export function sanitizeColorFillParams(
  raw: any,
  ctx: ColorFillContext,
): ColorFillActivity {
  const rawRegions = Array.isArray(raw?.regions) ? raw.regions : [];
  const usedIds = new Set<string>();
  const regions: ColorFillRegion[] = [];

  for (
    let i = 0;
    i < rawRegions.length && regions.length < COLOR_FILL_LIMITS.maxRegions;
    i++
  ) {
    const entry = rawRegions[i];
    const shape = entry?.shape;
    const colorKey = entry?.colorKey;
    if (!isColorFillShape(shape)) {
      throw new Error(
        `regions[${i}].shape must be one of: ${COLOR_FILL_SHAPES.join(', ')}`,
      );
    }
    if (!isColorFillColor(colorKey)) {
      throw new Error(
        `regions[${i}].colorKey must be one of: ${COLOR_FILL_COLORS.join(', ')}`,
      );
    }
    const id = uniqueId(safeId(entry?.id, `s${i + 1}`), usedIds);
    regions.push({ id, shape, colorKey });
  }

  if (regions.length < COLOR_FILL_LIMITS.minRegions) {
    throw new Error(
      `color_fill needs at least ${COLOR_FILL_LIMITS.minRegions} valid regions`,
    );
  }

  const rawPalette = Array.isArray(raw?.palette) ? raw.palette : [];
  const palette: ColorFillColor[] = [];
  const seenPalette = new Set<string>();
  for (const entry of rawPalette) {
    if (!isColorFillColor(entry)) continue;
    if (seenPalette.has(entry)) continue;
    seenPalette.add(entry);
    palette.push(entry);
    if (palette.length >= COLOR_FILL_LIMITS.maxPalette) break;
  }

  const targetColors = new Set(regions.map((region) => region.colorKey));
  const missingColors = Array.from(targetColors).filter(
    (color) => !seenPalette.has(color),
  );
  if (missingColors.length > 0) {
    throw new Error(
      `palette must contain every region colorKey; missing: ${missingColors.join(', ')}`,
    );
  }
  if (palette.length < COLOR_FILL_LIMITS.minPalette) {
    throw new Error(
      `palette needs at least ${COLOR_FILL_LIMITS.minPalette} colors (target colors + at least one distractor)`,
    );
  }
  if (palette.length <= targetColors.size) {
    throw new Error(
      'palette must include at least one distractor color beyond the target colors',
    );
  }

  const title = safeText(
    raw?.title,
    'title',
    COLOR_FILL_LIMITS.maxTitleLength,
    `${ctx.topic}涂色`,
  );
  const prompt = safeText(raw?.prompt, 'prompt', COLOR_FILL_LIMITS.maxPromptLength);

  const activity: ColorFillActivity = {
    type: 'color_fill',
    title,
    topic: toText(ctx.topic),
    ageGroup: toText(ctx.ageGroup),
    regions,
    palette,
    passingScore: clamp(
      Number.isFinite(Number(raw?.passingScore)) ? Math.trunc(Number(raw?.passingScore)) : COLOR_FILL_LIMITS.defaultPassingScore,
      0,
      100,
    ),
    timeLimitSec: clamp(
      Number.isFinite(Number(raw?.timeLimitSec)) ? Math.trunc(Number(raw?.timeLimitSec)) : COLOR_FILL_LIMITS.defaultTimeLimitSec,
      COLOR_FILL_LIMITS.minTimeLimitSec,
      COLOR_FILL_LIMITS.maxTimeLimitSec,
    ),
  };
  if (ctx.domain) activity.domain = toText(ctx.domain);
  if (prompt) activity.prompt = prompt;

  return activity;
}

/**
 * Deterministic playtest: select the declared color from the palette and tap
 * every region in order — the board reaches COMPLETE with every region
 * correct (validate already guarantees colorKey ⊆ palette).
 */
export function simulateColorFillPlay(activity: ColorFillActivity): ColorFillPlaythrough {
  const paletteSet = new Set<string>(activity.palette);
  const ok =
    activity.regions.length >= COLOR_FILL_LIMITS.minRegions &&
    activity.palette.length >= COLOR_FILL_LIMITS.minPalette &&
    activity.regions.every(
      (region) => isColorFillShape(region.shape) && paletteSet.has(region.colorKey),
    );
  return {
    ok,
    reason: ok ? undefined : 'regions/palette do not form a playable coloring board',
    score: ok ? 100 : 0,
    total: activity.regions.length,
  };
}

/** Pure validation used by unit tests and by the retry loop. */
export function validateColorFillParams(value: unknown): ColorFillValidation {
  if (!value || typeof value !== 'object') return { ok: false, reason: 'not an object' };
  const activity = value as Partial<ColorFillActivity>;

  if (activity.type !== 'color_fill') return { ok: false, reason: 'type must be color_fill' };
  if (!Array.isArray(activity.regions)) return { ok: false, reason: 'regions must be an array' };
  if (
    activity.regions.length < COLOR_FILL_LIMITS.minRegions ||
    activity.regions.length > COLOR_FILL_LIMITS.maxRegions
  ) {
    return { ok: false, reason: 'regions length out of range' };
  }

  const ids = new Set<string>();
  for (const region of activity.regions) {
    if (!region || typeof region.id !== 'string' || !region.id) {
      return { ok: false, reason: 'region id missing' };
    }
    if (ids.has(region.id)) return { ok: false, reason: `duplicate region id ${region.id}` };
    ids.add(region.id);
    if (!isColorFillShape(region.shape)) {
      return { ok: false, reason: `unknown shape ${region.shape ?? ''}` };
    }
    if (!isColorFillColor(region.colorKey)) {
      return { ok: false, reason: `unknown colorKey ${region.colorKey ?? ''}` };
    }
  }

  if (!Array.isArray(activity.palette)) return { ok: false, reason: 'palette must be an array' };
  const paletteSet = new Set(activity.palette);
  if (
    activity.palette.length < COLOR_FILL_LIMITS.minPalette ||
    activity.palette.length > COLOR_FILL_LIMITS.maxPalette
  ) {
    return { ok: false, reason: 'palette size out of range' };
  }
  for (const color of activity.palette) {
    if (!isColorFillColor(color)) return { ok: false, reason: `unknown palette color ${color ?? ''}` };
  }
  const targetColors = new Set(activity.regions.map((region) => region.colorKey));
  for (const color of targetColors) {
    if (!paletteSet.has(color)) {
      return { ok: false, reason: `palette is missing region color ${color}` };
    }
  }
  if (paletteSet.size <= targetColors.size) {
    return { ok: false, reason: 'palette must include at least one distractor color' };
  }

  const passingScore = activity.passingScore ?? COLOR_FILL_LIMITS.defaultPassingScore;
  if (!Number.isFinite(passingScore) || passingScore < 0 || passingScore > 100) {
    return { ok: false, reason: 'passingScore must be 0-100' };
  }
  const timeLimitSec = activity.timeLimitSec ?? COLOR_FILL_LIMITS.defaultTimeLimitSec;
  if (
    !Number.isFinite(timeLimitSec) ||
    timeLimitSec < COLOR_FILL_LIMITS.minTimeLimitSec ||
    timeLimitSec > COLOR_FILL_LIMITS.maxTimeLimitSec
  ) {
    return { ok: false, reason: 'timeLimitSec out of range' };
  }

  const play = simulateColorFillPlay(activity as ColorFillActivity);
  if (!play.ok) return { ok: false, reason: play.reason || 'playtest failed' };
  return { ok: true, score: play.score, total: play.total };
}

/** Text from the activity body used by the topic-alignment checker. */
export function collectColorFillBodyText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const activity = value as Partial<ColorFillActivity>;
  // Never leak into the legacy topic-alignment haystack: other activity types
  // must keep their original body-text behaviour.
  if (activity.type !== 'color_fill') return '';
  const parts: string[] = [toText(activity.title), toText(activity.prompt)];
  for (const region of Array.isArray(activity.regions) ? activity.regions : []) {
    parts.push(toText(region?.shape), toText(region?.colorKey));
  }
  for (const color of Array.isArray(activity.palette) ? activity.palette : []) {
    parts.push(toText(color));
  }
  return parts.filter(Boolean).join(' | ');
}
