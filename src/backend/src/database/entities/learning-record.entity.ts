import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne } from 'typeorm';
import { User } from './user.entity';
import { Content } from './content.entity';

@Entity('learning_records')
export class LearningRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 36, unique: true })
  uuid: string;

  @ManyToOne(() => User)
  user: User;

  @Column()
  userId: number;

  @ManyToOne(() => Content)
  content: Content;

  @Column({ nullable: true })
  contentId: number;

  @CreateDateColumn()
  startedAt: Date;

  @Column({ nullable: true })
  completedAt: Date;

  @Column({ nullable: true })
  durationSeconds: number;

  @Column({ nullable: true })
  score: number;

  @Column({ type: 'simple-json', nullable: true })
  answers: any[];

  @Column({ type: 'simple-json', nullable: true })
  interactionData: any;

  @Column({ default: 'in_progress' })
  status: string;
}