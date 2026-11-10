import type {
  ActivityData,
  ActivityType,
  DragSortActivityData,
  MemoryFlipActivityData,
  MemoryFlipGridSize,
} from '@/types';

const ACTIVITY_TYPES: ActivityType[] = [
  'quiz',
  'true_false',
  'fill_blank',
  'matching',
  'connection',
  'sequencing',
  'puzzle',
  'drag_sort',
  'memory_flip',
];

function toSafeInt(value: any, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toText(value: any): string {
  return value == null ? '' : String(value).replace(/\s+/g, ' ').trim();
}

/** Same cleaning rule for bucket.id and item.bucketId so references survive. */
function toSafeId(value: any): string {
  return toText(value).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
}

function isActivityType(value: unknown): value is ActivityType {
  return typeof value === 'string' && ACTIVITY_TYPES.includes(value as ActivityType);
}

export const DRAG_SORT_LIMITS = {
  maxBuckets: 4,
  maxItems: 12,
  maxIconLength: 8,
  maxLabelLength: 16,
  defaultPassingScore: 80,
  defaultTimeLimitSec: 120,
} as const;

/**
 * Defensive normalization for drag_sort parameters. The renderer must never
 * trust LLM output: ids are de-duplicated and items pointing at unknown
 * buckets are dropped instead of being rendered as unplayable cards.
 */
export function normalizeDragSortData(raw: any): Pick<
  DragSortActivityData,
  'buckets' | 'items' | 'passingScore' | 'timeLimitSec' | 'prompt'
> {
  const usedBucketIds = new Set<string>();
  const rawBuckets = Array.isArray(raw?.buckets) ? raw.buckets : [];
  const buckets: DragSortActivityData['buckets'] = [];

  for (let i = 0; i < rawBuckets.length && buckets.length < DRAG_SORT_LIMITS.maxBuckets; i++) {
    const entry = rawBuckets[i];
    const label = toText(entry?.label).slice(0, DRAG_SORT_LIMITS.maxLabelLength);
    if (!label) continue;
    let id = toSafeId(entry?.id) || `b${i + 1}`;
    let suffix = 2;
    while (usedBucketIds.has(id)) id = `b${i + 1}_${suffix++}`;
    usedBucketIds.add(id);
    const icon = toText(entry?.icon).slice(0, DRAG_SORT_LIMITS.maxIconLength);
    buckets.push(icon ? { id, label, icon } : { id, label });
  }

  const usedItemIds = new Set<string>();
  const rawItems = Array.isArray(raw?.items) ? raw.items : [];
  const items: DragSortActivityData['items'] = [];

  for (let i = 0; i < rawItems.length && items.length < DRAG_SORT_LIMITS.maxItems; i++) {
    const entry = rawItems[i];
    const label = toText(entry?.label).slice(0, DRAG_SORT_LIMITS.maxLabelLength);
    const bucketId = toSafeId(entry?.bucketId);
    if (!label || !usedBucketIds.has(bucketId)) continue;
    let id = toSafeId(entry?.id) || `i${i + 1}`;
    let suffix = 2;
    while (usedItemIds.has(id)) id = `i${i + 1}_${suffix++}`;
    usedItemIds.add(id);
    const icon = toText(entry?.icon).slice(0, DRAG_SORT_LIMITS.maxIconLength);
    items.push(icon ? { id, label, icon, bucketId } : { id, label, bucketId });
  }

  const prompt = toText(raw?.prompt).slice(0, 60);
  return {
    buckets,
    items,
    ...(prompt ? { prompt } : {}),
    passingScore: Math.max(
      0,
      Math.min(100, toSafeInt(raw?.passingScore, DRAG_SORT_LIMITS.defaultPassingScore)),
    ),
    timeLimitSec: Math.max(
      30,
      Math.min(300, toSafeInt(raw?.timeLimitSec, DRAG_SORT_LIMITS.defaultTimeLimitSec)),
    ),
  };
}

export function normalizeActivityType(activityType: unknown, rawData?: any): ActivityType {
  if (isActivityType(activityType)) return activityType;
  if (isActivityType(rawData?.type)) return rawData.type;
  if (isActivityType(rawData?.activityType)) return rawData.activityType;

  // drag_sort also has `items`; check it before the items -> sequencing fallback.
  if (Array.isArray(rawData?.buckets) && Array.isArray(rawData?.items)) return 'drag_sort';

  if (Array.isArray(rawData?.questions)) return 'quiz';
  if (Array.isArray(rawData?.statements)) return 'true_false';
  if (Array.isArray(rawData?.sentences)) return 'fill_blank';
  // memory_flip also has `pairs`; check it before the pairs -> matching fallback.
  if (Array.isArray(rawData?.pairs) && rawData?.gridSize) return 'memory_flip';
  if (Array.isArray(rawData?.pairs)) return 'matching';
  if (
    Array.isArray(rawData?.connections) ||
    (Array.isArray(rawData?.leftItems) && Array.isArray(rawData?.rightItems))
  )
    return 'connection';
  if (Array.isArray(rawData?.items)) return 'sequencing';
  if (Array.isArray(rawData?.pieces)) return 'puzzle';

  return 'quiz';
}

export const MEMORY_FLIP_LIMITS = {
  maxPairs: 8,
  minGridSide: 2,
  maxGridSide: 4,
  maxIconLength: 8,
  maxLabelLength: 12,
  defaultPassingScore: 80,
  defaultTimeLimitSec: 180,
} as const;

/** Child-friendly boards: legal pair counts map to exactly one grid. */
const MEMORY_FLIP_GRIDS: Record<number, MemoryFlipGridSize> = {
  2: { rows: 2, cols: 2 },
  3: { rows: 2, cols: 3 },
  4: { rows: 2, cols: 4 },
  6: { rows: 3, cols: 4 },
  8: { rows: 4, cols: 4 },
};

/**
 * Defensive normalization for memory_flip parameters. Faces are de-duplicated
 * and the grid is re-derived from the surviving pair count so the board is
 * always complete and unambiguous.
 */
export function normalizeMemoryFlipData(raw: any): Pick<
  MemoryFlipActivityData,
  'pairs' | 'gridSize' | 'passingScore' | 'timeLimitSec' | 'prompt'
> {
  const usedPairIds = new Set<string>();
  const usedFaces = new Set<string>();
  const rawPairs = Array.isArray(raw?.pairs) ? raw.pairs : [];
  const pairs: MemoryFlipActivityData['pairs'] = [];

  for (let i = 0; i < rawPairs.length && pairs.length < MEMORY_FLIP_LIMITS.maxPairs; i++) {
    const entry = rawPairs[i];
    const label = toText(entry?.label).slice(0, MEMORY_FLIP_LIMITS.maxLabelLength);
    if (!label) continue;
    const icon = toText(entry?.icon).slice(0, MEMORY_FLIP_LIMITS.maxIconLength);
    const face = `${label}|${icon}`;
    if (usedFaces.has(face)) continue;
    usedFaces.add(face);
    let id = toSafeId(entry?.id) || `p${i + 1}`;
    let suffix = 2;
    while (usedPairIds.has(id)) id = `p${i + 1}_${suffix++}`;
    usedPairIds.add(id);
    pairs.push(icon ? { id, label, icon } : { id, label });
  }

  const grid = MEMORY_FLIP_GRIDS[pairs.length] ?? (() => {
    // Illegal pair counts (e.g. 5 or 7) are trimmed down to the largest
    // legal count that keeps a child-friendly complete board.
    const legal = [2, 3, 4, 6, 8];
    let trimmed = 0;
    for (const count of legal) {
      if (count <= pairs.length) trimmed = count;
    }
    pairs.length = trimmed;
    return (
      MEMORY_FLIP_GRIDS[trimmed] ?? {
        rows: MEMORY_FLIP_LIMITS.minGridSide,
        cols: MEMORY_FLIP_LIMITS.minGridSide,
      }
    );
  })();

  const prompt = toText(raw?.prompt).slice(0, 60);
  return {
    pairs,
    gridSize: { ...grid },
    ...(prompt ? { prompt } : {}),
    passingScore: Math.max(
      0,
      Math.min(100, toSafeInt(raw?.passingScore, MEMORY_FLIP_LIMITS.defaultPassingScore)),
    ),
    timeLimitSec: Math.max(
      60,
      Math.min(300, toSafeInt(raw?.timeLimitSec, MEMORY_FLIP_LIMITS.defaultTimeLimitSec)),
    ),
  };
}

export function normalizeActivityData(
  activityType: ActivityType | string | undefined,
  rawData: any,
): ActivityData {
  const resolvedType = normalizeActivityType(activityType, rawData);

  const base: ActivityData = {
    ...(rawData && typeof rawData === 'object' ? rawData : {}),
    type: resolvedType,
    title: typeof rawData?.title === 'string' ? rawData.title : '趣味练习',
  };

  if (resolvedType === 'drag_sort') {
    return { ...base, ...normalizeDragSortData(rawData) } as DragSortActivityData;
  }

  if (resolvedType === 'memory_flip') {
    return { ...base, ...normalizeMemoryFlipData(rawData) } as MemoryFlipActivityData;
  }

  if (resolvedType === 'quiz') {
    const rawQuestions = Array.isArray(rawData?.questions) ? rawData.questions : [];
    const questions = rawQuestions
      .map((q: any) => {
        const options = Array.isArray(q?.options)
          ? q.options.map((opt: any) => String(opt ?? '').trim()).filter((opt: string) => !!opt)
          : [];
        if (!q?.question || options.length < 2) return null;

        let correctIndex = toSafeInt(q?.correctIndex, 0);
        if (correctIndex < 0 || correctIndex >= options.length) {
          const oneBased = correctIndex - 1;
          correctIndex = oneBased >= 0 && oneBased < options.length ? oneBased : 0;
        }

        return {
          ...q,
          question: String(q.question).trim(),
          options,
          correctIndex,
        };
      })
      .filter((q: any) => !!q);

    return {
      ...base,
      questions,
    };
  }

  return base;
}
