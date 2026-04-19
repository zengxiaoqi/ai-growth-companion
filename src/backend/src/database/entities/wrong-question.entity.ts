import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("wrong_questions")
@Index(["childId", "questionHash"], { unique: true })
export class WrongQuestion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  childId: number;

  @Column({ nullable: true, length: 36 })
  sessionId: string | null;

  @Column({ nullable: true, length: 50 })
  domain: string | null;

  @Column({ nullable: true, length: 50 })
  activityType: string | null;

  @Column({ length: 64 })
  questionHash: string;

  @Column({ type: "text" })
  questionText: string;

  @Column({ type: "text", nullable: true })
  userAnswer: string | null;

  @Column({ type: "text", nullable: true })
  correctAnswer: string | null;

  @Column({ type: "text", nullable: true })
  explanation: string | null;

  @Column({ default: "new", length: 20 })
  status: string; // new | reviewed | mastered

  @Column({ type: "datetime" })
  occurredAt: Date;

  @Column({ type: "datetime", nullable: true })
  lastReviewedAt: Date | null;

  @Column({ type: "simple-json", nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
