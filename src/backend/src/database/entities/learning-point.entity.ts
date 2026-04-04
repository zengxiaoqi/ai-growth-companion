import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('learning_points')
@Index(['childId', 'pointKey'], { unique: true })
export class LearningPoint {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  childId: number;

  @Column({ nullable: true, length: 36 })
  sessionId: string | null;

  @Column({ nullable: true, length: 50 })
  domain: string | null;

  @Column({ length: 180 })
  pointKey: string;

  @Column({ length: 255 })
  pointLabel: string;

  @Column({ default: 'chat_summary', length: 40 })
  source: string; // chat_summary | activity

  @Column({ type: 'datetime' })
  lastLearnedAt: Date;

  @Column({ type: 'datetime' })
  cooldownUntil: Date;

  @Column({ type: 'simple-json', nullable: true })
  evidence: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

