/**
 * RecordLearningTool — records a child's learning activity and score.
 * Migrated from modules/ai/agent/tools/record-learning.ts
 */

import { Injectable } from "@nestjs/common";
import { LearningTrackerService } from "../../../modules/learning/learning-tracker.service";
import { BaseTool } from "../base-tool";
import { RegisterTool } from "../decorators/register-tool";
import type {
  ToolMetadata,
  ToolResult,
  ToolExecutionContext,
} from "../../core";

type RecordLearningInput = {
  childId: number;
  contentId: number;
  score: number;
  domain: string;
};

@Injectable()
@RegisterTool()
export class RecordLearningTool extends BaseTool<RecordLearningInput> {
  readonly metadata: ToolMetadata = {
    name: "recordLearning",
    description:
      "记录孩子的学习结果，包含得分和领域，系统会自动更新能力值和检查成就",
    inputSchema: {
      type: "object",
      properties: {
        childId: { type: "number", description: "孩子ID" },
        contentId: { type: "number", description: "内容ID" },
        score: { type: "number", description: "得分(0-100)" },
        domain: {
          type: "string",
          description: "学习领域(language/math/science/art/social)",
        },
      },
      required: ["childId", "contentId", "score", "domain"],
    },
    concurrencySafe: false,
    readOnly: false,
    requiresChildId: true,
    requiresParentId: false,
    requiresAgeGroup: false,
  };

  constructor(private readonly learningTracker: LearningTrackerService) {
    super();
  }

  async execute(
    args: RecordLearningInput,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    try {
      if (args.score < 0 || args.score > 100) {
        return this.fail("分数必须在0-100之间");
      }

      const result = await this.learningTracker.recordActivity({
        type: "interactive_activity",
        childId: args.childId,
        contentId: args.contentId,
        domain: args.domain,
        score: args.score,
        metadata: { toolName: "recordLearning" },
      });

      return this.ok({
        message: `学习记录已保存，得分：${args.score}。${result.achievementsAwarded.length > 0 ? `获得新成就：${result.achievementsAwarded.join("、")}！` : ""}`,
        recordId: result.learningRecord.id,
        abilityUpdated: result.abilityUpdated,
        achievementsAwarded: result.achievementsAwarded,
      });
    } catch (error: any) {
      return this.fail(`记录学习结果失败: ${error.message}`);
    }
  }
}
