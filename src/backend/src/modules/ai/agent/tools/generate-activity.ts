import { Injectable, Logger } from '@nestjs/common';
import { LlmClientService } from '../../../../agent-framework/llm/llm-client.service';

export type ActivityType = 'quiz' | 'true_false' | 'fill_blank' | 'matching' | 'connection' | 'sequencing' | 'puzzle';

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

type JsonExtractionResult = {
  value: any | null;
  method: 'direct' | 'code_block' | 'brace_slice' | 'none';
  parseError?: string;
  candidateLength?: number;
  candidatePreview?: string;
};

const MAX_GENERATION_ATTEMPTS = 3;
const SUPPORTED_TYPES: ActivityType[] = ['quiz', 'true_false', 'fill_blank', 'matching', 'connection', 'sequencing', 'puzzle'];
const ANIMAL_TOPIC_RE = /(\u52a8\u7269|\u519c\u573a|\u68ee\u6797|\u6d77\u6d0b|\u5ba0\u7269|\u5bb6\u79bd|\u5bb6\u755c|\u5c0f\u9e21|\u5c0f\u9e2d|\u5c0f\u732b|\u5c0f\u72d7|animal|farm|zoo|pet|wild|livestock)/i;
const NUMBER_TOPIC_RE = /(\u6570\u5b66|\u6570\u5b57|\u8ba4\u6570|\u6570\u6570|\u52a0\u6cd5|\u51cf\u6cd5|math|number|count|arithmetic)/i;
const GENERIC_FALLBACK_RE = /(wake up|breakfast|go to school|go home|sun|moon|apple|fish|1\+1=3|\u592a\u9633\u767d\u5929\u51fa\u73b0|\u8d77\u5e8a|\u5403\u65e9\u996d|\u53bb\u4e0a\u5b66|\u56de\u5bb6)/i;
const ANIMAL_TERMS = [
  '\u52a8\u7269', '\u725b', '\u7f8a', '\u732a', '\u9e21', '\u9e2d', '\u9e45', '\u9a6c', '\u72d7', '\u732b', '\u5154', '\u9c7c',
  '\u9e1f', '\u9e7f', '\u718a', '\u72d0\u72f8', '\u677e\u9f20', '\u9752\u86d9', '\u6d77\u8c5a', '\u9cb8', '\u4e4c\u9f9f',
  'animal', 'cow', 'sheep', 'pig', 'chicken', 'duck', 'horse', 'dog', 'cat', 'rabbit', 'fish',
];
const NUMBER_TERMS = [
  '\u96f6', '\u4e00', '\u4e8c', '\u4e09', '\u56db', '\u4e94', '\u516d', '\u4e03', '\u516b', '\u4e5d', '\u5341', '\u6570\u5b57', '\u6570\u5b66',
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'number', 'count',
];
const TOPIC_STOP_WORDS = new Set([
  '\u8ba4\u8bc6', '\u5b66\u4e60', '\u7ec3\u4e60', '\u7ee7\u7eed', '\u66f4\u591a', '\u4e00\u4e2a', '\u4e00\u4e0b',
  '\u5173\u4e8e', '\u4e3b\u9898', '\u6e38\u620f', '\u6d3b\u52a8', '\u9898\u76ee', '\u513f\u7ae5', '\u5b69\u5b50',
  '\u77e5\u8bc6', '\u57fa\u7840', '\u8bad\u7ec3', '\u6311\u6218',
]);
const TOPIC_CORE_TERMS = [
  '\u52a8\u7269', '\u519c\u573a', '\u68ee\u6797', '\u6d77\u6d0b', '\u6816\u606f', '\u4f4f\u5728',
  '\u4e60\u6027', '\u884c\u4e3a', '\u6210\u957f', '\u5b75\u5316', '\u751f\u547d\u5468\u671f',
  '\u5206\u7c7b', '\u7231\u5403', '\u98df\u7269', '\u5bb6\u79bd', '\u5bb6\u755c',
  '\u6570\u5b57', '\u6570\u5b66', '\u8ba4\u6570', '\u6570\u6570', '\u52a0\u6cd5', '\u51cf\u6cd5',
  '\u5c0f\u9e21', '\u5c0f\u9e2d', '\u5c0f\u732b', '\u5c0f\u72d7',
  'animal', 'farm', 'zoo', 'pet', 'wild', 'habitat', 'diet', 'classification', 'growth', 'life', 'cycle',
  'math', 'number', 'count', 'arithmetic',
];

