import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository, DeleteResult, UpdateResult } from 'typeorm';
import { BookSkillService } from '../../src/modules/book-skill/book-skill.service';
import { BookSkill } from '../../src/modules/book-skill/book-skill.entity';
import { BookSkillChapter } from '../../src/modules/book-skill/book-skill-chapter.entity';
import { BookSkillTerm } from '../../src/modules/book-skill/book-skill-term.entity';
import { BookSkillPattern } from '../../src/modules/book-skill/book-skill-pattern.entity';

// ── Mock helpers ──────────────────────────────────────────────────────

const makeMockRepo = (): jest.Mocked<Repository<any>> =>
  ({
    create: jest.fn((data: any) => ({ ...data, id: 1 })),
    save: jest.fn(async (entities: any) =>
      Array.isArray(entities)
        ? entities.map((e: any, i: number) => ({ ...e, id: i + 1 }))
        : { ...entities, id: 1 },
    ),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    find: jest.fn(),
    delete: jest.fn(async () => ({ raw: null, affected: 1 }) as unknown as DeleteResult),
    remove: jest.fn(async () => undefined),
    increment: jest.fn(async () => ({ raw: {}, generatedMaps: [] }) as unknown as UpdateResult),
  }) as unknown as jest.Mocked<Repository<any>>;

const sampleBook: BookSkill = {
  id: 1,
  title: 'Test Book',
  author: 'Author',
  coverUrl: null,
  description: null,
  filePath: '/uploads/books/test.pdf',
  fileType: 'pdf',
  fileSize: 1024,
  totalChapters: 3,
  ageGroup: '3-4',
  status: 'ready',
  errorMessage: null,
  uploaderId: 10,
  viewCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  chapters: [],
  terms: [],
  patterns: [],
};

