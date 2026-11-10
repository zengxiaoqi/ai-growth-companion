import * as fs from 'fs';
import * as path from 'path';

import {
  ACTIVITY_TYPES,
  isActivityType,
} from '../../src/agent-framework/core/types/tool-metadata';
import {
  DRAG_SORT_LIMITS,
  collectDragSortBodyText,
  isSafeParamText,
  sanitizeDragSortParams,
  simulateDragSortPlay,
  validateDragSortParams,
} from '../../src/common/activity/drag-sort';
import { GenerateActivityTool as FrameworkGenerateActivityTool } from '../../src/agent-framework/tools/impl/generate-activity';
import { AssignActivityTool } from '../../src/agent-framework/tools/impl/assign-activity';
import { GenerateActivityTool as LegacyGenerateActivityTool } from '../../src/modules/ai/agent/tools/generate-activity';
import { toolDefinitions } from '../../src/modules/ai/agent/prompts/tool-definitions';
import { AgentExecutor } from '../../src/modules/ai/agent/agent-executor';
import { AgentExecutorService } from '../../src/agent-framework/agents/agent-executor.service';

/**
 * P1 / plan B: drag_sort is the first parameterized activity type.
 * The LLM only emits JSON parameters, so the parameter contract, the
 * sanitizer, the deterministic playtest and every whitelist MUST stay in sync.
 * See docs/ohmygame-integration-plan.md §5.3 / §5.4 / B8.
 */
const EXAMPLES_DIR = path.resolve(__dirname, '../../../content/examples');

