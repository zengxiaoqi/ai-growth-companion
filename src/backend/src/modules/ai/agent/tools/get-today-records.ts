import { Injectable } from '@nestjs/common';
import { RewardService } from '../../../reward/reward.service';
import { BaseTool } from '../../../../agent-framework/tools/base-tool';
import { RegisterTool } from '../../../../agent-framework/tools/decorators/register-tool';
import type {
  ToolMetadata,
  ToolResult,
  ToolExecutionContext,
} from '../../../../agent-framework/core';

type GetTodayRecordsInput = { childId: number };

@Injectable()
@RegisterTool()
export class GetTodayRecordsTool extends BaseTool<GetTodayRecordsInput> {
  readonly metadata: ToolMetadata = {
    name: 'getTodayRecords',
    description: '获取孩子今天的积分记录',
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

  async execute(args: GetTodayRecordsInput, _context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const records = await this.rewardService.getTodayRecords(args.childId);
      return this.ok(
        records.map((r) => ({
          id: r.id,
          behaviorName: r.behaviorName,
          points: r.points,
          note: r.note,
          recordedAt: r.recordedAt,
        })),
      );
    } catch (error) {
      return this.fail(`获取今日记录失败: ${error.message}`);
    }
  }
}
