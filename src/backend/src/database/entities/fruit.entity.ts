import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('fruits')
export class Fruit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100, unique: true })
  name: string;

  @Column({ length: 100, default: '' })
  nameZh: string;

  @Column({ length: 100, default: '' })
  family: string;

  @Column({ length: 100, default: '' })
  genus: string;

  @Column({ length: 100, default: '' })
  order: string;

  @Column({ type: 'simple-json', nullable: true })
  nutritions: {
    calories?: number;
    fat?: number;
    sugar?: number;
    carbohydrates?: number;
    protein?: number;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
