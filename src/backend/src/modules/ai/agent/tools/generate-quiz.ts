import { Injectable } from '@nestjs/common';
import { LlmClient } from '../../llm/llm-client';

@Injectable()
export class GenerateQuizTool {
  constructor(private readonly llmClient: LlmClient) {}

  async execute(args: {
    topic: string;
    difficulty: number;
    ageGroup: string;
  }): Promise<string> {
    try {
      const difficultyDesc =
        args.difficulty === 1 ? '简单' : args.difficulty === 2 ? '中等' : '有挑战';

      const prompt = `请为${args.ageGroup}岁的孩子生成3道关于"${args.topic}"的选择题。
要求：
- 难度：${difficultyDesc}
- 每道题3个选项
- 题目必须自包含，不能依赖外部图片（例如“看图”“图中”“下图”）
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
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return JSON.stringify({ error: '生成测验失败：无法解析题目格式' });
      }

      const raw = JSON.parse(jsonMatch[0]);
      const questions = Array.isArray(raw)
        ? raw
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
                explanation: q?.explanation ? String(q.explanation).trim() : `正确答案是：${options[correctIndex]}`,
              };
            })
            .filter((q: any) => !!q)
        : [];

      if (questions.length === 0) {
        return JSON.stringify({ error: '生成测验失败：题目为空' });
      }

      return JSON.stringify({ questions, topic: args.topic, ageGroup: args.ageGroup });
    } catch (error: any) {
      return JSON.stringify({ error: `生成测验失败: ${error.message}` });
    }
  }
}

