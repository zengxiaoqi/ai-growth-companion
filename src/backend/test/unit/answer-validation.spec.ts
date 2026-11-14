import {
  validateAnswersL1,
  judgeActivityAnswers,
  parseArithmetic,
  parseOptionNumber,
  type JudgeLlm,
} from '../../src/common/activity/answer-validation';

const ctx = { topic: '农场动物', ageGroup: '5-6' };

const goodQuestion = (overrides: any = {}) => ({
  question: '农场里哪种动物会产奶？',
  options: ['小猪', '奶牛', '母鸡'],
  correctIndex: 1,
  explanation: '奶牛产奶。',
  ...overrides,
});

const quizWith = (questions: any[]) => ({
  type: 'quiz',
  title: 't',
  topic: '农场动物',
  ageGroup: '5-6',
  questions,
});

describe('validateAnswersL1 — quiz bad-question interception', () => {
  it('passes a clean quiz untouched', () => {
    const activity = quizWith([goodQuestion(), goodQuestion(), goodQuestion()]);
    const result = validateAnswersL1(activity, ctx);
    expect(result.ok).toBe(true);
    expect(result.activity.questions).toHaveLength(3);
    expect(result.fixes).toHaveLength(0);
  });

  it('drops out-of-bounds correctIndex instead of silently using 0', () => {
    const bad = goodQuestion({ correctIndex: 9 });
    const result = validateAnswersL1(
      quizWith([goodQuestion(), goodQuestion(), goodQuestion(), bad]),
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(result.activity.questions).toHaveLength(3);
    expect(result.activity.questions.every((q: any) => q.correctIndex === 1)).toBe(true);
  });

  it('drops unresolvable correctIndex (-1 from sanitizer)', () => {
    const bad = goodQuestion({ correctIndex: -1 });
    const result = validateAnswersL1(quizWith([bad, bad, bad]), ctx);
    expect(result.ok).toBe(false);
    expect(result.issues.join()).toContain('correctIndex 越界');
  });

  it('auto-fixes a wrong math answer when exactly one option matches', () => {
    const bad = goodQuestion({
      question: '3 + 2 = ?',
      options: ['4', '5', '6'],
      correctIndex: 0,
    });
    const result = validateAnswersL1(
      quizWith([goodQuestion(), goodQuestion(), bad]),
      ctx,
    );
    expect(result.ok).toBe(true);
    const fixed = result.activity.questions[2];
    expect(fixed.correctIndex).toBe(1);
    expect(result.fixes.join()).toContain('数学答案修正');
  });

  it('drops a wrong math answer when no option matches', () => {
    const bad = goodQuestion({
      question: '3 + 2 = ?',
      options: ['4', '6', '7'],
      correctIndex: 0,
    });
    const result = validateAnswersL1(quizWith([bad, bad, bad]), ctx);
    expect(result.ok).toBe(false);
    expect(result.issues.join()).toContain('应等于 5');
  });

  it('rejects negative subtraction results', () => {
    const bad = goodQuestion({
      question: '2 - 5 = ?',
      options: ['-3', '3', '7'],
      correctIndex: 0,
    });
    const result = validateAnswersL1(quizWith([bad, bad, bad]), ctx);
    expect(result.ok).toBe(false);
    expect(result.issues.join()).toContain('负数');
  });

  it('drops questions whose options dedup below 3', () => {
    const bad = goodQuestion({ options: ['足球', '足球', '篮球'], correctIndex: 0 });
    const result = validateAnswersL1(quizWith([bad, bad, bad]), ctx);
    expect(result.ok).toBe(false);
    expect(result.issues.join()).toContain('去重后选项不足');
  });

  it('dedups options and remaps correctIndex to first occurrence', () => {
    const q = goodQuestion({ options: ['奶牛', '小猪', '奶牛', '母鸡'], correctIndex: 2 });
    const result = validateAnswersL1(quizWith([q, q, q]), ctx);
    expect(result.ok).toBe(true);
    expect(result.activity.questions[0].options).toEqual(['奶牛', '小猪', '母鸡']);
    expect(result.activity.questions[0].correctIndex).toBe(0);
  });

  it('verifies math with Chinese numeral options', () => {
    const bad = goodQuestion({
      question: '3加2等于几？',
      options: ['四', '五', '六'],
      correctIndex: 0,
    });
    const result = validateAnswersL1(quizWith([goodQuestion(), goodQuestion(), bad]), ctx);
    expect(result.ok).toBe(true);
    expect(result.activity.questions[2].correctIndex).toBe(1);
  });

  it('verifies math with full-width digits', () => {
    const bad = goodQuestion({
      question: '３＋２＝？',
      options: ['４', '５', '６'],
      correctIndex: 2,
    });
    const result = validateAnswersL1(quizWith([goodQuestion(), goodQuestion(), bad]), ctx);
    expect(result.ok).toBe(true);
    expect(result.activity.questions[2].correctIndex).toBe(1);
  });

  it('fails the batch when fewer than 3 questions survive', () => {
    const bad = goodQuestion({ correctIndex: 99 });
    const result = validateAnswersL1(quizWith([goodQuestion(), bad, bad]), ctx);
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});

describe('validateAnswersL1 — true_false / fill_blank', () => {
  it('drops non-boolean isCorrect', () => {
    const activity = {
      type: 'true_false',
      statements: [
        { statement: '奶牛产奶', isCorrect: true },
        { statement: '母鸡会飞', isCorrect: false },
        { statement: '小猪下蛋', isCorrect: 'yes' },
        { statement: '马吃草', isCorrect: true },
      ],
    };
    const result = validateAnswersL1(activity, ctx);
    expect(result.ok).toBe(true);
    expect(result.activity.statements).toHaveLength(3);
  });

  it('drops fill_blank without blank marker', () => {
    const activity = {
      type: 'fill_blank',
      sentences: [
        { text: '奶牛爱吃___', answer: '青草', options: ['青草', '骨头', '鱼'] },
        { text: '母鸡下蛋', answer: '蛋', options: ['蛋', '奶', '毛'] },
        { text: '小猪爱吃___', answer: '青菜', options: ['青菜', '石头', '铁'] },
        { text: '小马喝___', answer: '水', options: ['水', '火', '沙'] },
      ],
    };
    const result = validateAnswersL1(activity, ctx);
    expect(result.ok).toBe(true);
    expect(result.activity.sentences).toHaveLength(3);
  });

  it('drops fill_blank whose answer is not in options', () => {
    const activity = {
      type: 'fill_blank',
      sentences: [
        { text: '3 + 2 = ___', answer: '5', options: ['4', '5', '6'] },
        { text: '4 + 1 = ___', answer: '5', options: ['3', '4', '6'] },
        { text: '2 + 2 = ___', answer: '4', options: ['3', '4', '5'] },
        { text: '1 + 1 = ___', answer: '2', options: ['1', '2', '3'] },
      ],
    };
    const result = validateAnswersL1(activity, ctx);
    expect(result.ok).toBe(true);
    expect(result.activity.sentences).toHaveLength(3);
  });

  it('drops fill_blank with a wrong math answer', () => {
    const activity = {
      type: 'fill_blank',
      sentences: [
        { text: '3 + 2 = ___', answer: '6', options: ['5', '6', '7'] },
        { text: '4 + 1 = ___', answer: '5', options: ['4', '5', '6'] },
        { text: '2 + 2 = ___', answer: '4', options: ['3', '4', '5'] },
      ],
    };
    const result = validateAnswersL1(activity, ctx);
    expect(result.ok).toBe(false);
    expect(result.issues.join()).toContain('填空答案错误');
  });

  it('passes through non-question types untouched', () => {
    const activity = { type: 'drag_sort', buckets: [], items: [] };
    const result = validateAnswersL1(activity, ctx);
    expect(result.ok).toBe(true);
    expect(result.activity).toBe(activity);
  });
});

describe('validateAnswersL1 — difficulty profile enforcement', () => {
  const mathQuiz = (question: string, options: string[], correctIndex: number) =>
    quizWith([
      goodQuestion({ question, options, correctIndex }),
      goodQuestion({ question, options, correctIndex }),
      goodQuestion({ question, options, correctIndex }),
    ]);

  it('rejects arithmetic for 3-4 (counting-only profile)', () => {
    const result = validateAnswersL1(mathQuiz('3 + 2 = ?', ['4', '5', '6'], 1), {
      topic: '数字',
      ageGroup: '3-4',
      difficulty: 1,
      domain: 'math',
    });
    expect(result.ok).toBe(false);
    expect(result.issues.join()).toContain('加减运算');
  });

  it('rejects sums above the 5-6 d1 cap of 10', () => {
    const result = validateAnswersL1(mathQuiz('8 + 5 = ?', ['12', '13', '14'], 1), {
      topic: '加法',
      ageGroup: '5-6',
      difficulty: 1,
      domain: 'math',
    });
    expect(result.ok).toBe(false);
    expect(result.issues.join()).toContain('超出难度上限 10');
  });

  it('allows the same sum at 5-6 d2 (cap 20)', () => {
    const result = validateAnswersL1(mathQuiz('8 + 5 = ?', ['12', '13', '14'], 1), {
      topic: '加法',
      ageGroup: '5-6',
      difficulty: 2,
      domain: 'math',
    });
    expect(result.ok).toBe(true);
  });

  it('rejects operands above the cap even when the result fits', () => {
    const result = validateAnswersL1(mathQuiz('15 - 9 = ?', ['5', '6', '7'], 1), {
      topic: '减法',
      ageGroup: '5-6',
      difficulty: 1,
      domain: 'math',
    });
    expect(result.ok).toBe(false);
    expect(result.issues.join()).toContain('超出难度上限');
  });

  it('enforces the profile on fill_blank arithmetic too', () => {
    const activity = {
      type: 'fill_blank',
      sentences: [
        { text: '8 + 5 = ___', answer: '13', options: ['12', '13', '14'] },
        { text: '2 + 2 = ___', answer: '4', options: ['3', '4', '5'] },
        { text: '1 + 1 = ___', answer: '2', options: ['1', '2', '3'] },
      ],
    };
    const result = validateAnswersL1(activity, {
      topic: '加法',
      ageGroup: '5-6',
      difficulty: 1,
      domain: 'math',
    });
    expect(result.ok).toBe(false);
    expect(result.issues.join()).toContain('超出难度上限 10');
  });

  it('leaves non-arithmetic questions untouched by the number cap', () => {
    const result = validateAnswersL1(
      quizWith([
        goodQuestion({ question: '一年有几个月？', options: ['10个', '12个', '8个'], correctIndex: 1 }),
        goodQuestion(),
        goodQuestion(),
      ]),
      { topic: '四季', ageGroup: '3-4', difficulty: 1 },
    );
    expect(result.ok).toBe(true);
  });
});

describe('judgeActivityAnswers — L2 verdict application', () => {
  const llmReturning = (payload: any): JudgeLlm => ({
    generateJson: jest.fn().mockResolvedValue(JSON.stringify(payload)),
  });

  it('applies incorrect verdict with correctedIndex', async () => {
    const activity = quizWith([goodQuestion(), goodQuestion(), goodQuestion()]);
    const llm = llmReturning({
      results: [
        { i: 0, verdict: 'correct' },
        { i: 1, verdict: 'incorrect', correctedIndex: 2, reason: '答案应为母鸡' },
        { i: 2, verdict: 'correct' },
      ],
    });
    const result = await judgeActivityAnswers(llm, activity, ctx);
    expect(result.ok).toBe(true);
    expect(result.activity.questions[1].correctIndex).toBe(2);
    expect(result.fixes.join()).toContain('评审修正');
  });

  it('fails the batch on incorrect verdict without a usable correction', async () => {
    const activity = quizWith([goodQuestion(), goodQuestion(), goodQuestion()]);
    const llm = llmReturning({
      results: [{ i: 0, verdict: 'incorrect', reason: '答案错误' }],
    });
    const result = await judgeActivityAnswers(llm, activity, ctx);
    expect(result.ok).toBe(false);
    expect(result.issues.join()).toContain('未给出有效修正');
  });

  it('drops ambiguous and inappropriate questions', async () => {
    const activity = quizWith([
      goodQuestion(),
      goodQuestion({ question: '什么球是圆的？', options: ['足球', '篮球', '排球'] }),
      goodQuestion({ question: '负数是什么？' }),
      goodQuestion(),
      goodQuestion(),
    ]);
    const llm = llmReturning({
      results: [
        { i: 1, verdict: 'ambiguous', reason: '多个选项都成立' },
        { i: 2, verdict: 'inappropriate', reason: '超龄' },
      ],
    });
    const result = await judgeActivityAnswers(llm, activity, ctx);
    expect(result.ok).toBe(true);
    expect(result.activity.questions).toHaveLength(3);
    expect(result.fixes).toHaveLength(2);
  });

  it('fails when too few questions survive the judge', async () => {
    const activity = quizWith([goodQuestion(), goodQuestion(), goodQuestion()]);
    const llm = llmReturning({
      results: [
        { i: 0, verdict: 'ambiguous' },
        { i: 1, verdict: 'ambiguous' },
      ],
    });
    const result = await judgeActivityAnswers(llm, activity, ctx);
    expect(result.ok).toBe(false);
    expect(result.issues.join()).toContain('有效题目不足');
  });

  it('flips true_false via correctedIsCorrect', async () => {
    const activity = {
      type: 'true_false',
      statements: [
        { statement: '奶牛产奶', isCorrect: true },
        { statement: '母鸡下蛋', isCorrect: true },
        { statement: '小猪会飞', isCorrect: false },
      ],
    };
    const llm = llmReturning({
      results: [{ i: 2, verdict: 'incorrect', correctedIsCorrect: true }],
    });
    const result = await judgeActivityAnswers(llm, activity, ctx);
    expect(result.ok).toBe(true);
    expect(result.activity.statements[2].isCorrect).toBe(true);
  });

  it('fixes fill_blank via correctedAnswer within options', async () => {
    const activity = {
      type: 'fill_blank',
      sentences: [
        { text: '奶牛爱吃___', answer: '骨头', options: ['青草', '骨头', '鱼'] },
        { text: '母鸡下___', answer: '蛋', options: ['蛋', '奶', '毛'] },
        { text: '小马喝___', answer: '水', options: ['水', '火', '沙'] },
      ],
    };
    const llm = llmReturning({
      results: [{ i: 0, verdict: 'incorrect', correctedAnswer: '青草' }],
    });
    const result = await judgeActivityAnswers(llm, activity, ctx);
    expect(result.ok).toBe(true);
    expect(result.activity.sentences[0].answer).toBe('青草');
  });

  it('throws on unparseable judge output so the caller can degrade to L1', async () => {
    const llm: JudgeLlm = { generateJson: jest.fn().mockResolvedValue('不是JSON') };
    await expect(
      judgeActivityAnswers(llm, quizWith([goodQuestion(), goodQuestion(), goodQuestion()]), ctx),
    ).rejects.toThrow('unparseable');
  });

  it('throws when the judge call itself fails', async () => {
    const llm: JudgeLlm = { generateJson: jest.fn().mockRejectedValue(new Error('timeout')) };
    await expect(
      judgeActivityAnswers(llm, quizWith([goodQuestion(), goodQuestion(), goodQuestion()]), ctx),
    ).rejects.toThrow('timeout');
  });
});

describe('arithmetic helpers', () => {
  it.each([
    ['3 + 2 = ?', 5],
    ['3+2=?', 5],
    ['５－２＝？', 3],
    ['3加2等于几？', 5],
    ['5减2等于几', 3],
    ['2 - 5 = ?', -3],
  ])('parses %s', (text, expected) => {
    expect(parseArithmetic(text)?.expected).toBe(expected);
  });

  it('ignores word problems without a direct expression', () => {
    expect(parseArithmetic('小明有3个苹果，又买了2个，一共有几个？')).toBeNull();
  });

  it.each([
    ['5', 5],
    ['5个', 5],
    ['五', 5],
    ['十个', 10],
    ['奶牛', null],
  ])('parses option %s', (text, expected) => {
    expect(parseOptionNumber(text)).toBe(expected);
  });
});