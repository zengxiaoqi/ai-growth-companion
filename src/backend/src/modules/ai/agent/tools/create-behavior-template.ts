import { Injectable } from '@nestjs/common';
import { RewardService } from '../../../reward/reward.service';
import { BaseTool } from '../../../../agent-framework/tools/base-tool';
import { RegisterTool } from '../../../../agent-framework/tools/decorators/register-tool';
import type {
  ToolMetadata,
  ToolResult,
  ToolExecutionContext,
} from '../../../../agent-framework/core';

type CreateBehaviorTemplateInput = {
  userId: number;
  name: string;
  emoji: string;
  points: number;
  category: string;
  description?: string;
};

@Injectable()
@RegisterTool()
export class CreateBehaviorTemplateTool extends BaseTool<CreateBehaviorTemplateInput> {
  readonly metadata: ToolMetadata = {
    name: 'createBehaviorTemplate',
    description: '创建新的行为模板，用于积分记录',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'number', description: '用户ID（家长ID）' },
        name: { type: 'string', description: '行为名称' },
        emoji: { type: 'string', description: '表情符号' },
        points: { type: 'number', description: '积分值' },
        category: { type: 'string', description: '分类：daily/extra/negative' },
        description: { type: 'string', description: '行为描述' },
      },
      required: ['userId', 'name', 'emoji', 'points', 'category'],
    },
    concurrencySafe: false,
    readOnly: false,
    requiresChildId: false,
    requiresParentId: true,
    requiresAgeGroup: false,
  };

  constructor(private readonly rewardService: RewardService) {
    super();
  }

  async execute(
    args: CreateBehaviorTemplateInput,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    try {
      const template = await this.rewardService.createBehavior({
        userId: args.userId,
        name: args.name,
        emoji: args.emoji,
        points: args.points,
        category: args.category,
      });
      return this.ok({
        id: template.id,
        name: template.name,
        emoji: template.emoji,
        points: template.points,
        category: template.category,
      });
    } catch (error) {
      return this.fail(`创建行为模板失败: ${error.message}`);
    }
  }
}
