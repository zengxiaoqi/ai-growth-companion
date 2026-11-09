import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { And, MoreThanOrEqual, Repository } from 'typeorm';
import { Conversation, ConversationMessage } from '../../database/entities/conversation.entity';
import { CareService } from '../care/care.service';
import { Memory } from './memory.entity';
import { MemoryVectorService } from './memory-vector.service';
import { resolveQuote } from './verbatim';
import type { MemoryKind, SaveResult, Sensitivity } from './memory.types';

/**
 * Phrases that force L2 regardless of what the model said.
 *
 * A child asking for secrecy is not a classification task, and a model
 * that disagrees must not win. This list is checked in code against the
 * child's own words, not against the model's self-reported sensitivity.
 */
export const SECRET_MARKERS: readonly string[] = [
  '别告诉',
  '不要告诉',
  '别说出去',
  '不能告诉',
  '秘密',
  '保密',
];

const MAX_CONTEXT_MESSAGES = 60;

/**
 * The write side of long-term memory: four gates, then storage.
 *
 * The gates exist because the product promise is "every quote is real",
 * not "remembers a lot". Each one is a code fact with a test, not an
 * instruction to the model:
 *
 *  1. **Confidence** — below the threshold, discarded.
 *  2. **Verbatim** — the quote must be a substring of the child's own
 *     messages in this conversation; exact, then normalized, then fuzzy
 *     at 0.95. A fuzzy match still stores the transcript's own window.
 *  3. **Secrets** — a request for secrecy forces L2 in code.
 *  4. **Dedupe** — same content for the same child on the same day is
 *     one memory.
 *
 * Ported from 碎碎念 `memory/extract.py` (`_keep`, `_is_duplicate`,
 * `is_secret`). The difference: the transcript comes from the live
 * conversation instead of a nightly batch, which makes the verbatim gate
 * stricter — there is no window in which a message could be edited.
 */
@Injectable()
export class MemoryWriteService {
  private readonly logger = new Logger(MemoryWriteService.name);
  private readonly confidenceThreshold: number;
  private readonly fuzzyRatio: number;

  constructor(
    @InjectRepository(Memory)
    private readonly memoryRepo: Repository<Memory>,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(ConversationMessage)
    private readonly messageRepo: Repository<ConversationMessage>,
    private readonly vectorService: MemoryVectorService,
    private readonly configService: ConfigService,
    /**
     * Optional: a missing care module costs one proactive question, never
     * the memory write itself.
     */
    @Optional() private readonly careService?: CareService,
  ) {
    this.confidenceThreshold = numberOr(
      this.configService.get<string>('MEMORY_CONFIDENCE_THRESHOLD'),
      0.75,
    );
    this.fuzzyRatio = numberOr(this.configService.get<string>('MEMORY_FUZZY_RATIO'), 0.95);
  }

  /**
   * Apply the gates to one candidate and store it if it survives.
   *
   * Never throws: a refusal is a structured result the tool turns into a
   * normal reply, because a child must never hear a stack trace.
   */
  async save(params: {
    childId: number;
    sessionId?: string;
    conversationId?: number;
    content: string;
    verbatimQuote: string;
    kind?: MemoryKind;
    occurredAt?: string | null;
    confidence?: number;
    sensitivity?: Sensitivity;
    /** Quotes the model flagged as secrets; an extra signal, never a gate. */
    secrets?: string[];
  }): Promise<SaveResult> {
    const content = (params.content ?? '').trim();
    if (!content) return { stored: false, reason: 'empty_content' };

    const confidence = params.confidence ?? 1;
    if (confidence < this.confidenceThreshold) {
      return { stored: false, reason: 'low_confidence' };
    }

    const turns = await this.loadChildTurns(params);
    if (turns.length === 0) {
      // Without the child's own words there is nothing to verify against,
      // and storing an unverifiable quote is exactly what gate 2 forbids.
      return { stored: false, reason: 'no_session' };
    }

    const match = resolveQuote(
      params.verbatimQuote ?? '',
      turns.map((turn) => turn.content),
      this.fuzzyRatio,
    );
    if (!match) {
      this.logger.log(
        `dropped an unverifiable quote from child=${params.childId}: ` +
          `${(params.verbatimQuote ?? '').slice(0, 40)}`,
      );
      return { stored: false, reason: 'quote_mismatch' };
    }

    const kind: MemoryKind = params.kind ?? 'detail';
    if (await this.isDuplicate(params.childId, kind, content)) {
      return { stored: false, reason: 'duplicate' };
    }

    const sensitivity: Sensitivity = isSecret(match.quote, params.secrets)
      ? 'L2'
      : (params.sensitivity ?? 'L0');

    const vector = await this.tryEmbed(content);

    const occurredAt = normalizeDate(params.occurredAt);

    const saved = await this.memoryRepo.save(
      this.memoryRepo.create({
        childId: params.childId,
        kind,
        content,
        verbatimQuote: match.quote,
        confidence,
        sensitivity,
        occurredAt,
        sourceMessageIds: match.turnIndices
          .map((index) => turns[index]?.id)
          .filter((id): id is number => typeof id === 'number'),
        vector,
        embedModel: vector ? this.vectorService.model : null,
      }),
    );

    // A dated event in the future is the one thing worth asking about
    // later: 「下周要去春游」 earns a question the day before. A secret
    // never does — asking about it out loud is exactly what the child
    // asked us not to do.
    if (kind === 'event' && occurredAt && sensitivity !== 'L2') {
      void this.scheduleCareCue(params.childId, saved.id, content, occurredAt);
    }

    return {
      stored: true,
      memoryId: saved.id,
      resolvedQuote: match.quote,
      tier: match.tier,
      sensitivity,
    };
  }

