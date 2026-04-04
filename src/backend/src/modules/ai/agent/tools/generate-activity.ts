import { Injectable, Logger } from '@nestjs/common';
import { LlmClient } from '../../llm/llm-client';

export type ActivityType = 'quiz' | 'true_false' | 'fill_blank' | 'matching' | 'connection' | 'sequencing' | 'puzzle';

const EXTERNAL_VISUAL_RE = /(看图|图片|图中|下图|这张图|观察图|篮子里|盒子里|盘子里)/;
const COUNTING_RE = /(数一数|有几个|多少个|一共有多少)/;
const EMOJI_RE = /\p{Extended_Pictographic}/gu;

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
      const parsed = this.extractJsonObject(response);
      if (!parsed) {
        return JSON.stringify(this.getFallback(args));
      }
      return JSON.stringify(this.sanitizeActivity(args, parsed));
    } catch (error: any) {
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
    const difficultyDesc =
      args.difficulty === 1 ? '简单' : args.difficulty === 2 ? '中等' : '有挑战';
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
    { "statement": "判断语句", "isCorrect": true, "explanation": "答案解析" }
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
  "leftItems": [{ "id": "l1", "label": "苹果", "emoji": "🍎" }],
  "rightItems": [{ "id": "r1", "label": "水果" }],
  "connections": [{ "left": "l1", "right": "r1" }]
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
    { "id": "pz1", "position": 0, "label": "左上", "emoji": "🌟" },
    { "id": "pz2", "position": 1, "label": "右上", "emoji": "✨" }
  ],
  "gridSize": { "rows": 2, "cols": 2 }
}`,
      },
    };

    const countGuidance = {
      quiz: '生成3道题',
      true_false: '生成3道判断题',
      fill_blank: '生成3道填空题',
      matching: '生成4对配对',
      connection: '生成4组连线',
      sequencing: '生成4-5个排序项',
      puzzle: '生成适合2x2或3x3网格的拼图',
    }[args.type];

    const schemaInfo = schemas[args.type];

    return `请为${ageDesc}的孩子生成一个关于"${args.topic}"的${schemaInfo.desc}。
要求：
- 难度：${difficultyDesc}
- 内容适合${ageDesc}儿童
- 语言要简短、有趣、可直接作答
- ${countGuidance}
- 题目必须自包含，不能引用外部图片信息（例如“看图”“图中”“下图”“篮子里”）
- 对于选择题，correctIndex 必须是数字，且从 0 开始（0/1/2...）
- 数数题必须在题干里直接给出可数元素（emoji 或明确数量）

