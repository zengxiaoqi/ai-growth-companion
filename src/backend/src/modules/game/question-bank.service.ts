import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { QuestionItem } from '../../database/entities/question-item.entity';
import {
  computeActivityQuestionHashes,
  computeQuestionHash,
  extractItemCorrectness,
  splitActivityItems,
} from '../../common/activity/question-hash';
import {
  registerQuestionBankHooks,
  type QuestionBankSelectQuery,
} from '../../common/activity/question-bank-registry';

const RECENT_SERVED_LIMIT = 20;
const FLAG_MIN_SAMPLES = 10;
const FLAG_LOW_ACCURACY = 0.3;
const FLAG_HIGH_ACCURACY = 0.95;

const ITEM_LIST_KEY: Record<string, string> = {
  quiz: 'questions',
  true_false: 'statements',
  fill_blank: 'sentences',
};

/**
 * Question bank (P1-2): every generated question is deposited here, served
 * bank-first on later requests, and tuned by real answer data. Questions
 * that are consistently too hard (<30%) or trivially easy (>95%) after 10
 * samples get flagged out of rotation.
 */
@Injectable()
export class QuestionBankService implements OnModuleInit {
  private readonly logger = new Logger(QuestionBankService.name);
  private readonly recentServed = new Map<number, string[]>();

  constructor(
    @InjectRepository(QuestionItem)
    private readonly itemRepository: Repository<QuestionItem>,
  ) {}

  onModuleInit(): void {
    registerQuestionBankHooks({
      ingest: (activity, source) => this.ingest(activity, source),
      select: (query) => this.select(query),
      recordResults: (childId, activity, result) =>
        this.recordResults(childId, activity, result),
    });
  }

  /** Deposit an activity's questions; hash-dedup, failures are log-only. */
  async ingest(activity: any, source = 'llm'): Promise<void> {
    const type = String(activity?.type ?? '');
    if (!type) return;
    const items = splitActivityItems(activity);
    if (items.length === 0) return;

    const hashes = items.map((item) => computeQuestionHash(type, item));
    const existing = await this.itemRepository.find({
      where: { questionHash: In(hashes) },
      select: ['questionHash'],
    });
    const known = new Set(existing.map((row) => row.questionHash));

    const topic = String(activity?.topic ?? '').trim() || 'general';
    const ageGroup = String(activity?.ageGroup ?? '5-6');
    const rows: QuestionItem[] = [];
    items.forEach((item, i) => {
      if (known.has(hashes[i])) return;
      known.add(hashes[i]);
      rows.push(
        this.itemRepository.create({
          uuid: uuidv4(),
          topic,
          ageGroup,
          domain: activity?.domain ?? null,
          difficulty: Number(activity?.difficulty) || 1,
          activityType: type,
          questionHash: hashes[i],
          payload: item,
          source,
          status: 'active',
          qualityScore: 100,
        }),
      );
    });

    for (const row of rows) {
      try {
        await this.itemRepository.save(row);
      } catch (err: any) {
        // Unique-index race with a concurrent ingest — the other writer won.
        this.logger.debug(`question ingest skipped (${row.questionHash}): ${err.message}`);
      }
    }
    if (rows.length > 0) {
      this.logger.log(`bank ingested ${rows.length} questions for topic="${topic}" type=${type}`);
    }
  }

  /**
   * Serve a ready activity from the bank, or null when it can't fully cover
   * the request (caller falls back to fresh generation). Excludes the child's
   * recently served questions; least-served first with random jitter.
   */
  async select(query: QuestionBankSelectQuery): Promise<any | null> {
    const { topic, ageGroup, type, childId } = query;
    const count = Math.max(1, Number(query.count) || 1);
    if (!topic || !type) return null;

    const pool = await this.itemRepository.find({
      where: { topic, ageGroup, activityType: type, status: 'active' },
    });
    const recent = new Set(childId != null ? (this.recentServed.get(childId) ?? []) : []);
    const candidates = pool.filter((row) => !recent.has(row.questionHash));

    const isItemType = Boolean(ITEM_LIST_KEY[type]);
    const exact = candidates.filter((row) => row.difficulty === (query.difficulty ?? 1));
    const usable = isItemType && exact.length >= count ? exact : candidates;
    if (isItemType ? usable.length < count : usable.length === 0) return null;

    const picked = usable
      .map((row) => ({ row, key: row.timesServed + Math.random() }))
      .sort((a, b) => a.key - b.key)
      .slice(0, isItemType ? count : 1)
      .map((entry) => entry.row);

    const hashes = picked.map((row) => row.questionHash);
    await this.itemRepository.update({ questionHash: In(hashes) }, { lastServedAt: new Date() });
    if (childId != null) this.rememberServed(childId, hashes);

    if (!isItemType) {
      return { ...(picked[0].payload ?? {}), servedQuestionIds: hashes };
    }

    const activity: Record<string, any> = {
      type,
      topic,
      ageGroup,
      difficulty: query.difficulty ?? 1,
      title: topic,
      [ITEM_LIST_KEY[type]]: picked.map((row) => this.servePayload(type, row.payload)),
      servedQuestionIds: hashes,
    };
    const domain = picked[0].domain;
    if (domain) activity.domain = domain;
    return activity;
  }

  /** Per-question feedback: serving counters + auto-flagging bad questions. */
  async recordResults(childId: number, activity: any, result: any): Promise<void> {
    const type = String(activity?.type ?? '');
    if (!type) return;
    const items = splitActivityItems(activity);
    const correctness = extractItemCorrectness(activity, result);
    if (!correctness || items.length === 0) return;

    const hashes = items.map((item) => computeQuestionHash(type, item));
    this.rememberServed(childId, hashes);

    const rows = await this.itemRepository.find({ where: { questionHash: In(hashes) } });
    const byHash = new Map(rows.map((row) => [row.questionHash, row]));

    for (let i = 0; i < hashes.length; i += 1) {
      const row = byHash.get(hashes[i]);
      if (!row) continue;
      row.timesServed += 1;
      if (correctness[i]) row.timesCorrect += 1;
      const accuracy = row.timesCorrect / row.timesServed;
      if (
        row.status === 'active' &&
        row.timesServed >= FLAG_MIN_SAMPLES &&
        (accuracy < FLAG_LOW_ACCURACY || accuracy > FLAG_HIGH_ACCURACY)
      ) {
        row.status = 'flagged';
        row.qualityScore = Math.round(accuracy * 100);
        this.logger.log(
          `question ${row.id} flagged: accuracy=${accuracy.toFixed(2)} over ${row.timesServed} samples`,
        );
      }
      await this.itemRepository.save(row);
    }
  }

  /** Shuffle options on serve so position can't be memorized; hash is order-free. */
  private servePayload(type: string, payload: any): any {
    const item = { ...(payload ?? {}) };
    if ((type === 'quiz' || type === 'fill_blank') && Array.isArray(item.options)) {
      const options = [...item.options];
      for (let i = options.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
      }
      if (type === 'quiz' && Number.isInteger(item.correctIndex)) {
        item.correctIndex = options.indexOf(payload.options[item.correctIndex]);
      }
      item.options = options;
    }
    return item;
  }

  private rememberServed(childId: number, hashes: string[]): void {
    const list = this.recentServed.get(childId) ?? [];
    for (const hash of hashes) {
      const at = list.indexOf(hash);
      if (at >= 0) list.splice(at, 1);
      list.push(hash);
    }
    while (list.length > RECENT_SERVED_LIMIT) list.shift();
    this.recentServed.set(childId, list);
  }
}