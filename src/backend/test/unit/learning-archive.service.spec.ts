import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LearningArchiveService } from '../../src/modules/learning/learning-archive.service';
import { LearningPoint } from '../../src/database/entities/learning-point.entity';
import { WrongQuestion } from '../../src/database/entities/wrong-question.entity';
import { StudyPlanRecord } from '../../src/database/entities/study-plan-record.entity';

describe('LearningArchiveService', () => {
  let service: LearningArchiveService;
  let pointRepo: any;
  let wrongRepo: any;
  let planRepo: any;

  beforeEach(async () => {
    pointRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((v: any) => v),
      save: jest.fn().mockImplementation(async (v: any) => ({ id: v.id || 1, ...v })),
      find: jest.fn().mockResolvedValue([]),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    wrongRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((v: any) => v),
      save: jest.fn().mockImplementation(async (v: any) => ({ id: v.id || 1, ...v })),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    planRepo = {
      create: jest.fn((v: any) => v),
      save: jest.fn().mockImplementation(async (v: any) => ({ id: v.id || 1, ...v })),
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LearningArchiveService,
        { provide: getRepositoryToken(LearningPoint), useValue: pointRepo },
        { provide: getRepositoryToken(WrongQuestion), useValue: wrongRepo },
        { provide: getRepositoryToken(StudyPlanRecord), useValue: planRepo },
      ],
    }).compile();

    service = module.get<LearningArchiveService>(LearningArchiveService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── normalizePointKey ───────────────────────────────────────────────

  describe('normalizePointKey', () => {
    it('lowercases and strips non-alphanumeric/CJK chars', () => {
      expect((service as any).normalizePointKey('Math Addition!')).toBe('math-addition');
    });

    it('preserves Chinese characters', () => {
      expect((service as any).normalizePointKey('加法练习')).toBe('加法练习');
    });

    it('returns "unknown-topic" for empty/whitespace input', () => {
      expect((service as any).normalizePointKey('')).toBe('unknown-topic');
      expect((service as any).normalizePointKey('   ')).toBe('unknown-topic');
      expect((service as any).normalizePointKey(null)).toBe('unknown-topic');
    });

    it('trims leading/trailing hyphens', () => {
      expect((service as any).normalizePointKey('--hello--')).toBe('hello');
    });
  });

  // ─── upsertLearningPoint ─────────────────────────────────────────────

  describe('upsertLearningPoint', () => {
    it('creates a new point when none exists', async () => {
      pointRepo.findOne.mockResolvedValue(null);

      await service.upsertLearningPoint({
        childId: 9,
        pointLabel: 'Math Addition',
        source: 'chat_summary',
      });

      expect(pointRepo.create).toHaveBeenCalledTimes(1);
      expect(pointRepo.save).toHaveBeenCalledTimes(1);
      const created = pointRepo.create.mock.calls[0][0];
      expect(created.childId).toBe(9);
      expect(created.pointKey).toBe('math-addition');
      expect(created.source).toBe('chat_summary');
      expect(created.cooldownUntil).toBeInstanceOf(Date);
    });

    it('updates existing point when found', async () => {
      const existing = {
        id: 11,
        childId: 9,
        pointKey: 'math-addition',
        pointLabel: '旧标签',
        source: 'activity',
        lastLearnedAt: new Date('2020-01-01'),
        cooldownUntil: new Date('2020-02-01'),
        sessionId: 'old-session',
        domain: 'math',
        evidence: { old: true },
      };
      pointRepo.findOne.mockResolvedValue(existing);

      await service.upsertLearningPoint({
        childId: 9,
        pointLabel: 'Math Addition',
        source: 'chat_summary',
        domain: 'math',
        evidence: { new: true },
      });

      expect(pointRepo.create).not.toHaveBeenCalled();
      expect(pointRepo.save).toHaveBeenCalledTimes(1);
      expect(existing.pointLabel).toBe('Math Addition');
      expect(existing.source).toBe('chat_summary');
      expect(existing.evidence).toEqual({ new: true });
    });

    it('skips when pointLabel is empty', async () => {
      await service.upsertLearningPoint({
        childId: 1,
        pointLabel: '',
        source: 'activity',
      });

      expect(pointRepo.save).not.toHaveBeenCalled();
    });

    it('truncates pointLabel to 255 chars', async () => {
      pointRepo.findOne.mockResolvedValue(null);
      const longLabel = 'a'.repeat(300);

      await service.upsertLearningPoint({
        childId: 1,
        pointLabel: longLabel,
        source: 'activity',
      });

      const created = pointRepo.create.mock.calls[0][0];
      expect(created.pointLabel.length).toBe(255);
    });
  });

  // ─── recordChatTurnSummary ───────────────────────────────────────────

  describe('recordChatTurnSummary', () => {
    it('extracts learning points and infers domain from math content', async () => {
      pointRepo.findOne.mockResolvedValue(null);

      await service.recordChatTurnSummary({
        childId: 1,
        userMessage: '教我数学',
        assistantReply: '数字加法很重要。我们来练习加减法。',
      });

      // Should have called save for each extracted learning point
      expect(pointRepo.save.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    it('creates study plan when reply is plan-like', async () => {
      pointRepo.findOne.mockResolvedValue(null);

      await service.recordChatTurnSummary({
        childId: 1,
        userMessage: '帮我安排学习计划',
        assistantReply: '1. 今天学习加法\n2. 明天复习减法\n3. 本周完成练习',
      });

      expect(planRepo.create).toHaveBeenCalledTimes(1);
      const plan = planRepo.create.mock.calls[0][0];
      expect(plan.sourceType).toBe('ai_generated');
      expect(plan.status).toBe('active');
    });

    it('does not create plan when reply lacks structure', async () => {
      pointRepo.findOne.mockResolvedValue(null);

      await service.recordChatTurnSummary({
        childId: 1,
        userMessage: '你好',
        assistantReply: '你好呀，今天想学什么呢？',
      });

      expect(planRepo.create).not.toHaveBeenCalled();
    });

    it('handles errors gracefully without throwing', async () => {
      pointRepo.findOne.mockRejectedValue(new Error('DB down'));

      // Should not throw
      await expect(
        service.recordChatTurnSummary({
          childId: 1,
          userMessage: 'test',
          assistantReply: 'reply',
        }),
      ).resolves.toBeUndefined();
    });
  });

  // ─── recordActivityLearning ──────────────────────────────────────────

  describe('recordActivityLearning', () => {
    it('delegates to upsertLearningPoint with activity source', async () => {
      pointRepo.findOne.mockResolvedValue(null);

      await service.recordActivityLearning({
        childId: 5,
        domain: 'science',
        topic: '植物生长观察',
        activityType: 'observation',
      });

      expect(pointRepo.create).toHaveBeenCalledTimes(1);
      const created = pointRepo.create.mock.calls[0][0];
      expect(created.source).toBe('activity');
      expect(created.domain).toBe('science');
    });

    it('skips when topic is empty', async () => {
      await service.recordActivityLearning({
        childId: 5,
        topic: '',
      });

      expect(pointRepo.save).not.toHaveBeenCalled();
    });

    it('skips when topic is undefined', async () => {
      await service.recordActivityLearning({
        childId: 5,
      });

      expect(pointRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─── recordWrongQuestions ────────────────────────────────────────────

  describe('recordWrongQuestions', () => {
    it('stores only wrong items into wrong question book', async () => {
      wrongRepo.findOne.mockResolvedValue(null);

      await service.recordWrongQuestions({
        childId: 2,
        domain: 'math',
        reviewItems: [
          { question: '1+1=?', userAnswer: '3', correctAnswer: '2', isCorrect: false },
          { question: '2+2=?', userAnswer: '4', correctAnswer: '4', isCorrect: true },
        ],
      });

      expect(wrongRepo.create).toHaveBeenCalledTimes(1);
      expect(wrongRepo.save).toHaveBeenCalledTimes(1);
    });

    it('updates existing wrong question by hash', async () => {
      const existing = {
        id: 5,
        childId: 2,
        questionHash: 'some-hash',
        questionText: '1+1=?',
        userAnswer: '2',
        correctAnswer: '2',
        status: 'reviewed',
      };
      wrongRepo.findOne.mockResolvedValue(existing);

      await service.recordWrongQuestions({
        childId: 2,
        domain: 'math',
        reviewItems: [{ question: '1+1=?', userAnswer: '3', correctAnswer: '2', isCorrect: false }],
      });

      expect(wrongRepo.create).not.toHaveBeenCalled();
      expect(wrongRepo.save).toHaveBeenCalledTimes(1);
      expect(existing.status).toBe('new');
      expect(existing.userAnswer).toBe('3');
    });

    it('skips when reviewItems is empty', async () => {
      await service.recordWrongQuestions({
        childId: 2,
        reviewItems: [],
      });

      expect(wrongRepo.save).not.toHaveBeenCalled();
    });

    it('skips items where isCorrect is true', async () => {
      await service.recordWrongQuestions({
        childId: 2,
        reviewItems: [{ question: '2+2=?', userAnswer: '4', correctAnswer: '4', isCorrect: true }],
      });

      expect(wrongRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─── createStudyPlanRecord ───────────────────────────────────────────

  describe('createStudyPlanRecord', () => {
    it('creates and saves a study plan', async () => {
      const result = await service.createStudyPlanRecord({
        childId: 3,
        sourceType: 'ai_generated',
        title: '每日数学练习',
        status: 'active',
      });

      expect(planRepo.create).toHaveBeenCalledTimes(1);
      expect(planRepo.save).toHaveBeenCalledTimes(1);
      const created = planRepo.create.mock.calls[0][0];
      expect(created.childId).toBe(3);
      expect(created.title).toBe('每日数学练习');
      expect(created.status).toBe('active');
      expect(result).toBeDefined();
    });

    it('defaults title to 学习计划 when empty', async () => {
      await service.createStudyPlanRecord({
        childId: 3,
        sourceType: 'parent_assignment',
        title: '',
      });

      const created = planRepo.create.mock.calls[0][0];
      expect(created.title).toBe('学习计划');
    });

    it('truncates title to 180 chars', async () => {
      const longTitle = 'b'.repeat(200);
      await service.createStudyPlanRecord({
        childId: 3,
        sourceType: 'ai_course_pack',
        title: longTitle,
      });

      const created = planRepo.create.mock.calls[0][0];
      expect(created.title.length).toBe(180);
    });
  });

  // ─── getStudyPlanById ────────────────────────────────────────────────

  describe('getStudyPlanById', () => {
    it('returns plan when found', async () => {
      const plan = { id: 42, title: 'test' };
      planRepo.findOne.mockResolvedValue(plan);

      const result = await service.getStudyPlanById(42);
      expect(result).toEqual(plan);
      expect(planRepo.findOne).toHaveBeenCalledWith({ where: { id: 42 } });
    });

    it('returns null when not found', async () => {
      planRepo.findOne.mockResolvedValue(null);
      const result = await service.getStudyPlanById(999);
      expect(result).toBeNull();
    });
  });

  // ─── getStudyPlansByIds ──────────────────────────────────────────────

  describe('getStudyPlansByIds', () => {
    it('deduplicates and filters invalid ids', async () => {
      await service.getStudyPlansByIds([1, 1, -1, 0, NaN, 2]);

      expect(planRepo.find).toHaveBeenCalledTimes(1);
    });

    it('returns empty array for empty input', async () => {
      const result = await service.getStudyPlansByIds([]);
      expect(result).toEqual([]);
      expect(planRepo.find).not.toHaveBeenCalled();
    });

    it('returns empty array for null/undefined input', async () => {
      const result = await service.getStudyPlansByIds(null as any);
      expect(result).toEqual([]);
    });
  });

  // ─── updateStudyPlanRecord ───────────────────────────────────────────

  describe('updateStudyPlanRecord', () => {
    it('returns null when plan not found', async () => {
      planRepo.findOne.mockResolvedValue(null);

      const result = await service.updateStudyPlanRecord(999, { title: 'new' });
      expect(result).toBeNull();
    });

    it('patches only provided fields', async () => {
      const plan = {
        id: 1,
        title: 'old',
        status: 'active',
        planContent: { a: 1 },
        sourceId: null,
        sessionId: null,
        parentId: null,
      };
      planRepo.findOne.mockResolvedValue(plan);

      await service.updateStudyPlanRecord(1, { status: 'completed' });

      expect(plan.status).toBe('completed');
      expect(plan.title).toBe('old'); // unchanged
      expect(planRepo.save).toHaveBeenCalledTimes(1);
    });

    it('updates title with truncation', async () => {
      const plan = { id: 1, title: 'old', status: 'active' };
      planRepo.findOne.mockResolvedValue(plan);

      await service.updateStudyPlanRecord(1, { title: 'c'.repeat(200) });
      expect(plan.title.length).toBe(180);
    });
  });

  // ─── getStudyPlanVersions ────────────────────────────────────────────

  describe('getStudyPlanVersions', () => {
    it('builds query with pagination', async () => {
      const qb = planRepo.createQueryBuilder();
      qb.getManyAndCount.mockResolvedValue([[{ id: 1 }], 1]);

      const result = await service.getStudyPlanVersions({
        childId: 1,
        sourceType: 'ai_generated',
        rootSourceId: 10,
        page: 2,
        limit: 10,
      });

      expect(planRepo.createQueryBuilder).toHaveBeenCalledWith('plan');
      expect(result).toEqual({ list: [{ id: 1 }], total: 1, page: 2, limit: 10 });
    });

    it('clamps page to minimum 1', async () => {
      await service.getStudyPlanVersions({
        childId: 1,
        sourceType: 'ai_generated',
        rootSourceId: 10,
        page: 0,
      });

      // skip should be called with 0 (page 1 → skip 0)
      const qb = planRepo.createQueryBuilder();
      expect(qb.skip).toHaveBeenCalledWith(0);
    });

    it('clamps limit to max 100', async () => {
      await service.getStudyPlanVersions({
        childId: 1,
        sourceType: 'ai_generated',
        rootSourceId: 10,
        limit: 500,
      });

      const qb = planRepo.createQueryBuilder();
      expect(qb.take).toHaveBeenCalledWith(100);
    });
  });

  // ─── getLearningPoints ───────────────────────────────────────────────

  describe('getLearningPoints', () => {
    it('returns paginated results', async () => {
      pointRepo.findAndCount.mockResolvedValue([[{ id: 1 }], 1]);

      const result = await service.getLearningPoints({ childId: 1, page: 1, limit: 20 });

      expect(result).toEqual({ list: [{ id: 1 }], total: 1, page: 1, limit: 20 });
    });

    it('clamps limit to max 50', async () => {
      pointRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.getLearningPoints({ childId: 1, limit: 100 });

      const call = pointRepo.findAndCount.mock.calls[0][0];
      expect(call.take).toBe(50);
    });

    it('adds domain filter when provided', async () => {
      pointRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.getLearningPoints({ childId: 1, domain: 'math' });

      const call = pointRepo.findAndCount.mock.calls[0][0];
      expect(call.where.domain).toBe('math');
    });
  });

  // ─── getWrongQuestions ───────────────────────────────────────────────

  describe('getWrongQuestions', () => {
    it('returns paginated results', async () => {
      wrongRepo.findAndCount.mockResolvedValue([[{ id: 1 }], 1]);

      const result = await service.getWrongQuestions({ childId: 1 });

      expect(result).toEqual({ list: [{ id: 1 }], total: 1, page: 1, limit: 20 });
    });

    it('adds domain and status filters', async () => {
      wrongRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.getWrongQuestions({ childId: 1, domain: 'math', status: 'new' });

      const call = wrongRepo.findAndCount.mock.calls[0][0];
      expect(call.where.domain).toBe('math');
      expect(call.where.status).toBe('new');
    });
  });

  // ─── getStudyPlans ───────────────────────────────────────────────────

  describe('getStudyPlans', () => {
    it('returns paginated results', async () => {
      planRepo.findAndCount.mockResolvedValue([[{ id: 1 }], 1]);

      const result = await service.getStudyPlans({ childId: 1 });

      expect(result).toEqual({ list: [{ id: 1 }], total: 1, page: 1, limit: 20 });
    });

    it('adds sourceType filter when provided', async () => {
      planRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.getStudyPlans({ childId: 1, sourceType: 'ai_generated' });

      const call = planRepo.findAndCount.mock.calls[0][0];
      expect(call.where.sourceType).toBe('ai_generated');
    });
  });

  // ─── getActiveCooldownPointKeys ──────────────────────────────────────

  describe('getActiveCooldownPointKeys', () => {
    it('returns set of point keys in cooldown', async () => {
      pointRepo.find.mockResolvedValue([
        { pointKey: 'math-addition' },
        { pointKey: 'science-plants' },
      ]);

      const result = await service.getActiveCooldownPointKeys(1);

      expect(result).toBeInstanceOf(Set);
      expect(result.has('math-addition')).toBe(true);
      expect(result.has('science-plants')).toBe(true);
      expect(result.size).toBe(2);
    });

    it('returns empty set when no points in cooldown', async () => {
      pointRepo.find.mockResolvedValue([]);

      const result = await service.getActiveCooldownPointKeys(1);
      expect(result.size).toBe(0);
    });
  });
});
