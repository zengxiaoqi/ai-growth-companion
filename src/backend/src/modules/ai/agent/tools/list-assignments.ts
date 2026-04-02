import { Injectable } from '@nestjs/common';
import { AssignmentService } from '../../../assignment/assignment.service';

@Injectable()
export class ListAssignmentsTool {
  constructor(private readonly assignmentService: AssignmentService) {}

  async execute(args: { childId: number }): Promise<string> {
    try {
      const assignments = await this.assignmentService.findByChild(args.childId);
      return JSON.stringify({
        assignments: assignments.map(a => ({
          id: a.id,
          activityType: a.activityType,
          domain: a.domain,
          difficulty: a.difficulty,
          status: a.status,
          dueDate: a.dueDate,
          score: a.score,
          createdAt: a.createdAt,
        })),
      });
    } catch (error) {
      return JSON.stringify({ error: `获取作业列表失败: ${error.message}` });
    }
  }
}