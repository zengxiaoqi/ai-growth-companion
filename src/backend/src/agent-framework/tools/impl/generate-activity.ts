/**
 * GenerateActivityTool — generates structured learning activities via LLM.
 * Migrated from modules/ai/agent/tools/generate-activity.ts (877 lines → cleaner)
 * Uses shared extractJsonObject from core utils.
 */

import { Injectable, Logger } from '@nestjs/common';
import { LlmClientService } from '../../llm/llm-client.service';
import { BaseTool } from '../base-tool';
import { RegisterTool } from '../decorators/register-tool';
import type { ToolMetadata, ToolResult, ToolExecutionContext } from '../../core';
import { extractJsonObject } from '../../core';

type ActivityType = 'quiz' | 'true_false' | 'fill_blank' | 'matching' | 'connection' | 'sequencing' | 'puzzle';

type GenerateActivityArgs = {
  type: ActivityType;
  topic: string;
  difficulty: number;
  ageGroup: string;
  domain?: string;
};

type ValidationResult = {
  ok: boolean;
  reason?: string;
  debug?: Record<string, any>;
};

const MAX_GENERATION_ATTEMPTS = 3;
const SUPPORTED_TYPES: ActivityType[] = ['quiz', 'true_false', 'fill_blank', 'matching', 'connection', 'sequencing', 'puzzle'];

const ANIMAL_TOPIC_RE = /(动物|农场|森林|海洋|宠物|家禽|家畜|小鸡|小鸭|小猫|小狗|animal|farm|zoo|pet|wild|livestock)/i;
const NUMBER_TOPIC_RE = /(数学|数字|认数|数数|加法|减法|math|number|count|arithmetic)/i;
const GENERIC_FALLBACK_RE = /(wake up|breakfast|go to school|go home|sun|moon|apple|fish|1\+1=3|太阳白天出现|起床|吃早饭|去上学|回家)/i;

const ANIMAL_TERMS = [
  '动物', '牛', '羊', '猪', '鸡', '鸭', '鹅', '马', '狗', '猫', '兔', '鱼',
  '鸟', '鹿', '熊', '狐狸', '松鼠', '青蛙', '海豚', '鲸', '乌龟',
  'animal', 'cow', 'sheep', 'pig', 'chicken', 'duck', 'horse', 'dog', 'cat', 'rabbit', 'fish',
];
const NUMBER_TERMS = [
  '零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '数字', '数学',
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'number', 'count',
];
const TOPIC_STOP_WORDS = new Set([
  '认识', '学习', '练习', '继续', '更多', '一个', '一下',
  '关于', '主题', '游戏', '活动', '题目', '儿童', '孩子',
  '知识', '基础', '训练', '挑战',
]);
const TOPIC_CORE_TERMS = [
  '动物', '农场', '森林', '海洋', '栖息', '住在',
  '习性', '行为', '成长', '孵化', '生命周期',
  '分类', '爱吃', '食物', '家禽', '家畜',
  '数字', '数学', '认数', '数数', '加法', '减法',
  '小鸡', '小鸭', '小猫', '小狗',
  'animal', 'farm', 'zoo', 'pet', 'wild', 'habitat', 'diet', 'classification', 'growth', 'life', 'cycle',
  'math', 'number', 'count', 'arithmetic',
];

@Injectable()
@RegisterTool()
export class GenerateActivityTool extends BaseTool<GenerateActivityArgs> {
  private readonly logger = new Logger(GenerateActivityTool.name);