@Injectable()
export class GenerateActivityTool {
  private readonly logger = new Logger(GenerateActivityTool.name);

  constructor(private readonly llmClient: LlmClientService) {}

  async execute(args: GenerateActivityArgs): Promise<string> {
    const normalizedArgs = this.normalizeArgs(args);
    const failures: string[] = [];
    const runId = this.createRunId();

    this.logger.log(`[generateActivity] start ${JSON.stringify({
      runId,
      type: normalizedArgs.type,
      topic: normalizedArgs.topic,
      difficulty: normalizedArgs.difficulty,
      ageGroup: normalizedArgs.ageGroup,
      domain: normalizedArgs.domain || null,
      maxAttempts: MAX_GENERATION_ATTEMPTS,
    })}`);

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
      try {
        const prompt = this.buildPrompt(normalizedArgs, attempt, failures);
        this.logger.log(`[generateActivity] llm_request ${JSON.stringify({
          runId,
          attempt,
          topic: normalizedArgs.topic,
          type: normalizedArgs.type,
          promptLength: prompt.length,
          promptPreview: this.truncateForLog(prompt, 1200),
        })}`);
        const response = await this.llmClient.generate(prompt);
        this.logger.log(`[generateActivity] llm_response ${JSON.stringify({
          runId,
          attempt,
          topic: normalizedArgs.topic,
          type: normalizedArgs.type,
          responseLength: response.length,
          responsePreview: this.truncateForLog(response, 1200),
        })}`);

        const parsedResult = this.extractJsonObjectWithMeta(response);
        const parsed = parsedResult.value;
        if (!parsed) {
          const reason = 'model did not return parseable JSON';
          failures.push(`attempt ${attempt}: ${reason}`);
          this.logger.warn(`[generateActivity] attempt_failed ${JSON.stringify({
            runId,
            attempt,
            reason,
            topic: normalizedArgs.topic,
            type: normalizedArgs.type,
            parseMeta: {
              method: parsedResult.method,
              parseError: parsedResult.parseError,
              candidateLength: parsedResult.candidateLength,
              candidatePreview: parsedResult.candidatePreview,
            },
          })}`);
          continue;
        }

        const sanitized = this.sanitizeActivity(normalizedArgs, parsed);
        const alignment = this.validateTopicAlignment(normalizedArgs, sanitized);
        if (!alignment.ok) {
          const reason = alignment.reason || 'topic alignment check failed';
          failures.push(`attempt ${attempt}: ${reason}`);
          this.logger.warn(`[generateActivity] attempt_failed ${JSON.stringify({
            runId,
            attempt,
            reason,
            topic: normalizedArgs.topic,
            type: normalizedArgs.type,
            summary: this.summarizeActivity(sanitized),
            validationDebug: alignment.debug,
          })}`);
          continue;
        }

        this.logger.log(`[generateActivity] success ${JSON.stringify({
          runId,
          attempt,
          topic: normalizedArgs.topic,
          type: normalizedArgs.type,
          summary: this.summarizeActivity(sanitized),
        })}`);
        return JSON.stringify(sanitized);
      } catch (error: any) {
        const reason = error?.message || 'unknown error';
        failures.push(`attempt ${attempt}: ${reason}`);
        this.logger.warn(`[generateActivity] attempt_exception ${JSON.stringify({
          runId,
          attempt,
          reason,
          topic: normalizedArgs.topic,
          type: normalizedArgs.type,
          stackPreview: this.truncateForLog(this.toText(error?.stack), 800),
        })}`);
      }
    }

