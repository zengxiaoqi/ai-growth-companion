import * as fs from 'fs';
import * as path from 'path';

import {
  ACTIVITY_TYPES,
  isActivityType,
} from '../../src/agent-framework/core/types/tool-metadata';
import {
  TRACE_PATH_LIMITS,
  collectTracePathBodyText,
  isSafeParamText,
  isValidGlyphText,
  sanitizeTracePathParams,
  simulateTracePathPlay,
  validateTracePathParams,
} from '../../src/common/activity/trace-path';
import { GenerateActivityTool as FrameworkGenerateActivityTool } from '../../src/agent-framework/tools/impl/generate-activity';
import { AssignActivityTool } from '../../src/agent-framework/tools/impl/assign-activity';
import { GenerateActivityTool as LegacyGenerateActivityTool } from '../../src/modules/ai/agent/tools/generate-activity';
import { toolDefinitions } from '../../src/modules/ai/agent/prompts/tool-definitions';
import { AgentExecutor } from '../../src/modules/ai/agent/agent-executor';
import { AgentExecutorService } from '../../src/agent-framework/agents/agent-executor.service';

/**
 * P1 / plan B: trace_path is the fourth parameterized activity type.
 * Geometry decision (appendix H.2): the LLM never emits coordinates — only
 * 1-2 whitelisted glyph characters; clients derive sample points from the
 * glyph itself. The structural key is `targets`; the Flutter renderer has a
 * legacy items+targets -> matching fallback, so the bare `targets` check MUST
 * run before it. See docs/ohmygame-integration-plan.md appendix H.
 */
const EXAMPLES_DIR = path.resolve(__dirname, '../../../content/examples');

