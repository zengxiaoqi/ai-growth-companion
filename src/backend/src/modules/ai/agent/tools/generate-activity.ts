import { Injectable, Logger } from '@nestjs/common';
import { LlmClient } from '../../llm/llm-client';

export type ActivityType = 'quiz' | 'true_false' | 'fill_blank' | 'matching' | 'connection' | 'sequencing' | 'puzzle';

@Injectable()
export class GenerateActivityTool {
  private readonly logger = new Logger(GenerateActivityTool.name);

  constructor(private readonly llmClient: LlmClient) {}

  async execute(args: {
    type: ActivityType;
    topic: string;
    difficulty: number;
    ageGroup: string;
    domain?: string;
  }): Promise<string> {
    try {
      const prompt = this.buildPrompt(args);
      const response = await this.llmClient.generate(prompt);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return JSON.stringify(this.getFallback(args));
      }
      const parsed = JSON.parse(jsonMatch[0]);
      parsed.type = args.type;
      return JSON.stringify(parsed);
    } catch (error) {
      this.logger.error(`generateActivity failed: ${error.message}`);
      return JSON.stringify(this.getFallback(args));
    }
  }

  private buildPrompt(args: {
    type: ActivityType;
    topic: string;
    difficulty: number;
    ageGroup: string;
    domain?: string;
  }): string {
    const diffDesc = args.difficulty === 1 ? '非常简单' : args.difficulty === 2 ? '适中' : '有挑战性';
    const ageDesc = `${args.ageGroup}岁`;

    const schemas: Record<ActivityType, { desc: string; schema: string }> = {
      quiz: {
        desc: '选择题',
        schema: `{
  "title": "标题",
  "questions": [
    { "question": "题目文字", "options": ["选项A", "选项B", "选项C"], "correctIndex": 0, "explanation": "答案解析" }
  ]
}`,
      },
      true_false: {
        desc: '判断题',
        schema: `{
  "title": "标题",
  "statements": [
    { "statement": "判断语句", "isCorrect": true, "explanation": "解析" }
  ]
}`,
      },
      fill_blank: {
        desc: '填空题',
        schema: `{
  "title": "标题",
  "sentences": [
    { "text": "___是红色的水果", "answer": "苹果", "hint": "提示文字", "options": ["苹果", "香蕉", "葡萄"] }
  ]
}`,
      },
      matching: {
        desc: '配对游戏',
        schema: `{
  "title": "标题",
  "pairs": [
    { "left": "🔴", "right": "红色", "id": "p1" },
    { "left": "🔵", "right": "蓝色", "id": "p2" }
  ]
}`,
      },
      connection: {
        desc: '连线游戏',
        schema: `{
  "title": "标题",
  "leftItems": [
    { "id": "l1", "label": "苹果", "emoji": "🍎" }
  ],
  "rightItems": [
    { "id": "r1", "label": "水果" }
  ],
  "connections": [
    { "left": "l1", "right": "r1" }
  ]
}`,
      },
      sequencing: {
        desc: '排序游戏',
        schema: `{
  "title": "标题",
  "items": [
    { "id": "s1", "label": "第一步", "order": 1 },
    { "id": "s2", "label": "第二步", "order": 2 }
  ]
}`,
      },
      puzzle: {
        desc: '拼图游戏',
        schema: `{
  "title": "标题",
  "pieces": [
    { "id": "pz1", "position": 0, "label": "左上角", "emoji": "🦁" },
    { "id": "pz2", "position": 1, "label": "右上角", "emoji": "头" }
  ],
  "gridSize": { "rows": 2, "cols": 2 }
}`,
      },
    };

    const schemaInfo = schemas[args.type];

    const countGuidance = {
      quiz: '生成3道题',
      true_false: '生成3道判断题',
      fill_blank: '生成3道填空题',
      matching: '生成4对配对',
      connection: '生成4组连线',
      sequencing: '生成4-5个排序项',
      puzzle: '生成适合2x2或2x3网格的拼图',
    }[args.type];

    return `请为${ageDesc}的孩子生成一个关于"${args.topic}"的${schemaInfo.desc}。

要求：
- 难度：${diffDesc}
- 内容适合${ageDesc}儿童
- 用简单有趣的语言
- ${args.type === 'quiz' || args.type === 'true_false' || args.type === 'fill_blank' ? '使用emoji增加趣味性' : ''}
- 3-4岁题目多用emoji和图片描述，5-6岁可以增加文字量
- ${countGuidance}

请严格按以下JSON格式返回，不要加任何其他文字：
${schemaInfo.schema}`;
  }

  /** Fallback templates when LLM fails */
  private getFallback(args: { type: ActivityType; topic: string; ageGroup: string }): any {
    const base = { title: `${args.topic}练习`, topic: args.topic, ageGroup: args.ageGroup };

    switch (args.type) {
      case 'quiz':
        return { ...base, type: 'quiz', questions: [
          { question: `${args.topic}是什么？`, options: ['很好玩', '很有趣', '很棒'], correctIndex: 0, explanation: `${args.topic}真的很好玩！` },
        ]};
      case 'true_false':
        return { ...base, type: 'true_false', statements: [
          { statement: `${args.topic}很有趣`, isCorrect: true, explanation: '没错！学习很有趣！' },
        ]};
      case 'fill_blank':
        return { ...base, type: 'fill_blank', sentences: [
          { text: `我最喜欢学___`, answer: args.topic, hint: '想想你正在学什么', options: [args.topic, '游戏', '画画'] },
        ]};
      case 'matching':
        return { ...base, type: 'matching', pairs: [
          { left: '🔴', right: '红色', id: 'p1' },
          { left: '🔵', right: '蓝色', id: 'p2' },
        ]};
      case 'connection':
        return { ...base, type: 'connection', leftItems: [
          { id: 'l1', label: '太阳', emoji: '☀️' },
          { id: 'l2', label: '月亮', emoji: '🌙' },
        ], rightItems: [
          { id: 'r1', label: '白天' },
          { id: 'r2', label: '晚上' },
        ], connections: [
          { left: 'l1', right: 'r1' },
          { left: 'l2', right: 'r2' },
        ]};
      case 'sequencing':
        return { ...base, type: 'sequencing', items: [
          { id: 's1', label: '早上起床', order: 1 },
          { id: 's2', label: '吃早餐', order: 2 },
          { id: 's3', label: '去上学', order: 3 },
        ]};
      case 'puzzle':
        return { ...base, type: 'puzzle', pieces: [
          { id: 'pz1', position: 0, label: '左上', emoji: '🌟' },
          { id: 'pz2', position: 1, label: '右上', emoji: '✨' },
          { id: 'pz3', position: 2, label: '左下', emoji: '🎈' },
          { id: 'pz4', position: 3, label: '右下', emoji: '🎉' },
        ], gridSize: { rows: 2, cols: 2 } };
      default:
        return { ...base, type: 'quiz', questions: [
          { question: '你准备好了吗？', options: ['准备好了！', '再等等', '让我想想'], correctIndex: 0, explanation: '太棒了！' },
        ]};
    }
  }
}
