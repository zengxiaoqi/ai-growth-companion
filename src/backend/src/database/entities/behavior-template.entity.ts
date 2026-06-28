import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('behavior_templates')
export class BehaviorTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number; // 所属家长

  @Column({ length: 100 })
  name: string; // 行为名称

  @Column({ length: 10, default: '⭐' })
  emoji: string; // emoji 图标

  @Column({ nullable: true, length: 500 })
  iconImage: string; // 自定义图标图片 URL（上传后覆盖 emoji）

  @Column()
  points: number; // 积分值（正=加分，负=扣分）

  @Column({ length: 20, default: 'daily' })
  category: string; // daily/habit/extra/negative

  @Column({ default: false })
  isDefault: boolean; // 是否系统预设

  @Column({ default: true })
  isEnabled: boolean; // 是否启用

  @Column({ default: 0 })
  sortOrder: number; // 排序

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
