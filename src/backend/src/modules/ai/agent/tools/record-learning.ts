import { Injectable } from '@nestjs/common';
import { LearningService } from '../../../learning/learning.service';

@Injectable()
export class RecordLearningTool {
  constructor(private readonly learningService: LearningService) {}

  async execute(args: {
    childId: number;
    contentId: number;
    score: number;
  }): Promise<string> {
    try {
      if (args.score < 0 || args.score > 100) {
        return JSON.stringify({ error: '分数必须在0-100之间' });
      }

      const record = await this.learningService.create(args.childId, args.contentId);
      await this.learningService.update(record.id, {
        score: args.score,
        status: 'completed',
        completedAt: new Date(),
      });

      return JSON.stringify({
        success: true,
        message: `学习记录已保存，得分：${args.score}`,
        recordId: record.id,
      });
    } catch (error) {
      return JSON.stringify({ error: `记录学习结果失败: ${error.message}` });
    }
  }
}
