import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as https from 'https';
import * as http from 'http';
import { VideoDownload } from '../../database/entities/video-download.entity';

const execFileAsync = promisify(execFile);

const YTDLP_BIN = process.env.YTDLP_BIN || '/home/zxq/.local/bin/yt-dlp';
const FFMPEG_DIR = process.env.FFMPEG_DIR || '/usr/bin';

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
const PC_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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
   * Extract the first valid URL from arbitrary text (e.g. Douyin/Bilibili share text)
   * Handles formats like:
   *   "7.17 复制打开抖音，看看【xxx的作品】... https://v.douyin.com/wql9Ylpwlz8/ ZzT:/ y@t.rE"
   *   "https://www.bilibili.com/video/BV1GJ411x7h7"
   */
  private extractUrlFromText(text: string): string {
    // Match http(s) URLs, including those with trailing slashes and paths
    const urlMatch = text.match(/https?:\/\/[^\s<>"]+/i);
    if (urlMatch) {
      return urlMatch[0];
    }
    // If no http(s) URL found, return original text (might be a plain URL)
    return text.trim();
  }

  /**
   * Create a new download task and start downloading in the background
   */
  async createDownload(
    parentId: number,
    rawInput: string,
    childId?: number,
  ): Promise<VideoDownload> {
    // Extract URL from possible share text (Douyin/Bilibili share messages contain extra text)
    const url = this.extractUrlFromText(rawInput);

    // Validate that we got a real URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      throw new BadRequestException('请输入有效的视频链接');
    }

    const isDouyin = this.isDouyinUrl(url);

    // First extract metadata
    let info: Partial<VideoDownload> = {};
    try {
      if (isDouyin) {
        info = await this.extractDouyinInfo(url);
      } else {
        info = await this.extractInfo(url);
      }
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
    if (isDouyin) {
      this.performDouyinDownload(saved.id, url).catch((err) => {
        this.logger.error(`Background douyin download failed for task ${saved.id}: ${err.message}`);
      });
    } else {
      this.performDownload(saved.id, url).catch((err) => {
        this.logger.error(`Background download failed for task ${saved.id}: ${err.message}`);
      });
    }

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
    if (this.isDouyinUrl(task.sourceUrl)) {
      this.performDouyinDownload(id, task.sourceUrl).catch((err) => {
        this.logger.error(`Retry douyin download failed for task ${id}: ${err.message}`);
      });
    } else {
      this.performDownload(id, task.sourceUrl).catch((err) => {
        this.logger.error(`Retry download failed for task ${id}: ${err.message}`);
      });
    }

    return this.findById(id);
  }

  /**
   * Cancel a stuck download (pending or downloading → failed)
   */
  async cancelDownload(id: number): Promise<VideoDownload> {
    const task = await this.findById(id);
    if (task.status !== 'pending' && task.status !== 'downloading') {
      throw new Error('Only pending or downloading tasks can be cancelled');
    }

    await this.repo.update(id, {
      status: 'failed',
      errorMessage: '用户已取消下载',
    });

    return this.findById(id);
  }

  /**
   * Re-download a video — even if status is 'completed' but the file is missing.
   * If the file already exists and is valid, returns the existing task as-is.
   * If the file is missing (deleted/cleaned up), re-downloads from the original source URL.
   */
  async reDownload(id: number): Promise<VideoDownload> {
    const task = await this.findById(id);

    // Check if file already exists and is valid
    if (task.filePath) {
      const fullPath = path.join(PUBLIC_DIR, task.filePath.replace(/^\//, ''));
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).size > 10000) {
        this.logger.log(`Re-download skipped: file already exists for task ${id}`);
        return task;
      }
    }

    // File is missing — re-download
    this.logger.log(
      `Re-downloading: task=${id} file missing, restarting download from ${task.sourceUrl}`,
    );

    await this.repo.update(id, {
      status: 'pending',
      filePath: null,
      fileSize: null,
      errorMessage: null,
    });

    // Re-download in background
    const url = task.sourceUrl;
    if (this.isDouyinUrl(url)) {
      this.performDouyinDownload(id, url).catch((err) => {
        this.logger.error(`Re-download (douyin) failed for task ${id}: ${err.message}`);
      });
    } else {
      this.performDownload(id, url).catch((err) => {
        this.logger.error(`Re-download failed for task ${id}: ${err.message}`);
      });
    }

    return this.findById(id);
  }

  // ============ Douyin (TikTok China) specific methods ============

  /**
   * Check if URL is a Douyin link
   */
  private isDouyinUrl(url: string): boolean {
    const lower = url.toLowerCase();
    return (
      lower.includes('douyin.com') ||
      lower.includes('iesdouyin.com') ||
      lower.includes('v.douyin.com')
    );
  }

  /**
   * Resolve short URL (v.douyin.com/xxx) to get the real video ID
   */
  private async resolveDouyinUrl(url: string): Promise<string> {
    // If URL already has the video ID, extract it
    const idMatch = url.match(/\/video\/(\d+)/);
    if (idMatch) return idMatch[1];

    // For short URLs, follow redirect to get the full URL
    return new Promise<string>((resolve, reject) => {
      const req = https.get(
        url,
        {
          headers: { 'User-Agent': PC_UA },
        },
        (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            const location = res.headers.location || '';
            const idMatch2 = location.match(/\/video\/(\d+)/);
            if (idMatch2) {
              resolve(idMatch2[1]);
              return;
            }
          }
          reject(new Error(`Could not resolve Douyin URL: ${url}`));
        },
      );
      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Douyin URL resolve timeout'));
      });
    });
  }

  /**
   * Fetch a URL and return body as string (following redirects)
   */
  private fetchUrl(url: string, headers: Record<string, string>): Promise<string> {
    return new Promise((resolve, reject) => {
      const mod = url.startsWith('https') ? https : http;
      const req = mod.get(url, { headers: { 'User-Agent': MOBILE_UA, ...headers } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          this.fetchUrl(res.headers.location || '', headers)
            .then(resolve)
            .catch(reject);
          return;
        }
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve(body));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('Fetch timeout'));
      });
    });
  }

  /**
   * Download a file to a local path
   */
  private downloadFile(
    url: string,
    outputPath: string,
    headers: Record<string, string>,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(outputPath);
      const mod = url.startsWith('https') ? https : http;

      const doRequest = (targetUrl: string) => {
        const req = mod.get(
          targetUrl,
          { headers: { 'User-Agent': MOBILE_UA, ...headers } },
          (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
              res.resume();
              doRequest(res.headers.location || '');
              return;
            }
            if (res.statusCode !== 200) {
              res.resume();
              reject(new Error(`HTTP ${res.statusCode}`));
              return;
            }
            res.pipe(file);
            file.on('finish', () => {
              file.close();
              resolve();
            });
            file.on('error', reject);
          },
        );
        req.on('error', reject);
        req.setTimeout(60000, () => {
          req.destroy();
          reject(new Error('Download timeout'));
        });
      };

      doRequest(url);
    });
  }

  /**
   * Extract Douyin video metadata without yt-dlp (bypasses cookie requirement)
   */
  private async extractDouyinInfo(url: string): Promise<Partial<VideoDownload>> {
    const videoId = await this.resolveDouyinUrl(url);
    const shareUrl = `https://www.iesdouyin.com/share/video/${videoId}/`;

    const html = await this.fetchUrl(shareUrl, {
      Referer: 'https://www.iesdouyin.com/',
    });

    // Extract video info from the embedded JSON in the page
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const descMatch = html.match(/"desc":"([^"]+)"/);
    const uploaderMatch = html.match(/"nickname":"([^"]+)"/);

    const title = descMatch?.[1] || titleMatch?.[1] || url;
    const uploader = uploaderMatch?.[1] || null;

    this.logger.log(`Douyin info extracted: videoId=${videoId} title=${title}`);

    return {
      title,
      uploader,
      platform: 'douyin',
      // thumbnail can also be extracted if needed
    };
  }

  /**
   * Download Douyin video without watermark using mobile share API
   * Bypasses yt-dlp cookie requirement
   */
  private async performDouyinDownload(taskId: number, url: string): Promise<void> {
    const task = await this.repo.findOne({ where: { id: taskId } });
    if (!task) return;

    try {
      await this.repo.update(taskId, { status: 'downloading' });

      const videoId = await this.resolveDouyinUrl(url);
      this.logger.log(`Douyin download: task=${taskId} videoId=${videoId}`);

      // Get the share page to extract video URI
      const shareUrl = `https://www.iesdouyin.com/share/video/${videoId}/`;
      const html = await this.fetchUrl(shareUrl, {
        Referer: 'https://www.iesdouyin.com/',
      });

      // Extract video URI
      const uriMatch = html.match(/"play_addr":\{"uri":"([^"]+)"/);
      if (!uriMatch) {
        throw new Error('Could not extract video URI from Douyin share page');
      }
      const videoUri = uriMatch[1];

      // Build no-watermark URL: use /play/ instead of /playwm/
      const noWatermarkUrl = `https://aweme.snssdk.com/aweme/v1/play/?line=0&ratio=720p&video_id=${videoUri}`;

      const filename = `video_${taskId}_${Date.now()}.mp4`;
      const outputPath = path.join(UPLOADS_DIR, filename);
      const relativePath = `/uploads/videos/${filename}`;

      this.logger.log(`Downloading douyin video: task=${taskId} → ${outputPath}`);

      await this.downloadFile(noWatermarkUrl, outputPath, {
        Referer: 'https://www.iesdouyin.com/',
      });

      // Verify file exists and has content
      if (!fs.existsSync(outputPath)) {
        throw new Error('Download completed but file not found');
      }

      const stats = fs.statSync(outputPath);
      if (stats.size < 10000) {
        throw new Error(`Downloaded file too small: ${stats.size} bytes`);
      }

      await this.repo.update(taskId, {
        status: 'completed',
        filePath: relativePath,
        fileSize: stats.size,
      });

      this.logger.log(
        `Douyin download completed: task=${taskId} size=${stats.size} → ${relativePath}`,
      );
    } catch (err) {
      const errorMsg = (err as Error).message.slice(0, 1000);
      this.logger.error(`Douyin download failed for task ${taskId}: ${errorMsg}`);
      await this.repo.update(taskId, {
        status: 'failed',
        errorMessage: errorMsg,
      });
    }
  }

  /**
   * Update a failed download's source URL and restart download
   */
  async updateUrl(id: number, newUrl: string): Promise<VideoDownload> {
    const task = await this.findById(id);
    if (task.status !== 'failed') {
      throw new BadRequestException('Only failed downloads can be updated');
    }

    // Extract URL from possible share text (same as createDownload)
    const url = this.extractUrlFromText(newUrl);
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      throw new BadRequestException('请输入有效的视频链接');
    }

    // Re-extract metadata for the new URL
    let info: Partial<VideoDownload> = {};
    try {
      if (this.isDouyinUrl(url)) {
        info = await this.extractDouyinInfo(url);
      } else {
        info = await this.extractInfo(url);
      }
    } catch (err) {
      this.logger.warn(`Failed to extract info for updated URL ${url}: ${(err as Error).message}`);
    }

    // Update the record
    await this.repo.update(id, {
      sourceUrl: url,
      title: info.title || url,
      thumbnail: info.thumbnail || null,
      uploader: info.uploader || null,
      duration: info.duration || null,
      platform: info.platform || this.detectPlatform(url),
      status: 'pending',
      errorMessage: null,
      filePath: null,
      fileSize: null,
    });

    // Restart download in background
    if (this.isDouyinUrl(url)) {
      this.performDouyinDownload(id, url).catch((err) => {
        this.logger.error(`Update-url douyin download failed for task ${id}: ${err.message}`);
      });
    } else {
      this.performDownload(id, url).catch((err) => {
        this.logger.error(`Update-url download failed for task ${id}: ${err.message}`);
      });
    }

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
    if (lower.includes('toutiao')) return 'toutiao';
    if (lower.includes('ixigua')) return 'ixigua';
    if (lower.includes('xiaohongshu')) return 'xiaohongshu';
    if (lower.includes('youku')) return 'youku';
    if (lower.includes('iqiyi')) return 'iqiyi';
    if (lower.includes('sohu')) return 'sohu';
    if (lower.includes('acfun') || lower.includes('acplay')) return 'acfun';
    return 'unknown';
  }
}
