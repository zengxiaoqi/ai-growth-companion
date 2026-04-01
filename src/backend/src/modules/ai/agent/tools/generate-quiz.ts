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
        args.difficulty === 1 ? '非常简单' : args.difficulty === 2 ? '适中' : '有挑战性';

      const prompt = `请为${args.ageGroup}岁的孩子生成3道关于"${args.topic}"的选择题。

要求：
- 难度：${difficultyDesc}
- 每道题3个选项
- 内容适合${args.ageGroup}岁儿童
- 用简单有趣的语言

请严格按以下JSON格式返回，不要加任何其他文字：
[
  {
    "question": "题目",
    "options": ["选项A", "选项B", "选项C"],
    "correctIndex": 0,
    "explanation": "答案解析"
  }
]`;

      const response = await this.llmClient.generate(prompt);

      // Try to parse the JSON from the response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return JSON.stringify({ error: '生成测验失败：无法解析题目格式' });
      }

      const questions = JSON.parse(jsonMatch[0]);
      return JSON.stringify({ questions, topic: args.topic, ageGroup: args.ageGroup });
    } catch (error) {
      return JSON.stringify({ error: `生成测验失败: ${error.message}` });
    }
  }
}
