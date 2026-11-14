import {
  collectTeachingText,
  outcomeKeywords,
  outcomeKeywordCoverage,
  ruleBasedCourseReview,
  ReviewCoursePackTool,
  COURSE_QUALITY_PASS_SCORE,
} from '../../src/agent-framework/tools/impl/review-course-pack';

function goodCoursePack(): Record<string, any> {
  return {
    topic: '彩虹',
    ageGroup: '5-6',
    outcomes: ['认识彩虹的七种颜色', '了解彩虹形成的原因'],
    modules: {
      reading: {
        text: '彩虹有红橙黄绿青蓝紫七种颜色。阳光穿过小雨滴时发生折射，就形成了彩虹。',
        keywords: ['彩虹', '颜色', '折射'],
        questions: ['彩虹有哪七种颜色？'],
      },
      writing: {
        tracingItems: ['彩', '虹'],
        practiceTasks: ['画出彩虹的七种颜色', '说说彩虹形成的原因'],
      },
      listening: { questions: ['彩虹是什么时候出现的？'] },
      speaking: { prompts: [{ prompt: '描述你见过的彩虹' }] },
    },
    visualStory: {
      scenes: [
        { narration: '今天我们一起认识彩虹的七种颜色。' },
        { narration: '阳光穿过雨滴发生折射，形成彩虹。' },
        { narration: '红橙黄绿青蓝紫，彩虹真美丽。' },
      ],
    },
  };
}

describe('collectTeachingText', () => {
  it('gathers reading, writing, listening, speaking and scene narration', () => {
    const texts = collectTeachingText(goodCoursePack());
    expect(texts).toContain('彩虹有红橙黄绿青蓝紫七种颜色。阳光穿过小雨滴时发生折射，就形成了彩虹。');
    expect(texts).toContain('画出彩虹的七种颜色');
    expect(texts).toContain('彩虹有哪七种颜色？');
    expect(texts).toContain('描述你见过的彩虹');
    expect(texts.some((t) => t.includes('折射'))).toBe(true);
  });

  it('returns empty array for empty pack', () => {
    expect(collectTeachingText({})).toEqual([]);
    expect(collectTeachingText(null as any)).toEqual([]);
  });
});

describe('outcomeKeywords', () => {
  it('strips leading generic verbs', () => {
    expect(outcomeKeywords('认识彩虹的七种颜色')).toContain('彩虹的七种颜色');
    expect(outcomeKeywords('了解彩虹形成的原因')).toContain('彩虹形成的原因');
  });

  it('splits on punctuation and keeps content words', () => {
    const kws = outcomeKeywords('认识颜色，了解折射');
    expect(kws).toContain('颜色');
    expect(kws).toContain('折射');
  });

  it('lowercases latin words', () => {
    expect(outcomeKeywords('Learn ABC')).toContain('abc');
  });
});

describe('outcomeKeywordCoverage', () => {
  it('returns 1 when no outcomes', () => {
    expect(outcomeKeywordCoverage([], ['任意文本'])).toBe(1);
  });

  it('returns 0 when teaching text empty', () => {
    expect(outcomeKeywordCoverage(['认识彩虹'], [])).toBe(0);
  });

  it('returns 1 when all outcome keywords appear', () => {
    const outcomes = ['认识彩虹的七种颜色', '了解彩虹形成的原因'];
    const texts = ['彩虹的七种颜色真美丽', '彩虹形成的原因是折射'];
    expect(outcomeKeywordCoverage(outcomes, texts)).toBe(1);
  });

  it('returns partial fraction for partial coverage', () => {
    const outcomes = ['认识彩虹', '了解折射'];
    const texts = ['彩虹真美丽'];
    expect(outcomeKeywordCoverage(outcomes, texts)).toBe(0.5);
  });
});

describe('ruleBasedCourseReview', () => {
  it('passes a well-formed, aligned, specific course pack', () => {
    const result = ruleBasedCourseReview({
      topic: '彩虹',
      ageGroup: '5-6',
      outcomes: ['认识彩虹的七种颜色', '了解彩虹形成的原因'],
      coursePack: goodCoursePack(),
    });
    expect(result.score).toBeGreaterThanOrEqual(COURSE_QUALITY_PASS_SCORE);
    expect(result.passed).toBe(true);
    expect(result.breakdown.outcomeAlignment).toBe(20);
    expect(result.breakdown.structuralCompleteness).toBe(20);
  });

  it('flags poor outcome alignment', () => {
    const pack = goodCoursePack();
    pack.modules.reading.text = '今天天气很好，我们一起玩耍。';
    pack.modules.writing.practiceTasks = ['随便画画'];
    pack.visualStory.scenes = [
      { narration: '我们一起玩。' },
      { narration: '真开心。' },
      { narration: '再见。' },
    ];
    const result = ruleBasedCourseReview({
      topic: '彩虹',
      ageGroup: '5-6',
      outcomes: ['认识彩虹的七种颜色', '了解彩虹形成的原因'],
      coursePack: pack,
    });
    expect(result.breakdown.outcomeAlignment).toBeLessThan(12);
    expect(result.issues.some((i) => i.includes('学习目标'))).toBe(true);
  });

  it('penalizes generic empty talk', () => {
    const pack = goodCoursePack();
    pack.modules.reading.text = '请和老师一起学习。我们来看看。请跟着老师读。';
    const result = ruleBasedCourseReview({
      topic: '彩虹',
      ageGroup: '5-6',
      outcomes: ['认识彩虹'],
      coursePack: pack,
    });
    expect(result.issues.some((i) => i.includes('通用空话'))).toBe(true);
    expect(result.breakdown.contentSpecificity).toBeLessThan(18);
  });

  it('penalizes over-long reading for 3-4 age group', () => {
    const pack = goodCoursePack();
    pack.modules.reading.text = '彩虹'.repeat(80); // 160 chars > 120 cap
    const result = ruleBasedCourseReview({
      topic: '彩虹',
      ageGroup: '3-4',
      outcomes: ['认识彩虹'],
      coursePack: pack,
    });
    expect(result.breakdown.ageAppropriateness).toBe(10);
    expect(result.issues.some((i) => i.includes('超出'))).toBe(true);
  });

  it('penalizes missing structure', () => {
    const result = ruleBasedCourseReview({
      topic: '彩虹',
      ageGroup: '5-6',
      outcomes: [],
      coursePack: { modules: {} },
    });
    expect(result.passed).toBe(false);
    expect(result.breakdown.structuralCompleteness).toBe(0);
    expect(result.issues.some((i) => i.includes('缺少阅读模块'))).toBe(true);
  });

  it('clamps score to 0-100 and breakdown dims to 0-20', () => {
    const result = ruleBasedCourseReview({ topic: 'x', coursePack: {} });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    for (const v of Object.values(result.breakdown)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(20);
    }
  });
});

