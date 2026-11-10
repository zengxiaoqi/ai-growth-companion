import * as fs from 'fs';
import * as path from 'path';

import {
  ACTIVITY_TYPES,
  isActivityType,
} from '../../src/agent-framework/core/types/tool-metadata';
import {
  PATTERN_NEXT_LIMITS,
  collectPatternNextBodyText,
  isSafeParamText,
  sanitizePatternNextParams,
  simulatePatternNextPlay,
  validatePatternNextParams,
} from '../../src/common/activity/pattern-next';
import { GenerateActivityTool as FrameworkGenerateActivityTool } from '../../src/agent-framework/tools/impl/generate-activity';
import { AssignActivityTool } from '../../src/agent-framework/tools/impl/assign-activity';
import { GenerateActivityTool as LegacyGenerateActivityTool } from '../../src/modules/ai/agent/tools/generate-activity';
import { toolDefinitions } from '../../src/modules/ai/agent/prompts/tool-definitions';
import { AgentExecutor } from '../../src/modules/ai/agent/agent-executor';
import { AgentExecutorService } from '../../src/agent-framework/agents/agent-executor.service';

/**
 * P1 / plan B: pattern_next is the third parameterized activity type.
 * Structural keys are `sequence` + `options`; no legacy type uses `sequence`,
 * but inference MUST run before the generic fallbacks.
 * See docs/ohmygame-integration-plan.md §5.3 / appendix G.
 */
const EXAMPLES_DIR = path.resolve(__dirname, '../../../content/examples');

