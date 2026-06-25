import { Injectable } from '@nestjs/common';
import { RewardService } from '../../../reward/reward.service';
import { BaseTool } from '../../../../agent-framework/tools/base-tool';
import { RegisterTool } from '../../../../agent-framework/tools/decorators/register-tool';
import type {
  ToolMetadata,
  ToolResult,
  ToolExecutionContext,
} from '../../../../agent-framework/core';

type GetPointsSummaryInput = { childId: number };

@Injectable()
@RegisterTool()
export class GetPointsSummaryTool extends BaseTool<GetPointsSummaryInput> {
  readonly metadata: ToolMetadata = {
    name: 'getPointsSummary',
    description: '获取孩子的积分汇总信息，包括总积分、今日积分、本周积分、连续打卡天数等',
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

  async execute(args: GetPointsSummaryInput, _context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const summary = await this.rewardService.getPointsSummary(args.childId);
      return this.ok({
        totalPoints: summary.totalPoints,
        todayPoints: summary.todayPoints,
        weekPoints: summary.weekPoints,
        monthPoints: summary.monthPoints,
        streak: summary.streak,
        todayRecordCount: summary.todayRecordCount,
      });
    } catch (error) {
      return this.fail(`获取积分汇总失败: ${error.message}`);
    }
  }
}
