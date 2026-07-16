import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Author } from './author.entity';
import { Dynasty } from './dynasty.entity';

@Entity('poems')
export class Poem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'title' })
  title: string;

  @Column({ name: 'content', type: 'text' })
  content: string;

  @Column({ name: 'author_id', nullable: true })
  authorId: number;

  @Column({ name: 'dynasty_id', nullable: true })
  dynastyId: number;

  @Column({ name: 'type', nullable: true })
  type: string; // 五言绝句, 七言绝句, etc.

  @Column({ name: 'title_zh_hant', nullable: true })
  titleZhHant: string;

  @Column({ name: 'content_zh_hant', nullable: true, type: 'text' })
  contentZhHant: string;

  @ManyToOne(() => Author, { nullable: true })
  @JoinColumn({ name: 'author_id' })
  author: Author;

  @ManyToOne(() => Dynasty, { nullable: true })
  @JoinColumn({ name: 'dynasty_id' })
  dynasty: Dynasty;
}