describe('BookSkillService', () => {
  let service: BookSkillService;
  let bookRepo: jest.Mocked<Repository<BookSkill>>;
  let chapterRepo: jest.Mocked<Repository<BookSkillChapter>>;
  let termRepo: jest.Mocked<Repository<BookSkillTerm>>;
  let patternRepo: jest.Mocked<Repository<BookSkillPattern>>;

  beforeEach(async () => {
    bookRepo = makeMockRepo() as unknown as jest.Mocked<Repository<BookSkill>>;
    chapterRepo = makeMockRepo() as unknown as jest.Mocked<Repository<BookSkillChapter>>;
    termRepo = makeMockRepo() as unknown as jest.Mocked<Repository<BookSkillTerm>>;
    patternRepo = makeMockRepo() as unknown as jest.Mocked<Repository<BookSkillPattern>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookSkillService,
        { provide: getRepositoryToken(BookSkill), useValue: bookRepo },
        { provide: getRepositoryToken(BookSkillChapter), useValue: chapterRepo },
        { provide: getRepositoryToken(BookSkillTerm), useValue: termRepo },
        { provide: getRepositoryToken(BookSkillPattern), useValue: patternRepo },
      ],
    }).compile();

    service = module.get<BookSkillService>(BookSkillService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── create ──────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a book with processing status', async () => {
      const input = {
        title: 'New Book',
        author: 'A',
        filePath: '/f.pdf',
        fileType: 'pdf',
        fileSize: 512,
        uploaderId: 5,
        ageGroup: '5-6',
      };
      bookRepo.create.mockReturnValue({ ...sampleBook, status: 'processing' } as any);
      bookRepo.save.mockImplementation(async (e: any) => ({ ...e, id: 1 }));

      const result = await service.create(input);

      expect(bookRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New Book',
          author: 'A',
          status: 'processing',
          uploaderId: 5,
          ageGroup: '5-6',
        }),
      );
      expect(bookRepo.save).toHaveBeenCalled();
      expect(result.status).toBe('processing');
    });

    it('should omit optional fields when not provided', async () => {
      bookRepo.create.mockReturnValue(sampleBook);
      bookRepo.save.mockResolvedValue(sampleBook);

      await service.create({
        title: 'No Optional',
        filePath: '/f.txt',
        fileType: 'txt',
        fileSize: 100,
        uploaderId: 1,
      });

      expect(bookRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ author: null, ageGroup: null }),
      );
    });
  });

  // ── list ────────────────────────────────────────────────────────────

  describe('list', () => {
    it('should return paginated items', async () => {
      bookRepo.findAndCount.mockResolvedValue([[sampleBook] as any, 0]);

      const result = await service.list({ page: 1, limit: 10 });

      expect(bookRepo.findAndCount).toHaveBeenCalledWith({
        where: {},
        order: { updatedAt: 'DESC' },
        skip: 0,
        take: 10,
      });
      expect(result).toEqual({ items: [sampleBook], total: 0 });
    });

    it('should filter by uploaderId', async () => {
      bookRepo.findAndCount.mockResolvedValue([[], 0]);
      await service.list({ uploaderId: 42 });
      expect(bookRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { uploaderId: 42 } }),
      );
    });

    it('should filter by ageGroup and status', async () => {
      bookRepo.findAndCount.mockResolvedValue([[], 0]);
      await service.list({ ageGroup: '3-4', status: 'ready' });
      expect(bookRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ageGroup: '3-4', status: 'ready' } }),
      );
    });

    it('should respect pagination skip/take', async () => {
      bookRepo.findAndCount.mockResolvedValue([[] as any, 100]);
      await service.list({ page: 2, limit: 5 });
      expect(bookRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 }),
      );
    });
  });

  // ── getDetail ───────────────────────────────────────────────────────

  describe('getDetail', () => {
    it('should return book with relations', async () => {
      bookRepo.findOne.mockResolvedValue(sampleBook);
      const result = await service.getDetail(1);
      expect(result).toBe(sampleBook);
      expect(bookRepo.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['chapters', 'terms', 'patterns'],
      });
    });

    it('should throw NotFoundException when book does not exist', async () => {
      bookRepo.findOne.mockResolvedValue(null);
      await expect(service.getDetail(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ── getChapters ─────────────────────────────────────────────────────

  describe('getChapters', () => {
    it('should return chapters without content', async () => {
      const chapters = [
        { id: 1, bookSkillId: 1, index: 1, title: 'Ch1', summary: '', keyPoints: '' },
        { id: 2, bookSkillId: 1, index: 2, title: 'Ch2', summary: '', keyPoints: '' },
      ];
      bookRepo.findOne.mockResolvedValue(sampleBook);
      chapterRepo.find.mockResolvedValue(chapters as any);

      const result = await service.getChapters(1, false);
      expect(chapterRepo.find).toHaveBeenCalledWith({
        where: { bookSkillId: 1 },
        order: { index: 'ASC' },
        select: ['id', 'bookSkillId', 'index', 'title', 'summary', 'keyPoints'],
      });
      expect(result).toHaveLength(2);
    });

    it('should return full chapters when withContent=true', async () => {
      bookRepo.findOne.mockResolvedValue(sampleBook);
      chapterRepo.find.mockResolvedValue([]);
      await service.getChapters(1, true);
      expect(chapterRepo.find).toHaveBeenCalledWith({
        where: { bookSkillId: 1 },
        order: { index: 'ASC' },
      });
    });

    it('should throw NotFoundException if book does not exist', async () => {
      bookRepo.findOne.mockResolvedValue(null);
      await expect(service.getChapters(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ── getChapter ──────────────────────────────────────────────────────

  describe('getChapter', () => {
    it('should return a single chapter', async () => {
      const ch = {
        id: 1,
        bookSkillId: 1,
        index: 1,
        title: 'Ch1',
        summary: '',
        content: '...',
        keyPoints: '',
      };
      chapterRepo.findOne.mockResolvedValue(ch as any);
      const result = await service.getChapter(1, 1);
      expect(result).toBe(ch);
    });

    it('should throw NotFoundException if chapter not found', async () => {
      chapterRepo.findOne.mockResolvedValue(null);
      await expect(service.getChapter(1, 999)).rejects.toThrow(NotFoundException);
    });
  });

  // ── getTerms ────────────────────────────────────────────────────────

  describe('getTerms', () => {
    it('should return all terms for a book ordered by term ASC', async () => {
      const terms = [
        { id: 1, bookSkillId: 1, term: 'Alpha', definition: 'A def' },
        { id: 2, bookSkillId: 1, term: 'Beta', definition: 'B def' },
      ];
      termRepo.find.mockResolvedValue(terms as any);
      const result = await service.getTerms(1);
      expect(result).toEqual(terms);
      expect(termRepo.find).toHaveBeenCalledWith({
        where: { bookSkillId: 1 },
        order: { term: 'ASC' },
      });
    });
  });

  // ── getPatterns ─────────────────────────────────────────────────────

  describe('getPatterns', () => {
    it('should return all patterns ordered by category then name', async () => {
      const patterns = [{ id: 1, bookSkillId: 1, name: 'A', description: 'd', category: 'cat1' }];
      patternRepo.find.mockResolvedValue(patterns as any);
      const result = await service.getPatterns(1);
      expect(patternRepo.find).toHaveBeenCalledWith({
        where: { bookSkillId: 1 },
        order: { category: 'ASC', name: 'ASC' },
      });
      expect(result).toEqual(patterns);
    });
  });

  // ── search ──────────────────────────────────────────────────────────

  describe('search', () => {
    const mockResults = {
      chapters: [{ id: 1, title: 'Match', summary: '', keyPoints: '' }],
      terms: [{ id: 1, term: 'Match', definition: 'def' }],
      patterns: [{ id: 1, name: 'Match', description: 'desc', category: 'cat' }],
    };

    it('should search across chapters, terms and patterns', async () => {
      chapterRepo.find.mockResolvedValue(mockResults.chapters as any);
      termRepo.find.mockResolvedValue(mockResults.terms as any);
      patternRepo.find.mockResolvedValue(mockResults.patterns as any);

      const result = await service.search('match');
      expect(result).toEqual(mockResults);
      // Should fire three parallel queries via Promise.all
      expect(chapterRepo.find).toHaveBeenCalledTimes(1);
      expect(termRepo.find).toHaveBeenCalledTimes(1);
      expect(patternRepo.find).toHaveBeenCalledTimes(1);
    });

    it('should apply bookId filter', async () => {
      chapterRepo.find.mockResolvedValue([] as any);
      termRepo.find.mockResolvedValue([] as any);
      patternRepo.find.mockResolvedValue([] as any);

      await service.search('test', { bookId: 5 });
      // bookId is passed into each sub-query's where clause array elements
      expect(chapterRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.any(Array) }),
      );
      const whereCalls = (chapterRepo.find as jest.Mock).mock.calls[0][0].where;
      expect(whereCalls[0]).toHaveProperty('bookSkillId', 5);
    });

    it('should use custom limit', async () => {
      chapterRepo.find.mockResolvedValue([] as any);
      termRepo.find.mockResolvedValue([] as any);
      patternRepo.find.mockResolvedValue([] as any);

      await service.search('q', { limit: 20 });
      expect(chapterRepo.find).toHaveBeenCalledWith(expect.objectContaining({ take: 20 }));
    });

    it('should default limit to 5', async () => {
      chapterRepo.find.mockResolvedValue([] as any);
      termRepo.find.mockResolvedValue([] as any);
      patternRepo.find.mockResolvedValue([] as any);

      await service.search('q');
      expect(chapterRepo.find).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
    });
  });

  // ── updateStatus ────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('should update book fields and return saved entity', async () => {
      const updated = { ...sampleBook, status: 'ready', totalChapters: 5 };
      bookRepo.findOne.mockResolvedValue(sampleBook);
      bookRepo.save.mockResolvedValue(updated);

      const result = await service.updateStatus(1, { status: 'ready', totalChapters: 5 });
      expect(result.status).toBe('ready');
      expect(bookRepo.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if book not found', async () => {
      bookRepo.findOne.mockResolvedValue(null);
      await expect(service.updateStatus(999, { status: 'ready' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── saveChapters / saveTerms / savePatterns ────────────────────────

  describe('saveChapters', () => {
    it('should delete existing and insert new chapters', async () => {
      const input = [
        { index: 1, title: 'C1', summary: 'S' },
        { index: 2, title: 'C2', summary: 'S' },
      ];
      chapterRepo.delete.mockResolvedValue({ raw: null, affected: 1 } as unknown as DeleteResult);
      chapterRepo.save.mockResolvedValue(
        input.map((c, i) => ({ ...c, id: i + 1, bookSkillId: 1 })) as any,
      );

      const result = await service.saveChapters(1, input);
      expect(chapterRepo.delete).toHaveBeenCalledWith({ bookSkillId: 1 });
      expect(chapterRepo.save).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });
  });

  describe('saveTerms', () => {
    it('should delete existing and insert new terms', async () => {
      const input = [{ term: 'Word', definition: 'Def' }];
      termRepo.delete.mockResolvedValue({ raw: null, affected: 1 } as unknown as DeleteResult);
      termRepo.save.mockResolvedValue([{ ...input[0], id: 1, bookSkillId: 1 }] as any);

      const result = await service.saveTerms(1, input);
      expect(termRepo.delete).toHaveBeenCalledWith({ bookSkillId: 1 });
      expect(result).toHaveLength(1);
    });
  });

  describe('savePatterns', () => {
    it('should delete existing and insert new patterns', async () => {
      const input = [{ name: 'P1', description: 'D' }];
      patternRepo.delete.mockResolvedValue({ raw: null, affected: 1 } as unknown as DeleteResult);
      patternRepo.save.mockResolvedValue([{ ...input[0], id: 1, bookSkillId: 1 }] as any);

      const result = await service.savePatterns(1, input);
      expect(patternRepo.delete).toHaveBeenCalledWith({ bookSkillId: 1 });
      expect(result).toHaveLength(1);
    });
  });

  // ── delete ──────────────────────────────────────────────────────────

  describe('delete', () => {
    it('should remove own book', async () => {
      bookRepo.findOne.mockResolvedValue({ ...sampleBook, uploaderId: 10 });
      await service.delete(1, 10);
      expect(bookRepo.remove).toHaveBeenCalledWith(sampleBook);
    });

    it('should throw BadRequestException for foreign book', async () => {
      bookRepo.findOne.mockResolvedValue({ ...sampleBook, uploaderId: 99 });
      await expect(service.delete(1, 10)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if book does not exist', async () => {
      bookRepo.findOne.mockResolvedValue(null);
      await expect(service.delete(999, 10)).rejects.toThrow(NotFoundException);
    });
  });

  // ── recordView ──────────────────────────────────────────────────────

  describe('recordView', () => {
    it('should increment viewCount by 1', async () => {
      (bookRepo.increment as jest.Mock).mockResolvedValue(undefined);
      await service.recordView(1);
      expect(bookRepo.increment).toHaveBeenCalledWith({ id: 1 }, 'viewCount', 1);
    });
  });
});
