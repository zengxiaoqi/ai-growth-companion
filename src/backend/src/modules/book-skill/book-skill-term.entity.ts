import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BookSkill } from './book-skill.entity';

@Entity('book_skill_terms')
export class BookSkillTerm {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  bookSkillId: number;

  @Column()
  term: string;

  @Column({ type: 'text' })
  definition: string;

  @Column({ nullable: true })
  chapterRef: string; // e.g. "ch03" or "chapter 3"

  @ManyToOne(() => BookSkill, (b) => b.terms, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bookSkillId' })
  bookSkill: BookSkill;
}
