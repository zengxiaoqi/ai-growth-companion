/**
 * Conversation and message persistence.
 *
 * ## One table, one declaration
 *
 * `conversations` and `conversation_messages` used to be declared twice —
 * once here (as `modules/ai/conversation/conversation.entity.ts`) and once
 * as `agent-framework/conversation/entities/conversation.entity.ts`. Both
 * classes carried `@Entity('conversations')`, so TypeORM built a schema per
 * metadata and `synchronize` alternated between them: whichever definition
 * it processed last won the ALTER, and the next boot undid it. When the two
 * disagreed about a column, the table was rebuilt on every start.
 *
 * Keeping the two in sync by hand only works until someone forgets, so the
 * duplicate was removed and this file became the only declaration. The
 * framework copy is gone and the module copy is gone; both sides now import
 * from here. `test/unit/entity-declarations.spec.ts` fails if a second
 * `@Entity('conversations')` ever appears again.
 *
 * ## Why it lives in `database/entities/`
 *
 * Because more than one layer maps it: the AI module owns the live session
 * manager, the agent framework owns a generic conversation service, and the
 * memory module reads transcripts to verify quotes. None of those is the
 * natural owner, and any of them importing the others' copy would make the
 * dependency direction worse than it already is. This directory is where the
 * other cross-cutting tables (users, notifications, …) live.
 *
 * ## Adding a column
 *
 * Add it here, once. Then either add a migration or let `synchronize` build
 * it — but note that `test/unit/migration-baseline.spec.ts` asserts the
 * baseline migration reproduces this entity exactly, so a new column without
 * a matching migration will fail that test rather than drift silently.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';

export type ConversationStatus = 'active' | 'ended';
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 36, unique: true })
  uuid: string;

  @Column()
  childId: number;

  @Column({ default: 'active' })
  status: ConversationStatus;

  /** Who is talking: the child, or a parent reviewing on their behalf. */
  @Column({ default: 'child' })
  actorType: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any>;

  /** Rolling summary, generated once the transcript outgrows the window. */
  @Column({ type: 'text', nullable: true })
  summary: string;

  @Column({ default: 0 })
  messageCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany('ConversationMessage', 'conversation')
  messages: ConversationMessage[];
}

@Entity('conversation_messages')
export class ConversationMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  conversationId: number;

  @Column({ length: 20 })
  role: MessageRole;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'simple-json', nullable: true })
  toolCalls: any[];

  @Column({ type: 'simple-json', nullable: true })
  toolResult: any;

  @Column({ nullable: true })
  toolCallId: string;

  @Column({ nullable: true })
  toolName: string;

  @CreateDateColumn()
  createdAt: Date;
}
