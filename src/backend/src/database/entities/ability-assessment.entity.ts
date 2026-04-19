import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from "typeorm";

@Entity("ability_assessments")
export class AbilityAssessment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 36, unique: true })
  uuid: string;

  @Column()
  userId: number;

  @Column({ length: 50 })
  domain: string;

  @Column()
  score: number;

  @Column({ nullable: true })
  level: string;

  @Column({ type: "simple-json" })
  evidence: any;

  @CreateDateColumn()
  assessedAt: Date;
}
