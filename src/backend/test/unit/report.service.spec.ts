import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReportService } from '../../src/modules/report/report.service';
import { LearningRecord } from '../../src/database/entities/learning-record.entity';
import { AbilityAssessment } from '../../src/database/entities/ability-assessment.entity';
import { Achievement } from '../../src/database/entities/achievement.entity';
import { LlmClientService } from '../../src/agent-framework/llm/llm-client.service';

describe('ReportService', () => {
  let service: ReportService;
  let mockLearningRecordRepo: Record<string, jest.Mock>;
  let mockAbilityRepo: Record<string, jest.Mock>;
  let mockAchievementRepo: Record<string, jest.Mock>;
  let mockLlmClient: { isConfigured: boolean; generate: jest.Mock };
  let mockQueryBuilder: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getRawMany: jest.fn().mockResolvedValue([]),
    };

    mockLearningRecordRepo = {
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };
    mockAbilityRepo = {
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockReturnValue({ ...mockQueryBuilder }),
    };
    mockAchievementRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    mockLlmClient = {
      isConfigured: false,
      generate: jest.fn().mockResolvedValue(''),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportService,
        { provide: getRepositoryToken(LearningRecord), useValue: mockLearningRecordRepo },
        { provide: getRepositoryToken(AbilityAssessment), useValue: mockAbilityRepo },
        { provide: getRepositoryToken(Achievement), useValue: mockAchievementRepo },
        { provide: LlmClientService, useValue: mockLlmClient },
      ],
    }).compile();

    service = module.get<ReportService>(ReportService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getDateRange', () => {
    it('should return ~24h range for daily', () => {
      const range = (service as any).getDateRange('daily');
      const diff = range.end.getTime() - range.start.getTime();
      expect(diff).toBeCloseTo(24 * 60 * 60 * 1000, -3);
    });

    it('should return ~7d range for weekly', () => {
      const range = (service as any).getDateRange('weekly');
      const diff = range.end.getTime() - range.start.getTime();
      expect(diff).toBeCloseTo(7 * 24 * 60 * 60 * 1000, -3);
    });

    it('should return ~30d range for monthly', () => {
      const range = (service as any).getDateRange('monthly');
      const diff = range.end.getTime() - range.start.getTime();
      expect(diff).toBeCloseTo(30 * 24 * 60 * 60 * 1000, -3);
    });

    it('should default to weekly for unknown period', () => {
      const range = (service as any).getDateRange('unknown');
      const diff = range.end.getTime() - range.start.getTime();
      expect(diff).toBeCloseTo(7 * 24 * 60 * 60 * 1000, -3);
    });
  });

  describe('calculateAverageScore', () => {
    it('should return 0 for empty stats', () => {
      expect((service as any).calculateAverageScore([])).toBe(0);
    });

    it('should return 0 when no days have scores', () => {
      const stats = [{ averageScore: 0 }, { averageScore: 0 }];
      expect((service as any).calculateAverageScore(stats)).toBe(0);
    });

    it('should average only days with scores > 0', () => {
      const stats = [{ averageScore: 80 }, { averageScore: 0 }, { averageScore: 60 }];
      expect((service as any).calculateAverageScore(stats)).toBe(70);
    });
  });

  describe('generateSummary', () => {
    it('should return default message when no activity', () => {
      const result = (service as any).generateSummary(
        { completedSessions: 0, totalMinutes: 0, streakDays: 0 },
        { total: 0 },
      );
      expect(result).toBe('今天还没有学习记录');
    });

    it('should include completed sessions count', () => {
      const result = (service as any).generateSummary(
        { completedSessions: 5, totalMinutes: 0, streakDays: 0 },
        { total: 0 },
      );
      expect(result).toContain('5 个学习任务');
    });

    it('should include learning time', () => {
      const result = (service as any).generateSummary(
        { completedSessions: 0, totalMinutes: 30, streakDays: 0 },
        { total: 0 },
      );
      expect(result).toContain('30 分钟');
    });

    it('should include streak days', () => {
      const result = (service as any).generateSummary(
        { completedSessions: 0, totalMinutes: 0, streakDays: 7 },
        { total: 0 },
      );
      expect(result).toContain('连续学习 7 天');
    });

    it('should include achievements', () => {
      const result = (service as any).generateSummary(
        { completedSessions: 0, totalMinutes: 0, streakDays: 0 },
        { total: 3 },
      );
      expect(result).toContain('3 个成就');
    });

    it('should combine multiple stats', () => {
      const result = (service as any).generateSummary(
        { completedSessions: 2, totalMinutes: 15, streakDays: 3 },
        { total: 1 },
      );
      expect(result).toContain('2 个学习任务');
      expect(result).toContain('15 分钟');
      expect(result).toContain('连续学习 3 天');
      expect(result).toContain('1 个成就');
    });
  });

  describe('generateRuleBasedInsights', () => {
    it('should return encouragement for 3+ sessions', () => {
      const result = (service as any).generateRuleBasedInsights({
        totalSessions: 5,
        domainStats: {},
      });
      expect(result).toContain('学习很积极！保持这个节奏');
    });

    it('should NOT return encouragement for < 3 sessions', () => {
      const result = (service as any).generateRuleBasedInsights({
        totalSessions: 2,
        domainStats: {},
      });
      expect(result).not.toContain('学习很积极');
    });

    it('should identify top domain', () => {
      const result = (service as any).generateRuleBasedInsights({
        totalSessions: 1,
        domainStats: { math: 5, language: 2, art: 1 },
      });
      expect(result.join('')).toContain('数学');
    });

    it('should return empty for no data', () => {
      const result = (service as any).generateRuleBasedInsights({
        totalSessions: 0,
        domainStats: {},
      });
      expect(result).toEqual([]);
    });
  });

  describe('generateEncouragement', () => {
    it('should return special message when total change > 10', () => {
      const result = (service as any).generateEncouragement({
        change: { language: 5, math: 3, science: 2, art: 1, social: 1 },
      });
      expect(result).toBe('进步太大了！为你骄傲！🏆');
    });

    it('should return random encouragement when change is small', () => {
      const result = (service as any).generateEncouragement({
        change: { language: 1, math: 1, science: 0, art: 0, social: 0 },
      });
      expect(result).toBeTruthy();
      expect(result).not.toBe('进步太大了！为你骄傲！🏆');
    });

    it('should return random encouragement when no change', () => {
      const result = (service as any).generateEncouragement(null);
      expect(result).toBeTruthy();
    });
  });

  describe('getSkillProgress', () => {
    it('should return all domains at 0 when no abilities', async () => {
      const result = await (service as any).getSkillProgress(1);
      expect(result).toEqual({ language: 0, math: 0, science: 0, art: 0, social: 0 });
    });

    it('should use latest score per domain', async () => {
      mockAbilityRepo.find.mockResolvedValue([
        { domain: 'math', score: 80, assessedAt: new Date('2026-06-14') },
        { domain: 'math', score: 50, assessedAt: new Date('2026-06-13') },
        { domain: 'language', score: 70, assessedAt: new Date('2026-06-12') },
      ]);
      const result = await (service as any).getSkillProgress(1);
      expect(result.math).toBe(80);
      expect(result.language).toBe(70);
    });

    it('should clamp scores to 0-100', async () => {
      mockAbilityRepo.find.mockResolvedValue([
        { domain: 'art', score: 150, assessedAt: new Date() },
        { domain: 'social', score: -10, assessedAt: new Date() },
      ]);
      const result = await (service as any).getSkillProgress(1);
      expect(result.art).toBe(100);
      expect(result.social).toBe(0);
    });
  });

  describe('getRecentMasteredSkills', () => {
    it('should return mapped domain labels', async () => {
      mockAbilityRepo.find.mockResolvedValue([
        { domain: 'math', level: 3 },
        { domain: 'language', level: 2 },
      ]);
      const result = await service.getRecentMasteredSkills(1, 5);
      expect(result).toEqual([
        { domain: 'math', level: 3, label: '数学逻辑' },
        { domain: 'language', level: 2, label: '语言表达' },
      ]);
    });

    it('should use domain name as fallback for unknown domains', async () => {
      mockAbilityRepo.find.mockResolvedValue([{ domain: 'custom', level: 1 }]);
      const result = await service.getRecentMasteredSkills(1, 5);
      expect(result[0].label).toBe('custom');
    });

    it('should return empty array when no assessments', async () => {
      mockAbilityRepo.find.mockResolvedValue([]);
      const result = await service.getRecentMasteredSkills(1, 5);
      expect(result).toEqual([]);
    });
  });

  describe('getAbilityTrend', () => {
    it('should return empty array when no assessments', async () => {
      const qb = mockAbilityRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([]);
      const result = await service.getAbilityTrend(1, 4);
      expect(result).toEqual([]);
    });

    it('should group assessments by week', async () => {
      const now = new Date();
      const qb = mockAbilityRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([
        { domain: 'math', score: 70, assessedAt: new Date(now.getTime() - 1 * 86400000) },
        { domain: 'math', score: 60, assessedAt: new Date(now.getTime() - 8 * 86400000) },
        { domain: 'language', score: 80, assessedAt: new Date(now.getTime() - 2 * 86400000) },
      ]);
      const result = await service.getAbilityTrend(1, 4);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('week');
      expect(result[0]).toHaveProperty('math');
      expect(result[0]).toHaveProperty('language');
    });
  });

  describe('generateReport', () => {
    it('should return a complete report structure', async () => {
      mockLearningRecordRepo.find.mockResolvedValue([]);
      mockAbilityRepo.find.mockResolvedValue([]);
      mockAchievementRepo.find.mockResolvedValue([]);
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await service.generateReport({ userId: 1, period: 'daily' });

      expect(result).toHaveProperty('userId', 1);
      expect(result).toHaveProperty('period', 'daily');
      expect(result).toHaveProperty('startDate');
      expect(result).toHaveProperty('endDate');
      expect(result).toHaveProperty('totalLearningTime', 0);
      expect(result).toHaveProperty('totalLessonsCompleted', 0);
      expect(result).toHaveProperty('averageScore', 0);
      expect(result).toHaveProperty('dailyStats');
      expect(result).toHaveProperty('skillProgress');
      expect(result).toHaveProperty('achievements');
      expect(result).toHaveProperty('insights');
      expect(result).toHaveProperty('streak');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('encouragement');
    });

    it('should calculate learning time from records', async () => {
      mockLearningRecordRepo.find.mockResolvedValue([
        {
          durationSeconds: 300,
          status: 'completed',
          content: { domain: 'math' },
          score: 80,
          startedAt: new Date(),
        },
        {
          durationSeconds: 600,
          status: 'completed',
          content: { domain: 'language' },
          score: 90,
          startedAt: new Date(),
        },
      ]);
      mockAbilityRepo.find.mockResolvedValue([]);
      mockAchievementRepo.find.mockResolvedValue([]);
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await service.generateReport({ userId: 1, period: 'daily' });

      expect(result.totalLearningTime).toBe(900); // 300 + 600 seconds
      expect(result.totalLessonsCompleted).toBe(2);
    });

    it('should use LLM insights when available', async () => {
      mockLlmClient.isConfigured = true;
      mockLlmClient.generate.mockResolvedValue(
        '["数学能力进步明显，建议增加难度", "语言表达需要更多练习"]',
      );
      mockLearningRecordRepo.find.mockResolvedValue([]);
      mockAbilityRepo.find.mockResolvedValue([]);
      mockAchievementRepo.find.mockResolvedValue([]);
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await service.generateReport({ userId: 1, period: 'weekly' });

      expect(result.insights).toHaveLength(2);
      expect(result.insights[0]).toContain('数学');
    });

    it('should fall back to rule-based insights on LLM failure', async () => {
      mockLlmClient.isConfigured = true;
      mockLlmClient.generate.mockRejectedValue(new Error('API error'));
      mockLearningRecordRepo.find.mockResolvedValue([
        {
          durationSeconds: 300,
          status: 'completed',
          content: { domain: 'math' },
          score: 80,
          startedAt: new Date(),
        },
        {
          durationSeconds: 300,
          status: 'completed',
          content: { domain: 'math' },
          score: 70,
          startedAt: new Date(),
        },
        {
          durationSeconds: 300,
          status: 'completed',
          content: { domain: 'language' },
          score: 60,
          startedAt: new Date(),
        },
      ]);
      mockAbilityRepo.find.mockResolvedValue([]);
      mockAchievementRepo.find.mockResolvedValue([]);
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await service.generateReport({ userId: 1, period: 'weekly' });

      expect(result.insights.length).toBeGreaterThan(0);
      expect(result.insights).toContain('学习很积极！保持这个节奏');
    });

    it('should include recent achievements (max 5)', async () => {
      const achievements = Array.from({ length: 7 }, (_, i) => ({
        id: i + 1,
        userId: 1,
        achievementType: `type_${i}`,
        earnedAt: new Date(),
      }));
      mockLearningRecordRepo.find.mockResolvedValue([]);
      mockAbilityRepo.find.mockResolvedValue([]);
      mockAchievementRepo.find.mockResolvedValue(achievements);
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await service.generateReport({ userId: 1, period: 'monthly' });

      expect(result.achievements).toHaveLength(5);
    });
  });
});
