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

    // Take the most recent messages
    const recent = messages.slice(-maxMessages);

    const result: ChatCompletionMessageParam[] = [];
    for (const msg of recent) {
      if (msg.role === 'system') {
        result.push({ role: 'system', content: msg.content });
      } else if (msg.role === 'user') {
        result.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          result.push({
            role: 'assistant',
            content: msg.content || null,
            tool_calls: msg.toolCalls,
          });
        } else {
          result.push({ role: 'assistant', content: msg.content });
        }
      } else if (msg.role === 'tool') {
        result.push({
          role: 'tool',
          content: msg.content,
          tool_call_id: msg.toolCallId,
        } as ChatCompletionMessageParam);
      }
    }

    return result;
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
