import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One row per memory tool call, for calibration.
 *
 * The point is the ratio, not the row: `miss_rate` tells you whether the
 * model is calling `recallMemory` at the wrong moments, and the
 * rejection distribution tells you which gate is too tight. Without this
 * table, tuning the trigger prompt is guesswork.
 *
 * The query text is truncated and kept server-side only.
 */
@Entity('recall_audits')
@Index(['childId', 'createdAt'])
@Index(['tool', 'outcome'])
export class RecallAudit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  childId: number;

  /** recall | save */
  @Column({ length: 16 })
  tool: string;

  /** hit | miss | degraded | first_day | stored | rejected */
  @Column({ length: 16 })
  outcome: string;

  /** Why a save was refused, or which gate a recall died at. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  reason: string;

  @Column({ type: 'int', default: 0 })
  hits: number;

  @Column({ type: 'int', default: 0 })
  latencyMs: number;

  /** Truncated query, for eyeballing calibration samples. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  query: string;

  @CreateDateColumn()
  createdAt: Date;
}
