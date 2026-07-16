import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Poem } from './entities/poem.entity';
import { Author } from './entities/author.entity';
import { Dynasty } from './entities/dynasty.entity';

@Injectable()
export class PoetryService {
  constructor(
    @InjectRepository(Poem, 'poetry')
    private poemRepository: Repository<Poem>,
    @InjectRepository(Author, 'poetry')
    private authorRepository: Repository<Author>,
    @InjectRepository(Dynasty, 'poetry')
    private dynastyRepository: Repository<Dynasty>,
  ) {}

  // 获取诗词列表（分页）
  async findAll(page = 1, pageSize = 20, lang = 'zh-Hans') {
    const [list, total] = await this.poemRepository.findAndCount({
      relations: ['author', 'dynasty'],
      skip: (page - 1) * pageSize,
      take: pageSize,
      order: { id: 'DESC' },
    });

    return {
      list: list.map(p => this.formatPoem(p, lang)),
      total,
      page,
      pageSize,
    };
  }

  // 获取单首诗词
  async findById(id: number, lang = 'zh-Hans') {
    const poem = await this.poemRepository.findOne({
      where: { id },
      relations: ['author', 'dynasty'],
    });
    return poem ? this.formatPoem(poem, lang) : null;
  }

  // 随机诗词
  async findRandom(filters: { author?: string; dynasty?: string; type?: string; char?: string } = {}, lang = 'zh-Hans') {
    const qb = this.poemRepository.createQueryBuilder('poem')
      .leftJoinAndSelect('poem.author', 'author')
      .leftJoinAndSelect('poem.dynasty', 'dynasty');

    if (filters.author) {
      qb.andWhere('author.name LIKE :author', { author: `%${filters.author}%` });
    }
    if (filters.dynasty) {
      qb.andWhere('dynasty.name = :dynasty', { dynasty: filters.dynasty });
    }
    if (filters.type) {
      qb.andWhere('poem.type = :type', { type: filters.type });
    }
    if (filters.char) {
      qb.andWhere('poem.content LIKE :char', { char: `%${filters.char}%` });
    }

    // SQLite 随机排序
    qb.orderBy('RANDOM()').limit(1);

    const poem = await qb.getOne();
    return poem ? this.formatPoem(poem, lang) : null;
  }

  // 搜索诗词
  async search(query: string, searchType = 'all', page = 1, pageSize = 20, lang = 'zh-Hans') {
    const qb = this.poemRepository.createQueryBuilder('poem')
      .leftJoinAndSelect('poem.author', 'author')
      .leftJoinAndSelect('poem.dynasty', 'dynasty');

    if (searchType === 'title') {
      qb.where('poem.title LIKE :query', { query: `%${query}%` });
    } else if (searchType === 'content') {
      qb.where('poem.content LIKE :query', { query: `%${query}%` });
    } else if (searchType === 'author') {
      qb.where('author.name LIKE :query', { query: `%${query}%` });
    } else {
      // all - 全文搜索
      qb.where(
        '(poem.title LIKE :query OR poem.content LIKE :query OR author.name LIKE :query)',
        { query: `%${query}%` }
      );
    }

    const [list, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {
      list: list.map(p => this.formatPoem(p, lang)),
      total,
      page,
      pageSize,
    };
  }

  // 获取作者列表
  async findAuthors(page = 1, pageSize = 20) {
    const [list, total] = await this.authorRepository.findAndCount({
      skip: (page - 1) * pageSize,
      take: pageSize,
      order: { id: 'ASC' },
    });

    return { list, total, page, pageSize };
  }

  // 获取朝代列表
  async findDynasties() {
    return this.dynastyRepository.find({
      order: { sortOrder: 'ASC' },
    });
  }

  // 获取统计信息
  async getStatistics() {
    const totalPoems = await this.poemRepository.count();
    const totalAuthors = await this.authorRepository.count();

    const poemsByDynasty = await this.poemRepository
      .createQueryBuilder('poem')
      .select('dynasty.name', 'name')
      .addSelect('COUNT(poem.id)', 'count')
      .leftJoin('poem.dynasty', 'dynasty')
      .groupBy('dynasty.id')
      .orderBy('count', 'DESC')
      .getRawMany();

    return {
      totalPoems,
      totalAuthors,
      poemsByDynasty,
    };
  }

  // 格式化诗词输出（支持简繁切换）
  private formatPoem(poem: Poem, lang: string) {
    const isTraditional = lang === 'zh-Hant';
    return {
      id: poem.id,
      title: isTraditional && poem.titleZhHant ? poem.titleZhHant : poem.title,
      content: isTraditional && poem.contentZhHant ? poem.contentZhHant : poem.content,
      type: poem.type,
      author: poem.author ? {
        id: poem.author.id,
        name: isTraditional && poem.author.nameZhHant ? poem.author.nameZhHant : poem.author.name,
      } : null,
      dynasty: poem.dynasty ? {
        id: poem.dynasty.id,
        name: isTraditional && poem.dynasty.nameZhHant ? poem.dynasty.nameZhHant : poem.dynasty.name,
      } : null,
    };
  }
}
