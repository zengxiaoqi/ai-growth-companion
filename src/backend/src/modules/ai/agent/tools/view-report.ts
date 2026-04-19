import { Injectable } from "@nestjs/common";
import { ReportService } from "../../../report/report.service";

@Injectable()
export class ViewReportTool {
  constructor(private readonly reportService: ReportService) {}

  async execute(args: {
    childId: number;
    period?: "daily" | "weekly" | "monthly";
  }): Promise<string> {
    try {
      const period = args.period || "weekly";
      const report = await this.reportService.generateReport({
        userId: args.childId,
        period,
      });
      return JSON.stringify({
        period,
        totalLearningTime: report.totalLearningTime,
        totalLessonsCompleted: report.totalLessonsCompleted,
        averageScore: report.averageScore,
        streak: report.streak,
        skillProgress: report.skillProgress,
        insights: report.insights,
        summary: report.summary,
      });
    } catch (error) {
      return JSON.stringify({ error: `获取报告失败: ${error.message}` });
    }
  }
}
