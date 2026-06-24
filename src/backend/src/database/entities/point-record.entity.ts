import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('point_records')
@Index(['childId', 'recordedAt'])
export class PointRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  childId: number; // 孩子 ID（关联 User 表 type=child）

  @Column({ nullable: true })
  templateId: number; // 行为模板 ID（可空，支持临时记录）

  @Column({ length: 100 })
  behaviorName: string; // 行为名称（快照）

  @Column()
  points: number; // 积分变化（正=加分，负=扣分）

  @Column({ nullable: true, length: 500 })
  note: string; // 备注

  @Column()
  recordedBy: number; // 记录人（家长 ID）

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  recordedAt: Date; // 记录的行为发生时间

  @CreateDateColumn()
  createdAt: Date;
}
