import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Conversation, ConversationMessage } from './conversation.entity';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions/completions';

interface ActiveSession {
  conversationId: number;
  uuid: string;
  childId: number;
  metadata: any;
}

@Injectable()
export class ConversationManager {
  private readonly logger = new Logger(ConversationManager.name);
  private readonly activeSessions = new Map<string, ActiveSession>();

  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(ConversationMessage)
    private readonly messageRepo: Repository<ConversationMessage>,
  ) {}

  /** Get or create a conversation session */
  async getOrCreateSession(childId: number, sessionId?: string): Promise<ActiveSession> {
    // Try to find existing session
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
          metadata: conv.metadata,
        };
        this.activeSessions.set(sessionId, session);
        return session;
      }
    }

    // Try to find an active session for this child
    const existing = await this.conversationRepo.findOne({
      where: { childId, status: 'active' },
      order: { updatedAt: 'DESC' },
    });
    if (existing) {
      const session: ActiveSession = {
        conversationId: existing.id,
        uuid: existing.uuid,
        childId: existing.childId,
        metadata: existing.metadata,
      };
      this.activeSessions.set(existing.uuid, session);
      return session;
    }

    // Create new session
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

  /** Persist a message to the conversation */
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
        role,
        content,
        ...extra,
      }),
    );
  }

  /** Build the message array for LLM from conversation history */
  async buildMessageArray(
    sessionId: string,
    maxMessages = 20,
  ): Promise<ChatCompletionMessageParam[]> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return [];

    const messages = await this.messageRepo.find({
      where: { conversationId: session.conversationId },
      order: { createdAt: 'ASC' },
    });

    // Build valid blocks so we never split assistant(tool_calls) from tool results.
    const blocks: ChatCompletionMessageParam[][] = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      if (msg.role === 'system') {
        blocks.push([{ role: 'system', content: msg.content }]);
        continue;
      }

      if (msg.role === 'user') {
        blocks.push([{ role: 'user', content: msg.content }]);
        continue;
      }

      if (msg.role === 'assistant') {
        const toolCalls = Array.isArray(msg.toolCalls) ? msg.toolCalls : [];
        if (toolCalls.length === 0) {
          blocks.push([{ role: 'assistant', content: msg.content }]);
          continue;
        }

        const pendingToolIds = new Set(
          toolCalls
            .map((call: any) => (typeof call?.id === 'string' ? call.id : null))
            .filter((id: string | null): id is string => Boolean(id)),
        );

        if (pendingToolIds.size === 0) {
          blocks.push([{ role: 'assistant', content: msg.content }]);
          continue;
        }

        const block: ChatCompletionMessageParam[] = [{
          role: 'assistant',
          content: msg.content || null,
          tool_calls: toolCalls,
        } as ChatCompletionMessageParam];

        let j = i + 1;
        while (j < messages.length && pendingToolIds.size > 0) {
          const toolMsg = messages[j];
          if (toolMsg.role !== 'tool') break;

          if (toolMsg.toolCallId && pendingToolIds.has(toolMsg.toolCallId)) {
            block.push({
              role: 'tool',
              content: toolMsg.content,
              tool_call_id: toolMsg.toolCallId,
            } as ChatCompletionMessageParam);
            pendingToolIds.delete(toolMsg.toolCallId);
          }
          j++;
        }

        if (pendingToolIds.size === 0) {
          blocks.push(block);
        } else {
          this.logger.warn(
            `Skip incomplete tool-call block in session ${sessionId}: missing ${pendingToolIds.size} tool result(s)`,
          );
        }

        i = j - 1;
        continue;
      }

      // Drop dangling tool messages that don't have a preceding assistant(tool_calls) in this scan.
      if (msg.role === 'tool') {
        continue;
      }
    }

    // Keep tail blocks without breaking a block boundary.
    const selectedBlocks: ChatCompletionMessageParam[][] = [];
    let selectedCount = 0;
    for (let i = blocks.length - 1; i >= 0; i--) {
      const block = blocks[i];
      const blockSize = block.length;

      if (selectedCount + blockSize > maxMessages) {
        if (selectedBlocks.length === 0) {
          selectedBlocks.unshift(block);
        }
        break;
      }

      selectedBlocks.unshift(block);
      selectedCount += blockSize;
    }

    return selectedBlocks.flat();
  }

  /** Update session metadata */
  async updateMetadata(sessionId: string, metadata: any): Promise<void> {
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
    return this.conversationRepo.findOne({
      where: { uuid: sessionId },
    });
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

    const sessionIds = list.map((item) => item.id);
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
      list: list.map((item) => ({
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
    return {
      conversation,
      list,
      total,
      page,
      limit,
    };
  }

  /** Get conversation history for display */
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