function loadExample(file: string): any {
  return JSON.parse(fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf-8'));
}

function makeValidRaw(overrides: Record<string, any> = {}): any {
  return {
    type: 'trace_path',
    title: '描一描：火与山',
    prompt: '请沿着虚线描一描',
    targets: [
      { id: 'g1', kind: 'glyph', text: '火', label: '火' },
      { id: 'g2', kind: 'glyph', text: '山', label: '山' },
      { id: 'g3', kind: 'glyph', text: '水', label: '水' },
    ],
    minCoverage: 0.7,
    passingScore: 80,
    timeLimitSec: 180,
    ...overrides,
  };
}

describe('trace_path parameter contract', () => {
  describe('curriculum example (B7)', () => {
    it('trace_path-3-4.json satisfies the strict validator and is perfectly playable', () => {
      const example = loadExample('trace_path-3-4.json');
      expect(example.type).toBe('trace_path');
      expect(example.activityType).toBe('trace_path');

      const verdict = validateTracePathParams(example);
      expect(verdict.ok).toBe(true);
      expect(verdict.score).toBe(100);
      expect(verdict.total).toBe(example.targets.length);

      const play = simulateTracePathPlay(example);
      expect(play.ok).toBe(true);

      // The example must also survive the untrusted-input sanitizer path.
      const sanitized = sanitizeTracePathParams(example, {
        topic: example.topic,
        ageGroup: example.ageGroup,
        domain: example.domain,
      });
      expect(validateTracePathParams(sanitized).ok).toBe(true);
      expect(sanitized.targets).toHaveLength(example.targets.length);
    });
  });

  describe('sanitizeTracePathParams', () => {
    const ctx = { topic: '常用字', ageGroup: '3-4' };

    it('produces a bounded, validated activity from clean input', () => {
      const activity = sanitizeTracePathParams(makeValidRaw(), ctx);
      expect(activity.type).toBe('trace_path');
      expect(activity.topic).toBe('常用字');
      expect(activity.targets).toHaveLength(3);
      expect(activity.targets.every((t: any) => t.kind === 'glyph')).toBe(true);
      expect(activity.minCoverage).toBe(0.7);
      expect(activity.passingScore).toBe(80);
      expect(activity.timeLimitSec).toBe(180);
      expect(validateTracePathParams(activity).ok).toBe(true);
    });

    it('defaults the label to the glyph text and clamps minCoverage', () => {
      const activity = sanitizeTracePathParams(
        makeValidRaw({ targets: [{ id: 'g1', text: '山' }, { id: 'g2', text: '3' }] }),
        ctx,
      );
      expect(activity.targets[0].label).toBe('山');
      expect(activity.targets[1].label).toBe('3');

      const clamped = sanitizeTracePathParams(makeValidRaw({ minCoverage: 0.2 }), ctx);
      expect(clamped.minCoverage).toBe(TRACE_PATH_LIMITS.minCoverage);
      const high = sanitizeTracePathParams(makeValidRaw({ minCoverage: 0.99 }), ctx);
      expect(high.minCoverage).toBe(TRACE_PATH_LIMITS.maxCoverage);
      const garbage = sanitizeTracePathParams(makeValidRaw({ minCoverage: 'nope' }), ctx);
      expect(garbage.minCoverage).toBe(TRACE_PATH_LIMITS.defaultCoverage);
    });

    it('rejects emoji, rare characters and over-long glyph text', () => {
      expect(() =>
        sanitizeTracePathParams(
          makeValidRaw({
            targets: [
              { id: 'g1', kind: 'glyph', text: '🐱' },
              { id: 'g2', kind: 'glyph', text: '山' },
            ],
          }),
          ctx,
        ),
      ).toThrow(/1-2 common CJK\/digit\/letter/);

      expect(() =>
        sanitizeTracePathParams(
          makeValidRaw({
            targets: [
              { id: 'g1', kind: 'glyph', text: '𠀀' },
              { id: 'g2', kind: 'glyph', text: '山' },
            ],
          }),
          ctx,
        ),
      ).toThrow(/1-2 common CJK\/digit\/letter/);

      expect(() =>
        sanitizeTracePathParams(
          makeValidRaw({
            targets: [
              { id: 'g1', kind: 'glyph', text: '山水' },
              { id: 'g2', kind: 'glyph', text: '火' },
            ],
          }),
          ctx,
        ),
      ).not.toThrow();
    });

    it('rejects polyline targets loudly (LLM generation is glyph-only)', () => {
      const raw = makeValidRaw();
      raw.targets[0].kind = 'polyline';
      raw.targets[0].points = [{ x: 10, y: 10 }, { x: 200, y: 200 }];
      expect(() => sanitizeTracePathParams(raw, ctx)).toThrow(/only accepts glyph/);
    });

    it('rejects duplicate glyph texts and too-few targets', () => {
      const dup = makeValidRaw();
      dup.targets[1].text = dup.targets[0].text;
      expect(() => sanitizeTracePathParams(dup, ctx)).toThrow(/duplicates glyph text/);

      expect(() =>
        sanitizeTracePathParams(makeValidRaw({ targets: [{ id: 'g1', text: '山' }] }), ctx),
      ).toThrow(/at least 2 valid glyph targets/);
    });

    it('rejects script/HTML/URL content in any text field', () => {
      const raw1 = makeValidRaw();
      raw1.targets[0].label = '<script>alert(1)</script>';
      const raw2 = makeValidRaw();
      raw2.title = 'https://evil.example';
      const raw3 = makeValidRaw();
      raw3.prompt = 'javascript:alert(1)';
      for (const raw of [raw1, raw2, raw3]) {
        expect(() => sanitizeTracePathParams(raw, ctx)).toThrow(/forbidden/i);
      }
      expect(isSafeParamText('火')).toBe(true);
      expect(isSafeParamText('<b>')).toBe(false);
      expect(isSafeParamText('http://x')).toBe(false);
    });

    it('clamps passingScore and timeLimitSec into range and falls back on garbage', () => {
      const activity = sanitizeTracePathParams(
        makeValidRaw({ passingScore: 999, timeLimitSec: -5 }),
        ctx,
      );
      expect(activity.passingScore).toBe(100);
      expect(activity.timeLimitSec).toBe(TRACE_PATH_LIMITS.minTimeLimitSec);

      const defaults = sanitizeTracePathParams(
        makeValidRaw({ passingScore: 'nope', timeLimitSec: 'nope' }),
        ctx,
      );
      expect(defaults.passingScore).toBe(TRACE_PATH_LIMITS.defaultPassingScore);
      expect(defaults.timeLimitSec).toBe(TRACE_PATH_LIMITS.defaultTimeLimitSec);
    });
  });

  describe('validateTracePathParams', () => {
    it('rejects non-object, wrong type, duplicate ids/texts and bad coverage', () => {
      expect(validateTracePathParams(null).ok).toBe(false);
      expect(validateTracePathParams({ type: 'quiz', questions: [] }).ok).toBe(false);

      const duplicateId = makeValidRaw();
      duplicateId.targets[1].id = duplicateId.targets[0].id;
      expect(validateTracePathParams(duplicateId).reason).toMatch(/duplicate target id/);

      const duplicateText = makeValidRaw();
      duplicateText.targets[1].text = duplicateText.targets[0].text;
      expect(validateTracePathParams(duplicateText).reason).toMatch(/duplicate glyph text/);

      const polyline = makeValidRaw();
      polyline.targets[0].kind = 'polyline';
      expect(validateTracePathParams(polyline).reason).toMatch(/kind must be glyph/);

      const badCoverage = makeValidRaw({ minCoverage: 0.95 });
      expect(validateTracePathParams(badCoverage).reason).toMatch(/minCoverage/);

      const outOfRange = makeValidRaw({ passingScore: 101 });
      expect(validateTracePathParams(outOfRange).reason).toMatch(/passingScore/);
    });

    it('glyph whitelist accepts 1-2 CJK/digit/letter characters only', () => {
      expect(isValidGlyphText('火')).toBe(true);
      expect(isValidGlyphText('山水')).toBe(true);
      expect(isValidGlyphText('7')).toBe(true);
      expect(isValidGlyphText('Ab')).toBe(true);
      expect(isValidGlyphText('')).toBe(false);
      expect(isValidGlyphText('abc')).toBe(false);
      expect(isValidGlyphText('🐱')).toBe(false);
      // CJK Extension B (outside the basic block) is rejected: sampling would
      // degrade for glyphs many child devices cannot render.
      expect(isValidGlyphText('𠀀')).toBe(false);
      expect(isValidGlyphText('龘')).toBe(true); // basic block, renderable
      expect(isValidGlyphText('火!')).toBe(false);
    });

    it('collectTracePathBodyText is a no-op for legacy activity types', () => {
      expect(collectTracePathBodyText(null)).toBe('');
      expect(
        collectTracePathBodyText({ type: 'quiz', questions: [{ question: '1+1?' }] }),
      ).toBe('');
      expect(collectTracePathBodyText(makeValidRaw())).toContain('火');
    });
  });
});

describe('trace_path whitelist single source of truth', () => {
  it('ACTIVITY_TYPES contains trace_path exactly once and is exposed by isActivityType', () => {
    expect(ACTIVITY_TYPES.filter((type) => type === 'trace_path')).toHaveLength(1);
    expect(ACTIVITY_TYPES).toHaveLength(13);
    expect(isActivityType('trace_path')).toBe(true);
    expect(isActivityType('nonexistent_type')).toBe(false);
  });

  it('both generateActivity tools accept trace_path', () => {
    const framework = new FrameworkGenerateActivityTool({} as any);
    expect(framework.metadata.inputSchema.properties.type.enum).toContain('trace_path');
    expect(framework.metadata.description).toContain('13种题型');

    const legacy = new LegacyGenerateActivityTool({} as any);
    const args = { type: 'trace_path', topic: '常用字', difficulty: 1, ageGroup: '3-4' };
    expect((legacy as any).normalizeArgs(args).type).toBe('trace_path');
    expect((legacy as any).schemaForType('trace_path')).toContain('"type":"trace_path"');
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

  it('both generateActivity prompts emit a trace_path schema with the glyph-only rule', () => {
    const args = {
      type: 'trace_path',
      topic: '常用字',
      difficulty: 1,
      ageGroup: '3-4',
    };
    const prompts = [
      (new FrameworkGenerateActivityTool({} as any) as any).buildPrompt(args, 1, [], []),
      // Legacy buildPrompt has a 3-argument signature.
      (new LegacyGenerateActivityTool({} as any) as any).buildPrompt(args, 1, []),
    ] as string[];
    for (const prompt of prompts) {
      expect(prompt).toContain('"type":"trace_path"');
      expect(prompt).toContain('"kind":"glyph"');
      expect(prompt).toContain('minCoverage');
      expect(prompt).toMatch(/Never output HTML|URLs|URL/);
      expect(prompt).toContain('1-2 common Chinese characters');
    }
  });

  it('both agent executors infer bare targets as trace_path (before legacy matching fallbacks)', () => {
    const payload = {
      targets: [
        { id: 'g1', kind: 'glyph', text: '火', label: '火' },
        { id: 'g2', kind: 'glyph', text: '山', label: '山' },
      ],
      minCoverage: 0.7,
    };
    const legacy = Object.create(AgentExecutor.prototype) as any;
    const framework = Object.create(AgentExecutorService.prototype) as any;
    expect(legacy.inferActivityType(payload)).toBe('trace_path');
    expect(framework.inferActivityType(payload)).toBe('trace_path');

    // Ordering note (appendix H.4): the items+targets -> matching fallback
    // lives in the FLUTTER renderer / chat provider, where the trace_path
    // check was inserted BEFORE it (verified by static review; both backend
    // executors never had that fallback, so bare targets is unambiguous
    // here and intentionally resolves to trace_path).
    const itemsAndTargets = {
      items: [{ id: 'i1', name: '上' }],
      targets: [{ matchId: 'i1', name: '下' }],
    };
    expect(framework.inferActivityType(itemsAndTargets)).toBe('trace_path');
    expect(legacy.inferActivityType(itemsAndTargets)).toBe('trace_path');
  });
});
