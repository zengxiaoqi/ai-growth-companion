import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type VideoGenerationStatus = 'pending' | 'processing' | 'completed' | 'failed';

@Entity('video_generation_tasks')
export class VideoGenerationTask {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 36, unique: true })
  uuid: string;

  @Column()
  contentId: number;

  @Column()
  childId: number;

  @Column({ length: 80, default: 'third_party' })
  provider: string;

  @Column({ length: 120 })
  cacheKey: string;

  @Column({ type: 'simple-json', nullable: true })
  requestPayload: Record<string, any> | null;

  @Column({ length: 16, default: 'pending' })
  status: VideoGenerationStatus;

  @Column({ default: 0 })
  progress: number;

  @Column({ default: 0 })
  attemptCount: number;

  @Column({ nullable: true, length: 120 })
  providerTaskId: string | null;

  @Column({ nullable: true, length: 500 })
  sourceVideoUrl: string | null;

  @Column({ nullable: true, length: 500 })
  localVideoPath: string | null;

  @Column({ nullable: true, length: 500 })
  errorMessage: string | null;

  @Column({ nullable: true })
  startedAt: Date | null;

  @Column({ nullable: true })
  completedAt: Date | null;

  @Column({ nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

