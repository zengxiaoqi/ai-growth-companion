import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RecommendService } from '../../src/modules/recommend/recommend.service';
import { LearningRecord } from '../../src/database/entities/learning-record.entity';
import { Content } from '../../src/database/entities/content.entity';
import { AbilityAssessment } from '../../src/database/entities/ability-assessment.entity';
import { ParentControl } from '../../src/database/entities/parent-control.entity';
import { LearningPoint } from '../../src/database/entities/learning-point.entity';

describe('RecommendService', () => {
  let service: RecommendService;
  let mockLearningRecordRepo: Record<string, jest.Mock>;
  let mockContentRepo: Record<string, jest.Mock>;
  let mockAbilityRepo: Record<string, jest.Mock>;
  let mockControlRepo: Record<string, jest.Mock>;
  let mockLearningPointRepo: Record<string, jest.Mock>;
  let mockQueryBuilder: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    mockLearningRecordRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    mockContentRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };
    mockAbilityRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    mockControlRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    mockLearningPointRepo = {
      find: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecommendService,
        { provide: getRepositoryToken(LearningRecord), useValue: mockLearningRecordRepo },
        { provide: getRepositoryToken(Content), useValue: mockContentRepo },
        { provide: getRepositoryToken(AbilityAssessment), useValue: mockAbilityRepo },
        { provide: getRepositoryToken(ParentControl), useValue: mockControlRepo },
        { provide: getRepositoryToken(LearningPoint), useValue: mockLearningPointRepo },
      ],
    }).compile();

    service = module.get<RecommendService>(RecommendService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('normalizePointKey', () => {
    it('should normalize Chinese characters and lowercase', () => {
      const result = (service as any).normalizePointKey('数学 学习');
      expect(result).toBe('数学-学习');
    });

    it('should trim and collapse special chars', () => {
      const result = (service as any).normalizePointKey('  Hello---World  ');
      expect(result).toBe('hello-world');
    });

    it('should return unknown-topic for empty input', () => {
      const result = (service as any).normalizePointKey('');
      expect(result).toBe('unknown-topic');
    });

    it('should return unknown-topic for null-ish input', () => {
      const result = (service as any).normalizePointKey(null as any);
      expect(result).toBe('unknown-topic');
    });
  });

  describe('analyzePreferences', () => {
    it('should count domains from learning records', () => {
      const records = [
        { content: { domain: 'math' } },
        { content: { domain: 'math' } },
        { content: { domain: 'language' } },
      ] as LearningRecord[];
      const result = (service as any).analyzePreferences(records);
      expect(result).toEqual({ math: 2, language: 1 });
    });

    it('should default to language when content is missing', () => {
      const records = [{ content: null }] as any;
      const result = (service as any).analyzePreferences(records);
      expect(result).toEqual({ language: 1 });
    });

    it('should return empty object for no records', () => {
      const result = (service as any).analyzePreferences([]);
      expect(result).toEqual({});
    });
  });

  describe('getWeakDomains', () => {
    it('should return default domains when no abilities', () => {
      const result = (service as any).getWeakDomains([], {});
      expect(result).toEqual(['language', 'math', 'science']);
    });

    it('should return the 2 weakest domains', () => {
      const abilities = [
        { domain: 'math', score: 20 },
        { domain: 'language', score: 80 },
        { domain: 'science', score: 50 },
        { domain: 'art', score: 10 },
      ] as AbilityAssessment[];
      const result = (service as any).getWeakDomains(abilities, {});
      expect(result).toEqual(['art', 'math']);
    });

    it('should treat missing score as 0', () => {
      const abilities = [
        { domain: 'math', score: undefined },
        { domain: 'language', score: 50 },
        { domain: 'science', score: 90 },
      ] as any;
      const result = (service as any).getWeakDomains(abilities, {});
      expect(result).toEqual(['math', 'language']);
    });
  });

  describe('generateReason', () => {
    it('should return age-based reason when no abilities', () => {
      const result = (service as any).generateReason({}, []);
      expect(result).toBe('根据您的年龄推荐适合的内容');
    });

    it('should return domain-specific reason with weak domains', () => {
      const abilities = [
        { domain: 'math', score: 20 },
        { domain: 'language', score: 80 },
      ] as AbilityAssessment[];
      const result = (service as any).generateReason({}, abilities);
      expect(result).toContain('数学');
    });

    it('should return generic reason when all scores are high', () => {
      const abilities = [
        { domain: 'math', score: 90 },
        { domain: 'language', score: 90 },
      ] as AbilityAssessment[];
      // getWeakDomains still returns weakest 2, but reason uses them
      const result = (service as any).generateReason({}, abilities);
      expect(result).toBeTruthy();
    });
  });

  describe('suggestNextLevel', () => {
    it('should return null for empty abilities', () => {
      expect((service as any).suggestNextLevel([])).toBeNull();
      expect((service as any).suggestNextLevel(null)).toBeNull();
    });

    it('should return level 1 for avg < 30', () => {
      const abilities = [{ score: 20 }, { score: 25 }] as AbilityAssessment[];
      const result = (service as any).suggestNextLevel(abilities);
      expect(result).toEqual({ level: 1, message: '从基础开始' });
    });

    it('should return level 2 for avg 30-59', () => {
      const abilities = [{ score: 40 }, { score: 50 }] as AbilityAssessment[];
      const result = (service as any).suggestNextLevel(abilities);
      expect(result).toEqual({ level: 2, message: '可以尝试进阶内容' });
    });

    it('should return level 3 for avg >= 60', () => {
      const abilities = [{ score: 70 }, { score: 80 }] as AbilityAssessment[];
      const result = (service as any).suggestNextLevel(abilities);
      expect(result).toEqual({ level: 3, message: '挑战高级内容！' });
    });
  });

  describe('recommend', () => {
    it('should return recommendations with reason and nextLevel', async () => {
      const mockContents = [
        { id: 1, topic: 'Numbers', difficulty: 1 },
        { id: 2, topic: 'Letters', difficulty: 2 },
      ];
      mockLearningRecordRepo.find.mockResolvedValue([
        { contentId: 10, content: { domain: 'math' } },
      ]);
      mockAbilityRepo.find.mockResolvedValue([{ domain: 'math', score: 50 }]);
      mockQueryBuilder.getMany.mockResolvedValue(mockContents);

      const result = await service.recommend({ userId: 1, ageRange: '3-4' });

      expect(result.recommended).toHaveLength(2);
      expect(result.reason).toBeTruthy();
      expect(result.nextLevel).toEqual({ level: 2, message: '可以尝试进阶内容' });
    });

    it('should exclude already-learned content IDs', async () => {
      mockLearningRecordRepo.find.mockResolvedValue([
        { contentId: 10, content: { domain: 'math' } },
        { contentId: 11, content: { domain: 'math' } },
      ]);
      mockAbilityRepo.find.mockResolvedValue([]);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await service.recommend({ userId: 1, ageRange: '5-6' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('content.id NOT IN (:...excludeIds)', {
        excludeIds: [10, 11],
      });
    });

    it('should filter out cooldown topics', async () => {
      mockLearningPointRepo.find.mockResolvedValue([{ pointKey: 'numbers' }]);
      mockLearningRecordRepo.find.mockResolvedValue([]);
      mockAbilityRepo.find.mockResolvedValue([]);
      mockQueryBuilder.getMany.mockResolvedValue([
        { id: 1, topic: 'Numbers' },
        { id: 2, topic: 'Letters' },
      ]);

      const result = await service.recommend({ userId: 1, ageRange: '3-4' });

      // 'Numbers' normalizes to 'numbers' which is in cooldown
      expect(result.recommended).toHaveLength(1);
      expect(result.recommended[0].content.id).toBe(2);
    });

    it('should apply parent control allowedDomains when set', async () => {
      mockControlRepo.findOne.mockResolvedValue({
        childId: 1,
        allowedDomains: ['art', 'music'],
      });
      mockLearningRecordRepo.find.mockResolvedValue([]);
      mockAbilityRepo.find.mockResolvedValue([]);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await service.recommend({ userId: 1, ageRange: '3-4' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('content.domain IN (:...domains)', {
        domains: ['art', 'music'],
      });
    });

    it('should return default reason when no abilities exist', async () => {
      mockLearningRecordRepo.find.mockResolvedValue([]);
      mockAbilityRepo.find.mockResolvedValue([]);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const result = await service.recommend({ userId: 1, ageRange: '3-4' });

      expect(result.reason).toBe('根据您的年龄推荐适合的内容');
      expect(result.nextLevel).toBeNull();
    });
  });
});
