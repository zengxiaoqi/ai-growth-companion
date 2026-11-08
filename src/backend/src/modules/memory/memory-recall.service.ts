import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Memory } from './memory.entity';
import { MemoryVectorService, cosine } from './memory-vector.service';
import type { MemoryHit, RecallResult } from './memory.types';
import { degraded, firstDay, hit, miss } from './memory.types';

/**
 * Recall: three channels in, one ranked list out.
 *
 * The central claim is that **the gate and the ranking are different
 * jobs**. A cosine threshold has a physical meaning ("how close in
 * meaning") and so does a literal hit ("the word the child used is in
 * what they said"). RRF is a sum of reciprocal ranks — good for
 * ordering, meaningless as an absolute "should I inject this". So each
 * channel guards its own exit and the fused score only sorts what
 * already passed.
 *
 * Three implementation notes, all of them because of measurements:
 *
 *  - **The channels are not three queries.** They read the same rows of
 *    one table; three queries would be slower and could disagree (a
 *    memory written between two of them appears in one channel only).
 *  - **The vector channel has its own deadline.** Waiting for an
 *    embedding inside the database deadline means a cold start turns
 *    every recall into `degraded` while the literal channel — which
 *    takes microseconds and never leaves the machine — was ready the
 *    whole time. So the vector channel is allowed to be late and simply
 *    drops out; only a database failure degrades the recall.
 *  - **The temporal channel reads `memories`, not `care_cues`.** The
 *    cue table is the scheduler's state machine; a recall needs "a
 *    memory with a date in this window", which is `occurredAt`.
 *
 * Ported from 碎碎念 `memory/recall.py`.
 */
@Injectable()
export class MemoryRecallService {
  private readonly logger = new Logger(MemoryRecallService.name);

  /** How many memories survive the gate. */
  private readonly topK: number;
  /** Cosine below which a purely semantic hit is not injected. */
  private readonly vecThreshold: number;
  private readonly rrfK0: number;
  private readonly rrfWVec: number;
  private readonly rrfWFts: number;
  private readonly rrfWTime: number;
  private readonly halfLifeDays: number;
  private readonly dbTimeoutMs: number;
  private readonly vectorTimeoutMs: number;

  constructor(
    @InjectRepository(Memory)
    private readonly memoryRepo: Repository<Memory>,
    private readonly vectorService: MemoryVectorService,
    private readonly configService: ConfigService,
  ) {
    this.topK = intOr(this.configService.get<string>('MEMORY_TOP_K'), 8);
    this.vecThreshold = numberOr(
      this.configService.get<string>('MEMORY_VEC_THRESHOLD'),
      0.4,
    );
    this.rrfK0 = intOr(this.configService.get<string>('MEMORY_RRF_K0'), 60);
    this.rrfWVec = numberOr(this.configService.get<string>('MEMORY_RRF_W_VEC'), 1.0);
    this.rrfWFts = numberOr(this.configService.get<string>('MEMORY_RRF_W_FTS'), 0.8);
    this.rrfWTime = numberOr(this.configService.get<string>('MEMORY_RRF_W_TIME'), 0.6);
    this.halfLifeDays = numberOr(
      this.configService.get<string>('MEMORY_HALF_LIFE_DAYS'),
      14,
    );
    this.dbTimeoutMs = intOr(this.configService.get<string>('MEMORY_DB_TIMEOUT_MS'), 200);
    this.vectorTimeoutMs = intOr(
      this.configService.get<string>('MEMORY_VECTOR_TIMEOUT_MS'),
      400,
    );
  }