    const detail = failures.join(' | ');
    this.logger.error(`[generateActivity] failed_after_retries ${JSON.stringify({
      runId,
      topic: normalizedArgs.topic,
      type: normalizedArgs.type,
      attempts: MAX_GENERATION_ATTEMPTS,
      failures,
    })}`);
    throw new Error(`Unable to generate a topic-aligned activity. details=${detail}`);
  }

  private summarizeActivity(activity: any): Record<string, any> {
    return {
      type: this.toText(activity?.type),
      title: this.toText(activity?.title),
      topic: this.toText(activity?.topic),
      counts: {
        questions: Array.isArray(activity?.questions) ? activity.questions.length : 0,
        statements: Array.isArray(activity?.statements) ? activity.statements.length : 0,
        sentences: Array.isArray(activity?.sentences) ? activity.sentences.length : 0,
        pairs: Array.isArray(activity?.pairs) ? activity.pairs.length : 0,
        leftItems: Array.isArray(activity?.leftItems) ? activity.leftItems.length : 0,
        rightItems: Array.isArray(activity?.rightItems) ? activity.rightItems.length : 0,
        connections: Array.isArray(activity?.connections) ? activity.connections.length : 0,
        items: Array.isArray(activity?.items) ? activity.items.length : 0,
        pieces: Array.isArray(activity?.pieces) ? activity.pieces.length : 0,
      },
    };
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
      type,
      topic,
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
      ? [
          'Previous attempt failed. Avoid repeating these issues:',
          ...failures.slice(-2).map((item) => `- ${item}`),
        ].join('\n')
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
    ]
      .filter(Boolean)
      .join('\n');
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
    const common = [
      'Use short and answerable sentences.',
      'At least 3 valid items (prefer 4+ for matching/connection).',
    ];

    switch (type) {
      case 'quiz':
        return [...common, 'Generate 3-5 questions.', 'At least 3 options per question.', 'correctIndex must be a zero-based number.'];
      case 'true_false':
        return [...common, 'Generate 3-5 statements.', 'isCorrect must be a boolean.'];
      case 'fill_blank':
        return [...common, 'Generate 3-5 fill-in sentences.', 'Each sentence must contain a blank marker like ___.', 'answer must appear in options.', 'Do not reuse the same answer for all sentences.'];
      case 'matching':
        return [...common, 'Generate 4-8 pairs.', 'left/right should be in the same knowledge domain.'];
      case 'connection':
        return [...common, 'Generate 4-8 connections.', 'connections must reference existing ids.'];
      case 'sequencing':
        return [...common, 'Generate 4-6 ordered steps.', 'order must be sequential and meaningful.'];
      case 'puzzle':
        return [...common, 'Generate 2x2 or 3x3 puzzle data.', 'pieces should match grid size.'];
      default:
        return common;
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
    if (t.includes('\u4f4f') || t.includes('\u6816\u606f')) rules.push('Must include habitat or where-animal-lives information.');
    if (t.includes('\u4e60\u6027')) rules.push('Must include behavior or habits.');
    if (t.includes('\u6210\u957f') || t.includes('\u751f\u547d\u5468\u671f')) rules.push('Must include growth stages or life cycle.');
    if (t.includes('\u5206\u7c7b')) rules.push('Must include classification information.');
    if (t.includes('\u7231\u5403') || t.includes('\u98df\u7269')) rules.push('Must include diet information.');

    return rules;
  }

  private sanitizeActivity(args: GenerateActivityArgs, raw: any): any {
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
        throw new Error(`Unsupported type: ${args.type}`);
    }
  }

  private sanitizeQuiz(args: GenerateActivityArgs, raw: any) {
    const questions = Array.isArray(raw?.questions) ? raw.questions : [];
    const normalized = questions
      .map((q: any) => {
        const question = this.toText(q?.question);
        const options = Array.isArray(q?.options) ? q.options.map((opt: any) => this.toText(opt)).filter(Boolean) : [];
        if (!question || options.length < 3) return null;
        const correctIndex = this.resolveCorrectIndex(q, options);
        return {
          question,
          options: options.slice(0, 6),
          correctIndex,
          explanation: this.toText(q?.explanation, `Correct answer: ${options[correctIndex]}`),
        };
      })
      .filter(Boolean);

    if (normalized.length < 3) throw new Error(`quiz items too few: ${normalized.length}`);

    return {
      type: 'quiz',
      title: this.toText(raw?.title, `${args.topic} practice`),
      topic: args.topic,
      ageGroup: args.ageGroup,
      questions: normalized.slice(0, 5),
    };
  }

  private sanitizeTrueFalse(args: GenerateActivityArgs, raw: any) {
    const statements = Array.isArray(raw?.statements)
      ? raw.statements
          .map((s: any) => ({
            statement: this.toText(s?.statement),
            isCorrect: this.toBoolean(s?.isCorrect),
            explanation: this.toText(s?.explanation, 'Keep going!'),
          }))
          .filter((s: any) => s.statement)
      : [];

    if (statements.length < 3) throw new Error(`true_false items too few: ${statements.length}`);

    return {
      type: 'true_false',
      title: this.toText(raw?.title, `${args.topic} true/false`),
      topic: args.topic,
      ageGroup: args.ageGroup,
      statements: statements.slice(0, 5),
    };
  }

  private sanitizeFillBlank(args: GenerateActivityArgs, raw: any) {
    const sentences = Array.isArray(raw?.sentences)
      ? raw.sentences
          .map((s: any) => {
            const text = this.toText(s?.text);
            const answer = this.toText(s?.answer);
            const options = Array.isArray(s?.options) ? s.options.map((opt: any) => this.toText(opt)).filter(Boolean) : [];
            if (!text || !answer || options.length < 2) return null;
            const normalizedOptions = options.includes(answer) ? options : [answer, ...options];
            return {
              text,
              answer,
              hint: this.toText(s?.hint, 'Choose from options.'),
              options: Array.from(new Set(normalizedOptions)).slice(0, 6),
            };
          })
          .filter(Boolean)
      : [];

    if (sentences.length < 3) throw new Error(`fill_blank items too few: ${sentences.length}`);

    return {
      type: 'fill_blank',
      title: this.toText(raw?.title, `${args.topic} fill blank`),
      topic: args.topic,
      ageGroup: args.ageGroup,
      sentences: sentences.slice(0, 5),
    };
  }

  private sanitizeMatching(args: GenerateActivityArgs, raw: any) {
    const pairs = Array.isArray(raw?.pairs)
      ? raw.pairs
          .map((p: any, idx: number) => ({
            id: this.toText(p?.id, `p${idx + 1}`),
            left: this.toText(p?.left),
            right: this.toText(p?.right),
          }))
          .filter((p: any) => p.left && p.right)
      : [];

    if (pairs.length < 3) throw new Error(`matching items too few: ${pairs.length}`);

    return {
      type: 'matching',
      title: this.toText(raw?.title, `${args.topic} matching`),
      topic: args.topic,
      ageGroup: args.ageGroup,
      pairs: pairs.slice(0, 8),
    };
  }

  private sanitizeConnection(args: GenerateActivityArgs, raw: any) {
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

    const leftIds = new Set(leftItems.map((it: any) => it.id));
    const rightIds = new Set(rightItems.map((it: any) => it.id));
    const connections = Array.isArray(raw?.connections)
      ? raw.connections
          .map((c: any) => ({
            left: this.toText(c?.left),
            right: this.toText(c?.right),
          }))
          .filter((c: any) => leftIds.has(c.left) && rightIds.has(c.right))
      : [];

    if (leftItems.length < 3 || rightItems.length < 3 || connections.length < 3) {
      throw new Error(`connection data too few: left=${leftItems.length}, right=${rightItems.length}, links=${connections.length}`);
    }

    return {
      type: 'connection',
      title: this.toText(raw?.title, `${args.topic} connection`),
      topic: args.topic,
      ageGroup: args.ageGroup,
      leftItems: leftItems.slice(0, 8),
      rightItems: rightItems.slice(0, 8),
      connections: connections.slice(0, 8),
    };
  }

  private sanitizeSequencing(args: GenerateActivityArgs, raw: any) {
    const items = Array.isArray(raw?.items)
      ? raw.items
          .map((it: any, idx: number) => ({
            id: this.toText(it?.id, `s${idx + 1}`),
            label: this.toText(it?.label),
            order: this.toSafeInt(it?.order, idx + 1),
          }))
          .filter((it: any) => it.label)
          .sort((a: any, b: any) => a.order - b.order)
      : [];

    if (items.length < 3) throw new Error(`sequencing items too few: ${items.length}`);

    return {
      type: 'sequencing',
      title: this.toText(raw?.title, `${args.topic} sequencing`),
      topic: args.topic,
      ageGroup: args.ageGroup,
      items: items.slice(0, 8),
    };
  }

  private sanitizePuzzle(args: GenerateActivityArgs, raw: any) {
    const rows = Math.max(2, Math.min(3, this.toSafeInt(raw?.gridSize?.rows, 2)));
    const cols = Math.max(2, Math.min(3, this.toSafeInt(raw?.gridSize?.cols, 2)));
    const requiredPieces = rows * cols;
    const pieces = Array.isArray(raw?.pieces)
      ? raw.pieces
          .map((p: any, idx: number) => ({
            id: this.toText(p?.id, `pz${idx + 1}`),
            position: this.toSafeInt(p?.position, idx),
            label: this.toText(p?.label, `pos ${idx + 1}`),
            emoji: this.toText(p?.emoji, 'piece'),
          }))
          .filter((p: any) => p.id)
      : [];

    if (pieces.length < requiredPieces) throw new Error(`puzzle pieces too few: need=${requiredPieces}, got=${pieces.length}`);

    return {
      type: 'puzzle',
      title: this.toText(raw?.title, `${args.topic} puzzle`),
      topic: args.topic,
      ageGroup: args.ageGroup,
      pieces: pieces.slice(0, requiredPieces),
      gridSize: { rows, cols },
    };
  }

  private validateTopicAlignment(args: GenerateActivityArgs, activity: any): ValidationResult {
    const topic = this.toText(args.topic).toLowerCase();
    const bodyContent = this.collectActivityBodyText(activity).toLowerCase();
    const topicKeywords = this.extractTopicKeywords(topic);
    const requiredGroups = this.requiredKeywordGroups(topic);
    const debugBase = {
      topic,
      topicKeywords,
      requiredGroups,
      bodyLength: bodyContent.length,
      bodyPreview: this.truncateForLog(bodyContent, 320),
    };

    if (!bodyContent) return { ok: false, reason: 'activity body is empty', debug: debugBase };

    for (const group of requiredGroups) {
      if (!group.some((kw) => bodyContent.includes(kw))) {
        return {
          ok: false,
          reason: `missing topic group: ${group.join('/')}`,
          debug: {
            ...debugBase,
            missingGroup: group,
          },
        };
      }
    }

    if (this.isAnimalTopic(topic)) {
      const animalHits = Array.from(new Set(
        ANIMAL_TERMS
          .map((term) => term.toLowerCase())
          .filter((term) => bodyContent.includes(term)),
      ));
      if (animalHits.length < 2) {
        return {
          ok: false,
          reason: `animal topic lacks concrete animal diversity, hits=${animalHits.join(',') || 'none'}`,
          debug: {
            ...debugBase,
            animalHits,
          },
        };
      }

      const offTopicGeneric = GENERIC_FALLBACK_RE.test(bodyContent);
      if (offTopicGeneric) {
        return {
          ok: false,
          reason: 'generic fallback content detected',
          debug: {
            ...debugBase,
            animalHits,
            genericPatternDetected: true,
          },
        };
      }
    }

    if (GENERIC_FALLBACK_RE.test(bodyContent)) {
      return {
        ok: false,
        reason: 'generic fallback content detected',
        debug: {
          ...debugBase,
          genericPatternDetected: true,
        },
      };
    }

    const keywordHits = topicKeywords.filter((kw) => bodyContent.includes(kw));
    if (topicKeywords.length > 0 && keywordHits.length === 0) {
      return {
        ok: false,
        reason: `content misses topic keywords: ${topicKeywords.join(', ')}`,
        debug: {
          ...debugBase,
          keywordHits,
        },
      };
    }

    const quality = this.validateContentQuality(args, activity);
    if (!quality.ok) return quality;

    return { ok: true };
  }

  private validateContentQuality(args: GenerateActivityArgs, activity: any): ValidationResult {
    if (args.type !== 'fill_blank') return { ok: true };
    const sentences = Array.isArray(activity?.sentences) ? activity.sentences : [];
    if (sentences.length < 3) return { ok: false, reason: 'fill_blank sentences too few' };

    if (sentences.some((s: any) => !this.hasBlankMarker(this.toText(s?.text)))) {
      return { ok: false, reason: 'fill_blank sentence missing blank marker' };
    }

    const answers = sentences.map((s: any) => this.toText(s?.answer).toLowerCase()).filter(Boolean);
    if (answers.length < 3) return { ok: false, reason: 'fill_blank answers too few' };
    const uniqueAnswers = new Set(answers);
    if (uniqueAnswers.size < 2) return { ok: false, reason: 'fill_blank answers have no diversity' };

    const topicText = this.toText(args.topic).toLowerCase();
    const topicAnswerCount = answers.filter((ans) => ans === topicText).length;
    if (topicAnswerCount >= Math.max(2, Math.ceil(sentences.length * 0.6))) {
      return { ok: false, reason: 'fill_blank answers reuse topic text' };
    }

    if (this.isNumberTopic(topicText)) {
      const bodyContent = this.collectActivityBodyText(activity).toLowerCase();
      const termHits = NUMBER_TERMS.filter((term) => bodyContent.includes(term.toLowerCase())).length;
      const digitHits = (bodyContent.match(/\b\d+\b/g) || []).length;
      if (termHits + digitHits < 3) {
        return { ok: false, reason: 'number topic lacks concrete number content' };
      }
    }

    return { ok: true };
  }

  private requiredKeywordGroups(topic: string): string[][] {
    const groups: string[][] = [];
    if (topic.includes('\u4f4f') || topic.includes('\u6816\u606f')) groups.push(['\u4f4f', '\u54ea\u91cc', '\u6816\u606f', '\u5bb6']);
    if (topic.includes('\u4e60\u6027')) groups.push(['\u4e60\u6027', '\u559c\u6b22', '\u4f1a', '\u901a\u5e38']);
    if (topic.includes('\u6210\u957f') || topic.includes('\u751f\u547d\u5468\u671f')) groups.push(['\u6210\u957f', '\u957f\u5927', '\u5e7c\u5d3d', '\u5b75\u5316', '\u9636\u6bb5']);
    if (topic.includes('\u5206\u7c7b')) groups.push(['\u5206\u7c7b', '\u5c5e\u4e8e', '\u54ea\u4e00\u7c7b']);
    if (topic.includes('\u7231\u5403') || topic.includes('\u98df\u7269')) groups.push(['\u7231\u5403', '\u5403', '\u98df\u7269']);
    if (topic.includes('\u519c\u573a')) groups.push(['\u519c\u573a', '\u5976\u725b', '\u5c0f\u732a', '\u6bcd\u9e21', '\u7ef5\u7f8a']);
    if (topic.includes('\u68ee\u6797')) groups.push(['\u68ee\u6797', '\u72d0\u72f8', '\u9e7f', '\u718a', '\u677e\u9f20']);
    return groups;
  }

  private collectActivityBodyText(activity: any): string {
    if (!activity || typeof activity !== 'object') return '';
    const parts: string[] = [];
    const pushText = (value: any) => {
      const text = this.toText(value);
      if (text) parts.push(text);
    };

    if (Array.isArray(activity.questions)) {
      for (const q of activity.questions) {
        pushText(q?.question);
        (Array.isArray(q?.options) ? q.options : []).forEach(pushText);
        pushText(q?.explanation);
      }
    }
    if (Array.isArray(activity.statements)) {
      for (const s of activity.statements) {
        pushText(s?.statement);
        pushText(s?.explanation);
      }
    }
    if (Array.isArray(activity.sentences)) {
      for (const s of activity.sentences) {
        pushText(s?.text);
        pushText(s?.answer);
        pushText(s?.hint);
        (Array.isArray(s?.options) ? s.options : []).forEach(pushText);
      }
    }
    if (Array.isArray(activity.pairs)) {
      for (const p of activity.pairs) {
        pushText(p?.left);
        pushText(p?.right);
      }
    }
    if (Array.isArray(activity.leftItems)) {
      for (const it of activity.leftItems) {
        pushText(it?.label);
        pushText(it?.emoji);
      }
    }
    if (Array.isArray(activity.rightItems)) {
      for (const it of activity.rightItems) {
        pushText(it?.label);
      }
    }
    if (Array.isArray(activity.items)) {
      for (const it of activity.items) {
        pushText(it?.label);
      }
    }
    if (Array.isArray(activity.pieces)) {
      for (const p of activity.pieces) {
        pushText(p?.label);
        pushText(p?.emoji);
      }
    }

    return parts.join(' | ');
  }

  private isAnimalTopic(topic: string): boolean {
    return ANIMAL_TOPIC_RE.test(topic);
  }

  private isNumberTopic(topic: string): boolean {
    return NUMBER_TOPIC_RE.test(topic);
  }

  private hasBlankMarker(text: string): boolean {
    return /_{2,}|\(\s*\)|\[\s*\]|\uff08\s*\uff09/.test(text);
  }

  private extractTopicKeywords(topic: string): string[] {
    const clean = topic.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, ' ').trim().toLowerCase();
    if (!clean) return [];

    const segments = clean.split(/\s+/).filter(Boolean);
    const collected: string[] = [];
    for (const seg of segments) {
      if (/^[\u4e00-\u9fa5]+$/.test(seg)) {
        const matchedCore = TOPIC_CORE_TERMS
          .filter((term) => /[\u4e00-\u9fa5]/.test(term) && seg.includes(term.toLowerCase()))
          .map((term) => term.toLowerCase());
        if (matchedCore.length > 0) {
          collected.push(...matchedCore);
        } else if (seg.length <= 4) {
          collected.push(seg);
        }
      } else if (seg.length >= 3) {
        collected.push(seg);
      }
    }

    const filtered = collected.filter((t) => !TOPIC_STOP_WORDS.has(t));
    return Array.from(new Set(filtered)).slice(0, 8);
  }

  private resolveCorrectIndex(raw: any, options: string[]): number {
    const len = options.length;
    const textAnswer = this.toText(raw?.correctAnswer || raw?.answer || raw?.correctOption);
    if (textAnswer) {
      const byText = options.findIndex((opt) => opt === textAnswer || opt.includes(textAnswer));
      if (byText >= 0) return byText;
    }

    const candidates = [raw?.correctIndex, raw?.answerIndex, raw?.correct];
    for (const c of candidates) {
      const idx = this.toSafeInt(c, Number.NaN);
      if (!Number.isNaN(idx) && idx >= 0 && idx < len) return idx;
      if (!Number.isNaN(idx) && idx >= 1 && idx <= len) return idx - 1;
    }

    return 0;
  }

  private extractJsonObjectWithMeta(text: string): JsonExtractionResult {
    const source = this.toText(text);
    if (!source) {
      return {
        value: null,
        method: 'none',
        parseError: 'empty model response',
      };
    }

    const parseErrors: string[] = [];

    try {
      return {
        value: JSON.parse(source),
        method: 'direct',
        candidateLength: source.length,
        candidatePreview: this.truncateForLog(source, 280),
      };
    } catch (error: any) {
      parseErrors.push(`direct_parse: ${this.toText(error?.message, 'failed')}`);
    }

    const codeBlockMatch = source.match(/```json\s*([\s\S]*?)```/i) || source.match(/```\s*([\s\S]*?)```/i);
    if (codeBlockMatch?.[1]) {
      const candidate = codeBlockMatch[1].trim();
      try {
        return {
          value: JSON.parse(candidate),
          method: 'code_block',
          candidateLength: candidate.length,
          candidatePreview: this.truncateForLog(candidate, 280),
        };
      } catch (error: any) {
        parseErrors.push(`code_block_parse: ${this.toText(error?.message, 'failed')}`);
      }
    }

    const firstBrace = source.indexOf('{');
    const lastBrace = source.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const candidate = source.slice(firstBrace, lastBrace + 1);
      try {
        return {
          value: JSON.parse(candidate),
          method: 'brace_slice',
          candidateLength: candidate.length,
          candidatePreview: this.truncateForLog(candidate, 280),
        };
      } catch (error: any) {
        parseErrors.push(`brace_slice_parse: ${this.toText(error?.message, 'failed')}`);
      }
    }

    return {
      value: null,
      method: 'none',
      parseError: parseErrors.join(' | '),
      candidateLength: source.length,
      candidatePreview: this.truncateForLog(source, 280),
    };
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
    const t = this.toText(value).toLowerCase();
    if (['true', '1', 'yes', 'y', '\u662f', '\u5bf9', '\u6b63\u786e'].includes(t)) return true;
    if (['false', '0', 'no', 'n', '\u5426', '\u9519', '\u9519\u8bef'].includes(t)) return false;
    return false;
  }

  private truncateForLog(text: string, max = 400): string {
    if (!text) return '';
    if (text.length <= max) return text;
    return `${text.slice(0, max)}...(truncated)`;
  }

  private createRunId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
