import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AchievementsService } from '../../src/modules/achievements/achievements.service';
import { Achievement } from '../../src/database/entities/achievement.entity';
import { NotificationService } from '../../src/modules/notification/notification.service';

describe('AchievementsService', () => {
  let service: AchievementsService;
  let mockRepo: Record<string, jest.Mock>;
  let mockNotificationService: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
    };
    mockNotificationService = {
      notifyAchievement: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AchievementsService,
        { provide: getRepositoryToken(Achievement), useValue: mockRepo },
        { provide: NotificationService, useValue: mockNotificationService },
      ],
    }).compile();

    service = module.get<AchievementsService>(AchievementsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('should create an achievement and notify', async () => {
      const data = { userId: 1, type: 'first_lesson', name: '初次学习' };
      const saved = { id: 1, uuid: expect.any(String), ...data };
      mockRepo.create.mockImplementation((d) => d);
      mockRepo.save.mockResolvedValue(saved);

      const result = await service.create(data);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          achievementType: 'first_lesson',
          achievementName: '初次学习',
        }),
      );
      expect(mockNotificationService.notifyAchievement).toHaveBeenCalledWith(1, '初次学习');
      expect(result).toEqual(saved);
    });

    it('should include description when provided', async () => {
      const data = { userId: 2, type: 'daily_goal', name: '每日目标', description: '完成每日任务' };
      mockRepo.create.mockImplementation((d) => d);
      mockRepo.save.mockResolvedValue({});

      await service.create(data);
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ description: '完成每日任务' }),
      );
    });
  });

  describe('findById', () => {
    it('should return achievement by id', async () => {
      const achievement = { id: 5, userId: 1, achievementType: 'first_lesson' };
      mockRepo.findOne.mockResolvedValue(achievement);

      const result = await service.findById(5);
      expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: 5 } });
      expect(result).toEqual(achievement);
    });

    it('should return null when not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      const result = await service.findById(999);
      expect(result).toBeNull();
    });
  });

  describe('findByUser', () => {
    it('should return achievements ordered by earnedAt DESC', async () => {
      const achievements = [
        { id: 2, earnedAt: new Date('2026-06-14') },
        { id: 1, earnedAt: new Date('2026-06-13') },
      ];
      mockRepo.find.mockResolvedValue(achievements);

      const result = await service.findByUser(1);
      expect(mockRepo.find).toHaveBeenCalledWith({
        where: { userId: 1 },
        order: { earnedAt: 'DESC' },
      });
      expect(result).toHaveLength(2);
    });

    it('should return empty array for user with no achievements', async () => {
      mockRepo.find.mockResolvedValue([]);
      const result = await service.findByUser(999);
      expect(result).toEqual([]);
    });
  });

  describe('findByUserCount', () => {
    it('should count all achievements for user', async () => {
      mockRepo.count.mockResolvedValue(5);
      const result = await service.findByUserCount(1);
      expect(mockRepo.count).toHaveBeenCalledWith({ where: { userId: 1 } });
      expect(result).toBe(5);
    });

    it('should filter by type when provided', async () => {
      mockRepo.count.mockResolvedValue(2);
      const result = await service.findByUserCount(1, 'first_lesson');
      expect(mockRepo.count).toHaveBeenCalledWith({
        where: { userId: 1, achievementType: 'first_lesson' },
      });
      expect(result).toBe(2);
    });
  });

  describe('checkAndAward', () => {
    it('should create achievement when not existing', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      mockRepo.create.mockImplementation((d) => d);
      mockRepo.save.mockResolvedValue({ id: 1 });

      const result = await service.checkAndAward(1, 'first_lesson');

      expect(result).toBeTruthy();
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ achievementType: 'first_lesson', achievementName: '初次学习' }),
      );
    });

    it('should return null when achievement already exists', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, achievementType: 'first_lesson' });

      const result = await service.checkAndAward(1, 'first_lesson');
      expect(result).toBeNull();
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('should use fallback name for unknown type', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      mockRepo.create.mockImplementation((d) => d);
      mockRepo.save.mockResolvedValue({});

      await service.checkAndAward(1, 'unknown_type');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ achievementName: '成就' }),
      );
    });
  });

  describe('checkAchievements', () => {
    const baseStats = {
      totalLearningRecords: 0,
      completedAssignments: 0,
      completedActivities: 0,
      distinctDomains: [],
      latestAbilityScores: { art: 0, social: 0, language: 0, math: 0, science: 0 },
    };

    beforeEach(() => {
      // checkAndAward calls findOne then create — default: not existing
      mockRepo.findOne.mockResolvedValue(null);
      mockRepo.create.mockImplementation((d) => d);
      mockRepo.save.mockResolvedValue({});
    });

    it('should award first_homework on assignment_completion', async () => {
      const result = await service.checkAchievements(
        1,
        { type: 'assignment_completion', score: 80, domain: 'math' },
        baseStats,
      );
      expect(result).toContain('first_homework');
    });

    it('should award perfect_homework when score is 100', async () => {
      const result = await service.checkAchievements(
        1,
        { type: 'assignment_completion', score: 100, domain: 'math' },
        baseStats,
      );
      expect(result).toContain('perfect_homework');
    });

    it('should award homework_streak_3 at 3 completed assignments', async () => {
      const result = await service.checkAchievements(
        1,
        { type: 'assignment_completion', score: 80, domain: 'math' },
        { ...baseStats, completedAssignments: 3 },
      );
      expect(result).toContain('homework_streak_3');
    });

    it('should award homework_streak_7 and homework_master_10 at thresholds', async () => {
      const result = await service.checkAchievements(
        1,
        { type: 'assignment_completion', score: 80, domain: 'math' },
        { ...baseStats, completedAssignments: 10 },
      );
      expect(result).toContain('homework_streak_7');
      expect(result).toContain('homework_master_10');
    });

    it('should award first_activity and perfect_activity', async () => {
      const result = await service.checkAchievements(
        1,
        { type: 'interactive_activity', score: 100, domain: 'art' },
        baseStats,
      );
      expect(result).toContain('first_activity');
      expect(result).toContain('perfect_activity');
    });

    it('should award activity streaks at thresholds', async () => {
      const result = await service.checkAchievements(
        1,
        { type: 'interactive_activity', score: 80, domain: 'art' },
        { ...baseStats, completedActivities: 20 },
      );
      expect(result).toContain('activity_streak_5');
      expect(result).toContain('activity_master_20');
    });

    it('should award first_lesson on content_completion', async () => {
      const result = await service.checkAchievements(
        1,
        { type: 'content_completion', score: 80, domain: 'language' },
        baseStats,
      );
      expect(result).toContain('first_lesson');
    });

    it('should award daily_learner at 3+ learning records', async () => {
      const result = await service.checkAchievements(
        1,
        { type: 'content_completion', score: 80, domain: 'language' },
        { ...baseStats, totalLearningRecords: 3 },
      );
      expect(result).toContain('daily_learner');
    });

    it('should award explorer_5 at 5+ distinct domains', async () => {
      const result = await service.checkAchievements(
        1,
        { type: 'content_completion', score: 80, domain: 'language' },
        { ...baseStats, distinctDomains: ['math', 'language', 'science', 'art', 'social'] },
      );
      expect(result).toContain('explorer_5');
    });

    it('should award domain talent achievements at score >= 80', async () => {
      const result = await service.checkAchievements(
        1,
        { type: 'content_completion', score: 80, domain: 'art' },
        {
          ...baseStats,
          latestAbilityScores: { art: 85, social: 90, language: 80, math: 80, science: 80 },
        },
      );
      expect(result).toContain('art_talent');
      expect(result).toContain('social_star');
      expect(result).toContain('language_master');
      expect(result).toContain('math_wizard');
      expect(result).toContain('science_explorer');
    });

    it('should NOT award domain talent when score < 80', async () => {
      const result = await service.checkAchievements(
        1,
        { type: 'content_completion', score: 80, domain: 'art' },
        {
          ...baseStats,
          latestAbilityScores: { art: 50, social: 50, language: 50, math: 50, science: 50 },
        },
      );
      expect(result).not.toContain('art_talent');
      expect(result).not.toContain('social_star');
    });

    it('should skip already-awarded achievements', async () => {
      // All findOne calls return existing — nothing new to award
      mockRepo.findOne.mockResolvedValue({ id: 1 });

      const result = await service.checkAchievements(
        1,
        { type: 'assignment_completion', score: 100, domain: 'math' },
        { ...baseStats, completedAssignments: 10 },
      );
      expect(result).toEqual([]);
    });
  });
});
