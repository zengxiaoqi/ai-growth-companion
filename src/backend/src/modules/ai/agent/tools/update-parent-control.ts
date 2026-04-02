import { Injectable } from '@nestjs/common';
import { ParentService } from '../../../parent/parent.service';

@Injectable()
export class UpdateParentControlTool {
  constructor(private readonly parentService: ParentService) {}

  async execute(args: {
    parentId: number;
    childId?: number;
    dailyLimitMinutes?: number;
    allowedDomains?: string[];
    blockedTopics?: string[];
    eyeProtectionEnabled?: boolean;
    restReminderMinutes?: number;
  }): Promise<string> {
    try {
      let control = await this.parentService.getByParent(args.parentId);

      const updateData: Record<string, any> = {};
      if (args.dailyLimitMinutes !== undefined) updateData.dailyLimitMinutes = args.dailyLimitMinutes;
      if (args.allowedDomains !== undefined) updateData.allowedDomains = args.allowedDomains;
      if (args.blockedTopics !== undefined) updateData.blockedTopics = args.blockedTopics;
      if (args.eyeProtectionEnabled !== undefined) updateData.eyeProtectionEnabled = args.eyeProtectionEnabled;
      if (args.restReminderMinutes !== undefined) updateData.restReminderMinutes = args.restReminderMinutes;
      if (args.childId !== undefined) updateData.childId = args.childId;

      if (control.id === 0) {
        control = await this.parentService.createWithDefaults(args.parentId);
      }

      const updated = await this.parentService.update(control.id, updateData);
      return JSON.stringify({
        success: true,
        message: '设置已更新',
        controls: {
          dailyLimitMinutes: updated.dailyLimitMinutes,
          allowedDomains: updated.allowedDomains,
          blockedTopics: updated.blockedTopics,
          eyeProtectionEnabled: updated.eyeProtectionEnabled,
          restReminderMinutes: updated.restReminderMinutes,
        },
      });
    } catch (error) {
      return JSON.stringify({ error: `更新设置失败: ${error.message}` });
    }
  }
}