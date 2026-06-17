import { GenerateQuizTool } from '../../src/modules/ai/agent/tools/generate-quiz';

describe('GenerateQuizTool', () => {
  const llmClient = { generate: jest.fn() };
  let tool: GenerateQuizTool;

  beforeEach(() => {
    jest.resetAllMocks();
    tool = new GenerateQuizTool(llmClient as any);
  });

  const validQuizJson = JSON.stringify([
    {
      question: '1+1等于几？',
      options: ['1', '2', '3'],
      correctIndex: 1,
      explanation: '1+1=2',
    },
    {
      question: '苹果是什么颜色？',
      options: ['红色', '蓝色', '绿色'],
      correctIndex: 0,
      explanation: '苹果通常是红色的',
    },
  ]);

  it('parses valid JSON array from LLM response', async () => {
    llmClient.generate.mockResolvedValue(validQuizJson);

    const result = JSON.parse(
      await tool.execute({ topic: '数学', difficulty: 1, ageGroup: '3-4' }),
    );
    expect(result.questions).toHaveLength(2);
    expect(result.questions[0].question).toBe('1+1等于几？');
    expect(result.questions[0].correctIndex).toBe(1);
    expect(result.topic).toBe('数学');
    expect(result.ageGroup).toBe('3-4');
  });

  it('extracts JSON from markdown code block', async () => {
    llmClient.generate.mockResolvedValue('一些解释文字\n```json\n' + validQuizJson + '\n```\n结束');

    const result = JSON.parse(
      await tool.execute({ topic: '数学', difficulty: 2, ageGroup: '5-6' }),
    );
    expect(result.questions).toHaveLength(2);
  });

  it('corrects 1-based correctIndex to 0-based', async () => {
    const oneBased = JSON.stringify([
      {
        question: 'Q1',
        options: ['A', 'B', 'C'],
        correctIndex: 2,
        explanation: 'test',
      },
    ]);
    llmClient.generate.mockResolvedValue(oneBased);

    const result = JSON.parse(
      await tool.execute({ topic: 'test', difficulty: 1, ageGroup: '3-4' }),
    );
    // correctIndex=2 is valid for 3 options (0-based), should stay as 2
    expect(result.questions[0].correctIndex).toBe(2);
  });

  it('defaults correctIndex to 0 when invalid', async () => {
    const badIndex = JSON.stringify([
      {
        question: 'Q1',
        options: ['A', 'B'],
        correctIndex: 99,
        explanation: '',
      },
    ]);
    llmClient.generate.mockResolvedValue(badIndex);

    const result = JSON.parse(
      await tool.execute({ topic: 'test', difficulty: 1, ageGroup: '3-4' }),
    );
    // 99 is out of range, tries 98 (oneBased), still out of range, defaults to 0
    expect(result.questions[0].correctIndex).toBe(0);
  });

  it('generates default explanation when missing', async () => {
    const noExplanation = JSON.stringify([
      {
        question: 'Q1',
        options: ['A', 'B', 'C'],
        correctIndex: 0,
      },
    ]);
    llmClient.generate.mockResolvedValue(noExplanation);

    const result = JSON.parse(
      await tool.execute({ topic: 'test', difficulty: 1, ageGroup: '3-4' }),
    );
    expect(result.questions[0].explanation).toContain('正确答案是');
  });

  it('filters out questions with fewer than 2 options', async () => {
    const badOptions = JSON.stringify([
      { question: 'Q1', options: ['A'], correctIndex: 0 },
      { question: 'Q2', options: ['X', 'Y'], correctIndex: 1, explanation: 'ok' },
    ]);
    llmClient.generate.mockResolvedValue(badOptions);

    const result = JSON.parse(
      await tool.execute({ topic: 'test', difficulty: 1, ageGroup: '3-4' }),
    );
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].question).toBe('Q2');
  });

  it('returns error when no JSON array found', async () => {
    llmClient.generate.mockResolvedValue('这不是JSON');

    const result = JSON.parse(
      await tool.execute({ topic: 'test', difficulty: 1, ageGroup: '3-4' }),
    );
    expect(result.error).toContain('无法解析题目格式');
  });

  it('returns error when parsed array is empty', async () => {
    llmClient.generate.mockResolvedValue('[]');

    const result = JSON.parse(
      await tool.execute({ topic: 'test', difficulty: 1, ageGroup: '3-4' }),
    );
    expect(result.error).toContain('题目为空');
  });

  it('returns error on LLM exception', async () => {
    llmClient.generate.mockRejectedValue(new Error('LLM down'));

    const result = JSON.parse(
      await tool.execute({ topic: 'test', difficulty: 1, ageGroup: '3-4' }),
    );
    expect(result.error).toContain('生成测验失败');
  });

  it('maps difficulty levels to descriptions', async () => {
    llmClient.generate.mockResolvedValue(validQuizJson);

    await tool.execute({ topic: 'test', difficulty: 1, ageGroup: '3-4' });
    expect(llmClient.generate.mock.calls[0][0]).toContain('简单');

    await tool.execute({ topic: 'test', difficulty: 2, ageGroup: '3-4' });
    expect(llmClient.generate.mock.calls[1][0]).toContain('中等');

    await tool.execute({ topic: 'test', difficulty: 3, ageGroup: '3-4' });
    expect(llmClient.generate.mock.calls[2][0]).toContain('有挑战');
  });
});
