/**
 * IntentClassifierService — hybrid (rule-first + lightweight-LLM) intent layer.
 *
 * Goal: make intent recognition structurally match tool calling. The verdict
 * tells the orchestrator which tools to offer this turn (and the executor which
 * verbatim slot to bind), instead of relying on prompt wording alone.
 *
 * Pipeline:
 *  1. Rule pass — weighted regex per intent (fast, no LLM). Captures verbatim
 *     slots (song title / story topic / translate text) from the user's own words.
 *  2. LLM pass — only when rules miss/are ambiguous. A compact taxonomy prompt on
 *     the cheap casual model, bounded tokens + timeout, JSON {intent, slot}.
 *  3. Fallback — anything unknown/unconfigured/failed → open/null (= status quo,
 *     never regress). A kill switch disables the whole layer.
 *
 * No business-module imports; no hardcoded song titles or user sentences.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AgentContext, ILlmClient, LlmMessage } from '../core';
import { extractJsonObject, stripThinking } from '../core';
import { INTENT_CATALOG } from './intent-registry';
import {
  INTENT_KINDS,
  isIntentKind,
  type IntentDecision,
  type IntentKind,
} from './intent.types';

/** Minimum rule score to accept a rule hit without consulting the LLM. */
const RULE_THRESHOLD = 2;

/** Generic music words that are not a specific song title → do not bind a slot. */
const GENERIC_MUSIC_WORDS = new Set(['音乐', '歌', '歌曲', '儿歌', '一首歌', '一首', '曲子']);

interface IntentRule {
  intent: IntentKind;
  patterns: Array<[RegExp, number]>;
  /** Only score this rule for parent turns. */
  parentOnly?: boolean;
  /** Capture a verbatim slot from the user turn, when the intent has one. */
  capture?: (input: string) => string | undefined;
}

/**
 * Rules in priority order. On a score tie the earlier (more specific) intent
 * wins. Specific actions carry weight 3 so they outrank plain_chat (weight 2);
 * 故事 carries weight 4 so "我想听故事" beats the music verb 我想听.
 */
