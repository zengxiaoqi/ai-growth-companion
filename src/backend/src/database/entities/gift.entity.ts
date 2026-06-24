import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('gifts')
export class Gift {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number; // 所属家长

  @Column({ length: 100 })
  name: string; // 礼品名称

  @Column({ length: 10, default: '🎁' })
  emoji: string; // 图标

  @Column({ nullable: true, length: 500 })
  description: string; // 描述

  @Column()
  pointsCost: number; // 所需积分

  @Column({ length: 20, default: 'other' })
  category: string; // entertainment/food/outing/study/other

  @Column({ default: true })
  isEnabled: boolean; // 是否可兑换

  @Column({ default: -1 })
  stock: number; // 库存（-1=无限）

  @Column({ default: 0 })
  sortOrder: number; // 排序

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
