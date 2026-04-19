/**
 * ListAssignmentsTool — lists assignments for a child.
 * Migrated from modules/ai/agent/tools/list-assignments.ts
 */

import { Injectable } from "@nestjs/common";
import { AssignmentService } from "../../../modules/assignment/assignment.service";
import { BaseTool } from "../base-tool";
import { RegisterTool } from "../decorators/register-tool";
import type {
  ToolMetadata,
  ToolResult,
  ToolExecutionContext,
} from "../../core";

type ListAssignmentsInput = { childId: number };

@Injectable()
@RegisterTool()
export class ListAssignmentsTool extends BaseTool<ListAssignmentsInput> {
  readonly metadata: ToolMetadata = {
    name: "listAssignments",
    description: "获取孩子的作业/任务列表，包含作业类型、领域、状态和得分",
    inputSchema: {
      type: "object",
      properties: {
        childId: { type: "number", description: "孩子ID" },
      },
      required: ["childId"],
    },
    concurrencySafe: true,
    readOnly: true,
    requiresChildId: true,
    requiresParentId: false,
    requiresAgeGroup: false,
  };

  constructor(private readonly assignmentService: AssignmentService) {
    super();
  }

  async execute(
    args: ListAssignmentsInput,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    try {
      const assignments = await this.assignmentService.findByChild(
        args.childId,
      );

      return this.ok(
        assignments.map((a: any) => ({
          id: a.id,
          activityType: a.activityType,
          domain: a.domain,
          difficulty: a.difficulty,
          status: a.status,
          dueDate: a.dueDate,
          score: a.score,
          createdAt: a.createdAt,
        })),
      );
    } catch (error: any) {
      return this.fail(`获取作业列表失败: ${error.message}`);
    }
  }
}
