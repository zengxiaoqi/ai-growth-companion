import { Injectable } from '@nestjs/common';
import { RewardService } from '../../../reward/reward.service';
import { BaseTool } from '../../../../agent-framework/tools/base-tool';
import { RegisterTool } from '../../../../agent-framework/tools/decorators/register-tool';
import type {
  ToolMetadata,
  ToolResult,
  ToolExecutionContext,
} from '../../../../agent-framework/core';

type RedeemGiftInput = {
  childId: number;
  giftId: number;
  giftName: string;
  pointsCost: number;
};

@Injectable()
@RegisterTool()
export class RedeemGiftTool extends BaseTool<RedeemGiftInput> {
  readonly metadata: ToolMetadata = {
    name: 'redeemGift',
    description: '兑换礼品，消耗积分',
    inputSchema: {
      type: 'object',
      properties: {
        childId: { type: 'number', description: '孩子ID' },
        giftId: { type: 'number', description: '礼品ID' },
        giftName: { type: 'string', description: '礼品名称' },
        pointsCost: { type: 'number', description: '消耗积分' },
      },
      required: ['childId', 'giftId', 'giftName', 'pointsCost'],
    },
    concurrencySafe: false,
    readOnly: false,
    requiresChildId: true,
    requiresParentId: false,
    requiresAgeGroup: false,
  };

  constructor(private readonly rewardService: RewardService) {
    super();
  }

  async execute(args: RedeemGiftInput, _context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const redemption = await this.rewardService.redeemGift({
        childId: args.childId,
        giftId: args.giftId,
        giftName: args.giftName,
        pointsCost: args.pointsCost,
      });
      return this.ok({
        id: redemption.id,
        giftName: redemption.giftName,
        pointsCost: redemption.pointsCost,
        status: redemption.status,
      });
    } catch (error) {
      return this.fail(`兑换礼品失败: ${error.message}`);
    }
  }
}
