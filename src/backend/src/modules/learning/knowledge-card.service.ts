import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LlmClientService } from '../../agent-framework/llm/llm-client.service';
import { extractJsonObject } from '../../agent-framework/core';
import {
  KnowledgeCard,
  type KnowledgeCardFact,
} from '../../database/entities/knowledge-card.entity';
import {
  registerKnowledgeCardEnsurer,
  registerKnowledgeCardLookup,
  type KnowledgeCardView,
} from '../../common/learning/knowledge-card-registry';
import type { CourseCurriculumSeed } from './course-curriculum-fallback';

const MIN_ACTIVE_FACTS = 3;

@Injectable()
export class KnowledgeCardService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeCardService.name);
  private cards: KnowledgeCardView[] = [];
  private readonly inFlight = new Map<string, Promise<KnowledgeCardView | null>>();

  constructor(
    @InjectRepository(KnowledgeCard)
    private readonly cardRepository: Repository<KnowledgeCard>,
    private readonly llmClient: LlmClientService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
    registerKnowledgeCardLookup((topic, ageGroup) => this.lookup(topic, ageGroup));
    registerKnowledgeCardEnsurer((topic, ageGroup, domain) =>
      this.ensureCard(topic, ageGroup, domain),
    );
    this.logger.log(`knowledge cards loaded: ${this.cards.length} active`);
  }

  async reload(): Promise<void> {
    const rows = await this.cardRepository.find({ where: { status: 'active' } });
    this.cards = rows.map((row) => toView(row));
  }

  lookup(topic: string, ageGroup: string): KnowledgeCardView | null {
    return matchKnowledgeCard(this.cards, topic, ageGroup);
  }

  /**
   * Lookup-or-create for course generation. Judge-approved cards become
   * active immediately; unverified/weak drafts are stored but not served.
   */
  async ensureCard(
    topic: string,
    ageGroup: string,
    domain?: string,
  ): Promise<KnowledgeCardView | null> {
    const existing = this.lookup(topic, ageGroup);
    if (existing) return existing;

    const key = `${ageGroup}:${topic}`;
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const task = this.createCard(topic, ageGroup, domain).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, task);
    return task;
  }

  private async createCard(
    topic: string,
    ageGroup: string,
    domain?: string,
  ): Promise<KnowledgeCardView | null> {
    this.logger.log(`knowledge_card_miss topic=${topic} ageGroup=${ageGroup} → creating`);
    let draft: { facts: KnowledgeCardFact[]; misconceptions: string[]; vocabulary: string[] };
    try {
      draft = await this.generateDraft(topic, ageGroup, domain);
    } catch (error: any) {
      this.logger.warn(`knowledge card draft failed for ${topic}: ${error?.message}`);
      return null;
    }
    if (draft.facts.length === 0) return null;

    let kept = draft.facts;
    let status = 'draft';
    try {
      kept = await this.judgeFacts(topic, ageGroup, draft.facts);
      status = kept.length >= MIN_ACTIVE_FACTS ? 'active' : 'draft';
    } catch (error: any) {
      this.logger.warn(`knowledge card judge failed for ${topic}, storing draft: ${error?.message}`);
    }

    const row = this.cardRepository.create({
      topic,
      aliases: [],
      ageGroup,
      domain: domain ?? null,
      facts: kept,
      misconceptions: draft.misconceptions,
      vocabulary: draft.vocabulary,
      quizSeeds: [],
      status,
    });
    const saved = await this.cardRepository.save(row);
    this.logger.log(
      `knowledge card saved topic=${topic} ageGroup=${ageGroup} status=${status} facts=${kept.length}`,
    );
    if (status !== 'active') return null;
    const view = toView(saved);
    this.cards.push(view);
    return view;
  }

  private async generateDraft(
    topic: string,
    ageGroup: string,
    domain?: string,
  ): Promise<{ facts: KnowledgeCardFact[]; misconceptions: string[]; vocabulary: string[] }> {
    const prompt = `你是幼儿课程知识卡编辑。为主题「${topic}」（${ageGroup}岁${domain ? `，领域：${domain}` : ''}）编写知识卡。

要求：
- facts：4-8 条具体事实，每条 {"unit":"2-6字的具体事物","fact":"一句不超过24字的可验证事实"}
- 事实必须准确、具体、适合该年龄段；禁止空泛表述（如"动物很有趣"）
- misconceptions：1-3 条孩子常见的错误认知
- vocabulary：5-10 个该年龄可接受的词汇

只返回 JSON，不要任何其他文字：
{"facts":[{"unit":"兔子","fact":"兔子爱吃胡萝卜和青草"}],"misconceptions":["..."],"vocabulary":["..."]}`;
    const response = await this.llmClient.generateJson(
      prompt,
      'You are a preschool curriculum editor. You output strict JSON only.',
      { temperature: 0.2, maxTokens: 4096 },
    );
    const parsed = extractJsonObject<{
      facts?: Array<{ unit?: unknown; fact?: unknown }>;
      misconceptions?: unknown[];
      vocabulary?: unknown[];
    }>(response);
    if (!parsed || !Array.isArray(parsed.facts)) {
      throw new Error('knowledge card draft unparseable');
    }
    const facts = parsed.facts
      .map((f) => ({
        unit: String(f?.unit ?? '').trim(),
        fact: String(f?.fact ?? '').trim(),
        source: 'llm' as const,
      }))
      .filter((f) => f.unit && f.fact)
      .slice(0, 8);
    return {
      facts,
      misconceptions: toStringArray(parsed.misconceptions).slice(0, 3),
      vocabulary: toStringArray(parsed.vocabulary).slice(0, 10),
    };
  }

  private async judgeFacts(
    topic: string,
    ageGroup: string,
    facts: KnowledgeCardFact[],
  ): Promise<KnowledgeCardFact[]> {
    const prompt = `你是幼儿内容事实审核员。逐条审核「${topic}」知识卡（${ageGroup}岁）的事实：
- ok=true：事实准确、具体、适合该年龄
- ok=false：事实错误、空泛、超出该年龄认知 → 给 reason

事实列表：
${facts.map((f, i) => `${i}. ${f.unit}：${f.fact}`).join('\n')}

只返回 JSON，不要任何其他文字：
{"results":[{"i":0,"ok":true,"reason":"简短理由"}]}`;
    const response = await this.llmClient.generateJson(
      prompt,
      'You are a strict children content fact reviewer. You output strict JSON only.',
      { temperature: 0, maxTokens: 4096 },
    );
    const parsed = extractJsonObject<{ results?: Array<{ i?: number; ok?: boolean }> }>(response);
    if (!parsed || !Array.isArray(parsed.results)) {
      throw new Error('knowledge card judge unparseable');
    }
    const rejected = new Set(
      parsed.results.filter((r) => r?.ok === false && Number.isInteger(r.i)).map((r) => r.i as number),
    );
    return facts.filter((_, i) => !rejected.has(i));
  }
}

