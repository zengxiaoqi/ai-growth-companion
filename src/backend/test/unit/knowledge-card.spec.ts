import {
  findKnowledgeCard,
  ensureKnowledgeCard,
  registerKnowledgeCardLookup,
  registerKnowledgeCardEnsurer,
  knowledgeCardFactLines,
  type KnowledgeCardView,
} from '../../src/common/learning/knowledge-card-registry';
import {
  matchKnowledgeCard,
  cardFromCurriculumSeed,
  KnowledgeCardService,
} from '../../src/modules/learning/knowledge-card.service';
import { getCoursePackCurriculumSeed } from '../../src/modules/learning/course-curriculum-fallback';

const card = (overrides: Partial<KnowledgeCardView> = {}): KnowledgeCardView => ({
  topic: '四季',
  aliases: ['春夏秋冬', '季节'],
  ageGroup: '5-6',
  domain: 'science',
  facts: [
    { unit: '春天', fact: '春天天气变暖，花儿开放', source: 'curriculum' },
    { unit: '夏天', fact: '夏天很热，可以吃西瓜', source: 'curriculum' },
    { unit: '秋天', fact: '秋天树叶变黄落下来', source: 'curriculum' },
    { unit: '冬天', fact: '冬天很冷，会下雪', source: 'curriculum' },
  ],
  misconceptions: ['四季不是因为地球离太阳远近'],
  vocabulary: ['春天', '夏天', '秋天', '冬天'],
  quizSeeds: [{ question: '哪个季节会下雪？', options: ['春天', '冬天', '夏天'], answer: '冬天' }],
  ...overrides,
});

afterEach(() => {
  registerKnowledgeCardLookup(null);
  registerKnowledgeCardEnsurer(null);
});

describe('matchKnowledgeCard', () => {
  it('prefers exact topic over alias and containment', () => {
    const cards = [
      card({ topic: '季节变化', aliases: [] }),
      card(),
      card({ topic: '四季的歌', aliases: [] }),
    ];
    expect(matchKnowledgeCard(cards, '四季', '5-6')?.topic).toBe('四季');
  });

  it('matches aliases exactly', () => {
    expect(matchKnowledgeCard([card()], '春夏秋冬', '5-6')?.topic).toBe('四季');
  });

  it('falls back to keyword containment', () => {
    expect(matchKnowledgeCard([card()], '认识四季', '5-6')?.topic).toBe('四季');
  });

  it('never crosses age groups', () => {
    expect(matchKnowledgeCard([card()], '四季', '3-4')).toBeNull();
  });

  it('returns null on no match', () => {
    expect(matchKnowledgeCard([card()], '恐龙', '5-6')).toBeNull();
    expect(matchKnowledgeCard([], '四季', '5-6')).toBeNull();
  });
});

describe('registry hooks', () => {
  it('findKnowledgeCard returns null without a registered hook', () => {
    expect(findKnowledgeCard('四季', '5-6')).toBeNull();
  });

  it('delegates to the registered lookup and swallows its errors', () => {
    registerKnowledgeCardLookup(() => card());
    expect(findKnowledgeCard('四季', '5-6')?.topic).toBe('四季');
    registerKnowledgeCardLookup(() => {
      throw new Error('boom');
    });
    expect(findKnowledgeCard('四季', '5-6')).toBeNull();
  });

  it('ensureKnowledgeCard never throws', async () => {
    expect(await ensureKnowledgeCard('四季', '5-6')).toBeNull();
    registerKnowledgeCardEnsurer(async () => {
      throw new Error('boom');
    });
    expect(await ensureKnowledgeCard('四季', '5-6')).toBeNull();
  });

  it('formats fact lines for prompts', () => {
    expect(knowledgeCardFactLines(card())[0]).toBe('春天：春天天气变暖，花儿开放');
  });
});

describe('course-curriculum-fallback — card-first lookup', () => {
  it('builds the seed from a registered card instead of static JSON', () => {
    registerKnowledgeCardLookup((topic, ageGroup) =>
      topic === '情绪小怪兽' && ageGroup === '5-6' ? card({ topic: '情绪小怪兽' }) : null,
    );
    const seed = getCoursePackCurriculumSeed({ topic: '情绪小怪兽', ageGroup: '5-6' });
    expect(seed).not.toBeNull();
    expect(seed!.unitFacts['春天']).toBe('春天天气变暖，花儿开放');
    expect(seed!.quizItems[0].question).toBe('哪个季节会下雪？');
    expect(seed!.matchingPairs.length).toBeGreaterThan(0);
    expect(seed!.readingText).toContain('春天');
  });

  it('falls back to static JSON when no card matches', () => {
    registerKnowledgeCardLookup(() => null);
    const seed = getCoursePackCurriculumSeed({ topic: '认识颜色', ageGroup: '3-4' });
    expect(seed).not.toBeNull();
  });
});

