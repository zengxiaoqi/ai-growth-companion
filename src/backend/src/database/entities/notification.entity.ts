import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from "typeorm";

@Entity("notifications")
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column({ length: 100 })
  title: string;

  @Column({ length: 500 })
  message: string;

  @Column({ default: "system" })
  type: string; // system, achievement, learning, reminder

  @Column({ default: false })
  read: boolean;

  @Column({ nullable: true })
  relatedId: number; // related entity id (achievement, content, etc.)

  @CreateDateColumn()
  createdAt: Date;
}
