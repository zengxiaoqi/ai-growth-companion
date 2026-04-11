import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('contents')
export class Content {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 36, unique: true })
  uuid: string;

  @Column({ length: 200 })
  title: string;

  @Column({ nullable: true })
  subtitle: string;

  @Column({ length: 20 })
  ageRange: string; // '3-4', '5-6', 'all'

  @Column({ length: 50 })
  domain: string; // language, math, science, art, social

  @Column({ nullable: true })
  topic: string;

  @Column({ default: 1 })
  difficulty: number;

  @Column({ default: 5 })
  durationMinutes: number;

  @Column({ length: 50 })
  contentType: string; // story, lesson, game, quiz, video

  @Column({ type: 'simple-json' })
  content: any;

  @Column({ type: 'simple-json' })
  mediaUrls: any[];

  @Column({ default: 'draft' })
  status: string;

  @Column({ nullable: true })
  parentId: number;

  @Column({ nullable: true })
  childId: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}