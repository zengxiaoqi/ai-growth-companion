import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('question_items')
@Index(['questionHash'], { unique: true })
@Index(['topic', 'ageGroup', 'activityType', 'status'])
export class QuestionItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 36 })
  uuid: string;

  @Column({ length: 100 })
  topic: string;

  @Column({ length: 10 })
  ageGroup: string;

  @Column({ length: 20, nullable: true })
  domain: string | null;

  @Column({ default: 1 })
  difficulty: number;

  @Column({ length: 30 })
  activityType: string;

  @Column({ length: 64 })
  questionHash: string;

  @Column({ type: 'simple-json', nullable: true })
  payload: Record<string, any> | null;

  @Column({ default: 'llm', length: 20 })
  source: string; // llm | curriculum | manual

  @Column({ default: 'active', length: 10 })
  status: string; // active | flagged | retired

  @Column({ default: 100 })
  qualityScore: number;

  @Column({ default: 0 })
  timesServed: number;

  @Column({ default: 0 })
  timesCorrect: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true })
  lastServedAt: Date | null;
}