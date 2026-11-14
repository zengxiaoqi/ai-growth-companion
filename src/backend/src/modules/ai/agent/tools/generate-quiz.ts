import { Injectable } from '@nestjs/common';
import { GenerateActivityTool } from './generate-activity';

/**
 * Thin delegate over GenerateActivityTool (the single LLM quiz engine with
 * sanitize + topic alignment + L1/L2 answer validation). Kept as a separate
 * tool name for the agent registry; output contract unchanged.
 */
@Injectable()
export class GenerateQuizTool {
  constructor(private readonly generateActivityTool: GenerateActivityTool) {}

  async execute(args: { topic: string; difficulty: number; ageGroup: string }): Promise<string> {
    try {
      const activityJson = await this.generateActivityTool.execute({
        type: 'quiz',
        topic: args.topic,
        difficulty: args.difficulty,
        ageGroup: args.ageGroup,
      });
      const activity = JSON.parse(activityJson);
      return JSON.stringify({
        questions: activity.questions,
        topic: args.topic,
        ageGroup: args.ageGroup,
      });
    } catch (error: any) {
      return JSON.stringify({ error: `生成测验失败: ${error.message}` });
    }
  }
}