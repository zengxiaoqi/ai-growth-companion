import { Injectable } from '@nestjs/common';
import { LearningTrackerService } from '../../../learning/learning-tracker.service';

@Injectable()
export class RecordLearningTool {
  constructor(private readonly learningTracker: LearningTrackerService) {}

  async execute(args: {
    childId: number;
    contentId: number;
    score: number;
    domain: string;
  }): Promise<string> {
    try {
      if (args.score < 0 || args.score > 100) {
        return JSON.stringify({ error: '分数必须在0-100之间' });
      }

      const result = await this.learningTracker.recordActivity({
        type: 'interactive_activity',
        childId: args.childId,
        contentId: args.contentId,
        domain: args.domain,
        score: args.score,
        metadata: { toolName: 'recordLearning' },
      });

      return JSON.stringify({
        success: true,
        message: `学习记录已保存，得分：${args.score}。${result.achievementsAwarded.length > 0 ? `获得新成就：${result.achievementsAwarded.join('、')}！` : ''}`,
        recordId: result.learningRecord.id,
        abilityUpdated: result.abilityUpdated,
        achievementsAwarded: result.achievementsAwarded,
      });
    } catch (error) {
      return JSON.stringify({ error: `记录学习结果失败: ${error.message}` });
    }
  }
}
