import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
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
const FFMPEG_BIN = process.env.FFMPEG_BIN || path.join(FFMPEG_DIR, 'ffmpeg');
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/snap/bin/chromium';
// Higgsfield HLS 默认清晰度（长片默认 720p，体积/下载时间平衡；可用 quality 覆盖）
const HIGGSFIELD_DEFAULT_QUALITY = '720p';
// 跨境平台(YouTube/X/Twitter/TikTok等)直连被 GFW 阻断，yt-dlp 必须走代理才能访问。
// 20172 是 v2rayA 规则口(国内直连+海外代理)；设为空字符串禁用代理。
const YTDLP_PROXY = process.env.YTDLP_PROXY || 'http://127.0.0.1:20172';

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
    const args = ['--dump-json', '--no-warnings', '--no-playlist', '--ffmpeg-location', FFMPEG_DIR];
    // 跨境走代理慢/易抖，放宽 socket 超时 + 重试
    args.push('--socket-timeout', '60', '--retries', '10');
    if (YTDLP_PROXY) args.push('--proxy', YTDLP_PROXY);
    args.push(url);
    const { stdout } = await execFileAsync(YTDLP_BIN, args, {
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
      env: {
        ...process.env,
        PATH: `/usr/bin:${process.env.HOME}/.local/bin:${process.env.PATH}`,
      },
    });

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
    quality?: string,
  ): Promise<VideoDownload> {
    // Extract URL from possible share text (Douyin/Bilibili share messages contain extra text)
    const url = this.extractUrlFromText(rawInput);

    // Validate that we got a real URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      throw new BadRequestException('请输入有效的视频链接');
    }

    const isDouyin = this.isDouyinUrl(url);
    const isHiggsfield = this.isHiggsfieldUrl(url);

    // First extract metadata
    let info: Partial<VideoDownload> = {};
    try {
      if (isDouyin) {
        info = await this.extractDouyinInfo(url);
      } else if (isHiggsfield) {
        info = await this.extractHiggsfieldInfo(url);
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
    } else if (isHiggsfield) {
      this.performHiggsfieldDownload(saved.id, url, quality).catch((err) => {
        this.logger.error(
          `Background higgsfield download failed for task ${saved.id}: ${err.message}`,
        );
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

      const args = [
        '--no-warnings',
        '--no-playlist',
        '--socket-timeout',
        '60',
        '--retries',
        '10',
        '--fragment-retries',
        '10',
        '-f',
        // 强制选 h264(avc1) 视频，兼容手机 Safari/所有浏览器播放。
        // yt-dlp 默认 best 会优先选 av1/vp9(更"高效"但 iOS 不一定能硬解)。
        // 音频优先 aac(mp4a)，拿不到(如推特 HLS 音频 codec 报 unknown)则回退任意。
        // 用 bv(视频-only, 不带*)而非 bv*——后者会匹配到合并格式(如 YT 的 18 流)，
        // 而这些 progressive 合并流常被 403 直接下载失败；DASH/HLS 分轨下载稳定。
        'bv[vcodec^=avc1]+(ba[acodec^=mp4a]/ba)/b[vcodec^=avc1]/best',
        '--merge-output-format',
        'mp4',
        '--ffmpeg-location',
        FFMPEG_DIR,
        '-o',
        outputPath,
        '--no-part',
      ];
      if (YTDLP_PROXY) args.push('--proxy', YTDLP_PROXY);
      args.push(url);

      const { stderr } = await execFileAsync(YTDLP_BIN, args, {
        timeout: 30 * 60 * 1000, // 30 min（跨境视频走代理，速度慢）
        maxBuffer: 10 * 1024 * 1024,
        env: {
          ...process.env,
          PATH: `/usr/bin:${process.env.HOME}/.local/bin:${process.env.PATH}`,
        },
      });

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
   * Toggle publish-to-child flag, optionally set childId
   */
  async togglePublish(id: number, childId?: number): Promise<VideoDownload> {
    const task = await this.findById(id);
    task.publishedToChild = !task.publishedToChild;
    if (childId != null) {
      task.childId = childId;
    }
    return this.repo.save(task);
  }

  /**
   * Batch delete downloads
   */
  async batchDelete(ids: number[]): Promise<void> {
    // Delete files first
    for (const id of ids) {
      const task = await this.repo.findOne({ where: { id } });
      if (task?.filePath) {
        const fullPath = path.join(PUBLIC_DIR, task.filePath.replace(/^\//, ''));
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      }
    }
    await this.repo.delete(ids);
    this.logger.log(`Batch deleted ${ids.length} downloads`);
  }

  /**
   * Batch retry failed downloads
   */
  async batchRetry(ids: number[]): Promise<VideoDownload[]> {
    const results: VideoDownload[] = [];
    for (const id of ids) {
      const task = await this.repo.findOne({ where: { id } });
      if (!task || task.status !== 'failed') continue;
      await this.repo.update(id, { status: 'pending', errorMessage: null });
      if (this.isDouyinUrl(task.sourceUrl)) {
        this.performDouyinDownload(id, task.sourceUrl).catch((err) => {
          this.logger.error(`Batch retry douyin failed for task ${id}: ${err.message}`);
        });
      } else if (this.isHiggsfieldUrl(task.sourceUrl)) {
        this.performHiggsfieldDownload(id, task.sourceUrl).catch((err) => {
          this.logger.error(`Batch retry higgsfield failed for task ${id}: ${err.message}`);
        });
      } else {
        this.performDownload(id, task.sourceUrl).catch((err) => {
          this.logger.error(`Batch retry failed for task ${id}: ${err.message}`);
        });
      }
      const updated = await this.repo.findOne({ where: { id } });
      if (updated) results.push(updated);
    }
    return results;
  }

  /**
   * Batch toggle publish to a specific child
   */
  async batchTogglePublish(ids: number[], childId: number): Promise<VideoDownload[]> {
    // Set all to published=true, and set childId
    await this.repo.update(ids, { publishedToChild: true, childId });
    // Return the updated records
    const updated = await this.repo.find({ where: { id: In(ids) } });
    this.logger.log(`Batch published ${ids.length} videos to child ${childId}`);
    return updated;
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
    } else if (this.isHiggsfieldUrl(task.sourceUrl)) {
      this.performHiggsfieldDownload(id, task.sourceUrl).catch((err) => {
        this.logger.error(`Retry higgsfield download failed for task ${id}: ${err.message}`);
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
    } else if (this.isHiggsfieldUrl(url)) {
      this.performHiggsfieldDownload(id, url).catch((err) => {
        this.logger.error(`Re-download (higgsfield) failed for task ${id}: ${err.message}`);
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
   * Check if URL is a Higgsfield link
   */
  private isHiggsfieldUrl(url: string): boolean {
    return url.toLowerCase().includes('higgsfield.ai');
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
   * Extract Douyin video metadata using Puppeteer in-process (headless Chromium).
   * Calls the Douyin API from a real browser context to bypass X-Bogus requirement.
   */
  private async extractDouyinInfo(url: string): Promise<Partial<VideoDownload>> {
    try {
      const videoData = await this.fetchDouyinVideoData(url);
      this.logger.log(`Douyin info extracted via puppeteer: title=${videoData.desc}`);
      return {
        title: videoData.desc || url,
        thumbnail: videoData.thumbnail || null,
        uploader: videoData.author || null,
        duration: videoData.duration || null,
        platform: 'douyin',
      };
    } catch (err) {
      this.logger.warn(`Puppeteer extractDouyinInfo failed for ${url}: ${(err as Error).message}`);
      const videoId = await this.resolveDouyinUrl(url).catch(() => null);
      return {
        title: videoId ? `抖音视频 ${videoId}` : url,
        uploader: null,
        platform: 'douyin',
      };
    }
  }

  /**
   * Download Douyin video using Puppeteer in-process (headless Chromium).
   */
  private async performDouyinDownload(taskId: number, url: string): Promise<void> {
    const task = await this.repo.findOne({ where: { id: taskId } });
    if (!task) return;

    try {
      await this.repo.update(taskId, { status: 'downloading' });

      const filename = `video_${taskId}_${Date.now()}.mp4`;
      const outputPath = path.join(UPLOADS_DIR, filename);
      const relativePath = `/uploads/videos/${filename}`;

      this.logger.log(`Starting douyin download via puppeteer: task=${taskId} url=${url}`);

      const videoData = await this.fetchDouyinVideoData(url);
      const downloadUrl = videoData.play_addr || videoData.bit_rate;
      if (!downloadUrl) {
        throw new Error('No playable URL found from Douyin API');
      }

      this.logger.log(`Downloading from CDN: ${downloadUrl.slice(0, 80)}...`);
      await this.downloadFile(downloadUrl, outputPath, {
        Referer: 'https://www.douyin.com/',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      });

      if (!fs.existsSync(outputPath)) {
        throw new Error('Download completed but file not found');
      }

      const stats = fs.statSync(outputPath);
      if (stats.size < 10000) {
        throw new Error(`Downloaded file too small: ${stats.size} bytes`);
      }

      // Update uploader/title/thumbnail from the fresh video data,
      // in case the initial metadata extraction (extractDouyinInfo) failed
      await this.repo.update(taskId, {
        status: 'completed',
        filePath: relativePath,
        fileSize: stats.size,
        uploader: videoData.author || null,
        title: videoData.desc || task.title,
        thumbnail: videoData.thumbnail || task.thumbnail,
        duration: videoData.duration || task.duration,
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
   * Launch headless Chromium, navigate to Douyin video page, call internal API, return video data.
   */
  private async fetchDouyinVideoData(url: string): Promise<{
    desc: string;
    play_addr: string;
    bit_rate: string;
    thumbnail: string;
    author: string;
    duration: number;
    width: number;
    height: number;
    has_watermark: boolean;
  }> {
    const videoId = await this.resolveDouyinUrl(url).catch(() => null);
    const videoUrl = videoId ? `https://www.douyin.com/video/${videoId}` : url;

    // Dynamic import — puppeteer-extra with stealth plugin bypasses Douyin's headless detection
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const puppeteer = require('puppeteer-extra');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteer.use(StealthPlugin());

    const browser = await puppeteer.launch({
      executablePath: CHROMIUM_PATH,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
      ],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });

      // Navigate and wait for page to settle
      await page.goto(videoUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      // Wait for the page to fully initialize and trigger API calls
      await new Promise((r) => setTimeout(r, 6000));

      // Call the API from the browser context (with credentials from the page session)
      const json = await page.evaluate(async (id) => {
        const r = await fetch(`https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${id}`, {
          credentials: 'include',
          headers: { Accept: 'application/json, text/plain, */*' },
        });
        return r.json();
      }, videoId);

      const item = json.aweme_detail;
      if (!item) {
        throw new Error(`API error: no aweme_detail, status_code=${json.status_code}`);
      }
      const v = item.video;
      const author = item.author || {};
      return {
        desc: item.desc || '',
        play_addr: v.play_addr?.url_list?.[0] || '',
        bit_rate: v.bit_rate?.[0]?.play_addr?.url_list?.[0] || '',
        has_watermark: !!v.has_watermark,
        width: v.width || 0,
        height: v.height || 0,
        duration: v.duration || 0,
        thumbnail: v.origin_cover?.url_list?.[0] || v.dynamic_cover?.url_list?.[0] || '',
        author: author.nickname || '',
      };
    } finally {
      await browser.close().catch(() => {});
    }
  }

  // ============ Higgsfield (higgsfield.ai) specific methods ============

  /**
   * Fetch a Higgsfield project page and parse the embedded video source + metadata.
   * Higgsfield is a TanStack SSR app — the HLS (.m3u8) URL and metadata are embedded
   * in the server-rendered HTML, so a plain HTTP GET (no browser) is sufficient.
   */
  private async fetchHiggsfieldVideoData(url: string): Promise<{
    m3u8: string;
    title: string;
    thumbnail: string;
    uploader: string;
    duration: number;
    width: number;
    height: number;
  }> {
    const html = await this.fetchUrl(url, {});

    const m3u8Match = html.match(/https:\/\/cdn\.higgsfield\.ai\/hls\/[^"\\]+\.m3u8/);
    if (!m3u8Match) {
      throw new Error('未在页面中找到视频源（该项目可能不是视频，或需要登录后才能查看）');
    }

    // Title: the video object's name field immediately precedes kind:"video"
    let title = '';
    const nameVideo = html.match(/name:"([^"]+)",kind:"video"/);
    if (nameVideo) title = nameVideo[1];
    if (!title) {
      const titleMatch = html.match(/title:"([^"]+)"/);
      if (titleMatch) title = titleMatch[1].split(' | ')[0];
    }

    const thumbMatch = html.match(/thumbnail:"([^"]+)"/);
    const userMatch = html.match(/username:"([^"]+)"/);
    const durMatch = html.match(/durationSeconds:([\d.]+)/);
    const whMatch = html.match(/width:(\d+),height:(\d+)/);

    return {
      m3u8: m3u8Match[0],
      title: title || url,
      thumbnail: thumbMatch ? thumbMatch[1] : '',
      uploader: userMatch ? userMatch[1] : '',
      duration: durMatch ? parseFloat(durMatch[1]) : null,
      width: whMatch ? parseInt(whMatch[1], 10) : 0,
      height: whMatch ? parseInt(whMatch[2], 10) : 0,
    };
  }

  /**
   * Fetch the HLS master playlist and select a variant by requested quality.
   * quality: 'best' | '2160p' | '1716p' | '1440p' | '1080p' | '720p' | '480p'
   */
  private async selectHiggsfieldVariant(masterM3u8: string, quality?: string): Promise<string> {
    const playlist = await this.fetchUrl(masterM3u8, {});
    const lines = playlist.split('\n').map((l) => l.trim());

    interface Variant {
      bandwidth: number;
      resolution: string;
      height: number;
      url: string;
    }
    const variants: Variant[] = [];
    let current: { bandwidth: number; resolution: string; height: number } | null = null;

    for (const line of lines) {
      if (line.startsWith('#EXT-X-STREAM-INF')) {
        const bw = parseInt(line.match(/BANDWIDTH=(\d+)/)?.[1] || '0', 10);
        const res = line.match(/RESOLUTION=(\d+)x(\d+)/);
        current = {
          bandwidth: bw,
          resolution: res ? `${res[1]}x${res[2]}` : '',
          height: res ? parseInt(res[2], 10) : 0,
        };
      } else if (line && !line.startsWith('#') && current) {
        const base = masterM3u8.slice(0, masterM3u8.lastIndexOf('/') + 1);
        variants.push({ ...current, url: new URL(line, base).toString() });
        current = null;
      }
    }

    if (variants.length === 0) {
      // Single-quality stream (no master variants) — download it directly
      return masterM3u8;
    }

    // Highest bitrate first
    variants.sort((a, b) => b.bandwidth - a.bandwidth);

    const q = (quality || HIGGSFIELD_DEFAULT_QUALITY).toLowerCase();
    if (!q || q === 'best') {
      return variants[0].url;
    }

    const targetHeight = parseInt(q.replace(/[^\d]/g, ''), 10);
    if (!targetHeight) return variants[0].url;

    // Prefer a variant at or below the requested height, closest to it
    const chosen = variants.find((v) => v.height > 0 && v.height <= targetHeight);
    return chosen ? chosen.url : variants[variants.length - 1].url;
  }

  /**
   * Extract Higgsfield metadata (used for the pre-download DB record).
   */
  private async extractHiggsfieldInfo(url: string): Promise<Partial<VideoDownload>> {
    try {
      const videoData = await this.fetchHiggsfieldVideoData(url);
      this.logger.log(`Higgsfield info extracted: title=${videoData.title}`);
      return {
        title: videoData.title || url,
        thumbnail: videoData.thumbnail || null,
        uploader: videoData.uploader || null,
        duration: videoData.duration || null,
        platform: 'higgsfield',
      };
    } catch (err) {
      this.logger.warn(`Higgsfield extractInfo failed for ${url}: ${(err as Error).message}`);
      return { title: url, platform: 'higgsfield' };
    }
  }

  /**
   * Download a Higgsfield HLS video to mp4 using ffmpeg (container copy, no re-encode).
   */
  private async performHiggsfieldDownload(
    taskId: number,
    url: string,
    quality?: string,
  ): Promise<void> {
    const task = await this.repo.findOne({ where: { id: taskId } });
    if (!task) return;

    try {
      await this.repo.update(taskId, { status: 'downloading' });

      const videoData = await this.fetchHiggsfieldVideoData(url);
      const targetM3u8 = await this.selectHiggsfieldVariant(videoData.m3u8, quality);

      const filename = `video_${taskId}_${Date.now()}.mp4`;
      const outputPath = path.join(UPLOADS_DIR, filename);
      const relativePath = `/uploads/videos/${filename}`;

      this.logger.log(
        `Starting higgsfield download: task=${taskId} quality=${
          quality || HIGGSFIELD_DEFAULT_QUALITY
        } → ${targetM3u8}`,
      );

      // Copy HLS segments into an mp4 container without re-encoding
      await execFileAsync(
        FFMPEG_BIN,
        [
          '-y',
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          targetM3u8,
          '-c',
          'copy',
          '-bsf:a',
          'aac_adtstoasc',
          '-movflags',
          '+faststart',
          outputPath,
        ],
        { timeout: 30 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 },
      );

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
        uploader: videoData.uploader || task.uploader || null,
        title: videoData.title || task.title,
        thumbnail: videoData.thumbnail || task.thumbnail || null,
        duration: videoData.duration || task.duration || null,
      });

      this.logger.log(
        `Higgsfield download completed: task=${taskId} size=${stats.size} → ${relativePath}`,
      );
    } catch (err) {
      const errorMsg = (err as Error).message.slice(0, 1000);
      this.logger.error(`Higgsfield download failed for task ${taskId}: ${errorMsg}`);
      await this.repo.update(taskId, { status: 'failed', errorMessage: errorMsg });
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
      } else if (this.isHiggsfieldUrl(url)) {
        info = await this.extractHiggsfieldInfo(url);
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
    } else if (this.isHiggsfieldUrl(url)) {
      this.performHiggsfieldDownload(id, url).catch((err) => {
        this.logger.error(`Update-url higgsfield download failed for task ${id}: ${err.message}`);
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
    if (lower.includes('higgsfield')) return 'higgsfield';
    if (lower.includes('bilibili') || lower.includes('b23.tv')) return 'bilibili';
    if (lower.includes('v.qq.com') || lower.includes('tencent')) return 'tencent';
    if (lower.includes('youtube') || lower.includes('youtu.be')) return 'youtube';
    if (
      lower.includes('x.com') ||
      lower.includes('twitter.com') ||
      lower.includes('t.co') ||
      lower.includes('fixupx.com') ||
      lower.includes('vxtwitter.com')
    )
      return 'twitter';
    if (lower.includes('tiktok.com')) return 'tiktok';
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
