import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from "typeorm";

@Entity("emergency_calls")
export class EmergencyCall {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  childId: number;

  @Column()
  parentId: number;

  @Column({ nullable: true })
  parentPhone: string;

  @Column({ default: "pending" })
  status: string; // pending | sms_sent | call_initiated | completed | failed

  @Column({ nullable: true })
  smsResult: string;

  @Column({ nullable: true })
  callResult: string;

  @Column({ nullable: true })
  errorMessage: string;

  @CreateDateColumn()
  createdAt: Date;
}