describe('ReviewCoursePackTool.execute', () => {
  const ctx = { ageGroup: '5-6', conversationId: 't', extra: {} } as any;

  function makeTool(generateJson: jest.Mock) {
    const llm = { generateJson } as any;
    return new ReviewCoursePackTool(llm);
  }

  it('rejects missing topic', async () => {
    const tool = makeTool(jest.fn());
    const res = await tool.execute({ topic: '', coursePack: {} } as any, ctx);
    expect(res.success).toBe(false);
  });

  it('rejects missing coursePack', async () => {
    const tool = makeTool(jest.fn());
    const res = await tool.execute({ topic: '彩虹' } as any, ctx);
    expect(res.success).toBe(false);
  });

  it('parses LLM JSON and clamps breakdown', async () => {
    const generateJson = jest.fn().mockResolvedValue(
      JSON.stringify({
        score: 88,
        passed: true,
        issues: ['a'],
        suggestions: ['b'],
        breakdown: {
          outcomeAlignment: 18,
          ageAppropriateness: 18,
          factualAccuracy: 18,
          contentSpecificity: 18,
          structuralCompleteness: 16,
        },
      }),
    );
    const tool = makeTool(generateJson);
    const res = await tool.execute(
      { topic: '彩虹', ageGroup: '5-6', coursePack: goodCoursePack() },
      ctx,
    );
    expect(res.success).toBe(true);
    expect(res.data!.score).toBe(88);
    expect(res.data!.passed).toBe(true);
    expect(res.data!.breakdown.structuralCompleteness).toBe(16);
    expect(generateJson).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ temperature: 0 }),
    );
  });

  it('clamps out-of-range breakdown values', async () => {
    const generateJson = jest.fn().mockResolvedValue(
      JSON.stringify({
        score: 200,
        breakdown: {
          outcomeAlignment: 99,
          ageAppropriateness: -5,
          factualAccuracy: 10,
          contentSpecificity: 10,
          structuralCompleteness: 10,
        },
      }),
    );
    const tool = makeTool(generateJson);
    const res = await tool.execute({ topic: '彩虹', coursePack: goodCoursePack() }, ctx);
    expect(res.data!.score).toBe(100);
    expect(res.data!.breakdown.outcomeAlignment).toBe(20);
    expect(res.data!.breakdown.ageAppropriateness).toBe(0);
  });

  it('falls back to rules when LLM throws', async () => {
    const generateJson = jest.fn().mockRejectedValue(new Error('network down'));
    const tool = makeTool(generateJson);
    const res = await tool.execute(
      { topic: '彩虹', ageGroup: '5-6', outcomes: ['认识彩虹的七种颜色', '了解彩虹形成的原因'], coursePack: goodCoursePack() },
      ctx,
    );
    expect(res.success).toBe(true);
    expect(res.data!.score).toBeGreaterThanOrEqual(COURSE_QUALITY_PASS_SCORE);
  });

  it('falls back to rules when LLM returns non-JSON', async () => {
    const generateJson = jest.fn().mockResolvedValue('抱歉，我无法评审。');
    const tool = makeTool(generateJson);
    const res = await tool.execute(
      { topic: '彩虹', ageGroup: '5-6', coursePack: { modules: {} } },
      ctx,
    );
    expect(res.success).toBe(true);
    expect(res.data!.passed).toBe(false);
  });

  it('extracts JSON embedded in markdown fence', async () => {
    const generateJson = jest.fn().mockResolvedValue(
      '```json\n{"score":75,"breakdown":{"outcomeAlignment":15,"ageAppropriateness":15,"factualAccuracy":15,"contentSpecificity":15,"structuralCompleteness":15}}\n```',
    );
    const tool = makeTool(generateJson);
    const res = await tool.execute({ topic: '彩虹', coursePack: goodCoursePack() }, ctx);
    expect(res.success).toBe(true);
    expect(res.data!.score).toBe(75);
    expect(res.data!.passed).toBe(true);
  });
});