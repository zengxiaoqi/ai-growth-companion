/**
 * difficulty-profiles — turns the abstract 1-3 difficulty knob into concrete,
 * enforceable cognitive constraints per age group.
 *
 * Two consumers:
 * 1. Generation prompts (generateActivity / course pack) — the LLM gets the
 *    constraints as text instead of a bare number.
 * 2. L1 answer validation — arithmetic range/operation checks reject questions
 *    that exceed the profile (e.g. negative results, 5-6 d1 sums above 10).
 */

export type MathOp = 'count' | 'add' | 'sub';

export interface DifficultyProfile {
  /** Upper bound for any number appearing in arithmetic (operands and result). */
  maxNumber: number;
  allowedOps: MathOp[];
  patternComplexity: 'ABAB' | 'ABC' | 'growing';
  vocabLevel: string;
  /** Soft cap for sentence length in characters (prompt guidance). */
  sentenceLength: number;
  cognitiveNotes: string[];
}

const clampDifficulty = (d: number) => Math.max(1, Math.min(3, Math.trunc(d) || 1));

const MATH_PROFILES: Record<string, DifficultyProfile[]> = {
  '3-4': [
    {
      maxNumber: 5,
      allowedOps: ['count'],
      patternComplexity: 'ABAB',
      vocabLevel: '常见名词',
      sentenceLength: 10,
      cognitiveNotes: ['5以内数数、一一对应', '不做加减运算', '只比较多少/大小，不比较抽象量'],
    },
    {
      maxNumber: 10,
      allowedOps: ['count'],
      patternComplexity: 'ABAB',
      vocabLevel: '常见名词',
      sentenceLength: 12,
      cognitiveNotes: ['10以内数数、比大小', '不做加减运算', 'ABAB 简单规律'],
    },
    {
      maxNumber: 10,
      allowedOps: ['count'],
      patternComplexity: 'ABAB',
      vocabLevel: '常见名词',
      sentenceLength: 14,
      cognitiveNotes: ['10以内数数与序数（第几个）', 'ABAB 规律接龙', '不做加减运算'],
    },
  ],
  '5-6': [
    {
      maxNumber: 10,
      allowedOps: ['count', 'add', 'sub'],
      patternComplexity: 'ABAB',
      vocabLevel: '常见字',
      sentenceLength: 16,
      cognitiveNotes: ['10以内加减（结果不超过10）', '减法不出现负数', 'ABAB 规律'],
    },
    {
      maxNumber: 20,
      allowedOps: ['count', 'add', 'sub'],
      patternComplexity: 'ABC',
      vocabLevel: '常见字',
      sentenceLength: 20,
      cognitiveNotes: ['20以内加减（结果不超过20）', '减法不出现负数', 'ABC/两步规律'],
    },
    {
      maxNumber: 50,
      allowedOps: ['count', 'add', 'sub'],
      patternComplexity: 'growing',
      vocabLevel: '常见字',
      sentenceLength: 24,
      cognitiveNotes: ['50以内数与加减', '减法不出现负数', 'ABC/递增规律、一步简单推理'],
    },
  ],
};

const LANGUAGE_PROFILES: Record<string, DifficultyProfile[]> = {
  '3-4': [
    {
      maxNumber: 5,
      allowedOps: ['count'],
      patternComplexity: 'ABAB',
      vocabLevel: '常见名词、单字认读',
      sentenceLength: 8,
      cognitiveNotes: ['只用常见名词和单字', '句子不超过8个字', '不要求识字量，以听和说为主'],
    },
    {
      maxNumber: 10,
      allowedOps: ['count'],
      patternComplexity: 'ABAB',
      vocabLevel: '简单短句、2-3字词语',
      sentenceLength: 12,
      cognitiveNotes: ['2-3字词语、简单短句', '句子不超过12个字'],
    },
    {
      maxNumber: 10,
      allowedOps: ['count'],
      patternComplexity: 'ABAB',
      vocabLevel: '完整单句表达',
      sentenceLength: 16,
      cognitiveNotes: ['完整单句表达', '句子不超过16个字', '不出现书面语/成语'],
    },
  ],
  '5-6': [
    {
      maxNumber: 10,
      allowedOps: ['count', 'add', 'sub'],
      patternComplexity: 'ABAB',
      vocabLevel: '常见字、看图说话',
      sentenceLength: 16,
      cognitiveNotes: ['常见字认读', '看图说话一句话', '句子不超过16个字'],
    },
    {
      maxNumber: 20,
      allowedOps: ['count', 'add', 'sub'],
      patternComplexity: 'ABC',
      vocabLevel: '短句阅读、连词成句',
      sentenceLength: 24,
      cognitiveNotes: ['短句阅读', '连词成句', '句子不超过24个字'],
    },
    {
      maxNumber: 50,
      allowedOps: ['count', 'add', 'sub'],
      patternComplexity: 'growing',
      vocabLevel: '段落理解、因果表达',
      sentenceLength: 40,
      cognitiveNotes: ['2-3句短段落理解', '因为…所以…因果表达', '不出现抽象书面语'],
    },
  ],
};

const GENERIC_NOTES: Record<string, string[]> = {
  '3-4': ['具体形象的事物，单一特征', '不出现抽象概念、负数、超出5以上的数量要求'],
  '5-6': ['简单因果与分类比较', '不出现抽象概念、负数、超出50的数量要求'],
};

export function getDifficultyProfile(
  ageGroup: string,
  difficulty: number,
  domain?: string,
): DifficultyProfile {
  const age = ageGroup === '3-4' ? '3-4' : '5-6';
  const idx = clampDifficulty(difficulty) - 1;
  if (domain === 'math') return MATH_PROFILES[age][idx];
  if (domain === 'language') return LANGUAGE_PROFILES[age][idx];
  // Non-math/language domains: language-level constraints + generic notes.
  // maxNumber only gates arithmetic in L1, so science facts like "12个月" pass.
  const base = LANGUAGE_PROFILES[age][idx];
  return { ...base, cognitiveNotes: GENERIC_NOTES[age] };
}

/** Prompt-ready constraint lines replacing the bare "Difficulty: 2". */
export function difficultyPromptLines(
  ageGroup: string,
  difficulty: number,
  domain?: string,
): string[] {
  const p = getDifficultyProfile(ageGroup, difficulty, domain);
  return [
    `Difficulty ${clampDifficulty(difficulty)} constraints (MUST follow):`,
    ...p.cognitiveNotes.map((n) => `- ${n}`),
    `- 词汇：${p.vocabLevel}；句子不超过${p.sentenceLength}个字`,
    `- 任何数字不超过${p.maxNumber}；允许的运算：${p.allowedOps.join('/')}`,
  ];
}