/**
 * GenerateQuizTool — generates quiz questions via LLM.
 * Migrated from modules/ai/agent/tools/generate-quiz.ts
 * Uses shared extractJsonArray from core utils.
 */

import { Injectable } from '@nestjs/common';
import { LlmClientService } from '../../llm/llm-client.service';
import { BaseTool } from '../base-tool';
import { RegisterTool } from '../decorators/register-tool';
import type { ToolMetadata, ToolResult, ToolExecutionContext } from '../../core';
import { extractJsonArray } from '../../core';

type GenerateQuizInput = {
  topic: string;
  difficulty: number;
  ageGroup: string;
};

@Injectable()
@RegisterTool()
export class GenerateQuizTool extends BaseTool<GenerateQuizInput> {
  readonly metadata: ToolMetadata = {
    name: 'generateQuiz',
    description: '生成关于特定主题的选择题测验，包含题目、选项和答案解析',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: '测验主题' },
        difficulty: { type: 'number', description: '难度(1-简单 2-中等 3-有挑战)' },
        ageGroup: { type: 'string', description: '年龄段 (3-4 或 5-6)' },
      },
      required: ['topic', 'difficulty', 'ageGroup'],
    },
    concurrencySafe: false,
    readOnly: false,
    requiresChildId: false,
    requiresParentId: false,
    requiresAgeGroup: true,
  };

  constructor(private readonly llmClient: LlmClientService) {
    super();
  }

  async execute(args: GenerateQuizInput, _context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const difficultyDesc =
        args.difficulty === 1 ? '简单' : args.difficulty === 2 ? '中等' : '有挑战';

      const prompt = `请为${args.ageGroup}岁的孩子生成3道关于"${args.topic}"的选择题。
要求：
- 难度：${difficultyDesc}
- 每道题3个选项
- 题目必须自包含，不能依赖外部图片（例如"看图""图中""下图"）
- correctIndex 必须是从 0 开始的数字

请严格按以下JSON返回，不要加任何其他文字：
[
  {
    "question": "题目",
    "options": ["选项A", "选项B", "选项C"],
    "correctIndex": 0,
    "explanation": "答案解析"
  }
]`;

      const response = await this.llmClient.generate(prompt);
      const raw = extractJsonArray(response);
      if (!raw) {
        return this.fail('生成测验失败：无法解析题目格式');
      }

      const questions = raw
        .map((q: any) => {
          const options = Array.isArray(q?.options)
            ? q.options.map((opt: any) => String(opt ?? '').trim()).filter((opt: string) => !!opt)
            : [];
          if (!q?.question || options.length < 2) return null;

          let correctIndex = Number(q?.correctIndex);
          if (!Number.isFinite(correctIndex)) correctIndex = 0;
          correctIndex = Math.trunc(correctIndex);
          if (correctIndex < 0 || correctIndex >= options.length) {
            const oneBased = correctIndex - 1;
            correctIndex = oneBased >= 0 && oneBased < options.length ? oneBased : 0;
          }

          return {
            question: String(q.question).trim(),
            options,
            correctIndex,
            explanation: q?.explanation
              ? String(q.explanation).trim()
              : `正确答案是：${options[correctIndex]}`,
          };
        })
        .filter((q: any) => !!q);

      if (questions.length === 0) {
        return this.fail('生成测验失败：题目为空');
      }

      return this.ok({ questions, topic: args.topic, ageGroup: args.ageGroup });
    } catch (error: any) {
      return this.fail(`生成测验失败: ${error.message}`);
    }
  }
}
