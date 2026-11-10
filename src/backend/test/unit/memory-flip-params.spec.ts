import * as fs from 'fs';
import * as path from 'path';

import {
  ACTIVITY_TYPES,
  isActivityType,
} from '../../src/agent-framework/core/types/tool-metadata';
import {
  MEMORY_FLIP_LIMITS,
  collectMemoryFlipBodyText,
  isSafeParamText,
  sanitizeMemoryFlipParams,
  simulateMemoryFlipPlay,
  validateMemoryFlipParams,
} from '../../src/common/activity/memory-flip';
import { GenerateActivityTool as FrameworkGenerateActivityTool } from '../../src/agent-framework/tools/impl/generate-activity';
import { AssignActivityTool } from '../../src/agent-framework/tools/impl/assign-activity';
import { GenerateActivityTool as LegacyGenerateActivityTool } from '../../src/modules/ai/agent/tools/generate-activity';
import { toolDefinitions } from '../../src/modules/ai/agent/prompts/tool-definitions';
import { AgentExecutor } from '../../src/modules/ai/agent/agent-executor';
import { AgentExecutorService } from '../../src/agent-framework/agents/agent-executor.service';

/**
 * P1 / plan B: memory_flip is the second parameterized activity type.
 * Inference pitfall: it carries `pairs`, which every structural inference
 * path maps to `matching` — `pairs + gridSize -> memory_flip` MUST run
 * before the generic fallback. See docs/ohmygame-integration-plan.md §5.3.
 */
const EXAMPLES_DIR = path.resolve(__dirname, '../../../content/examples');

