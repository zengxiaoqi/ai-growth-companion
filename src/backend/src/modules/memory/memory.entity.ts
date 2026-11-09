import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One long-term memory about one child.
 *
 * `verbatimQuote` is not decoration: it is the substring the verbatim
 * gate found in the child's own messages, and it is the only part of a
 * memory that may be quoted back. `content` is a third-person summary
 * for retrieval, never spoken verbatim.
 *
 * `sensitivity = 'L2'` means "the child asked for this to stay between
 * us". The recall query excludes L2 in SQL, so no later code path can
 * surface a secret by forgetting a filter.
 */
@Entity('memories')
@Index(['childId', 'sensitivity', 'occurredAt'])
@Index(['childId', 'kind', 'content'])
export class Memory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  childId: number;

  /** event | topic | detail | preference */
  @Column({ length: 16 })
  kind: string;

  /** Third-person one-liner, for retrieval and for the parent digest. */
  @Column({ type: 'text' })
  content: string;

  /** The child's own words, proven by the gate. Never rewritten. */
  @Column({ type: 'text' })
  verbatimQuote: string;

  @Column({ type: 'float', default: 0 })
  confidence: number;

  /** L0 | L1 | L2 */
  @Column({ length: 2, default: 'L0' })
  sensitivity: string;

  /** `YYYY-MM-DD`, only when the date is actually known. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  occurredAt: string | null;

  /** The `conversation_messages.id` rows this memory points back at. */
  @Column({ type: 'simple-json', nullable: true })
  sourceMessageIds: number[] | null;

  /**
   * Optional embedding. Null whenever no embed backend is configured —
   * textual recall still works, it just loses the semantic channel.
   */
  @Column({ type: 'simple-json', nullable: true })
  vector: number[] | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  embedModel: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
