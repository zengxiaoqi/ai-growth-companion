import { Injectable, Logger } from '@nestjs/common';
import { toolDefinitions } from './prompts/tool-definitions';
import { GetUserProfileTool } from './tools/get-user-profile';
import { GetAbilitiesTool } from './tools/get-abilities';
import { GetLearningHistoryTool } from './tools/get-learning-history';
import { SearchContentTool } from './tools/search-content';
import { GetRecommendationsTool } from './tools/get-recommendations';
import { GenerateQuizTool } from './tools/generate-quiz';
import { RecordLearningTool } from './tools/record-learning';
import { GetParentControlTool } from './tools/get-parent-control';
import type { ChatCompletionTool } from 'openai/resources/chat/completions/completions';

@Injectable()
export class ToolRegistry {
  private readonly logger = new Logger(ToolRegistry.name);
  private readonly handlers: Map<string, (args: any) => Promise<string>>;

  constructor(
    private readonly getUserProfileTool: GetUserProfileTool,
    private readonly getAbilitiesTool: GetAbilitiesTool,
    private readonly getLearningHistoryTool: GetLearningHistoryTool,
    private readonly searchContentTool: SearchContentTool,
    private readonly getRecommendationsTool: GetRecommendationsTool,
    private readonly generateQuizTool: GenerateQuizTool,
    private readonly recordLearningTool: RecordLearningTool,
    private readonly getParentControlTool: GetParentControlTool,
  ) {
    this.handlers = new Map([
      ['getUserProfile', (args) => this.getUserProfileTool.execute(args)],
      ['getAbilities', (args) => this.getAbilitiesTool.execute(args)],
      ['getLearningHistory', (args) => this.getLearningHistoryTool.execute(args)],
      ['searchContent', (args) => this.searchContentTool.execute(args)],
      ['getRecommendations', (args) => this.getRecommendationsTool.execute(args)],
      ['generateQuiz', (args) => this.generateQuizTool.execute(args)],
      ['recordLearning', (args) => this.recordLearningTool.execute(args)],
      ['getParentControl', (args) => this.getParentControlTool.execute(args)],
    ]);
  }

  /** Get all tool definitions for the LLM */
  getToolDefinitions(): ChatCompletionTool[] {
    return toolDefinitions;
  }

  /** Execute a tool by name and return the result string */
  async execute(toolName: string, args: Record<string, any>): Promise<string> {
    const handler = this.handlers.get(toolName);
    if (!handler) {
      this.logger.warn(`Unknown tool called: ${toolName}`);
      return JSON.stringify({ error: `未知工具: ${toolName}` });
    }

    try {
      this.logger.log(`Tool called: ${toolName}(${JSON.stringify(args).slice(0, 100)})`);
      const result = await handler(args);
      this.logger.log(`Tool ${toolName} returned: ${result.slice(0, 100)}...`);
      return result;
    } catch (error) {
      this.logger.error(`Tool ${toolName} failed: ${error.message}`);
      return JSON.stringify({ error: `工具执行失败: ${error.message}` });
    }
  }
}