  /**
   * Find memories that answer `query` for this child.
   *
   * Returns one of the four exits. Never throws: a child asking about
   * yesterday must not hear a stack trace.
   */
  async recall(params: {
    childId: number;
    query: string;
    limit?: number;
    /** Only memories first stored on or after this `YYYY-MM-DD`. */
    since?: string;
    /** Allow L2 memories. Off by default: a secret was told *to the app*,
     * but recalling it unprompted is a different act. */
    includeSecrets?: boolean;
    now?: Date;
  }): Promise<RecallResult> {
    const moment = params.now ?? new Date();
    const limit = Math.min(Math.max(params.limit ?? this.topK, 1), 20);

    let rows: Memory[];
    try {
      rows = await withTimeout(this.load(params), this.dbTimeoutMs);
    } catch (err) {
      if (err instanceof TimeoutError) {
        this.logger.error(`recall read timed out for child=${params.childId}`);
      } else {
        this.logger.error(
          `recall could not read child=${params.childId}: ${(err as Error).message}`,
        );
      }
      return degraded();
    }

    if (rows.length === 0) return firstDay();

    const candidates = rows.map((row) => toCandidate(row, moment));
    scoreLiteral(candidates, params.query);
    scoreTemporal(candidates, moment);

    // The vector channel is allowed to be late: it drops out on timeout
    // instead of degrading the whole recall.
    const queryVector = await this.vectorService.embed(
      params.query,
      this.vectorTimeoutMs,
    );
    if (queryVector) scoreVector(candidates, queryVector);

    const ordered = this.fuse(candidates);
    const kept = ordered.filter((candidate) =>
      this.passes(candidate, params.includeSecrets === true),
    );
    if (kept.length === 0) return miss();

    return hit(kept.slice(0, limit).map(toHit));
  }

  /**
   * Read this child's memories, **excluding L2 in SQL**.
   *
   * The exclusion is a WHERE clause, not a filter over loaded rows: a
   * secret must be unreachable by construction, so that a future caller
   * who forgets to check cannot surface one.
   */
  private async load(params: {
    childId: number;
    since?: string;
  }): Promise<Memory[]> {
    const qb = this.memoryRepo
      .createQueryBuilder('m')
      .where('m.childId = :childId', { childId: params.childId })
      .andWhere("(m.sensitivity IS NULL OR m.sensitivity <> :secret)", {
        secret: SECRET_TIER,
      });

    if (params.since && /^\d{4}-\d{2}-\d{2}$/.test(params.since)) {
      qb.andWhere('m.createdAt >= :since', {
        since: new Date(`${params.since}T00:00:00`),
      });
    }

    // A per-child ceiling, not a per-query filter: recall scores every
    // memory the child has, so the read has to be bounded to keep the
    // database deadline meaningful.
    return qb.orderBy('m.createdAt', 'DESC').take(MAX_ROWS).getMany();
  }

  /** Reciprocal rank fusion, then the explainable multipliers. */
  private fuse(candidates: Candidate[]): Candidate[] {
    const byVector = ranks(
      candidates
        .filter((candidate) => candidate.vecSim > 0)
        .sort((a, b) => b.vecSim - a.vecSim)
        .slice(0, this.topK),
    );
    const byLiteral = ranks(
      candidates
        .filter((candidate) => candidate.hits > 0)
        .sort((a, b) => b.hits - a.hits || b.quote.length - a.quote.length)
        .slice(0, this.topK),
    );
    const byTime = ranks(
      candidates
        .filter((candidate) => candidate.temporal)
        .sort((a, b) => (a.occurredAt ?? '').localeCompare(b.occurredAt ?? ''))
        .slice(0, this.topK),
    );

    for (const candidate of candidates) {
      const base =
        share(candidate, byVector, this.rrfWVec, this.rrfK0) +
        share(candidate, byLiteral, this.rrfWFts, this.rrfK0) +
        share(candidate, byTime, this.rrfWTime, this.rrfK0);
      candidate.score =
        base *
        recency(candidate.ageDays, this.halfLifeDays) *
        (KIND_WEIGHT[candidate.kind] ?? DEFAULT_KIND_WEIGHT);
    }
    return candidates.sort((a, b) => b.score - a.score);
  }

