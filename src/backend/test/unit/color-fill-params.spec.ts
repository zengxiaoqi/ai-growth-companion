import * as fs from 'fs';
import * as path from 'path';

import {
  ACTIVITY_TYPES,
  isActivityType,
} from '../../src/agent-framework/core/types/tool-metadata';
import {
  COLOR_FILL_COLORS,
  COLOR_FILL_LIMITS,
  COLOR_FILL_SHAPES,
  collectColorFillBodyText,
  isColorFillColor,
  isColorFillShape,
  isSafeParamText,
  sanitizeColorFillParams,
  simulateColorFillPlay,
  validateColorFillParams,
} from '../../src/common/activity/color-fill';
import { GenerateActivityTool as FrameworkGenerateActivityTool } from '../../src/agent-framework/tools/impl/generate-activity';
import { AssignActivityTool } from '../../src/agent-framework/tools/impl/assign-activity';
import { GenerateActivityTool as LegacyGenerateActivityTool } from '../../src/modules/ai/agent/tools/generate-activity';
import { toolDefinitions } from '../../src/modules/ai/agent/prompts/tool-definitions';
import { AgentExecutor } from '../../src/modules/ai/agent/agent-executor';
import { AgentExecutorService } from '../../src/agent-framework/agents/agent-executor.service';

/**
 * P1 / plan B: color_fill is the fifth parameterized activity type.
 * Geometry decision (appendix H.3): the LLM never emits coordinates or paths —
 * regions come from a fixed shape library laid out client-side; colors come
 * from a fixed table. palette must contain every region colorKey plus at
 * least one distractor. Structural key is `regions` (grep-verified unique).
 * See docs/ohmygame-integration-plan.md appendix H.3 / appendix J.
 */
const EXAMPLES_DIR = path.resolve(__dirname, '../../../content/examples');

