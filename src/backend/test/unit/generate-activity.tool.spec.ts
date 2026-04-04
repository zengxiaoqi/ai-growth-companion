import { GenerateActivityTool } from '../../src/modules/ai/agent/tools/generate-activity';

describe('GenerateActivityTool', () => {
  let tool: GenerateActivityTool;
  let llmClient: { generate: jest.Mock };

  beforeEach(() => {
    llmClient = {
      generate: jest.fn(),
    };
    tool = new GenerateActivityTool(llmClient as any);
  });

  it('rewrites quiz questions that depend on external visuals into self-contained questions', async () => {
    const badQuestion = '\u6570\u4e00\u6570\uff0c\u7bee\u5b50\u91cc\u6709\u51e0\u4e2a\u82f9\u679c\uff1f';
    llmClient.generate.mockResolvedValueOnce(JSON.stringify({
      title: '\u82f9\u679c\u7ec3\u4e60',
      questions: [
        {
          question: badQuestion,
          options: ['3', '4', '5'],
          correctIndex: 1,
          explanation: '\u89e3\u6790',
        },
      ],
    }));

    const resultStr = await tool.execute({
      type: 'quiz',
      topic: '\u82f9\u679c',
      difficulty: 1,
      ageGroup: '5-6',
    });
    const result = JSON.parse(resultStr);

    expect(result.type).toBe('quiz');
    expect(Array.isArray(result.questions)).toBe(true);
    expect(result.questions.length).toBeGreaterThanOrEqual(1);
    expect(result.questions[0].question).not.toContain('\u7bee\u5b50\u91cc');
    expect(result.questions[0].question).not.toBe(badQuestion);
    expect(result.questions[0].question).toContain('\u6570\u4e00\u6570');
    expect(result.questions[0].options.length).toBeGreaterThanOrEqual(2);
    expect(result.questions[0].correctIndex).toBeGreaterThanOrEqual(0);
    expect(result.questions[0].correctIndex).toBeLessThan(result.questions[0].options.length);
  });

  it('normalizes invalid correctIndex using correctAnswer text mapping', async () => {
    llmClient.generate.mockResolvedValueOnce(JSON.stringify({
      title: '\u6570\u5b66\u7ec3\u4e60',
      questions: [
        {
          question: '2 + 2 = ?',
          options: ['3', '4', '5'],
          correctIndex: 99,
          correctAnswer: '4',
          explanation: '2 + 2 = 4',
        },
      ],
    }));

    const resultStr = await tool.execute({
      type: 'quiz',
      topic: '\u6570\u5b66',
      difficulty: 2,
      ageGroup: '5-6',
    });
    const result = JSON.parse(resultStr);

    expect(result.questions[0].correctIndex).toBe(1);
    expect(result.questions[0].options[result.questions[0].correctIndex]).toBe('4');
  });

  it('falls back to safe quiz template when LLM output is not parseable JSON', async () => {
    llmClient.generate.mockResolvedValueOnce('not-json-at-all');

    const resultStr = await tool.execute({
      type: 'quiz',
      topic: '\u6d4b\u8bd5',
      difficulty: 1,
      ageGroup: '3-4',
    });
    const result = JSON.parse(resultStr);

    expect(result.type).toBe('quiz');
    expect(Array.isArray(result.questions)).toBe(true);
    expect(result.questions.length).toBeGreaterThan(0);
    for (const q of result.questions) {
      expect(Array.isArray(q.options)).toBe(true);
      expect(q.options.length).toBeGreaterThan(1);
      expect(q.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q.correctIndex).toBeLessThan(q.options.length);
    }
  });
});