const RULES: IntentRule[] = [
  {
    intent: 'play_music',
    patterns: [
      [/播放|放一首|放首|放个|给我放|来一首|点歌|点一首|唱一首|我想听|想听|听一首|听歌|听音乐|放音乐/u, 3],
      [/\bplay\b\s+(?:me\s+)?(?:a\s+|some\s+)?(?:song|music|track)|\bplay\s+music\b/i, 3],
    ],
    capture: (input) => {
      const m = input.match(
        /(?:播放|给我放|放|来|点|唱|我想听|想听|听)\s*(?:一首歌|一首|首|个|歌曲|音乐|歌)?\s*(.+?)\s*(?:吧|呀|啦|啊|哦|嘛)?$/u,
      );
      const title = m?.[1]?.trim();
      if (!title || GENERIC_MUSIC_WORDS.has(title)) return undefined;
      return title;
    },
  },
  {
    intent: 'play_story',
    patterns: [
      [/故事/u, 4],
      [/讲故事|讲个故事|听故事|来个故事|睡前故事|讲一个/u, 3],
      [/\bstory\b|\btell\s+me\s+a\s+story\b/i, 3],
    ],
    capture: (input) => {
      const m = input.match(
        /(?:讲|来|听|播放|说)(?:一个|个|一段|一首)?\s*(?:关于)?\s*([^，。,\.！!？?]+?)\s*(?:的)?\s*故事/u,
      );
      return m?.[1]?.trim() || undefined;
    },
  },
  {
    intent: 'translate',
    patterns: [
      [/翻译|用英语怎么说|用英文怎么说|用中文怎么说|用日语怎么说|英语怎么说|英文怎么说|怎么翻译/u, 3],
      [/什么意思|是什么意思|怎么读|用英语怎么讲/u, 2],
      [/\btranslate\b|\bhow\s+do\s+you\s+say\b|\bwhat\s+does\s+.+\s+mean\b/i, 3],
    ],
    capture: (input) => {
      const patterns = [
        /(.+?)\s*(?:用英语|用英文|用中文|用日语|用韩语)\s*(?:怎么说|怎么讲|怎么读)/u,
        /翻译\s*(?:一下|这句话|这个词)?\s*[：:]?\s*(.+)/u,
        /(.+?)\s*(?:是什么意思|什么意思|是啥意思)/u,
      ];
      for (const p of patterns) {
        const v = input.match(p)?.[1]?.trim();
        if (v) return v;
      }
      return undefined;
    },
  },
  {
    intent: 'do_activity',
    patterns: [
      [/做题|出题|题目|数学题|口算|加减法|算术|练习|测验|测试|闯关|练一练|做一做|考考|来道题|出几道|道题|生成活动|小游戏|玩游戏/u, 3],
      [/\bquiz\b|\bexercise\b|\bactivity\b|\bpractice\b|\btest\b|\bgame\b|\bworksheet\b/i, 2],
    ],
  },
  {
    intent: 'parent_report',
    parentOnly: true,
    patterns: [
      [/报告|学情|学习情况|学习报告|能力|进步|趋势|分析|表现|成绩|学了多久|学习数据/u, 3],
      [/\breport\b|\bprogress\b|\banalytics?\b|\bability\b/i, 2],
    ],
  },
  {
    intent: 'parent_control',
    parentOnly: true,
    patterns: [
      [/设置|限制|时长|管控|家长控制|允许|禁止|时间限制|屏幕时间|管理孩子|修改设置|调整设置/u, 3],
      [/\bparent\s*control\b|\blimit\b|\brestriction\b|\bsetting\b|\bscreen\s*time\b/i, 2],
    ],
  },
  {
    intent: 'learn_explore',
    patterns: [
      [/推荐|有什么好玩|有什么好看|学什么|教我|知识|为什么|怎么回事|介绍|搜索|找一找|有哪些/u, 2],
      [/\brecommend\b|\bwhat\s+is\b|\bwhy\b|\bteach\s+me\b|\bsearch\b/i, 2],
    ],
  },
  {
    intent: 'plain_chat',
    patterns: [
      [/你好|您好|在吗|在不在|嗨|哈喽|哈啰|早上好|下午好|晚上好|晚安|早安/u, 2],
      [/陪我聊|聊聊天|说说话|好烦|好累|有点累|好开心|有点开心|开心|难过|生气|无聊|吐槽|委屈|害怕|想你/u, 2],
      [/\bhello\b|\bhi\b|\bhey\b|\bgood\s+(?:morning|night)\b/i, 2],
    ],
  },
];

@Injectable()
export class IntentClassifierService {
  private readonly logger = new Logger(IntentClassifierService.name);

  constructor(
    private readonly llmClient: ILlmClient,
    private readonly configService?: ConfigService,
  ) {}

  /** Classify one user turn. Never throws — worst case returns open/null. */
  async classify(input: string, context: AgentContext): Promise<IntentDecision> {
    const text = (input ?? '').trim();
    if (!this.readFlag('INTENT_CLASSIFIER_ENABLED', true) || !text) {
      return this.fallback();
    }

    const isParent = context.ageGroup === 'parent';

    // 1. Rule pass
    let best: { rule: IntentRule; score: number } | null = null;
    for (const rule of RULES) {
      if (rule.parentOnly && !isParent) continue;
      let score = 0;
      for (const [pattern, weight] of rule.patterns) {
        if (pattern.test(text)) score += weight;
      }
      if (score > 0 && (!best || score > best.score)) {
        best = { rule, score };
      }
    }

    if (best && best.score >= RULE_THRESHOLD) {
      return this.buildDecision(best.rule.intent, text, best.rule.capture, 'rule');
    }

    // 2. LLM pass (only when rules missed and the fallback is enabled)
    if (this.readFlag('INTENT_LLM_FALLBACK_ENABLED', true) && this.llmClient.isConfigured) {
      const llmDecision = await this.classifyWithLlm(text);
      if (llmDecision) return llmDecision;
    }

    // 3. Safe default
    return this.fallback();
  }

