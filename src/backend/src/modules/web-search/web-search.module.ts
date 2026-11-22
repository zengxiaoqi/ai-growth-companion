import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebSearchService } from './web-search.service';
import { WebSearchTool } from '../../agent-framework/tools/impl/web-search';

@Module({
  imports: [ConfigModule],
  providers: [WebSearchService, WebSearchTool],
  exports: [WebSearchService],
})
export class WebSearchModule {}
