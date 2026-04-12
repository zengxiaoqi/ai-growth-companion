/**
 * GetRecommendationsTool — retrieves personalized content recommendations.
 * Migrated from modules/ai/agent/tools/get-recommendations.ts
 */

import { Injectable } from '@nestjs/common';
import { RecommendService } from '../../../modules/recommend/recommend.service';
import { UsersService } from '../../../modules/users/users.service';
import { BaseTool } from '../base-tool';
import { RegisterTool } from '../decorators/register-tool';
import type { ToolMetadata, ToolResult, ToolExecutionContext } from '../../core';

type GetRecommendationsInput = { childId: number; limit?: number };

@Injectable()
@RegisterTool()
export class GetRecommendationsTool extends BaseTool<GetRecommendationsInput> {
  readonly metadata: ToolMetadata = {
    name: 'getRecommendations',
    description: '获取个性化学习推荐内容，基于孩子的年龄和能力推荐适合的学习材料',
    inputSchema: {
      type: 'object',
      properties: {
        childId: { type: 'number', description: '孩子ID' },
        limit: { type: 'number', description: '返回数量限制，默认5' },
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
    private readonly recommendService: RecommendService,
    private readonly usersService: UsersService,
  ) {
    super();
  }

  async execute(args: GetRecommendationsInput, _context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const user = await this.usersService.findById(args.childId);
      if (!user) {
        return this.fail(`未找到ID为 ${args.childId} 的用户`);
      }

      const recommendations = await this.recommendService.recommend(
        {
          userId: args.childId,
          ageRange: `${user.age - 1}-${user.age + 1}`,
        },
      );
      const items = Array.isArray(recommendations) ? recommendations : [];
      const limit = args.limit || 5;

      return this.ok(
        items.slice(0, limit).map((r: any) => ({
          id: r.id,
          title: r.title,
          domain: r.domain,
          reason: r.reason || '适合当前学习进度',
          ageGroup: r.ageGroup,
        })),
      );
    } catch (error: any) {
      return this.fail(`获取推荐失败: ${error.message}`);
    }
  }
}