describe('cardFromCurriculumSeed', () => {
  it('maps unitFacts/keywords/quizItems and activates with ≥3 facts', () => {
    const seed = getCoursePackCurriculumSeed({ topic: '四季', ageGroup: '5-6' })!;
    const data = cardFromCurriculumSeed('四季', '5-6', 'science', seed);
    expect(data.status).toBe('active');
    expect(data.facts.every((f) => f.source === 'curriculum')).toBe(true);
    expect(data.quizSeeds).toEqual(seed.quizItems);
  });
});

describe('KnowledgeCardService.ensureCard', () => {
  const draftPayload = {
    facts: [
      { unit: '兔子', fact: '兔子爱吃胡萝卜和青草' },
      { unit: '耳朵', fact: '兔子的耳朵长长的' },
      { unit: '尾巴', fact: '兔子的尾巴短短的' },
      { unit: '跳跃', fact: '兔子靠后腿跳着走' },
    ],
    misconceptions: ['兔子不是啮齿类'],
    vocabulary: ['兔子', '胡萝卜', '青草'],
  };

  const buildService = (llmResponses: Array<string | Error>, existingRows: any[] = []) => {
    const saved: any[] = [];
    const repo = {
      find: jest.fn().mockResolvedValue(existingRows),
      create: jest.fn((data: any) => data),
      save: jest.fn(async (data: any) => {
        saved.push(data);
        return { id: saved.length, ...data };
      }),
    };
    const generateJson = jest.fn();
    for (const response of llmResponses) {
      if (response instanceof Error) generateJson.mockRejectedValueOnce(response);
      else generateJson.mockResolvedValueOnce(response);
    }
    const service = new KnowledgeCardService(repo as any, { generateJson } as any);
    return { service, repo, generateJson, saved };
  };

  it('returns an existing active card without calling the LLM', async () => {
    const { service, generateJson } = buildService([], [
      { ...card(), status: 'active', id: 1 },
    ]);
    await service.reload();
    const result = await service.ensureCard('四季', '5-6');
    expect(result?.topic).toBe('四季');
    expect(generateJson).not.toHaveBeenCalled();
  });

  it('creates an active card when the judge approves enough facts', async () => {
    const { service, saved } = buildService([
      JSON.stringify(draftPayload),
      JSON.stringify({ results: draftPayload.facts.map((_, i) => ({ i, ok: true })) }),
    ]);
    const result = await service.ensureCard('兔子', '5-6', 'science');
    expect(result?.facts).toHaveLength(4);
    expect(saved[0].status).toBe('active');
    expect(saved[0].facts[0].source).toBe('llm');
    // Now served from the in-memory cache without another LLM call.
    expect(service.lookup('兔子', '5-6')?.topic).toBe('兔子');
  });

  it('stores a draft and returns null when too few facts survive the judge', async () => {
    const { service, saved } = buildService([
      JSON.stringify(draftPayload),
      JSON.stringify({
        results: [
          { i: 0, ok: true },
          { i: 1, ok: false, reason: '空泛' },
          { i: 2, ok: false, reason: '错误' },
          { i: 3, ok: false, reason: '错误' },
        ],
      }),
    ]);
    const result = await service.ensureCard('兔子', '5-6');
    expect(result).toBeNull();
    expect(saved[0].status).toBe('draft');
    expect(saved[0].facts).toHaveLength(1);
  });

  it('stores an unverified draft when the judge call fails', async () => {
    const { service, saved } = buildService([
      JSON.stringify(draftPayload),
      new Error('judge timeout'),
    ]);
    const result = await service.ensureCard('兔子', '5-6');
    expect(result).toBeNull();
    expect(saved[0].status).toBe('draft');
    expect(saved[0].facts).toHaveLength(4);
  });

  it('returns null without saving when the draft is unparseable', async () => {
    const { service, saved } = buildService(['不是JSON']);
    expect(await service.ensureCard('兔子', '5-6')).toBeNull();
    expect(saved).toHaveLength(0);
  });

  it('deduplicates concurrent ensureCard calls for the same topic', async () => {
    const { service, generateJson } = buildService([
      JSON.stringify(draftPayload),
      JSON.stringify({ results: draftPayload.facts.map((_, i) => ({ i, ok: true })) }),
    ]);
    const [a, b] = await Promise.all([
      service.ensureCard('兔子', '5-6'),
      service.ensureCard('兔子', '5-6'),
    ]);
    expect(a?.topic).toBe('兔子');
    expect(b?.topic).toBe('兔子');
    expect(generateJson).toHaveBeenCalledTimes(2); // draft + judge, once each
  });
});