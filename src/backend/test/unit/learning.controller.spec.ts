import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LearningController } from '../../src/modules/learning/learning.controller';
import { LearningService } from '../../src/modules/learning/learning.service';
import { LearningTrackerService } from '../../src/modules/learning/learning-tracker.service';
import { LearningArchiveService } from '../../src/modules/learning/learning-archive.service';
import { LessonContentService } from '../../src/modules/learning/lesson-content.service';
import { LessonVideoQueueService } from '../../src/modules/learning/lesson-video-queue.service';
import { UsersService } from '../../src/modules/users/users.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Content } from '../../src/database/entities/content.entity';
import { VideoGenerationTask } from '../../src/database/entities/video-generation-task.entity';

describe('LearningController', () => {
  let controller: LearningController;

  const learningService = {
    create: jest.fn(),
    update: jest.fn(),
    findById: jest.fn(),
    findByUser: jest.fn(),
    getTodayStats: jest.fn(),
    getTodayStatsWithSources: jest.fn(),
  };

  const learningTracker = {
    recordActivity: jest.fn(),
  };

  const learningArchive = {
    getLearningPoints: jest.fn(),
    getWrongQuestions: jest.fn(),
    getStudyPlans: jest.fn(),
  };

  const lessonContent = {
    listDraftLessonsForChild: jest.fn(),
    generateDraft: jest.fn(),
    saveDraftDirectly: jest.fn(),
    updateDraftDirectly: jest.fn(),
    modifyDraft: jest.fn(),
    confirmAndPublish: jest.fn(),
    getLessonProgress: jest.fn(),
    completeStep: jest.fn(),
  };

  const lessonVideoQueue = {
    enqueue: jest.fn(),
    getTask: jest.fn(),
    getLatestTask: jest.fn(),
    readVideoBuffer: jest.fn(),
  };

  const usersService = {
    findById: jest.fn(),
    canAccessChild: jest.fn(),
  };

  const contentRepo = {
    findOne: jest.fn(),
  };

  const videoTaskRepo = {
    save: jest.fn(),
  };

  const createChildReq = (id = 2) => ({ user: { sub: id, type: 'child' } });
  const createParentReq = (id = 1) => ({ user: { sub: id, type: 'parent' } });

  beforeEach(() => {
    jest.resetAllMocks();

    controller = new LearningController(
      learningService as any,
      learningTracker as any,
      learningArchive as any,
      lessonContent as any,
      lessonVideoQueue as any,
      usersService as any,
      contentRepo as any,
      videoTaskRepo as any,
    );
  });

  // ─── Access Control ───────────────────────────────────────────────────

  describe('access control — assertAccessToChild', () => {
    it('allows child to access own data', async () => {
      learningService.create.mockResolvedValue({ id: 1 });

      // Should not throw
      await expect(
        controller.start(createChildReq(2), { childId: 2, contentId: 1 }),
      ).resolves.toBeDefined();
    });

    it('blocks child from accessing another child data', async () => {
      // Child 2 trying to start learning for child 3
      await expect(
        controller.start(createChildReq(2), { childId: 3, contentId: 1 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows parent to access linked child data', async () => {
      usersService.findById.mockResolvedValue({ id: 3, parentId: 1 });
      learningService.create.mockResolvedValue({ id: 1 });

      await expect(
        controller.start(createParentReq(1), { childId: 3, contentId: 1 }),
      ).resolves.toBeDefined();
    });

    it('blocks parent from accessing non-linked child data', async () => {
      usersService.findById.mockResolvedValue(null); // child not found → no link

      await expect(
        controller.start(createParentReq(1), { childId: 99, contentId: 1 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('blocks parent when child belongs to different parent', async () => {
      usersService.findById.mockResolvedValue({ id: 3, parentId: 99 }); // different parent

      await expect(
        controller.start(createParentReq(1), { childId: 3, contentId: 1 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ─── POST /learning/start ────────────────────────────────────────────

  describe('POST start', () => {
    it('creates learning session and returns record', async () => {
      const record = { id: 1, userId: 2, contentId: 1, status: 'in_progress' };
      learningService.create.mockResolvedValue(record);

      const result = await controller.start(createChildReq(2), {
        childId: 2,
        contentId: 1,
      });

      expect(result).toEqual(record);
      expect(learningService.create).toHaveBeenCalledWith(2, 1);
    });

    it('throws ForbiddenException for unauthorized access', async () => {
      await expect(
        controller.start(createParentReq(1), { childId: 2, contentId: 1 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ─── POST /learning/complete/:id ────────────────────────────────────

  describe('POST complete', () => {
    const learningRecord = {
      id: 10,
      userId: 2,
      contentId: 1,
      startedAt: new Date(Date.now() - 60000),
      status: 'in_progress',
    };

    beforeEach(() => {
      learningService.findById.mockResolvedValue(learningRecord);
      contentRepo.findOne.mockResolvedValue({
        id: 1,
        domain: 'language',
      });
    });

    it('completes a learning session', async () => {
      const updated = { ...learningRecord, status: 'completed', score: 90 };
      learningService.update.mockResolvedValue(updated);
      learningTracker.recordActivity.mockResolvedValue({
        learningRecord: updated,
        abilityUpdated: true,
        achievementsAwarded: [],
      });

      const result = await controller.complete(createChildReq(2), '10', {
        score: 90,
        durationSeconds: 60,
      });

      expect(result).toEqual(updated);
      expect(learningService.update).toHaveBeenCalledWith(
        10,
        expect.objectContaining({ status: 'completed', score: 90 }),
      );
    });

    it('tracks activity with content domain after completion', async () => {
      const updated = { ...learningRecord, status: 'completed', score: 85, durationSeconds: 62 };
      learningService.update.mockResolvedValue(updated);
      learningTracker.recordActivity.mockResolvedValue({
        learningRecord: updated,
        abilityUpdated: true,
        achievementsAwarded: [],
      });

      await controller.complete(createChildReq(2), '10', { score: 85 });

      expect(learningTracker.recordActivity).toHaveBeenCalledWith({
        type: 'content_completion',
        childId: 2,
        contentId: 1,
        domain: 'language',
        score: 85,
        durationSeconds: 62,
      });
    });

    it('returns null when record not found', async () => {
      learningService.findById.mockResolvedValue(null);

      const result = await controller.complete(createChildReq(2), '999', {
        score: 90,
      });

      expect(result).toBeNull();
    });

    it('blocks completing another child record', async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(
        controller.complete(createParentReq(1), '10', { score: 90 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('passes answers and interactionData to update', async () => {
      const updated = { ...learningRecord, status: 'completed', score: 80 };
      learningService.update.mockResolvedValue(updated);
      learningTracker.recordActivity.mockResolvedValue({
        learningRecord: updated,
        abilityUpdated: false,
        achievementsAwarded: [],
      });

      const answers = [{ question: 'q1', answer: 'a1' }];
      const interactionData = { mode: 'practice' };

      await controller.complete(createChildReq(2), '10', {
        score: 80,
        answers,
        interactionData,
      });

      expect(learningService.update).toHaveBeenCalledWith(
        10,
        expect.objectContaining({
          answers,
          interactionData,
        }),
      );
    });

    it('survives tracker failure gracefully', async () => {
      const updated = { ...learningRecord, status: 'completed', score: 90 };
      learningService.update.mockResolvedValue(updated);
      learningTracker.recordActivity.mockRejectedValue(new Error('Tracker down'));

      // Should still return the updated record
      const result = await controller.complete(createChildReq(2), '10', {
        score: 90,
      });

      expect(result).toEqual(updated);
    });
  });

  // ─── POST /learning/record-activity ─────────────────────────────────

  describe('POST record-activity', () => {
    it('records interactive activity', async () => {
      learningTracker.recordActivity.mockResolvedValue({
        learningRecord: { id: 99 },
        abilityUpdated: true,
        achievementsAwarded: ['star_collector'],
      });

      const result = await controller.recordActivity(createChildReq(2), {
        childId: 2,
        domain: 'math',
        score: 80,
        durationSeconds: 300,
        sessionId: 'sess-1',
        activityType: 'quiz',
      });

      expect(result.success).toBe(true);
      expect(result.recordId).toBe(99);
      expect(result.achievementsAwarded).toEqual(['star_collector']);
      expect(learningTracker.recordActivity).toHaveBeenCalledWith({
        type: 'interactive_activity',
        childId: 2,
        domain: 'math',
        score: 80,
        durationSeconds: 300,
        sessionId: 'sess-1',
        activityType: 'quiz',
        interactionData: undefined,
        reviewItems: undefined,
        topic: undefined,
      });
    });

    it('passes reviewItems from body', async () => {
      learningTracker.recordActivity.mockResolvedValue({
        learningRecord: { id: 100 },
        abilityUpdated: false,
        achievementsAwarded: [],
      });

      const reviewItems = [{ question: '1+1', answer: '2', correct: true }];
      await controller.recordActivity(createChildReq(2), {
        childId: 2,
        score: 100,
        reviewItems,
      });

      expect(learningTracker.recordActivity).toHaveBeenCalledWith(
        expect.objectContaining({ reviewItems }),
      );
    });

    it('extracts reviewItems from interactionData when not on body', async () => {
      learningTracker.recordActivity.mockResolvedValue({
        learningRecord: { id: 100 },
        abilityUpdated: false,
        achievementsAwarded: [],
      });

      const reviewItems = [{ question: '2+2', answer: '4', correct: true }];
      await controller.recordActivity(createChildReq(2), {
        childId: 2,
        score: 100,
        interactionData: { reviewItems },
      });

      expect(learningTracker.recordActivity).toHaveBeenCalledWith(
        expect.objectContaining({ reviewItems }),
      );
    });

    it('accepts interactionData.reviewData as reviewItems fallback', async () => {
      learningTracker.recordActivity.mockResolvedValue({
        learningRecord: { id: 100 },
        abilityUpdated: false,
        achievementsAwarded: [],
      });

      const reviewData = [{ question: 'Q', answer: 'A', correct: false }];
      await controller.recordActivity(createChildReq(2), {
        childId: 2,
        score: 50,
        interactionData: { reviewData },
      });

      expect(learningTracker.recordActivity).toHaveBeenCalledWith(
        expect.objectContaining({ reviewItems: reviewData }),
      );
    });

    it('blocks unauthorized access for record-activity', async () => {
      await expect(
        controller.recordActivity(createParentReq(1), {
          childId: 2,
          score: 50,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ─── GET /learning/history/:userId ──────────────────────────────────

  describe('GET history/:userId', () => {
    it('returns learning history for child', async () => {
      const records = [
        { id: 1, userId: 2, contentId: 1 },
        { id: 2, userId: 2, contentId: 2 },
      ];
      learningService.findByUser.mockResolvedValue(records);

      const result = await controller.history(createChildReq(2), '2');

      expect(result).toEqual(records);
      expect(learningService.findByUser).toHaveBeenCalledWith(2, 10);
    });

    it('respects custom limit', async () => {
      learningService.findByUser.mockResolvedValue([]);

      await controller.history(createChildReq(2), '2', '5');

      expect(learningService.findByUser).toHaveBeenCalledWith(2, 5);
    });

    it('blocks parent from viewing non-linked child history', async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(
        controller.history(createParentReq(1), '99'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ─── GET /learning/today/:userId ────────────────────────────────────

  describe('GET today/:userId', () => {
    it('returns today stats', async () => {
      const stats = { totalMinutes: 30, completedCount: 3, recordsCount: 5 };
      learningService.getTodayStats.mockResolvedValue(stats);

      const result = await controller.today(createChildReq(2), '2');

      expect(result).toEqual(stats);
      expect(learningService.getTodayStats).toHaveBeenCalledWith(2);
    });

    it('returns today detail with sources', async () => {
      const stats = {
        totalMinutes: 30,
        completedCount: 3,
        recordsCount: 5,
        sources: { content: 2, assignment: 1, activity: 0, unknown: 0 },
      };
      learningService.getTodayStatsWithSources.mockResolvedValue(stats);

      const result = await controller.todayDetail(createChildReq(2), '2');

      expect(result).toEqual(stats);
      expect(learningService.getTodayStatsWithSources).toHaveBeenCalledWith(2);
    });
  });

  // ─── GET /learning/points/:childId ─────────────────────────────────

  describe('GET points/:childId', () => {
    it('returns learning points with pagination', async () => {
      const points = { list: [{ id: 1, points: 10 }], total: 1 };
      learningArchive.getLearningPoints.mockResolvedValue(points);
      usersService.findById.mockResolvedValue({ id: 2, parentId: 1 });

      const result = await controller.getLearningPoints(
        createParentReq(1),
        '2',
        'language',
        'available',
        undefined,
        undefined,
        '1',
        '10',
      );

      expect(result).toEqual(points);
      expect(learningArchive.getLearningPoints).toHaveBeenCalledWith({
        childId: 2,
        domain: 'language',
        status: 'available',
        from: undefined,
        to: undefined,
        page: 1,
        limit: 10,
      });
    });
  });

  // ─── GET /learning/wrong-questions/:childId ────────────────────────

  describe('GET wrong-questions/:childId', () => {
    it('returns wrong questions list', async () => {
      const questions = { list: [{ id: 1, question: 'Q1' }], total: 1 };
      learningArchive.getWrongQuestions.mockResolvedValue(questions);
      usersService.findById.mockResolvedValue({ id: 2, parentId: 1 });

      const result = await controller.getWrongQuestions(
        createParentReq(1),
        '2',
      );

      expect(result).toEqual(questions);
      expect(learningArchive.getWrongQuestions).toHaveBeenCalledWith({
        childId: 2,
        domain: undefined,
        status: undefined,
        page: undefined,
        limit: undefined,
      });
    });

    it('passes filter params', async () => {
      learningArchive.getWrongQuestions.mockResolvedValue({ list: [], total: 0 });
      usersService.findById.mockResolvedValue({ id: 2, parentId: 1 });

      await controller.getWrongQuestions(
        createParentReq(1),
        '2',
        'math',
        'unresolved',
        '1',
        '20',
      );

      expect(learningArchive.getWrongQuestions).toHaveBeenCalledWith({
        childId: 2,
        domain: 'math',
        status: 'unresolved',
        page: 1,
        limit: 20,
      });
    });
  });

  // ─── Lesson Management — Access Control ────────────────────────────

  describe('lesson access control (parent-only)', () => {
    it('blocks child from viewing draft lessons', async () => {
      await expect(
        controller.getDraftLessons(createChildReq(2), '2'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('blocks child from generating lessons', async () => {
      await expect(
        controller.generateLesson(createChildReq(2), {
          topic: '太阳系',
          childId: 2,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('blocks child from creating draft', async () => {
      await expect(
        controller.createDraft(createChildReq(2), {
          childId: 2,
          title: '测试',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns draft lessons for parent', async () => {
      const drafts = [{ id: 1, title: '太阳系', status: 'draft' }];
      lessonContent.listDraftLessonsForChild.mockResolvedValue(drafts);
      usersService.findById.mockResolvedValue({ id: 2, parentId: 1 });

      const result = await controller.getDraftLessons(
        createParentReq(1),
        '2',
      );

      expect(result).toEqual(drafts);
      expect(lessonContent.listDraftLessonsForChild).toHaveBeenCalledWith(2);
    });

    it('rejects draft lessons without valid childId', async () => {
      await expect(
        controller.getDraftLessons(createParentReq(1), '0'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ─── Lesson Generation ─────────────────────────────────────────────

  describe('POST lessons/generate', () => {
    it('generates lesson draft for parent', async () => {
      const draft = { id: 5, title: '太阳系', status: 'draft' };
      lessonContent.generateDraft.mockResolvedValue(draft);
      usersService.findById.mockResolvedValue({ id: 2, parentId: 1 });

      const result = await controller.generateLesson(createParentReq(1), {
        topic: '太阳系',
        childId: 2,
        difficulty: 3,
        ageGroup: '5-6',
      });

      expect(result).toEqual(draft);
      expect(lessonContent.generateDraft).toHaveBeenCalledWith({
        topic: '太阳系',
        childId: 2,
        difficulty: 3,
        ageGroup: '5-6',
        parentId: 1,
      });
    });
  });

  // ─── POST lessons/draft ────────────────────────────────────────────

  describe('POST lessons/draft', () => {
    it('saves draft directly', async () => {
      const draft = { id: 6, title: '测试课程' };
      lessonContent.saveDraftDirectly.mockResolvedValue(draft);
      usersService.findById.mockResolvedValue({ id: 2, parentId: 1 });

      const result = await controller.createDraft(createParentReq(1), {
        childId: 2,
        title: '测试课程',
        domain: 'science',
      });

      expect(result).toEqual(draft);
      expect(lessonContent.saveDraftDirectly).toHaveBeenCalledWith(
        expect.objectContaining({ title: '测试课程', childId: 2, parentId: 1 }),
      );
    });

    it('rejects empty title', async () => {
      usersService.findById.mockResolvedValue({ id: 2, parentId: 1 });

      await expect(
        controller.createDraft(createParentReq(1), {
          childId: 2,
          title: '   ',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ─── Complete Step ─────────────────────────────────────────────────

  describe('POST lessons/:id/complete-step', () => {
    it('completes a lesson step', async () => {
      const result = { progress: 50 };
      lessonContent.completeStep.mockResolvedValue(result);
      usersService.findById.mockResolvedValue({ id: 2, parentId: 1 });

      const response = await controller.completeLessonStep(
        createParentReq(1),
        '5',
        {
          childId: 2,
          stepId: 'step-1',
          score: 90,
        },
      );

      expect(response).toEqual(result);
      expect(lessonContent.completeStep).toHaveBeenCalledWith({
        contentId: 5,
        childId: 2,
        stepId: 'step-1',
        score: 90,
        durationSeconds: undefined,
        interactionData: undefined,
      });
    });
  });

  // ─── Study Plans ───────────────────────────────────────────────────

  describe('GET plans/:childId', () => {
    it('returns study plans', async () => {
      const plans = { list: [{ id: 1, title: '计划1' }], total: 1 };
      learningArchive.getStudyPlans.mockResolvedValue(plans);
      usersService.findById.mockResolvedValue({ id: 2, parentId: 1 });

      const result = await controller.getStudyPlans(
        createParentReq(1),
        '2',
      );

      expect(result).toEqual(plans);
      expect(learningArchive.getStudyPlans).toHaveBeenCalledWith({
        childId: 2,
        sourceType: undefined,
        page: undefined,
        limit: undefined,
      });
    });

    it('passes filter params to study plans', async () => {
      learningArchive.getStudyPlans.mockResolvedValue({ list: [], total: 0 });
      usersService.findById.mockResolvedValue({ id: 2, parentId: 1 });

      await controller.getStudyPlans(createParentReq(1), '2', 'ai', '2', '5');

      expect(learningArchive.getStudyPlans).toHaveBeenCalledWith({
        childId: 2,
        sourceType: 'ai',
        page: 2,
        limit: 5,
      });
    });
  });
});