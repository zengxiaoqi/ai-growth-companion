/**
 * Conversation persistence: sessions, messages, rolling summaries.
 *
 * ## History
 *
 * This replaced `modules/ai/conversation/conversation-manager.ts`, which did
 * the same job inline. The two were merged rather than kept side by side
 * because they mapped the same table and had already drifted: this class had
 * lost summary generation entirely, and the manager had no cache eviction.
 * Behaviour is now defined here, once.
 *
 * ## What the merge preserved
 *
 * These are not incidental details; each one was a decision in the manager
 * that the rewrite had dropped:
 *
 * - `getOrCreateSession` takes `actorType` and refuses to reuse a session
 *   created by the other role. A parent opening a child's session id gets a
 *   fresh session, not a merged transcript.
 * - A missing `sessionId` always creates a new session. It never falls back
 *   to "the child's most recent active session" — that would fuse separate
 *   "new chat" clicks into one history.
 * - Summaries are generated once a conversation passes
 *   `SUMMARY_THRESHOLD` messages.
 *
 * ## Two deliberate differences from the manager
 *
 * 1. **The cache is a cache now.** `SessionCache` expires entries after 30
 *    minutes; the manager's raw `Map` never did. Taken literally that is a
 *    regression — `addMessage` returns early on a miss, so a message sent
 *    into a session idle for 31 minutes would be silently dropped. Every
 *    read therefore falls back to the database and rehydrates. The TTL is an
 *    optimisation, not a correctness boundary.
 * 2. **`actorType` is checked on the cached path too.** The manager checked
 *    it only on the database path, so a cached session belonging to the
 *    other role was reused anyway. The check now applies consistently.
 *
 * ## Summaries are generated off the request path
 *
 * The manager generated the summary inside `addMessage`, which meant the
 * 50th message of a conversation waited for a second model round-trip
 * before the child got an answer. The write path now only records that the
 * conversation changed (`summaryPending`); the work happens in
 * `scheduleSummary`, which the turn owner calls after the reply is out.
 *
 * The cost of that move is a small honesty problem: a summary is no longer
 * guaranteed to exist immediately after the message that triggered it. It
 * is guaranteed to be *attempted*, once per turn, by the only caller that
 * matters, and a failed attempt is retried on the next turn because the
 * pending flag is set again by the next write.
 *
 * `buildMessageArray` reads the summary on the *next* turn, when it prefixes
 * a truncated history with it. Nobody on the current request waits for it,
 * so a one-turn delay is invisible; a summary written a moment after the
 * 50th message is simply picked up by the 51st.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions/completions';
import {
  Conversation,
  ConversationMessage,
  MessageRole,
} from '../../database/entities/conversation.entity';
import { LlmClientService } from '../llm/llm-client.service';
import { MessageBuilderService } from './message-builder.service';
import { SessionCache } from './session-cache';

/**
 * Render a rolling summary as a history-prefix message.
 *
 * The summary was written by a model and stored as text, so it is untrusted
 * input being placed where the model reads instructions. Flatten and cap it
 * before it gets there, and label it explicitly as *old* content — without
 * that, a summary like "孩子问了恐龙" is easily mistaken for the current
 * question and answered twice.
 */
function summaryContextPrompt(summary: string): string {
  const safe = (summary ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!safe) return '';
  return [
    '【较早对话的摘要】',
    `以下是本次对话早前内容的概括，不是孩子刚刚说的话：${safe}`,
    '需要时用它保持上下文连贯；不要把它当成新问题来回答，也不要复述这段说明。',
  ].join('\n');
}

