/**
 * Conversation entities with improved typing.
 * Reuses the same table structure as the original but with proper types.
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

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any>;

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
