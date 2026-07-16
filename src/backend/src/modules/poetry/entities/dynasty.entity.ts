import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('dynasties')
export class Dynasty {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'name' })
  name: string;

  @Column({ name: 'name_zh_hant', nullable: true })
  nameZhHant: string;

  @Column({ name: 'sort_order', nullable: true })
  sortOrder: number;
}
