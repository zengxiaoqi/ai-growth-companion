/**
 * SearchContentTool — searches learning content by keywords.
 * Migrated from modules/ai/agent/tools/search-content.ts
 */

import { Injectable } from '@nestjs/common';
import { ContentsService } from '../../../modules/contents/contents.service';
import { BaseTool } from '../base-tool';
import { RegisterTool } from '../decorators/register-tool';
import type { ToolMetadata, ToolResult, ToolExecutionContext } from '../../core';

type SearchContentInput = { keyword: string; ageGroup?: string; limit?: number };

@Injectable()
@RegisterTool()
export class SearchContentTool extends BaseTool<SearchContentInput> {
  readonly metadata: ToolMetadata = {
    name: 'searchContent',
    description: '搜索学习内容，根据关键词查找适合的学习材料',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '搜索关键词' },
        ageGroup: { type: 'string', description: '年龄段筛选 (3-4 或 5-6)' },
        limit: { type: 'number', description: '返回数量限制，默认10' },
      },
      required: ['keyword'],
    },
    concurrencySafe: true,
    readOnly: true,
    requiresChildId: false,
    requiresParentId: false,
    requiresAgeGroup: false,
  };

  constructor(private readonly contentsService: ContentsService) {
    super();
  }

  async execute(args: SearchContentInput, _context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await this.contentsService.findAll();
      const keyword = args.keyword.toLowerCase();
      const limit = args.limit || 10;

      const allContents = Array.isArray(result?.list) ? result.list : [];
      const filtered = allContents
        .filter((c: any) => {
          const text = `${c.title} ${c.description} ${c.domain}`.toLowerCase();
          return text.includes(keyword);
        })
        .filter((c: any) => {
          if (args.ageGroup) return c.ageGroup === args.ageGroup;
          return true;
        })
        .slice(0, limit)
        .map((c: any) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          domain: c.domain,
          ageGroup: c.ageGroup,
          type: c.type,
        }));

      return this.ok({ keyword: args.keyword, results: filtered, total: filtered.length });
    } catch (error: any) {
      return this.fail(`搜索内容失败: ${error.message}`);
    }
  }
}
