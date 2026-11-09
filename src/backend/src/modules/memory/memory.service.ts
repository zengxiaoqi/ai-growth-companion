import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Not, Repository } from 'typeorm';
import { MemoryWriteService } from './memory-write.service';
import { MemoryRecallService } from './memory-recall.service';
import { Memory } from './memory.entity';
import { RecallAudit } from './recall-audit.entity';
import type { MemoryKind, RecallResult, SaveResult, Sensitivity } from './memory.types';

export interface SaveMemoryParams {
  childId: number;
  sessionId?: string;
  conversationId?: number;
  content: string;
  verbatimQuote: string;
  kind?: MemoryKind;
  occurredAt?: string | null;
  confidence?: number;
  sensitivity?: Sensitivity;
  secrets?: string[];
}

export interface RecallMemoryParams {
  childId: number;
  query: string;
  limit?: number;
  since?: string;
  includeSecrets?: boolean;
}

/**
 * The memory facade: two operations, one audit row each.
 *
 * Everything callable from outside the module goes through here, so the
 * observability of section 3.4 (call rate, miss rate, rejection
 * distribution) is a property of the entry point rather than something
 * each caller has to remember to do.
 */
@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    private readonly writeService: MemoryWriteService,
    private readonly recallService: MemoryRecallService,
    @InjectRepository(Memory)
    private readonly memoryRepo: Repository<Memory>,
    @InjectRepository(RecallAudit)
    private readonly auditRepo: Repository<RecallAudit>,
  ) {}

  /** Four gates, then storage. Never throws. */
  async saveMemory(params: SaveMemoryParams): Promise<SaveResult> {
    const startedAt = Date.now();
    let result: SaveResult;
    try {
      result = await this.writeService.save(params);
    } catch (err) {
      this.logger.error(`saveMemory failed: ${(err as Error).message}`);
      result = { stored: false, reason: 'empty_content' };
    }
    void this.audit({
      childId: params.childId,
      tool: 'save',
      outcome: result.stored ? 'stored' : 'rejected',
      reason: result.reason,
      latencyMs: Date.now() - startedAt,
    });
    return result;
  }

  /** Three channels, four exits. Never throws. */
  async recallMemory(params: RecallMemoryParams): Promise<RecallResult> {
    const startedAt = Date.now();
    const result = await this.recallService.recall(params);
    void this.audit({
      childId: params.childId,
      tool: 'recall',
      outcome: result.outcome,
      hits: result.hits.length,
      latencyMs: Date.now() - startedAt,
      query: params.query,
    });
    return result;
  }

  /**
   * Bypass for the scheduled jobs (parent digest, recommendations).
   *
   * Those paths must not depend on the model deciding to call
   * `recallMemory`: a child rarely asks "do you remember", but the
   * parent report is where memory actually pays off. L2 stays excluded
   * by the same SQL clause.
   */
  async recentForDigest(childId: number, since: Date, limit = 30): Promise<Memory[]> {
    return this.memoryRepo.find({
      where: {
        childId,
        sensitivity: Not('L2'),
        createdAt: MoreThanOrEqual(since),
      },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  /** Today's stored count, for the health/diagnostics endpoint. */
  async countForChild(childId: number): Promise<number> {
    return this.memoryRepo.count({ where: { childId } });
  }

  /**
   * One audit row. Failure is logged, never raised — observability must
   * not be able to break the feature it observes.
   */
  private async audit(row: {
    childId: number;
    tool: 'recall' | 'save';
    outcome: string;
    reason?: string;
    hits?: number;
    latencyMs?: number;
    query?: string;
  }): Promise<void> {
    try {
      await this.auditRepo.save(
        this.auditRepo.create({
          childId: row.childId,
          tool: row.tool,
          outcome: row.outcome,
          reason: row.reason ?? null,
          hits: row.hits ?? 0,
          latencyMs: row.latencyMs ?? 0,
          query: row.query ? row.query.slice(0, 200) : null,
        }),
      );
    } catch (err) {
      this.logger.debug(`could not write recall audit: ${(err as Error).message}`);
    }
  }
}
