import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PoetryService } from '../../src/modules/poetry/poetry.service';
import { Poem } from '../../src/modules/poetry/entities/poem.entity';
import { Author } from '../../src/modules/poetry/entities/author.entity';
import { Dynasty } from '../../src/modules/poetry/entities/dynasty.entity';

describe('PoetryService', () => {
  let service: PoetryService;

  const mockPoem: Poem = {
    id: 1,
    title: '静夜思',
    content: '床前明月光\n疑是地上霜\n举头望明月\n低头思故乡',
    authorId: 1,
    dynastyId: 1,
    type: '五言绝句',
    titleZhHant: '靜夜思',
    contentZhHant: '床前明月光\n疑是地上霜\n舉頭望明月\n低頭思故鄉',
    author: { id: 1, name: '李白', nameZhHant: '李白', dynastyId: 1 } as Author,
    dynasty: { id: 1, name: '唐', nameZhHant: '唐', sortOrder: 1 } as Dynasty,
  } as Poem;

  const mockPoemNoRelations: Poem = {
    id: 2,
    title: '无名诗',
    content: '一二三四五',
    authorId: null,
    dynastyId: null,
    type: null,
    titleZhHant: null,
    contentZhHant: null,
    author: null,
    dynasty: null,
  } as Poem;

  // Chained mock for QueryBuilder
  const qbChain = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
    getMany: jest.fn(),
    getManyAndCount: jest.fn(),
    getCount: jest.fn(),
    addSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
  };

  const mockPoemRepository = {
    findAndCount: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn().mockResolvedValue(100),
    createQueryBuilder: jest.fn().mockReturnValue(qbChain),
  };

  const mockAuthorRepository = {
    findAndCount: jest.fn(),
    count: jest.fn().mockResolvedValue(50),
    find: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(qbChain),
  };

  const mockDynastyRepository = {
    find: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(qbChain),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PoetryService,
        { provide: getRepositoryToken(Poem, 'poetry'), useValue: mockPoemRepository },
        { provide: getRepositoryToken(Author, 'poetry'), useValue: mockAuthorRepository },
        { provide: getRepositoryToken(Dynasty, 'poetry'), useValue: mockDynastyRepository },
      ],
    }).compile();

    service = module.get<PoetryService>(PoetryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return paginated poems with formatted output', async () => {
      const mockResult: [Poem[], number] = [[mockPoem], 100];
      mockPoemRepository.findAndCount.mockResolvedValue(mockResult);

      const result = await service.findAll(1, 20, 'zh-Hans');

      expect(mockPoemRepository.findAndCount).toHaveBeenCalledWith({
        relations: ['author', 'dynasty'],
        skip: 0,
        take: 20,
        order: { id: 'DESC' },
      });
      expect(result).toEqual({
        list: [expect.objectContaining({ id: 1, title: '静夜思' })],
        total: 100,
        page: 1,
        pageSize: 20,
      });
    });

    it('should calculate correct skip for page 2', async () => {
      mockPoemRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll(2, 20);

      expect(mockPoemRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20 }),
      );
    });

    it('should use traditional Chinese when lang=zh-Hant', async () => {
      mockPoemRepository.findAndCount.mockResolvedValue([[mockPoem], 1]);

      const result = await service.findAll(1, 20, 'zh-Hant');

      expect(result.list[0].title).toBe('靜夜思');
      expect(result.list[0].content).toBe('床前明月光\n疑是地上霜\n舉頭望明月\n低頭思故鄉');
    });

    it('should fall back to simplified when zh-Hant field is null', async () => {
      mockPoemRepository.findAndCount.mockResolvedValue([[mockPoemNoRelations], 1]);

      const result = await service.findAll(1, 20, 'zh-Hant');

      expect(result.list[0].title).toBe('無名詩');
    });
  });

  describe('findById', () => {
    it('should return formatted poem when found', async () => {
      mockPoemRepository.findOne.mockResolvedValue(mockPoem);

      const result = await service.findById(1, 'zh-Hans');

      expect(mockPoemRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['author', 'dynasty'],
      });
      expect(result).toEqual(
        expect.objectContaining({
          id: 1,
          title: '静夜思',
          author: { id: 1, name: '李白' },
          dynasty: { id: 1, name: '唐' },
        }),
      );
    });

    it('should return null when poem not found', async () => {
      mockPoemRepository.findOne.mockResolvedValue(null);

      const result = await service.findById(999);

      expect(result).toBeNull();
    });

    it('should handle poems without author/dynasty', async () => {
      mockPoemRepository.findOne.mockResolvedValue(mockPoemNoRelations);

      const result = await service.findById(2, 'zh-Hans');

      expect(result.author).toBeNull();
      expect(result.dynasty).toBeNull();
    });
  });

  describe('findRandom', () => {
    beforeEach(() => {
      // Reset qb chain mocks
      qbChain.getOne.mockResolvedValue(mockPoem);
      qbChain.leftJoinAndSelect.mockReturnThis();
      qbChain.andWhere.mockReturnThis();
      qbChain.orderBy.mockReturnThis();
      qbChain.limit.mockReturnThis();
    });

    it('should return a random poem without filters', async () => {
      const result = await service.findRandom();

      expect(qbChain.leftJoinAndSelect).toHaveBeenCalledWith('poem.author', 'author');
      expect(qbChain.leftJoinAndSelect).toHaveBeenCalledWith('poem.dynasty', 'dynasty');
      expect(qbChain.orderBy).toHaveBeenCalledWith('RANDOM()');
      expect(qbChain.limit).toHaveBeenCalledWith(1);
      expect(result).toEqual(expect.objectContaining({ id: 1, title: '静夜思' }));
    });

    it('should apply author filter', async () => {
      await service.findRandom({ author: '李白' });

      expect(qbChain.andWhere).toHaveBeenCalledWith('author.name LIKE :author', {
        author: '%李白%',
      });
    });

    it('should apply dynasty filter', async () => {
      await service.findRandom({ dynasty: '唐' });

      expect(qbChain.andWhere).toHaveBeenCalledWith('dynasty.name = :dynasty', {
        dynasty: '唐',
      });
    });

    it('should apply type filter', async () => {
      await service.findRandom({ type: '五言绝句' });

      expect(qbChain.andWhere).toHaveBeenCalledWith('poem.type = :type', {
        type: '五言绝句',
      });
    });

    it('should apply char filter (for flying flower game)', async () => {
      await service.findRandom({ char: '月' });

      expect(qbChain.andWhere).toHaveBeenCalledWith('poem.content LIKE :char', {
        char: '%月%',
      });
    });

    it('should apply all filters simultaneously', async () => {
      await service.findRandom({ author: '李', dynasty: '唐', type: '五言绝句', char: '月' });

      expect(qbChain.andWhere).toHaveBeenCalledTimes(4);
    });

    it('should return null when no poem matches', async () => {
      qbChain.getOne.mockResolvedValue(null);

      const result = await service.findRandom({ author: '不存在' });

      expect(result).toBeNull();
    });
  });

  describe('search', () => {
    beforeEach(() => {
      qbChain.getManyAndCount.mockResolvedValue([[mockPoem], 1]);
      qbChain.where.mockReturnThis();
      qbChain.skip.mockReturnThis();
      qbChain.take.mockReturnThis();
    });

    it('should search by title', async () => {
      await service.search('静夜', 'title');

      expect(qbChain.where).toHaveBeenCalledWith('poem.title LIKE :query', {
        query: '%静夜%',
      });
    });

    it('should search by content', async () => {
      await service.search('明月', 'content');

      expect(qbChain.where).toHaveBeenCalledWith('poem.content LIKE :query', {
        query: '%明月%',
      });
    });

    it('should search by author name', async () => {
      await service.search('李白', 'author');

      expect(qbChain.where).toHaveBeenCalledWith('author.name LIKE :query', {
        query: '%李白%',
      });
    });

    it('should search by dynasty name', async () => {
      await service.search('唐', 'dynasty');

      expect(qbChain.where).toHaveBeenCalledWith('dynasty.name LIKE :query', {
        query: '%唐%',
      });
    });

    it('should search by poem type', async () => {
      await service.search('五言', 'poem_type');

      expect(qbChain.where).toHaveBeenCalledWith('poem.type LIKE :query', {
        query: '%五言%',
      });
    });

    it('should do full-text search when type is all', async () => {
      await service.search('月', 'all');

      expect(qbChain.where).toHaveBeenCalledWith(
        '(poem.title LIKE :query OR poem.content LIKE :query OR author.name LIKE :query)',
        { query: '%月%' },
      );
    });

    it('should default to all search when type is unrecognized', async () => {
      await service.search('月', 'unknown');

      expect(qbChain.where).toHaveBeenCalledWith(expect.stringContaining('OR'), expect.any(Object));
    });

    it('should return paginated search results', async () => {
      const result = await service.search('月', 'all', 1, 20);

      expect(qbChain.skip).toHaveBeenCalledWith(0);
      expect(qbChain.take).toHaveBeenCalledWith(20);
      expect(result).toEqual({
        list: [expect.objectContaining({ id: 1 })],
        total: 1,
        page: 1,
        pageSize: 20,
      });
    });
  });

  describe('findAuthors', () => {
    it('should return paginated authors', async () => {
      const mockAuthor = { id: 1, name: '李白', nameZhHant: '李白', dynastyId: 1 };
      mockAuthorRepository.findAndCount.mockResolvedValue([[mockAuthor], 100]);

      const result = await service.findAuthors(1, 20);

      expect(mockAuthorRepository.findAndCount).toHaveBeenCalledWith({
        skip: 0,
        take: 20,
        order: { id: 'ASC' },
      });
      expect(result).toEqual({
        list: [mockAuthor],
        total: 100,
        page: 1,
        pageSize: 20,
      });
    });
  });

  describe('findDynasties', () => {
    it('should return dynasties ordered by sortOrder', async () => {
      const mockDynasties = [
        { id: 1, name: '先秦', nameZhHant: '先秦', sortOrder: 1 },
        { id: 2, name: '汉', nameZhHant: '漢', sortOrder: 2 },
      ];
      mockDynastyRepository.find.mockResolvedValue(mockDynasties);

      const result = await service.findDynasties();

      expect(mockDynastyRepository.find).toHaveBeenCalledWith({
        order: { sortOrder: 'ASC' },
      });
      expect(result).toEqual(mockDynasties);
    });
  });

  describe('findTypes', () => {
    beforeEach(() => {
      qbChain.getRawMany.mockResolvedValue([
        { type: '五言绝句', count: '17929' },
        { type: '七言绝句', count: '87073' },
      ]);
    });

    it('should return poem types with counts ordered by descending count', async () => {
      const result = await service.findTypes();

      // Mock returns raw results; verify structure and that two items returned
      expect(result.length).toBe(2);
      expect(result[0]).toEqual({ type: '五言绝句', count: '17929' });
      expect(result[1]).toEqual({ type: '七言绝句', count: '87073' });
    });

    it('should use COUNT(*) on poem table with GROUP BY type', async () => {
      await service.findTypes();

      expect(qbChain.select).toHaveBeenCalledWith('poem.type', 'type');
      expect(qbChain.addSelect).toHaveBeenCalledWith('COUNT(*)', 'count');
      expect(qbChain.where).toHaveBeenCalledWith('poem.type IS NOT NULL');
      expect(qbChain.groupBy).toHaveBeenCalledWith('poem.type');
      expect(qbChain.orderBy).toHaveBeenCalledWith('count', 'DESC');
      expect(qbChain.getRawMany).toHaveBeenCalled();
    });
  });

  describe('getStatistics', () => {
    it('should return total poems, authors, and poems by dynasty', async () => {
      mockPoemRepository.count.mockResolvedValue(370000);
      mockAuthorRepository.count.mockResolvedValue(15000);
      qbChain.getRawMany.mockResolvedValue([
        { name: '唐', count: 50000 },
        { name: '宋', count: 280000 },
      ]);

      const result = await service.getStatistics();

      expect(result).toEqual({
        totalPoems: 370000,
        totalAuthors: 15000,
        poemsByDynasty: [
          { name: '唐', count: 50000 },
          { name: '宋', count: 280000 },
        ],
      });
    });
  });

  describe('formatPoem (private, tested via public methods)', () => {
    it('should format poem with all relations in simplified Chinese', async () => {
      mockPoemRepository.findOne.mockResolvedValue(mockPoem);

      const result = await service.findById(1, 'zh-Hans');

      expect(result).toEqual({
        id: 1,
        title: '静夜思',
        content: '床前明月光\n疑是地上霜\n举头望明月\n低头思故乡',
        type: '五言绝句',
        author: { id: 1, name: '李白' },
        dynasty: { id: 1, name: '唐' },
      });
    });

    it('should format poem with traditional Chinese fields', async () => {
      mockPoemRepository.findOne.mockResolvedValue(mockPoem);

      const result = await service.findById(1, 'zh-Hant');

      expect(result.title).toBe('靜夜思');
      expect(result.author.name).toBe('李白');
      expect(result.dynasty.name).toBe('唐');
    });

    it('should handle null author and dynasty gracefully', async () => {
      mockPoemRepository.findOne.mockResolvedValue(mockPoemNoRelations);

      const result = await service.findById(2, 'zh-Hans');

      expect(result).not.toBeNull();
      expect(result!.author).toBeNull();
      expect(result!.dynasty).toBeNull();
      expect(result!.title).toBe('无名诗');
    });
  });
});
