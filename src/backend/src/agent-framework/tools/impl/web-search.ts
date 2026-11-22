/**
 * WebSearchTool — parent-facing web lookup.
 *
 * Exposed to the parent advisor and course designer agents only. Child
 * accounts are stopped by the shared tool-risk policy even if a prompt
 * injection names the tool directly.
 */

import { Injectable } from '@nestjs/common';
import { BaseTool } from '../base-tool';
import { RegisterTool } from '../decorators/register-tool';
import type { ToolMetadata, ToolResult, ToolExecutionContext } from '../../core';
import { WebSearchService } from '../../../modules/web-search/web-search.service';

type WebSearchInput = {
  query: string;
  maxResults?: number;
};

@Injectable()
@RegisterTool()
export class WebSearchTool extends BaseTool<WebSearchInput> {
  readonly metadata: ToolMetadata = {
    name: 'webSearch',
    description:
      '联网搜索公开网页资料（仅家长场景）。需要最新事实、绘本/儿歌/科普/艺术资料，或家长要求真实案例时调用；结果仅供家长参考，不要原样念给孩子。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词或一句话检索式' },
        maxResults: { type: 'number', description: '返回条数 1-10，默认 5' },
      },
      required: ['query'],
    },
    concurrencySafe: true,
    readOnly: true,
    requiresChildId: false,
    requiresParentId: false,
    requiresAgeGroup: false,
  };

  constructor(private readonly webSearchService: WebSearchService) {
    super();
  }

  async execute(args: WebSearchInput, _context: ToolExecutionContext): Promise<ToolResult> {
    if (!this.webSearchService.isEnabled) {
      return this.fail('联网搜索未配置，请让家长在服务端设置 WEB_SEARCH_PROVIDER 和密钥');
    }

    try {
      const results = await this.webSearchService.search(args.query, {
        maxResults: args.maxResults,
      });
      return this.ok({
        query: args.query,
        provider: this.webSearchService.provider,
        results,
      });
    } catch (error: any) {
      return this.fail(`联网搜索失败: ${error?.message || 'unknown'}`);
    }
  }
}
