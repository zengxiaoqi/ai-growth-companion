/**
 * ViewAbilitiesTool — retrieves detailed ability data with trend analysis.
 * Migrated from modules/ai/agent/tools/view-abilities.ts
 */

import { Injectable } from '@nestjs/common';
import { AbilitiesService } from '../../../modules/abilities/abilities.service';
import { ReportService } from '../../../modules/report/report.service';
import { BaseTool } from '../base-tool';
import { RegisterTool } from '../decorators/register-tool';
import type { ToolMetadata, ToolResult, ToolExecutionContext } from '../../core';
import { domainLabel } from '../../../common/domain/learning-domains';

type ViewAbilitiesInput = { childId: number };

@Injectable()
@RegisterTool()
export class ViewAbilitiesTool extends BaseTool<ViewAbilitiesInput> {
  readonly metadata: ToolMetadata = {
    name: 'viewAbilities',
    description: '获取孩子的能力分析数据，包含各领域能力评分和趋势分析。家长要查看能力趋势时调用。',
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

  constructor(
    private readonly abilitiesService: AbilitiesService,
    private readonly reportService: ReportService,
  ) {
    super();
  }

  async execute(args: ViewAbilitiesInput, _context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const [abilities, trend] = await Promise.all([
        this.abilitiesService.getByUser(args.childId),
        this.reportService.getAbilityTrend(args.childId, 4),
      ]);

      return this.ok({
        abilities: abilities.map((a: any) => ({
          domain: a.domain,
          domainLabel: domainLabel(a.domain),
          score: a.score,
          level: a.level,
        })),
        trend,
      });
    } catch (error: any) {
      return this.fail(`获取能力数据失败: ${error.message}`);
    }
  }
}
