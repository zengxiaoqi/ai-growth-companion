import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AiController } from '../../src/modules/ai/ai.controller';
import { AiService } from '../../src/modules/ai/ai.service';

describe('AiController', () => {
  let controller: AiController;
  let service: Partial<Record<keyof AiService, jest.Mock>>;

  const parentReq = { user: { sub: 1, type: 'parent' } };
  const childReq = { user: { sub: 2, type: 'student' } };

  beforeEach(() => {
    service = {
      chat: jest.fn(),
      chatStream: jest.fn(),
      canViewerAccessChild: jest.fn().mockResolvedValue(true),
      getConversationSessions: jest.fn(),
      getConversationSessionMessages: jest.fn(),
      getCoursePacks: jest.fn(),
      getCoursePackById: jest.fn(),
      exportCoursePack: jest.fn(),
      exportCoursePacksBatch: jest.fn(),
      getCoursePackVersions: jest.fn(),
      saveCoursePackVersion: jest.fn(),
      enrichCoursePackBilingual: jest.fn(),
      generateWeeklyCoursePacks: jest.fn(),
      generateQuiz: jest.fn(),
      generateCoursePack: jest.fn(),
      generateStory: jest.fn(),
      generateStoryLegacy: jest.fn(),
      evaluateLearning: jest.fn(),
      generateSuggestion: jest.fn(),
    };
    controller = new AiController(service as any);
  });

  // ─── POST /ai/chat ──────────────────────────────────────────────
  describe('chat', () => {
    it('delegates to aiService.chat with viewer info', async () => {
      service.chat!.mockResolvedValue({ reply: 'hello' });
      const body = { message: 'hi', childId: 2, sessionId: 's1' };
      const result = await controller.chat(parentReq as any, body);
      expect(result).toEqual({ reply: 'hello' });
      expect(service.chat).toHaveBeenCalledWith({
        message: 'hi',
        sessionId: 's1',
        viewerId: 1,
        viewerType: 'parent',
        targetChildId: 2,
        context: undefined,
      });
    });

    it('throws ForbiddenException when parent cannot access child', async () => {
      service.canViewerAccessChild!.mockResolvedValue(false);
      const body = { message: 'hi', childId: 99 };
      await expect(controller.chat(parentReq as any, body)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('skips access check for student viewer', async () => {
      service.chat!.mockResolvedValue({ reply: 'ok' });
      const body = { message: 'test' };
      await controller.chat(childReq as any, body);
      expect(service.canViewerAccessChild).not.toHaveBeenCalled();
    });

    it('skips access check when childId is null', async () => {
      service.chat!.mockResolvedValue({ reply: 'ok' });
      const body = { message: 'test', childId: undefined };
      await controller.chat(parentReq as any, body);
      expect(service.canViewerAccessChild).not.toHaveBeenCalled();
    });
  });

  // ─── GET /ai/chat/stream ────────────────────────────────────────
  describe('chatStream', () => {
    function mockRes() {
      return {
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
      } as any;
    }

    it('sets SSE headers and writes token events', async () => {
      const res = mockRes();
      const events = [
        { type: 'token', content: 'Hello' },
        { type: 'done', sessionId: 's1', wasFiltered: false, suggestions: [] },
      ];
      service.chatStream!.mockReturnValue((async function* () {
        for (const e of events) yield e;
      })());

      await controller.chatStream(parentReq as any, 'hi', '2', 's1', res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(res.flushHeaders).toHaveBeenCalled();
      expect(res.write).toHaveBeenCalledWith(
        expect.stringContaining('"content":"Hello"'),
      );
      expect(res.write).toHaveBeenCalledWith(
        expect.stringContaining('"sessionId":"s1"'),
      );
      expect(res.end).toHaveBeenCalled();
    });

    it('writes error event and breaks on error type', async () => {
      const res = mockRes();
      const events = [{ type: 'error', message: 'LLM timeout' }];
      service.chatStream!.mockReturnValue((async function* () {
        for (const e of events) yield e;
      })());

      await controller.chatStream(parentReq as any, 'hi', '', '', res);

      expect(res.write).toHaveBeenCalledWith(
        expect.stringContaining('LLM timeout'),
      );
      expect(res.end).toHaveBeenCalled();
    });

    it('writes SSE error when ForbiddenException is thrown', async () => {
      const res = mockRes();
      service.canViewerAccessChild!.mockResolvedValue(false);
      // chatStream itself doesn't throw — the access check is inside the try block
      // The controller catches ForbiddenException and writes SSE error
      // Actually the controller calls canViewerAccessChild inside the try block
      // Let me trace: the controller sets headers first, then enters try block
      // where it checks access. If access denied, it throws ForbiddenException,
      // which is caught and written as SSE error event.

      // But we need chatStream to not be called — the throw happens before it.
      // Let me set up the mock so canViewerAccessChild returns false.
      // The controller will throw ForbiddenException which is caught.

      await controller.chatStream(parentReq as any, 'hi', '99', '', res);

      expect(res.write).toHaveBeenCalledWith(
        expect.stringContaining('无权访问该学生'),
      );
      expect(res.end).toHaveBeenCalled();
    });

    it('writes generic error for non-ForbiddenException', async () => {
      const res = mockRes();
      service.chatStream!.mockImplementation(() => {
        throw new Error('unexpected');
      });

      await controller.chatStream(parentReq as any, 'hi', '', '', res);

      expect(res.write).toHaveBeenCalledWith(
        expect.stringContaining('AI服务暂时不可用'),
      );
    });

    it('handles thinking and tool events', async () => {
      const res = mockRes();
      const events = [
        { type: 'thinking', thinkingContent: 'let me think' },
        { type: 'tool_start', content: 'starting', toolName: 'quiz', toolArgs: {} },
        { type: 'tool_result', content: 'done', toolName: 'quiz', toolResult: { ok: true } },
        { type: 'game_data', activityType: 'quiz', gameData: { q: 1 }, domain: 'math' },
        { type: 'done', sessionId: 's2', wasFiltered: false, suggestions: [] },
      ];
      service.chatStream!.mockReturnValue((async function* () {
        for (const e of events) yield e;
      })());

      await controller.chatStream(childReq as any, 'play', '', '', res);

      const writes = res.write.mock.calls.map((c: any[]) => c[0]);
      expect(writes.some((w: string) => w.includes('thinking'))).toBe(true);
      expect(writes.some((w: string) => w.includes('tool_start'))).toBe(true);
      expect(writes.some((w: string) => w.includes('tool_result'))).toBe(true);
      expect(writes.some((w: string) => w.includes('game_data'))).toBe(true);
    });

    it('converts childId string to number', async () => {
      const res = mockRes();
      service.chatStream!.mockReturnValue((async function* () {
        yield { type: 'done', sessionId: 's', wasFiltered: false, suggestions: [] };
      })());

      await controller.chatStream(parentReq as any, 'hi', '42', '', res);

      expect(service.canViewerAccessChild).toHaveBeenCalledWith(
        expect.objectContaining({ childId: 42 }),
      );
    });
  });

  // ─── GET /ai/history/sessions ───────────────────────────────────
  describe('getConversationSessions', () => {
    it('delegates with converted childId', async () => {
      service.getConversationSessions!.mockResolvedValue([{ id: 's1' }]);
      const result = await controller.getConversationSessions(
        parentReq as any,
        '5',
        '1',
        '10',
      );
      expect(result).toEqual([{ id: 's1' }]);
      expect(service.getConversationSessions).toHaveBeenCalledWith({
        viewerId: 1,
        viewerType: 'parent',
        childId: 5,
        page: 1,
        limit: 10,
      });
    });

    it('passes undefined for missing page/limit', async () => {
      service.getConversationSessions!.mockResolvedValue([]);
      await controller.getConversationSessions(parentReq as any, '3');
      expect(service.getConversationSessions).toHaveBeenCalledWith(
        expect.objectContaining({ page: undefined, limit: undefined }),
      );
    });

    it('throws ForbiddenException on FORBIDDEN_CHILD_ACCESS', async () => {
      service.getConversationSessions!.mockRejectedValue(
        new Error('FORBIDDEN_CHILD_ACCESS'),
      );
      await expect(
        controller.getConversationSessions(parentReq as any, '99'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rethrows non-access errors', async () => {
      service.getConversationSessions!.mockRejectedValue(new Error('DB error'));
      await expect(
        controller.getConversationSessions(parentReq as any, '1'),
      ).rejects.toThrow('DB error');
    });
  });

  // ─── GET /ai/history/sessions/:sessionId/messages ───────────────
  describe('getConversationSessionMessages', () => {
    it('delegates with sessionId and pagination', async () => {
      service.getConversationSessionMessages!.mockResolvedValue([
        { id: 'm1', content: 'hi' },
      ]);
      const result = await controller.getConversationSessionMessages(
        parentReq as any,
        'sess-1',
        '2',
        '20',
      );
      expect(result).toHaveLength(1);
      expect(service.getConversationSessionMessages).toHaveBeenCalledWith({
        viewerId: 1,
        viewerType: 'parent',
        sessionId: 'sess-1',
        page: 2,
        limit: 20,
      });
    });

    it('throws ForbiddenException on access error', async () => {
      service.getConversationSessionMessages!.mockRejectedValue(
        new Error('FORBIDDEN_CHILD_ACCESS'),
      );
      await expect(
        controller.getConversationSessionMessages(parentReq as any, 's1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── GET /ai/course-packs ───────────────────────────────────────
  describe('getCoursePacks', () => {
    it('delegates with converted childId', async () => {
      service.getCoursePacks!.mockResolvedValue([{ id: 1 }]);
      await controller.getCoursePacks(parentReq as any, '7', '1', '5');
      expect(service.getCoursePacks).toHaveBeenCalledWith({
        viewerId: 1,
        viewerType: 'parent',
        childId: 7,
        page: 1,
        limit: 5,
      });
    });

    it('throws ForbiddenException on access error', async () => {
      service.getCoursePacks!.mockRejectedValue(
        new Error('FORBIDDEN_CHILD_ACCESS'),
      );
      await expect(
        controller.getCoursePacks(parentReq as any, '99'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── GET /ai/course-packs/:id ───────────────────────────────────
  describe('getCoursePackById', () => {
    it('delegates with numeric id', async () => {
      service.getCoursePackById!.mockResolvedValue({ id: 10, title: '数学' });
      const result = await controller.getCoursePackById(parentReq as any, '10');
      expect(result).toEqual({ id: 10, title: '数学' });
      expect(service.getCoursePackById).toHaveBeenCalledWith({
        viewerId: 1,
        viewerType: 'parent',
        id: 10,
      });
    });

    it('throws ForbiddenException on access error', async () => {
      service.getCoursePackById!.mockRejectedValue(
        new Error('FORBIDDEN_CHILD_ACCESS'),
      );
      await expect(
        controller.getCoursePackById(parentReq as any, '1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── GET /ai/course-packs/:id/export ────────────────────────────
  describe('exportCoursePack', () => {
    function mockRes() {
      return {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as any;
    }

    it('sets content headers and sends body', async () => {
      const res = mockRes();
      service.exportCoursePack!.mockResolvedValue({
        mimeType: 'application/json',
        filename: 'test.json',
        body: Buffer.from('{}'),
      });
      await controller.exportCoursePack(
        parentReq as any,
        '5',
        'capcut_json',
        res,
      );
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('test.json'),
      );
      expect(res.send).toHaveBeenCalled();
    });

    it('throws NotFoundException on COURSE_PACK_NOT_FOUND', async () => {
      const res = mockRes();
      service.exportCoursePack!.mockRejectedValue(
        new Error('COURSE_PACK_NOT_FOUND'),
      );
      await expect(
        controller.exportCoursePack(parentReq as any, '999', 'capcut_json', res),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException on NARRATION_AUDIO_UNAVAILABLE', async () => {
      const res = mockRes();
      service.exportCoursePack!.mockRejectedValue(
        new Error('NARRATION_AUDIO_UNAVAILABLE'),
      );
      await expect(
        controller.exportCoursePack(parentReq as any, '1', 'narration_mp3', res),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException on TEACHING_VIDEO_UNAVAILABLE', async () => {
      const res = mockRes();
      service.exportCoursePack!.mockRejectedValue(
        new Error('TEACHING_VIDEO_UNAVAILABLE'),
      );
      await expect(
        controller.exportCoursePack(
          parentReq as any,
          '1',
          'teaching_video_mp4',
          res,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException on access error', async () => {
      const res = mockRes();
      service.exportCoursePack!.mockRejectedValue(
        new Error('FORBIDDEN_CHILD_ACCESS'),
      );
      await expect(
        controller.exportCoursePack(parentReq as any, '1', 'capcut_json', res),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── POST /ai/course-packs/export-batch ─────────────────────────
  describe('exportCoursePacksBatch', () => {
    function mockRes() {
      return { setHeader: jest.fn(), send: jest.fn() } as any;
    }

    it('delegates with ids and formats', async () => {
      const res = mockRes();
      service.exportCoursePacksBatch!.mockResolvedValue({
        mimeType: 'application/zip',
        filename: 'batch.zip',
        body: Buffer.from('zip'),
      });
      await controller.exportCoursePacksBatch(
        parentReq as any,
        { ids: [1, 2, 3], formats: ['capcut_json'] },
        res,
      );
      expect(service.exportCoursePacksBatch).toHaveBeenCalledWith({
        viewerId: 1,
        viewerType: 'parent',
        ids: [1, 2, 3],
        formats: ['capcut_json'],
      });
    });

    it('throws BadRequestException when ids is empty', async () => {
      const res = mockRes();
      await expect(
        controller.exportCoursePacksBatch(parentReq as any, { ids: [] }, res),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when ids is not an array', async () => {
      const res = mockRes();
      await expect(
        controller.exportCoursePacksBatch(
          parentReq as any,
          { ids: null as any },
          res,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException on INVALID_COURSE_PACK_IDS', async () => {
      const res = mockRes();
      service.exportCoursePacksBatch!.mockRejectedValue(
        new Error('INVALID_COURSE_PACK_IDS'),
      );
      await expect(
        controller.exportCoursePacksBatch(
          parentReq as any,
          { ids: [999] },
          res,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException on COURSE_PACK_EXPORT_BATCH_EMPTY', async () => {
      const res = mockRes();
      service.exportCoursePacksBatch!.mockRejectedValue(
        new Error('COURSE_PACK_EXPORT_BATCH_EMPTY'),
      );
      await expect(
        controller.exportCoursePacksBatch(
          parentReq as any,
          { ids: [1] },
          res,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── GET /ai/course-packs/:id/versions ──────────────────────────
  describe('getCoursePackVersions', () => {
    it('delegates with numeric id and pagination', async () => {
      service.getCoursePackVersions!.mockResolvedValue([{ version: 1 }]);
      await controller.getCoursePackVersions(parentReq as any, '3', '1', '10');
      expect(service.getCoursePackVersions).toHaveBeenCalledWith({
        viewerId: 1,
        viewerType: 'parent',
        id: 3,
        page: 1,
        limit: 10,
      });
    });

    it('throws NotFoundException on COURSE_PACK_NOT_FOUND', async () => {
      service.getCoursePackVersions!.mockRejectedValue(
        new Error('COURSE_PACK_NOT_FOUND'),
      );
      await expect(
        controller.getCoursePackVersions(parentReq as any, '999'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException on access error', async () => {
      service.getCoursePackVersions!.mockRejectedValue(
        new Error('FORBIDDEN_CHILD_ACCESS'),
      );
      await expect(
        controller.getCoursePackVersions(parentReq as any, '1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── PATCH /ai/course-packs/:id ─────────────────────────────────
  describe('saveCoursePackVersion', () => {
    it('delegates with all fields', async () => {
      service.saveCoursePackVersion!.mockResolvedValue({ id: 1, version: 2 });
      const body = {
        title: 'Updated',
        planContent: { day1: {} },
        note: 'fixed typo',
        sessionId: 's1',
      };
      await controller.saveCoursePackVersion(parentReq as any, '1', body);
      expect(service.saveCoursePackVersion).toHaveBeenCalledWith({
        viewerId: 1,
        viewerType: 'parent',
        id: 1,
        title: 'Updated',
        planContent: { day1: {} },
        note: 'fixed typo',
        sessionId: 's1',
      });
    });

    it('throws NotFoundException on COURSE_PACK_NOT_FOUND', async () => {
      service.saveCoursePackVersion!.mockRejectedValue(
        new Error('COURSE_PACK_NOT_FOUND'),
      );
      await expect(
        controller.saveCoursePackVersion(parentReq as any, '999', {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── POST /ai/course-packs/:id/enrich-bilingual ─────────────────
  describe('enrichCoursePackBilingual', () => {
    it('delegates with saveAsVersion and overwrite flags', async () => {
      service.enrichCoursePackBilingual!.mockResolvedValue({ id: 1 });
      await controller.enrichCoursePackBilingual(parentReq as any, '5', {
        saveAsVersion: true,
        overwrite: false,
        sessionId: 's1',
      });
      expect(service.enrichCoursePackBilingual).toHaveBeenCalledWith({
        viewerId: 1,
        viewerType: 'parent',
        id: 5,
        saveAsVersion: true,
        overwrite: false,
        sessionId: 's1',
      });
    });

    it('throws NotFoundException on COURSE_PACK_NOT_FOUND', async () => {
      service.enrichCoursePackBilingual!.mockRejectedValue(
        new Error('COURSE_PACK_NOT_FOUND'),
      );
      await expect(
        controller.enrichCoursePackBilingual(parentReq as any, '999', {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── POST /ai/course-packs/generate-weekly ──────────────────────
  describe('generateWeeklyCoursePacks', () => {
    it('delegates with all body fields', async () => {
      service.generateWeeklyCoursePacks!.mockResolvedValue([{ id: 1 }]);
      const body = {
        topic: '动物世界',
        childId: 3,
        ageGroup: '3-4' as const,
        days: 5,
      };
      await controller.generateWeeklyCoursePacks(parentReq as any, body);
      expect(service.generateWeeklyCoursePacks).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: '动物世界',
          childId: 3,
          viewerId: 1,
          viewerType: 'parent',
          days: 5,
        }),
      );
    });

    it('throws BadRequestException on INVALID_WEEKLY_TOPIC', async () => {
      service.generateWeeklyCoursePacks!.mockRejectedValue(
        new Error('INVALID_WEEKLY_TOPIC'),
      );
      await expect(
        controller.generateWeeklyCoursePacks(parentReq as any, {
          topic: '',
          childId: 1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException on INVALID_CHILD_ID', async () => {
      service.generateWeeklyCoursePacks!.mockRejectedValue(
        new Error('INVALID_CHILD_ID'),
      );
      await expect(
        controller.generateWeeklyCoursePacks(parentReq as any, {
          topic: 'test',
          childId: -1,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── POST /ai/quiz ──────────────────────────────────────────────
  describe('generateQuiz', () => {
    it('delegates to aiService.generateQuiz', async () => {
      service.generateQuiz!.mockResolvedValue({ questions: [] });
      const result = await controller.generateQuiz({
        childId: 2,
        topic: '加法',
        count: 5,
      });
      expect(result).toEqual({ questions: [] });
      expect(service.generateQuiz).toHaveBeenCalledWith({
        childId: 2,
        topic: '加法',
        count: 5,
      });
    });
  });

  // ─── POST /ai/course-pack ───────────────────────────────────────
  describe('generateCoursePack', () => {
    it('delegates with viewer info and body', async () => {
      service.generateCoursePack!.mockResolvedValue({ id: 1 });
      await controller.generateCoursePack(parentReq as any, {
        topic: '春天',
        childId: 3,
        ageGroup: '3-4',
      });
      expect(service.generateCoursePack).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: '春天',
          childId: 3,
          viewerId: 1,
          viewerType: 'parent',
        }),
      );
    });

    it('throws ForbiddenException on access error', async () => {
      service.generateCoursePack!.mockRejectedValue(
        new Error('FORBIDDEN_CHILD_ACCESS'),
      );
      await expect(
        controller.generateCoursePack(parentReq as any, {
          topic: 'test',
          childId: 99,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── POST /ai/story ─────────────────────────────────────────────
  describe('generateStory', () => {
    it('delegates to aiService.generateStory', async () => {
      service.generateStory!.mockResolvedValue({ story: 'once upon' });
      const result = await controller.generateStory({
        childId: 2,
        theme: '友谊',
      });
      expect(result).toEqual({ story: 'once upon' });
      expect(service.generateStory).toHaveBeenCalledWith({
        childId: 2,
        theme: '友谊',
      });
    });
  });

  // ─── POST /ai/generate-story (legacy) ───────────────────────────
  describe('generateStoryLegacy', () => {
    it('delegates topic and age', async () => {
      service.generateStoryLegacy!.mockResolvedValue({ text: 'story' });
      const result = await controller.generateStoryLegacy({
        topic: '小猫',
        age: 4,
      });
      expect(result).toEqual({ text: 'story' });
      expect(service.generateStoryLegacy).toHaveBeenCalledWith('小猫', 4);
    });
  });

  // ─── POST /ai/evaluate ──────────────────────────────────────────
  describe('evaluate', () => {
    it('delegates contentId, answers, age', async () => {
      service.evaluateLearning!.mockResolvedValue({ score: 80 });
      const result = await controller.evaluate({
        contentId: 10,
        answers: [1, 2, 3],
        age: 5,
      });
      expect(result).toEqual({ score: 80 });
      expect(service.evaluateLearning).toHaveBeenCalledWith(10, [1, 2, 3], 5);
    });
  });

  // ─── POST /ai/suggestion ────────────────────────────────────────
  describe('suggestion', () => {
    it('delegates abilities and age', async () => {
      service.generateSuggestion!.mockResolvedValue({ tips: [] });
      const abilities = { math: 80, language: 60 };
      await controller.suggestion({ abilities, age: 4 });
      expect(service.generateSuggestion).toHaveBeenCalledWith(abilities, 4);
    });
  });

  // ─── GET /ai/suggest ────────────────────────────────────────────
  describe('getSuggestion', () => {
    it('maps 3-4 ageRange to age 4', async () => {
      service.generateSuggestion!.mockResolvedValue({ tips: [] });
      await controller.getSuggestion('3-4');
      expect(service.generateSuggestion).toHaveBeenCalledWith(null, 4);
    });

    it('maps 5-6 ageRange to age 6', async () => {
      service.generateSuggestion!.mockResolvedValue({ tips: [] });
      await controller.getSuggestion('5-6');
      expect(service.generateSuggestion).toHaveBeenCalledWith(null, 6);
    });

    it('defaults to age 5 when ageRange is undefined', async () => {
      service.generateSuggestion!.mockResolvedValue({ tips: [] });
      await controller.getSuggestion(undefined);
      expect(service.generateSuggestion).toHaveBeenCalledWith(null, 5);
    });
  });
});
