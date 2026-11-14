import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export interface KnowledgeCardFact {
  unit: string;
  fact: string;
  source?: 'curriculum' | 'llm' | 'manual';
}

@Entity('knowledge_cards')
@Index(['topic', 'ageGroup'], { unique: true })
export class KnowledgeCard {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  topic: string;

  @Column({ type: 'simple-json', nullable: true })
  aliases: string[] | null;

  @Column({ length: 10 })
  ageGroup: string;

  @Column({ length: 20, nullable: true })
  domain: string | null;

  @Column({ type: 'simple-json', nullable: true })
  facts: KnowledgeCardFact[] | null;

  @Column({ type: 'simple-json', nullable: true })
  misconceptions: string[] | null;

  @Column({ type: 'simple-json', nullable: true })
  vocabulary: string[] | null;

  @Column({ type: 'simple-json', nullable: true })
  quizSeeds: Array<{ question: string; options: string[]; answer: string }> | null;

  @Column({ default: 'draft', length: 10 })
  status: string; // active | draft

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}