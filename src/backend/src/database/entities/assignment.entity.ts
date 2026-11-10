import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne } from 'typeorm';
import { User } from './user.entity';

@Entity('assignments')
export class Assignment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 36, unique: true })
  uuid: string;

  @ManyToOne(() => User)
  parent: User;

  @Column()
  parentId: number;

  @ManyToOne(() => User)
  child: User;

  @Column()
  childId: number;

  @Column({ nullable: true })
  contentId: number;

  @Column({ length: 50 })
  activityType: string; // see ACTIVITY_TYPES in agent-framework/core/types/tool-metadata.ts

  @Column({ type: 'simple-json', nullable: true })
  activityData: any;

  @Column({ nullable: true })
  domain: string;

  @Column({ default: 1 })
  difficulty: number;

  @Column({ nullable: true })
  dueDate: Date;

  @Column({ default: 'pending' })
  status: string; // 'pending', 'in_progress', 'completed'

  @Column({ nullable: true })
  completedAt: Date;

  @Column({ nullable: true })
  score: number;

  @Column({ type: 'simple-json', nullable: true })
  resultData: any;

  @CreateDateColumn()
  createdAt: Date;
}
