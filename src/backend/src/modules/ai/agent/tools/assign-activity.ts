import { Injectable, Logger } from '@nestjs/common';
import { AssignmentService } from '../../../assignment/assignment.service';
import { GenerateActivityTool } from './generate-activity';

@Injectable()
export class AssignActivityTool {
  private readonly logger = new Logger(AssignActivityTool.name);

  constructor(
    private readonly generateActivityTool: GenerateActivityTool,
    private readonly assignmentService: AssignmentService,
  ) {}

  async execute(args: {
    childId: number;
    parentId: number;
    activityType: string;
    topic: string;
    difficulty: number;
    ageGroup: string;
    domain?: string;
    dueDate?: string;
  }): Promise<string> {
    try {
      // Generate the activity content
      const activityJson = await this.generateActivityTool.execute({
        type: args.activityType as any,
        topic: args.topic,
        difficulty: args.difficulty,
        ageGroup: args.ageGroup,
        domain: args.domain,
      });

      // Create the assignment
      const assignment = await this.assignmentService.create({
        parentId: args.parentId,
        childId: args.childId,
        activityType: args.activityType,
        activityData: JSON.parse(activityJson),
        domain: args.domain,
        difficulty: args.difficulty,
        dueDate: args.dueDate,
      });

      return JSON.stringify({
        success: true,
        assignmentId: assignment.id,
        message: `已为${args.ageGroup}岁的孩子布置了关于"${args.topic}"的${this.getActivityTypeName(args.activityType)}任务`,
        activityType: args.activityType,
        topic: args.topic,
      });
    } catch (error) {
      this.logger.error(`assignActivity failed: ${error.message}`);
      return JSON.stringify({ error: `布置任务失败: ${error.message}` });
    }
  }

  private getActivityTypeName(type: string): string {
    const names: Record<string, string> = {
      quiz: '选择题',
      true_false: '判断题',
      fill_blank: '填空题',
      matching: '配对游戏',
      connection: '连线游戏',
      sequencing: '排序游戏',
      puzzle: '拼图游戏',
    };
    return names[type] || type;
  }
}
