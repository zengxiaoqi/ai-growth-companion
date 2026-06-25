import { Injectable } from '@nestjs/common';
import { RewardService } from '../../../reward/reward.service';
import { BaseTool } from '../../../../agent-framework/tools/base-tool';
import { RegisterTool } from '../../../../agent-framework/tools/decorators/register-tool';
import type {
  ToolMetadata,
  ToolResult,
  ToolExecutionContext,
} from '../../../../agent-framework/core';

type GetBehaviorAnalysisInput = { childId: number; days?: number };

@Injectable()
@RegisterTool()
export class GetBehaviorAnalysisTool extends BaseTool<GetBehaviorAnalysisInput> {
  readonly metadata: ToolMetadata = {
    name: 'getBehaviorAnalysis',
    description: '获取孩子行为分析，包括行为频率统计和习惯培养建议',
    inputSchema: {
      type: 'object',
      properties: {
        childId: { type: 'number', description: '孩子ID' },
        days: { type: 'number', description: '分析天数，默认7天' },
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

  async execute(
    args: GetBehaviorAnalysisInput,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    try {
      const days = args.days || 7;
      const analysis = await this.rewardService.getBehaviorAnalysis(args.childId, days);
      return this.ok(analysis);
    } catch (error) {
      return this.fail(`获取行为分析失败: ${error.message}`);
    }
  }
}
