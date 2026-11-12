import { AiService } from '../../src/modules/ai/ai.service';

/**
 * English-practice mode wiring in AiService: session stickiness, level
 * resolution/injection, and englishLevel on response/done payloads.
 * Routing to the english-practice definition itself is covered by
 * orchestrator.service.spec; here we focus on the business-layer glue.
 */
describe('AiService english practice mode', () => {
  const agentExecutor = {
    classifyAge: jest.fn(),
    execute: jest.fn(),
    executeStream: jest.fn(),
  };
  const conversationManager = {
    getOrCreateSession: jest.fn(),
    updateMetadata: jest.fn(),
    listSessions: jest.fn(),
    getConversationByUuid: jest.fn(),
    getSessionMessages: jest.fn(),
  };
  const contentSafetyService = {
    filterContent: jest.fn((c: string) => ({ content: c ?? '', wasFiltered: false })),
    filterStoryResponse: jest.fn((s: Record<string, unknown>) => s),
  };
  const usersService = { findById: jest.fn(), canAccessChild: jest.fn() };
  const learningArchiveService = { recordChatTurnSummary: jest.fn() };
  const llmClient = { isConfigured: true, generate: jest.fn() };
  const generateCoursePackTool = {};
  const abilitiesService = { getLatestByDomain: jest.fn() };

  let service: AiService;

  beforeEach(() => {
    jest.resetAllMocks();
    agentExecutor.classifyAge.mockReturnValue('5-6');
    agentExecutor.execute.mockResolvedValue({ reply: 'Hello!', toolCalls: [] });
    agentExecutor.executeStream.mockImplementation(async function* () {
      yield { type: 'token', content: 'Hi' };
      yield { type: 'done' };
    });
    conversationManager.getOrCreateSession.mockResolvedValue({ uuid: 'session-1', metadata: {} });
    conversationManager.updateMetadata.mockResolvedValue(undefined);
    usersService.findById.mockResolvedValue({ id: 2, type: 'child', age: 5, name: '小朋友B', parentId: 1 });
    contentSafetyService.filterContent.mockImplementation((c: string) => ({ content: c ?? '', wasFiltered: false }));
    llmClient.isConfigured = true;
    abilitiesService.getLatestByDomain.mockResolvedValue(null);

    service = new AiService(
      agentExecutor as any,
      conversationManager as any,
      contentSafetyService as any,
      usersService as any,
      learningArchiveService as any,
      llmClient as any,
      generateCoursePackTool as any,
    );
    // Appended-last optional dependency; inject directly to keep the hand-built
    // constructor aligned with the existing core spec's 7-arg shape.
    (service as any).abilitiesService = abilitiesService;
  });

  describe('resolveChatMode (stickiness)', () => {
    const resolve = (req: any, meta: any) => (service as any).resolveChatMode(req, meta);

    it('locks an english session even when the request asks for casual', () => {
      expect(resolve('casual', { chatMode: 'english' })).toBe('english');
    });

    it('locks an english session even when the request omits mode', () => {
      expect(resolve(undefined, { chatMode: 'english' })).toBe('english');
    });

    it('honors an explicit english request in a normal session', () => {
      expect(resolve('english', {})).toBe('english');
    });

    it('keeps casual per-request (not persisted) in a normal session', () => {
      expect(resolve('casual', {})).toBe('casual');
      expect(resolve(undefined, {})).toBe('default');
    });

    it('tolerates missing session metadata', () => {
      expect(resolve('english', undefined)).toBe('english');
      expect(resolve(undefined, undefined)).toBe('default');
    });
  });

  describe('buildAgentContext (level injection)', () => {
    const base = {
      sessionId: 's1',
      ageGroup: '5-6',
      displayName: '小朋友B',
      executionContext: { childId: 2, parentId: 1 },
      actorType: 'child',
    };

    it('injects english level/score/source into metadata for english mode', () => {
      const ctx = (service as any).buildAgentContext({
        ...base,
        mode: 'english',
        englishProfile: { level: 'L2', score: 72, source: 'assessment' },
      });
      expect(ctx.metadata.chatMode).toBe('english');
      expect(ctx.metadata.englishLevel).toBe('L2');
      expect(ctx.metadata.englishScore).toBe(72);
      expect(ctx.metadata.englishLevelSource).toBe('assessment');
    });

    it('does not inject english fields for default mode', () => {
      const ctx = (service as any).buildAgentContext({ ...base, mode: 'default' });
      expect(ctx.metadata.chatMode).toBe('default');
      expect(ctx.metadata.englishLevel).toBeUndefined();
    });

    it('maps casual mode without english fields', () => {
      const ctx = (service as any).buildAgentContext({ ...base, mode: 'casual' });
      expect(ctx.metadata.chatMode).toBe('casual');
      expect(ctx.metadata.englishLevel).toBeUndefined();
    });
  });

  describe('resolveEnglishProfileForChat (cold start + assessment)', () => {
    const params = { mode: 'english', ageGroup: '3-4', executionContext: { childId: 2 } };

    it('cold-starts 3-4 to L1 when no assessment exists', async () => {
      abilitiesService.getLatestByDomain.mockResolvedValue(null);
      const profile = await (service as any).resolveEnglishProfileForChat(params);
      expect(profile).toEqual({ level: 'L1', score: null, source: 'cold-start' });
    });

    it('cold-starts 5-6 to L2 when no assessment exists', async () => {
      abilitiesService.getLatestByDomain.mockResolvedValue(null);
      const profile = await (service as any).resolveEnglishProfileForChat({ ...params, ageGroup: '5-6' });
      expect(profile.level).toBe('L2');
    });

    it('maps an existing assessment score to a level', async () => {
      abilitiesService.getLatestByDomain.mockResolvedValue({ score: 85 });
      const profile = await (service as any).resolveEnglishProfileForChat(params);
      expect(profile).toEqual({ level: 'L3', score: 85, source: 'assessment' });
    });

    it('returns undefined for non-english mode', async () => {
      const profile = await (service as any).resolveEnglishProfileForChat({ ...params, mode: 'default' });
      expect(profile).toBeUndefined();
      expect(abilitiesService.getLatestByDomain).not.toHaveBeenCalled();
    });
  });

  describe('chat() child path', () => {
    it('writes chatMode=english to session metadata and returns englishLevel', async () => {
      abilitiesService.getLatestByDomain.mockResolvedValue({ score: 72 });
      const result = await service.chat({ message: '你好', viewerId: 2, viewerType: 'child', mode: 'english' });

      expect(conversationManager.updateMetadata).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({ chatMode: 'english' }),
      );
      expect(result.englishLevel).toBe('L2');
    });

    it('keeps a sticky english session english when the request omits mode', async () => {
      conversationManager.getOrCreateSession.mockResolvedValue({ uuid: 'session-1', metadata: { chatMode: 'english' } });
      abilitiesService.getLatestByDomain.mockResolvedValue({ score: 50 });
      const result = await service.chat({ message: 'hello', viewerId: 2, viewerType: 'child' });

      expect(conversationManager.updateMetadata).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({ chatMode: 'english' }),
      );
      expect(result.englishLevel).toBe('L1');
    });

    it('does not mark a normal casual turn as english', async () => {
      const result = await service.chat({ message: '你好', viewerId: 2, viewerType: 'child', mode: 'casual' });
      const metaArg = conversationManager.updateMetadata.mock.calls[0][1];
      expect(metaArg.chatMode).toBeUndefined();
      expect(result.englishLevel).toBeUndefined();
    });
  });

  describe('chatStream() child path', () => {
    it('emits englishLevel on the done event for english mode', async () => {
      abilitiesService.getLatestByDomain.mockResolvedValue({ score: 85 });
      const events: any[] = [];
      for await (const e of service.chatStream({ message: 'hello', viewerId: 2, viewerType: 'child', mode: 'english' })) {
        events.push(e);
      }
      const done = events.find((e) => e.type === 'done');
      expect(done.englishLevel).toBe('L3');
      expect(conversationManager.updateMetadata).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({ chatMode: 'english' }),
      );
    });

    it('omits englishLevel on done for a normal session', async () => {
      const events: any[] = [];
      for await (const e of service.chatStream({ message: '你好', viewerId: 2, viewerType: 'child' })) {
        events.push(e);
      }
      const done = events.find((e) => e.type === 'done');
      expect(done.englishLevel).toBeUndefined();
    });
  });
});