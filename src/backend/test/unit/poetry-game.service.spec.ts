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

  // QueryBuilder chain mock
  const qbChain = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
    getMany: jest.fn(),
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

    it('should generate a fill-blank question from a random poem', async () => {
      const result = await service.generateFillBlank('medium');

      expect(result).not.toBeNull();
      expect(result.poemId).toBe(1);
      expect(result.title).toBe('静夜思');
      expect(result.author).toBe('李白');
      expect(result.dynasty).toBe('唐');
      expect(result.fullContent).toBe('床前明月光\n疑是地上霜\n举头望明月\n低头思故乡');
      expect(result.blankedContent).toContain('＿');
      expect(result.blanks).toBeDefined();
      expect(result.blanks.length).toBeGreaterThan(0);
      // Each blank should have position and answer
      result.blanks.forEach((b) => {
        expect(b).toHaveProperty('position');
        expect(b).toHaveProperty('answer');
        expect(typeof b.answer).toBe('string');
        expect(b.answer.length).toBe(1);
      });
    });

    it('should hide 2 characters on easy difficulty', async () => {
      const result = await service.generateFillBlank('easy');

      expect(result.blanks.length).toBe(2);
    });

    it('should hide 4 characters on medium difficulty', async () => {
      const result = await service.generateFillBlank('medium');

      expect(result.blanks.length).toBe(4);
    });

    it('should hide 6 characters on hard difficulty', async () => {
      const result = await service.generateFillBlank('hard');

      // May be capped at floor(chars/3) = floor(20/3) = 6, so 6 is fine
      expect(result.blanks.length).toBeLessThanOrEqual(6);
      expect(result.blanks.length).toBeGreaterThan(0);
    });

    it('should return null when poem has fewer than 5 Chinese characters', async () => {
      // mockShortPoem has '一二三' = 3 chars, < 5 → service returns null
      qbChain.getOne.mockResolvedValue(mockShortPoem);

      const result = await service.generateFillBlank('hard');

      expect(result).toBeNull();
    });

    it('should return null when no poem is found', async () => {
      qbChain.getOne.mockResolvedValue(null);

      const result = await service.generateFillBlank('medium');

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

      expect(result.author).toBe('佚名');
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

      expect(result.dynasty).toBe('');
    });

    it('should default to medium difficulty', async () => {
      const result = await service.generateFillBlank();

      expect(result).not.toBeNull();
      // Should have 4 blanks for medium
      expect(result.blanks.length).toBe(4);
    });

    it('should only blank Chinese characters, not punctuation', async () => {
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

      // Blanks should never be punctuation characters
      result.blanks.forEach((b) => {
        expect(b.answer).toMatch(/[\u4e00-\u9fa5]/);
      });
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

    it('should return poems containing the specified character', async () => {
      const result = await service.getFlyingFlower('月');

      expect(result).not.toBeNull();
      expect(result.char).toBe('月');
      expect(result.poems).toBeDefined();
      expect(result.poems.length).toBe(1);
      expect(result.poems[0].id).toBe(1);
      expect(result.poems[0].title).toBe('静夜思');
      expect(result.poems[0].author).toBe('李白');
    });

    it('should find the line containing the target character', async () => {
      const result = await service.getFlyingFlower('月');

      // The first line containing '月' should be '床前明月光'
      expect(result.poems[0].line).toContain('月');
    });

    it('should use a random common character when no char provided', async () => {
      const result = await service.getFlyingFlower();

      expect(result).not.toBeNull();
      const commonChars = ['月', '花', '风', '雪', '春', '秋', '山', '水', '云', '雨', '日', '夜'];
      expect(commonChars).toContain(result.char);
    });

    it('should use 佚名 when poem has no author', async () => {
      qbChain.getMany.mockResolvedValue([mockShortPoem]);

      const result = await service.getFlyingFlower('一');

      expect(result.poems[0].author).toBe('佚名');
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

      // Should still return the poem but with the first line
      expect(result).not.toBeNull();
      expect(result.poems[0].line).toBe('一二三四五');
    });
  });

  describe('getSolitaire', () => {
    beforeEach(() => {
      qbChain.getOne.mockResolvedValue(mockPoem);
      qbChain.leftJoinAndSelect.mockReturnThis();
      qbChain.where.mockReturnThis();
      qbChain.orderBy.mockReturnThis();
      qbChain.limit.mockReturnThis();
    });

    it('should return a poem with first and second lines', async () => {
      const result = await service.getSolitaire();

      expect(result).not.toBeNull();
      expect(result.poem.id).toBe(1);
      expect(result.poem.title).toBe('静夜思');
      expect(result.poem.author).toBe('李白');
      expect(result.poem.dynasty).toBe('唐');
      expect(result.prevLine).toBe('床前明月光');
      expect(result.line).toBe('疑是地上霜');
    });

    it('should filter by lastChar when provided', async () => {
      await service.getSolitaire('床');

      expect(qbChain.where).toHaveBeenCalledWith('poem.content LIKE :char', {
        char: '床%',
      });
    });

    it('should construct prevLine by replacing first char with lastChar', async () => {
      const result = await service.getSolitaire('霜');

      expect(result.prevLine).toBe('霜前明月光');
    });

    it('should return null when no poem matches lastChar', async () => {
      qbChain.getOne.mockResolvedValue(null);

      const result = await service.getSolitaire('不存在');

      expect(result).toBeNull();
    });

    it('should handle poem with only one line', async () => {
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

      expect(result).not.toBeNull();
      expect(result.prevLine).toBe('只有一行');
      expect(result.line).toBe('');
    });

    it('should handle poem with empty lines', async () => {
      const poemWithEmpty: Poem = {
        id: 21,
        title: '空行诗',
        content: '\n\n实际内容\n',
        authorId: null,
        dynastyId: null,
        type: null,
        titleZhHant: null,
        contentZhHant: null,
        author: null,
        dynasty: null,
      } as Poem;
      qbChain.getOne.mockResolvedValue(poemWithEmpty);

      const result = await service.getSolitaire();

      // Should filter out empty lines
      expect(result.prevLine).toBe('实际内容');
    });
  });
});