function loadExample(file: string): any {
  return JSON.parse(fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf-8'));
}

function makeValidRaw(overrides: Record<string, any> = {}): any {
  return {
    type: 'drag_sort',
    title: '送小动物回家',
    prompt: '把小动物送回该住的篮子',
    buckets: [
      { id: 'sky', label: '天上飞', icon: '☁️' },
      { id: 'water', label: '水里游', icon: '🌊' },
    ],
    items: [
      { id: 'i1', label: '小鸟', icon: '🐦', bucketId: 'sky' },
      { id: 'i2', label: '蝴蝶', icon: '🦋', bucketId: 'sky' },
      { id: 'i3', label: '小鱼', icon: '🐟', bucketId: 'water' },
      { id: 'i4', label: '乌龟', icon: '🐢', bucketId: 'water' },
    ],
    passingScore: 80,
    timeLimitSec: 120,
    ...overrides,
  };
}

describe('drag_sort parameter contract', () => {
  describe('curriculum examples (B7)', () => {
    it.each(['drag_sort-3-4.json', 'drag_sort-5-6.json'])(
      '%s satisfies the strict validator and is perfectly playable',
      (file) => {
        const example = loadExample(file);
        expect(example.type).toBe('drag_sort');
        expect(example.activityType).toBe('drag_sort');

        const verdict = validateDragSortParams(example);
        expect(verdict.ok).toBe(true);
        expect(verdict.score).toBe(100);
        expect(verdict.total).toBe(example.items.length);

        const play = simulateDragSortPlay(example);
        expect(play.ok).toBe(true);
        expect(play.placements).toHaveLength(example.items.length);
        expect(play.placements.every((entry) => entry.correct)).toBe(true);

        // The example must also survive the untrusted-input sanitizer path.
        const sanitized = sanitizeDragSortParams(example, {
          topic: example.topic,
          ageGroup: example.ageGroup,
          domain: example.domain,
        });
        expect(validateDragSortParams(sanitized).ok).toBe(true);
      },
    );
  });

  describe('sanitizeDragSortParams', () => {
    const ctx = { topic: '小动物住哪里', ageGroup: '3-4' };

    it('produces a bounded, validated activity from clean input', () => {
      const activity = sanitizeDragSortParams(makeValidRaw(), ctx);
      expect(activity.type).toBe('drag_sort');
      expect(activity.topic).toBe('小动物住哪里');
      expect(activity.ageGroup).toBe('3-4');
      expect(activity.buckets).toHaveLength(2);
      expect(activity.items).toHaveLength(4);
      expect(activity.passingScore).toBe(80);
      expect(activity.timeLimitSec).toBe(120);
      expect(validateDragSortParams(activity).ok).toBe(true);
    });

    it('clamps passingScore and timeLimitSec into range and falls back on garbage', () => {
      const activity = sanitizeDragSortParams(
        makeValidRaw({ passingScore: 999, timeLimitSec: -5 }),
        ctx,
      );
      expect(activity.passingScore).toBe(100);
      expect(activity.timeLimitSec).toBe(DRAG_SORT_LIMITS.minTimeLimitSec);

      const defaults = sanitizeDragSortParams(
        makeValidRaw({ passingScore: 'nope', timeLimitSec: 'nope' }),
        ctx,
      );
      expect(defaults.passingScore).toBe(DRAG_SORT_LIMITS.defaultPassingScore);
      expect(defaults.timeLimitSec).toBe(DRAG_SORT_LIMITS.defaultTimeLimitSec);
    });

    it('de-duplicates ids and caps bucket/item counts without breaking solvability', () => {
      const manyBuckets = Array.from({ length: 8 }, (_, i) => ({
        id: 'same',
        label: `篮子${i + 1}`,
      }));
      // uniqueId() appends _2, _3, ... to repeated ids; spread items over
      // every surviving bucket so the "no empty bucket" rule still holds.
      const dedupedBucketIds = ['same', 'same_2', 'same_3', 'same_4'];
      const items = Array.from({ length: 20 }, (_, i) => ({
        id: 'sameItem',
        label: `卡片${i + 1}`,
        bucketId: dedupedBucketIds[i % dedupedBucketIds.length],
      }));

      const activity = sanitizeDragSortParams({ buckets: manyBuckets, items }, ctx);
      expect(activity.buckets).toHaveLength(DRAG_SORT_LIMITS.maxBuckets);
      expect(activity.items).toHaveLength(DRAG_SORT_LIMITS.maxItems);
      expect(new Set(activity.buckets.map((bucket) => bucket.id)).size).toBe(
        activity.buckets.length,
      );
      expect(new Set(activity.items.map((item) => item.id)).size).toBe(activity.items.length);
      expect(validateDragSortParams(activity).ok).toBe(true);
    });

    it('rejects script/HTML/URL content in any text field', () => {
      const unsafe = [
        'buckets[0].label',
        'items[0].label',
        'title',
        'prompt',
      ] as const;
      for (const field of unsafe) {
        const raw = makeValidRaw();
        if (field === 'buckets[0].label') raw.buckets[0].label = '<script>alert(1)</script>';
        if (field === 'items[0].label') raw.items[0].label = 'javascript:alert(1)';
        if (field === 'title') raw.title = 'https://evil.example';
        if (field === 'prompt') raw.prompt = '点这里 <img src=x onerror=alert(1)>';
        expect(() => sanitizeDragSortParams(raw, ctx)).toThrow(/forbidden/i);
      }
      expect(isSafeParamText('小鸟')).toBe(true);
      expect(isSafeParamText('🐦')).toBe(true);
      expect(isSafeParamText('<b>')).toBe(false);
      expect(isSafeParamText('http://x')).toBe(false);
      expect(isSafeParamText('a//b')).toBe(false);
    });

    it('drops items pointing at unknown buckets and fails when too few remain', () => {
      const raw = makeValidRaw();
      raw.items[0].bucketId = 'does-not-exist';
      raw.items[1].bucketId = 'does-not-exist';
      expect(() => sanitizeDragSortParams(raw, ctx)).toThrow(/valid items/);
    });

    it('rejects a bucket that would receive no items', () => {
      const raw = makeValidRaw();
      raw.items = raw.items.filter((item: any) => item.bucketId === 'sky');
      raw.items.push({ id: 'i5', label: '燕子', bucketId: 'sky' });
      expect(() => sanitizeDragSortParams(raw, ctx)).toThrow(/no items/);
    });

    it('rejects fewer than two buckets', () => {
      const raw = makeValidRaw();
      raw.buckets = [raw.buckets[0]];
      raw.items = raw.items.filter((item: any) => item.bucketId === 'sky');
      expect(() => sanitizeDragSortParams(raw, ctx)).toThrow(/at least 2 buckets/);
    });
  });

  describe('validateDragSortParams', () => {
    it('rejects non-object, wrong type, duplicate ids and unknown bucket refs', () => {
      expect(validateDragSortParams(null).ok).toBe(false);
      expect(validateDragSortParams({ type: 'sequencing', items: [] }).ok).toBe(false);

      const duplicate = makeValidRaw();
      duplicate.items[1].id = duplicate.items[0].id;
      expect(validateDragSortParams(duplicate).reason).toMatch(/duplicate item id/);

      const unknown = makeValidRaw();
      unknown.items[0].bucketId = 'ghost';
      expect(validateDragSortParams(unknown).reason).toMatch(/unknown bucket/);

      const outOfRange = makeValidRaw({ passingScore: 101 });
      expect(validateDragSortParams(outOfRange).reason).toMatch(/passingScore/);
    });

    it('collectDragSortBodyText is a no-op for legacy activity types', () => {
      expect(collectDragSortBodyText(null)).toBe('');
      expect(collectDragSortBodyText({ type: 'quiz', questions: [{ question: '1+1?' }] })).toBe('');
      expect(collectDragSortBodyText(makeValidRaw())).toContain('小鸟');
    });
  });
});

describe('drag_sort whitelist single source of truth', () => {
  it('ACTIVITY_TYPES contains drag_sort exactly once and is exposed by isActivityType', () => {
    expect(ACTIVITY_TYPES.filter((type) => type === 'drag_sort')).toHaveLength(1);
    expect(ACTIVITY_TYPES).toHaveLength(8);
    expect(isActivityType('drag_sort')).toBe(true);
    expect(isActivityType('tap_target')).toBe(false);
  });

  it('both generateActivity tools accept drag_sort', () => {
    const framework = new FrameworkGenerateActivityTool({} as any);
    const legacy = new LegacyGenerateActivityTool({} as any);
    expect(framework.metadata.inputSchema.properties.type.enum).toContain('drag_sort');

    // The legacy tool has no metadata object: its whitelist lives in
    // normalizeArgs() and its schema in schemaForType().
    const args = { type: 'drag_sort', topic: '四季', difficulty: 1, ageGroup: '5-6' };
    expect((legacy as any).normalizeArgs(args).type).toBe('drag_sort');
    expect((legacy as any).schemaForType('drag_sort')).toContain('"type":"drag_sort"');
    expect(() => (legacy as any).normalizeArgs({ ...args, type: 'tap_target' })).toThrow(
      /Unsupported activity type/,
    );
  });

  it('framework assignActivity schema and legacy tool definitions stay in sync', () => {
    const assign = new AssignActivityTool({} as any, {} as any, {} as any);
    expect(assign.metadata.inputSchema.properties.activityType.enum).toEqual([
      ...ACTIVITY_TYPES,
    ]);

    const relevant = toolDefinitions.filter((def: any) =>
      ['generateActivity', 'assignActivity'].includes(def.function.name),
    );
    expect(relevant).toHaveLength(2);
    for (const def of relevant as any[]) {
      const props = (def.function.parameters as any).properties;
      const enumField = props.type ?? props.activityType;
      expect(enumField.enum).toEqual([...ACTIVITY_TYPES]);
    }
  });

  it('both generateActivity prompts emit a drag_sort schema and forbid code/URLs', () => {
    const args = {
      type: 'drag_sort',
      topic: '四季',
      difficulty: 1,
      ageGroup: '5-6',
    };
    const prompts = [
      (new FrameworkGenerateActivityTool({} as any) as any).buildPrompt(args, 1, [], []),
      // Legacy buildPrompt has a 3-argument signature.
      (new LegacyGenerateActivityTool({} as any) as any).buildPrompt(args, 1, []),
    ] as string[];
    for (const prompt of prompts) {
      expect(prompt).toContain('"type":"drag_sort"');
      expect(prompt).toContain('bucketId');
      expect(prompt).toMatch(/Never output HTML|URLs|URL/);
      expect(prompt).toContain('Every bucket MUST receive at least one item');
    }
  });

  it('both agent executors infer buckets+items as drag_sort, not sequencing', () => {
    const payload = { buckets: [{ id: 'a', label: 'A' }], items: [{ id: 'i', bucketId: 'a' }] };
    const legacy = Object.create(AgentExecutor.prototype) as any;
    const framework = Object.create(AgentExecutorService.prototype) as any;
    expect(legacy.inferActivityType(payload)).toBe('drag_sort');
    expect(framework.inferActivityType(payload)).toBe('drag_sort');
    expect(legacy.inferActivityType({ items: [] })).toBe('sequencing');
    expect(framework.inferActivityType({ items: [] })).toBe('sequencing');
  });
});
