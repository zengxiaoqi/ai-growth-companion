import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('redemption_records')
@Index(['childId', 'redeemedAt'])
export class RedemptionRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  childId: number; // 孩子 ID

  @Column()
  giftId: number; // 礼品 ID

  @Column({ length: 100 })
  giftName: string; // 礼品名称（快照）

  @Column()
  pointsCost: number; // 消耗积分

  @Column({ length: 20, default: 'pending' })
  status: string; // pending/approved/completed/cancelled

  @Column({ nullable: true })
  approvedBy: number; // 审批人（家长 ID）

  @CreateDateColumn()
  redeemedAt: Date; // 兑换申请时间

  @Column({ type: 'datetime', nullable: true })
  completedAt: Date; // 完成时间

  @Column({ nullable: true, length: 500 })
  note: string; // 备注

  @UpdateDateColumn()
  updatedAt: Date;
}
