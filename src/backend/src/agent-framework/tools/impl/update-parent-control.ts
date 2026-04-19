/**
 * UpdateParentControlTool — updates parent control settings.
 * Migrated from modules/ai/agent/tools/update-parent-control.ts
 */

import { Injectable } from "@nestjs/common";
import { ParentService } from "../../../modules/parent/parent.service";
import { BaseTool } from "../base-tool";
import { RegisterTool } from "../decorators/register-tool";
import type {
  ToolMetadata,
  ToolResult,
  ToolExecutionContext,
} from "../../core";

type UpdateParentControlInput = {
  parentId: number;
  childId?: number;
  dailyLimitMinutes?: number;
  allowedDomains?: string[];
  blockedTopics?: string[];
  eyeProtectionEnabled?: boolean;
  restReminderMinutes?: number;
};

@Injectable()
@RegisterTool()
export class UpdateParentControlTool extends BaseTool<UpdateParentControlInput> {
  readonly metadata: ToolMetadata = {
    name: "updateParentControl",
    description:
      "更新家长控制设置，包括时间限制、允许领域、屏蔽主题、护眼模式等",
    inputSchema: {
      type: "object",
      properties: {
        parentId: { type: "number", description: "家长ID" },
        childId: { type: "number", description: "孩子ID（可选）" },
        dailyLimitMinutes: {
          type: "number",
          description: "每日学习时间限制（分钟）",
        },
        allowedDomains: {
          type: "array",
          items: { type: "string" },
          description: "允许的学习领域",
        },
        blockedTopics: {
          type: "array",
          items: { type: "string" },
          description: "屏蔽的主题",
        },
        eyeProtectionEnabled: {
          type: "boolean",
          description: "是否开启护眼模式",
        },
        restReminderMinutes: {
          type: "number",
          description: "休息提醒间隔（分钟）",
        },
      },
      required: ["parentId"],
    },
    concurrencySafe: false,
    readOnly: false,
    requiresChildId: false,
    requiresParentId: true,
    requiresAgeGroup: false,
  };

  constructor(private readonly parentService: ParentService) {
    super();
  }

  async execute(
    args: UpdateParentControlInput,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    try {
      let control = await this.parentService.getByParent(args.parentId);

      const updateData: Record<string, any> = {};
      if (args.dailyLimitMinutes !== undefined)
        updateData.dailyLimitMinutes = args.dailyLimitMinutes;
      if (args.allowedDomains !== undefined)
        updateData.allowedDomains = args.allowedDomains;
      if (args.blockedTopics !== undefined)
        updateData.blockedTopics = args.blockedTopics;
      if (args.eyeProtectionEnabled !== undefined)
        updateData.eyeProtectionEnabled = args.eyeProtectionEnabled;
      if (args.restReminderMinutes !== undefined)
        updateData.restReminderMinutes = args.restReminderMinutes;
      if (args.childId !== undefined) updateData.childId = args.childId;

      if (control.id === 0) {
        control = await this.parentService.createWithDefaults(args.parentId);
      }

      const updated = await this.parentService.update(control.id, updateData);

      return this.ok({
        message: "设置已更新",
        controls: {
          dailyLimitMinutes: updated.dailyLimitMinutes,
          allowedDomains: updated.allowedDomains,
          blockedTopics: updated.blockedTopics,
          eyeProtectionEnabled: updated.eyeProtectionEnabled,
          restReminderMinutes: updated.restReminderMinutes,
        },
      });
    } catch (error: any) {
      return this.fail(`更新设置失败: ${error.message}`);
    }
  }
}