export interface ActiveSession {
  conversationId: number;
  uuid: string;
  childId: number;
  /** Who opened the session: `child` or `parent`. */
  actorType: string;
  metadata: Record<string, any>;
  /** Rolling summary, loaded from the database when the cache is cold. */
  summary?: string;
}

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);
  private readonly activeSessions = new SessionCache<ActiveSession>(30 * 60 * 1000, 1000);

  /** Messages in a conversation before a summary is generated. */
  private readonly SUMMARY_THRESHOLD = 50;

  /**
   * Upper bound on `summaryPending`.
   *
   * `addMessage` is called by more than one code path, and only the agent
   * executor calls `scheduleSummary`. A writer that never schedules (the
   * orchestrator persists through its own store) would otherwise grow this
   * set for the lifetime of the process.
   */
  private readonly MAX_PENDING_SUMMARIES = 500;

  /**
   * Sessions that gained a message since the last summary attempt.
   *
   * Keyed by session uuid rather than a flag on `ActiveSession` because the
   * session cache evicts entries after 30 minutes: a flag living there
   * would vanish on a miss and a long conversation would never be
   * summarised.
   */
  private readonly summaryPending = new Set<string>();

  /** Sessions whose summary is being generated right now. */
  private readonly summaryInFlight = new Set<string>();

  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(ConversationMessage)
    private readonly messageRepo: Repository<ConversationMessage>,
    private readonly messageBuilder: MessageBuilderService,
    /**
     * Optional so the conversation layer still instantiates in tests and in
     * any deployment without an LLM configured. Without it the transcript is
     * persisted normally and simply never gets a summary.
     */
    @Optional() private readonly llmClient?: LlmClientService,
  ) {}

  /**
   * Get the session for `sessionId`, or create one.
   *
   * Passing a `sessionId` that is unknown, ended, or owned by a different
   * `actorType` does not fail — it creates a new session, because the caller
   * asked to continue a conversation that is not there and a fresh one is
   * the only honest answer.
   */
  async getOrCreateSession(
    childId: number,
    actorType: string,
    sessionId?: string,
  ): Promise<ActiveSession> {
    if (sessionId) {
      const cached = this.activeSessions.get(sessionId);
      if (cached) {
        if (cached.actorType === actorType) return cached;
        this.logger.warn(
          `Session ${sessionId} owner=${cached.actorType} but caller=${actorType} — not reusing`,
        );
      } else {
        const conv = await this.conversationRepo.findOne({
          where: { uuid: sessionId, status: 'active' },
        });
        if (conv) {
          // Rows written before `actorType` existed carry it in `metadata`.
          const storedType = conv.actorType || conv.metadata?.actorType;
          if (!storedType || storedType === actorType) {
            return this.cacheSession(conv);
          }
          this.logger.warn(
            `Session ${sessionId} owner=${storedType} but caller=${actorType} — not reusing`,
          );
        }
      }
    }

    // No sessionId, or it was not reusable: always create a new session.
    // Never fall back to the child's previous active session — that would
    // merge conversations across separate "new chat" clicks.
    const uuid = uuidv4();
    const conv = this.conversationRepo.create({
      uuid,
      childId,
      actorType,
      status: 'active',
      metadata: {},
    });
    await this.conversationRepo.save(conv);
    return this.cacheSession(conv);
  }

  /** Persist a message to the conversation. */
  async addMessage(
    sessionId: string,
    role: MessageRole,
    content: string,
    extra?: {
      toolCalls?: any[];
      toolResult?: any;
      toolCallId?: string;
      toolName?: string;
    },
  ): Promise<void> {
    const session = await this.resolveSession(sessionId);
    if (!session) return;

    await this.messageRepo.save(
      this.messageRepo.create({
        conversationId: session.conversationId,
        role,
        content,
        ...extra,
      }),
    );

    // No counting, no model call. The write path only notes that the
    // conversation moved; `scheduleSummary` does the work after the turn.
    this.markSummaryPending(sessionId);
  }

  /**
   * Summarise the conversation in the background, if this turn is due for
   * one.
   *
   * Called by the turn owner once the reply has been produced and is on its
   * way out. It returns immediately — the caller is a request handler or an
   * async generator, and neither should wait for a model call that the
   * child's answer does not depend on.
   *
   * Removing the pending flag *before* the work starts is what makes this
   * safe to call from several places in one turn (each tool round and the
   * final reply all look like a turn end from here): only the first call
   * starts the work. `summaryInFlight` then stops two turns from
   * summarising the same conversation concurrently.
   */
  scheduleSummary(sessionId: string): void {
    if (!this.summaryPending.delete(sessionId)) return;

    void this.summarizeIfDue(sessionId).catch((error) =>
      this.logger.error(`Summary task for ${sessionId} failed: ${error?.message}`),
    );
  }

  /**
   * Summarise now, if the conversation is due for one.
   *
   * Split out from `scheduleSummary` so tests — and any shutdown hook added
   * later — can await the work instead of racing it. Returns without doing
   * anything when a summary already exists, the conversation is short, or
   * another attempt for the same session is still running.
   */
  async summarizeIfDue(sessionId: string): Promise<void> {
    if (this.summaryInFlight.has(sessionId)) return;
    this.summaryInFlight.add(sessionId);

    try {
      const session = await this.resolveSession(sessionId);
      if (!session) return;

      // Checked before counting: a conversation that already has a summary
      // never needs the query again, on any later turn.
      if (session.summary) return;

      const count = await this.messageRepo.count({
        where: { conversationId: session.conversationId },
      });
      if (count < this.SUMMARY_THRESHOLD) return;

      await this.generateSummary(session, sessionId, count);
    } catch (error: any) {
      // This runs detached from the request, so an escaping error would
      // become an unhandled rejection rather than a failed reply.
      this.logger.error(`Failed to summarise session ${sessionId}: ${error?.message}`);
    } finally {
      this.summaryInFlight.delete(sessionId);
    }
  }

  /**
   * Build the message array for the LLM from stored history.
   *
   * `maxMessages` defaults to 50 to match the manager this replaced; tool
   * calls and their results are kept together as one block, so a low limit
   * cannot split a pair.
   */
  async buildMessageArray(
    sessionId: string,
    maxMessages = 50,
  ): Promise<ChatCompletionMessageParam[]> {
    const session = await this.resolveSession(sessionId);
    if (!session) return [];

    const messages = await this.messageRepo.find({
      where: { conversationId: session.conversationId },
      order: { createdAt: 'ASC' },
    });

    const history = this.messageBuilder.buildMessageArray(messages, maxMessages);

    // A rolling summary is only worth its model call if it survives the
    // truncation it was written for. Prefix the retained tail with it, so
    // the model still knows what the conversation used to be about.
    //
    // This is the one place both execution paths (legacy AgentExecutor and
    // framework OrchestratorService) load history, so putting it here is
    // what keeps the two in sync. Both preserve `role: 'system'` when they
    // normalise the array.
    if (messages.length <= maxMessages || !session.summary) return history;
    const note = summaryContextPrompt(session.summary);
    if (!note) return history;

    return [{ role: 'system' as const, content: note }, ...history];
  }

  /** Merge `metadata` into the session and persist it. */
  async updateMetadata(sessionId: string, metadata: Record<string, any>): Promise<void> {
    const session = await this.resolveSession(sessionId);
    if (!session) return;

    session.metadata = { ...session.metadata, ...metadata };
    await this.conversationRepo.update(session.conversationId, {
      metadata: session.metadata,
    });
  }

  /** Mark the conversation ended and drop it from the cache. */
  async endSession(sessionId: string): Promise<void> {
    const session = await this.resolveSession(sessionId);
    if (!session) return;

    await this.conversationRepo.update(session.conversationId, {
      status: 'ended',
    });
    this.activeSessions.delete(sessionId);
    // Nothing will schedule a summary for an ended session; keeping the
    // flag would only pin an id in memory until the eviction cap hits it.
    this.summaryPending.delete(sessionId);
  }

  async getConversationByUuid(sessionId: string): Promise<Conversation | null> {
    return this.conversationRepo.findOne({ where: { uuid: sessionId } });
  }

  /**
   * List a child's conversations, newest first.
   *
   * `firstMessage` is the first thing the child said, used as the list
   * title — a conversation is easier to recognise by its opening line than
   * by a timestamp.
   */
  async listSessions(params: {
    childId: number;
    actorType?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(50, Math.max(1, params.limit || 20));

    const where: Record<string, any> = { childId: params.childId };
    if (params.actorType) {
      where.actorType = params.actorType;
    }

    const [list, total] = await this.conversationRepo.findAndCount({
      where,
      order: { updatedAt: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });

    const sessionIds = list.map((item) => item.id);
    const messageCountMap = new Map<number, number>();
    const firstMessageMap = new Map<number, string>();

    if (sessionIds.length > 0) {
      const counts = await this.messageRepo
        .createQueryBuilder('m')
        .select('m.conversationId', 'conversationId')
        .addSelect('COUNT(*)', 'count')
        .where('m.conversationId IN (:...ids)', { ids: sessionIds })
        .groupBy('m.conversationId')
        .getRawMany();

      for (const row of counts) {
        messageCountMap.set(Number(row.conversationId), Number(row.count));
      }

      const firstMessages = await this.messageRepo
        .createQueryBuilder('m')
        .select('m.conversationId', 'conversationId')
        .addSelect('m.content', 'content')
        .where('m.conversationId IN (:...ids)', { ids: sessionIds })
        .andWhere('m.role = :role', { role: 'user' })
        .andWhere((qb) => {
          const subQuery = qb
            .subQuery()
            .select('MIN(sub.createdAt)')
            .from('conversation_messages', 'sub')
            .where('sub.conversationId = m.conversationId')
            .andWhere('sub.role = :subRole', { subRole: 'user' })
            .getQuery();
          return 'm.createdAt = ' + subQuery;
        })
        .setParameter('subRole', 'user')
        .getRawMany();

      for (const row of firstMessages) {
        firstMessageMap.set(Number(row.conversationId), row.content);
      }
    }

    return {
      list: list.map((item) => ({
        id: item.id,
        uuid: item.uuid,
        childId: item.childId,
        status: item.status,
        metadata: item.metadata,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        messageCount: messageCountMap.get(item.id) || 0,
        firstMessage: firstMessageMap.get(item.id) ?? null,
      })),
      total,
      page,
      limit,
    };
  }

  /** Paged messages of one conversation, oldest first within the page. */
  async getSessionMessages(params: { sessionId: string; page?: number; limit?: number }) {
    const conversation = await this.getConversationByUuid(params.sessionId);
    if (!conversation) {
      return { conversation: null, list: [], total: 0, page: 1, limit: 20 };
    }

    const page = Math.max(1, params.page || 1);
    const limit = Math.min(200, Math.max(1, params.limit || 50));
    const [rows, total] = await this.messageRepo.findAndCount({
      where: { conversationId: conversation.id },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });

    const list = [...rows].reverse();
    return { conversation, list, total, page, limit };
  }

  /** Most recent messages of the child's current active conversation. */
  async getHistory(childId: number, limit = 50): Promise<ConversationMessage[]> {
    const conv = await this.conversationRepo.findOne({
      where: { childId, status: 'active' },
      order: { updatedAt: 'DESC' },
    });
    if (!conv) return [];

    return this.messageRepo.find({
      where: { conversationId: conv.id },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  // ── internals ────────────────────────────────────────────────────────

  /**
   * Cached session, or the one in the database.
   *
   * Only active conversations are hydrated: a message arriving for an ended
   * conversation is dropped, which is what the previous implementation did
   * (ended sessions were removed from its map and never came back).
   */
  private async resolveSession(sessionId: string): Promise<ActiveSession | null> {
    const cached = this.activeSessions.get(sessionId);
    if (cached) return cached;

    const conv = await this.conversationRepo.findOne({
      where: { uuid: sessionId, status: 'active' },
    });
    return conv ? this.cacheSession(conv) : null;
  }

  private cacheSession(conv: Conversation): ActiveSession {
    const session: ActiveSession = {
      conversationId: conv.id,
      uuid: conv.uuid,
      childId: conv.childId,
      actorType: conv.actorType || conv.metadata?.actorType || 'child',
      metadata: conv.metadata ?? {},
      summary: conv.summary ?? undefined,
    };
    this.activeSessions.set(conv.uuid, session);
    return session;
  }

  /**
   * Note that `sessionId` gained a message.
   *
   * Evicts the oldest entry when full. `Set` preserves insertion order, so
   * the first value is the one that has been waiting longest.
   */
  private markSummaryPending(sessionId: string): void {
    if (this.summaryPending.size >= this.MAX_PENDING_SUMMARIES) {
      const oldest = this.summaryPending.values().next().value;
      if (oldest !== undefined) this.summaryPending.delete(oldest);
    }
    this.summaryPending.add(sessionId);
  }

  /**
   * Ask the LLM for a one-line summary of the opening messages.
   *
   * `messageCount` records the real total. The manager stored the number of
   * messages it had *read* instead, which was always the threshold — a
   * constant written into a column whose whole point is to vary.
   */
  private async generateSummary(
    session: ActiveSession,
    sessionId: string,
    messageCount: number,
  ): Promise<void> {
    if (!this.llmClient?.isConfigured) {
      this.logger.warn('Cannot generate summary: LLM not configured');
      return;
    }

    try {
      const recentMessages = await this.messageRepo.find({
        where: { conversationId: session.conversationId },
        order: { createdAt: 'ASC' },
        take: this.SUMMARY_THRESHOLD,
      });

      if (recentMessages.length < this.SUMMARY_THRESHOLD) return;

      const messageText = recentMessages
        .map((m) => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content.substring(0, 200)}`)
        .join('\n');

      const response = await this.llmClient.chatCompletion([
        {
          role: 'user',
          content: `请用50字以内概括以下对话的主要内容（用中文）:\n\n${messageText}`,
        },
      ]);

      const summary = response.content?.trim() || '';
      if (!summary) return;

      await this.conversationRepo.update(session.conversationId, {
        summary,
        messageCount,
      });
      session.summary = summary;

      this.logger.log(`Generated summary for session ${sessionId}: ${summary}`);
    } catch (error) {
      // A failed summary must never fail the conversation.
      this.logger.error(`Failed to generate summary: ${error.message}`);
    }
  }
}
