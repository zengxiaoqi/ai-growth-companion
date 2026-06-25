import { Injectable } from '@nestjs/common';
import { RewardService } from '../../../reward/reward.service';
import { BaseTool } from '../../../../agent-framework/tools/base-tool';
import { RegisterTool } from '../../../../agent-framework/tools/decorators/register-tool';
import type {
  ToolMetadata,
  ToolResult,
  ToolExecutionContext,
} from '../../../../agent-framework/core';

type GetPointRecordsInput = { childId: number; limit?: number };

@Injectable()
@RegisterTool()
export class GetPointRecordsTool extends BaseTool<GetPointRecordsInput> {
  readonly metadata: ToolMetadata = {
    name: 'getPointRecords',
    description: '获取孩子的积分记录列表，包括加分和扣分记录',
    inputSchema: {
      type: 'object',
      properties: {
        childId: { type: 'number', description: '孩子ID' },
        limit: { type: 'number', description: '返回记录数量限制，默认20' },
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

  async execute(args: GetPointRecordsInput, _context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const limit = args.limit || 20;
      const result = await this.rewardService.getPointRecords(args.childId, 1, limit);
      return this.ok(
        result.records.map((r) => ({
          id: r.id,
          behaviorName: r.behaviorName,
          points: r.points,
          note: r.note,
          recordedAt: r.recordedAt,
        })),
      );
    } catch (error) {
      return this.fail(`获取积分记录失败: ${error.message}`);
    }
  }
}
