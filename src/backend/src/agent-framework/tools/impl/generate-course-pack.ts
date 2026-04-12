/**
 * GenerateCoursePackTool — generates comprehensive course packs via LLM.
 * Migrated from modules/ai/agent/tools/generate-course-pack.ts
 *
 * This is a thin ITool wrapper around the existing GenerateCoursePackTool
 * from the ai module. The original implementation is complex (1347 lines)
 * with deep dependencies on animation templates, lesson scenes, and
 * curriculum fallbacks. Rather than duplicating that logic here, we wrap
 * it via dependency injection.
 *
 * The original tool class is provided by the ai module and injected
 * through the constructor.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { BaseTool } from '../base-tool';
import { RegisterTool } from '../decorators/register-tool';
import type { ToolMetadata, ToolResult, ToolExecutionContext } from '../../core';
import { extractJsonObject } from '../../core';

type GenerateCoursePackInput = {
  topic: string;
  ageGroup?: string;
  durationMinutes?: number;
  focus?: string;
  domain?: string;
  difficulty?: number;
  includeGame?: boolean;
  includeAudio?: boolean;
  includeVideo?: boolean;
  parentPrompt?: string;
};

@Injectable()
@RegisterTool()
export class GenerateCoursePackTool extends BaseTool<GenerateCoursePackInput> {
  private readonly logger = new Logger(GenerateCoursePackTool.name);

  readonly metadata: ToolMetadata = {
    name: 'generateCoursePack',
    description: '生成完整的多模态课程包，包含听力、口语、阅读、写作、视频和家长指导',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: '课程主题' },
        ageGroup: { type: 'string', description: '年龄段 (3-4 或 5-6, 默认5-6)' },
        durationMinutes: { type: 'number', description: '课程时长(分钟, 10-45, 默认20)' },
        focus: { type: 'string', enum: ['literacy', 'math', 'science', 'mixed'], description: '课程重点(默认mixed)' },
        domain: { type: 'string', description: '学习领域(language/math/science/art/social)' },
        difficulty: { type: 'number', description: '难度(1-3)' },
        includeGame: { type: 'boolean', description: '是否包含互动游戏(默认true)' },
        includeAudio: { type: 'boolean', description: '是否包含听力模块(默认true)' },
        includeVideo: { type: 'boolean', description: '是否包含视频模块(默认true)' },
        parentPrompt: { type: 'string', description: '家长额外要求' },
      },
      required: ['topic'],
    },
    concurrencySafe: false,
    readOnly: false,
    requiresChildId: false,
    requiresParentId: false,
    requiresAgeGroup: true,
  };

  /**
   * The original tool from the ai module. Injected optionally so the
   * agent-framework compiles even if the ai module hasn't been set up yet.
   */
  private readonly legacyTool: any;

  constructor(
    @Optional() legacyTool: any,
  ) {
    super();
    this.legacyTool = legacyTool;
  }

  async execute(args: GenerateCoursePackInput, _context: ToolExecutionContext): Promise<ToolResult> {
    if (!this.legacyTool) {
      return this.fail('GenerateCoursePackTool: legacy tool not available — ensure ai module is imported');
    }

    try {
      const resultJson = await this.legacyTool.execute(args);
      const parsed = extractJsonObject(resultJson);
      if (!parsed) {
        return this.fail('生成课程包失败：无法解析结果');
      }
      return this.ok(parsed, parsed);
    } catch (error: any) {
      this.logger.error(`generateCoursePack failed: ${error.message}`);
      return this.fail(`生成课程包失败: ${error.message}`);
    }
  }
}
