import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from "typeorm";

@Entity("achievements")
export class Achievement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 36, unique: true })
  uuid: string;

  @Column()
  userId: number;

  @Column({ length: 50 })
  achievementType: string;

  @Column({ length: 100 })
  achievementName: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  icon: string;

  @CreateDateColumn()
  earnedAt: Date;
}
