import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { BookSkill } from './book-skill.entity';
import { BookSkillChapter } from './book-skill-chapter.entity';
import { BookSkillTerm } from './book-skill-term.entity';
import { BookSkillPattern } from './book-skill-pattern.entity';

@Injectable()
export class BookSkillService {
  private readonly logger = new Logger(BookSkillService.name);

  constructor(
    @InjectRepository(BookSkill)
    private readonly bookRepo: Repository<BookSkill>,
    @InjectRepository(BookSkillChapter)
    private readonly chapterRepo: Repository<BookSkillChapter>,
    @InjectRepository(BookSkillTerm)
    private readonly termRepo: Repository<BookSkillTerm>,
    @InjectRepository(BookSkillPattern)
    private readonly patternRepo: Repository<BookSkillPattern>,
  ) {}

  /** Create a new book-skill record (initial state: processing) */
  async create(data: {
    title: string;
    author?: string;
    filePath: string;
    fileType: string;
    fileSize: number;
    uploaderId: number;
    ageGroup?: string;
  }): Promise<BookSkill> {
    const book = this.bookRepo.create({
      title: data.title,
      author: data.author || null,
      filePath: data.filePath,
      fileType: data.fileType,
      fileSize: data.fileSize,
      uploaderId: data.uploaderId,
      ageGroup: data.ageGroup || null,
      status: 'processing',
    });
    return this.bookRepo.save(book);
  }

  /** List books uploaded by a user (or all books for children) */
  async list(params: {
    uploaderId?: number;
    ageGroup?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: BookSkill[]; total: number }> {
    const { uploaderId, ageGroup, status, page = 1, limit = 20 } = params;
    const where: any = {};

    if (uploaderId != null) where.uploaderId = uploaderId;
    if (ageGroup) where.ageGroup = ageGroup;
    if (status) where.status = status;

    const [items, total] = await this.bookRepo.findAndCount({
      where,
      order: { updatedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, total };
  }

  /** Get book detail with chapter count (no full content) */
  async getDetail(id: number): Promise<BookSkill> {
    const book = await this.bookRepo.findOne({
      where: { id },
      relations: ['chapters', 'terms', 'patterns'],
    });
    if (!book) throw new NotFoundException('知识书不存在');
    return book;
  }

  /** Get chapters for a book (without full content by default) */
  async getChapters(bookId: number, withContent = false): Promise<BookSkillChapter[]> {
    const book = await this.bookRepo.findOne({ where: { id: bookId } });
    if (!book) throw new NotFoundException('知识书不存在');

    const select = withContent
      ? undefined
      : (['id', 'bookSkillId', 'index', 'title', 'summary', 'keyPoints'] as any);

    return this.chapterRepo.find({
      where: { bookSkillId: bookId },
      order: { index: 'ASC' },
      ...(select ? ({ select } as any) : {}),
    });
  }

  /** Get a single chapter with full content */
  async getChapter(bookId: number, chapterIndex: number): Promise<BookSkillChapter> {
    const chapter = await this.chapterRepo.findOne({
      where: { bookSkillId: bookId, index: chapterIndex },
    });
    if (!chapter) throw new NotFoundException('章节不存在');
    return chapter;
  }

  /** Get terms for a book */
  async getTerms(bookId: number): Promise<BookSkillTerm[]> {
    return this.termRepo.find({
      where: { bookSkillId: bookId },
      order: { term: 'ASC' },
    });
  }

  /** Get patterns for a book */
  async getPatterns(bookId: number): Promise<BookSkillPattern[]> {
    return this.patternRepo.find({
      where: { bookSkillId: bookId },
      order: { category: 'ASC', name: 'ASC' },
    });
  }

  /** Full-text search across all books */
  async search(
    query: string,
    options?: {
      bookId?: number;
      ageGroup?: string;
      limit?: number;
    },
  ): Promise<{
    chapters: any[];
    terms: any[];
    patterns: any[];
  }> {
    const q = `%${query}%`;
    const limit = options?.limit || 5;
    const bookId = options?.bookId;

    const chapterWhere: any = {};
    const termWhere: any = {};
    const patternWhere: any = {};
    if (bookId) {
      chapterWhere.bookSkillId = bookId;
      termWhere.bookSkillId = bookId;
      patternWhere.bookSkillId = bookId;
    }

    const [chapters, terms, patterns] = await Promise.all([
      this.chapterRepo.find({
        where: [
          { ...chapterWhere, title: Like(q) },
          { ...chapterWhere, summary: Like(q) },
          { ...chapterWhere, keyPoints: Like(q) },
        ],
        take: limit,
        order: { bookSkillId: 'ASC', index: 'ASC' },
      }),
      this.termRepo.find({
        where: [
          { ...termWhere, term: Like(q) },
          { ...termWhere, definition: Like(q) },
        ],
        take: limit,
        order: { term: 'ASC' },
      }),
      this.patternRepo.find({
        where: [
          { ...patternWhere, name: Like(q) },
          { ...patternWhere, description: Like(q) },
        ],
        take: limit,
        order: { name: 'ASC' },
      }),
    ]);

    return { chapters, terms, patterns };
  }

  /** Update book status after extraction */
  async updateStatus(
    id: number,
    data: {
      status: string;
      title?: string;
      author?: string;
      description?: string;
      totalChapters?: number;
      errorMessage?: string;
      ageGroup?: string;
    },
  ): Promise<BookSkill> {
    const book = await this.bookRepo.findOne({ where: { id } });
    if (!book) throw new NotFoundException('知识书不存在');

    Object.assign(book, data);
    return this.bookRepo.save(book);
  }

  /** Save chapters after extraction */
  async saveChapters(
    bookId: number,
    chapters: Array<{
      index: number;
      title: string;
      summary: string;
      content?: string;
      keyPoints?: string;
    }>,
  ): Promise<BookSkillChapter[]> {
    // Remove old chapters
    await this.chapterRepo.delete({ bookSkillId: bookId });

    const entities = chapters.map((ch) => this.chapterRepo.create({ ...ch, bookSkillId: bookId }));
    return this.chapterRepo.save(entities);
  }

  /** Save terms after extraction */
  async saveTerms(
    bookId: number,
    terms: Array<{
      term: string;
      definition: string;
      chapterRef?: string;
    }>,
  ): Promise<BookSkillTerm[]> {
    await this.termRepo.delete({ bookSkillId: bookId });
    const entities = terms.map((t) => this.termRepo.create({ ...t, bookSkillId: bookId }));
    return this.termRepo.save(entities);
  }

  /** Save patterns after extraction */
  async savePatterns(
    bookId: number,
    patterns: Array<{
      name: string;
      description: string;
      category?: string;
    }>,
  ): Promise<BookSkillPattern[]> {
    await this.patternRepo.delete({ bookSkillId: bookId });
    const entities = patterns.map((p) => this.patternRepo.create({ ...p, bookSkillId: bookId }));
    return this.patternRepo.save(entities);
  }

  /** Delete a book and all its content */
  async delete(id: number, userId: number): Promise<void> {
    const book = await this.bookRepo.findOne({ where: { id } });
    if (!book) throw new NotFoundException('知识书不存在');
    if (book.uploaderId !== userId) {
      throw new BadRequestException('无权删除他人上传的知识书');
    }
    await this.bookRepo.remove(book);
  }

  /** Increment view count */
  async recordView(id: number): Promise<void> {
    await this.bookRepo.increment({ id }, 'viewCount', 1);
  }
}
