import { Injectable } from '@nestjs/common';
import { RecommendService } from '../../../recommend/recommend.service';
import { UsersService } from '../../../users/users.service';

@Injectable()
export class GetRecommendationsTool {
  constructor(
    private readonly recommendService: RecommendService,
    private readonly usersService: UsersService,
  ) {}

  async execute(args: { childId: number }): Promise<string> {
    try {
      const user = await this.usersService.findById(args.childId);
      if (!user) return JSON.stringify({ error: '用户不存在' });

      const age = user.age;
      const ageRange = age >= 3 && age <= 4 ? '3-4' : age >= 5 && age <= 6 ? '5-6' : '5-6';

      const result = await this.recommendService.recommend({
        userId: args.childId,
        ageRange,
      });

      const recommendations = result.recommended?.map((r: any) => ({
        contentId: r.contentId,
        title: r.content?.title || '未知',
        domain: r.content?.domain || '未知',
        reason: r.reason,
        priority: r.priority,
      }));

      return JSON.stringify({
        recommendations,
        overallReason: result.reason,
        nextLevel: result.nextLevel,
      });
    } catch (error) {
      return JSON.stringify({ error: `获取推荐失败: ${error.message}` });
    }
  }
}
