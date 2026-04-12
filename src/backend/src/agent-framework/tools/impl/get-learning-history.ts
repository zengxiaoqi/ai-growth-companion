/**
 * GetLearningHistoryTool — retrieves a child's learning history.
 * Migrated from modules/ai/agent/tools/get-learning-history.ts
 */

import { Injectable } from '@nestjs/common';
import { LearningService } from '../../../modules/learning/learning.service';
import { BaseTool } from '../base-tool';
import { RegisterTool } from '../decorators/register-tool';
import type { ToolMetadata, ToolResult, ToolExecutionContext } from '../../core';

type GetLearningHistoryInput = { childId: number; limit?: number };

@Injectable()
@RegisterTool()
export class GetLearningHistoryTool extends BaseTool<GetLearningHistoryInput> {
  readonly metadata: ToolMetadata = {
    name: 'getLearningHistory',
    description: '获取孩子的学习历史记录，包括学习内容、得分和时间',
    inputSchema: {
      type: 'object',
      properties: {
        childId: { type: 'number', description: '孩子ID' },
        limit: { type: 'number', description: '返回记录数量，默认10' },
      },
      required: ['childId'],
    },
    concurrencySafe: true,
    readOnly: true,
    requiresChildId: true,
    requiresParentId: false,
    requiresAgeGroup: false,
  };

  constructor(private readonly learningService: LearningService) {
    super();
  }

  async execute(args: GetLearningHistoryInput, _context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const records = await this.learningService.findByUser(args.childId);
      const limit = args.limit || 10;

      return this.ok(
        records.slice(0, limit).map((r: any) => ({
          contentTitle: r.content?.title || '未知内容',
          domain: r.domain,
          score: r.score,
          type: r.type,
          createdAt: r.createdAt,
        })),
      );
    } catch (error: any) {
      return this.fail(`获取学习历史失败: ${error.message}`);
    }
  }
}