  /** Assemble a decision from the catalog, binding a verified verbatim slot. */
  private buildDecision(
    intent: IntentKind,
    input: string,
    capture: ((input: string) => string | undefined) | undefined,
    source: 'rule' | 'llm',
    llmSlot?: string,
  ): IntentDecision {
    const descriptor = INTENT_CATALOG[intent];
    const slots: Record<string, string> = {};
    if (descriptor.slot) {
      const raw = capture ? capture(input) : llmSlot;
      const value = raw?.trim();
      // Fidelity: the slot must appear verbatim in the user's own words.
      if (value && input.includes(value)) {
        slots[descriptor.slot] = value;
      }
    }
    return {
      intent,
      tools: descriptor.tools,
      slots: Object.keys(slots).length > 0 ? slots : undefined,
      source,
    };
  }

  private async classifyWithLlm(input: string): Promise<IntentDecision | null> {
    const maxTokens = this.readNumber('INTENT_LLM_MAX_TOKENS', 256);
    const timeoutMs = this.readNumber('INTENT_LLM_TIMEOUT_MS', 4000);
    const model = this.resolveIntentModel();

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        this.llmClient.chatCompletion(this.buildLlmMessages(input), undefined, maxTokens, false, model),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), timeoutMs);
        }),
      ]);
      if (!response) {
        this.logger.warn('Intent LLM pass timed out — falling back to open');
        return null;
      }
      const parsed = extractJsonObject(stripThinking(response.content ?? ''));
      if (!parsed || !isIntentKind(parsed.intent)) return null;
      const slot = typeof parsed.slot === 'string' ? parsed.slot : undefined;
      return this.buildDecision(parsed.intent, input, undefined, 'llm', slot);
    } catch (err: any) {
      this.logger.warn(`Intent LLM pass failed: ${err?.message ?? err} — falling back to open`);
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** Compact taxonomy prompt — generic placeholders only, no anchored examples. */
  private buildLlmMessages(input: string): LlmMessage[] {
    const taxonomy = INTENT_KINDS.map((kind) => {
      const d = INTENT_CATALOG[kind];
      return `- ${kind}: ${d.label}${d.slot ? `（槽位 ${d.slot}）` : ''}`;
    }).join('\n');
    const system = [
      '你是一个意图分类器。判断用户这条消息的意图，只输出一个 JSON 对象，不要解释、不要代码块标记。',
      '可选意图：',
      taxonomy,
      '规则：',
      '- slot 必须是用户原话里逐字出现的子串（歌名 / 故事主题 / 要翻译的原文），不要改写、翻译、补全或替换成示例。',
      '- 没有合适槽位时省略 slot 字段。',
      '- 闲聊 / 打招呼 / 抒发情绪 → plain_chat；复合请求或无法判断 → open。',
      '输出格式：{"intent":"意图名","slot":"用户原话子串"}，无槽位则输出 {"intent":"意图名"}。',
    ].join('\n');
    return [
      { role: 'system', content: system },
      { role: 'user', content: input },
    ];
  }

  /** LLM_MODEL_INTENT when set, else reuse the cheap casual model. */
  private resolveIntentModel(): string | undefined {
    const configured = this.configService?.get<string>('LLM_MODEL_INTENT', '')?.trim();
    return configured || this.llmClient.casualModel;
  }

  private fallback(): IntentDecision {
    return { intent: 'open', tools: null, source: 'fallback' };
  }

  private readFlag(key: string, def: boolean): boolean {
    const raw = this.configService?.get<string>(key);
    if (raw == null || raw === '') return def;
    return String(raw).toLowerCase() !== 'false';
  }

  private readNumber(key: string, def: number): number {
    const raw = this.configService?.get<string>(key);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : def;
  }
}