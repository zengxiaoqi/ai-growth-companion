import { Injectable, Logger } from '@nestjs/common';
import { WebSearchService } from '../../../web-search/web-search.service';

@Injectable()
export class WebSearchTool {
  private readonly logger = new Logger(WebSearchTool.name);

  constructor(private readonly webSearchService: WebSearchService) {}

  async execute(args: { query: string; maxResults?: number }): Promise<string> {
    if (!this.webSearchService.isEnabled) {
      return JSON.stringify({ error: '联网搜索未配置' });
    }
    try {
      const results = await this.webSearchService.search(args.query, {
        maxResults: args.maxResults,
      });
      return JSON.stringify({
        query: args.query,
        provider: this.webSearchService.provider,
        results,
      });
    } catch (error: any) {
      this.logger.warn(`webSearch failed: ${error?.message || 'unknown'}`);
      return JSON.stringify({ error: `联网搜索失败: ${error?.message || 'unknown'}` });
    }
  }
}
