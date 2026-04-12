/**
 * AssignActivityTool — generates and assigns an activity to a child.
 * Migrated from modules/ai/agent/tools/assign-activity.ts
 */

import { Injectable, Logger } from '@nestjs/common';
import { AssignmentService } from '../../../modules/assignment/assignment.service';
import { GenerateActivityTool } from './generate-activity';
import { BaseTool } from '../base-tool';
import { RegisterTool } from '../decorators/register-tool';
import type { ToolMetadata, ToolResult, ToolExecutionContext } from '../../core';

type AssignActivityInput = {
  childId: number;
  parentId: number;
  activityType: string;
  topic: string;
  difficulty: number;
  ageGroup: string;
  domain?: string;
  dueDate?: string;
};

const ACTIVITY_TYPE_NAMES: Record<string, string> = {
  quiz: '选择题',
  true_false: '判断题',
  fill_blank: '填空题',
  matching: '配对游戏',
  connection: '连线游戏',
  sequencing: '排序游戏',
  puzzle: '拼图游戏',
};

@Injectable()
@RegisterTool()
export class AssignActivityTool extends BaseTool<AssignActivityInput> {
  private readonly logger = new Logger(AssignActivityTool.name);

  readonly metadata: ToolMetadata = {
    name: 'assignActivity',
    description: '为孩子生成并布置互动学习任务，支持7种活动类型',
    inputSchema: {
      type: 'object',
      properties: {
        childId: { type: 'number', description: '孩子ID' },
        parentId: { type: 'number', description: '家长ID' },
        activityType: { type: 'string', description: '活动类型(quiz/true_false/fill_blank/matching/connection/sequencing/puzzle)' },
        topic: { type: 'string', description: '活动主题' },
        difficulty: { type: 'number', description: '难度(1-3)' },
        ageGroup: { type: 'string', description: '年龄段 (3-4 或 5-6)' },
        domain: { type: 'string', description: '学习领域(可选)' },
        dueDate: { type: 'string', description: '截止日期(可选)' },
      },
      required: ['childId', 'parentId', 'activityType', 'topic', 'difficulty', 'ageGroup'],
    },
    concurrencySafe: false,
    readOnly: false,
    requiresChildId: true,
    requiresParentId: true,
    requiresAgeGroup: true,
  };

  constructor(
    private readonly generateActivityTool: GenerateActivityTool,
    private readonly assignmentService: AssignmentService,
  ) {
    super();
  }

  async execute(args: AssignActivityInput, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const activityResult = await this.generateActivityTool.execute(
        {
          type: args.activityType as any,
          topic: args.topic,
          difficulty: args.difficulty,
          ageGroup: args.ageGroup,
          domain: args.domain,
        },
        context,
      );

      if (!activityResult.success || !activityResult.data) {
        return this.fail(activityResult.error || '生成活动内容失败');
      }

      const assignment = await this.assignmentService.create({
        parentId: args.parentId,
        childId: args.childId,
        activityType: args.activityType,
        activityData: activityResult.data,
        domain: args.domain,
        difficulty: args.difficulty,
        dueDate: args.dueDate,
      });

      const typeName = ACTIVITY_TYPE_NAMES[args.activityType] || args.activityType;
      return this.ok({
        assignmentId: assignment.id,
        message: `已为${args.ageGroup}岁的孩子布置了关于"${args.topic}"的${typeName}任务`,
        activityType: args.activityType,
        topic: args.topic,
      });
    } catch (error: any) {
      this.logger.error(`assignActivity failed: ${error.message}`);
      return this.fail(`布置任务失败: ${error.message}`);
    }
  }
}