请严格按以下 JSON 返回，不要加其他文字：
${schemaInfo.schema}`;
  }

  private sanitizeActivity(
    args: { type: ActivityType; topic: string; difficulty: number; ageGroup: string; domain?: string },
    raw: any,
  ): any {
    switch (args.type) {
      case 'quiz':
        return this.sanitizeQuiz(args, raw);
      case 'true_false':
        return this.sanitizeTrueFalse(args, raw);
      case 'fill_blank':
        return this.sanitizeFillBlank(args, raw);
      case 'matching':
        return this.sanitizeMatching(args, raw);
      case 'connection':
        return this.sanitizeConnection(args, raw);
      case 'sequencing':
        return this.sanitizeSequencing(args, raw);
      case 'puzzle':
        return this.sanitizePuzzle(args, raw);
      default:
        return this.getFallback(args);
    }
  }

  private sanitizeQuiz(
    args: { type: ActivityType; topic: string; difficulty: number; ageGroup: string; domain?: string },
    raw: any,
  ) {
    const title = this.toText(raw?.title, `${args.topic}练习`);
    const normalized = Array.isArray(raw?.questions)
      ? raw.questions
          .map((q: any, idx: number) => this.normalizeQuizQuestion(args, q, idx))
          .filter((q: any) => !!q)
      : [];

    while (normalized.length < 3) {
      normalized.push(this.createSelfContainedCountingQuestion(args, normalized.length));
    }

    return {
      type: 'quiz',
      title,
      topic: args.topic,
      ageGroup: args.ageGroup,
      questions: normalized.slice(0, 5),
    };
  }

  private sanitizeTrueFalse(
    args: { topic: string; ageGroup: string },
    raw: any,
  ) {
    const title = this.toText(raw?.title, `${args.topic}判断题`);
    const statements = Array.isArray(raw?.statements)
      ? raw.statements
          .map((s: any) => ({
            statement: this.toText(s?.statement),
            isCorrect: this.toBoolean(s?.isCorrect),
            explanation: this.toText(s?.explanation, '继续加油！'),
          }))
          .filter((s: any) => !!s.statement)
      : [];

    if (statements.length === 0) {
      return this.getFallback({ type: 'true_false', topic: args.topic, ageGroup: args.ageGroup } as any);
    }

    return {
      type: 'true_false',
      title,
      topic: args.topic,
      ageGroup: args.ageGroup,
      statements: statements.slice(0, 5),
    };
  }

  private sanitizeFillBlank(
    args: { topic: string; ageGroup: string },
    raw: any,
  ) {
    const title = this.toText(raw?.title, `${args.topic}填空`);
    const sentences = Array.isArray(raw?.sentences)
      ? raw.sentences
          .map((s: any) => {
            const answer = this.toText(s?.answer);
            const options = this.normalizeOptions(s?.options, answer ? [answer] : []);
            if (!answer) return null;
            if (!options.includes(answer)) options.unshift(answer);
            return {
              text: this.toText(s?.text, `___ 与 ${args.topic} 有关`),
              answer,
              hint: this.toText(s?.hint, '请从选项里选一个'),
              options: options.slice(0, 5),
            };
          })
          .filter((s: any) => !!s)
      : [];

    if (sentences.length === 0) {
      return this.getFallback({ type: 'fill_blank', topic: args.topic, ageGroup: args.ageGroup } as any);
    }

    return {
      type: 'fill_blank',
      title,
      topic: args.topic,
      ageGroup: args.ageGroup,
      sentences: sentences.slice(0, 5),
    };
  }

  private sanitizeMatching(
    args: { topic: string; ageGroup: string },
    raw: any,
  ) {
    const title = this.toText(raw?.title, `${args.topic}配对`);
    const pairs = Array.isArray(raw?.pairs)
      ? raw.pairs
          .map((p: any, idx: number) => ({
            id: this.toText(p?.id, `p${idx + 1}`),
            left: this.toText(p?.left),
            right: this.toText(p?.right),
          }))
          .filter((p: any) => p.left && p.right)
      : [];

    if (pairs.length < 2) return this.getFallback({ type: 'matching', topic: args.topic, ageGroup: args.ageGroup } as any);

    return {
      type: 'matching',
      title,
      topic: args.topic,
      ageGroup: args.ageGroup,
      pairs: pairs.slice(0, 8),
    };
  }

  private sanitizeConnection(
    args: { topic: string; ageGroup: string },
    raw: any,
  ) {
    const title = this.toText(raw?.title, `${args.topic}连线`);
    const leftItems = Array.isArray(raw?.leftItems)
      ? raw.leftItems
          .map((it: any, idx: number) => ({
            id: this.toText(it?.id, `l${idx + 1}`),
            label: this.toText(it?.label),
            emoji: this.toText(it?.emoji),
          }))
          .filter((it: any) => it.label)
      : [];
    const rightItems = Array.isArray(raw?.rightItems)
      ? raw.rightItems
          .map((it: any, idx: number) => ({
            id: this.toText(it?.id, `r${idx + 1}`),
            label: this.toText(it?.label),
          }))
          .filter((it: any) => it.label)
      : [];
    const connections = Array.isArray(raw?.connections)
      ? raw.connections
          .map((c: any) => ({
            left: this.toText(c?.left),
            right: this.toText(c?.right),
          }))
          .filter((c: any) => c.left && c.right)
      : [];

    if (leftItems.length < 2 || rightItems.length < 2 || connections.length < 2) {
      return this.getFallback({ type: 'connection', topic: args.topic, ageGroup: args.ageGroup } as any);
    }

    return {
      type: 'connection',
      title,
      topic: args.topic,
      ageGroup: args.ageGroup,
      leftItems: leftItems.slice(0, 8),
      rightItems: rightItems.slice(0, 8),
      connections: connections.slice(0, 8),
    };
  }

  private sanitizeSequencing(
    args: { topic: string; ageGroup: string },
    raw: any,
  ) {
    const title = this.toText(raw?.title, `${args.topic}排序`);
    const items = Array.isArray(raw?.items)
      ? raw.items
          .map((it: any, idx: number) => ({
            id: this.toText(it?.id, `s${idx + 1}`),
            label: this.toText(it?.label),
            order: this.toSafeInt(it?.order, idx + 1),
          }))
          .filter((it: any) => it.label)
      : [];

    if (items.length < 3) return this.getFallback({ type: 'sequencing', topic: args.topic, ageGroup: args.ageGroup } as any);

    return {
      type: 'sequencing',
      title,
      topic: args.topic,
      ageGroup: args.ageGroup,
      items: items.slice(0, 8),
    };
  }

  private sanitizePuzzle(
    args: { topic: string; ageGroup: string },
    raw: any,
  ) {
    const title = this.toText(raw?.title, `${args.topic}拼图`);
    const pieces = Array.isArray(raw?.pieces)
      ? raw.pieces
          .map((p: any, idx: number) => ({
            id: this.toText(p?.id, `pz${idx + 1}`),
            position: this.toSafeInt(p?.position, idx),
            label: this.toText(p?.label, `位置${idx + 1}`),
            emoji: this.toText(p?.emoji, '⭐'),
          }))
          .filter((p: any) => p.id)
      : [];
    const rows = this.toSafeInt(raw?.gridSize?.rows, 2);
    const cols = this.toSafeInt(raw?.gridSize?.cols, 2);

    if (pieces.length < 4) return this.getFallback({ type: 'puzzle', topic: args.topic, ageGroup: args.ageGroup } as any);

    return {
      type: 'puzzle',
      title,
      topic: args.topic,
      ageGroup: args.ageGroup,
      pieces: pieces.slice(0, 9),
      gridSize: { rows: Math.max(2, Math.min(3, rows)), cols: Math.max(2, Math.min(3, cols)) },
    };
  }

  private normalizeQuizQuestion(
    args: { topic: string; ageGroup: string },
    raw: any,
    seed: number,
  ) {
    const options = this.normalizeOptions(raw?.options);
    if (options.length < 2) return null;

    let question = this.toText(raw?.question);
    const invalidVisualDependency =
      !question ||
      EXTERNAL_VISUAL_RE.test(question) ||
      (COUNTING_RE.test(question) && this.getEmojiCount(question) < 2);

    if (invalidVisualDependency) {
      return this.createSelfContainedCountingQuestion(args, seed);
    }

    const correctIndex = this.resolveCorrectIndex(raw, options);
    const explanation = this.toText(raw?.explanation, `正确答案是：${options[correctIndex]}`);
    question = question.slice(0, 120);

    return {
      question,
      options,
      correctIndex,
      explanation,
    };
  }

  private createSelfContainedCountingQuestion(args: { topic: string; ageGroup: string }, seed: number) {
    const emoji = this.pickTopicEmoji(args.topic, seed);
    const count = 2 + ((seed + Math.floor(Math.random() * 6)) % 7); // 2-8
    const questionVisual = emoji.repeat(count);
    const correct = count;

    const candidates = new Set<number>([correct]);
    for (const delta of [-2, -1, 1, 2, 3]) {
      const n = Math.max(1, correct + delta);
      if (candidates.size < 3) candidates.add(n);
    }

    const optionNumbers = Array.from(candidates).slice(0, 3);
    for (let i = optionNumbers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [optionNumbers[i], optionNumbers[j]] = [optionNumbers[j], optionNumbers[i]];
    }

    const options = optionNumbers.map((n) => `${n}个 ${emoji.repeat(Math.min(8, n))}`);
    const correctIndex = optionNumbers.findIndex((n) => n === correct);

    return {
      question: `数一数：${questionVisual} 一共有几个？`,
      options,
      correctIndex: correctIndex >= 0 ? correctIndex : 0,
      explanation: `题目里有 ${correct} 个。`,
    };
  }

  private pickTopicEmoji(topic: string, seed: number): string {
    const text = this.toText(topic).toLowerCase();
    const map: Array<{ keys: string[]; emoji: string }> = [
      { keys: ['苹果', '水果', 'fruit', 'apple'], emoji: '🍎' },
      { keys: ['香蕉', 'banana'], emoji: '🍌' },
      { keys: ['动物', 'animal'], emoji: '🐶' },
      { keys: ['花', 'flower'], emoji: '🌸' },
      { keys: ['星', 'star'], emoji: '⭐' },
      { keys: ['数字', '数', 'math', '数学'], emoji: '🔢' },
    ];
    const matched = map.find((m) => m.keys.some((k) => text.includes(k)));
    if (matched) return matched.emoji;
    const defaults = ['🍎', '⭐', '🌸', '🧸', '🐱', '🍊'];
    return defaults[seed % defaults.length];
  }

  private resolveCorrectIndex(raw: any, options: string[]): number {
    const len = options.length;
    const explicitAnswerText = this.toText(raw?.correctAnswer || raw?.answer || raw?.correctOption);
    if (explicitAnswerText) {
      const textMatch = options.findIndex((opt) => opt === explicitAnswerText || opt.includes(explicitAnswerText));
      if (textMatch >= 0) return textMatch;
    }

    const candidates = [raw?.correctIndex, raw?.answerIndex, raw?.correct];
    for (const c of candidates) {
      const idx = this.toSafeInt(c, Number.NaN);
      if (!Number.isNaN(idx) && idx >= 0 && idx < len) return idx;
      if (!Number.isNaN(idx) && idx >= 1 && idx <= len) return idx - 1;
    }

    return 0;
  }

  private normalizeOptions(input: any, mustInclude: string[] = []): string[] {
    const source = Array.isArray(input) ? input : [];
    const normalized = source
      .map((item) => this.toText(typeof item === 'object' ? item?.label ?? item?.text ?? item?.value : item))
      .filter((v) => !!v);

    for (const item of mustInclude) {
      if (item && !normalized.includes(item)) normalized.unshift(item);
    }

    const unique: string[] = [];
    for (const opt of normalized) {
      if (!unique.includes(opt)) unique.push(opt);
    }
    return unique.slice(0, 6);
  }

  private extractJsonObject(text: string): any | null {
    if (!text) return null;
    const trimmed = text.trim();
    try {
      return JSON.parse(trimmed);
    } catch {}

    const codeBlockMatch = trimmed.match(/```json\s*([\s\S]*?)```/i) || trimmed.match(/```\s*([\s\S]*?)```/i);
    if (codeBlockMatch?.[1]) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch {}
    }

    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
      } catch {}
    }
    return null;
  }

  private getEmojiCount(text: string): number {
    const matches = text.match(EMOJI_RE);
    return matches ? matches.length : 0;
  }

  private toText(value: any, fallback = ''): string {
    if (value == null) return fallback;
    const str = String(value).replace(/\s+/g, ' ').trim();
    return str || fallback;
  }

  private toSafeInt(value: any, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
  }

  private toBoolean(value: any): boolean {
    if (typeof value === 'boolean') return value;
    const text = this.toText(value).toLowerCase();
    if (['true', '1', 'yes', '对', '正确', '是'].includes(text)) return true;
    if (['false', '0', 'no', '错', '错误', '否'].includes(text)) return false;
    return false;
  }

  /** Fallback templates when LLM fails */
  private getFallback(args: { type: ActivityType; topic: string; ageGroup: string }): any {
    const base = { title: `${args.topic}练习`, topic: args.topic, ageGroup: args.ageGroup };

    switch (args.type) {
      case 'quiz':
        return {
          ...base,
          type: 'quiz',
          questions: [
            this.createSelfContainedCountingQuestion(args, 0),
            this.createSelfContainedCountingQuestion(args, 1),
            this.createSelfContainedCountingQuestion(args, 2),
          ],
        };
      case 'true_false':
        return {
          ...base,
          type: 'true_false',
          statements: [
            { statement: `${args.topic}很有趣`, isCorrect: true, explanation: '没错，学习很有趣！' },
            { statement: '1+1=3', isCorrect: false, explanation: '1+1=2。' },
            { statement: '太阳白天出现', isCorrect: true, explanation: '是的。' },
          ],
        };
      case 'fill_blank':
        return {
          ...base,
          type: 'fill_blank',
          sentences: [
            { text: '___ 是红色的水果', answer: '苹果', hint: '常见水果', options: ['苹果', '香蕉', '葡萄'] },
            { text: '___ 有四条腿', answer: '小狗', hint: '会汪汪叫', options: ['小狗', '小鸟', '小鱼'] },
            { text: '天空是 ___ 色', answer: '蓝', hint: '晴天常见颜色', options: ['蓝', '黑', '粉'] },
          ],
        };
      case 'matching':
        return {
          ...base,
          type: 'matching',
          pairs: [
            { left: '🔴', right: '红色', id: 'p1' },
            { left: '🔵', right: '蓝色', id: 'p2' },
            { left: '⭐', right: '星星', id: 'p3' },
            { left: '🌙', right: '月亮', id: 'p4' },
          ],
        };
      case 'connection':
        return {
          ...base,
          type: 'connection',
          leftItems: [
            { id: 'l1', label: '太阳', emoji: '☀️' },
            { id: 'l2', label: '月亮', emoji: '🌙' },
            { id: 'l3', label: '苹果', emoji: '🍎' },
            { id: 'l4', label: '小鱼', emoji: '🐟' },
          ],
          rightItems: [
            { id: 'r1', label: '白天' },
            { id: 'r2', label: '夜晚' },
            { id: 'r3', label: '水果' },
            { id: 'r4', label: '会游泳' },
          ],
          connections: [
            { left: 'l1', right: 'r1' },
            { left: 'l2', right: 'r2' },
            { left: 'l3', right: 'r3' },
            { left: 'l4', right: 'r4' },
          ],
        };
      case 'sequencing':
        return {
          ...base,
          type: 'sequencing',
          items: [
            { id: 's1', label: '起床', order: 1 },
            { id: 's2', label: '吃早餐', order: 2 },
            { id: 's3', label: '去上学', order: 3 },
            { id: 's4', label: '回家', order: 4 },
          ],
        };
      case 'puzzle':
        return {
          ...base,
          type: 'puzzle',
          pieces: [
            { id: 'pz1', position: 0, label: '左上', emoji: '🌟' },
            { id: 'pz2', position: 1, label: '右上', emoji: '✨' },
            { id: 'pz3', position: 2, label: '左下', emoji: '🎈' },
            { id: 'pz4', position: 3, label: '右下', emoji: '🎉' },
          ],
          gridSize: { rows: 2, cols: 2 },
        };
      default:
        return {
          ...base,
          type: 'quiz',
          questions: [this.createSelfContainedCountingQuestion(args, 0)],
        };
    }
  }
}

