import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('authors')
export class Author {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'name' })
  name: string;

  @Column({ name: 'name_zh_hant', nullable: true })
  nameZhHant: string;

  @Column({ name: 'dynasty_id', nullable: true })
  dynastyId: number;
}
