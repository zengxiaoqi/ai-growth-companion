import { Injectable } from '@nestjs/common';
import { RewardService } from '../../../reward/reward.service';
import { BaseTool } from '../../../../agent-framework/tools/base-tool';
import { RegisterTool } from '../../../../agent-framework/tools/decorators/register-tool';
import type {
  ToolMetadata,
  ToolResult,
  ToolExecutionContext,
} from '../../../../agent-framework/core';

type GetWeeklyStatsInput = { childId: number };

@Injectable()
@RegisterTool()
export class GetWeeklyStatsTool extends BaseTool<GetWeeklyStatsInput> {
  readonly metadata: ToolMetadata = {
    name: 'getWeeklyStats',
    description: '获取孩子本周的积分统计，包括每天积分和总积分',
    inputSchema: {
      type: 'object',
      properties: {
        childId: { type: 'number', description: '孩子ID' },
      },
      required: ['childId'],
    },
    concurrencySafe: true,
    readOnly: true,
    requiresChildId: true,
    requiresParentId: false,
    requiresAgeGroup: false,
  };

  constructor(private readonly rewardService: RewardService) {
    super();
  }

  async execute(args: GetWeeklyStatsInput, _context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const stats = await this.rewardService.getWeeklyStats(args.childId);
      return this.ok(stats);
    } catch (error) {
      return this.fail(`获取周统计失败: ${error.message}`);
    }
  }
}
