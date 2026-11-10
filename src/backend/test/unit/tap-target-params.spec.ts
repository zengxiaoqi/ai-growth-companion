import * as fs from 'fs';
import * as path from 'path';

import {
  ACTIVITY_TYPES,
  isActivityType,
} from '../../src/agent-framework/core/types/tool-metadata';
import {
  TAP_TARGET_LIMITS,
  collectTapTargetBodyText,
  isSafeParamText,
  sanitizeTapTargetParams,
  simulateTapTargetPlay,
  validateTapTargetParams,
} from '../../src/common/activity/tap-target';
import { GenerateActivityTool as FrameworkGenerateActivityTool } from '../../src/agent-framework/tools/impl/generate-activity';
import { AssignActivityTool } from '../../src/agent-framework/tools/impl/assign-activity';
import { GenerateActivityTool as LegacyGenerateActivityTool } from '../../src/modules/ai/agent/tools/generate-activity';
import { toolDefinitions } from '../../src/modules/ai/agent/prompts/tool-definitions';
import { AgentExecutor } from '../../src/modules/ai/agent/agent-executor';
import { AgentExecutorService } from '../../src/agent-framework/agents/agent-executor.service';

/**
 * P1 / plan B: tap_target is the sixth (and last) parameterized activity type.
 * Timing decision (appendix H.1): the LLM never emits timing data — clients
 * lock taps until the spoken prompt finishes. Answerability rule: every
 * round's prompt MUST contain each correct target's label. Structural key is
 * `rounds` (grep-verified unique). See docs/ohmygame-integration-plan.md
 * appendix H.1 / appendix K.
 */
const EXAMPLES_DIR = path.resolve(__dirname, '../../../content/examples');

