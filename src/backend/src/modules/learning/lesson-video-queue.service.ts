import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Repository } from 'typeorm';
import { Content } from '../../database/entities/content.entity';
import { VideoGenerationTask } from '../../database/entities/video-generation-task.entity';
import { AiService } from '../ai/ai.service';
import { RemotionRenderService } from './remotion-render.service';

type ProviderStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'unknown';

@Injectable()
export class LessonVideoQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LessonVideoQueueService.name);
  private queueTimer: NodeJS.Timeout | null = null;
  private workerBusy = false;
  private cleanupTick = 0;

  private readonly pollIntervalMs = this.toInt(process.env.VIDEO_TASK_POLL_INTERVAL_MS, 3000, 1000, 20000);
  private readonly providerPollIntervalMs = this.toInt(process.env.VIDEO_PROVIDER_POLL_MS, 2500, 500, 20000);
  private readonly providerPollMaxTimes = this.toInt(process.env.VIDEO_PROVIDER_POLL_MAX_TIMES, 120, 5, 1000);
  private readonly cacheTtlHours = this.toInt(process.env.VIDEO_CACHE_TTL_HOURS, 72, 1, 24 * 30);
  private readonly maxRetries = this.toInt(process.env.VIDEO_TASK_MAX_RETRIES, 2, 0, 5);
  private readonly providerRequestTimeoutMs = this.toInt(process.env.VIDEO_PROVIDER_REQUEST_TIMEOUT_MS, 20000, 1000, 120000);
  private readonly downloadTimeoutMs = this.toInt(process.env.VIDEO_PROVIDER_DOWNLOAD_TIMEOUT_MS, 45000, 1000, 180000);
  private readonly downloadMaxBytes =
    this.toInt(process.env.VIDEO_PROVIDER_DOWNLOAD_MAX_MB, 80, 5, 1024) * 1024 * 1024;
  private readonly allowHttpDownload = this.toBool(process.env.VIDEO_PROVIDER_ALLOW_HTTP_DOWNLOAD, false);
  private readonly allowPrivateDownloadHosts = this.toBool(
    process.env.VIDEO_PROVIDER_ALLOW_PRIVATE_DOWNLOAD_HOSTS,
    false,
  );
  private readonly downloadHostAllowlist = this.parseCsv(process.env.VIDEO_PROVIDER_DOWNLOAD_HOST_ALLOWLIST);
  private readonly createVideoUrlPaths = this.resolvePathList('VIDEO_PROVIDER_CREATE_VIDEO_URL_PATHS', [
    'videoUrl',
    'url',
    'data.videoUrl',
    'result.videoUrl',
  ]);
  private readonly createTaskIdPaths = this.resolvePathList('VIDEO_PROVIDER_CREATE_TASK_ID_PATHS', [
    'taskId',
    'jobId',
    'id',
    'data.taskId',
    'data.id',
  ]);
  private readonly statusStatePaths = this.resolvePathList('VIDEO_PROVIDER_STATUS_STATE_PATHS', [
    'status',
    'state',
    'data.status',
    'result.status',
  ]);
  private readonly statusProgressPaths = this.resolvePathList('VIDEO_PROVIDER_STATUS_PROGRESS_PATHS', [
    'progress',
    'percent',
    'data.progress',
    'result.progress',
  ]);
  private readonly statusErrorPaths = this.resolvePathList('VIDEO_PROVIDER_STATUS_ERROR_PATHS', [
    'error',
    'message',
    'data.error',
    'result.error',
  ]);
  private readonly statusVideoUrlPaths = this.resolvePathList('VIDEO_PROVIDER_STATUS_VIDEO_URL_PATHS', [
    'videoUrl',
    'url',
    'downloadUrl',
    'data.videoUrl',
    'data.url',
    'result.videoUrl',
    'result.url',
  ]);
  private readonly extraProviderHeaders = this.parseHeaderMap(process.env.VIDEO_PROVIDER_EXTRA_HEADERS_JSON);
  private readonly storageDir = path.join(process.cwd(), 'storage', 'lesson-videos');

  constructor(
    @InjectRepository(VideoGenerationTask)
    private readonly taskRepo: Repository<VideoGenerationTask>,
    @InjectRepository(Content)
    private readonly contentRepo: Repository<Content>,
    private readonly aiService: AiService,
    private readonly remotionRender: RemotionRenderService,
  ) {}

  onModuleInit() {
    this.queueTimer = setInterval(() => {
      void this.processQueue();
    }, this.pollIntervalMs);
    this.logger.log(`Lesson video queue started (tick=${this.pollIntervalMs}ms)`);
  }

  onModuleDestroy() {
    if (this.queueTimer) {
      clearInterval(this.queueTimer);
      this.queueTimer = null;
    }
  }

  async enqueue(contentId: number, childId: number): Promise<VideoGenerationTask> {
    const content = await this.contentRepo.findOne({ where: { id: contentId } });
    if (!content) throw new NotFoundException('Content not found');

    const payload = this.buildPackPayloadFromContent(content);
    const cacheKey = this.computeCacheKey(content, payload);
    const reusable = await this.findReusableTask(contentId, childId, cacheKey);
    if (reusable) return reusable;

    const task = this.taskRepo.create({
      uuid: randomUUID(),
      contentId,
      childId,
      provider: this.resolveProviderName(),
      cacheKey,
      requestPayload: payload,
      status: 'pending',
      progress: 0,
      attemptCount: 0,
    });
    const saved = await this.taskRepo.save(task);
    this.logger.log(`Video task queued: taskId=${saved.id}, contentId=${contentId}`);
    return saved;
  }

  async getTask(contentId: number, taskId: number, childId: number): Promise<VideoGenerationTask> {
    const task = await this.taskRepo.findOne({
      where: { id: taskId, contentId, childId },
    });
    if (!task) throw new NotFoundException('Video task not found');
    return task;
  }

  async getLatestTask(contentId: number, childId: number): Promise<VideoGenerationTask | null> {
    return this.taskRepo.findOne({
      where: { contentId, childId },
      order: { createdAt: 'DESC' },
    });
  }

  async readVideoBuffer(task: VideoGenerationTask): Promise<Buffer> {
    if (task.status !== 'completed') {
      throw new NotFoundException('Video is not ready');
    }
    if (!task.localVideoPath) {
      throw new NotFoundException('Video file not found');
    }
    const resolvedPath = path.resolve(task.localVideoPath);
    return fs.readFile(resolvedPath);
  }

  private async processQueue(): Promise<void> {
    if (this.workerBusy) return;
    this.workerBusy = true;

    try {
      await this.processNextTask();
      this.cleanupTick += 1;
      if (this.cleanupTick % 120 === 0) {
        await this.cleanupExpiredCache();
      }
    } catch (error: any) {
      this.logger.warn(`Queue tick failed: ${error?.message || 'unknown'}`);
    } finally {
      this.workerBusy = false;
    }
  }

  private async processNextTask(): Promise<void> {
    const pending = await this.taskRepo.findOne({
      where: { status: 'pending' },
      order: { createdAt: 'ASC' },
    });
    if (!pending) return;

    const claimResult = await this.taskRepo
      .createQueryBuilder()
      .update(VideoGenerationTask)
      .set({
        status: 'processing',
        progress: 5,
        startedAt: new Date(),
        attemptCount: () => 'attemptCount + 1',
      } as any)
      .where('id = :id AND status = :status', { id: pending.id, status: 'pending' })
      .execute();

    if (!claimResult.affected) return;

    const task = await this.taskRepo.findOne({ where: { id: pending.id } });
    if (!task) return;

    this.logger.log(`Video task processing: taskId=${task.id}`);

    try {
      const payload = task.requestPayload || {};
      const { buffer, providerTaskId, sourceVideoUrl } = await this.generateVideoBuffer(task, payload);
      const localPath = await this.writeVideoToCache(task.cacheKey, buffer);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.cacheTtlHours * 3600 * 1000);

      task.status = 'completed';
      task.progress = 100;
      task.providerTaskId = providerTaskId || task.providerTaskId;
      task.sourceVideoUrl = sourceVideoUrl || task.sourceVideoUrl;
      task.localVideoPath = localPath;
      task.errorMessage = null;
      task.completedAt = now;
      task.expiresAt = expiresAt;
      task.approvalStatus = 'pending_approval';
      await this.taskRepo.save(task);
      this.logger.log(`Video task completed: taskId=${task.id}`);
    } catch (error: any) {
      const canRetry = (task.attemptCount || 0) <= this.maxRetries;
      task.status = canRetry ? 'pending' : 'failed';
      task.progress = 0;
      task.errorMessage = String(error?.message || 'video generation failed').slice(0, 500);
      await this.taskRepo.save(task);
      this.logger.warn(
        `Video task ${canRetry ? 're-queued' : 'failed'}: taskId=${task.id}, message=${task.errorMessage}`,
      );
    }
  }

  private async generateVideoBuffer(
    task: VideoGenerationTask,
    payload: Record<string, any>,
  ): Promise<{ buffer: Buffer; providerTaskId?: string | null; sourceVideoUrl?: string | null }> {
    // Try Remotion rendering first (local, high quality)
    try {
      const remotionBuffer = await this.generateByRemotion(task, payload);
      if (remotionBuffer) return { buffer: remotionBuffer };
    } catch (error: any) {
      this.logger.warn(`Remotion rendering failed, falling back: ${error?.message || 'unknown'}`);
    }

    // Try third-party API
    const thirdPartyEnabled = this.isThirdPartyEnabled();
    if (thirdPartyEnabled) {
      try {
        const thirdParty = await this.generateByThirdParty(task, payload);
        return thirdParty;
      } catch (error: any) {
        this.logger.warn(`Third-party video generation failed: ${error?.message || 'unknown'}`);
      }
    }

    // Final fallback: FFmpeg-based rendering
    const localBuffer = await this.aiService.renderTeachingVideoFromPack(payload);
    if (!localBuffer) throw new Error('TEACHING_VIDEO_UNAVAILABLE');
    return { buffer: localBuffer, providerTaskId: task.providerTaskId, sourceVideoUrl: null };
  }

  private async generateByRemotion(
    task: VideoGenerationTask,
    payload: Record<string, any>,
  ): Promise<Buffer | null> {
    const topic = payload?.topic || '';
    if (!topic) return null;

    const { compositionId, inputProps } = await this.remotionRender.resolveComposition(payload, payload?.ageGroup);

    const outputPath = path.join(this.storageDir, `${task.cacheKey}-remotion.mp4`);
    await fs.mkdir(this.storageDir, { recursive: true });

    await this.remotionRender.renderComposition(
      compositionId,
      inputProps,
      outputPath,
      async (percent: number) => {
        try {
          await this.taskRepo.update(task.id, { progress: Math.max(10, Math.min(95, percent)) });
        } catch {}
      },
    );

    const buffer = await fs.readFile(outputPath);
    // Cleanup intermediate file
    try { await fs.unlink(outputPath); } catch {}
    return buffer;
  }

  private async generateByThirdParty(
    task: VideoGenerationTask,
    payload: Record<string, any>,
  ): Promise<{ buffer: Buffer; providerTaskId?: string | null; sourceVideoUrl?: string | null }> {
    const createUrl = this.resolveProviderUrl(process.env.VIDEO_PROVIDER_CREATE_PATH || '/v1/video/tasks');
    const createBody = this.buildProviderCreateBody(task, payload);

    const createRes = await this.fetchWithTimeout(createUrl, {
      method: 'POST',
      headers: this.buildProviderHeaders(),
      body: JSON.stringify(createBody),
    }, this.providerRequestTimeoutMs);
    if (!createRes.ok) {
      throw new Error(`provider create failed: ${createRes.status}`);
    }

    const createJson = await this.safeParseJson(createRes);
    const directVideoUrl = this.pickFirstString(createJson, this.createVideoUrlPaths);
    if (directVideoUrl) {
      const buffer = await this.downloadRemoteVideo(directVideoUrl);
      return { buffer, providerTaskId: null, sourceVideoUrl: directVideoUrl };
    }

    const providerTaskId = this.pickFirstString(createJson, this.createTaskIdPaths);
    if (!providerTaskId) {
      throw new Error('provider taskId missing');
    }

    task.providerTaskId = providerTaskId;
    await this.taskRepo.save(task);

    const statusPathTemplate = process.env.VIDEO_PROVIDER_STATUS_PATH || '/v1/video/tasks/{taskId}';
    for (let i = 0; i < this.providerPollMaxTimes; i++) {
      await this.sleep(this.providerPollIntervalMs);
      const statusPath = statusPathTemplate.replace('{taskId}', encodeURIComponent(providerTaskId));
      const statusUrl = this.resolveProviderUrl(statusPath);
      const statusRes = await this.fetchWithTimeout(statusUrl, {
        method: 'GET',
        headers: this.buildProviderHeaders(),
      }, this.providerRequestTimeoutMs);
      if (!statusRes.ok) continue;

      const statusJson = await this.safeParseJson(statusRes);
      const providerStatus = this.normalizeProviderStatus(
        this.pickFirstString(statusJson, this.statusStatePaths),
      );

      const providerProgress = this.pickFirstNumber(statusJson, this.statusProgressPaths);
      if (Number.isFinite(providerProgress)) {
        await this.taskRepo.update(task.id, { progress: Math.max(10, Math.min(95, Math.trunc(providerProgress))) });
      }

      if (providerStatus === 'failed') {
        const errMsg = this.pickFirstString(statusJson, this.statusErrorPaths) || 'provider task failed';
        throw new Error(errMsg);
      }

      if (providerStatus === 'completed') {
        const url = this.pickFirstString(statusJson, this.statusVideoUrlPaths);
        if (!url) throw new Error('provider completed without video url');
        const buffer = await this.downloadRemoteVideo(url);
        return { buffer, providerTaskId, sourceVideoUrl: url };
      }
    }

    throw new Error('provider polling timeout');
  }

  private async downloadRemoteVideo(url: string): Promise<Buffer> {
    const downloadUrl = this.assertSafeDownloadUrl(url);
    const response = await this.fetchWithTimeout(downloadUrl, { method: 'GET' }, this.downloadTimeoutMs);
    if (!response.ok) throw new Error(`download video failed: ${response.status}`);

    const contentLength = Number(response.headers.get('content-length') || '');
    if (Number.isFinite(contentLength) && contentLength > this.downloadMaxBytes) {
      throw new Error(`download video too large: ${contentLength} bytes`);
    }

    const arr = await response.arrayBuffer();
    const buffer = Buffer.from(arr);
    if (buffer.length > this.downloadMaxBytes) {
      throw new Error(`download video exceeds limit: ${buffer.length} bytes`);
    }
    return buffer;
  }

  private async writeVideoToCache(cacheKey: string, buffer: Buffer): Promise<string> {
    await fs.mkdir(this.storageDir, { recursive: true });
    const target = path.join(this.storageDir, `${cacheKey}.mp4`);
    await fs.writeFile(target, buffer);
    return target;
  }

  private async cleanupExpiredCache(): Promise<void> {
    const now = new Date();
    const expired = await this.taskRepo.find({ where: { status: 'completed' } });
    for (const task of expired) {
      if (!task.expiresAt || task.expiresAt > now) continue;
      if (task.localVideoPath) {
        try {
          await fs.unlink(path.resolve(task.localVideoPath));
        } catch {}
      }
      await this.taskRepo.delete(task.id);
    }
  }

  private async findReusableTask(
    contentId: number,
    childId: number,
    cacheKey: string,
  ): Promise<VideoGenerationTask | null> {
    const task = await this.taskRepo.findOne({
      where: { contentId, childId, cacheKey },
      order: { createdAt: 'DESC' },
    });
    if (!task) return null;

    if (task.status === 'completed') {
      const isExpired = !task.expiresAt || task.expiresAt <= new Date();
      if (!isExpired && task.localVideoPath) {
        try {
          await fs.access(path.resolve(task.localVideoPath));
          return task;
        } catch {}
      }
    }

    if (task.status === 'processing' || task.status === 'pending') {
      return task;
    }

    if (task.status === 'failed' && (task.attemptCount || 0) <= this.maxRetries) {
      task.status = 'pending';
      task.errorMessage = null;
      task.progress = 0;
      return this.taskRepo.save(task);
    }

    return null;
  }

  private buildPackPayloadFromContent(content: Content): Record<string, any> {
    const raw = typeof content.content === 'string' ? this.tryParseJson(content.content) : content.content;
    const lesson = raw && typeof raw === 'object' ? raw : {};
    const steps = Array.isArray((lesson as any).steps) ? (lesson as any).steps : [];

    const stepModule = (id: string) => {
      const item = steps.find((s: any) => s?.id === id);
      return item?.module && typeof item.module === 'object' ? item.module : {};
    };

    const watch = stepModule('watch');
    const listen = stepModule('listen');
    const read = stepModule('read');
    const write = stepModule('write');
    const practice = stepModule('practice');
    const assess = stepModule('assess');

    return {
      title: content.title || (lesson as any).title || `${content.topic || '课程'} 全方位学习课`,
      topic: content.topic || (lesson as any).topic || '',
      summary: (lesson as any).summary || content.subtitle || '',
      ageGroup: (lesson as any).ageGroup || content.ageRange || undefined,
      watchScene: watch.scene || null,
      visualStory: watch.visualStory || {},
      videoLesson: watch.videoLesson || {},
      modules: {
        listening: listen.listening || {},
        reading: read.reading || {},
        writing: write.writing || {},
        game: practice.game || {},
        quiz: assess.quiz || {},
      },
    };
  }

  private computeCacheKey(content: Content, payload: Record<string, any>): string {
    const seed = JSON.stringify({
      contentId: content.id,
      updatedAt: content.updatedAt || '',
      payload,
    });
    return createHash('sha1').update(seed).digest('hex');
  }

  private resolveProviderName(): string {
    return String(process.env.VIDEO_PROVIDER_NAME || 'third_party').trim();
  }

  private isThirdPartyEnabled(): boolean {
    const baseUrl = String(process.env.VIDEO_PROVIDER_BASE_URL || '').trim();
    const mode = String(process.env.VIDEO_PROVIDER_MODE || 'hybrid').trim().toLowerCase();
    return !!baseUrl && mode !== 'off' && mode !== 'local_only';
  }

  private resolveProviderUrl(relativePath: string): string {
    const baseUrl = String(process.env.VIDEO_PROVIDER_BASE_URL || '').trim();
    if (!baseUrl) throw new Error('VIDEO_PROVIDER_BASE_URL not configured');
    return new URL(relativePath, baseUrl).toString();
  }

  private buildProviderHeaders(): Record<string, string> {
    const apiKey = String(process.env.VIDEO_PROVIDER_API_KEY || '').trim();
    return {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...this.extraProviderHeaders,
    };
  }

  private buildProviderCreateBody(
    task: VideoGenerationTask,
    payload: Record<string, any>,
  ): Record<string, any> {
    const mode = String(process.env.VIDEO_PROVIDER_CREATE_BODY_MODE || 'generic').trim().toLowerCase();

    if (mode === 'raw_payload') {
      return payload;
    }
    if (mode === 'wrapped_payload') {
      const inputKey = String(process.env.VIDEO_PROVIDER_CREATE_INPUT_KEY || 'input').trim() || 'input';
      return {
        [inputKey]: payload,
        metadata: {
          contentId: task.contentId,
          childId: task.childId,
          cacheKey: task.cacheKey,
        },
      };
    }

    return {
      title: payload.title,
      topic: payload.topic,
      summary: payload.summary,
      watchScene: payload.watchScene || null,
      visualStory: payload.visualStory || {},
      videoLesson: payload.videoLesson || {},
      modules: payload.modules || {},
      metadata: {
        contentId: task.contentId,
        childId: task.childId,
        cacheKey: task.cacheKey,
      },
    };
  }

  private assertSafeDownloadUrl(rawUrl: string): string {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error('invalid download url');
    }

    const protocol = parsed.protocol.toLowerCase();
    const allowHttp = this.allowHttpDownload;
    if (protocol !== 'https:' && !(allowHttp && protocol === 'http:')) {
      throw new Error(`download protocol not allowed: ${protocol}`);
    }

    const hostname = parsed.hostname.toLowerCase();
    if (!hostname) {
      throw new Error('download host missing');
    }

    if (this.downloadHostAllowlist.length > 0) {
      const allowed = this.downloadHostAllowlist.some((item) => {
        const normalized = item.toLowerCase();
        return hostname === normalized || hostname.endsWith(`.${normalized}`);
      });
      if (!allowed) {
        throw new Error(`download host not in allowlist: ${hostname}`);
      }
    }

    if (!this.allowPrivateDownloadHosts && this.isPrivateHost(hostname)) {
      throw new Error(`download host is private or local: ${hostname}`);
    }

    return parsed.toString();
  }

  private isPrivateHost(hostname: string): boolean {
    if (hostname === 'localhost' || hostname.endsWith('.local') || hostname === '0.0.0.0') {
      return true;
    }

    if (hostname === '::1' || hostname.startsWith('fe80:') || hostname.startsWith('fc') || hostname.startsWith('fd')) {
      return true;
    }

    const v4 = hostname.split('.').map((part) => Number(part));
    if (v4.length === 4 && v4.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
      const [a, b] = v4;
      if (a === 10 || a === 127 || a === 0) return true;
      if (a === 169 && b === 254) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
    }

    return false;
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new Error(`request timeout (${timeoutMs}ms)`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private normalizeProviderStatus(statusRaw?: string): ProviderStatus {
    const status = String(statusRaw || '').trim().toLowerCase();
    if (!status) return 'unknown';
    if (['queued', 'pending', 'waiting'].includes(status)) return 'queued';
    if (['running', 'processing', 'in_progress', 'started', 'progress'].includes(status)) return 'processing';
    if (['completed', 'done', 'success', 'succeeded', 'finished'].includes(status)) return 'completed';
    if (['failed', 'error', 'canceled', 'cancelled', 'timeout'].includes(status)) return 'failed';
    return 'unknown';
  }

  private pickFirstString(source: any, paths: string[]): string | null {
    for (const keyPath of paths) {
      const value = this.readPath(source, keyPath);
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
  }

  private pickFirstNumber(source: any, paths: string[]): number | null {
    for (const keyPath of paths) {
      const value = this.readPath(source, keyPath);
      const number = Number(value);
      if (Number.isFinite(number)) return number;
    }
    return null;
  }

  private readPath(source: any, keyPath: string): any {
    return String(keyPath)
      .split('.')
      .reduce((acc: any, key: string) => (acc && typeof acc === 'object' ? acc[key] : undefined), source);
  }

  private resolvePathList(envKey: string, fallback: string[]): string[] {
    const parsed = this.parseCsv(process.env[envKey]);
    return parsed.length > 0 ? parsed : fallback;
  }

  private parseCsv(value: any): string[] {
    if (typeof value !== 'string') return [];
    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => !!item);
  }

  private parseHeaderMap(raw: any): Record<string, string> {
    if (typeof raw !== 'string' || !raw.trim()) return {};
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};

      return Object.entries(parsed).reduce(
        (acc, [key, value]) => {
          const headerKey = String(key || '').trim();
          if (!headerKey) return acc;
          acc[headerKey] = String(value ?? '');
          return acc;
        },
        {} as Record<string, string>,
      );
    } catch {
      this.logger.warn('VIDEO_PROVIDER_EXTRA_HEADERS_JSON is not valid JSON');
      return {};
    }
  }

  private tryParseJson(text: string): Record<string, any> | null {
    if (!text || typeof text !== 'string') return null;
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  private async safeParseJson(response: Response): Promise<Record<string, any>> {
    try {
      const body = await response.json();
      return body && typeof body === 'object' ? body : {};
    } catch {
      return {};
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private toInt(value: any, fallback: number, min: number, max: number): number {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, Math.trunc(num)));
  }

  private toBool(value: any, fallback: boolean): boolean {
    if (value == null) return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
  }
}
