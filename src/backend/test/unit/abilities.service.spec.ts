import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AbilitiesService } from '../../src/modules/abilities/abilities.service';
import { AbilityAssessment } from '../../src/database/entities/ability-assessment.entity';

describe('AbilitiesService', () => {
  let service: AbilitiesService;
  let mockRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AbilitiesService,
        { provide: getRepositoryToken(AbilityAssessment), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<AbilitiesService>(AbilitiesService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('should create an assessment with correct level (beginner)', async () => {
      const assessment = {
        uuid: expect.any(String),
        userId: 1,
        domain: 'math',
        score: 25,
        level: 'beginner',
        evidence: {},
      };
      mockRepo.create.mockReturnValue(assessment);
      mockRepo.save.mockResolvedValue(assessment);

      const result = await service.create(1, 'math', 25);
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, domain: 'math', score: 25, level: 'beginner' }),
      );
      expect(mockRepo.save).toHaveBeenCalledWith(assessment);
      expect(result.level).toBe('beginner');
    });

    it('should assign intermediate level for score 60-79', async () => {
      mockRepo.create.mockImplementation((data) => data);
      mockRepo.save.mockResolvedValue({ level: 'intermediate' });

      await service.create(1, 'language', 70);
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'intermediate' }),
      );
    });

    it('should assign advanced level for score >= 80', async () => {
      mockRepo.create.mockImplementation((data) => data);
      mockRepo.save.mockResolvedValue({ level: 'advanced' });

      await service.create(1, 'science', 85);
      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ level: 'advanced' }));
    });

    it('should use empty evidence object when not provided', async () => {
      mockRepo.create.mockImplementation((data) => data);
      mockRepo.save.mockResolvedValue({});

      await service.create(1, 'art', 50);
      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ evidence: {} }));
    });

    it('should pass evidence when provided', async () => {
      const evidence = { quizId: 42, correctAnswers: 8 };
      mockRepo.create.mockImplementation((data) => data);
      mockRepo.save.mockResolvedValue({});

      await service.create(1, 'math', 80, evidence);
      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ evidence }));
    });
  });

  describe('getByUser', () => {
    it('should return assessments ordered by assessedAt DESC', async () => {
      const assessments = [
        { id: 2, domain: 'math', assessedAt: new Date('2026-06-14') },
        { id: 1, domain: 'language', assessedAt: new Date('2026-06-13') },
      ];
      mockRepo.find.mockResolvedValue(assessments);

      const result = await service.getByUser(1);
      expect(mockRepo.find).toHaveBeenCalledWith({
        where: { userId: 1 },
        order: { assessedAt: 'DESC' },
      });
      expect(result).toHaveLength(2);
    });

    it('should return empty array when user has no assessments', async () => {
      mockRepo.find.mockResolvedValue([]);
      const result = await service.getByUser(999);
      expect(result).toEqual([]);
    });
  });

  describe('getLatestByDomain', () => {
    it('should return the latest assessment for a specific domain', async () => {
      const assessment = { id: 1, domain: 'math', score: 75, userId: 1 };
      mockRepo.findOne.mockResolvedValue(assessment);

      const result = await service.getLatestByDomain(1, 'math');
      expect(mockRepo.findOne).toHaveBeenCalledWith({
        where: { userId: 1, domain: 'math' },
        order: { assessedAt: 'DESC' },
      });
      expect(result).toEqual(assessment);
    });

    it('should return null when no assessment exists for domain', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      const result = await service.getLatestByDomain(1, 'art');
      expect(result).toBeNull();
    });
  });

  describe('updateWithEma', () => {
    it('keeps the raw score on the first write (no previous assessment)', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      mockRepo.create.mockImplementation((data) => data);
      mockRepo.save.mockImplementation(async (data) => data);

      const result = await service.updateWithEma(1, 'english', 70, { source: 'english-practice' });

      expect(result.score).toBe(70);
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: 'english',
          score: 70,
          evidence: expect.objectContaining({ source: 'english-practice', previousScore: null, newScore: 70 }),
        }),
      );
    });

    it('smooths subsequent writes with 0.7 previous + 0.3 new', async () => {
      mockRepo.findOne.mockResolvedValue({ score: 80 });
      mockRepo.create.mockImplementation((data) => data);
      mockRepo.save.mockImplementation(async (data) => data);

      // 0.7*80 + 0.3*40 = 56 + 12 = 68
      const result = await service.updateWithEma(1, 'english', 40);

      expect(result.score).toBe(68);
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          score: 68,
          evidence: expect.objectContaining({ previousScore: 80, newScore: 68 }),
        }),
      );
    });

    it('rounds the smoothed score to an integer', async () => {
      mockRepo.findOne.mockResolvedValue({ score: 70 });
      mockRepo.create.mockImplementation((data) => data);
      mockRepo.save.mockImplementation(async (data) => data);

      // 0.7*70 + 0.3*71 = 49 + 21.3 = 70.3 → 70
      const result = await service.updateWithEma(1, 'english', 71);
      expect(result.score).toBe(70);
    });

    it('merges caller evidence with previousScore/newScore', async () => {
      mockRepo.findOne.mockResolvedValue({ score: 50 });
      mockRepo.create.mockImplementation((data) => data);
      mockRepo.save.mockImplementation(async (data) => data);

      await service.updateWithEma(1, 'english', 90, { observedWords: ['apple'], suggestion: 'more nouns' });

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          evidence: expect.objectContaining({
            observedWords: ['apple'],
            suggestion: 'more nouns',
            previousScore: 50,
            newScore: 62, // 0.7*50 + 0.3*90 = 35 + 27
          }),
        }),
      );
    });
  });
});