function loadExample(file: string): any {
  return JSON.parse(fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf-8'));
}

function makeValidRaw(overrides: Record<string, any> = {}): any {
  return {
    type: 'memory_flip',
    title: '动物记忆翻翻乐',
    prompt: '翻两张卡片，找到一模一样的一对',
    pairs: [
      { id: 'p1', label: '小猫', icon: '🐱' },
      { id: 'p2', label: '小狗', icon: '🐶' },
      { id: 'p3', label: '小兔', icon: '🐰' },
      { id: 'p4', label: '小鸭', icon: '🦆' },
    ],
    gridSize: { rows: 2, cols: 4 },
    passingScore: 80,
    timeLimitSec: 180,
    ...overrides,
  };
}

describe('memory_flip parameter contract', () => {
  describe('curriculum example (B7)', () => {
    it('memory_flip-5-6.json satisfies the strict validator and is perfectly playable', () => {
      const example = loadExample('memory_flip-5-6.json');
      expect(example.type).toBe('memory_flip');
      expect(example.activityType).toBe('memory_flip');

      const verdict = validateMemoryFlipParams(example);
      expect(verdict.ok).toBe(true);
      expect(verdict.score).toBe(100);
      expect(verdict.total).toBe(example.pairs.length);

      const play = simulateMemoryFlipPlay(example);
      expect(play.ok).toBe(true);
      expect(play.flips).toHaveLength(example.pairs.length);

      // The example must also survive the untrusted-input sanitizer path.
      const sanitized = sanitizeMemoryFlipParams(example, {
        topic: example.topic,
        ageGroup: example.ageGroup,
        domain: example.domain,
      });
      expect(validateMemoryFlipParams(sanitized).ok).toBe(true);
    });
  });

  describe('sanitizeMemoryFlipParams', () => {
    const ctx = { topic: '动物园', ageGroup: '5-6' };

    it('produces a bounded, validated activity from clean input', () => {
      const activity = sanitizeMemoryFlipParams(makeValidRaw(), ctx);
      expect(activity.type).toBe('memory_flip');
      expect(activity.topic).toBe('动物园');
      expect(activity.pairs).toHaveLength(4);
      expect(activity.gridSize).toEqual({ rows: 2, cols: 4 });
      expect(activity.passingScore).toBe(80);
      expect(activity.timeLimitSec).toBe(180);
      expect(validateMemoryFlipParams(activity).ok).toBe(true);
    });

    it('derives the child-friendly grid from the surviving pair count', () => {
      const three = sanitizeMemoryFlipParams(makeValidRaw({ gridSize: undefined }), ctx);
      expect(three.pairs).toHaveLength(4);
      expect(three.gridSize).toEqual({ rows: 2, cols: 4 });

      const six = sanitizeMemoryFlipParams(
        makeValidRaw({
          pairs: ['🐱', '🐶', '🐰', '🦆', '🐸', '🐷'].map((icon, i) => ({
            id: `p${i + 1}`,
            label: `动物${i + 1}`,
            icon,
          })),
          gridSize: { rows: 3, cols: 4 },
        }),
        ctx,
      );
      expect(six.gridSize).toEqual({ rows: 3, cols: 4 });
    });

    it('rejects a gridSize that does not fit pairs*2 cards', () => {
      expect(() =>
        sanitizeMemoryFlipParams(makeValidRaw({ gridSize: { rows: 3, cols: 3 } }), ctx),
      ).toThrow(/does not fit/);
    });

    it('rejects pair counts without a child-friendly grid (e.g. 5 pairs = 10 cards)', () => {
      const fivePairs = [
        { id: 'p1', label: '一' },
        { id: 'p2', label: '二' },
        { id: 'p3', label: '三' },
        { id: 'p4', label: '四' },
        { id: 'p5', label: '五' },
      ];
      expect(() =>
        sanitizeMemoryFlipParams(makeValidRaw({ pairs: fivePairs }), ctx),
      ).toThrow(/no child-friendly grid|supports/);
    });

    it('rejects duplicate faces (two pairs with identical label+icon)', () => {
      const raw = makeValidRaw();
      raw.pairs[1].label = raw.pairs[0].label;
      raw.pairs[1].icon = raw.pairs[0].icon;
      expect(() => sanitizeMemoryFlipParams(raw, ctx)).toThrow(/duplicates an existing/);
    });

    it('clamps passingScore and timeLimitSec into range and falls back on garbage', () => {
      const activity = sanitizeMemoryFlipParams(
        makeValidRaw({ passingScore: 999, timeLimitSec: -5 }),
        ctx,
      );
      expect(activity.passingScore).toBe(100);
      expect(activity.timeLimitSec).toBe(MEMORY_FLIP_LIMITS.minTimeLimitSec);

      const defaults = sanitizeMemoryFlipParams(
        makeValidRaw({ passingScore: 'nope', timeLimitSec: 'nope' }),
        ctx,
      );
      expect(defaults.passingScore).toBe(MEMORY_FLIP_LIMITS.defaultPassingScore);
      expect(defaults.timeLimitSec).toBe(MEMORY_FLIP_LIMITS.defaultTimeLimitSec);
    });

    it('rejects script/HTML/URL content in any text field', () => {
      const raw1 = makeValidRaw();
      raw1.pairs[0].label = '<script>alert(1)</script>';
      const raw2 = makeValidRaw();
      raw2.title = 'https://evil.example';
      const raw3 = makeValidRaw();
      raw3.prompt = '点这里 <img src=x onerror=alert(1)>';
      for (const raw of [raw1, raw2, raw3]) {
        expect(() => sanitizeMemoryFlipParams(raw, ctx)).toThrow(/forbidden/i);
      }
      expect(isSafeParamText('小猫')).toBe(true);
      expect(isSafeParamText('🐱')).toBe(true);
      expect(isSafeParamText('<b>')).toBe(false);
      expect(isSafeParamText('http://x')).toBe(false);
    });
  });

  describe('validateMemoryFlipParams', () => {
    it('rejects non-object, wrong type, duplicate ids and bad grids', () => {
      expect(validateMemoryFlipParams(null).ok).toBe(false);
      expect(validateMemoryFlipParams({ type: 'matching', pairs: [] }).ok).toBe(false);

      const duplicate = makeValidRaw();
      duplicate.pairs[1].id = duplicate.pairs[0].id;
      expect(validateMemoryFlipParams(duplicate).reason).toMatch(/duplicate pair id/);

      const badGrid = makeValidRaw();
      badGrid.gridSize = { rows: 2, cols: 2 };
      expect(validateMemoryFlipParams(badGrid).reason).toMatch(/does not fit/);

      const outOfRange = makeValidRaw({ passingScore: 101 });
      expect(validateMemoryFlipParams(outOfRange).reason).toMatch(/passingScore/);
    });

    it('collectMemoryFlipBodyText is a no-op for legacy activity types', () => {
      expect(collectMemoryFlipBodyText(null)).toBe('');
      expect(collectMemoryFlipBodyText({ type: 'quiz', questions: [{ question: '1+1?' }] })).toBe(
        '',
      );
      expect(collectMemoryFlipBodyText(makeValidRaw())).toContain('小猫');
    });
  });
});

describe('memory_flip whitelist single source of truth', () => {
  it('ACTIVITY_TYPES contains memory_flip exactly once and is exposed by isActivityType', () => {
    expect(ACTIVITY_TYPES.filter((type) => type === 'memory_flip')).toHaveLength(1);
    expect(ACTIVITY_TYPES).toHaveLength(11);
    expect(isActivityType('memory_flip')).toBe(true);
    expect(isActivityType('color_fill')).toBe(false);
  });

  it('both generateActivity tools accept memory_flip', () => {
    const framework = new FrameworkGenerateActivityTool({} as any);
    expect(framework.metadata.inputSchema.properties.type.enum).toContain('memory_flip');

    const legacy = new LegacyGenerateActivityTool({} as any);
    const args = { type: 'memory_flip', topic: '动物园', difficulty: 1, ageGroup: '5-6' };
    expect((legacy as any).normalizeArgs(args).type).toBe('memory_flip');
    expect((legacy as any).schemaForType('memory_flip')).toContain('"type":"memory_flip"');
  });

  it('framework assignActivity schema and legacy tool definitions stay in sync', () => {
    const assign = new AssignActivityTool({} as any, {} as any, {} as any);
    expect(assign.metadata.inputSchema.properties.activityType.enum).toEqual([
      ...ACTIVITY_TYPES,
    ]);

    const relevant = toolDefinitions.filter((def: any) =>
      ['generateActivity', 'assignActivity'].includes(def.function.name),
    );
    for (const def of relevant as any[]) {
      const props = (def.function.parameters as any).properties;
      const enumField = props.type ?? props.activityType;
      expect(enumField.enum).toEqual([...ACTIVITY_TYPES]);
    }
  });

  it('both generateActivity prompts emit a memory_flip schema and forbid code/URLs', () => {
    const args = {
      type: 'memory_flip',
      topic: '动物园',
      difficulty: 1,
      ageGroup: '5-6',
    };
    const prompts = [
      (new FrameworkGenerateActivityTool({} as any) as any).buildPrompt(args, 1, [], []),
      // Legacy buildPrompt has a 3-argument signature.
      (new LegacyGenerateActivityTool({} as any) as any).buildPrompt(args, 1, []),
    ] as string[];
    for (const prompt of prompts) {
      expect(prompt).toContain('"type":"memory_flip"');
      expect(prompt).toContain('gridSize');
      expect(prompt).toMatch(/Never output HTML|URLs|URL/);
      expect(prompt).toContain('pairs * 2');
    }
  });

  it('both agent executors infer pairs+gridSize as memory_flip, not matching', () => {
    const payload = {
      pairs: [
        { id: 'p1', label: '小猫' },
        { id: 'p2', label: '小狗' },
      ],
      gridSize: { rows: 2, cols: 2 },
    };
    const legacy = Object.create(AgentExecutor.prototype) as any;
    const framework = Object.create(AgentExecutorService.prototype) as any;
    expect(legacy.inferActivityType(payload)).toBe('memory_flip');
    expect(framework.inferActivityType(payload)).toBe('memory_flip');
    // Without gridSize the generic pairs -> matching fallback still applies.
    expect(legacy.inferActivityType({ pairs: [{ id: 'p1', left: 'a', right: 'b' }] })).toBe(
      'matching',
    );
    expect(framework.inferActivityType({ pairs: [{ id: 'p1', left: 'a', right: 'b' }] })).toBe(
      'matching',
    );
  });
});
