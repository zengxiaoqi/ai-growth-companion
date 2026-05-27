/**
 * LoadSkillTool — lets the LLM load skill content on demand.
 *
 * Instead of injecting all skill bodies into the system prompt upfront,
 * the LLM sees a compact skill index and calls this tool when it needs
 * the full instructions for a specific skill.
 */

import { Injectable, Logger } from '@nestjs/common';
import { BaseTool } from '../base-tool';
import { RegisterTool } from '../decorators/register-tool';
import type { ToolMetadata, ToolResult, ToolExecutionContext } from '../../core';
import { SkillRegistryService } from '../../skills/skill-registry.service';

type LoadSkillArgs = {
  skillId: string;
};

@Injectable()
@RegisterTool()
export class LoadSkillTool extends BaseTool<LoadSkillArgs, string> {
  private readonly logger = new Logger(LoadSkillTool.name);

  readonly metadata: ToolMetadata = {
    name: 'loadSkill',
    description:
      '加载指定技能的完整指导内容。当你需要按照某个技能（如 hyperframes、remotion-video-creation、gsap 等）的具体规范来工作时，调用此工具获取完整规则和模板。',
    inputSchema: {
      type: 'object',
      properties: {
        skillId: {
          type: 'string',
          description: "技能 ID（如 'remotion-video-creation', 'hyperframes', 'gsap'）",
        },
      },
      required: ['skillId'],
    },
    concurrencySafe: true,
    readOnly: true,
    requiresChildId: false,
    requiresParentId: false,
    requiresAgeGroup: false,
  };

  constructor(private readonly skillRegistry: SkillRegistryService) {
    super();
  }

  async execute(args: LoadSkillArgs, _context: ToolExecutionContext): Promise<ToolResult<string>> {
    const skillId = args?.skillId?.trim();
    if (!skillId) return this.fail('skillId is required');

    const skill = this.skillRegistry.get(skillId);
    if (!skill) {
      const available = this.skillRegistry
        .getAll()
        .map((s) => s.definition.id)
        .join(', ');
      return this.fail(`Skill not found: "${skillId}". Available: ${available}`);
    }

    skill.ensureContentLoaded?.();

    const parts: string[] = [];
    const def = skill.definition;

    if (def.body) {
      parts.push(def.body);
    }
    if (def.rules && def.rules.length > 0) {
      for (const rule of def.rules) {
        parts.push(`---\n## Rule: ${rule.name}\n\n${rule.content}`);
      }
    }

    if (parts.length === 0) {
      return this.fail(`Skill "${skillId}" has no content.`);
    }

    this.logger.log(`Loaded skill content: ${skillId} (${parts.join('').length} chars)`);
    return this.ok(parts.join('\n\n'));
  }
}
