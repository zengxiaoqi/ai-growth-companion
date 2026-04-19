/**
 * GetAbilitiesTool — retrieves a child's ability scores across domains.
 * Migrated from modules/ai/agent/tools/get-abilities.ts
 */

import { Injectable } from "@nestjs/common";
import { AbilitiesService } from "../../../modules/abilities/abilities.service";
import { BaseTool } from "../base-tool";
import { RegisterTool } from "../decorators/register-tool";
import type {
  ToolMetadata,
  ToolResult,
  ToolExecutionContext,
} from "../../core";

type GetAbilitiesInput = { childId: number };

@Injectable()
@RegisterTool()
export class GetAbilitiesTool extends BaseTool<GetAbilitiesInput> {
  readonly metadata: ToolMetadata = {
    name: "getAbilities",
    description:
      "获取孩子的各项能力评分，包括语言表达、数学逻辑、科学探索、艺术创造、社会交往",
    inputSchema: {
      type: "object",
      properties: {
        childId: { type: "number", description: "孩子ID" },
      },
      required: ["childId"],
    },
    concurrencySafe: true,
    readOnly: true,
    requiresChildId: true,
    requiresParentId: false,
    requiresAgeGroup: false,
  };

  constructor(private readonly abilitiesService: AbilitiesService) {
    super();
  }

  async execute(
    args: GetAbilitiesInput,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    try {
      const abilities = await this.abilitiesService.getByUser(args.childId);
      const domainLabels: Record<string, string> = {
        language: "语言表达",
        math: "数学逻辑",
        science: "科学探索",
        art: "艺术创造",
        social: "社会交往",
      };

      return this.ok(
        abilities.map((a) => ({
          domain: a.domain,
          domainLabel: domainLabels[a.domain] || a.domain,
          score: a.score,
          level: a.level,
        })),
      );
    } catch (error: any) {
      return this.fail(`获取能力信息失败: ${error.message}`);
    }
  }
}
