import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * One pending "ask about it later" cue.
 *
 * A cue is created when a memory is an *event with a known future date*:
 * the child says 「下周要去春游」, and a few days later the app opens with
 * 「春游好玩吗」. That is the only thing in this system that starts a
 * conversation on its own, so the state machine is deliberately small and
 * every transition is bounded.
 *
 * Statuses:
 *   pending → asked      (the cue was used)
 *   pending → rejected   (the child did not want to talk about it)
 *   pending → expired    (too old to still feel natural)
 */
@Entity('care_cues')
@Index(['childId', 'status', 'dueAt'])
export class CareCue {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  childId: number;

  @Column({ nullable: true })
  memoryId: number;

  /**
   * The topic to ask about, copied from the memory's third-person summary.
   * Copied rather than joined so that deleting a memory cannot resurrect
   * a cue, and so the scheduler never reads the memory table.
   */
  @Column({ type: 'text' })
  topic: string;

  /** `YYYY-MM-DD` — the day the question becomes appropriate. */
  @Column({ type: 'varchar', length: 10 })
  dueAt: string;

  /** pending | asked | rejected | expired */
  @Column({ length: 16, default: 'pending' })
  status: string;

  @Column({ type: 'int', default: 0 })
  postponeCount: number;

  @Column({ nullable: true })
  sentAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