  /**
   * Keep or drop: each channel guards its own exit.
   *
   * A literal hit is enough on its own — that is the exam case, where the
   * child names the word they used. But "a literal hit" has to mean a
   * fragment made of content words: a grammar-boundary bigram (「的鞋」
   * landing inside 「我的鞋带」) is coincidence, and acting on it is how
   * 「我的鞋放在哪里了」 gets the cat story. A semantic hit needs the
   * cosine floor. Neither gate uses the fused score, because "rank 1 of a
   * bad list" is not a reason to quote something.
   *
   * **Deviation from the source**, on purpose: 碎碎念 also accepts
   * `hits >= 2`, but two overlapping grammar-boundary bigrams (「我的」 +
   * 「的鞋」) satisfy that count, which is precisely the false positive the
   * rule is documented to prevent. Requiring one fragment with no
   * grammar character in it keeps the intent and drops the loophole.
   */
  private passes(candidate: Candidate, includeSecrets: boolean): boolean {
    // Defence in depth: `load()` already excludes L2 in SQL. This check
    // exists so a future read path that forgets cannot leak.
    if (candidate.sensitivity === SECRET_TIER && !includeSecrets) return false;
    if (candidate.strongHits > 0) return true;
    return candidate.vecSim >= this.vecThreshold;
  }
}

/** Ceiling on the per-child read; recall scores the whole set. */
const MAX_ROWS = 1000;

/** Only this tier is withheld from recall by default. */
const SECRET_TIER = 'L2';

/** The dated-events window, in days around today. */
const TEMPORAL_BACK_DAYS = 1;
const TEMPORAL_FORWARD_DAYS = 7;

/**
 * Multipliers applied after fusion. Not a physical quantity: they only
 * reorder memories that already passed the gate, so changing one changes
 * what is quoted *second*, never whether something is quoted.
 */
const KIND_WEIGHT: Record<string, number> = {
  preference: 1.0,
  event: 1.0,
  topic: 0.9,
  detail: 0.85,
};
const DEFAULT_KIND_WEIGHT = 0.9;

/**
 * Grammar, not content. A two-character window containing one of these
 * is dropped by `queryFragments`.
 */
const STOP_CHARS = new Set(
  Array.from(
    '还记得我你说的吗呢呀吧啊那你他她它是在有和就都也很请个这什么怎样谁把被给对里上下去来会要能可就才又但而且',
  ),
);

export interface Candidate {
  memoryId: number;
  quote: string;
  content: string;
  kind: string;
  occurredAt: string | null;
  ageDays: number;
  sensitivity: string;
  vector: number[] | null;
  vecSim: number;
  hits: number;
  strongHits: number;
  temporal: boolean;
  score: number;
}

/**
 * Cut a spoken Chinese question into matchable pieces.
 *
 * Chinese has no spaces, so a whitespace split yields one token for a
 * whole sentence: 「还记得我说的霸王龙吗」 never matches 「我最喜欢霸王龙」,
 * and the literal channel — the one that answers exam questions —
 * silently does nothing.
 *
 * Two-character windows with grammar words dropped are the cheapest
 * thing that works without a dictionary: 「霸王」「王龙」 survive,
 * 「还记」「得我」「的霸」 do not. It over-generates, which is acceptable
 * because the fused score ranks by how many pieces hit.
 */
export function queryFragments(query: string, limit = 12): string[] {
  const pieces: string[] = [];
  for (const run of runs(query)) {
    for (const piece of windows(run)) {
      if (!pieces.includes(piece)) pieces.push(piece);
      if (pieces.length >= limit) return pieces;
    }
  }
  return pieces;
}

/** Split on punctuation and spaces, keeping the alphanumeric runs. */
function runs(query: string): string[] {
  const out: string[] = [];
  let current: string[] = [];
  for (const char of query ?? '') {
    if (/[\p{L}\p{N}]/u.test(char)) {
      current.push(char);
    } else if (current.length > 0) {
      out.push(current.join(''));
      current = [];
    }
  }
  if (current.length > 0) out.push(current.join(''));
  return out;
}

/**
 * Two-character windows of one run, minus the purely grammatical.
 *
 * Dropped only when *both* characters are function words. Keeping a
 * window because one of its two characters carries meaning is what makes
 * 「要当」 survive in 「你记得我说过要当什么吗」 — filtering on "contains
 * a stop word" emptied that question entirely, and an empty term list
 * means the literal channel does nothing at all.
 */
