import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  phone: string;

  @Column()
  password: string;

  @Column({ length: 100 })
  name: string;

  @Column({ default: 'child' })
  type: string; // child / parent

  @Column({ nullable: true })
  avatar: string;

  @Column({ nullable: true })
  age: number;

  @Column({ nullable: true })
  gender: string;

  @Column({ nullable: true })
  parentId: number;

  @Column({ nullable: true })
  pin: string;

  @Column({ type: 'simple-json', nullable: true })
  settings: any;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}