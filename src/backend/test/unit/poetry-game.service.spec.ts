import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PoetryGameService } from '../../src/modules/poetry/poetry-game.service';
import { Poem } from '../../src/modules/poetry/entities/poem.entity';
import { Author } from '../../src/modules/poetry/entities/author.entity';
import { Dynasty } from '../../src/modules/poetry/entities/dynasty.entity';

describe('PoetryGameService', () => {
  let service: PoetryGameService;

  const mockPoem: Poem = {
    id: 1,
    title: '静夜思',
    content: '床前明月光\n疑是地上霜\n举头望明月\n低头思故乡',
    authorId: 1,
    dynastyId: 1,
    type: '五言绝句',
    titleZhHant: null,
    contentZhHant: null,
    author: { id: 1, name: '李白', nameZhHant: null, dynastyId: 1 } as Author,
    dynasty: { id: 1, name: '唐', nameZhHant: null, sortOrder: 1 } as Dynasty,
  } as Poem;

  const mockShortPoem: Poem = {
    id: 2,
    title: '短诗',
    content: '一二三',
    authorId: null,
    dynastyId: null,
    type: null,
    titleZhHant: null,
    contentZhHant: null,
    author: null,
    dynasty: null,
  } as Poem;

  // Mock wrong poems for solitaire distractors
  const mockWrongPoems1: Poem = {
    id: 10,
    title: '望庐山瀑布',
    content: '日照香炉生紫烟\n遥看瀑布挂前川\n飞流直下三千尺\n疑是银河落九天',
    authorId: 1,
    dynastyId: 1,
    type: null,
    titleZhHant: null,
    contentZhHant: null,
    author: { id: 1, name: '李白', nameZhHant: null, dynastyId: 1 } as Author,
    dynasty: { id: 1, name: '唐', nameZhHant: null, sortOrder: 1 } as Dynasty,
  } as Poem;

  const mockWrongPoems2: Poem = {
    id: 11,
    title: '春晓',
    content: '春眠不觉晓\n处处闻啼鸟\n夜来风雨声\n花落知多少',
    authorId: 1,
    dynastyId: 1,
    type: null,
    titleZhHant: null,
    contentZhHant: null,
    author: { id: 1, name: '孟浩然', nameZhHant: null, dynastyId: 1 } as Author,
    dynasty: { id: 1, name: '唐', nameZhHant: null, sortOrder: 1 } as Dynasty,
  } as Poem;

  // QueryBuilder chain mock — a single persistent object that tests can override
  const qbChain = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
    getMany: jest.fn(),
    getRawMany: jest.fn(),
    getManyAndCount: jest.fn(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getCount: jest.fn(),
    leftJoin: jest.fn().mockReturnThis(),
  };

  const mockPoemRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(qbChain),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PoetryGameService,
        { provide: getRepositoryToken(Poem, 'poetry'), useValue: mockPoemRepository },
      ],
    }).compile();

    service = module.get<PoetryGameService>(PoetryGameService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateFillBlank', () => {
    beforeEach(() => {
      qbChain.getOne.mockResolvedValue(mockPoem);
      qbChain.leftJoinAndSelect.mockReturnThis();
      qbChain.orderBy.mockReturnThis();
      qbChain.limit.mockReturnThis();
    });

    it('should return correct shape with all required fields', async () => {
      const result = await service.generateFillBlank('medium');

      expect(result).not.toBeNull();
      expect(result!.poemId).toBe(1);
      expect(result!.title).toBe('静夜思');
      expect(result!.authorName).toBe('李白');
      expect(result!.dynastyName).toBe('唐');
      expect(Array.isArray(result!.lines)).toBe(true);
      expect(result!.lines.length).toBeGreaterThan(0);
      expect(Array.isArray(result!.blankIndices)).toBe(true);
      expect(result!.blankIndices.length).toBeGreaterThan(0);
      expect(Array.isArray(result!.answers)).toBe(true);
      expect(result!.answers.length).toBe(result!.blankIndices.length);
      expect(Array.isArray(result!.candidates)).toBe(true);
      expect(result!.candidates.length).toBeGreaterThan(0);
      expect(result!.appreciation).toBeNull();
    });

    it('should include all answers in candidates', async () => {
      const result = await service.generateFillBlank('medium');

      expect(result).not.toBeNull();
      for (const ans of result!.answers) {
        expect(result!.candidates).toContain(ans);
      }
    });

    it('should have 2 blanks on easy difficulty', async () => {
      const result = await service.generateFillBlank('easy');

      expect(result).not.toBeNull();
      expect(result!.blankIndices.length).toBe(2);
    });

    it('should have 3 blanks on medium difficulty', async () => {
      const result = await service.generateFillBlank('medium');

      expect(result).not.toBeNull();
      expect(result!.blankIndices.length).toBe(3);
    });

    it('should have 5 blanks on hard difficulty (or capped by chars/3)', async () => {
      const result = await service.generateFillBlank('hard');

      expect(result).not.toBeNull();
      // For 20 Chinese chars: floor(20/3) = 6, so should have min(5, 6) = 5
      expect(result!.blankIndices.length).toBeLessThanOrEqual(5);
      expect(result!.blankIndices.length).toBeGreaterThan(0);
    });

    it('should return null when no poem is found', async () => {
      qbChain.getOne.mockResolvedValue(null);

      const result = await service.generateFillBlank('medium');

      expect(result).toBeNull();
    });

    it('should retry and return null if all attempts yield <5 Chinese chars', async () => {
      // First call returns short poem, second fails, third succeeds with short
      qbChain.getOne.mockResolvedValueOnce(mockShortPoem).mockResolvedValueOnce(null);

      const result = await service.generateFillBlank('hard');

      expect(result).toBeNull();
    });

    it('should use 佚名 when poem has no author', async () => {
      const poemNoAuthor: Poem = {
        id: 3,
        title: '无名诗',
        content: '床前明月光疑是地上霜举头望明月低头思故乡',
        authorId: null,
        dynastyId: null,
        type: null,
        titleZhHant: null,
        contentZhHant: null,
        author: null,
        dynasty: { id: 1, name: '唐', nameZhHant: null, sortOrder: 1 } as Dynasty,
      } as Poem;
      qbChain.getOne.mockResolvedValue(poemNoAuthor);

      const result = await service.generateFillBlank('easy');

      expect(result!.authorName).toBe('佚名');
    });

    it('should use empty string when poem has no dynasty', async () => {
      const poemNoDynasty: Poem = {
        id: 4,
        title: '无朝代诗',
        content: '床前明月光疑是地上霜举头望明月低头思故乡',
        authorId: null,
        dynastyId: null,
        type: null,
        titleZhHant: null,
        contentZhHant: null,
        author: { id: 1, name: '李白', nameZhHant: null, dynastyId: 1 } as Author,
        dynasty: null,
      } as Poem;
      qbChain.getOne.mockResolvedValue(poemNoDynasty);

      const result = await service.generateFillBlank('easy');

      expect(result!.dynastyName).toBe('');
    });

    it('should only blank Chinese characters', async () => {
      const poemWithPunctuation: Poem = {
        id: 5,
        title: '带标点诗',
        content: '床前明月光，疑是地上霜。',
        authorId: null,
        dynastyId: null,
        type: null,
        titleZhHant: null,
        contentZhHant: null,
        author: null,
        dynasty: null,
      } as Poem;
      qbChain.getOne.mockResolvedValue(poemWithPunctuation);

      const result = await service.generateFillBlank('easy');

      expect(result).not.toBeNull();
      for (const ans of result!.answers) {
        expect(/[\u4e00-\u9fa5]/.test(ans)).toBe(true);
      }
    });
  });

  describe('getFlyingFlower', () => {
    beforeEach(() => {
      qbChain.getMany.mockResolvedValue([mockPoem]);
      qbChain.leftJoinAndSelect.mockReturnThis();
      qbChain.where.mockReturnThis();
      qbChain.orderBy.mockReturnThis();
      qbChain.limit.mockReturnThis();
    });

    it('should return {keyword, entries[]} with correct field names', async () => {
      const result = await service.getFlyingFlower('月');

      expect(result).not.toBeNull();
      expect(result!.keyword).toBe('月');
      expect(Array.isArray(result!.entries)).toBe(true);
      expect(result!.entries.length).toBeGreaterThan(0);
    });

    it('should return entries with poemId, title, authorName, dynastyName, line, fullContent', async () => {
      const result = await service.getFlyingFlower('月');

      expect(result).not.toBeNull();
      const entry = result!.entries[0];
      expect(entry.poemId).toBe(1);
      expect(entry.title).toBe('静夜思');
      expect(entry.authorName).toBe('李白');
      expect(entry.dynastyName).toBe('唐');
      expect(entry.line).toBeDefined();
      expect(typeof entry.line).toBe('string');
      expect(entry.fullContent).toBe('床前明月光\n疑是地上霜\n举头望明月\n低头思故乡');
    });

    it('should find the line containing the keyword', async () => {
      const result = await service.getFlyingFlower('月');

      expect(result).not.toBeNull();
      expect(result!.entries[0].line).toContain('月');
    });

    it('should accept keyword parameter and use it', async () => {
      const result = await service.getFlyingFlower('春');

      expect(result).not.toBeNull();
      expect(result!.keyword).toBe('春');
    });

    it('should use 佚名 when poem has no author', async () => {
      qbChain.getMany.mockResolvedValue([{ ...mockShortPoem, author: null, dynasty: null }] as any);

      const result = await service.getFlyingFlower('一');

      expect(result!.entries[0].authorName).toBe('佚名');
    });

    it('should use empty string when poem has no dynasty', async () => {
      qbChain.getMany.mockResolvedValue([{ ...mockShortPoem, dynasty: null }] as any);

      const result = await service.getFlyingFlower('一');

      expect(result!.entries[0].dynastyName).toBe('');
    });

    it('should return null when no poems contain the character', async () => {
      qbChain.getMany.mockResolvedValue([]);

      const result = await service.getFlyingFlower('不存在字');

      expect(result).toBeNull();
    });

    it('should fall back to first line when no line contains the character', async () => {
      const poem: Poem = {
        id: 10,
        title: '无月诗',
        content: '一二三四五\n六七八九十',
        authorId: null,
        dynastyId: null,
        type: null,
        titleZhHant: null,
        contentZhHant: null,
        author: null,
        dynasty: null,
      } as Poem;
      qbChain.getMany.mockResolvedValue([poem]);

      const result = await service.getFlyingFlower('月');

      expect(result).not.toBeNull();
      expect(result!.entries[0].line).toBe('一二三四五');
    });
  });

  describe('getSolitaire', () => {
    beforeEach(() => {
      qbChain.getOne.mockResolvedValue(mockPoem);
      qbChain.getMany.mockResolvedValue([]);
      qbChain.leftJoinAndSelect.mockReturnThis();
      qbChain.orderBy.mockReturnThis();
      qbChain.limit.mockReturnThis();
      qbChain.where.mockReturnThis();
    });

    it('should return correct shape with all required fields', async () => {
      // Provide wrong poems with multiple lines for distractors
      qbChain.getMany.mockResolvedValue([mockWrongPoems1, mockWrongPoems2]);

      const result = await service.getSolitaire();

      expect(result).not.toBeNull();
      expect(result!.poemId).toBe(1);
      expect(result!.title).toBe('静夜思');
      expect(result!.authorName).toBe('李白');
      expect(result!.dynastyName).toBe('唐');
      expect(typeof result!.currentLine).toBe('string');
      expect(Array.isArray(result!.options)).toBe(true);
      expect(typeof result!.correctIndex).toBe('number');
    });

    it('should include currentLine as the first line of the poem', async () => {
      qbChain.getMany.mockResolvedValue([mockWrongPoems1, mockWrongPoems2]);

      const result = await service.getSolitaire();

      expect(result).not.toBeNull();
      expect(result!.currentLine).toBe('床前明月光');
    });

    it('should have options array containing at least 4 items', async () => {
      qbChain.getMany.mockResolvedValue([mockWrongPoems1, mockWrongPoems2]);

      const result = await service.getSolitaire();

      expect(result).not.toBeNull();
      expect(result!.options.length).toBeGreaterThanOrEqual(4);
    });

    it('should have correctIndex within bounds', async () => {
      qbChain.getMany.mockResolvedValue([mockWrongPoems1, mockWrongPoems2]);

      const result = await service.getSolitaire();

      expect(result).not.toBeNull();
      expect(result!.correctIndex).toBeGreaterThanOrEqual(0);
      expect(result!.correctIndex).toBeLessThan(result!.options.length);
    });

    it('should point correctIndex to the correct answer (second line)', async () => {
      qbChain.getMany.mockResolvedValue([mockWrongPoems1, mockWrongPoems2]);

      const result = await service.getSolitaire();

      expect(result).not.toBeNull();
      expect(result!.options[result!.correctIndex]).toBe('疑是地上霜');
    });

    it('should use 佚名 when poem has no author', async () => {
      const poemNoAuthor: Poem = {
        id: 3,
        title: '无名接龙',
        content: '第一句\n第二句\n第三句\n第四句',
        authorId: null,
        dynastyId: null,
        type: null,
        titleZhHant: null,
        contentZhHant: null,
        author: null,
        dynasty: { id: 1, name: '唐', nameZhHant: null, sortOrder: 1 } as Dynasty,
      } as Poem;
      qbChain.getOne.mockResolvedValue(poemNoAuthor);
      qbChain.getMany.mockResolvedValue([mockWrongPoems1, mockWrongPoems2]);

      const result = await service.getSolitaire();

      expect(result!.authorName).toBe('佚名');
    });

    it('should return null when no poem is found', async () => {
      qbChain.getOne.mockResolvedValue(null);

      const result = await service.getSolitaire();

      expect(result).toBeNull();
    });

    it('should handle poem with insufficient lines by retrying', async () => {
      const oneLinePoem: Poem = {
        id: 20,
        title: '单句诗',
        content: '只有一行',
        authorId: null,
        dynastyId: null,
        type: null,
        titleZhHant: null,
        contentZhHant: null,
        author: null,
        dynasty: null,
      } as Poem;
      qbChain.getOne.mockResolvedValueOnce(oneLinePoem);
      qbChain.getOne.mockResolvedValueOnce(mockPoem);
      qbChain.getMany.mockResolvedValue([mockWrongPoems1, mockWrongPoems2]);

      const result = await service.getSolitaire();

      expect(result).not.toBeNull();
    });

    it('should return null after 5 failed attempts (all one-line poems)', async () => {
      const oneLinePoem: Poem = {
        id: 20,
        title: '单句诗',
        content: '只有一行',
        authorId: null,
        dynastyId: null,
        type: null,
        titleZhHant: null,
        contentZhHant: null,
        author: null,
        dynasty: null,
      } as Poem;
      qbChain.getOne.mockResolvedValue(oneLinePoem);

      const result = await service.getSolitaire();

      expect(result).toBeNull();
    });
  });
});
