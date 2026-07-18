import { Entity, Column, PrimaryColumn, Index } from 'typeorm';

/**
 * 诗词注解持久化表（存于 lingxi.db 主库）。
 *
 * poetry.db 中的 poems 表是只读外部数据库，无法写入注解字段，
 * 因此在本库单独建表，以 poemId 为主键关联。
 *
 * 生成方式：
 * - 首次请求时调用 LLM 生成，写入此表
 * - 后续请求直接读此表，不再消耗 token
 * - 手工 refresh 时覆盖更新
 */
@Entity('poem_annotations')
@Index('idx_poem_annotation_model', ['poemId', 'model'])
export class PoemAnnotationRecord {
  @PrimaryColumn()
  poemId: number;

  @Column({ type: 'text' })
  translation: string;

  /** JSON 字符串：[{term, explanation}] */
  @Column({ type: 'text' })
  notes: string;

  @Column({ type: 'text' })
  appreciation: string;

  /** 生成来源：llm / fallback */
  @Column({ length: 20, default: 'llm' })
  source: string;

  /** 生成所用模型名（便于追溯） */
  @Column({ length: 100, nullable: true })
  model: string;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
