import { Injectable } from '@nestjs/common';
import { RewardService } from '../../../reward/reward.service';
import { BaseTool } from '../../../../agent-framework/tools/base-tool';
import { RegisterTool } from '../../../../agent-framework/tools/decorators/register-tool';
import type {
  ToolMetadata,
  ToolResult,
  ToolExecutionContext,
} from '../../../../agent-framework/core';

type RecordPointsInput = {
  childId: number;
  templateId: number;
  behaviorName: string;
  points: number;
  note?: string;
  recordedBy: number;
};

@Injectable()
@RegisterTool()
export class RecordPointsTool extends BaseTool<RecordPointsInput> {
  readonly metadata: ToolMetadata = {
    name: 'recordPoints',
    description: '记录积分，可以是加分（正数）或扣分（负数）',
    inputSchema: {
      type: 'object',
      properties: {
        childId: { type: 'number', description: '孩子ID' },
        templateId: { type: 'number', description: '行为模板ID' },
        behaviorName: { type: 'string', description: '行为名称' },
        points: { type: 'number', description: '积分值，正数为加分，负数为扣分' },
        note: { type: 'string', description: '备注说明' },
        recordedBy: { type: 'number', description: '记录人ID（家长ID）' },
      },
      required: ['childId', 'templateId', 'behaviorName', 'points', 'recordedBy'],
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

  async execute(args: RecordPointsInput, _context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const record = await this.rewardService.recordPoints({
        childId: args.childId,
        templateId: args.templateId,
        behaviorName: args.behaviorName,
        points: args.points,
        note: args.note,
        recordedBy: args.recordedBy,
      });
      return this.ok({
        id: record.id,
        points: record.points,
        behaviorName: record.behaviorName,
        recordedAt: record.recordedAt,
      });
    } catch (error) {
      return this.fail(`记录积分失败: ${error.message}`);
    }
  }
}
