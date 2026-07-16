import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

export type DownloadStatus = 'pending' | 'downloading' | 'completed' | 'failed';

@Entity('video_downloads')
@Index(['parentId'])
@Index(['childId'])
@Index(['status'])
export class VideoDownload {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  parentId: number;

  @Column({ nullable: true })
  childId: number;

  @Column()
  sourceUrl: string;

  @Column({ nullable: true })
  title: string;

  @Column({ nullable: true })
  thumbnail: string;

  @Column({ nullable: true })
  platform: string; // douyin, bilibili, tencent, etc.

  @Column({ nullable: true })
  uploader: string;

  @Column({ nullable: true })
  duration: number; // seconds

  @Column({ nullable: true, length: 500 })
  filePath: string; // relative path under public/uploads/videos/

  @Column({ nullable: true })
  fileSize: number; // bytes

  @Column({ default: 'pending' })
  status: DownloadStatus;

  @Column({ nullable: true, length: 1000 })
  errorMessage: string;

  @Column({ default: false })
  publishedToChild: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
