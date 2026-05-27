/**
 * GetParentControlTool — retrieves parent control settings for a child.
 * Migrated from modules/ai/agent/tools/get-parent-control.ts
 */

import { Injectable } from '@nestjs/common';
import { ParentService } from '../../../modules/parent/parent.service';
import { BaseTool } from '../base-tool';
import { RegisterTool } from '../decorators/register-tool';
import type { ToolMetadata, ToolResult, ToolExecutionContext } from '../../core';

type GetParentControlInput = { childId: number };

@Injectable()
@RegisterTool()
export class GetParentControlTool extends BaseTool<GetParentControlInput> {
  readonly metadata: ToolMetadata = {
    name: 'getParentControl',
    description: '获取孩子的家长控制设置，包括时间限制、允许领域等',
    inputSchema: {
      type: 'object',
      properties: {
        childId: { type: 'number', description: '孩子ID' },
      },
      required: ['childId'],
    },
    concurrencySafe: true,
    readOnly: true,
    requiresChildId: true,
    requiresParentId: false,
    requiresAgeGroup: false,
  };

  constructor(private readonly parentService: ParentService) {
    super();
  }

  async execute(args: GetParentControlInput, _context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const control = await this.parentService.getByChild(args.childId);
      return this.ok({
        dailyLimitMinutes: control.dailyLimitMinutes,
        allowedDomains: control.allowedDomains,
        blockedTopics: control.blockedTopics,
        eyeProtectionEnabled: control.eyeProtectionEnabled,
        restReminderMinutes: control.restReminderMinutes,
      });
    } catch (error: any) {
      return this.fail(`获取家长控制设置失败: ${error.message}`);
    }
  }
}
