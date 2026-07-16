import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';

@Entity('poems')
export class Poem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 200 })
  @Index()
  title: string;

  @Column({ length: 100 })
  @Index()
  author: string;

  @Column({ length: 20 })
  @Index()
  dynasty: string; // 唐、宋、元、明、清等

  @Column({ length: 50, nullable: true })
  type: string; // 五言绝句、七言律诗、词等

  @Column({ type: 'simple-json' })
  content: string[]; // 诗句数组，每行一句

  @Column({ length: 500, nullable: true })
  translation: string; // 白话翻译

  @Column({ length: 1000, nullable: true })
  appreciation: string; // 赏析

  @Column({ default: 0 })
  @Index()
  popularity: number; // 热度/常用度

  @Column({ length: 20, nullable: true })
  @Index()
  firstChar: string; // 首字，用于飞花令
}
