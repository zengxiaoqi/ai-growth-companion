import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';

@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 36, unique: true })
  uuid: string;

  @Column()
  childId: number;

  @Column({ default: 'active' })
  status: string; // 'active' | 'ended'

  @Column({ type: 'simple-json', nullable: true })
  metadata: any; // { ageGroup, childName }

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
  role: string; // 'system' | 'user' | 'assistant' | 'tool'

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
