import { AiService } from '../../src/modules/ai/ai.service';

describe('AiService core public methods', () => {
  const agentExecutor = {
    classifyAge: jest.fn(),
    execute: jest.fn(),
    executeStream: jest.fn().mockImplementation(async function* () {
      yield { type: 'token', content: '' };
      yield { type: 'done' };
    }),
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
    filterStoryResponse: jest.fn((story: Record<string, unknown>) => story),
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
    generate: jest.fn(),
  };
  const generateCoursePackTool = {};

  let service: AiService;

  beforeEach(() => {
    jest.resetAllMocks();
    agentExecutor.classifyAge.mockReturnValue('5-6');
    agentExecutor.execute.mockResolvedValue({ reply: 'ok', toolCalls: [] });
    agentExecutor.executeStream.mockClear();
    conversationManager.getOrCreateSession.mockResolvedValue({ uuid: 'session-1' });
    conversationManager.listSessions.mockResolvedValue({
      list: [],
      total: 0,
      page: 1,
      limit: 50,
    });
    usersService.findById.mockImplementation(async (id: number) => {
      if (id === 1) return { id: 1, type: 'parent', name: '家长A' };
      if (id === 2) return { id: 2, type: 'child', age: 5, name: '小朋友B', parentId: 1 };
      return null;
    });
    contentSafetyService.filterContent.mockImplementation((c: string) => ({
      content: c ?? '',
      wasFiltered: false,
    }));
    contentSafetyService.filterStoryResponse.mockImplementation((s) => s);
    conversationManager.getConversationByUuid.mockResolvedValue(null);
    conversationManager.getSessionMessages.mockResolvedValue({
      list: [],
      total: 0,
      page: 1,
      limit: 50,
    });
    llmClient.isConfigured = true;
    llmClient.generate.mockRejectedValue(new Error('LLM not available'));

    service = new AiService(
      agentExecutor as any,
      conversationManager as any,
      contentSafetyService as any,
      usersService as any,
      learningArchiveService as any,
      llmClient as any,
      generateCoursePackTool as any,
    );
  });

  // ── canViewerAccessChild ────────────────────────────────────────
  describe('canViewerAccessChild', () => {
    it('returns true when access granted', async () => {
      usersService.canAccessChild.mockResolvedValue(true);

      const result = await service.canViewerAccessChild({
        viewerId: 1,
        viewerType: 'parent',
        childId: 2,
      });

      expect(result).toBe(true);
      expect(usersService.canAccessChild).toHaveBeenCalledWith(1, 'parent', 2);
    });

    it('returns false when access denied', async () => {
      usersService.canAccessChild.mockResolvedValue(false);

      const result = await service.canViewerAccessChild({
        viewerId: 99,
        viewerType: 'unknown',
        childId: 2,
      });

      expect(result).toBe(false);
      expect(usersService.canAccessChild).toHaveBeenCalledWith(99, 'unknown', 2);
    });
  });

  // ── getConversationSessions ─────────────────────────────────────
  describe('getConversationSessions', () => {
    it('returns sessions when access granted', async () => {
      usersService.canAccessChild.mockResolvedValue(true);
      const expectedSessions = [{ uuid: 's1', createdAt: '2025-01-01T00:00:00Z' }];
      conversationManager.listSessions.mockResolvedValue({
        list: expectedSessions,
        total: 1,
        page: 1,
        limit: 10,
      });

      const result = await service.getConversationSessions({
        viewerId: 1,
        viewerType: 'parent',
        childId: 2,
        page: 1,
        limit: 10,
      });

      expect(result).toEqual({
        list: expectedSessions,
        total: 1,
        page: 1,
        limit: 10,
      });
      expect(usersService.canAccessChild).toHaveBeenCalledWith(1, 'parent', 2);
      // Parent conversations are stored with childId = viewerId (parent's own ID),
      // not the child's ID. When a parent views history, use viewerId as childId.
      // Don't filter by actorType for parent mode — old sessions may have been
      // created with actorType='child' before the parent mode refactor.
      expect(conversationManager.listSessions).toHaveBeenCalledWith({
        childId: 1,
        actorType: undefined,
        page: 1,
        limit: 10,
      });
    });

    it('throws FORBIDDEN_CHILD_ACCESS when denied', async () => {
      usersService.canAccessChild.mockResolvedValue(false);

      await expect(
        service.getConversationSessions({
          viewerId: 99,
          viewerType: 'stranger',
          childId: 2,
        }),
      ).rejects.toThrow('FORBIDDEN_CHILD_ACCESS');

      expect(usersService.canAccessChild).toHaveBeenCalledWith(99, 'stranger', 2);
      expect(conversationManager.listSessions).not.toHaveBeenCalled();
    });
  });

  // ── getConversationSessionMessages ──────────────────────────────
  describe('getConversationSessionMessages', () => {
    it('returns empty when session not found', async () => {
      conversationManager.getConversationByUuid.mockResolvedValue(null);

      const result = await service.getConversationSessionMessages({
        viewerId: 1,
        viewerType: 'parent',
        sessionId: 'nonexistent-session',
        page: 1,
        limit: 20,
      });

      expect(result).toEqual({
        sessionId: 'nonexistent-session',
        list: [],
        total: 0,
        page: 1,
        limit: 20,
      });
      expect(usersService.canAccessChild).not.toHaveBeenCalled();
    });

    it('returns messages when access granted', async () => {
      conversationManager.getConversationByUuid.mockResolvedValue({
        uuid: 'sess-abc',
        childId: 2,
      });
      usersService.canAccessChild.mockResolvedValue(true);
      const msgs = [{ role: 'user', content: 'hello' }];
      conversationManager.getSessionMessages.mockResolvedValue({
        list: msgs,
        total: 1,
        page: 1,
        limit: 50,
      });

      const result = await service.getConversationSessionMessages({
        viewerId: 1,
        viewerType: 'parent',
        sessionId: 'sess-abc',
        page: 1,
        limit: 50,
      });

      expect(result.sessionId).toBe('sess-abc');
      expect(result.childId).toBe(2);
      expect(result.list).toEqual(msgs);
      expect(usersService.canAccessChild).toHaveBeenCalledWith(1, 'parent', 2);
      expect(conversationManager.getSessionMessages).toHaveBeenCalledWith({
        sessionId: 'sess-abc',
        page: 1,
        limit: 50,
      });
    });

    it('throws FORBIDDEN_CHILD_ACCESS when denied after finding conversation', async () => {
      conversationManager.getConversationByUuid.mockResolvedValue({
        uuid: 'sess-xyz',
        childId: 5,
      });
      usersService.canAccessChild.mockResolvedValue(false);

      await expect(
        service.getConversationSessionMessages({
          viewerId: 99,
          viewerType: 'stranger',
          sessionId: 'sess-xyz',
        }),
      ).rejects.toThrow('FORBIDDEN_CHILD_ACCESS');

      expect(usersService.canAccessChild).toHaveBeenCalledWith(99, 'stranger', 5);
      expect(conversationManager.getSessionMessages).not.toHaveBeenCalled();
    });
  });

  // ── chatStream ──────────────────────────────────────────────────
  describe('chatStream', () => {
    it('yields parent stream tokens then done with suggestions', async () => {
      jest.useRealTimers();
      (llmClient.isConfigured as boolean) = true;
      agentExecutor.executeStream.mockImplementation(async function* () {
        yield { type: 'token', content: 'Hello ' };
        yield { type: 'token', content: 'world' };
        yield { type: 'done' };
      });
      const events: any[] = [];
      for await (const event of service.chatStream({
        message: 'test',
        viewerId: 1,
        viewerType: 'parent',
      })) {
        events.push(event);
      }
      const tokenEvents = events.filter((e) => e.type === 'token');
      const doneEvents = events.filter((e) => e.type === 'done');
      expect(tokenEvents.length).toBe(2);
      expect(tokenEvents[0].content).toBe('Hello ');
      expect(tokenEvents[1].content).toBe('world');
      expect(doneEvents.length).toBe(1);
      expect(doneEvents[0].suggestions).toBeDefined();
    });

    it('yields error when parent user not found', async () => {
      jest.useRealTimers();
      usersService.findById.mockImplementation(async (id: number) => {
        if (id === 999) return null;
        return { id: 999, type: 'parent', name: '家长X' };
      });
      const events: any[] = [];
      for await (const event of service.chatStream({
        message: 'test',
        viewerId: 999,
        viewerType: 'parent',
      })) {
        events.push(event);
      }
      const errors = events.filter((e) => e.type === 'error');
      expect(errors.length).toBe(1);
      expect(events[0]).toEqual({ type: 'error', message: '找不到您的信息' });
    });

    it('yields fallback when LLM not configured for parent', async () => {
      jest.useRealTimers();
      (llmClient.isConfigured as boolean) = false;
      const events: any[] = [];
      for await (const event of service.chatStream({
        message: 'test',
        viewerId: 1,
        viewerType: 'parent',
      })) {
        events.push(event);
      }
      const tokenEvents = events.filter((e) => e.type === 'token');
      const doneEvents = events.filter((e) => e.type === 'done');
      expect(tokenEvents.length).toBe(1);
      expect(doneEvents.length).toBe(1);
      expect(doneEvents[0].suggestions).toEqual([]);
    });

    it('yields child stream tokens then done with suggestions', async () => {
      jest.useRealTimers();
      agentExecutor.executeStream.mockImplementation(async function* () {
        yield { type: 'token', content: 'Hi ' };
        yield { type: 'token', content: 'there!' };
        yield { type: 'done' };
      });
      const events: any[] = [];
      for await (const event of service.chatStream({
        message: 'Hello',
        viewerId: 2,
        viewerType: 'child',
      })) {
        events.push(event);
      }
      const tokenEvents = events.filter((e) => e.type === 'token');
      const doneEvents = events.filter((e) => e.type === 'done');
      expect(tokenEvents.length).toBe(2);
      expect(tokenEvents[0].content).toBe('Hi ');
      expect(tokenEvents[1].content).toBe('there!');
      expect(doneEvents.length).toBe(1);
      expect(doneEvents[0].sessionId).toBeDefined();
      expect(doneEvents[0].suggestions).toBeDefined();
    });

    it('yields error when child user not found', async () => {
      jest.useRealTimers();
      const events: any[] = [];
      usersService.findById.mockImplementation(async (id: number) => {
        if (id === 888) return null;
        return { id: 2, type: 'child', age: 5, name: '小朋友B', parentId: 1 };
      });
      for await (const event of service.chatStream({
        message: 'Hello',
        viewerId: 888,
        viewerType: 'child',
      })) {
        events.push(event);
      }
      expect(events[0]).toEqual({ type: 'error', message: '找不到你的信息' });
    });

    it('yields fallback when LLM not configured for child', async () => {
      jest.useRealTimers();
      (llmClient.isConfigured as boolean) = false;
      const events: any[] = [];
      for await (const event of service.chatStream({
        message: 'Hello',
        viewerId: 2,
        viewerType: 'child',
      })) {
        events.push(event);
      }
      const tokenEvents = events.filter((e) => e.type === 'token');
      const doneEvents = events.filter((e) => e.type === 'done');
      expect(tokenEvents.length).toBe(1);
      expect(doneEvents.length).toBe(1);
      expect(doneEvents[0].suggestions).toEqual([]);
    });
  });

  // ── generateStory ───────────────────────────────────────────────
  describe('generateStory', () => {
    it('returns LLM-generated story when LLM succeeds', async () => {
      const mockStory = {
        title: '冒险之旅',
        content: '从前...',
        questions: ['问题1'],
      };
      llmClient.generate.mockResolvedValue(JSON.stringify(mockStory));
      usersService.findById.mockResolvedValue({ id: 2, age: 5, name: '小朋友B' });

      const result = await service.generateStory({
        childId: 2,
        theme: '冒险',
        ageRange: '5-6',
      });

      expect(llmClient.generate).toHaveBeenCalled();
      expect(contentSafetyService.filterStoryResponse).toHaveBeenCalledWith(mockStory);
      expect(result).toEqual(mockStory);
    });

    it('returns template fallback when LLM throws', async () => {
      usersService.findById.mockResolvedValue({ id: 2, age: 5, name: '小朋友B' });
      llmClient.generate.mockRejectedValue(new Error('rate limited'));

      const result = await service.generateStory({
        childId: 2,
        theme: '友谊',
      });

      expect(result.title).toContain('探索');
      expect(result.content).toContain('好朋友');
      expect(result.questions.length).toBeGreaterThan(0);
    });

    it('returns template when LLM not configured', async () => {
      (llmClient.isConfigured as boolean) = false;
      usersService.findById.mockResolvedValue({ id: 2, age: 5, name: '小朋友B' });

      const result = await service.generateStory({
        childId: 2,
        theme: '动物',
        ageRange: '5-6',
      });

      expect(result.title).toContain('探索');
      expect(result.content).toContain('好朋友');
    });

    it('uses default theme when not provided', async () => {
      usersService.findById.mockResolvedValue({ id: 2, age: 5, name: '小朋友A' });
      llmClient.generate.mockRejectedValue(new Error('error'));

      const result = await service.generateStory({ childId: 2 });
      expect(result.title).toContain('探索');
    });

    it('selects 3-4 story template for age range 3-4', async () => {
      usersService.findById.mockResolvedValue({ id: 2, age: 3, name: '幼儿C' });
      llmClient.generate.mockRejectedValue(new Error('error'));

      const result = await service.generateStory({
        childId: 2,
        ageRange: '3-4',
      });

      expect(result.title).toContain('小兔子');
      expect(result.questions.length).toBe(3);
    });
  });

  // ── evaluateLearning ────────────────────────────────────────────
  describe('evaluateLearning', () => {
    it('returns 3 stars for score >= 80', async () => {
      const result = await service.evaluateLearning(1, ['answer1'], 5);
      expect(result.stars).toBe(3);
      expect(result.score).toBe(100);
      expect(result.feedback).toBe('你做得太棒了！');
    });

    it('returns 2 stars for score >= 60', async () => {
      const result = await service.evaluateLearning(1, ['a', 'b', 'c'], 5);
      expect(result.stars).toBe(2);
      expect(result.score).toBe(67);
      expect(result.feedback).toBe('不错哦，继续加油！');
    });

    it('returns 1 star for score < 60', async () => {
      // 4 answers: indices 0,2 are even (correct) = 2/4 = 50%
      const result = await service.evaluateLearning(1, ['a', 'b', 'c', 'd'], 5);
      expect(result.stars).toBe(1);
      expect(result.score).toBe(50);
      expect(result.feedback).toBe('再接再厉哦~');
    });
  });

  // ── generateSuggestion ──────────────────────────────────────────
  describe('generateSuggestion', () => {
    it('returns a suggestion string', async () => {
      const result = await service.generateSuggestion({ language: 70 }, 5);
      expect(result).toHaveProperty('suggestion');
      expect(typeof result.suggestion).toBe('string');
      expect(result.suggestion.length).toBeGreaterThan(0);
    });
  });

  // ── generateStoryLegacy ─────────────────────────────────────────
  describe('generateStoryLegacy', () => {
    it('returns short story for age under 4', async () => {
      const result = await service.generateStoryLegacy('交朋友', 3);
      expect(result.duration).toBe(3);
      expect(result.title).toBe('交朋友的故事');
      expect(result.content).toContain('交朋友');
    });

    it('returns medium story for age 4 or above', async () => {
      const result = await service.generateStoryLegacy('探险', 5);
      expect(result.duration).toBe(5);
      expect(result.title).toBe('探险的故事');
      expect(result.content).toContain('遥远的森林');
    });
  });

  // ── Private helpers ─────────────────────────────────────────────
  describe('private helpers', () => {
    describe('toSafeFilename', () => {
      it('strips special characters and replaces spaces with hyphens', () => {
        expect((service as any).toSafeFilename('file:name/with\\special')).toBe(
          'file-name-with-special',
        );
      });

      it('collapses multiple consecutive hyphens', () => {
        expect((service as any).toSafeFilename('a---b---c')).toBe('a-b-c');
      });

      it('trims leading and trailing hyphens', () => {
        expect((service as any).toSafeFilename('---hello---')).toBe('hello');
      });

      it('returns default value for empty input', () => {
        const result = (service as any).toSafeFilename('');
        expect(result).toMatch(/^course-pack-\d+$/);
      });
    });

    describe('normalizeCoursePackExportFormats', () => {
      it('defaults to bundle_zip when undefined', () => {
        expect((service as any).normalizeCoursePackExportFormats(undefined)).toEqual([
          'bundle_zip',
        ]);
      });

      it('filters to allowed set', () => {
        const formats = ['capcut_json', 'invalid_format', 'narration_txt'];
        expect((service as any).normalizeCoursePackExportFormats(formats)).toEqual([
          'capcut_json',
          'narration_txt',
        ]);
      });

      it('deduplicates entries', () => {
        const formats = ['capcut_json', 'capcut_json', 'narration_txt'];
        expect((service as any).normalizeCoursePackExportFormats(formats)).toEqual([
          'capcut_json',
          'narration_txt',
        ]);
      });

      it('defaults to bundle_zip when all are invalid', () => {
        expect((service as any).normalizeCoursePackExportFormats(['bad1', 'bad2'])).toEqual([
          'bundle_zip',
        ]);
      });

      it('includes all valid bundle format variants', () => {
        const formats = [
          'capcut_json',
          'narration_txt',
          'narration_mp3',
          'teaching_video_mp4',
          'storyboard_csv',
          'subtitle_srt',
          'subtitle_srt_bilingual',
          'bundle_zip',
        ];
        expect((service as any).normalizeCoursePackExportFormats(formats)).toEqual(formats);
      });
    });

    describe('createVersionTitle', () => {
      it('appends vN suffix', () => {
        expect((service as any).createVersionTitle('Course Pack', 1)).toBe('Course Pack (v1)');
        expect((service as any).createVersionTitle('My Story', 3)).toBe('My Story (v3)');
      });

      it('strips existing version suffix before adding new one', () => {
        expect((service as any).createVersionTitle('Course (v2)', 3)).toBe('Course (v3)');
        expect((service as any).createVersionTitle('Course v1', 3)).toBe('Course (v3)');
      });

      it('handles empty base title', () => {
        expect((service as any).createVersionTitle('', 1)).toBe('Course Pack (v1)');
      });
    });

    describe('formatSrtTime', () => {
      it('formats zero seconds', () => {
        expect((service as any).formatSrtTime(0)).toBe('00:00:00,000');
      });

      it('formats 123.456 seconds correctly', () => {
        expect((service as any).formatSrtTime(123.456)).toBe('00:02:03,456');
      });

      it('handles negative values gracefully', () => {
        expect((service as any).formatSrtTime(-5)).toBe('00:00:00,000');
      });
    });

    describe('isMostlyEnglish', () => {
      it('returns true when text has no Chinese characters', () => {
        expect((service as any).isMostlyEnglish('Hello world')).toBe(true);
        expect((service as any).isMostlyEnglish('')).toBe(true);
      });

      it('returns false when text contains Chinese characters', () => {
        expect((service as any).isMostlyEnglish('你好世界')).toBe(false);
        expect((service as any).isMostlyEnglish('Hello 世界')).toBe(false);
      });
    });

    describe('extractJsonArray', () => {
      it('parses a valid JSON array', () => {
        const result = (service as any).extractJsonArray('[1, 2, 3]');
        expect(result).toEqual([1, 2, 3]);
      });

      it('extracts array from mixed text', () => {
        const result = (service as any).extractJsonArray('some preamble [{"id":1}] tail');
        expect(result).toEqual([{ id: 1 }]);
      });

      it('returns empty array for non-array JSON', () => {
        const result = (service as any).extractJsonArray('{}');
        expect(result).toEqual([]);
      });

      it('returns empty array for malformed JSON', () => {
        const result = (service as any).extractJsonArray('[invalid json');
        expect(result).toEqual([]);
      });

      it('returns empty array for null/empty input', () => {
        expect((service as any).extractJsonArray('')).toEqual([]);
        expect((service as any).extractJsonArray(null as any)).toEqual([]);
      });
    });

    describe('weeklyFocusLabel', () => {
      it('returns literacy label', () => {
        expect((service as any).weeklyFocusLabel(1, 'literacy')).toBe('Language and literacy');
      });

      it('returns math label', () => {
        expect((service as any).weeklyFocusLabel(3, 'math')).toBe('Math thinking');
      });

      it('returns science label', () => {
        expect((service as any).weeklyFocusLabel(2, 'science')).toBe('Science exploration');
      });

      it('rotates through labels for mixed focus', () => {
        const labels = ['Language', 'Math', 'Science', 'Reading', 'Speaking', 'Hands-on', 'Review'];
        for (let i = 1; i <= 7; i++) {
          expect((service as any).weeklyFocusLabel(i, 'mixed')).toBe(
            labels[(i - 1) % labels.length],
          );
        }
      });
    });

    describe('toSafeNumber', () => {
      it('clamps values below min', () => {
        expect((service as any).toSafeNumber(1, 10, 5, 100)).toBe(5);
      });

      it('clamps values above max', () => {
        expect((service as any).toSafeNumber(200, 10, 0, 100)).toBe(100);
      });

      it('returns value when within range', () => {
        expect((service as any).toSafeNumber(50, 10, 0, 100)).toBe(50);
      });

      it('returns fallback for non-numeric values', () => {
        expect((service as any).toSafeNumber('NaN' as any, 42, 0, 100)).toBe(42);
        // Number(null) = 0, which is finite, so it returns clamped 0
        expect((service as any).toSafeNumber(null, 42, 0, 100)).toBe(0);
      });
    });

    describe('roundSeconds', () => {
      it('rounds to 2 decimal places', () => {
        expect((service as any).roundSeconds(1.234)).toBe(1.23);
        expect((service as any).roundSeconds(1.236)).toBe(1.24);
        expect((service as any).roundSeconds(1.005)).toBe(1);
      });

      it('returns 0 for non-finite values', () => {
        expect((service as any).roundSeconds(NaN)).toBe(0);
        expect((service as any).roundSeconds(Infinity)).toBe(0);
      });
    });

    describe('generateSuggestions', () => {
      it('returns 3-4 specific suggestions', () => {
        const result = (service as any).generateSuggestions('reply', '3-4');
        expect(result).toEqual(['我想学颜色 🎨', '给我讲故事 📖', '我们玩游戏吧 🎮']);
      });

      it('returns older-child suggestions for 5-6', () => {
        const result = (service as any).generateSuggestions('reply', '5-6');
        expect(result).toEqual(['推荐学习内容', '出一道数学题', '我最近学得怎么样？']);
      });
    });

    describe('generateParentSuggestions', () => {
      it('returns parent-oriented suggestions', () => {
        const result = (service as any).generateParentSuggestions();
        expect(result).toEqual(['查看学习报告', '设置学习时间限制', '布置作业', '查看孩子能力']);
      });
    });
  });
});
