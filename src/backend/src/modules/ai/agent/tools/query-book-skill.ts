import { Injectable, Logger } from '@nestjs/common';
import { BookSkillService } from '../../../book-skill/book-skill.service';

@Injectable()
export class QueryBookSkillTool {
  private readonly logger = new Logger(QueryBookSkillTool.name);

  constructor(private readonly bookSkillService: BookSkillService) {}

  async execute(args: {
    query: string;
    bookId?: number;
    limit?: number;
    ageGroup?: string;
  }): Promise<string> {
    try {
      const { query, bookId, limit = 5, ageGroup } = args;

      if (!query?.trim()) {
        return JSON.stringify({ message: '请提供搜索关键词', results: [] });
      }

      // Search across chapters, terms, and patterns
      const results = await this.bookSkillService.search(query, {
        bookId,
        ageGroup,
        limit,
      });

      const hasResults =
        results.chapters.length > 0 || results.terms.length > 0 || results.patterns.length > 0;

      if (!hasResults) {
        return JSON.stringify({
          message: `没有找到与"${query}"相关的知识内容`,
          results: [],
        });
      }

      // Format results for the agent
      const formatted = {
        message: `找到以下与"${query}"相关的知识内容：`,
        results: {
          chapters: results.chapters.map((ch) => ({
            bookId: ch.bookSkillId,
            index: ch.index,
            title: ch.title,
            summary: ch.summary?.slice(0, 500),
          })),
          terms: results.terms.map((t) => ({
            bookId: t.bookSkillId,
            term: t.term,
            definition: t.definition,
          })),
          patterns: results.patterns.map((p) => ({
            bookId: p.bookSkillId,
            name: p.name,
            description: p.description?.slice(0, 300),
          })),
        },
      };

      return JSON.stringify(formatted);
    } catch (error) {
      this.logger.error(`QueryBookSkill failed: ${error.message}`);
      return JSON.stringify({ error: `查询知识书失败: ${error.message}` });
    }
  }
}
