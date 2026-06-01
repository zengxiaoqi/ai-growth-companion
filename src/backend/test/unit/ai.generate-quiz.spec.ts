import { AiService } from '../../src/modules/ai/ai.service';

describe('AiService generateQuiz', () => {
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

  let service: AiService;

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
  });

  describe('generateQuiz', () => {
    it('should generate quiz from LLM JSON response', async () => {
      llmClient.generate.mockResolvedValue(
        JSON.stringify([
          {
            question: '天空是什么颜色的？',
            options: ['红色', '蓝色', '绿色'],
            correctIndex: 1,
            explanation: '白天天空是蓝色的哦~',
          },
          {
            question: '太阳从哪里升起？',
            options: ['东方', '西方', '南方'],
            correctIndex: 0,
            explanation: '太阳从东方升起！',
          },
        ]),
      );

      const result = await service.generateQuiz({
        childId: 1,
        topic: '自然',
        count: 2,
      });

      expect(result.questions).toHaveLength(2);
      expect(result.topic).toBe('自然');
      expect(result.ageGroup).toBe('5-6');
      expect(result.questions[0].question).toContain('天空');
      expect(result.questions[0].correctIndex).toBe(1);
    });

    it('should throw when user does not exist', async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(
        service.generateQuiz({ childId: 999, topic: '数学' }),
      ).rejects.toThrow('用户不存在');
    });

    it('should use fallback quiz when LLM returns invalid JSON', async () => {
      llmClient.generate.mockResolvedValue('Sorry, I cannot generate that right now.');

      const result = await service.generateQuiz({
        childId: 1,
        topic: '数学',
        count: 3,
      });

      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].question).toContain('数学');
      expect(result.topic).toBe('数学');
    });

    it('should assign ageGroup 3-4 for children age 3', async () => {
      usersService.findById.mockResolvedValue({ id: 2, age: 3, name: '小华' });
      llmClient.generate.mockResolvedValue(
        JSON.stringify([
          {
            question: '1+1=？',
            options: ['1', '2', '3'],
            correctIndex: 1,
            explanation: '一个加一个就是两个',
          },
        ]),
      );

      const result = await service.generateQuiz({
        childId: 2,
        topic: '数学',
        count: 1,
      });

      expect(result.ageGroup).toBe('3-4');
    });

    it('should filter questions through content safety', async () => {
      llmClient.generate.mockResolvedValue(
        JSON.stringify([
          {
            question: '正常问题',
            options: ['A', 'B', 'C'],
            correctIndex: 0,
            explanation: '解释',
          },
        ]),
      );

      await service.generateQuiz({ childId: 1, topic: '测试', count: 1 });

      expect(contentSafetyService.filterContent).toHaveBeenCalledWith('正常问题');
    });

    it('should default to count=3 when not specified', async () => {
      const promptSpy = jest.fn();
      llmClient.generate.mockImplementation((prompt: string) => {
        promptSpy(prompt);
        return JSON.stringify([
          { question: 'Q1', options: ['A', 'B', 'C'], correctIndex: 0, explanation: 'E1' },
          { question: 'Q2', options: ['A', 'B', 'C'], correctIndex: 0, explanation: 'E2' },
          { question: 'Q3', options: ['A', 'B', 'C'], correctIndex: 0, explanation: 'E3' },
        ]);
      });

      await service.generateQuiz({ childId: 1, topic: '科学' });

      expect(promptSpy).toHaveBeenCalledWith(expect.stringContaining('3道'));
    });
  });
});