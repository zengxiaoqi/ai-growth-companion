import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

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

  @Column({ type: 'simple-json', nullable: true })
  allowedDomains: string[];

  @Column({ type: 'simple-json', nullable: true })
  blockedTopics: string[];

  @Column({ type: 'simple-json', nullable: true })
  studySchedule: any;

  @Column({ type: 'simple-json', nullable: true })
  notifications: any;

  @Column({ default: true })
  eyeProtectionEnabled: boolean;

  @Column({ default: 20 })
  restReminderMinutes: number;

  @Column({ default: true })
  contentFilterEnabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Per-child override for 碎碎念 casual-mode tools.
   * null = inherit the env default (CASUAL_ALLOWED_TOOLS);
   * [] = parent disabled all casual tools; array = exactly these tools.
   * Declared last so it matches the additive migration's appended column
   * order on SQLite (avoids a synchronize table rebuild).
   */
  @Column({ type: 'simple-json', nullable: true })
  casualTools: string[] | null;
}