function loadExample(file: string): any {
  return JSON.parse(fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf-8'));
}

function makeValidRaw(overrides: Record<string, any> = {}): any {
  return {
    type: 'pattern_next',
    title: '水果接龙',
    prompt: '下一个水果是什么？',
    sequence: [
      { id: 's1', label: '苹果', icon: '🍎' },
      { id: 's2', label: '香蕉', icon: '🍌' },
      { id: 's3', label: '苹果', icon: '🍎' },
    ],
    options: [
      { id: 'o1', label: '香蕉', icon: '🍌' },
      { id: 'o2', label: '葡萄', icon: '🍇' },
      { id: 'o3', label: '西瓜', icon: '🍉' },
    ],
    answerIndex: 0,
    passingScore: 80,
    timeLimitSec: 120,
    ...overrides,
  };
}

describe('pattern_next parameter contract', () => {
  describe('curriculum example (B7)', () => {
    it('pattern_next-5-6.json satisfies the strict validator and is perfectly playable', () => {
      const example = loadExample('pattern_next-5-6.json');
      expect(example.type).toBe('pattern_next');
      expect(example.activityType).toBe('pattern_next');

      const verdict = validatePatternNextParams(example);
      expect(verdict.ok).toBe(true);
      expect(verdict.score).toBe(100);
      expect(verdict.total).toBe(1);

      const play = simulatePatternNextPlay(example);
      expect(play.ok).toBe(true);
      expect(play.correct).toBe(true);

      // The example must also survive the untrusted-input sanitizer path.
      const sanitized = sanitizePatternNextParams(example, {
        topic: example.topic,
        ageGroup: example.ageGroup,
        domain: example.domain,
      });
      expect(validatePatternNextParams(sanitized).ok).toBe(true);
      expect(sanitized.answerIndex).toBe(example.answerIndex);
    });
  });

  describe('sanitizePatternNextParams', () => {
    const ctx = { topic: '水果', ageGroup: '5-6' };

    it('produces a bounded, validated activity from clean input', () => {
      const activity = sanitizePatternNextParams(makeValidRaw(), ctx);
      expect(activity.type).toBe('pattern_next');
      expect(activity.topic).toBe('水果');
      expect(activity.sequence).toHaveLength(3);
      expect(activity.options).toHaveLength(3);
      expect(activity.answerIndex).toBe(0);
      expect(activity.passingScore).toBe(80);
      expect(activity.timeLimitSec).toBe(120);
      expect(validatePatternNextParams(activity).ok).toBe(true);
    });

    it('tolerates a 1-based answerIndex when zero-based is out of range', () => {
      // 3 options: zero-based 0..2. A raw answerIndex of 3 is invalid as
      // zero-based but valid as 1-based -> corrected to 2.
      const oneBased = sanitizePatternNextParams(makeValidRaw({ answerIndex: 3 }), ctx);
      expect(oneBased.answerIndex).toBe(2);

      // Unusable indices must fail loudly so the reflection loop can retry.
      expect(() => sanitizePatternNextParams(makeValidRaw({ answerIndex: 99 }), ctx)).toThrow(
        /answerIndex/,
      );
      expect(() => sanitizePatternNextParams(makeValidRaw({ answerIndex: 'nope' }), ctx)).toThrow(
        /answerIndex/,
      );
    });

    it('rejects duplicate option labels (ambiguous answers)', () => {
      const raw = makeValidRaw();
      raw.options[1].label = raw.options[0].label;
      expect(() => sanitizePatternNextParams(raw, ctx)).toThrow(/duplicates an existing option/);
    });

    it('rejects too-few sequence items or options', () => {
      expect(() =>
        sanitizePatternNextParams(makeValidRaw({ sequence: [makeValidRaw().sequence[0]] }), ctx),
      ).toThrow(/at least 2 valid sequence/);
      expect(() => sanitizePatternNextParams(makeValidRaw({ options: [] }), ctx)).toThrow(
        /at least 2 valid options/,
      );
    });

    it('clamps passingScore and timeLimitSec into range and falls back on garbage', () => {
      const activity = sanitizePatternNextParams(
        makeValidRaw({ passingScore: 999, timeLimitSec: -5 }),
        ctx,
      );
      expect(activity.passingScore).toBe(100);
      expect(activity.timeLimitSec).toBe(PATTERN_NEXT_LIMITS.minTimeLimitSec);

      const defaults = sanitizePatternNextParams(
        makeValidRaw({ passingScore: 'nope', timeLimitSec: 'nope' }),
        ctx,
      );
      expect(defaults.passingScore).toBe(PATTERN_NEXT_LIMITS.defaultPassingScore);
      expect(defaults.timeLimitSec).toBe(PATTERN_NEXT_LIMITS.defaultTimeLimitSec);
    });

    it('rejects script/HTML/URL content in any text field', () => {
      const raw1 = makeValidRaw();
      raw1.sequence[0].label = '<script>alert(1)</script>';
      const raw2 = makeValidRaw();
      raw2.title = 'https://evil.example';
      const raw3 = makeValidRaw();
      raw3.options[0].label = 'javascript:alert(1)';
      for (const raw of [raw1, raw2, raw3]) {
        expect(() => sanitizePatternNextParams(raw, ctx)).toThrow(/forbidden/i);
      }
      expect(isSafeParamText('苹果')).toBe(true);
      expect(isSafeParamText('🍎')).toBe(true);
      expect(isSafeParamText('<b>')).toBe(false);
      expect(isSafeParamText('http://x')).toBe(false);
    });
  });

  describe('validatePatternNextParams', () => {
    it('rejects non-object, wrong type, duplicate ids and bad answerIndex', () => {
      expect(validatePatternNextParams(null).ok).toBe(false);
      expect(validatePatternNextParams({ type: 'quiz', questions: [] }).ok).toBe(false);

      const duplicate = makeValidRaw();
      duplicate.sequence[1].id = duplicate.sequence[0].id;
      expect(validatePatternNextParams(duplicate).reason).toMatch(/duplicate sequence id/);

      const badAnswer = makeValidRaw({ answerIndex: 7 });
      expect(validatePatternNextParams(badAnswer).reason).toMatch(/answerIndex/);

      const outOfRange = makeValidRaw({ passingScore: 101 });
      expect(validatePatternNextParams(outOfRange).reason).toMatch(/passingScore/);
    });

    it('collectPatternNextBodyText is a no-op for legacy activity types', () => {
      expect(collectPatternNextBodyText(null)).toBe('');
      expect(
        collectPatternNextBodyText({ type: 'quiz', questions: [{ question: '1+1?' }] }),
      ).toBe('');
      expect(collectPatternNextBodyText(makeValidRaw())).toContain('苹果');
    });
  });
});

describe('pattern_next whitelist single source of truth', () => {
  it('ACTIVITY_TYPES contains pattern_next exactly once and is exposed by isActivityType', () => {
    expect(ACTIVITY_TYPES.filter((type) => type === 'pattern_next')).toHaveLength(1);
    expect(ACTIVITY_TYPES).toHaveLength(10);
    expect(isActivityType('pattern_next')).toBe(true);
    expect(isActivityType('color_fill')).toBe(false);
  });

  it('both generateActivity tools accept pattern_next', () => {
    const framework = new FrameworkGenerateActivityTool({} as any);
    expect(framework.metadata.inputSchema.properties.type.enum).toContain('pattern_next');

    const legacy = new LegacyGenerateActivityTool({} as any);
    const args = { type: 'pattern_next', topic: '水果', difficulty: 1, ageGroup: '5-6' };
    expect((legacy as any).normalizeArgs(args).type).toBe('pattern_next');
    expect((legacy as any).schemaForType('pattern_next')).toContain('"type":"pattern_next"');
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

  it('both generateActivity prompts emit a pattern_next schema and forbid code/URLs', () => {
    const args = {
      type: 'pattern_next',
      topic: '水果',
      difficulty: 1,
      ageGroup: '5-6',
    };
    const prompts = [
      (new FrameworkGenerateActivityTool({} as any) as any).buildPrompt(args, 1, [], []),
      // Legacy buildPrompt has a 3-argument signature.
      (new LegacyGenerateActivityTool({} as any) as any).buildPrompt(args, 1, []),
    ] as string[];
    for (const prompt of prompts) {
      expect(prompt).toContain('"type":"pattern_next"');
      expect(prompt).toContain('answerIndex');
      expect(prompt).toMatch(/Never output HTML|URLs|URL/);
      expect(prompt).toContain('options labels MUST be unique');
    }
  });

  it('both agent executors infer sequence+options as pattern_next', () => {
    const payload = {
      sequence: [{ id: 's1', label: '苹果' }],
      options: [{ id: 'o1', label: '香蕉' }],
      answerIndex: 0,
    };
    const legacy = Object.create(AgentExecutor.prototype) as any;
    const framework = Object.create(AgentExecutorService.prototype) as any;
    expect(legacy.inferActivityType(payload)).toBe('pattern_next');
    expect(framework.inferActivityType(payload)).toBe('pattern_next');
    // sequence alone (no options) must NOT become pattern_next; both
    // executors return undefined for unknown structures.
    expect(legacy.inferActivityType({ sequence: [{ id: 's1', label: '苹果' }] })).toBeUndefined();
    expect(
      framework.inferActivityType({ sequence: [{ id: 's1', label: '苹果' }] }),
    ).toBeUndefined();
  });
});
