import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('study_plan_records')
export class StudyPlanRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  childId: number;

  @Column({ nullable: true })
  parentId: number | null;

  @Column({ default: 'ai_generated', length: 40 })
  sourceType: string; // ai_generated | parent_assignment

  @Column({ nullable: true })
  sourceId: number | null;

  @Column({ length: 180 })
  title: string;

  @Column({ type: 'simple-json', nullable: true })
  planContent: Record<string, any> | null;

  @Column({ default: 'active', length: 20 })
  status: string;

  @Column({ nullable: true, length: 36 })
  sessionId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

