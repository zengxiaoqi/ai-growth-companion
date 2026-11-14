import { GenerateQuizTool } from '../../src/modules/ai/agent/tools/generate-quiz';

describe('GenerateQuizTool (delegate over GenerateActivityTool)', () => {
  const generateActivityTool = { execute: jest.fn() };
  let tool: GenerateQuizTool;

  const activity = {
    type: 'quiz',
    title: '数学 practice',
    topic: '数学',
    ageGroup: '3-4',
    questions: [
      { question: '1+1等于几？', options: ['1', '2', '3'], correctIndex: 1, explanation: '1+1=2' },
      {
        question: '苹果是什么颜色？',
        options: ['红色', '蓝色', '绿色'],
        correctIndex: 0,
        explanation: '苹果通常是红色的',
      },
    ],
  };

  beforeEach(() => {
    jest.resetAllMocks();
    tool = new GenerateQuizTool(generateActivityTool as any);
  });

  it('delegates to generateActivity with type=quiz and maps the result', async () => {
    generateActivityTool.execute.mockResolvedValue(JSON.stringify(activity));

    const result = JSON.parse(
      await tool.execute({ topic: '数学', difficulty: 1, ageGroup: '3-4' }),
    );

    expect(generateActivityTool.execute).toHaveBeenCalledWith({
      type: 'quiz',
      topic: '数学',
      difficulty: 1,
      ageGroup: '3-4',
    });
    expect(result.questions).toHaveLength(2);
    expect(result.questions[0].correctIndex).toBe(1);
    expect(result.topic).toBe('数学');
    expect(result.ageGroup).toBe('3-4');
  });

  it('returns the legacy error shape when the engine fails', async () => {
    generateActivityTool.execute.mockRejectedValue(new Error('Unable to generate'));

    const result = JSON.parse(
      await tool.execute({ topic: '数学', difficulty: 1, ageGroup: '3-4' }),
    );
    expect(result.error).toContain('生成测验失败');
    expect(result.questions).toBeUndefined();
  });
});