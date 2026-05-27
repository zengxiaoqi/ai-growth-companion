import { Injectable } from '@nestjs/common';
import { ParentService } from '../../../parent/parent.service';

@Injectable()
export class GetParentControlTool {
  constructor(private readonly parentService: ParentService) {}

  async execute(args: { childId: number }): Promise<string> {
    try {
      const control = await this.parentService.getByChild(args.childId);
      if (!control) {
        return JSON.stringify({ message: '未设置家长控制', controls: null });
      }

      return JSON.stringify({
        controls: {
          dailyLimitMinutes: control.dailyLimitMinutes,
          allowedDomains: control.allowedDomains,
          blockedTopics: control.blockedTopics,
        },
      });
    } catch (error) {
      return JSON.stringify({ error: `获取家长控制失败: ${error.message}` });
    }
  }
}