  /**
   * The child's own messages, oldest first, capped.
   *
   * Only `role = 'user'` rows: a memory may quote the child, never the
   * assistant, which is what stops the model from laundering its own
   * words into "the child said".
   */
  private async loadChildTurns(params: {
    sessionId?: string;
    conversationId?: number;
  }): Promise<Array<{ id: number; content: string }>> {
    let conversationId = params.conversationId;
    if (conversationId == null && params.sessionId) {
      const conversation = await this.conversationRepo.findOne({
        where: { uuid: params.sessionId },
      });
      conversationId = conversation?.id;
    }
    if (conversationId == null) return [];

    const rows = await this.messageRepo.find({
      where: { conversationId, role: 'user' },
      order: { id: 'ASC' },
      take: MAX_CONTEXT_MESSAGES,
    });
    return rows
      .filter((row) => typeof row.content === 'string' && row.content.trim())
      .map((row) => ({ id: row.id, content: row.content }));
  }

  /** Same content, same kind, same child, same local day: one memory. */
  private async isDuplicate(childId: number, kind: MemoryKind, content: string): Promise<boolean> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const existing = await this.memoryRepo.findOne({
      where: {
        childId,
        kind,
        content,
        createdAt: And(MoreThanOrEqual(startOfDay)),
      },
    });
    return existing != null;
  }

  private async tryEmbed(content: string): Promise<number[] | null> {
    if (!this.vectorService.enabled) return null;
    // Write-path budget: generous compared to recall, because this call is
    // already inside a tool round-trip and a missing vector only costs the
    // semantic channel for this one memory.
    return this.vectorService.embed(content, 1500);
  }

  /**
   * Ask about it one day before it happens, not on the day itself.
   *
   * A cue due the same day would arrive after the fact; a cue due a week
   * early has the wrong feeling. One day is the whole calibration, and
   * `CareService` refuses anything older than a few days anyway.
   */
  private async scheduleCareCue(
    childId: number,
    memoryId: number,
    topic: string,
    occurredAt: string,
  ): Promise<void> {
    if (!this.careService) return;
    const eventDate = new Date(`${occurredAt}T00:00:00`);
    if (Number.isNaN(eventDate.getTime())) return;

    const dueDate = new Date(eventDate);
    dueDate.setDate(dueDate.getDate() - 1);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (dueDate < today) return; // already past: nothing to ask about

    await this.careService.schedule({
      childId,
      memoryId,
      topic,
      dueAt: toDateString(dueDate),
    });
  }
}

/** True when the child asked for this to stay between them. */
export function isSecret(quote: string, secrets?: string[]): boolean {
  if (SECRET_MARKERS.some((marker) => quote.includes(marker))) return true;
  return (secrets ?? []).some(
    (secret) => secret && (quote.includes(secret) || secret.includes(quote)),
  );
}

/** Keep only a real `YYYY-MM-DD`; anything else becomes null. */
function normalizeDate(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const parsed = new Date(`${trimmed}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : trimmed;
}

function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function numberOr(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}
