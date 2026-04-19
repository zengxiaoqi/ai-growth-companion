import { AiService } from '../../src/modules/ai/ai.service';

describe('AiService viewer routing', () => {
  const agentExecutor = {
    classifyAge: jest.fn(),
    execute: jest.fn(),
  };
  const conversationManager = {
    getOrCreateSession: jest.fn(),
    updateMetadata: jest.fn(),
  };
  const usersService = {
    findById: jest.fn(),
    canAccessChild: jest.fn(),
  };
  const learningArchiveService = {
    recordChatTurnSummary: jest.fn(),
  };
  const llmClient = {
    isConfigured: true,
  };

  let service: AiService;

  beforeEach(() => {
    jest.resetAllMocks();
    agentExecutor.classifyAge.mockReturnValue('5-6');
    agentExecutor.execute.mockResolvedValue({
      reply: 'ok',
      toolCalls: [],
    });
    conversationManager.getOrCreateSession.mockResolvedValue({
      uuid: 'session-1',
    });
    usersService.findById.mockImplementation(async (id: number) => {
      if (id === 1) return { id: 1, type: 'parent', name: '家长A' };
      if (id === 2) return { id: 2, type: 'child', age: 5, name: '小朋友B', parentId: 1 };
      return null;
    });

    service = new AiService(
      agentExecutor as any,
      conversationManager as any,
      {} as any,
      usersService as any,
      learningArchiveService as any,
      llmClient as any,
      {} as any,
    );
  });

  it('routes parent viewer to parent mode even when targetChildId is present', async () => {
    await service.chat({
      message: '布置作业',
      viewerId: 1,
      viewerType: 'parent',
      targetChildId: 2,
    });

    expect(agentExecutor.execute).toHaveBeenCalledWith(
      'session-1',
      '布置作业',
      'parent',
      '家长A',
      { parentId: 1, childId: 2 },
    );
  });

  it('routes child viewer to child mode and ignores spoofed target child', async () => {
    await service.chat({
      message: '我要做练习',
      viewerId: 2,
      viewerType: 'child',
      targetChildId: 999,
    });

    expect(agentExecutor.execute).toHaveBeenCalledWith(
      'session-1',
      '我要做练习',
      '5-6',
      '小朋友B',
      { childId: 2, parentId: 1 },
    );
  });
});
