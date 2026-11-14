import { AiService } from '../../src/modules/ai/ai.service';

describe('AiService generateQuiz (delegates to GenerateActivityTool)', () => {
  const agentExecutor = {
    classifyAge: jest.fn(),
    execute: jest.fn(),
  };
  const conversationManager = {
    getOrCreateSession: jest.fn(),
    updateMetadata: jest.fn(),
  };
  const contentSafetyService = {
    filterContent: jest.fn((content: string) => ({ content, isSafe: true })),
  };
  const usersService = {
    findById: jest.fn(),
  };
  const learningArchiveService = {
    recordChatTurnSummary: jest.fn(),
  };
  const llmClient = {
    isConfigured: true,
    generate: jest.fn(),
  };
  const generateActivityTool = { execute: jest.fn() };

  let service: AiService;

  const activityWith = (questions: any[]) =>
    JSON.stringify({ type: 'quiz', topic: 't', ageGroup: '5-6', questions });

  const question = (text: string, correctIndex = 0) => ({
    question: text,
    options: ['A', 'B', 'C'],
    correctIndex,
    explanation: 'E',
  });

  beforeEach(() => {
    jest.resetAllMocks();
    usersService.findById.mockResolvedValue({ id: 1, age: 5, name: '小明' });
    contentSafetyService.filterContent.mockImplementation((content: string) => ({
      content,
      isSafe: true,
    }));

    service = new AiService(
      agentExecutor as any,
      conversationManager as any,
      contentSafetyService as any,
      usersService as any,
      learningArchiveService as any,
      llmClient as any,
      {} as any,
    );
    (service as any).generateActivityTool = generateActivityTool;
  });

  it('generates quiz via the activity engine', async () => {
    generateActivityTool.execute.mockResolvedValue(
      activityWith([question('天空是什么颜色的？', 1), question('太阳从哪里升起？')]),
    );

    const result = await service.generateQuiz({ childId: 1, topic: '自然', count: 2 });

    expect(generateActivityTool.execute).toHaveBeenCalledWith({
      type: 'quiz',
      topic: '自然',
      difficulty: 2,
      ageGroup: '5-6',
    });
    expect(result.questions).toHaveLength(2);
    expect(result.topic).toBe('自然');
    expect(result.ageGroup).toBe('5-6');
    expect(result.questions[0].correctIndex).toBe(1);
  });

  it('throws when user does not exist', async () => {
    usersService.findById.mockResolvedValue(null);

    await expect(service.generateQuiz({ childId: 999, topic: '数学' })).rejects.toThrow(
      '用户不存在',
    );
  });

  it('propagates engine failure instead of returning a placeholder quiz', async () => {
    generateActivityTool.execute.mockRejectedValue(
      new Error('Unable to generate a topic-aligned activity'),
    );

    await expect(service.generateQuiz({ childId: 1, topic: '数学', count: 3 })).rejects.toThrow(
      'Unable to generate',
    );
  });

  it('assigns ageGroup 3-4 and difficulty 1 for children age 3', async () => {
    usersService.findById.mockResolvedValue({ id: 2, age: 3, name: '小华' });
    generateActivityTool.execute.mockResolvedValue(activityWith([question('1+1=？', 1)]));

    const result = await service.generateQuiz({ childId: 2, topic: '数学', count: 1 });

    expect(result.ageGroup).toBe('3-4');
    expect(generateActivityTool.execute).toHaveBeenCalledWith(
      expect.objectContaining({ difficulty: 1, ageGroup: '3-4' }),
    );
  });

  it('filters questions through content safety', async () => {
    generateActivityTool.execute.mockResolvedValue(activityWith([question('正常问题')]));

    await service.generateQuiz({ childId: 1, topic: '测试', count: 1 });

    expect(contentSafetyService.filterContent).toHaveBeenCalledWith('正常问题');
  });

  it('caps questions at count (default 3)', async () => {
    generateActivityTool.execute.mockResolvedValue(
      activityWith([question('Q1'), question('Q2'), question('Q3'), question('Q4'), question('Q5')]),
    );

    const result = await service.generateQuiz({ childId: 1, topic: '科学' });

    expect(result.questions).toHaveLength(3);
  });
});