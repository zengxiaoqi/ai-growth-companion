import { Test, TestingModule } from '@nestjs/testing';
import { ContentsService } from '../../src/modules/contents/contents.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Content } from '../../src/database/entities/content.entity';

describe('ContentsService', () => {
  let service: ContentsService;

  const mockRepository = {
    findAndCount: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentsService,
        { provide: getRepositoryToken(Content), useValue: mockRepository },
      ],
    }).compile();

    service = module.get<ContentsService>(ContentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return paginated contents', async () => {
      const mockContents = [
        { id: 1, title: '内容1', ageRange: '3-4', domain: 'language' },
        { id: 2, title: '内容2', ageRange: '3-4', domain: 'math' },
      ];
      
      mockRepository.findAndCount.mockResolvedValue([mockContents, 2]);

      const result = await service.findAll({ page: 1, limit: 10 });
      
      expect(result).toHaveProperty('list');
      expect(result.list).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter by ageRange', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ ageRange: '4-5' });
      
      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ageRange: '4-5',
            status: 'published',
          }),
        }),
      );
    });

    it('should filter by domain', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ domain: 'science' });
      
      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            domain: 'science',
            status: 'published',
          }),
        }),
      );
    });
  });

  describe('findById', () => {
    it('should return a single content by id', async () => {
      const mockContent = { id: 1, title: '内容1' };
      mockRepository.findOne.mockResolvedValue(mockContent);

      const result = await service.findById(1);
      
      expect(result).toEqual(mockContent);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('should return null if content not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findById(999);
      
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a new content', async () => {
      const data = { title: '新内容', ageRange: '3-4', domain: 'language' };
      const createdContent = { id: 1, ...data };
      
      mockRepository.create.mockReturnValue(createdContent);
      mockRepository.save.mockResolvedValue(createdContent);

      const result = await service.create(data);
      
      expect(result).toEqual(createdContent);
      expect(mockRepository.create).toHaveBeenCalledWith(data);
      expect(mockRepository.save).toHaveBeenCalledWith(createdContent);
    });
  });
});