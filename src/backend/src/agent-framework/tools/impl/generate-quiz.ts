/**
 * GenerateQuizTool — thin delegate over GenerateActivityTool (the single LLM
 * quiz engine with sanitize + topic alignment + L1/L2 answer validation).
 * Kept as a separate tool name for the registry; output contract unchanged.
 */

import { Injectable } from '@nestjs/common';
import { GenerateActivityTool } from './generate-activity';
import { BaseTool } from '../base-tool';
import { RegisterTool } from '../decorators/register-tool';
import type { ToolMetadata, ToolResult, ToolExecutionContext } from '../../core';

type GenerateQuizInput = {
  topic: string;
  difficulty: number;
  ageGroup: string;
};

@Injectable()
@RegisterTool()
export class GenerateQuizTool extends BaseTool<GenerateQuizInput> {
  readonly metadata: ToolMetadata = {
    name: 'generateQuiz',
    description: '生成关于特定主题的选择题测验，包含题目、选项和答案解析',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: '测验主题' },
        difficulty: {
          type: 'number',
          description: '难度(1-简单 2-中等 3-有挑战)',
        },
        ageGroup: { type: 'string', description: '年龄段 (3-4 或 5-6)' },
      },
      required: ['topic', 'difficulty', 'ageGroup'],
    },
    concurrencySafe: false,
    readOnly: false,
    requiresChildId: false,
    requiresParentId: false,
    requiresAgeGroup: true,
  };

  constructor(private readonly generateActivityTool: GenerateActivityTool) {
    super();
  }

  async execute(args: GenerateQuizInput, context: ToolExecutionContext): Promise<ToolResult> {
    const result = await this.generateActivityTool.execute(
      {
        type: 'quiz',
        topic: args.topic,
        difficulty: args.difficulty,
        ageGroup: args.ageGroup,
      },
      context,
    );
    if (!result.success) {
      return this.fail(result.error ?? '生成测验失败');
    }
    const activity = result.data as any;
    return this.ok({
      questions: activity?.questions ?? [],
      topic: args.topic,
      ageGroup: args.ageGroup,
    });
  }
}