// ─── Pure helpers (unit-testable, also used by the seed script) ──────────

export function toView(row: KnowledgeCard): KnowledgeCardView {
  return {
    topic: row.topic,
    aliases: row.aliases ?? [],
    ageGroup: row.ageGroup,
    domain: row.domain,
    facts: row.facts ?? [],
    misconceptions: row.misconceptions ?? [],
    vocabulary: row.vocabulary ?? [],
    quizSeeds: row.quizSeeds ?? [],
  };
}

/** Alias-exact first, keyword containment as fallback. Same-age cards only. */
export function matchKnowledgeCard(
  cards: KnowledgeCardView[],
  topic: string,
  ageGroup: string,
): KnowledgeCardView | null {
  const query = topic.trim().toLowerCase();
  if (!query) return null;
  const pool = cards.filter((card) => card.ageGroup === ageGroup);

  let best: KnowledgeCardView | null = null;
  let bestScore = 0;
  for (const card of pool) {
    const names = [card.topic, ...card.aliases].map((n) => n.trim().toLowerCase()).filter(Boolean);
    let score = 0;
    if (names[0] === query) score = 100;
    else if (names.slice(1).includes(query)) score = 90;
    else {
      for (const name of names) {
        if (name.length >= 2 && (query.includes(name) || name.includes(query))) {
          score = Math.max(score, 60 + Math.min(name.length, query.length));
        }
      }
    }
    if (score > bestScore) {
      best = card;
      bestScore = score;
    }
  }
  return best;
}

/** Build a card from the static-curriculum seed (source of truth: human JSON). */
export function cardFromCurriculumSeed(
  topic: string,
  ageGroup: string,
  domain: string | undefined,
  seed: CourseCurriculumSeed,
): Omit<KnowledgeCard, 'id' | 'createdAt' | 'updatedAt'> {
  const facts: KnowledgeCardFact[] = Object.entries(seed.unitFacts)
    .filter(([unit, fact]) => unit && fact)
    .map(([unit, fact]) => ({ unit, fact, source: 'curriculum' as const }));
  return {
    topic,
    aliases: [],
    ageGroup,
    domain: domain ?? null,
    facts,
    misconceptions: [],
    vocabulary: seed.readingKeywords,
    quizSeeds: seed.quizItems,
    status: facts.length >= MIN_ACTIVE_FACTS ? 'active' : 'draft',
  } as Omit<KnowledgeCard, 'id' | 'createdAt' | 'updatedAt'>;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v ?? '').trim()).filter(Boolean) : [];
}