function windows(run: string): string[] {
  if (run.length <= 2) return [run];
  const out: string[] = [];
  for (let index = 0; index < run.length - 1; index++) {
    const window = run.slice(index, index + 2);
    const bothGrammar = Array.from(window).every((char) => STOP_CHARS.has(char));
    if (!bothGrammar) out.push(window);
  }
  return out;
}

function toCandidate(row: Memory, moment: Date): Candidate {
  const createdAt = row.createdAt ? new Date(row.createdAt) : moment;
  const ageDays = Math.max(0, (moment.getTime() - createdAt.getTime()) / 86_400_000);
  return {
    memoryId: row.id,
    quote: row.verbatimQuote ?? '',
    content: row.content ?? '',
    kind: row.kind ?? 'detail',
    occurredAt: row.occurredAt ?? null,
    ageDays,
    sensitivity: row.sensitivity ?? 'L0',
    vector: row.vector ?? null,
    vecSim: 0,
    hits: 0,
    strongHits: 0,
    temporal: false,
    score: 0,
  };
}

/**
 * Count how many query fragments appear in the stored text.
 *
 * This is the channel that survives a cold embed: it needs no network,
 * and it is what answers 「我昨天说的恐龙」 when the word is literally in
 * the transcript.
 *
 * `hits` counts every matched fragment; `strongHits` counts only
 * fragments with no grammar character in them. The split exists for the
 * pass rule, not the ranking.
 */
function scoreLiteral(candidates: Candidate[], query: string): void {
  const terms = queryFragments(query);
  if (terms.length === 0) return;
  for (const candidate of candidates) {
    const haystack = `${candidate.quote}\n${candidate.content}`;
    const matched = terms.filter((term) => haystack.includes(term));
    candidate.hits = matched.length;
    candidate.strongHits = matched.filter(
      (term) => !Array.from(term).some((char) => STOP_CHARS.has(char)),
    ).length;
  }
}

/** Mark dated events inside the window around today. */
function scoreTemporal(candidates: Candidate[], moment: Date): void {
  const today = startOfDay(moment);
  const earliest = addDays(today, -TEMPORAL_BACK_DAYS);
  const latest = addDays(today, TEMPORAL_FORWARD_DAYS);
  for (const candidate of candidates) {
    if (candidate.kind !== 'event' || !candidate.occurredAt) continue;
    const parsed = new Date(`${candidate.occurredAt}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) continue;
    candidate.temporal = parsed >= earliest && parsed <= latest;
  }
}

/** Cosine every stored vector against the query. */
function scoreVector(candidates: Candidate[], queryVector: number[]): void {
  for (const candidate of candidates) {
    if (!candidate.vector) continue;
    candidate.vecSim = cosine(candidate.vector, queryVector);
  }
}

/**
 * Decay a score by half every `halfLifeDays`.
 *
 * A future timestamp (an event scheduled for next week) is not "newer
 * than now": it is clamped to zero age rather than rewarded.
 */
export function recency(ageDays: number, halfLifeDays: number): number {
  if (halfLifeDays <= 0) return 1;
  return Math.pow(0.5, Math.max(0, ageDays) / halfLifeDays);
}

/** Map memory id to 1-based rank within one channel. */
function ranks(ordered: Candidate[]): Map<number, number> {
  const map = new Map<number, number>();
  ordered.forEach((candidate, position) => map.set(candidate.memoryId, position + 1));
  return map;
}

/** One channel's contribution to the fused score. */
function share(
  candidate: Candidate,
  channel: Map<number, number>,
  weight: number,
  k0: number,
): number {
  const rank = channel.get(candidate.memoryId);
  if (rank == null) return 0;
  return weight / (k0 + rank);
}

function toHit(candidate: Candidate): MemoryHit {
  return {
    memoryId: candidate.memoryId,
    verbatimQuote: candidate.quote,
    content: candidate.content,
    occurredAt: candidate.occurredAt,
    score: Math.round(candidate.score * 1e6) / 1e6,
    kind: candidate.kind,
    sensitivity: candidate.sensitivity,
  };
}

class TimeoutError extends Error {
  constructor() {
    super('timeout');
    this.name = 'TimeoutError';
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function numberOr(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function intOr(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}
