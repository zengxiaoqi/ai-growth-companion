import { Injectable } from '@nestjs/common';
import { RewardService } from '../../../reward/reward.service';
import { BaseTool } from '../../../../agent-framework/tools/base-tool';
import { RegisterTool } from '../../../../agent-framework/tools/decorators/register-tool';
import type {
  ToolMetadata,
  ToolResult,
  ToolExecutionContext,
} from '../../../../agent-framework/core';

type GetAvailableGiftsInput = { userId: number };

@Injectable()
@RegisterTool()
export class GetAvailableGiftsTool extends BaseTool<GetAvailableGiftsInput> {
  readonly metadata: ToolMetadata = {
    name: 'getAvailableGifts',
    description: '获取可兑换的礼品列表',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'number', description: '用户ID（家长ID）' },
      },
      required: ['userId'],
    },
    concurrencySafe: true,
    readOnly: true,
    requiresChildId: false,
    requiresParentId: true,
    requiresAgeGroup: false,
  };

  constructor(private readonly rewardService: RewardService) {
    super();
  }

  async execute(args: GetAvailableGiftsInput, _context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const gifts = await this.rewardService.getGifts(args.userId);
      return this.ok(
        gifts
          .filter((g) => g.isEnabled)
          .map((g) => ({
            id: g.id,
            name: g.name,
            emoji: g.emoji,
            pointsCost: g.pointsCost,
            description: g.description,
          })),
      );
    } catch (error) {
      return this.fail(`获取礼品列表失败: ${error.message}`);
    }
  }
}