  readonly metadata: ToolMetadata = {
    name: 'generateActivity',
    description: '生成互动学习活动，支持7种题型：quiz(选择题)、true_false(判断题)、fill_blank(填空题)、matching(配对)、connection(连线)、sequencing(排序)、puzzle(拼图)',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: SUPPORTED_TYPES,
          description: '活动类型',
        },
        topic: { type: 'string', description: '活动主题' },
        difficulty: { type: 'number', description: '难度(1-3)' },
        ageGroup: { type: 'string', description: '年龄段 (3-4 或 5-6)' },
        domain: { type: 'string', description: '学习领域(可选)' },
      },
      required: ['type', 'topic', 'difficulty', 'ageGroup'],
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

  async execute(args: GenerateActivityArgs, _context: ToolExecutionContext): Promise<ToolResult> {
    const normalizedArgs = this.normalizeArgs(args);
    const failures: string[] = [];
    const runId = this.createRunId();

    this.logger.log(`[generateActivity] start ${JSON.stringify({
      runId, type: normalizedArgs.type, topic: normalizedArgs.topic,
      difficulty: normalizedArgs.difficulty, ageGroup: normalizedArgs.ageGroup,
    })}`);

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
      try {
        const prompt = this.buildPrompt(normalizedArgs, attempt, failures);
        this.logger.log(`[generateActivity] llm_request ${JSON.stringify({ runId, attempt, topic: normalizedArgs.topic, type: normalizedArgs.type })}`);

        const response = await this.llmClient.generate(prompt);
        const parsed = extractJsonObject(response);

        if (!parsed) {
          const reason = 'model did not return parseable JSON';
          failures.push(`attempt ${attempt}: ${reason}`);
          this.logger.warn(`[generateActivity] attempt_failed ${JSON.stringify({ runId, attempt, reason })}`);
          continue;
        }

        const sanitized = this.sanitizeActivity(normalizedArgs, parsed);
        const alignment = this.validateTopicAlignment(normalizedArgs, sanitized);
        if (!alignment.ok) {
          const reason = alignment.reason || 'topic alignment check failed';
          failures.push(`attempt ${attempt}: ${reason}`);
          this.logger.warn(`[generateActivity] attempt_failed ${JSON.stringify({ runId, attempt, reason })}`);
          continue;
        }

        this.logger.log(`[generateActivity] success ${JSON.stringify({ runId, attempt, topic: normalizedArgs.topic, type: normalizedArgs.type })}`);
        return this.ok(sanitized, sanitized);
      } catch (error: any) {
        const reason = error?.message || 'unknown error';
        failures.push(`attempt ${attempt}: ${reason}`);
        this.logger.warn(`[generateActivity] attempt_exception ${JSON.stringify({ runId, attempt, reason })}`);
      }
    }

    const detail = failures.join(' | ');
    this.logger.error(`[generateActivity] failed_after_retries ${JSON.stringify({ runId, topic: normalizedArgs.topic, type: normalizedArgs.type, failures })}`);
    return this.fail(`Unable to generate a topic-aligned activity. details=${detail}`);
  }

  private normalizeArgs(args: GenerateActivityArgs): GenerateActivityArgs {
    const type = this.toText(args.type) as ActivityType;
    const topic = this.toText(args.topic);
    const difficulty = this.toSafeInt(args.difficulty, 1);
    const ageGroup = this.toText(args.ageGroup);
    const domain = this.toText(args.domain);

    if (!SUPPORTED_TYPES.includes(type)) {
      throw new Error(`Unsupported activity type: ${args.type}`);
    }
    if (!topic) {
      throw new Error('topic is required');
    }
    if (!['3-4', '5-6'].includes(ageGroup)) {
      throw new Error(`Unsupported ageGroup: ${ageGroup}`);
    }

    return {
      type, topic,
      difficulty: Math.max(1, Math.min(3, difficulty)),
      ageGroup,
      domain: domain || undefined,
    };
  }

  private buildPrompt(args: GenerateActivityArgs, attempt: number, failures: string[]): string {
    const schema = this.schemaForType(args.type);
    const typeRules = this.typeRules(args.type);
    const topicRules = this.topicRules(args.topic);
    const failureNotes = failures.length > 0
      ? ['Previous attempt failed. Avoid repeating these issues:', ...failures.slice(-2).map((item) => `- ${item}`)].join('\n')
      : '';

    const noGenericRules = [
      '- Do not output generic template content unrelated to the topic.',
      '- Avoid patterns like "wake up / breakfast / go to school / go home", "sun/moon/apple/fish", "1+1=3".',
      '- If topic is animals, include concrete animal knowledge points, not only counting.',
      '- For fill_blank, never set all answers to the topic text itself. Use concrete knowledge answers.',
      '- Return strict JSON only. No markdown. No explanations.',
    ].join('\n');

    return [
      'You are a children learning activity generator.',
      `Age group: ${args.ageGroup}. Topic: ${args.topic}. Difficulty: ${args.difficulty}. Type: ${args.type}.`,
      args.domain ? `Domain: ${args.domain}.` : '',
      `Attempt: ${attempt}.`,
      failureNotes,
      'Type constraints:',
      ...typeRules.map((rule) => `- ${rule}`),
      'Topic constraints:',
      ...topicRules.map((rule) => `- ${rule}`),
      noGenericRules,
      'Return JSON schema:',
      schema,
    ].filter(Boolean).join('\n');
  }

  private schemaForType(type: ActivityType): string {
    switch (type) {
      case 'quiz':
        return '{"type":"quiz","title":"...","topic":"...","ageGroup":"...","questions":[{"question":"...","options":["...","...","..."],"correctIndex":0,"explanation":"..."}]}';
      case 'true_false':
        return '{"type":"true_false","title":"...","topic":"...","ageGroup":"...","statements":[{"statement":"...","isCorrect":true,"explanation":"..."}]}';
      case 'fill_blank':
        return '{"type":"fill_blank","title":"...","topic":"...","ageGroup":"...","sentences":[{"text":"...___...","answer":"...","hint":"...","options":["...","...","..."]}]}';
      case 'matching':
        return '{"type":"matching","title":"...","topic":"...","ageGroup":"...","pairs":[{"id":"p1","left":"...","right":"..."}]}';
      case 'connection':
        return '{"type":"connection","title":"...","topic":"...","ageGroup":"...","leftItems":[{"id":"l1","label":"...","emoji":"..."}],"rightItems":[{"id":"r1","label":"..."}],"connections":[{"left":"l1","right":"r1"}]}';
      case 'sequencing':
        return '{"type":"sequencing","title":"...","topic":"...","ageGroup":"...","items":[{"id":"s1","label":"...","order":1}]}';
      case 'puzzle':
        return '{"type":"puzzle","title":"...","topic":"...","ageGroup":"...","pieces":[{"id":"pz1","position":0,"label":"...","emoji":"..."}],"gridSize":{"rows":2,"cols":2}}';
      default:
        return '{}';
    }
  }

  private typeRules(type: ActivityType): string[] {
    const common = ['Use short and answerable sentences.', 'At least 3 valid items (prefer 4+ for matching/connection).'];
    switch (type) {
      case 'quiz': return [...common, 'Generate 3-5 questions.', 'At least 3 options per question.', 'correctIndex must be a zero-based number.'];
      case 'true_false': return [...common, 'Generate 3-5 statements.', 'isCorrect must be a boolean.'];
      case 'fill_blank': return [...common, 'Generate 3-5 fill-in sentences.', 'Each sentence must contain a blank marker like ___.', 'answer must appear in options.', 'Do not reuse the same answer for all sentences.'];
      case 'matching': return [...common, 'Generate 4-8 pairs.', 'left/right should be in the same knowledge domain.'];
      case 'connection': return [...common, 'Generate 4-8 connections.', 'connections must reference existing ids.'];
      case 'sequencing': return [...common, 'Generate 4-6 ordered steps.', 'order must be sequential and meaningful.'];
      case 'puzzle': return [...common, 'Generate 2x2 or 3x3 puzzle data.', 'pieces should match grid size.'];
      default: return common;
    }
  }

  private topicRules(topic: string): string[] {
    const rules = [`Everything must stay on topic: ${topic}`];
    const t = topic.toLowerCase();
    if (this.isAnimalTopic(t)) {
      rules.push('Include at least two concrete animals or animal traits.');
      rules.push('Do not reduce to pure counting; include real animal knowledge.');
    }
    if (this.isNumberTopic(t)) {
      rules.push('Include concrete numbers (for example 0-10 or Chinese numerals), not generic placeholders.');
      rules.push('For fill blanks, answers should be actual numbers or math words, not the full topic phrase.');
    }
    if (t.includes('住') || t.includes('栖息')) rules.push('Must include habitat or where-animal-lives information.');
    if (t.includes('习性')) rules.push('Must include behavior or habits.');
    if (t.includes('成长') || t.includes('生命周期')) rules.push('Must include growth stages or life cycle.');
    if (t.includes('分类')) rules.push('Must include classification information.');
    if (t.includes('爱吃') || t.includes('食物')) rules.push('Must include diet information.');
    return rules;
  }

  private sanitizeActivity(args: GenerateActivityArgs, raw: any): any {
    switch (args.type) {
      case 'quiz': return this.sanitizeQuiz(args, raw);
      case 'true_false': return this.sanitizeTrueFalse(args, raw);
      case 'fill_blank': return this.sanitizeFillBlank(args, raw);
      case 'matching': return this.sanitizeMatching(args, raw);
      case 'connection': return this.sanitizeConnection(args, raw);
      case 'sequencing': return this.sanitizeSequencing(args, raw);
      case 'puzzle': return this.sanitizePuzzle(args, raw);
      default: throw new Error(`Unsupported type: ${args.type}`);
    }
  }

  private sanitizeQuiz(args: GenerateActivityArgs, raw: any) {
    const questions = (Array.isArray(raw?.questions) ? raw.questions : [])
      .map((q: any) => {
        const question = this.toText(q?.question);
        const options = Array.isArray(q?.options) ? q.options.map((opt: any) => this.toText(opt)).filter(Boolean) : [];
        if (!question || options.length < 3) return null;
        const correctIndex = this.resolveCorrectIndex(q, options);
        return { question, options: options.slice(0, 6), correctIndex, explanation: this.toText(q?.explanation, `Correct answer: ${options[correctIndex]}`) };
      }).filter(Boolean);
    if (questions.length < 3) throw new Error(`quiz items too few: ${questions.length}`);
    return { type: 'quiz', title: this.toText(raw?.title, `${args.topic} practice`), topic: args.topic, ageGroup: args.ageGroup, questions: questions.slice(0, 5) };
  }

  private sanitizeTrueFalse(args: GenerateActivityArgs, raw: any) {
    const statements = (Array.isArray(raw?.statements) ? raw.statements : [])
      .map((s: any) => ({
        statement: this.toText(s?.statement),
        isCorrect: this.toBoolean(s?.isCorrect),
        explanation: this.toText(s?.explanation, 'Keep going!'),
      })).filter((s: any) => s.statement);
    if (statements.length < 3) throw new Error(`true_false items too few: ${statements.length}`);
    return { type: 'true_false', title: this.toText(raw?.title, `${args.topic} true/false`), topic: args.topic, ageGroup: args.ageGroup, statements: statements.slice(0, 5) };
  }

  private sanitizeFillBlank(args: GenerateActivityArgs, raw: any) {
    const sentences = (Array.isArray(raw?.sentences) ? raw.sentences : [])
      .map((s: any) => {
        const text = this.toText(s?.text);
        const answer = this.toText(s?.answer);
        const options = Array.isArray(s?.options) ? s.options.map((opt: any) => this.toText(opt)).filter(Boolean) : [];
        if (!text || !answer || options.length < 2) return null;
        const normalizedOptions = options.includes(answer) ? options : [answer, ...options];
        return { text, answer, hint: this.toText(s?.hint, 'Choose from options.'), options: Array.from(new Set(normalizedOptions)).slice(0, 6) };
      }).filter(Boolean);
    if (sentences.length < 3) throw new Error(`fill_blank items too few: ${sentences.length}`);
    return { type: 'fill_blank', title: this.toText(raw?.title, `${args.topic} fill blank`), topic: args.topic, ageGroup: args.ageGroup, sentences: sentences.slice(0, 5) };
  }

  private sanitizeMatching(args: GenerateActivityArgs, raw: any) {
    const pairs = (Array.isArray(raw?.pairs) ? raw.pairs : [])
      .map((p: any, idx: number) => ({
        id: this.toText(p?.id, `p${idx + 1}`), left: this.toText(p?.left), right: this.toText(p?.right),
      })).filter((p: any) => p.left && p.right);
    if (pairs.length < 3) throw new Error(`matching items too few: ${pairs.length}`);
    return { type: 'matching', title: this.toText(raw?.title, `${args.topic} matching`), topic: args.topic, ageGroup: args.ageGroup, pairs: pairs.slice(0, 8) };
  }

  private sanitizeConnection(args: GenerateActivityArgs, raw: any) {
    const leftItems = (Array.isArray(raw?.leftItems) ? raw.leftItems : [])
      .map((it: any, idx: number) => ({ id: this.toText(it?.id, `l${idx + 1}`), label: this.toText(it?.label), emoji: this.toText(it?.emoji) }))
      .filter((it: any) => it.label);
    const rightItems = (Array.isArray(raw?.rightItems) ? raw.rightItems : [])
      .map((it: any, idx: number) => ({ id: this.toText(it?.id, `r${idx + 1}`), label: this.toText(it?.label) }))
      .filter((it: any) => it.label);
    const leftIds = new Set(leftItems.map((it: any) => it.id));
    const rightIds = new Set(rightItems.map((it: any) => it.id));
    const connections = (Array.isArray(raw?.connections) ? raw.connections : [])
      .map((c: any) => ({ left: this.toText(c?.left), right: this.toText(c?.right) }))
      .filter((c: any) => leftIds.has(c.left) && rightIds.has(c.right));
    if (leftItems.length < 3 || rightItems.length < 3 || connections.length < 3) {
      throw new Error(`connection data too few: left=${leftItems.length}, right=${rightItems.length}, links=${connections.length}`);
    }
    return { type: 'connection', title: this.toText(raw?.title, `${args.topic} connection`), topic: args.topic, ageGroup: args.ageGroup, leftItems: leftItems.slice(0, 8), rightItems: rightItems.slice(0, 8), connections: connections.slice(0, 8) };
  }

  private sanitizeSequencing(args: GenerateActivityArgs, raw: any) {
    const items = (Array.isArray(raw?.items) ? raw.items : [])
      .map((it: any, idx: number) => ({ id: this.toText(it?.id, `s${idx + 1}`), label: this.toText(it?.label), order: this.toSafeInt(it?.order, idx + 1) }))
      .filter((it: any) => it.label)
      .sort((a: any, b: any) => a.order - b.order);
    if (items.length < 3) throw new Error(`sequencing items too few: ${items.length}`);
    return { type: 'sequencing', title: this.toText(raw?.title, `${args.topic} sequencing`), topic: args.topic, ageGroup: args.ageGroup, items: items.slice(0, 8) };
  }

  private sanitizePuzzle(args: GenerateActivityArgs, raw: any) {
    const rows = Math.max(2, Math.min(3, this.toSafeInt(raw?.gridSize?.rows, 2)));
    const cols = Math.max(2, Math.min(3, this.toSafeInt(raw?.gridSize?.cols, 2)));
    const requiredPieces = rows * cols;
    const pieces = (Array.isArray(raw?.pieces) ? raw.pieces : [])
      .map((p: any, idx: number) => ({ id: this.toText(p?.id, `pz${idx + 1}`), position: this.toSafeInt(p?.position, idx), label: this.toText(p?.label, `pos ${idx + 1}`), emoji: this.toText(p?.emoji, 'piece') }))
      .filter((p: any) => p.id);
    if (pieces.length < requiredPieces) throw new Error(`puzzle pieces too few: need=${requiredPieces}, got=${pieces.length}`);
    return { type: 'puzzle', title: this.toText(raw?.title, `${args.topic} puzzle`), topic: args.topic, ageGroup: args.ageGroup, pieces: pieces.slice(0, requiredPieces), gridSize: { rows, cols } };
  }

  private validateTopicAlignment(args: GenerateActivityArgs, activity: any): ValidationResult {
    const topic = this.toText(args.topic).toLowerCase();
    const bodyContent = this.collectActivityBodyText(activity).toLowerCase();
    const topicKeywords = this.extractTopicKeywords(topic);
    const requiredGroups = this.requiredKeywordGroups(topic);

    if (!bodyContent) return { ok: false, reason: 'activity body is empty' };

    for (const group of requiredGroups) {
      if (!group.some((kw) => bodyContent.includes(kw))) {
        return { ok: false, reason: `missing topic group: ${group.join('/')}` };
      }
    }

    if (this.isAnimalTopic(topic)) {
      const animalHits = Array.from(new Set(ANIMAL_TERMS.map((term) => term.toLowerCase()).filter((term) => bodyContent.includes(term))));
      if (animalHits.length < 2) return { ok: false, reason: `animal topic lacks concrete animal diversity, hits=${animalHits.join(',') || 'none'}` };
      if (GENERIC_FALLBACK_RE.test(bodyContent)) return { ok: false, reason: 'generic fallback content detected' };
    }

    if (GENERIC_FALLBACK_RE.test(bodyContent)) return { ok: false, reason: 'generic fallback content detected' };

    const keywordHits = topicKeywords.filter((kw) => bodyContent.includes(kw));
    if (topicKeywords.length > 0 && keywordHits.length === 0) {
      return { ok: false, reason: `content misses topic keywords: ${topicKeywords.join(', ')}` };
    }

    return this.validateContentQuality(args, activity);
  }

  private validateContentQuality(args: GenerateActivityArgs, activity: any): ValidationResult {
    if (args.type !== 'fill_blank') return { ok: true };
    const sentences = Array.isArray(activity?.sentences) ? activity.sentences : [];
    if (sentences.length < 3) return { ok: false, reason: 'fill_blank sentences too few' };
    if (sentences.some((s: any) => !this.hasBlankMarker(this.toText(s?.text)))) return { ok: false, reason: 'fill_blank sentence missing blank marker' };
    const answers = sentences.map((s: any) => this.toText(s?.answer).toLowerCase()).filter(Boolean);
    if (answers.length < 3) return { ok: false, reason: 'fill_blank answers too few' };
    const uniqueAnswers = new Set(answers);
    if (uniqueAnswers.size < 2) return { ok: false, reason: 'fill_blank answers have no diversity' };
    const topicText = this.toText(args.topic).toLowerCase();
    const topicAnswerCount = answers.filter((ans) => ans === topicText).length;
    if (topicAnswerCount >= Math.max(2, Math.ceil(sentences.length * 0.6))) return { ok: false, reason: 'fill_blank answers reuse topic text' };
    return { ok: true };
  }

  private requiredKeywordGroups(topic: string): string[][] {
    const groups: string[][] = [];
    if (topic.includes('住') || topic.includes('栖息')) groups.push(['住', '哪里', '栖息', '家']);
    if (topic.includes('习性')) groups.push(['习性', '喜欢', '会', '通常']);
    if (topic.includes('成长') || topic.includes('生命周期')) groups.push(['成长', '长大', '幼崽', '孵化', '阶段']);
    if (topic.includes('分类')) groups.push(['分类', '属于', '哪一类']);
    if (topic.includes('爱吃') || topic.includes('食物')) groups.push(['爱吃', '吃', '食物']);
    if (topic.includes('农场')) groups.push(['农场', '奶牛', '小猪', '母鸡', '绵羊']);
    if (topic.includes('森林')) groups.push(['森林', '狐狸', '鹿', '熊', '松鼠']);
    return groups;
  }

  private collectActivityBodyText(activity: any): string {
    if (!activity || typeof activity !== 'object') return '';
    const parts: string[] = [];
    const pushText = (value: any) => { const text = this.toText(value); if (text) parts.push(text); };

    if (Array.isArray(activity.questions)) for (const q of activity.questions) { pushText(q?.question); (Array.isArray(q?.options) ? q.options : []).forEach(pushText); pushText(q?.explanation); }
    if (Array.isArray(activity.statements)) for (const s of activity.statements) { pushText(s?.statement); pushText(s?.explanation); }
    if (Array.isArray(activity.sentences)) for (const s of activity.sentences) { pushText(s?.text); pushText(s?.answer); pushText(s?.hint); (Array.isArray(s?.options) ? s.options : []).forEach(pushText); }
    if (Array.isArray(activity.pairs)) for (const p of activity.pairs) { pushText(p?.left); pushText(p?.right); }
    if (Array.isArray(activity.leftItems)) for (const it of activity.leftItems) { pushText(it?.label); pushText(it?.emoji); }
    if (Array.isArray(activity.rightItems)) for (const it of activity.rightItems) { pushText(it?.label); }
    if (Array.isArray(activity.items)) for (const it of activity.items) { pushText(it?.label); }
    if (Array.isArray(activity.pieces)) for (const p of activity.pieces) { pushText(p?.label); pushText(p?.emoji); }

    return parts.join(' | ');
  }

  private extractTopicKeywords(topic: string): string[] {
    const clean = topic.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, ' ').trim().toLowerCase();
    if (!clean) return [];
    const segments = clean.split(/\s+/).filter(Boolean);
    const collected: string[] = [];
    for (const seg of segments) {
      if (/^[\u4e00-\u9fa5]+$/.test(seg)) {
        const matchedCore = TOPIC_CORE_TERMS.filter((term) => /[\u4e00-\u9fa5]/.test(term) && seg.includes(term.toLowerCase())).map((term) => term.toLowerCase());
        if (matchedCore.length > 0) collected.push(...matchedCore);
        else if (seg.length <= 4) collected.push(seg);
      } else if (seg.length >= 3) {
        collected.push(seg);
      }
    }
    return Array.from(new Set(collected.filter((t) => !TOPIC_STOP_WORDS.has(t)))).slice(0, 8);
  }

  private resolveCorrectIndex(raw: any, options: string[]): number {
    const len = options.length;
    const textAnswer = this.toText(raw?.correctAnswer || raw?.answer || raw?.correctOption);
    if (textAnswer) {
      const byText = options.findIndex((opt) => opt === textAnswer || opt.includes(textAnswer));
      if (byText >= 0) return byText;
    }
    for (const c of [raw?.correctIndex, raw?.answerIndex, raw?.correct]) {
      const idx = this.toSafeInt(c, Number.NaN);
      if (!Number.isNaN(idx) && idx >= 0 && idx < len) return idx;
      if (!Number.isNaN(idx) && idx >= 1 && idx <= len) return idx - 1;
    }
    return 0;
  }

  private isAnimalTopic(topic: string): boolean { return ANIMAL_TOPIC_RE.test(topic); }
  private isNumberTopic(topic: string): boolean { return NUMBER_TOPIC_RE.test(topic); }
  private hasBlankMarker(text: string): boolean { return /_{2,}|\(\s*\)|\[\s*\]|\uff08\s*\uff09/.test(text); }

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
    const t = this.toText(value).toLowerCase();
    if (['true', '1', 'yes', 'y', '是', '对', '正确'].includes(t)) return true;
    if (['false', '0', 'no', 'n', '否', '错', '错误'].includes(t)) return false;
    return false;
  }

  private createRunId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
