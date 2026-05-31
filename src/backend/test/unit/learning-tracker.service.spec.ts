import { Test, TestingModule } from '@nestjs/testing';
import {
  LearningTrackerService,
  RecordActivityParams,
} from '../../src/modules/learning/learning-tracker.service';
import { LearningService } from '../../src/modules/learning/learning.service';
import { AbilitiesService } from '../../src/modules/abilities/abilities.service';
import { AchievementsService } from '../../src/modules/achievements/achievements.service';
import { LearningArchiveService } from '../../src/modules/learning/learning-archive.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LearningRecord } from '../../src/database/entities/learning-record.entity';
import { Achievement } from '../../src/database/entities/achievement.entity';

describe('LearningTrackerService', () => {
  let service: LearningTrackerService;
  let learningService: any;
  let abilitiesService: any;
  let achievementsService: any;
  let archiveService: any;
  let recordRepo: any;
  let achievementRepo: any;

  const mockRecord = {
    id: 99,
    uuid: 'test-uuid',
    userId: 2,
    contentId: null,
    status: 'in_progress',
  };

  beforeEach(async () => {
    recordRepo = {
      create: jest.fn((data) => data),
      save: jest.fn((data) => ({ ...data, id: 99 })),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };

    achievementRepo = {
      find: jest.fn(),
    };

    learningService = {
      create: jest.fn(),
      update: jest.fn(),
    };

    abilitiesService = {
      getLatestByDomain: jest.fn().mockResolvedValue(null),
      getByUser: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    };

    achievementsService = {
      checkAchievements: jest.fn().mockResolvedValue([]),
    };

    archiveService = {
      recordActivityLearning: jest.fn(),
      recordWrongQuestions: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LearningTrackerService,
        { provide: LearningService, useValue: learningService },
        { provide: AbilitiesService, useValue: abilitiesService },
        { provide: AchievementsService, useValue: achievementsService },
        { provide: LearningArchiveService, useValue: archiveService },
        { provide: getRepositoryToken(LearningRecord), useValue: recordRepo },
        { provide: getRepositoryToken(Achievement), useValue: achievementRepo },
      ],
    }).compile();

    service = module.get<LearningTrackerService>(LearningTrackerService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('recordActivity', () => {
    const baseParams: RecordActivityParams = {
      type: 'content_completion',
      childId: 2,
      domain: 'language',
      score: 85,
      durationSeconds: 300,
    };

    it('creates a learning record via LearningService when contentId is provided', async () => {
      learningService.create.mockResolvedValue(mockRecord);
      learningService.update.mockResolvedValue({ ...mockRecord, score: 85, status: 'completed' });

      const result = await service.recordActivity({
        ...baseParams,
        contentId: 10,
      });

      expect(learningService.create).toHaveBeenCalledWith(2, 10);
      expect(learningService.update).toHaveBeenCalledWith(
        99,
        expect.objectContaining({ score: 85, status: 'completed' }),
      );
      expect(result).toHaveProperty('learningRecord');
      expect(result).toHaveProperty('abilityUpdated');
      expect(result).toHaveProperty('achievementsAwarded');
    });

    it('creates record directly when no contentId', async () => {
      learningService.update.mockResolvedValue({ ...mockRecord, score: 85, status: 'completed' });

      const result = await service.recordActivity(baseParams);

      expect(learningService.create).not.toHaveBeenCalled();
      expect(recordRepo.create).toHaveBeenCalled();
      expect(recordRepo.save).toHaveBeenCalled();
      expect(result.learningRecord.id).toBe(99);
    });

    it('updates ability assessment after recording', async () => {
      learningService.update.mockResolvedValue({ ...mockRecord, score: 85, status: 'completed' });
      abilitiesService.getLatestByDomain.mockResolvedValue({ domain: 'language', score: 70 });

      await service.recordActivity(baseParams);

      expect(abilitiesService.getLatestByDomain).toHaveBeenCalledWith(2, 'language');
      expect(abilitiesService.create).toHaveBeenCalledWith(
        2,
        'language',
        expect.any(Number),
        expect.objectContaining({ source: 'content_completion' }),
      );
    });

    it('uses raw score when no previous ability exists', async () => {
      learningService.update.mockResolvedValue({ ...mockRecord, score: 85, status: 'completed' });
      abilitiesService.getLatestByDomain.mockResolvedValue(null);

      await service.recordActivity(baseParams);

      expect(abilitiesService.create).toHaveBeenCalledWith(2, 'language', 85, expect.any(Object));
    });

    it('blends 70/30 when previous ability exists', async () => {
      learningService.update.mockResolvedValue({ ...mockRecord, score: 85, status: 'completed' });
      abilitiesService.getLatestByDomain.mockResolvedValue({ domain: 'language', score: 70 });

      await service.recordActivity(baseParams);

      // 0.7 * 70 + 0.3 * 85 = 49 + 26 = 75 (rounded from 74.5)
      expect(abilitiesService.create).toHaveBeenCalledWith(2, 'language', 75, expect.any(Object));
    });

    it('checks achievements after recording', async () => {
      learningService.update.mockResolvedValue({ ...mockRecord, score: 85, status: 'completed' });
      achievementsService.checkAchievements.mockResolvedValue([
        'first_learning',
        'language_master',
      ]);

      const result = await service.recordActivity(baseParams);

      expect(achievementsService.checkAchievements).toHaveBeenCalledWith(
        2,
        expect.objectContaining({ type: 'content_completion', score: 85, domain: 'language' }),
        expect.any(Object),
      );
      expect(result.achievementsAwarded).toEqual(['first_learning', 'language_master']);
    });

    it('returns empty achievements when none awarded', async () => {
      learningService.update.mockResolvedValue({ ...mockRecord, score: 85, status: 'completed' });
      achievementsService.checkAchievements.mockResolvedValue([]);

      const result = await service.recordActivity(baseParams);

      expect(result.achievementsAwarded).toEqual([]);
    });

    it('handles interactive_activity with all optional fields', async () => {
      learningService.update.mockResolvedValue({ ...mockRecord, score: 90, status: 'completed' });

      const result = await service.recordActivity({
        type: 'interactive_activity',
        childId: 3,
        domain: 'math',
        score: 90,
        durationSeconds: 600,
        sessionId: 'sess-123',
        activityType: 'quiz',
        topic: '加减法',
        reviewItems: [{ question: '1+1', userAnswer: '2', correctAnswer: '2', isCorrect: true }],
        interactionData: { mode: 'practice' },
      });

      expect(result.learningRecord.id).toBe(99);
      expect(archiveService.recordActivityLearning).toHaveBeenCalledWith(
        expect.objectContaining({ childId: 3, topic: '加减法' }),
      );
      expect(archiveService.recordWrongQuestions).toHaveBeenCalledWith(
        expect.objectContaining({ childId: 3, reviewItems: expect.any(Array) }),
      );
    });

    it('archives activity even without review items', async () => {
      learningService.update.mockResolvedValue({ ...mockRecord, score: 80, status: 'completed' });

      await service.recordActivity({
        type: 'interactive_activity',
        childId: 3,
        domain: 'science',
        score: 80,
        topic: '太阳系',
      });

      expect(archiveService.recordActivityLearning).toHaveBeenCalled();
      expect(archiveService.recordWrongQuestions).not.toHaveBeenCalled();
    });

    it('does not archive when interactive_activity has no topic', async () => {
      learningService.update.mockResolvedValue({ ...mockRecord, score: 80, status: 'completed' });

      await service.recordActivity({
        type: 'interactive_activity',
        childId: 3,
        domain: 'science',
        score: 80,
      });

      expect(archiveService.recordActivityLearning).not.toHaveBeenCalled();
    });

    it('survives ability update failure gracefully', async () => {
      learningService.update.mockResolvedValue({ ...mockRecord, score: 85, status: 'completed' });
      abilitiesService.getLatestByDomain.mockRejectedValue(new Error('DB error'));

      // Should not throw
      const result = await service.recordActivity(baseParams);

      expect(result).toBeDefined();
      expect(result.abilityUpdated).toBe(false);
    });

    it('includes assignmentId in interaction data for assignment_completion', async () => {
      learningService.create.mockResolvedValue(mockRecord);
      learningService.update.mockResolvedValue({ ...mockRecord, score: 100, status: 'completed' });

      await service.recordActivity({
        type: 'assignment_completion',
        childId: 2,
        contentId: 5,
        assignmentId: 42,
        domain: 'math',
        score: 100,
      });

      expect(learningService.update).toHaveBeenCalledWith(
        99,
        expect.objectContaining({
          interactionData: expect.objectContaining({ assignmentId: 42 }),
        }),
      );
    });

    it('gathers stats correctly for achievement checking', async () => {
      learningService.create.mockResolvedValue(mockRecord);
      learningService.update.mockResolvedValue({ ...mockRecord, score: 85, status: 'completed' });
      achievementsService.checkAchievements.mockResolvedValue([]);

      await service.recordActivity({ ...baseParams, contentId: 3 });

      const statsArg = achievementsService.checkAchievements.mock.calls[0][2];
      expect(statsArg).toHaveProperty('totalLearningRecords');
      expect(statsArg).toHaveProperty('completedAssignments');
      expect(statsArg).toHaveProperty('completedActivities');
      expect(statsArg).toHaveProperty('distinctDomains');
      expect(statsArg).toHaveProperty('latestAbilityScores');
    });
  });
});
