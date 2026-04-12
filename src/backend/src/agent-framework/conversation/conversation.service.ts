/**
 * Conversation service — session CRUD and message persistence.
 * Refactored from ConversationManager with extracted MessageBuilder and SessionCache.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Conversation, ConversationMessage, MessageRole } from './entities';
import { MessageBuilderService } from './message-builder.service';
import { SessionCache } from './session-cache';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions/completions';

export interface ActiveSession {
  conversationId: number;
  uuid: string;
  childId: number;
  metadata: Record<string, any>;
}

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);
  private readonly activeSessions = new SessionCache<ActiveSession>(30 * 60 * 1000, 1000);

  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(ConversationMessage)
    private readonly messageRepo: Repository<ConversationMessage>,
    private readonly messageBuilder: MessageBuilderService,
  ) {}

  /** Get or create a conversation session */
  async getOrCreateSession(childId: number, sessionId?: string): Promise<ActiveSession> {
    if (sessionId) {
      const cached = this.activeSessions.get(sessionId);
      if (cached) return cached;

      const conv = await this.conversationRepo.findOne({
        where: { uuid: sessionId, status: 'active' },
      });
      if (conv) {
        const session: ActiveSession = {
          conversationId: conv.id,
          uuid: conv.uuid,
          childId: conv.childId,
          metadata: conv.metadata ?? {},
        };
        this.activeSessions.set(sessionId, session);
        return session;
      }
    }

    const existing = await this.conversationRepo.findOne({
      where: { childId, status: 'active' },
      order: { updatedAt: 'DESC' },
    });
    if (existing) {
      const session: ActiveSession = {
        conversationId: existing.id,
        uuid: existing.uuid,
        childId: existing.childId,
        metadata: existing.metadata ?? {},
      };
      this.activeSessions.set(existing.uuid, session);
      return session;
    }

    const uuid = uuidv4();
    const conv = this.conversationRepo.create({
      uuid,
      childId,
      status: 'active',
      metadata: {},
    });
    await this.conversationRepo.save(conv);

    const session: ActiveSession = {
      conversationId: conv.id,
      uuid,
      childId,
      metadata: {},
    };
    this.activeSessions.set(uuid, session);
    return session;
  }

  /** Persist a message */
  async addMessage(
    sessionId: string,
    role: string,
    content: string,
    extra?: { toolCalls?: any[]; toolResult?: any; toolCallId?: string; toolName?: string },
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    await this.messageRepo.save(
      this.messageRepo.create({
        conversationId: session.conversationId,
        role: role as MessageRole,
        content,
        toolCalls: extra?.toolCalls,
        toolResult: extra?.toolResult,
        toolCallId: extra?.toolCallId,
        toolName: extra?.toolName,
      }),
    );
  }

  /** Build the message array for LLM from conversation history */
  async buildMessageArray(sessionId: string, maxMessages = 20): Promise<ChatCompletionMessageParam[]> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return [];

    const messages = await this.messageRepo.find({
      where: { conversationId: session.conversationId },
      order: { createdAt: 'ASC' },
    });

    return this.messageBuilder.buildMessageArray(messages, maxMessages);
  }

  /** Update session metadata */
  async updateMetadata(sessionId: string, metadata: Record<string, any>): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    session.metadata = { ...session.metadata, ...metadata };
    await this.conversationRepo.update(session.conversationId, {
      metadata: session.metadata,
    });
  }

  /** End a conversation session */
  async endSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    await this.conversationRepo.update(session.conversationId, { status: 'ended' });
    this.activeSessions.delete(sessionId);
  }

  async getConversationByUuid(sessionId: string): Promise<Conversation | null> {
    return this.conversationRepo.findOne({ where: { uuid: sessionId } });
  }

  async listSessions(params: { childId: number; page?: number; limit?: number }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(50, Math.max(1, params.limit || 20));

    const [list, total] = await this.conversationRepo.findAndCount({
      where: { childId: params.childId },
      order: { updatedAt: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });

    const sessionIds = list.map(item => item.id);
    const messageCountMap = new Map<number, number>();

    if (sessionIds.length > 0) {
      const rows = await this.messageRepo
        .createQueryBuilder('m')
        .select('m.conversationId', 'conversationId')
        .addSelect('COUNT(*)', 'count')
        .where('m.conversationId IN (:...ids)', { ids: sessionIds })
        .groupBy('m.conversationId')
        .getRawMany();

      for (const row of rows) {
        messageCountMap.set(Number(row.conversationId), Number(row.count));
      }
    }

    return {
      list: list.map(item => ({
        id: item.id,
        uuid: item.uuid,
        childId: item.childId,
        status: item.status,
        metadata: item.metadata,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        messageCount: messageCountMap.get(item.id) || 0,
      })),
      total,
      page,
      limit,
    };
  }

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
}
