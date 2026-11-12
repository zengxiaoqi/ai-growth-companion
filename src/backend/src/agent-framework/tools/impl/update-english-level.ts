/**
 * UpdateEnglishLevelTool — persists the english-practice coach's observation
 * of a child's English level. Lightweight: writes an AbilityAssessment via an
 * EMA-smoothed score (no LearningRecord / achievement side effects), so the
 * next turn's prompt picks up the new level.
 */

import { Injectable } from '@nestjs/common';
import { AbilitiesService } from '../../../modules/abilities/abilities.service';
import { scoreToEnglishLevel } from '../../../modules/abilities/english-level';
import { BaseTool } from '../base-tool';
import { RegisterTool } from '../decorators/register-tool';
import type { ToolMetadata, ToolResult, ToolExecutionContext } from '../../core';

type UpdateEnglishLevelInput = {
  childId: number;
  score: number;
  observedWords?: string[];
  errors?: string[];
  suggestion?: string;
};

@Injectable()
@RegisterTool()
export class UpdateEnglishLevelTool extends BaseTool<UpdateEnglishLevelInput> {
  readonly metadata: ToolMetadata = {
    name: 'updateEnglishLevel',
    description:
      '记录英语陪练中观察到的孩子英语水平(0-100分)，系统平滑更新英语能力等级。每3-5轮或水平明显变化时调用，绝不向孩子提及分数或等级。',
    inputSchema: {
      type: 'object',
      properties: {
        childId: { type: 'number', description: '孩子ID' },
        score: {
          type: 'number',
          description: '本轮观察评分(0-100)：依据主动输出的词汇、句子完整度、理解反应',
        },
        observedWords: {
          type: 'array',
          items: { type: 'string' },
          description: '孩子本轮主动说出的英文词',
        },
        errors: {
          type: 'array',
          items: { type: 'string' },
          description: '观察到的典型错误',
        },
        suggestion: { type: 'string', description: '下一步陪练建议' },
      },
      required: ['childId', 'score'],
    },
    concurrencySafe: false,
    readOnly: false,
    requiresChildId: true,
    requiresParentId: false,
    requiresAgeGroup: false,
  };

  constructor(private readonly abilitiesService: AbilitiesService) {
    super();
  }

  async execute(
    args: UpdateEnglishLevelInput,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    try {
      const childId = args?.childId;
      if (childId == null) return this.fail('缺少 childId');
      const raw = Number(args.score);
      if (!Number.isFinite(raw)) return this.fail('分数必须是数字');
      const score = Math.max(0, Math.min(100, Math.round(raw)));

      const assessment = await this.abilitiesService.updateWithEma(childId, 'english', score, {
        source: 'english-practice',
        observedWords: args.observedWords ?? [],
        errors: args.errors ?? [],
        suggestion: args.suggestion ?? '',
      });

      const previousScore = (assessment.evidence as any)?.previousScore ?? null;
      return this.ok({
        score: assessment.score,
        englishLevel: scoreToEnglishLevel(assessment.score),
        previousScore,
        changed: previousScore == null || previousScore !== assessment.score,
      });
    } catch (error: any) {
      return this.fail(`更新英语水平失败: ${error.message}`);
    }
  }
}