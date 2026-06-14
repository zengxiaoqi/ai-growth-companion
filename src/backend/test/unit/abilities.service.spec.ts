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
});
