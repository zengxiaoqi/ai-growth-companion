import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { BookSkillChapter } from './book-skill-chapter.entity';
import { BookSkillTerm } from './book-skill-term.entity';
import { BookSkillPattern } from './book-skill-pattern.entity';

@Entity('book_skills')
export class BookSkill {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column({ nullable: true })
  author: string;

  @Column({ nullable: true })
  coverUrl: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ nullable: true })
  filePath: string;

  @Column({ nullable: true })
  fileType: string; // pdf / epub / docx / txt

  @Column({ default: 0 })
  fileSize: number;

  @Column({ default: 0 })
  totalChapters: number;

  @Column({ nullable: true })
  ageGroup: string; // 3-4 / 5-6 / all

  @Column({ default: 'processing' })
  status: string; // processing | ready | failed

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @Column()
  uploaderId: number;

  @Column({ default: 0 })
  viewCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => BookSkillChapter, (ch) => ch.bookSkill, { cascade: true })
  chapters: BookSkillChapter[];

  @OneToMany(() => BookSkillTerm, (t) => t.bookSkill, { cascade: true })
  terms: BookSkillTerm[];

  @OneToMany(() => BookSkillPattern, (p) => p.bookSkill, { cascade: true })
  patterns: BookSkillPattern[];
}
