import { Injectable } from "@nestjs/common";
import { LearningService } from "../../../learning/learning.service";

@Injectable()
export class GetLearningHistoryTool {
  constructor(private readonly learningService: LearningService) {}

  async execute(args: { childId: number; limit?: number }): Promise<string> {
    try {
      const records = await this.learningService.findByUser(
        args.childId,
        args.limit || 10,
      );

      if (!records || records.length === 0) {
        return JSON.stringify({ message: "暂无学习记录", records: [] });
      }

      const history = records.map((r) => ({
        contentId: r.contentId,
        contentTitle: (r as any).content?.title || "未知内容",
        score: r.score,
        durationSeconds: r.durationSeconds,
        status: r.status,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
      }));

      return JSON.stringify({ records: history });
    } catch (error) {
      return JSON.stringify({ error: `获取学习记录失败: ${error.message}` });
    }
  }
}
