import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One safety detection, for the audit trail.
 *
 * Two rules govern this table:
 *  - `excerpt` never leaves the server. It is not copied into a
 *    notification body and never read back to the child; it exists so a
 *    human can later judge whether the word list is calibrated.
 *  - `watch` rows are queued for the parent, `critical` rows interrupt
 *    the child. The level is what keeps recall-over-precision from
 *    becoming noise for the family.
 */
@Entity('safety_events')
@Index(['childId', 'createdAt'])
@Index(['parentId', 'level'])
export class SafetyEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  childId: number;

  @Column({ nullable: true })
  parentId: number;

  /** self_harm | violence | danger */
  @Column({ length: 16 })
  category: string;

  /** critical | watch */
  @Column({ length: 16, default: 'critical' })
  level: string;

  /** rules | classifier */
  @Column({ length: 16, default: 'rules' })
  source: string;

  /** Short excerpt around the match. Audit only — never sent anywhere. */
  @Column({ type: 'text', nullable: true })
  excerpt: string;

  /** intercepted (reply short-circuited) | queued (parent inbox only) */
  @Column({ length: 16, default: 'queued' })
  action: string;

  /** When the parent inbox row was written; null when notification failed. */
  @Column({ nullable: true })
  notifiedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