function loadExample(file: string): any {
  return JSON.parse(fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf-8'));
}

function makeValidRaw(overrides: Record<string, any> = {}): any {
  return {
    type: 'color_fill',
    title: '给太阳和云朵涂色',
    prompt: '给太阳涂上黄色，给云朵涂上白色',
    regions: [
      { id: 's1', shape: 'sun', colorKey: 'yellow' },
      { id: 's2', shape: 'cloud', colorKey: 'white' },
      { id: 's3', shape: 'star', colorKey: 'yellow' },
    ],
    palette: ['red', 'yellow', 'blue', 'white'],
    passingScore: 80,
    timeLimitSec: 120,
    ...overrides,
  };
}

describe('color_fill parameter contract', () => {
  describe('curriculum example (B7)', () => {
    it('color_fill-3-4.json satisfies the strict validator and is perfectly playable', () => {
      const example = loadExample('color_fill-3-4.json');
      expect(example.type).toBe('color_fill');
      expect(example.activityType).toBe('color_fill');

      const verdict = validateColorFillParams(example);
      expect(verdict.ok).toBe(true);
      expect(verdict.score).toBe(100);
      expect(verdict.total).toBe(example.regions.length);

      const play = simulateColorFillPlay(example);
      expect(play.ok).toBe(true);

      // The example must also survive the untrusted-input sanitizer path.
      const sanitized = sanitizeColorFillParams(example, {
        topic: example.topic,
        ageGroup: example.ageGroup,
        domain: example.domain,
      });
      expect(validateColorFillParams(sanitized).ok).toBe(true);
      expect(sanitized.regions).toHaveLength(example.regions.length);
    });
  });

  describe('sanitizeColorFillParams', () => {
    const ctx = { topic: '天空', ageGroup: '3-4' };

    it('produces a bounded, validated activity from clean input', () => {
      const activity = sanitizeColorFillParams(makeValidRaw(), ctx);
      expect(activity.type).toBe('color_fill');
      expect(activity.topic).toBe('天空');
      expect(activity.regions).toHaveLength(3);
      expect(activity.palette).toEqual(['red', 'yellow', 'blue', 'white']);
      expect(activity.passingScore).toBe(80);
      expect(activity.timeLimitSec).toBe(120);
      expect(validateColorFillParams(activity).ok).toBe(true);
    });

    it('rejects shapes and colors outside the fixed libraries', () => {
      const badShape = makeValidRaw();
      badShape.regions[0].shape = 'dragon';
      expect(() => sanitizeColorFillParams(badShape, ctx)).toThrow(
        /shape must be one of/,
      );

      const badColor = makeValidRaw();
      badColor.regions[1].colorKey = 'gold';
      expect(() => sanitizeColorFillParams(badColor, ctx)).toThrow(
        /colorKey must be one of/,
      );
    });

    it('requires the palette to cover every region color', () => {
      const missing = makeValidRaw({ palette: ['red', 'yellow', 'blue'] });
      expect(() => sanitizeColorFillParams(missing, ctx)).toThrow(
        /missing: white/,
      );
    });

    it('requires at least one distractor color in the palette', () => {
      const noDistractor = makeValidRaw({
        regions: [
          { id: 's1', shape: 'sun', colorKey: 'yellow' },
          { id: 's2', shape: 'star', colorKey: 'yellow' },
        ],
        palette: ['yellow', 'red'],
      });
      expect(() => sanitizeColorFillParams(noDistractor, ctx)).toThrow(
        /distractor/,
      );

      const onlyTargets = makeValidRaw({
        regions: [
          { id: 's1', shape: 'sun', colorKey: 'yellow' },
          { id: 's2', shape: 'star', colorKey: 'red' },
        ],
        palette: ['yellow', 'red'],
      });
      expect(() => sanitizeColorFillParams(onlyTargets, ctx)).toThrow(
        /at least 3 colors|distractor/,
      );
    });

    it('rejects too-few regions and de-duplicates the palette', () => {
      expect(() =>
        sanitizeColorFillParams(
          makeValidRaw({ regions: [{ id: 's1', shape: 'sun', colorKey: 'yellow' }] }),
          ctx,
        ),
      ).toThrow(/at least 2 valid regions/);

      const dupPalette = sanitizeColorFillParams(
        makeValidRaw({ palette: ['red', 'red', 'yellow', 'blue', 'white'] }),
        ctx,
      );
      expect(dupPalette.palette).toEqual(['red', 'yellow', 'blue', 'white']);
    });

    it('rejects script/HTML/URL content in any text field', () => {
      const raw1 = makeValidRaw();
      raw1.title = '<script>alert(1)</script>';
      const raw2 = makeValidRaw();
      raw2.prompt = 'https://evil.example';
      for (const raw of [raw1, raw2]) {
        expect(() => sanitizeColorFillParams(raw, ctx)).toThrow(/forbidden/i);
      }
      expect(isSafeParamText('涂色')).toBe(true);
      expect(isSafeParamText('<b>')).toBe(false);
      expect(isSafeParamText('http://x')).toBe(false);
    });

    it('clamps passingScore and timeLimitSec into range and falls back on garbage', () => {
      const activity = sanitizeColorFillParams(
        makeValidRaw({ passingScore: 999, timeLimitSec: -5 }),
        ctx,
      );
      expect(activity.passingScore).toBe(100);
      expect(activity.timeLimitSec).toBe(COLOR_FILL_LIMITS.minTimeLimitSec);

      const defaults = sanitizeColorFillParams(
        makeValidRaw({ passingScore: 'nope', timeLimitSec: 'nope' }),
        ctx,
      );
      expect(defaults.passingScore).toBe(COLOR_FILL_LIMITS.defaultPassingScore);
      expect(defaults.timeLimitSec).toBe(COLOR_FILL_LIMITS.defaultTimeLimitSec);
    });
  });

  describe('validateColorFillParams', () => {
    it('rejects non-object, wrong type, duplicate ids, unknown enums and bad palette', () => {
      expect(validateColorFillParams(null).ok).toBe(false);
      expect(validateColorFillParams({ type: 'quiz', questions: [] }).ok).toBe(false);

      const duplicate = makeValidRaw();
      duplicate.regions[1].id = duplicate.regions[0].id;
      expect(validateColorFillParams(duplicate).reason).toMatch(/duplicate region id/);

      const unknownShape = makeValidRaw();
      unknownShape.regions[0].shape = 'dragon';
      expect(validateColorFillParams(unknownShape).reason).toMatch(/unknown shape/);

      const missingColor = makeValidRaw({ palette: ['red', 'yellow', 'blue'] });
      expect(validateColorFillParams(missingColor).reason).toMatch(
        /palette is missing region color white/,
      );

      const noDistractor = makeValidRaw({
        regions: [
          { id: 's1', shape: 'sun', colorKey: 'yellow' },
          { id: 's2', shape: 'star', colorKey: 'red' },
        ],
        palette: ['yellow', 'red'],
      });
      expect(validateColorFillParams(noDistractor).reason).toMatch(
        /palette size out of range|distractor/,
      );
    });

    it('shape/color libraries are exactly the 10-entry enums', () => {
      expect(COLOR_FILL_SHAPES).toHaveLength(10);
      expect(COLOR_FILL_COLORS).toHaveLength(10);
      expect(isColorFillShape('sun')).toBe(true);
      expect(isColorFillShape('dragon')).toBe(false);
      expect(isColorFillColor('gold')).toBe(false);
      expect(isColorFillColor('white')).toBe(true);
    });

    it('collectColorFillBodyText is a no-op for legacy activity types', () => {
      expect(collectColorFillBodyText(null)).toBe('');
      expect(
        collectColorFillBodyText({ type: 'quiz', questions: [{ question: '1+1?' }] }),
      ).toBe('');
      expect(collectColorFillBodyText(makeValidRaw())).toContain('sun');
    });
  });
});

describe('color_fill whitelist single source of truth', () => {
  it('ACTIVITY_TYPES contains color_fill exactly once and is exposed by isActivityType', () => {
    expect(ACTIVITY_TYPES.filter((type) => type === 'color_fill')).toHaveLength(1);
    expect(ACTIVITY_TYPES).toHaveLength(12);
    expect(isActivityType('color_fill')).toBe(true);
    expect(isActivityType('tap_target')).toBe(false);
  });

  it('both generateActivity tools accept color_fill', () => {
    const framework = new FrameworkGenerateActivityTool({} as any);
    expect(framework.metadata.inputSchema.properties.type.enum).toContain('color_fill');
    expect(framework.metadata.description).toContain('12种题型');

    const legacy = new LegacyGenerateActivityTool({} as any);
    const args = { type: 'color_fill', topic: '天空', difficulty: 1, ageGroup: '3-4' };
    expect((legacy as any).normalizeArgs(args).type).toBe('color_fill');
    expect((legacy as any).schemaForType('color_fill')).toContain('"type":"color_fill"');
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

  it('both generateActivity prompts emit a color_fill schema with the no-coordinate rule', () => {
    const args = {
      type: 'color_fill',
      topic: '天空',
      difficulty: 1,
      ageGroup: '3-4',
    };
    const prompts = [
      (new FrameworkGenerateActivityTool({} as any) as any).buildPrompt(args, 1, [], []),
      // Legacy buildPrompt has a 3-argument signature.
      (new LegacyGenerateActivityTool({} as any) as any).buildPrompt(args, 1, []),
    ] as string[];
    for (const prompt of prompts) {
      expect(prompt).toContain('"type":"color_fill"');
      expect(prompt).toContain('colorKey');
      expect(prompt).toContain('NEVER provide coordinates');
      expect(prompt).toMatch(/Never output HTML|URLs|URL/);
    }
  });

  it('both agent executors infer bare regions as color_fill', () => {
    const payload = {
      regions: [
        { id: 's1', shape: 'sun', colorKey: 'yellow' },
        { id: 's2', shape: 'cloud', colorKey: 'white' },
      ],
      palette: ['red', 'yellow', 'blue', 'white'],
    };
    const legacy = Object.create(AgentExecutor.prototype) as any;
    const framework = Object.create(AgentExecutorService.prototype) as any;
    expect(legacy.inferActivityType(payload)).toBe('color_fill');
    expect(framework.inferActivityType(payload)).toBe('color_fill');

    // trace_path (targets) and drag_sort/matching shapes keep their inference.
    const tracePayload = {
      targets: [
        { id: 'g1', kind: 'glyph', text: '火', label: '火' },
        { id: 'g2', kind: 'glyph', text: '山', label: '山' },
      ],
    };
    expect(legacy.inferActivityType(tracePayload)).toBe('trace_path');
    expect(framework.inferActivityType(tracePayload)).toBe('trace_path');
  });
});
