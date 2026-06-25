import { Injectable } from '@nestjs/common';
import { RewardService } from '../../../reward/reward.service';
import { BaseTool } from '../../../../agent-framework/tools/base-tool';
import { RegisterTool } from '../../../../agent-framework/tools/decorators/register-tool';
import type {
  ToolMetadata,
  ToolResult,
  ToolExecutionContext,
} from '../../../../agent-framework/core';

type CreateGiftInput = {
  userId: number;
  name: string;
  emoji: string;
  points: number;
  description?: string;
};

@Injectable()
@RegisterTool()
export class CreateGiftTool extends BaseTool<CreateGiftInput> {
  readonly metadata: ToolMetadata = {
    name: 'createGift',
    description: '创建新的礼品，用于积分兑换',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'number', description: '用户ID（家长ID）' },
        name: { type: 'string', description: '礼品名称' },
        emoji: { type: 'string', description: '表情符号' },
        points: { type: 'number', description: '所需积分' },
        description: { type: 'string', description: '礼品描述' },
      },
      required: ['userId', 'name', 'emoji', 'points'],
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

  async execute(args: CreateGiftInput, _context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const gift = await this.rewardService.createGift({
        userId: args.userId,
        name: args.name,
        emoji: args.emoji,
        pointsCost: args.points,
        description: args.description,
      });
      return this.ok({
        id: gift.id,
        name: gift.name,
        emoji: gift.emoji,
        pointsCost: gift.pointsCost,
      });
    } catch (error) {
      return this.fail(`创建礼品失败: ${error.message}`);
    }
  }
}