function loadExample(file: string): any {
  return JSON.parse(fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf-8'));
}

function makeValidRaw(overrides: Record<string, any> = {}): any {
  return {
    type: 'tap_target',
    title: '听指令点一点',
    rounds: [
      {
        id: 'r1',
        prompt: '请点出小猫',
        targets: [
          { id: 't1', label: '小猫', icon: '🐱' },
          { id: 't2', label: '小狗', icon: '🐶' },
          { id: 't3', label: '苹果', icon: '🍎' },
        ],
        correctIds: ['t1'],
      },
      {
        id: 'r2',
        prompt: '小狗在哪里',
        targets: [
          { id: 't4', label: '小鸭', icon: '🦆' },
          { id: 't5', label: '小狗', icon: '🐶' },
          { id: 't6', label: '西瓜', icon: '🍉' },
        ],
        correctIds: ['t5'],
      },
      {
        id: 'r3',
        prompt: '把小猫和小狗点出来',
        targets: [
          { id: 't7', label: '小猫', icon: '🐱' },
          { id: 't8', label: '小狗', icon: '🐶' },
          { id: 't9', label: '香蕉', icon: '🍌' },
        ],
        correctIds: ['t7', 't8'],
      },
    ],
    passingScore: 80,
    timeLimitSec: 120,
    ...overrides,
  };
}

describe('tap_target parameter contract', () => {
  describe('curriculum example (B7)', () => {
    it('tap_target-3-4.json satisfies the strict validator and is perfectly playable', () => {
      const example = loadExample('tap_target-3-4.json');
      expect(example.type).toBe('tap_target');
      expect(example.activityType).toBe('tap_target');

      const verdict = validateTapTargetParams(example);
      expect(verdict.ok).toBe(true);
      expect(verdict.score).toBe(100);
      expect(verdict.total).toBe(example.rounds.length);

      const play = simulateTapTargetPlay(example);
      expect(play.ok).toBe(true);

      // The example must also survive the untrusted-input sanitizer path.
      const sanitized = sanitizeTapTargetParams(example, {
        topic: example.topic,
        ageGroup: example.ageGroup,
        domain: example.domain,
      });
      expect(validateTapTargetParams(sanitized).ok).toBe(true);
      expect(sanitized.rounds).toHaveLength(example.rounds.length);
    });
  });

  describe('sanitizeTapTargetParams', () => {
    const ctx = { topic: '农场动物', ageGroup: '3-4' };

    it('produces a bounded, validated activity from clean input', () => {
      const activity = sanitizeTapTargetParams(makeValidRaw(), ctx);
      expect(activity.type).toBe('tap_target');
      expect(activity.topic).toBe('农场动物');
      expect(activity.rounds).toHaveLength(3);
      expect(activity.rounds[2].correctIds).toEqual(['t7', 't8']);
      expect(activity.passingScore).toBe(80);
      expect(activity.timeLimitSec).toBe(120);
      expect(validateTapTargetParams(activity).ok).toBe(true);
    });

    it('enforces the answerability rule: prompt must name every correct target', () => {
      const unnamed = makeValidRaw();
      unnamed.rounds[0].prompt = '请点出它';
      expect(() => sanitizeTapTargetParams(unnamed, ctx)).toThrow(
        /must mention the correct target label/,
      );
      expect(validateTapTargetParams(unnamed).ok).toBe(false);

      // Multi-select: both labels must appear in the prompt.
      const multiUnnamed = makeValidRaw();
      multiUnnamed.rounds[2].prompt = '把小猫点出来';
      expect(() => sanitizeTapTargetParams(multiUnnamed, ctx)).toThrow(
        /must mention the correct target label '小狗'/,
      );
    });

    it('rejects duplicate target labels within a round and dangling correctIds', () => {
      const dup = makeValidRaw();
      dup.rounds[0].targets[1].label = dup.rounds[0].targets[0].label;
      expect(() => sanitizeTapTargetParams(dup, ctx)).toThrow(
        /duplicates an existing target label/,
      );

      const dangling = makeValidRaw();
      dangling.rounds[0].correctIds = ['nope'];
      expect(() => sanitizeTapTargetParams(dangling, ctx)).toThrow(
        /correctIds must reference/,
      );
    });

    it('rejects too-few rounds or targets and caps round/target counts', () => {
      expect(() =>
        sanitizeTapTargetParams(makeValidRaw({ rounds: [makeValidRaw().rounds[0]] }), ctx),
      ).toThrow(/at least 3 valid rounds/);

      const thinRound = makeValidRaw();
      thinRound.rounds[0].targets = [thinRound.rounds[0].targets[0]];
      expect(() => sanitizeTapTargetParams(thinRound, ctx)).toThrow(
        /at least 2 valid targets/,
      );

      const capped = sanitizeTapTargetParams(
        makeValidRaw({
          rounds: Array.from({ length: 9 }, (_, i) => ({
            id: `r${i + 1}`,
            prompt: `请点出小猫${i}`,
            targets: [
              { id: `a${i}`, label: '小猫' },
              { id: `b${i}`, label: '小狗' },
            ],
            correctIds: [`a${i}`],
          })),
        }),
        ctx,
      );
      expect(capped.rounds).toHaveLength(TAP_TARGET_LIMITS.maxRounds);
    });

    it('rejects script/HTML/URL content in any text field', () => {
      const raw1 = makeValidRaw();
      raw1.rounds[0].prompt = '<script>alert(1)</script>';
      const raw2 = makeValidRaw();
      raw2.title = 'https://evil.example';
      const raw3 = makeValidRaw();
      raw3.rounds[0].targets[0].icon = 'javascript:alert(1)';
      for (const raw of [raw1, raw2, raw3]) {
        expect(() => sanitizeTapTargetParams(raw, ctx)).toThrow(/forbidden/i);
      }
      expect(isSafeParamText('小猫')).toBe(true);
      expect(isSafeParamText('<b>')).toBe(false);
      expect(isSafeParamText('http://x')).toBe(false);
    });

    it('clamps passingScore and timeLimitSec into range and falls back on garbage', () => {
      const activity = sanitizeTapTargetParams(
        makeValidRaw({ passingScore: 999, timeLimitSec: -5 }),
        ctx,
      );
      expect(activity.passingScore).toBe(100);
      expect(activity.timeLimitSec).toBe(TAP_TARGET_LIMITS.minTimeLimitSec);

      const defaults = sanitizeTapTargetParams(
        makeValidRaw({ passingScore: 'nope', timeLimitSec: 'nope' }),
        ctx,
      );
      expect(defaults.passingScore).toBe(TAP_TARGET_LIMITS.defaultPassingScore);
      expect(defaults.timeLimitSec).toBe(TAP_TARGET_LIMITS.defaultTimeLimitSec);
    });
  });

  describe('validateTapTargetParams', () => {
    it('rejects non-object, wrong type, duplicate round ids, bad correctIds and unsafe prompts', () => {
      expect(validateTapTargetParams(null).ok).toBe(false);
      expect(validateTapTargetParams({ type: 'quiz', questions: [] }).ok).toBe(false);

      const duplicateRound = makeValidRaw();
      duplicateRound.rounds[1].id = duplicateRound.rounds[0].id;
      expect(validateTapTargetParams(duplicateRound).reason).toMatch(/duplicate round id/);

      const dangling = makeValidRaw();
      dangling.rounds[0].correctIds = ['nope'];
      expect(validateTapTargetParams(dangling).reason).toMatch(
        /does not reference a target/,
      );

      const unnamed = makeValidRaw();
      unnamed.rounds[0].prompt = '请点出它';
      expect(validateTapTargetParams(unnamed).reason).toMatch(
        /prompt must mention correct target label/,
      );

      const outOfRange = makeValidRaw({ timeLimitSec: 999 });
      expect(validateTapTargetParams(outOfRange).reason).toMatch(/timeLimitSec/);
    });

    it('collectTapTargetBodyText is a no-op for legacy activity types', () => {
      expect(collectTapTargetBodyText(null)).toBe('');
      expect(
        collectTapTargetBodyText({ type: 'quiz', questions: [{ question: '1+1?' }] }),
      ).toBe('');
      expect(collectTapTargetBodyText(makeValidRaw())).toContain('小猫');
    });
  });
});

describe('tap_target whitelist single source of truth', () => {
  it('ACTIVITY_TYPES contains tap_target exactly once and is exposed by isActivityType', () => {
    expect(ACTIVITY_TYPES.filter((type) => type === 'tap_target')).toHaveLength(1);
    expect(ACTIVITY_TYPES).toHaveLength(13);
    expect(isActivityType('tap_target')).toBe(true);
    expect(isActivityType('nonexistent_type')).toBe(false);
  });

  it('both generateActivity tools accept tap_target', () => {
    const framework = new FrameworkGenerateActivityTool({} as any);
    expect(framework.metadata.inputSchema.properties.type.enum).toContain('tap_target');
    expect(framework.metadata.description).toContain('13种题型');

    const legacy = new LegacyGenerateActivityTool({} as any);
    const args = { type: 'tap_target', topic: '农场动物', difficulty: 1, ageGroup: '3-4' };
    expect((legacy as any).normalizeArgs(args).type).toBe('tap_target');
    expect((legacy as any).schemaForType('tap_target')).toContain('"type":"tap_target"');
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

  it('both generateActivity prompts emit a tap_target schema with the naming rule', () => {
    const args = {
      type: 'tap_target',
      topic: '农场动物',
      difficulty: 1,
      ageGroup: '3-4',
    };
    const prompts = [
      (new FrameworkGenerateActivityTool({} as any) as any).buildPrompt(args, 1, [], []),
      // Legacy buildPrompt has a 3-argument signature.
      (new LegacyGenerateActivityTool({} as any) as any).buildPrompt(args, 1, []),
    ] as string[];
    for (const prompt of prompts) {
      expect(prompt).toContain('"type":"tap_target"');
      expect(prompt).toContain('correctIds');
      expect(prompt).toContain('MUST name every correct target');
      expect(prompt).toMatch(/Never output HTML|URLs|URL/);
    }
  });

  it('both agent executors infer bare rounds as tap_target (siblings unchanged)', () => {
    const payload = makeValidRaw();
    const legacy = Object.create(AgentExecutor.prototype) as any;
    const framework = Object.create(AgentExecutorService.prototype) as any;
    expect(legacy.inferActivityType(payload)).toBe('tap_target');
    expect(framework.inferActivityType(payload)).toBe('tap_target');

    // Sibling parameterized types keep their inference.
    const tracePayload = {
      targets: [
        { id: 'g1', kind: 'glyph', text: '火', label: '火' },
        { id: 'g2', kind: 'glyph', text: '山', label: '山' },
      ],
    };
    const colorPayload = {
      regions: [
        { id: 's1', shape: 'sun', colorKey: 'yellow' },
        { id: 's2', shape: 'cloud', colorKey: 'white' },
      ],
      palette: ['red', 'yellow', 'white'],
    };
    expect(legacy.inferActivityType(tracePayload)).toBe('trace_path');
    expect(legacy.inferActivityType(colorPayload)).toBe('color_fill');
    expect(framework.inferActivityType(colorPayload)).toBe('color_fill');
  });
});
