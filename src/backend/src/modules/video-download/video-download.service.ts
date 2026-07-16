import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { VideoDownload } from '../../database/entities/video-download.entity';

const execFileAsync = promisify(execFile);

const YTDLP_BIN = process.env.YTDLP_BIN || '/home/zxq/.local/bin/yt-dlp';
const FFMPEG_DIR = process.env.FFMPEG_DIR || '/usr/bin';

// Public directory for serving downloaded videos
// main.ts serves static assets from join(__dirname, '..', 'public') where __dirname = dist/
// So the served public dir is src/backend/public/ (one level above dist/)
// Our service __dirname = dist/modules/video-download, so ../../.. /public = src/backend/public
const PUBLIC_DIR = path.join(__dirname, '..', '..', '..', 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads', 'videos');

@Injectable()
export class VideoDownloadService {
  private readonly logger = new Logger(VideoDownloadService.name);

  constructor(
    @InjectRepository(VideoDownload)
    private readonly repo: Repository<VideoDownload>,
  ) {
    // Ensure uploads directory exists
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  /**
   * Extract video metadata (title, thumbnail, etc.) without downloading
   */
  async extractInfo(url: string): Promise<Partial<VideoDownload>> {
    const { stdout } = await execFileAsync(
      YTDLP_BIN,
      ['--dump-json', '--no-warnings', '--no-playlist', '--ffmpeg-location', FFMPEG_DIR, url],
      {
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
        env: {
          ...process.env,
          PATH: `/usr/bin:${process.env.HOME}/.local/bin:${process.env.PATH}`,
        },
      },
    );

    const info = JSON.parse(stdout);
    return {
      title: info.title,
      thumbnail: info.thumbnail,
      uploader: info.uploader || info.channel || info.uploader_id,
      duration: info.duration,
      platform: info.extractor_key ? info.extractor_key.toLowerCase() : info.extractor,
    };
  }

  /**
   * Create a new download task and start downloading in the background
   */
  async createDownload(parentId: number, url: string, childId?: number): Promise<VideoDownload> {
    // First extract metadata
    let info: Partial<VideoDownload> = {};
    try {
      info = await this.extractInfo(url);
    } catch (err) {
      this.logger.warn(`Failed to extract info for ${url}: ${(err as Error).message}`);
    }

    const record = this.repo.create({
      parentId,
      childId: childId || null,
      sourceUrl: url,
      title: info.title || url,
      thumbnail: info.thumbnail || null,
      uploader: info.uploader || null,
      duration: info.duration || null,
      platform: info.platform || this.detectPlatform(url),
      status: 'pending',
    });

    const saved = await this.repo.save(record);

    // Start download in background (don't await)
    this.performDownload(saved.id, url).catch((err) => {
      this.logger.error(`Background download failed for task ${saved.id}: ${err.message}`);
    });

    return saved;
  }

  /**
   * Perform the actual download using yt-dlp
   */
  private async performDownload(taskId: number, url: string): Promise<void> {
    const task = await this.repo.findOne({ where: { id: taskId } });
    if (!task) return;

    try {
      await this.repo.update(taskId, { status: 'downloading' });

      const filename = `video_${taskId}_${Date.now()}.mp4`;
      const outputPath = path.join(UPLOADS_DIR, filename);
      const relativePath = `/uploads/videos/${filename}`;

      this.logger.log(`Starting download: task=${taskId} url=${url} → ${outputPath}`);

      const { stderr } = await execFileAsync(
        YTDLP_BIN,
        [
          '--no-warnings',
          '--no-playlist',
          '-f',
          'bestvideo+bestaudio/best',
          '--merge-output-format',
          'mp4',
          '--ffmpeg-location',
          FFMPEG_DIR,
          '-o',
          outputPath,
          '--no-part',
          url,
        ],
        {
          timeout: 300000, // 5 min max per video
          maxBuffer: 10 * 1024 * 1024,
          env: {
            ...process.env,
            PATH: `/usr/bin:${process.env.HOME}/.local/bin:${process.env.PATH}`,
          },
        },
      );

      if (stderr) {
        this.logger.debug(`yt-dlp stderr for task ${taskId}: ${stderr.slice(0, 500)}`);
      }

      // Verify file exists
      if (!fs.existsSync(outputPath)) {
        throw new Error('Download completed but file not found');
      }

      const stats = fs.statSync(outputPath);
      await this.repo.update(taskId, {
        status: 'completed',
        filePath: relativePath,
        fileSize: stats.size,
      });

      this.logger.log(`Download completed: task=${taskId} size=${stats.size} → ${relativePath}`);
    } catch (err) {
      const errorMsg = (err as Error).message.slice(0, 1000);
      this.logger.error(`Download failed for task ${taskId}: ${errorMsg}`);
      await this.repo.update(taskId, {
        status: 'failed',
        errorMessage: errorMsg,
      });
    }
  }

  /**
   * Get download status
   */
  async findById(id: number): Promise<VideoDownload> {
    const task = await this.repo.findOne({ where: { id } });
    if (!task) throw new NotFoundException(`Download task ${id} not found`);
    return task;
  }

  /**
   * List all downloads by parent
   */
  async findByParent(parentId: number): Promise<VideoDownload[]> {
    return this.repo.find({
      where: { parentId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * List published videos for a child
   */
  async findPublishedForChild(childId: number): Promise<VideoDownload[]> {
    return this.repo.find({
      where: { childId, publishedToChild: true, status: 'completed' },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Toggle publish-to-child flag
   */
  async togglePublish(id: number): Promise<VideoDownload> {
    const task = await this.findById(id);
    task.publishedToChild = !task.publishedToChild;
    return this.repo.save(task);
  }

  /**
   * Delete a download (and file)
   */
  async deleteDownload(id: number): Promise<void> {
    const task = await this.findById(id);

    // Delete file if exists
    if (task.filePath) {
      const fullPath = path.join(PUBLIC_DIR, task.filePath.replace(/^\//, ''));
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        this.logger.log(`Deleted file: ${fullPath}`);
      }
    }

    await this.repo.delete(id);
  }

  /**
   * Retry a failed download
   */
  async retryDownload(id: number): Promise<VideoDownload> {
    const task = await this.findById(id);
    if (task.status !== 'failed') {
      throw new Error('Only failed downloads can be retried');
    }

    await this.repo.update(id, { status: 'pending', errorMessage: null });

    // Restart download
    this.performDownload(id, task.sourceUrl).catch((err) => {
      this.logger.error(`Retry download failed for task ${id}: ${err.message}`);
    });

    return this.findById(id);
  }

  /**
   * Detect platform from URL
   */
  private detectPlatform(url: string): string {
    const lower = url.toLowerCase();
    if (lower.includes('douyin') || lower.includes('iesdouyin')) return 'douyin';
    if (lower.includes('bilibili') || lower.includes('b23.tv')) return 'bilibili';
    if (lower.includes('v.qq.com') || lower.includes('tencent')) return 'tencent';
    if (lower.includes('youtube') || lower.includes('youtu.be')) return 'youtube';
    if (lower.includes('weibo')) return 'weibo';
    if (lower.includes('kuaishou')) return 'kuaishou';
    return 'unknown';
  }
}
