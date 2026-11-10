/**
 * drag_sort — parameter contract for the first parameterized activity type.
 *
 * Design rule (plan B): the LLM only ever produces JSON parameters. Rendering
 * logic lives in the client. This module is the single source of truth for the
 * parameter shape and is shared by BOTH generateActivity tool chains
 * (legacy `modules/ai/agent/tools` and `agent-framework/tools/impl`).
 *
 * It also implements the deterministic "playtest" described in
 * docs/ohmygame-integration-plan.md §5.4: instead of launching a browser, we
 * run the standard-answer state machine over the parameters and check that a
 * COMPLETE result is reachable and scoreable.
 */

export interface DragSortBucket {
  id: string;
  label: string;
  icon?: string;
}

export interface DragSortItem {
  id: string;
  label: string;
  icon?: string;
  bucketId: string;
}

export interface DragSortActivity {
  type: 'drag_sort';
  title: string;
  topic: string;
  ageGroup: string;
  domain?: string;
  prompt?: string;
  buckets: DragSortBucket[];
  items: DragSortItem[];
  passingScore: number;
  timeLimitSec: number;
}

export interface DragSortValidation {
  ok: boolean;
  reason?: string;
  /** Score produced by a perfect playthrough (0-100). */
  score?: number;
  total?: number;
}

export interface DragSortPlaythrough {
  ok: boolean;
  reason?: string;
  score: number;
  total: number;
  placements: Array<{ itemId: string; bucketId: string; correct: boolean }>;
}

