import { Injectable } from '@nestjs/common';
import { ContentsService } from '../../../contents/contents.service';

@Injectable()
export class SearchContentTool {
  constructor(private readonly contentsService: ContentsService) {}

  async execute(args: {
    query: string;
    ageRange: string;
    domain?: string;
  }): Promise<string> {
    try {
      const result = await this.contentsService.findAll({
        ageRange: args.ageRange,
        domain: args.domain,
      });

      const keyword = args.query.toLowerCase();
      const filtered = result.list.filter(
        (c: any) =>
          c.title?.toLowerCase().includes(keyword) ||
          c.topic?.toLowerCase().includes(keyword),
      );

      if (filtered.length === 0) {
        return JSON.stringify({
          message: `没有找到与"${args.query}"相关的内容`,
          contents: [],
        });
      }

      const contents = filtered.slice(0, 5).map((c: any) => ({
        id: c.id,
        title: c.title,
        domain: c.domain,
        topic: c.topic,
        difficulty: c.difficulty,
        contentType: c.contentType,
        durationMinutes: c.durationMinutes,
      }));

      return JSON.stringify({ contents });
    } catch (error) {
      return JSON.stringify({ error: `搜索内容失败: ${error.message}` });
    }
  }
}
