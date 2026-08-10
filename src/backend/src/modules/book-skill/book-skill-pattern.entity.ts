import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BookSkill } from './book-skill.entity';

@Entity('book_skill_patterns')
export class BookSkillPattern {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  bookSkillId: number;

  @Column()
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ nullable: true })
  category: string;

  @ManyToOne(() => BookSkill, (b) => b.patterns, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bookSkillId' })
  bookSkill: BookSkill;
}
