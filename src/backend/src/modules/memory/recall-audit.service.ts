import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import { RecallAudit } from './recall-audit.entity';

export interface RecallAuditSummary {
  childId: number;
  windowDays: number;
  from: string;
  until: string;
  totalCalls: number;
  byTool: Record<string, number>;
  outcomes: Record<string, number>;
  /** hit / (hit + miss). null when there were no recall decisions. */
  hitRate: number | null;
  missRate: number | null;
  saveRejections: Array<{ reason: string; count: number }>;
  daily: Array<{ date: string; calls: number; hits: number; misses: number }>;
  latencyMs: { avg: number | null; p95: number | null };
  retentionDays: number;
  purgedRows: number;
}

const DEFAULT_WINDOW_DAYS = 14;
const MAX_WINDOW_DAYS = 90;
const DEFAULT_RETENTION_DAYS = 30;
const MAX_ROWS = 20_000;

/**
 * Read side of `recall_audits`.
 *
 * The design doc asks for "call rate / miss rate / rejection distribution"
 * so the trigger prompt can be tuned against real traffic. Until now the
 * table was write-only, which meant a silent regression — the model simply
 * never calling `recallMemory` — was invisible from outside the database.
 *
 * Aggregation is done in JS over a bounded, indexed date range rather than
 * with SQL `GROUP BY`: the date-truncation functions differ between SQLite
 * (development) and PostgreSQL (production), and a calibration view must
 * not be the place where a dialect difference produces wrong numbers.
 *
 * The `query` column is deliberately never returned. It is a truncated
 * sample kept server-side for eyeballing; exposing it would turn this
 * diagnostics endpoint into a transcript reader.
 */
@Injectable()
export class RecallAuditService {
  private readonly logger = new Logger(RecallAuditService.name);

  constructor(
    @InjectRepository(RecallAudit)
    private readonly auditRepo: Repository<RecallAudit>,
    private readonly config: ConfigService,
  ) {}

  private get retentionDays(): number {
    const raw = Number(this.config.get('MEMORY_AUDIT_RETENTION_DAYS', DEFAULT_RETENTION_DAYS));
    return Number.isFinite(raw)
      ? Math.min(Math.max(Math.trunc(raw), 1), 365)
      : DEFAULT_RETENTION_DAYS;
  }

  /**
   * Drop samples older than the retention window.
   *
   * Called from `summarize()` so cleanup has a guaranteed execution point
   * without a scheduler (the same pattern as `CareService.dueCue()`).
   * Idempotent, and failure is logged rather than raised.
   */
  async purgeExpired(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - this.retentionDays * 86_400_000);
    try {
      const result = await this.auditRepo.delete({ createdAt: LessThan(cutoff) });
      return result.affected ?? 0;
    } catch (err) {
      this.logger.debug(`could not purge recall audits: ${(err as Error).message}`);
      return 0;
    }
  }

  async summarize(
    childId: number,
    requestedDays = DEFAULT_WINDOW_DAYS,
    now = new Date(),
  ): Promise<RecallAuditSummary> {
    const windowDays = Number.isFinite(requestedDays)
      ? Math.min(Math.max(Math.trunc(requestedDays), 1), MAX_WINDOW_DAYS)
      : DEFAULT_WINDOW_DAYS;
    const from = new Date(now.getTime() - windowDays * 86_400_000);

    const purgedRows = await this.purgeExpired(now);
    const rows = await this.auditRepo.find({
      where: { childId, createdAt: MoreThanOrEqual(from) },
      order: { createdAt: 'DESC' },
      take: MAX_ROWS,
    });

    const byTool: Record<string, number> = {};
    const outcomes: Record<string, number> = {};
    const rejections: Record<string, number> = {};
    const daily = new Map<string, { date: string; calls: number; hits: number; misses: number }>();
    const latencies: number[] = [];
    let hits = 0;
    let misses = 0;

    for (const row of rows) {
      byTool[row.tool] = (byTool[row.tool] ?? 0) + 1;
      outcomes[row.outcome] = (outcomes[row.outcome] ?? 0) + 1;
      if (row.outcome === 'hit') hits += 1;
      if (row.outcome === 'miss') misses += 1;
      if (row.tool === 'save' && row.outcome === 'rejected' && row.reason) {
        rejections[row.reason] = (rejections[row.reason] ?? 0) + 1;
      }
      if (Number.isFinite(row.latencyMs) && row.latencyMs >= 0) latencies.push(row.latencyMs);

      const date = new Date(row.createdAt).toISOString().slice(0, 10);
      const bucket = daily.get(date) ?? { date, calls: 0, hits: 0, misses: 0 };
      bucket.calls += 1;
      if (row.outcome === 'hit') bucket.hits += 1;
      if (row.outcome === 'miss') bucket.misses += 1;
      daily.set(date, bucket);
    }

    const decisions = hits + misses;
    const sorted = latencies.sort((a, b) => a - b);

    return {
      childId,
      windowDays,
      from: from.toISOString(),
      until: now.toISOString(),
      totalCalls: rows.length,
      byTool,
      outcomes,
      hitRate: decisions ? round(hits / decisions) : null,
      missRate: decisions ? round(misses / decisions) : null,
      saveRejections: Object.entries(rejections)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
      daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
      latencyMs: {
        avg: sorted.length ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : null,
        p95: sorted.length
          ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
          : null,
      },
      retentionDays: this.retentionDays,
      purgedRows,
    };
  }
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
