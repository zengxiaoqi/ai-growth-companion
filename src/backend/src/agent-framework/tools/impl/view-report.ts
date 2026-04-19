/**
 * ViewReportTool — generates learning reports for a child.
 * Migrated from modules/ai/agent/tools/view-report.ts
 */

import { Injectable } from "@nestjs/common";
import { ReportService } from "../../../modules/report/report.service";
import { BaseTool } from "../base-tool";
import { RegisterTool } from "../decorators/register-tool";
import type {
  ToolMetadata,
  ToolResult,
  ToolExecutionContext,
} from "../../core";

type ViewReportInput = {
  childId: number;
  period?: "daily" | "weekly" | "monthly";
};

@Injectable()
@RegisterTool()
export class ViewReportTool extends BaseTool<ViewReportInput> {
  readonly metadata: ToolMetadata = {
    name: "viewReport",
    description:
      "查看孩子的学习报告，包含学习时长、完成课程数、平均分数、连续学习天数和技能进展",
    inputSchema: {
      type: "object",
      properties: {
        childId: { type: "number", description: "孩子ID" },
        period: {
          type: "string",
          enum: ["daily", "weekly", "monthly"],
          description: "报告周期，默认weekly",
        },
      },
      required: ["childId"],
    },
    concurrencySafe: true,
    readOnly: true,
    requiresChildId: true,
    requiresParentId: false,
    requiresAgeGroup: false,
  };

  constructor(private readonly reportService: ReportService) {
    super();
  }

  async execute(
    args: ViewReportInput,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    try {
      const period = args.period || "weekly";
      const report = await this.reportService.generateReport({
        userId: args.childId,
        period,
      });

      return this.ok({
        period,
        totalLearningTime: report.totalLearningTime,
        totalLessonsCompleted: report.totalLessonsCompleted,
        averageScore: report.averageScore,
        streak: report.streak,
        skillProgress: report.skillProgress,
        insights: report.insights,
        summary: report.summary,
      });
    } catch (error: any) {
      return this.fail(`获取报告失败: ${error.message}`);
    }
  }
}
