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
      {
        parentId: 1,
        childId: 2,
      },
      undefined,
      undefined,
      // No care cue for a parent conversation.
      undefined,
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
      undefined,
      undefined,
      undefined,
    );
  });

  /**
   * AiService used to squash every group above 6 back into '5-6', which
   * made the school-age prompts unreachable from the HTTP entry point.
   */
  it.each(['7-9', '10-12'] as const)(
    'keeps the school-age group %s all the way to the executor',
    async (group) => {
      agentExecutor.classifyAge.mockReturnValue(group);

      const result = await service.chat({
        message: '我想聊点难的',
        viewerId: 2,
        viewerType: 'child',
      });

      expect(agentExecutor.execute).toHaveBeenCalledWith(
        'session-1',
        '我想聊点难的',
        group,
        '小朋友B',
        { childId: 2, parentId: 1 },
        undefined,
        undefined,
        undefined,
      );
      expect(conversationManager.updateMetadata).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({ ageGroup: group }),
      );
      // Suggestion chips are age-adaptive too.
      expect(result.suggestions).not.toEqual([
        '推荐学习内容',
        '出一道数学题',
        '我最近学得怎么样？',
      ]);
    },
  );

  /**
   * A care cue is an *opening* instruction. These two cases pin the only
   * signal that distinguishes an opening from turn 12: whether the session
   * id the client asked for is the one the store actually returned.
   */
  describe('opening care cue', () => {
    const careService = { dueCue: jest.fn() };

    function serviceWithCare() {
      return new AiService(
        agentExecutor as any,
        conversationManager as any,
        {} as any,
        usersService as any,
        learningArchiveService as any,
        llmClient as any,
        {} as any,
        // Optional dependencies keep their positions; only the last one
        // (CareService) is supplied here.
        undefined, // voiceService
        undefined, // agentRegistry
        undefined, // frameworkExecutor
        undefined, // skillRegistry
        undefined, // _skillExecutor
        undefined, // safetyService
        careService as any,
      );
    }

    beforeEach(() => {
      careService.dueCue.mockReset();
    });

    it('passes a cue topic when a new child conversation opens', async () => {
      careService.dueCue.mockResolvedValue({ topic: '春游' });

      await serviceWithCare().chat({
        message: '你好',
        viewerId: 2,
        viewerType: 'child',
      });

      expect(careService.dueCue).toHaveBeenCalledWith(2);
      expect(agentExecutor.execute).toHaveBeenCalledWith(
        'session-1',
        '你好',
        '5-6',
        '小朋友B',
        { childId: 2, parentId: 1 },
        undefined,
        undefined,
        '春游',
      );
    });

    it('does not ask for a cue when continuing an existing session', async () => {
      await serviceWithCare().chat({
        message: '继续聊',
        viewerId: 2,
        viewerType: 'child',
        sessionId: 'session-1',
      });

      expect(careService.dueCue).not.toHaveBeenCalled();
    });

    it('still replies if the cue lookup throws', async () => {
      careService.dueCue.mockRejectedValue(new Error('cue table down'));

      const result = await serviceWithCare().chat({
        message: '你好',
        viewerId: 2,
        viewerType: 'child',
      });

      expect(result.reply).toBe('ok');
    });
  });
});
