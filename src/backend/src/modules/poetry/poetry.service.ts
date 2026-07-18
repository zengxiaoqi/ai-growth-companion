import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as OpenCC from 'opencc-js';
import { Poem } from './entities/poem.entity';
import { Author } from './entities/author.entity';
import { Dynasty } from './entities/dynasty.entity';

// Converter instances (created once, reused across requests)
// DB stores mostly traditional text; convert to simplified on demand
const s2tConverter = OpenCC.Converter({ from: 'cn', to: 'tw' }); // 简体→繁体
const t2sConverter = OpenCC.Converter({ from: 'tw', to: 'cn' }); // 繁体→简体

/**
 * Convert text based on lang parameter.
 * - zh-Hans: convert to simplified Chinese
 * - zh-Hant: convert to traditional Chinese
 * - default: return as-is
 */
function convertText(text: string | null | undefined, lang: string): string | null {
  if (!text) return null;
  if (lang === 'zh-Hans') return t2sConverter(text);
  if (lang === 'zh-Hant') return s2tConverter(text);
  return text;
}

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
      list: list.map((p) => this.formatPoem(p, lang)),
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
  async findRandom(
    filters: { author?: string; dynasty?: string; type?: string; char?: string } = {},
    lang = 'zh-Hans',
  ) {
    const qb = this.poemRepository
      .createQueryBuilder('poem')
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
    const qb = this.poemRepository
      .createQueryBuilder('poem')
      .leftJoinAndSelect('poem.author', 'author')
      .leftJoinAndSelect('poem.dynasty', 'dynasty');

    if (searchType === 'title') {
      qb.where('poem.title LIKE :query', { query: `%${query}%` });
    } else if (searchType === 'content') {
      qb.where('poem.content LIKE :query', { query: `%${query}%` });
    } else if (searchType === 'author') {
      qb.where('author.name LIKE :query', { query: `%${query}%` });
    } else if (searchType === 'dynasty') {
      qb.where('dynasty.name LIKE :query', { query: `%${query}%` });
    } else if (searchType === 'poem_type') {
      qb.where('poem.type LIKE :query', { query: `%${query}%` });
    } else {
      // all - 全文搜索
      qb.where('(poem.title LIKE :query OR poem.content LIKE :query OR author.name LIKE :query)', {
        query: `%${query}%`,
      });
    }

    const [list, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {
      list: list.map((p) => this.formatPoem(p, lang)),
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

  // 获取诗词体裁列表
  async findTypes() {
    const result = await this.poemRepository
      .createQueryBuilder('poem')
      .select('poem.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .where('poem.type IS NOT NULL')
      .groupBy('poem.type')
      .orderBy('count', 'DESC')
      .getRawMany();
    return result;
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
    return {
      id: poem.id,
      title: convertText(poem.title, lang),
      content: convertText(poem.content, lang),
      type: poem.type,
      author: poem.author
        ? {
            id: poem.author.id,
            name: convertText(poem.author.name, lang),
          }
        : null,
      dynasty: poem.dynasty
        ? {
            id: poem.dynasty.id,
            name: convertText(poem.dynasty.name, lang),
          }
        : null,
    };
  }
}