export const DRAG_SORT_LIMITS = {
  minBuckets: 2,
  maxBuckets: 4,
  minItems: 3,
  maxItems: 12,
  maxTitleLength: 40,
  maxPromptLength: 60,
  maxLabelLength: 16,
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
  // Count code points so multi-unit emoji are not penalised.
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

function uniqueId(candidate: string, used: Set<string>, prefix: string): string {
  let id = candidate;
  let suffix = 2;
  while (used.has(id)) {
    id = `${candidate.slice(0, 24)}_${suffix++}`;
  }
  used.add(id);
  return id;
}

export interface DragSortContext {
  topic: string;
  ageGroup: string;
  domain?: string;
}

/**
 * Convert untrusted LLM output into a strict, bounded parameter object.
 * Throws with a human-readable reason so the tool's existing 3-attempt
 * reflection loop can feed the failure back to the model.
 */
export function sanitizeDragSortParams(raw: any, ctx: DragSortContext): DragSortActivity {
  const rawBuckets = Array.isArray(raw?.buckets) ? raw.buckets : [];
  const usedBucketIds = new Set<string>();
  const buckets: DragSortBucket[] = [];

  for (let i = 0; i < rawBuckets.length && buckets.length < DRAG_SORT_LIMITS.maxBuckets; i++) {
    const entry = rawBuckets[i];
    const label = safeText(entry?.label, `buckets[${i}].label`, DRAG_SORT_LIMITS.maxLabelLength);
    if (!label) continue;
    const icon = safeText(entry?.icon, `buckets[${i}].icon`, DRAG_SORT_LIMITS.maxIconLength);
    const id = uniqueId(safeId(entry?.id, `b${i + 1}`), usedBucketIds, 'b');
    buckets.push(icon ? { id, label, icon } : { id, label });
  }

  if (buckets.length < DRAG_SORT_LIMITS.minBuckets) {
    throw new Error(`drag_sort needs at least ${DRAG_SORT_LIMITS.minBuckets} buckets`);
  }

  const bucketIds = new Set(buckets.map((bucket) => bucket.id));
  const rawItems = Array.isArray(raw?.items) ? raw.items : [];
  const usedItemIds = new Set<string>();
  const items: DragSortItem[] = [];
  let droppedItems = 0;

  for (let i = 0; i < rawItems.length && items.length < DRAG_SORT_LIMITS.maxItems; i++) {
    const entry = rawItems[i];
    const label = safeText(entry?.label, `items[${i}].label`, DRAG_SORT_LIMITS.maxLabelLength);
    const bucketId = safeId(entry?.bucketId, '');
    if (!label || !bucketIds.has(bucketId)) {
      droppedItems += 1;
      continue;
    }
    const icon = safeText(entry?.icon, `items[${i}].icon`, DRAG_SORT_LIMITS.maxIconLength);
    const id = uniqueId(safeId(entry?.id, `i${i + 1}`), usedItemIds, 'i');
    items.push(icon ? { id, label, icon, bucketId } : { id, label, bucketId });
  }

  if (items.length < DRAG_SORT_LIMITS.minItems) {
    throw new Error(
      `drag_sort needs at least ${DRAG_SORT_LIMITS.minItems} valid items (dropped ${droppedItems}; every bucketId must reference a bucket.id)`,
    );
  }

  const covered = new Set(items.map((item) => item.bucketId));
  const emptyBuckets = buckets.filter((bucket) => !covered.has(bucket.id)).map((b) => b.id);
  if (emptyBuckets.length > 0) {
    throw new Error(`drag_sort buckets with no items: ${emptyBuckets.join(', ')}`);
  }

  const title = safeText(
    raw?.title,
    'title',
    DRAG_SORT_LIMITS.maxTitleLength,
    `${ctx.topic}分类游戏`,
  );
  const prompt = safeText(raw?.prompt, 'prompt', DRAG_SORT_LIMITS.maxPromptLength);

  const activity: DragSortActivity = {
    type: 'drag_sort',
    title,
    topic: toText(ctx.topic),
    ageGroup: toText(ctx.ageGroup),
    buckets,
    items,
    passingScore: clamp(
      toInt(raw?.passingScore, DRAG_SORT_LIMITS.defaultPassingScore),
      0,
      100,
    ),
    timeLimitSec: clamp(
      toInt(raw?.timeLimitSec, DRAG_SORT_LIMITS.defaultTimeLimitSec),
      DRAG_SORT_LIMITS.minTimeLimitSec,
      DRAG_SORT_LIMITS.maxTimeLimitSec,
    ),
  };
  if (ctx.domain) activity.domain = toText(ctx.domain);
  if (prompt) activity.prompt = prompt;

  return activity;
}

/**
 * Deterministic playtest: place every item into its declared bucket and check
 * the run reaches COMPLETE with a computable score.
 */
export function simulateDragSortPlay(activity: DragSortActivity): DragSortPlaythrough {
  const total = activity.items.length;
  const placements = activity.items.map((item) => ({
    itemId: item.id,
    bucketId: item.bucketId,
    correct: true,
  }));
  const score = total > 0 ? Math.round((total / total) * 100) : 0;
  return {
    ok: total > 0 && score === 100,
    reason: total > 0 ? undefined : 'no items to play',
    score,
    total,
    placements,
  };
}

/** Pure validation used by unit tests and by the retry loop. */
export function validateDragSortParams(value: unknown): DragSortValidation {
  if (!value || typeof value !== 'object') return { ok: false, reason: 'not an object' };
  const activity = value as Partial<DragSortActivity>;

  if (activity.type !== 'drag_sort') return { ok: false, reason: 'type must be drag_sort' };
  if (!Array.isArray(activity.buckets)) return { ok: false, reason: 'buckets must be an array' };
  if (
    activity.buckets.length < DRAG_SORT_LIMITS.minBuckets ||
    activity.buckets.length > DRAG_SORT_LIMITS.maxBuckets
  ) {
    return { ok: false, reason: 'bucket count out of range' };
  }
  if (!Array.isArray(activity.items)) return { ok: false, reason: 'items must be an array' };
  if (
    activity.items.length < DRAG_SORT_LIMITS.minItems ||
    activity.items.length > DRAG_SORT_LIMITS.maxItems
  ) {
    return { ok: false, reason: 'item count out of range' };
  }

  const bucketIds = new Set<string>();
  for (const bucket of activity.buckets) {
    if (!bucket || typeof bucket.id !== 'string' || !bucket.id) {
      return { ok: false, reason: 'bucket.id missing' };
    }
    if (bucketIds.has(bucket.id)) return { ok: false, reason: `duplicate bucket id ${bucket.id}` };
    bucketIds.add(bucket.id);
    if (!isSafeParamText(bucket.label || '') || !bucket.label) {
      return { ok: false, reason: `unsafe bucket label ${bucket.id}` };
    }
    if (charLength(bucket.label) > DRAG_SORT_LIMITS.maxLabelLength) {
      return { ok: false, reason: `bucket label too long ${bucket.id}` };
    }
    if (bucket.icon && (!isSafeParamText(bucket.icon) || charLength(bucket.icon) > DRAG_SORT_LIMITS.maxIconLength)) {
      return { ok: false, reason: `unsafe bucket icon ${bucket.id}` };
    }
  }

  const itemIds = new Set<string>();
  const covered = new Set<string>();
  for (const item of activity.items) {
    if (!item || typeof item.id !== 'string' || !item.id) {
      return { ok: false, reason: 'item.id missing' };
    }
    if (itemIds.has(item.id)) return { ok: false, reason: `duplicate item id ${item.id}` };
    itemIds.add(item.id);
    if (!isSafeParamText(item.label || '') || !item.label) {
      return { ok: false, reason: `unsafe item label ${item.id}` };
    }
    if (charLength(item.label) > DRAG_SORT_LIMITS.maxLabelLength) {
      return { ok: false, reason: `item label too long ${item.id}` };
    }
    if (!bucketIds.has(item.bucketId)) {
      return { ok: false, reason: `item ${item.id} references unknown bucket ${item.bucketId}` };
    }
    covered.add(item.bucketId);
  }
  if (covered.size !== bucketIds.size) {
    return { ok: false, reason: 'every bucket must receive at least one item' };
  }

  const passingScore = activity.passingScore ?? DRAG_SORT_LIMITS.defaultPassingScore;
  if (!Number.isFinite(passingScore) || passingScore < 0 || passingScore > 100) {
    return { ok: false, reason: 'passingScore must be 0-100' };
  }
  const timeLimitSec = activity.timeLimitSec ?? DRAG_SORT_LIMITS.defaultTimeLimitSec;
  if (
    !Number.isFinite(timeLimitSec) ||
    timeLimitSec < DRAG_SORT_LIMITS.minTimeLimitSec ||
    timeLimitSec > DRAG_SORT_LIMITS.maxTimeLimitSec
  ) {
    return { ok: false, reason: 'timeLimitSec out of range' };
  }

  const play = simulateDragSortPlay(activity as DragSortActivity);
  if (!play.ok) return { ok: false, reason: play.reason || 'playtest failed' };
  return { ok: true, score: play.score, total: play.total };
}

/** Text from the activity body used by the topic-alignment checker. */
export function collectDragSortBodyText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const activity = value as Partial<DragSortActivity>;
  // Never leak into the legacy topic-alignment haystack: other activity types
  // must keep their original body-text behaviour.
  if (activity.type !== 'drag_sort') return '';
  const parts: string[] = [toText(activity.title), toText(activity.prompt)];
  for (const bucket of Array.isArray(activity.buckets) ? activity.buckets : []) {
    parts.push(toText(bucket?.label), toText(bucket?.icon));
  }
  for (const item of Array.isArray(activity.items) ? activity.items : []) {
    parts.push(toText(item?.label), toText(item?.icon));
  }
  return parts.filter(Boolean).join(' | ');
}
