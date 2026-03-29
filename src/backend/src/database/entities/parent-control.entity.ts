import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('parent_controls')
export class ParentControl {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 36, unique: true })
  uuid: string;

  @Column()
  parentId: number;

  @Column()
  childId: number;

  @Column({ default: 30 })
  dailyLimitMinutes: number;

  @Column('text', { array: true, nullable: true })
  allowedDomains: string[];

  @Column('text', { array: true, nullable: true })
  blockedTopics: string[];

  @Column({ type: 'simple-json' })
  studySchedule: any;

  @Column({ type: 'simple-json' })
  notifications: any;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}