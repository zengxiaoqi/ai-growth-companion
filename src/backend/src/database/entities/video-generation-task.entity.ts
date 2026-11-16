import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type VideoGenerationStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type VideoApprovalStatus = 'pending_approval' | 'approved' | 'rejected';
export type VideoRenderEngine = 'auto' | 'hyperframes' | 'remotion' | 'dsh' | 'agent-remotion';

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

  @Column({ length: 20, default: 'auto' })
  renderEngine: VideoRenderEngine;

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

  @Column({ length: 20, default: 'pending_approval' })
  approvalStatus: VideoApprovalStatus;

  @Column({ nullable: true, length: 500 })
  rejectionReason: string | null;

  @Column({ nullable: true })
  startedAt: Date | null;

  @Column({ nullable: true })
  completedAt: Date | null;

  @Column({ nullable: true })
  expiresAt: Date | null;

  /** 视觉质检总分（0-100）；null = 未跑 QA（vision 未配置或 gate 关闭） */
  @Column({ type: 'integer', nullable: true })
  qaScore: number | null;

  @Column({ type: 'boolean', nullable: true })
  qaPassed: boolean | null;

  /** 参数级修复轮数（0 或 1）；QA 不达标放行时也要留痕 */
  @Column({ default: 0 })
  qaRounds: number;

  /** 实际出片的引擎（engineOrder 里命中的那个），与请求的 renderEngine 区分 */
  @Column({ nullable: true, length: 30 })
  actualEngine: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
