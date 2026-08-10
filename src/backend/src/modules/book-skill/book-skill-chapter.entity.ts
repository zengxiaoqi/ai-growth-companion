import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BookSkill } from './book-skill.entity';

@Entity('book_skill_chapters')
export class BookSkillChapter {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  bookSkillId: number;

  @Column()
  index: number;

  @Column()
  title: string;

  @Column({ type: 'text' })
  summary: string;

  @Column({ type: 'text', nullable: true })
  content: string;

  @Column({ type: 'text', nullable: true })
  keyPoints: string; // JSON array of key points

  @ManyToOne(() => BookSkill, (b) => b.chapters, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bookSkillId' })
  bookSkill: BookSkill;
}
