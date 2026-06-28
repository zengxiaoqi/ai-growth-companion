import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  Optional,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Repository } from 'typeorm';
import { Content } from '../../database/entities/content.entity';
import {
  VideoGenerationTask,
  type VideoRenderEngine,
} from '../../database/entities/video-generation-task.entity';
import { suggestTemplateByDomain } from '../../animations/animation-templates';
import { getCoursePackCurriculumSeed } from './course-curriculum-fallback';
import { AiService } from '../ai/ai.service';
import { RemotionRenderService } from './remotion-render.service';
import { HyperframesRenderService } from './hyperframes-render.service';
import { VideoGenerationAgentService } from './video-generation-agent.service';

type ProviderStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'unknown';

type RenderAttemptEngine = VideoRenderEngine | 'dynamic-remotion';
type RemotionFailureKind = 'environment' | 'generated-code' | 'unknown';

const FALLBACK_RENDER_ENGINES: RenderAttemptEngine[] = [
  'dynamic-remotion',
  'remotion',
  'hyperframes',
];

@Injectable()
export class LessonVideoQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LessonVideoQueueService.name);
  private queueTimer: NodeJS.Timeout | null = null;
  private workerBusy = false;
  private cleanupTick = 0;

  private readonly pollIntervalMs = this.toInt(
    process.env.VIDEO_TASK_POLL_INTERVAL_MS,
    3000,
    1000,
    20000,
  );
  private readonly providerPollIntervalMs = this.toInt(
    process.env.VIDEO_PROVIDER_POLL_MS,
    2500,
    500,
    20000,
  );
  private readonly providerPollMaxTimes = this.toInt(
    process.env.VIDEO_PROVIDER_POLL_MAX_TIMES,
    120,
    5,
    1000,
  );
  private readonly cacheTtlHours = this.toInt(process.env.VIDEO_CACHE_TTL_HOURS, 72, 1, 24 * 30);
  private readonly maxRetries = this.toInt(process.env.VIDEO_TASK_MAX_RETRIES, 2, 0, 5);
  private readonly providerRequestTimeoutMs = this.toInt(
    process.env.VIDEO_PROVIDER_REQUEST_TIMEOUT_MS,
    20000,
    1000,
    120000,
  );
  private readonly downloadTimeoutMs = this.toInt(
    process.env.VIDEO_PROVIDER_DOWNLOAD_TIMEOUT_MS,
    45000,
    1000,
    180000,
  );
  private readonly downloadMaxBytes =
    this.toInt(process.env.VIDEO_PROVIDER_DOWNLOAD_MAX_MB, 80, 5, 1024) * 1024 * 1024;
  private readonly allowHttpDownload = this.toBool(
    process.env.VIDEO_PROVIDER_ALLOW_HTTP_DOWNLOAD,
    false,
  );
  private readonly allowPrivateDownloadHosts = this.toBool(
    process.env.VIDEO_PROVIDER_ALLOW_PRIVATE_DOWNLOAD_HOSTS,
    false,
  );
  private readonly downloadHostAllowlist = this.parseCsv(
    process.env.VIDEO_PROVIDER_DOWNLOAD_HOST_ALLOWLIST,
  );
  private readonly createVideoUrlPaths = this.resolvePathList(
    'VIDEO_PROVIDER_CREATE_VIDEO_URL_PATHS',
    ['videoUrl', 'url', 'data.videoUrl', 'result.videoUrl'],
  );
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
  private readonly statusProgressPaths = this.resolvePathList(
    'VIDEO_PROVIDER_STATUS_PROGRESS_PATHS',
    ['progress', 'percent', 'data.progress', 'result.progress'],
  );
  private readonly statusErrorPaths = this.resolvePathList('VIDEO_PROVIDER_STATUS_ERROR_PATHS', [
    'error',
    'message',
    'data.error',
    'result.error',
  ]);
  private readonly statusVideoUrlPaths = this.resolvePathList(
    'VIDEO_PROVIDER_STATUS_VIDEO_URL_PATHS',
    [
      'videoUrl',
      'url',
      'downloadUrl',
      'data.videoUrl',
      'data.url',
      'result.videoUrl',
      'result.url',
    ],
  );
  private readonly extraProviderHeaders = this.parseHeaderMap(
    process.env.VIDEO_PROVIDER_EXTRA_HEADERS_JSON,
  );
  private readonly storageDir = path.join(process.cwd(), 'storage', 'lesson-videos');

  constructor(
    @InjectRepository(VideoGenerationTask)
    private readonly taskRepo: Repository<VideoGenerationTask>,
    @InjectRepository(Content)
    private readonly contentRepo: Repository<Content>,
    private readonly aiService: AiService,
    private readonly remotionRender: RemotionRenderService,
    private readonly hyperframesRender: HyperframesRenderService,
    @Optional()
    @Inject(VideoGenerationAgentService)
    private readonly videoGenerationAgent?: VideoGenerationAgentService,
  ) {}

  onModuleInit() {
    this.queueTimer = setInterval(() => {
      void this.processQueue();
    }, this.pollIntervalMs);
    this.logger.log(`Lesson video queue started (tick=${this.pollIntervalMs}ms)`);
    this.logger.log(
      `Lesson video agent pipeline ${this.videoGenerationAgent ? 'enabled' : 'disabled'}`,
    );

    // Reset orphaned 'processing' tasks left from a previous server crash/restart
    void this.resetOrphanedProcessingTasks();

    // Log environment diagnostics for video rendering
    void this.logEnvironmentDiagnostics();
  }

  private async resetOrphanedProcessingTasks(): Promise<void> {
    try {
      const result = await this.taskRepo
        .createQueryBuilder()
        .update(VideoGenerationTask)
        .set({
          status: 'failed',
          errorMessage: 'Server restarted during processing',
        })
        .where("status = 'processing'")
        .execute();
      if (result.affected && result.affected > 0) {
        this.logger.warn(`Reset ${result.affected} orphaned 'processing' task(s) to 'failed'`);
      }
    } catch (error: any) {
      this.logger.warn(`Failed to reset orphaned tasks: ${error?.message}`);
    }
  }

  private async logEnvironmentDiagnostics(): Promise<void> {
    const { exec } = await import('child_process');
    const checks: string[] = [];

    // Check FFmpeg
    const ffmpegCheck = await new Promise<string>((resolve) => {
      exec('ffmpeg -version', { timeout: 5000 }, (err, stdout) => {
        if (err) {
          resolve('NOT FOUND — install from https://ffmpeg.org/download.html');
        } else {
          const version = stdout.split('\n')[0]?.trim() || 'unknown version';
          resolve(`OK (${version})`);
        }
      });
    });
    checks.push(`FFmpeg: ${ffmpegCheck}`);

    // Check HyperFrames CLI
    const hyperframesCheck = await new Promise<string>((resolve) => {
      exec('npx hyperframes --version', { timeout: 10000 }, (err, stdout) => {
        if (err) {
          resolve('NOT FOUND — hyperframes CLI not available');
        } else {
          resolve(`OK (${stdout.trim().slice(0, 40)})`);
        }
      });
    });
    checks.push(`HyperFrames CLI: ${hyperframesCheck}`);

    // Check Remotion
    const remotionCheck = await new Promise<string>((resolve) => {
      exec('npx remotion --version', { timeout: 10000 }, (err, stdout) => {
        if (err) {
          resolve('NOT FOUND — remotion CLI not available');
        } else {
          resolve(`OK (${stdout.trim().slice(0, 40)})`);
        }
      });
    });
    checks.push(`Remotion CLI: ${remotionCheck}`);

    // Check storage directory
    const storageDir = path.join(process.cwd(), 'storage', 'lesson-videos');
    try {
      await fs.mkdir(storageDir, { recursive: true });
      await fs.access(storageDir);
      checks.push(`Storage dir: OK (${storageDir})`);
    } catch {
      checks.push(`Storage dir: NOT ACCESSIBLE (${storageDir})`);
    }

    // Check env config
    checks.push(`HYPERFRAMES_ENABLED=${process.env.HYPERFRAMES_ENABLED || '(default: true)'}`);
    checks.push(
      `HYPERFRAMES_CLI_COMMAND=${process.env.HYPERFRAMES_CLI_COMMAND || '(default: npx)'}`,
    );
    checks.push(`VIDEO_PROVIDER_BASE_URL=${process.env.VIDEO_PROVIDER_BASE_URL || '(not set)'}`);
    checks.push(
      `VIDEO_TASK_MAX_RETRIES=${this.maxRetries}, VIDEO_CACHE_TTL_HOURS=${this.cacheTtlHours}`,
    );

    this.logger.log(`[VideoDiagnostics] Environment check:\n  ${checks.join('\n  ')}`);
  }

  onModuleDestroy() {
    if (this.queueTimer) {
      clearInterval(this.queueTimer);
      this.queueTimer = null;
    }
  }

  async enqueue(
    contentId: number,
    childId: number,
    force = false,
    renderEngine: VideoRenderEngine = 'auto',
  ): Promise<VideoGenerationTask> {
    const content = await this.contentRepo.findOne({
      where: { id: contentId },
    });
    if (!content) throw new NotFoundException('Content not found');

    const payload = this.buildPackPayloadFromContent(content);
    const cacheKey = this.computeCacheKey(content, payload);
    const normalizedEngine = this.normalizeRenderEngine(renderEngine);
    this.logger.log(
      `[enqueue] contentId=${contentId}, topic="${content.topic || ''}", title="${content.title || ''}", domain="${content.domain || ''}", engine=${normalizedEngine}, force=${force}`,
    );
    this.logger.debug(
      `[enqueue] payload summary: visualStory.scenes=${Array.isArray(payload?.visualStory?.scenes) ? payload.visualStory.scenes.length : 0}, videoLesson.shots=${Array.isArray(payload?.videoLesson?.shots) ? payload.videoLesson.shots.length : 0}, watchScene.scenes=${Array.isArray(payload?.watchScene?.scenes) ? payload.watchScene.scenes.length : 0}`,
    );
    if (!force) {
      const reusable = await this.findReusableTask(contentId, childId, cacheKey, normalizedEngine);
      if (reusable) {
        this.logger.log(
          `[enqueue] reusing existing task: taskId=${reusable.id}, status=${reusable.status}, progress=${reusable.progress}`,
        );
        return reusable;
      }
    }

    const task = this.taskRepo.create({
      uuid: randomUUID(),
      contentId,
      childId,
      provider: this.resolveProviderName(normalizedEngine),
      renderEngine: normalizedEngine,
      cacheKey,
      requestPayload: payload,
      status: 'pending',
      progress: 0,
      attemptCount: 0,
    });
    const saved = await this.taskRepo.save(task);
    this.logger.log(
      `Video task queued: taskId=${saved.id}, contentId=${contentId}, engine=${normalizedEngine}, cacheKey=${cacheKey.slice(0, 12)}...`,
    );
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

    this.logger.log(
      `[processQueue] claiming taskId=${pending.id}, contentId=${pending.contentId}, engine=${pending.renderEngine}, attempt=${pending.attemptCount}`,
    );

    const claimResult = await this.taskRepo
      .createQueryBuilder()
      .update(VideoGenerationTask)
      .set({
        status: 'processing',
        progress: 5,
        startedAt: new Date(),
        attemptCount: () => 'attemptCount + 1',
      } as any)
      .where('id = :id AND status = :status', {
        id: pending.id,
        status: 'pending',
      })
      .execute();

    if (!claimResult.affected) {
      this.logger.warn(`[processQueue] taskId=${pending.id} claim failed (already taken)`);
      return;
    }

    const task = await this.taskRepo.findOne({ where: { id: pending.id } });
    if (!task) return;

    this.logger.log(`Video task processing: taskId=${task.id}, attempt=${task.attemptCount}`);

    try {
      const payload = task.requestPayload || {};
      this.logger.debug(
        `[processQueue] taskId=${task.id} payload: topic="${payload.topic || ''}", visualStory.scenes=${Array.isArray(payload?.visualStory?.scenes) ? payload.visualStory.scenes.length : 0}, videoLesson.shots=${Array.isArray(payload?.videoLesson?.shots) ? payload.videoLesson.shots.length : 0}`,
      );
      const { buffer, providerTaskId, sourceVideoUrl } = await this.generateVideoBuffer(
        task,
        payload,
      );
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
      this.logger.log(
        `Video task completed: taskId=${task.id}, size=${buffer.length} bytes, path=${localPath}, provider=${task.provider}`,
      );
    } catch (error: any) {
      const canRetry = (task.attemptCount || 0) <= this.maxRetries;
      task.status = canRetry ? 'pending' : 'failed';
      task.progress = 0;
      task.errorMessage = String(error?.message || 'video generation failed').slice(0, 500);
      await this.taskRepo.save(task);
      this.logger.warn(
        `Video task ${canRetry ? 're-queued' : 'failed'}: taskId=${task.id}, attempt=${task.attemptCount}, maxRetries=${this.maxRetries}, message=${task.errorMessage}`,
      );
      if (error?.stack) {
        this.logger.debug(
          `[processQueue] taskId=${task.id} error stack: ${String(error.stack).slice(0, 800)}`,
        );
      }
    }
  }

  private async generateVideoBuffer(
    task: VideoGenerationTask,
    payload: Record<string, any>,
  ): Promise<{
    buffer: Buffer;
    providerTaskId?: string | null;
    sourceVideoUrl?: string | null;
  }> {
    // --- Agent-first path: use VideoGenerationAgentService when available ---
    if (this.videoGenerationAgent) {
      const topic = payload?.topic || '';
      if (topic) {
        this.logger.log(
          `[generateVideoBuffer] taskId=${task.id} using agent pipeline for topic="${topic}"`,
        );
        try {
          // Bump progress from 5 to 8 so the frontend knows the agent is running
          try {
            await this.taskRepo.update(task.id, { progress: 8 });
          } catch {}

          const agentResult = await this.videoGenerationAgent.generateViaAgent({
            topic,
            domain: payload?.domain,
            ageGroup: payload?.ageGroup,
            contentId: task.contentId,
            childId: task.childId,
            payload,
          });

          this.logger.log(
            `[generateVideoBuffer] taskId=${task.id} agent completed: storyboard=${agentResult.storyboard ? 'yes' : 'no'}, qualityScore=${agentResult.qualityScore}, passed=${agentResult.qualityPassed}, toolCalls=${agentResult.toolCalls.length}, agentFiles=${agentResult.agentFiles.size}`,
          );

          // If the agent produced a storyboard, enrich the payload with it
          if (agentResult.storyboard) {
            const enrichedPayload = this.enrichPayloadWithStoryboard(
              payload,
              agentResult.storyboard,
              {
                passed: agentResult.qualityPassed,
                score: agentResult.qualityScore,
              },
            );
            // Attach agent-written files for dynamic-remotion to use
            if (agentResult.agentFiles.size > 0) {
              enrichedPayload.__agentFiles = Array.from(agentResult.agentFiles.entries()).map(
                ([name, content]) => ({ name, content }),
              );
            }
            // Fall through to render the enriched payload via existing engines
            return this.generateVideoBufferWithEngines(task, enrichedPayload);
          }
        } catch (error: any) {
          this.logger.warn(
            `[generateVideoBuffer] taskId=${task.id} agent pipeline failed, falling back: ${error?.message || 'unknown'}`,
          );
          // Fall through to legacy path
        }
      }
    }

    // --- Legacy path: direct engine rendering ---
    return this.generateVideoBufferWithEngines(task, payload);
  }

  /** Enrich the render payload with agent-generated storyboard data */
  private enrichPayloadWithStoryboard(
    payload: Record<string, any>,
    storyboard: any,
    quality?: { passed: boolean; score: number },
  ): Record<string, any> {
    const scenes = Array.isArray(storyboard.scenes) ? storyboard.scenes : [];

    return {
      ...payload,
      topic: storyboard.topic || payload.topic,
      __storyboard: storyboard,
      __storyboardQuality: quality || null,
      visualStory: {
        scenes: scenes.map((scene: any) => ({
          scene: scene.title || `场景${scene.sequence}`,
          imagePrompt:
            scene.visualDescription || `${storyboard.topic}场景：${scene.title}，卡通教育风格`,
          narration: scene.narration || '',
          onScreenText: scene.onScreenText || scene.concept || '',
          durationSec: scene.durationSec || 6,
          animationTemplate: scene.animationTemplate?.id || undefined,
          animationParams: scene.animationTemplate?.params || {},
        })),
        style: storyboard.visualTheme?.mood || 'colorful-educational',
      },
      videoLesson: {
        title: storyboard.title || payload.title,
        durationSec: storyboard.totalDurationSec || 0,
        shots: scenes.map((scene: any) => ({
          shot: scene.title || `片段${scene.sequence}`,
          visualPrompt: scene.visualDescription || scene.visualPrompt || '',
          narration: scene.narration || '',
          caption: (scene.onScreenText || scene.title || '').slice(0, 12),
          durationSec: scene.durationSec || 6,
          animationTemplate: scene.animationTemplate?.id || undefined,
          animationParams: scene.animationTemplate?.params || {},
        })),
      },
    };
  }

  private async generateVideoBufferWithEngines(
    task: VideoGenerationTask,
    payload: Record<string, any>,
  ): Promise<{
    buffer: Buffer;
    providerTaskId?: string | null;
    sourceVideoUrl?: string | null;
  }> {
    payload = this.ensureTopicAlignedVideoPayload(payload);
    const requestedEngine = this.normalizeRenderEngine(task.renderEngine);
    const engineOrder = this.resolveEngineOrder(requestedEngine);
    const errors: string[] = [];

    this.logger.log(
      `[generateVideoBuffer] taskId=${task.id}, requestedEngine=${requestedEngine}, engineOrder=[${engineOrder.join(',')}], topic="${payload?.topic || ''}"`,
    );

    for (const engine of engineOrder) {
      this.logger.log(`[generateVideoBuffer] taskId=${task.id} trying engine: ${engine}`);
      const engineStart = Date.now();
      try {
        if (engine === 'dynamic-remotion') {
          await this.taskRepo.update(task.id, {
            provider: this.resolveProviderName('dynamic-remotion'),
            renderEngine: task.renderEngine || requestedEngine,
          } as any);
          const buffer = await this.generateByDynamicRemotion(task, payload);
          if (buffer) {
            this.logger.log(
              `[generateVideoBuffer] taskId=${task.id} engine=${engine} succeeded in ${Date.now() - engineStart}ms, size=${buffer.length}, dynamicRemotion=true`,
            );
            return { buffer, providerTaskId: null, sourceVideoUrl: null };
          }
          errors.push('dynamic-remotion returned empty buffer');
          this.logger.warn(
            `[generateVideoBuffer] taskId=${task.id} engine=${engine} returned empty buffer after ${Date.now() - engineStart}ms, dynamicRemotion=false`,
          );
          continue;
        }

        if (engine === 'hyperframes') {
          await this.taskRepo.update(task.id, {
            provider: this.resolveProviderName('hyperframes'),
            renderEngine: task.renderEngine || requestedEngine,
          } as any);
          const buffer = await this.generateByHyperframes(task, payload);
          if (buffer) {
            this.logger.log(
              `[generateVideoBuffer] taskId=${task.id} engine=${engine} succeeded in ${Date.now() - engineStart}ms, size=${buffer.length}`,
            );
            return { buffer, providerTaskId: null, sourceVideoUrl: null };
          }
          errors.push('hyperframes returned empty buffer');
          this.logger.warn(
            `[generateVideoBuffer] taskId=${task.id} engine=${engine} returned empty buffer after ${Date.now() - engineStart}ms`,
          );
          continue;
        }

        if (engine === 'remotion') {
          await this.taskRepo.update(task.id, {
            provider: this.resolveProviderName('remotion'),
            renderEngine: task.renderEngine || requestedEngine,
          } as any);
          const remotionBuffer = await this.generateByRemotion(task, payload);
          if (remotionBuffer) {
            this.logger.log(
              `[generateVideoBuffer] taskId=${task.id} engine=${engine} succeeded in ${Date.now() - engineStart}ms, size=${remotionBuffer.length}`,
            );
            return {
              buffer: remotionBuffer,
              providerTaskId: null,
              sourceVideoUrl: null,
            };
          }
          errors.push('remotion returned empty buffer');
          this.logger.warn(
            `[generateVideoBuffer] taskId=${task.id} engine=${engine} returned empty buffer after ${Date.now() - engineStart}ms`,
          );
          continue;
        }
      } catch (error: any) {
        const reason = `${engine}: ${error?.message || 'unknown'}`;
        errors.push(reason);
        this.logger.warn(
          `[generateVideoBuffer] taskId=${task.id} engine=${engine} failed after ${Date.now() - engineStart}ms: ${reason}`,
        );
      }
    }

    // Keep previous fallback chain for compatibility.
    const thirdPartyEnabled = this.isThirdPartyEnabled();
    if (thirdPartyEnabled) {
      this.logger.log(`[generateVideoBuffer] taskId=${task.id} trying third-party provider`);
      try {
        await this.taskRepo.update(task.id, {
          provider: this.resolveProviderName('auto'),
        } as any);
        const thirdParty = await this.generateByThirdParty(task, payload);
        return thirdParty;
      } catch (error: any) {
        const reason = `third-party: ${error?.message || 'unknown'}`;
        errors.push(reason);
        this.logger.warn(`Third-party video generation failed: ${reason}`);
      }
    }

    this.logger.log(
      `[generateVideoBuffer] taskId=${task.id} trying local fallback (aiService.renderTeachingVideoFromPack)`,
    );
    const localBuffer = await this.aiService.renderTeachingVideoFromPack(payload);
    if (localBuffer) {
      await this.taskRepo.update(task.id, {
        provider: this.resolveProviderName('auto'),
      } as any);
      this.logger.log(
        `[generateVideoBuffer] taskId=${task.id} local fallback succeeded, size=${localBuffer.length}`,
      );
      return {
        buffer: localBuffer,
        providerTaskId: task.providerTaskId,
        sourceVideoUrl: null,
      };
    }

    this.logger.error(
      `[generateVideoBuffer] taskId=${task.id} ALL engines failed: [${errors.join(' | ')}]`,
    );
    throw new Error(`TEACHING_VIDEO_UNAVAILABLE: ${errors.join(' | ') || 'all engines failed'}`);
  }

  private async generateByHyperframes(
    task: VideoGenerationTask,
    payload: Record<string, any>,
  ): Promise<Buffer | null> {
    const topic = payload?.topic || '';
    if (!topic) {
      this.logger.warn(`[generateByHyperframes] taskId=${task.id} skipped: no topic in payload`);
      return null;
    }
    this.logger.log(
      `[generateByHyperframes] taskId=${task.id} starting render, topic="${topic}", domain="${payload?.domain || 'unknown'}"`,
    );
    return this.hyperframesRender.renderLessonVideo(task, payload, async (percent: number) => {
      try {
        await this.taskRepo.update(task.id, {
          progress: Math.max(10, Math.min(95, percent)),
        });
      } catch {}
    });
  }

  private async generateByDynamicRemotion(
    task: VideoGenerationTask,
    payload: Record<string, any>,
  ): Promise<Buffer | null> {
    const topic = payload?.topic || '';
    const storyboard = payload?.__storyboard;
    const quality = payload?.__storyboardQuality;

    if (!this.videoGenerationAgent) {
      this.logger.warn(
        `[generateByDynamicRemotion] taskId=${task.id} skipped: videoGenerationAgent unavailable`,
      );
      return null;
    }
    if (!topic || !storyboard) {
      this.logger.warn(
        `[generateByDynamicRemotion] taskId=${task.id} skipped: missing topic or storyboard`,
      );
      return null;
    }
    if (quality && quality.passed === false && Number(quality.score || 0) < 70) {
      this.logger.warn(
        `[generateByDynamicRemotion] taskId=${task.id} skipped: storyboard quality not passed score=${quality.score}`,
      );
      return null;
    }

    this.logger.log(
      `[generateByDynamicRemotion] taskId=${task.id} generating dynamic Remotion composition, topic="${topic}", domain="${payload?.domain || 'unknown'}"`,
    );

    // Reconstruct agent files Map from enriched payload
    const agentFilesEntries: Array<{ name: string; content: string }> = payload?.__agentFiles || [];
    const agentFiles = new Map<string, string>(
      agentFilesEntries.map((entry) => [entry.name, entry.content]),
    );

    let manifest = await this.videoGenerationAgent.generateRemotionComposition(
      storyboard,
      payload,
      agentFiles,
    );
    const outputPath = path.join(this.storageDir, `${task.cacheKey}-dynamic-remotion.mp4`);
    await fs.mkdir(this.storageDir, { recursive: true });

    const onProgress = async (percent: number) => {
      try {
        await this.taskRepo.update(task.id, {
          progress: Math.max(10, Math.min(95, percent)),
        });
      } catch {}
    };

    try {
      await this.remotionRender.renderGeneratedComposition(task, manifest, outputPath, onProgress);
    } catch (error: any) {
      const failureKind = this.classifyRemotionFailure(error);
      const canRepair = failureKind === 'generated-code' && agentFiles.has('GeneratedLesson.tsx');
      this.logger.warn(
        `[generateByDynamicRemotion] taskId=${task.id} render failed kind=${failureKind}, canRepair=${canRepair}: ${error?.message || 'unknown'}`,
      );

      if (!canRepair) {
        throw error;
      }

      try {
        this.logger.log(
          `[generateByDynamicRemotion] taskId=${task.id} requesting AI repair for generated Remotion files`,
        );
        manifest = await this.videoGenerationAgent.repairGeneratedRemotionComposition(
          storyboard,
          payload,
          agentFiles,
          error?.message || String(error),
        );
        await this.remotionRender.renderGeneratedComposition(
          task,
          manifest,
          outputPath,
          onProgress,
        );
        this.logger.log(`[generateByDynamicRemotion] taskId=${task.id} AI repair retry succeeded`);
      } catch (repairError: any) {
        this.logger.warn(
          `[generateByDynamicRemotion] taskId=${task.id} AI repair retry failed: original=${error?.message || 'unknown'} repair=${repairError?.message || 'unknown'}`,
        );
        // Fall back to built-in template instead of throwing — the built-in
        // template is known-good TSX that always compiles.
        this.logger.log(
          `[generateByDynamicRemotion] taskId=${task.id} falling back to built-in GeneratedLesson template`,
        );
        const fallbackManifest =
          await this.videoGenerationAgent.generateRemotionComposition(storyboard, payload);
        await this.remotionRender.renderGeneratedComposition(
          task,
          fallbackManifest,
          outputPath,
          onProgress,
        );
        this.logger.log(
          `[generateByDynamicRemotion] taskId=${task.id} built-in template fallback succeeded`,
        );
      }
    }

    // Render finished — bump progress to 98 to reduce the window where frontend sees 95%
    try {
      await this.taskRepo.update(task.id, { progress: 98 });
    } catch {}

    const buffer = await fs.readFile(outputPath);
    try {
      await fs.unlink(outputPath);
    } catch {}
    return buffer;
  }

  private classifyRemotionFailure(error: unknown): RemotionFailureKind {
    const message = error instanceof Error ? error.message : String(error || '');
    const stack = error instanceof Error ? error.stack || '' : '';
    const lower = `${message}\n${stack}`.toLowerCase();

    if (
      lower.includes('browserexecutable') ||
      lower.includes('browser executable') ||
      lower.includes('chrome/chromium') ||
      lower.includes('chromium') ||
      lower.includes('chrome') ||
      lower.includes('spawn failed') ||
      lower.includes('enoent') ||
      lower.includes('remotion cli not found') ||
      lower.includes('timeout')
    ) {
      return 'environment';
    }

    if (
      lower.includes('generatedlesson') ||
      lower.includes('root.tsx') ||
      lower.includes('index.ts') ||
      lower.includes('.tsx') ||
      lower.includes('typescript') ||
      lower.includes('typeerror') ||
      lower.includes('syntaxerror') ||
      lower.includes('unexpected token') ||
      lower.includes('failed to compile') ||
      lower.includes('module not found') ||
      lower.includes('does not provide an export') ||
      lower.includes('invalid hook call') ||
      lower.includes('element type is invalid')
    ) {
      return 'generated-code';
    }

    return 'unknown';
  }

  private ensureTopicAlignedVideoPayload(payload: Record<string, any>): Record<string, any> {
    const topic = this.toText(payload?.topic);
    if (!topic) return payload;

    const shots = Array.isArray(payload?.videoLesson?.shots) ? payload.videoLesson.shots : [];
    if (shots.length === 0 || this.isVideoContentAligned(topic, shots)) {
      return payload;
    }

    const watchScenes = Array.isArray(payload?.watchScene?.scenes) ? payload.watchScene.scenes : [];
    const visualScenes = Array.isArray(payload?.visualStory?.scenes)
      ? payload.visualStory.scenes
      : [];

    const alignedScenes = this.isVideoContentAligned(topic, visualScenes)
      ? visualScenes
      : this.isVideoContentAligned(topic, watchScenes)
        ? watchScenes
        : [];

    const replacementShots =
      alignedScenes.length > 0
        ? this.mapScenesToVideoShots(topic, alignedScenes)
        : this.buildTopicAlignedFallbackShots(payload);

    if (replacementShots.length === 0) {
      return payload;
    }

    this.logger.warn(
      `[ensureTopicAlignedVideoPayload] Replaced off-topic videoLesson shots for topic="${topic}". oldShots=${shots.length}, newShots=${replacementShots.length}`,
    );

    return {
      ...payload,
      videoLesson: {
        ...(payload.videoLesson || {}),
        title: `${topic} 视频讲解`,
        durationSec: replacementShots.reduce(
          (sum, shot) => sum + this.toInt(shot.durationSec, 12, 4, 30),
          0,
        ),
        shots: replacementShots,
      },
    };
  }

  private mapScenesToVideoShots(topic: string, scenes: any[]): Array<Record<string, any>> {
    return scenes.slice(0, 8).map((scene, index) => ({
      shot: this.toText(scene?.scene || scene?.title, `${topic}片段${index + 1}`),
      visualPrompt: this.toText(
        scene?.imagePrompt || scene?.visualDescription,
        `${topic}教学场景，卡通教育风格`,
      ),
      narration: this.toText(scene?.narration, `我们继续学习${topic}。`),
      caption: this.toText(
        scene?.caption || scene?.onScreenText || scene?.title || scene?.scene,
        topic,
      ).slice(0, 18),
      durationSec: this.toInt(scene?.durationSec, 12, 6, 24),
    }));
  }

  private buildTopicAlignedFallbackShots(payload: Record<string, any>): Array<Record<string, any>> {
    const topic = this.toText(payload?.topic);
    const ageGroup =
      payload?.ageGroup === '3-4' || payload?.ageGroup === '5-6' ? payload.ageGroup : '5-6';
    const domain = this.normalizeCourseDomain(payload?.domain);
    const seed = getCoursePackCurriculumSeed({ topic, ageGroup, domain });
    const terms = this.extractVideoTopicTerms(topic);
    const specificTerms = terms.filter((term) => !this.isBroadTopicTerm(term));
    const units = Array.from(
      new Set([...specificTerms, ...(seed?.teachingUnits || []), ...terms]),
    ).slice(0, 4);

    const teachingUnits = units.length > 0 ? units : [topic];
    const intro = {
      shot: '主题导入',
      visualPrompt: `老师展示${topic}的学习卡片，卡通课堂，明亮色彩`,
      narration: seed?.summary || `小朋友，今天我们来认识${topic}。请仔细看一看它有哪些重要特点。`,
      caption: topic,
      durationSec: 10,
    };
    const body = teachingUnits.map((unit) => {
      const fact = seed?.unitFacts?.[unit];
      return {
        shot: `${unit}讲解`,
        visualPrompt: `${topic}中的${unit}知识点，卡通教育风格，重点突出`,
        narration: fact
          ? `现在观察${unit}。${unit}是${fact}。请你跟老师说一说这个特点。`
          : `现在观察${unit}。它和${topic}密切相关，请你找一找画面里的重点。`,
        caption: unit,
        durationSec: 12,
      };
    });
    const review = {
      shot: '复习总结',
      visualPrompt: `${topic}总结画面，小朋友和老师一起复习重点`,
      narration: `今天我们学习了${topic}。请你说一说自己记住的一个特点，再讲给家人听。`,
      caption: '复习重点',
      durationSec: 12,
    };

    return [intro, ...body, review].slice(0, 6);
  }

  private isVideoContentAligned(topic: string, items: any[]): boolean {
    if (!Array.isArray(items) || items.length === 0) return false;
    const terms = this.extractVideoTopicTerms(topic);
    if (terms.length === 0) return true;
    const specificTerms = terms.filter((term) => !this.isBroadTopicTerm(term));
    const requiredTerms = specificTerms.length > 0 ? specificTerms : terms;
    const body = items
      .map((item) =>
        [
          item?.shot,
          item?.title,
          item?.scene,
          item?.caption,
          item?.onScreenText,
          item?.narration,
          item?.visualPrompt,
          item?.imagePrompt,
          item?.visualDescription,
        ]
          .map((value) => this.toText(value))
          .filter(Boolean)
          .join(' '),
      )
      .join(' ');

    return requiredTerms.some((term) => body.includes(term));
  }

  private extractVideoTopicTerms(topic: string): string[] {
    const source = this.toText(topic);
    const knownTerms = [
      '动物',
      '老虎',
      '狮子',
      '猫',
      '狗',
      '兔',
      '鸟',
      '鱼',
      '四季',
      '春天',
      '夏天',
      '秋天',
      '冬天',
      '植物',
      '水果',
      '数字',
      '形状',
      '颜色',
    ];
    const rawTerms = source.match(/[\u4e00-\u9fff]{1,8}/g) || [];
    return Array.from(
      new Set([
        ...rawTerms
          .map((term) =>
            term
              .replace(/^(认识|学习|了解|观察)/, '')
              .replace(/(课程|主题|内容|世界|朋友)$/, '')
              .trim(),
          )
          .filter((term) => term.length >= 2 && term.length <= 8),
        ...knownTerms.filter((term) => source.includes(term)),
      ]),
    );
  }

  private isBroadTopicTerm(term: string): boolean {
    return ['动物', '学习', '认识', '课程', '主题', '内容'].includes(term);
  }

  private normalizeCourseDomain(
    value: any,
  ): 'language' | 'math' | 'science' | 'art' | 'social' | undefined {
    const domain = this.toText(value);
    return ['language', 'math', 'science', 'art', 'social'].includes(domain)
      ? (domain as any)
      : undefined;
  }

  private async generateByRemotion(
    task: VideoGenerationTask,
    payload: Record<string, any>,
  ): Promise<Buffer | null> {
    const topic = payload?.topic || '';
    if (!topic) {
      this.logger.warn(`[generateByRemotion] taskId=${task.id} skipped: no topic in payload`);
      return null;
    }
    this.logger.log(
      `[generateByRemotion] taskId=${task.id} resolving composition, topic="${topic}", ageGroup="${payload?.ageGroup || 'unknown'}"`,
    );

    const { compositionId, inputProps } = await this.remotionRender.resolveComposition(
      payload,
      payload?.ageGroup,
    );
    this.logger.log(
      `[generateByRemotion] taskId=${task.id} resolved compositionId=${compositionId}, slides=${Array.isArray(inputProps?.slides) ? inputProps.slides.length : 'N/A'}`,
    );

    try {
      const outputPath = path.join(this.storageDir, `${task.cacheKey}-remotion.mp4`);
      await fs.mkdir(this.storageDir, { recursive: true });

      this.logger.log(
        `[generateByRemotion] taskId=${task.id} spawning remotion render, compositionId=${compositionId}, outputPath=${outputPath}`,
      );
      await this.remotionRender.renderComposition(
        compositionId,
        inputProps,
        outputPath,
        async (percent: number) => {
          try {
            await this.taskRepo.update(task.id, {
              progress: Math.max(10, Math.min(95, percent)),
            });
          } catch {}
        },
      );

      const buffer = await fs.readFile(outputPath);
      this.logger.log(
        `[generateByRemotion] taskId=${task.id} render complete, buffer=${buffer.length} bytes`,
      );
      // Cleanup intermediate file
      try {
        await fs.unlink(outputPath);
      } catch {}
      return buffer;
    } catch (error: any) {
      this.logger.warn(
        `[generateByRemotion] taskId=${task.id} render failed: ${error?.message || 'unknown'}`,
      );
      throw error;
    } finally {
      // Cleanup temporary narration MP3 files
      await this.remotionRender.cleanupNarrationFiles(inputProps);
    }
  }

  private async generateByThirdParty(
    task: VideoGenerationTask,
    payload: Record<string, any>,
  ): Promise<{
    buffer: Buffer;
    providerTaskId?: string | null;
    sourceVideoUrl?: string | null;
  }> {
    const createUrl = this.resolveProviderUrl(
      process.env.VIDEO_PROVIDER_CREATE_PATH || '/v1/video/tasks',
    );
    const createBody = this.buildProviderCreateBody(task, payload);

    const createRes = await this.fetchWithTimeout(
      createUrl,
      {
        method: 'POST',
        headers: this.buildProviderHeaders(),
        body: JSON.stringify(createBody),
      },
      this.providerRequestTimeoutMs,
    );
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
      const statusRes = await this.fetchWithTimeout(
        statusUrl,
        {
          method: 'GET',
          headers: this.buildProviderHeaders(),
        },
        this.providerRequestTimeoutMs,
      );
      if (!statusRes.ok) continue;

      const statusJson = await this.safeParseJson(statusRes);
      const providerStatus = this.normalizeProviderStatus(
        this.pickFirstString(statusJson, this.statusStatePaths),
      );

      const providerProgress = this.pickFirstNumber(statusJson, this.statusProgressPaths);
      if (Number.isFinite(providerProgress)) {
        await this.taskRepo.update(task.id, {
          progress: Math.max(10, Math.min(95, Math.trunc(providerProgress))),
        });
      }

      if (providerStatus === 'failed') {
        const errMsg =
          this.pickFirstString(statusJson, this.statusErrorPaths) || 'provider task failed';
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
    const response = await this.fetchWithTimeout(
      downloadUrl,
      { method: 'GET' },
      this.downloadTimeoutMs,
    );
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
    const expired = await this.taskRepo.find({
      where: { status: 'completed' },
    });
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
    renderEngine: VideoRenderEngine,
  ): Promise<VideoGenerationTask | null> {
    const task = await this.taskRepo.findOne({
      where: { contentId, childId, cacheKey, renderEngine },
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
    const raw =
      typeof content.content === 'string' ? this.tryParseJson(content.content) : content.content;
    const lesson = raw && typeof raw === 'object' ? raw : {};
    const steps = Array.isArray((lesson as any).steps) ? (lesson as any).steps : [];

    // New format: has structured steps with modules
    if (steps.length > 0) {
      return this.buildPayloadFromSteps(lesson, content, steps);
    }

    // Legacy format: flat content[] array — derive video data from it
    return this.buildPayloadFromLegacyContent(lesson, content);
  }

  private buildPayloadFromSteps(
    lesson: Record<string, any>,
    content: Content,
    steps: any[],
  ): Record<string, any> {
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
    const domain = lesson.domain || content.domain || undefined;

    return {
      title: content.title || lesson.title || `${content.topic || '课程'} 全方位学习课`,
      topic: content.topic || lesson.topic || '',
      domain,
      summary: lesson.summary || content.subtitle || '',
      ageGroup: lesson.ageGroup || content.ageRange || undefined,
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

  private buildPayloadFromLegacyContent(
    lesson: Record<string, any>,
    content: Content,
  ): Record<string, any> {
    const contentItems = Array.isArray(lesson.content) ? lesson.content : [];
    const domain = lesson.domain || content.domain || 'language';
    const topic = content.topic || lesson.name || '';

    // 1. Convert legacy story/lesson text into visualStory scenes (paragraph-aware)
    const scenes = this.buildLegacyScenes(contentItems, domain, topic);

    // 2. Build interactive scenes from questions
    const quizScenes = this.buildQuizScenesFromLegacy(contentItems, topic);
    const allScenes = [...scenes, ...quizScenes].slice(0, 12);

    // 3. Extract keywords from lesson content for reading module
    const keywords = contentItems
      .flatMap((item: any) => (Array.isArray(item.keywords) ? item.keywords : []))
      .slice(0, 12)
      .map((k: any) => String(k));

    // 4. Extract questions for quiz module
    const questions = contentItems
      .flatMap((item: any) => (Array.isArray(item.questions) ? item.questions : []))
      .slice(0, 8);

    // 5. Extract game items for matching pairs
    const gamePairs = this.extractGamePairsFromLegacy(contentItems);

    return {
      title: content.title || lesson.name || `${topic} 全方位学习课`,
      topic,
      domain,
      summary: Array.isArray(lesson.objectives)
        ? lesson.objectives.join('；')
        : content.subtitle || '',
      ageGroup: lesson.ageRange || content.ageRange || undefined,
      watchScene: null,
      visualStory: allScenes.length > 0 ? { scenes: allScenes, style: 'colorful-educational' } : {},
      videoLesson: this.buildLegacyVideoLesson(contentItems, topic),
      modules: {
        listening: {},
        reading: keywords.length > 0 ? { keywords, goal: `学习${topic}的关键词语` } : {},
        writing: {},
        game: gamePairs.length > 0 ? { matchingPairs: gamePairs } : {},
        quiz: questions.length > 0 ? { questions, title: `${topic}小测验` } : {},
      },
    };
  }

  /** Split legacy story text into paragraph-aware scenes with enriched metadata */
  private buildLegacyScenes(
    contentItems: any[],
    domain: string,
    topic: string,
  ): Record<string, any>[] {
    return contentItems
      .filter((item: any) => item.type === 'story' || item.type === 'lesson')
      .flatMap((item: any) => {
        const text = item.text || item.title || '';
        // Split by paragraphs first, then fall back to sentence boundaries
        let segments = text.split(/\n\n|\n/).filter((s: string) => s.trim().length > 5);
        if (segments.length < 2) {
          segments = text.split(/[。！？]/).filter((s: string) => s.trim().length > 3);
        }

        return segments.slice(0, 8).map((segment: string, idx: number) => {
          const trimmed = segment.trim();
          const characters = this.extractCharactersFromText(trimmed);
          const items = this.extractItemsFromText(trimmed);
          const keyPhrase = this.extractKeyPhrase(trimmed, topic);
          const templateId =
            suggestTemplateByDomain(domain, trimmed) ||
            suggestTemplateByDomain(domain, topic) ||
            undefined;

          return {
            scene: item.title || `${topic}·场景${idx + 1}`,
            imagePrompt: `${topic}场景：${trimmed.slice(0, 50)}，卡通教育风格，明亮色彩`,
            narration:
              trimmed.endsWith('。') || trimmed.endsWith('！') || trimmed.endsWith('？')
                ? trimmed
                : `${trimmed}。`,
            onScreenText: keyPhrase,
            durationSec: Math.max(8, Math.min(18, trimmed.length / 4)),
            animationTemplate: templateId,
            animationParams: {
              bgType: this.inferLegacyBgType(trimmed),
              characters: characters.length > 0 ? characters : ['老师', '小朋友'],
              items: items.length > 0 ? items : undefined,
            },
          };
        });
      });
  }

  /** Convert quiz questions into interactive "thinking" scenes */
  private buildQuizScenesFromLegacy(contentItems: any[], _topic: string): Record<string, any>[] {
    const questions = contentItems
      .flatMap((item: any) => (Array.isArray(item.questions) ? item.questions : []))
      .slice(0, 3);

    return questions
      .map((q: any, idx: number) => {
        const questionText = String(q?.q || q?.question || '').trim();
        if (!questionText) return null;

        return {
          scene: `小问题${idx + 1}`,
          imagePrompt: `思考时间：${questionText.slice(0, 30)}，小朋友在思考，问号气泡`,
          narration: `小朋友，动动小脑筋想一想：${questionText}`,
          onScreenText: `🤔 ${questionText.slice(0, 12)}`,
          durationSec: 10,
          animationTemplate: 'language.story-scene',
          animationParams: {
            bgType: 'indoor',
            characters: ['小朋友'],
            items: ['问号', '书本'],
          },
        };
      })
      .filter(Boolean);
  }

  /** Extract character names from text using Chinese keyword detection */
  private extractCharactersFromText(text: string): string[] {
    const characterPatterns: [RegExp, string][] = [
      [/(猫|小猫|猫咪)/, '小猫'],
      [/(狗|小狗|狗狗)/, '小狗'],
      [/(鸟|小鸟)/, '小鸟'],
      [/(鱼|小鱼)/, '小鱼'],
      [/(兔|小兔|兔子)/, '小兔子'],
      [/(鸡|小鸡|母鸡|公鸡)/, '小鸡'],
      [/(鸭|小鸭)/, '小鸭'],
      [/(猪|小猪)/, '小猪'],
      [/(牛|奶牛)/, '奶牛'],
      [/(羊|小羊)/, '小羊'],
      [/(马|小马)/, '小马'],
      [/(熊|小熊|熊猫)/, '小熊'],
      [/(老师|教师)/, '老师'],
      [/(小朋友|孩子|宝宝)/, '小朋友'],
      [/(爸爸|妈妈|家人)/, '爸爸妈妈'],
    ];

    const found: string[] = [];
    for (const [regex, label] of characterPatterns) {
      if (regex.test(text) && !found.includes(label)) found.push(label);
    }
    return found.slice(0, 6);
  }

  /** Extract visual items/objects from text */
  private extractItemsFromText(text: string): string[] {
    const itemPatterns: [RegExp, string][] = [
      [/(太阳)/, '太阳'],
      [/(月亮)/, '月亮'],
      [/(星星)/, '星星'],
      [/(花|花朵|樱花)/, '花'],
      [/(树|树木|大树)/, '树'],
      [/(草|小草)/, '草'],
      [/(水|河|海|湖)/, '水'],
      [/(云|白云)/, '云'],
      [/(雨|下雨)/, '雨'],
      [/(雪|下雪)/, '雪'],
      [/(风|大风)/, '风'],
      [/(苹果)/, '苹果'],
      [/(香蕉)/, '香蕉'],
      [/(西瓜)/, '西瓜'],
      [/(蝴蝶)/, '蝴蝶'],
      [/(蜜蜂)/, '蜜蜂'],
      [/(蚂蚁)/, '蚂蚁'],
      [/(球|皮球)/, '球'],
      [/(书|书本)/, '书'],
      [/(笔|铅笔|画笔)/, '笔'],
      [/(积木)/, '积木'],
      [/(气球)/, '气球'],
    ];

    const found: string[] = [];
    for (const [regex, label] of itemPatterns) {
      if (regex.test(text) && !found.includes(label)) found.push(label);
    }
    return found.slice(0, 6);
  }

  /** Extract the most representative short phrase from text for on-screen display */
  private extractKeyPhrase(text: string, topic: string): string {
    // Try to find a quoted phrase
    const quoted = text.match(/[""']([^""']{2,12})[""']/);
    if (quoted?.[1]) return quoted[1];

    // Try to find a colon-labeled key fact
    const colon = text.match(/([^\u4e00-\u9fff]?)([\u4e00-\u9fff]{2,8})[:：]/);
    if (colon?.[2]) return colon[2];

    // Fall back to first meaningful Chinese phrase
    const phrases = text.match(/[\u4e00-\u9fff]{2,12}/g) || [];
    const meaningful = phrases.find((p) => !['小朋友', '我们', '一起', '看看', '今天'].includes(p));
    return meaningful?.slice(0, 12) || topic.slice(0, 12) || '学习中';
  }

  /** Build videoLesson shots from legacy content */
  private buildLegacyVideoLesson(contentItems: any[], topic: string): Record<string, any> {
    const storyItems = contentItems.filter(
      (item: any) => item.type === 'story' || item.type === 'lesson',
    );
    if (storyItems.length === 0) return {};

    const shots = storyItems.slice(0, 6).map((item: any, idx: number) => {
      const text = String(item.text || item.title || '').trim();
      const firstSentence = text.split(/[。！？]/)[0]?.trim() || text.slice(0, 60);
      return {
        shot: item.title || `片段${idx + 1}`,
        narration: firstSentence.length > 60 ? `${firstSentence.slice(0, 57)}...` : firstSentence,
        caption: (item.title || firstSentence).slice(0, 12),
        durationSec: Math.max(8, Math.min(18, firstSentence.length / 4)),
      };
    });

    return shots.length > 0
      ? {
          title: `${topic}动画课`,
          durationSec: shots.reduce((s: number, sh: any) => s + (sh.durationSec || 10), 0),
          shots,
        }
      : {};
  }

  /** Extract matching pairs from legacy game content blocks */
  private extractGamePairsFromLegacy(contentItems: any[]): Array<{ left: string; right: string }> {
    const gameBlocks = contentItems.filter(
      (item: any) => item.type === 'game' || item.type === 'activity',
    );
    const pairs: Array<{ left: string; right: string }> = [];

    for (const block of gameBlocks) {
      const examples = Array.isArray(block.examples) ? block.examples : [];
      for (const ex of examples) {
        if (ex && typeof ex === 'object') {
          const entries = Object.entries(ex).slice(0, 4);
          for (const [key, value] of entries) {
            if (key && value) {
              pairs.push({
                left: String(key).slice(0, 12),
                right: String(value).slice(0, 12),
              });
            }
          }
        }
      }

      const categories = Array.isArray(block.categories) ? block.categories : [];
      for (const cat of categories.slice(0, 4)) {
        if (typeof cat === 'string' && cat.includes(':')) {
          const [left, right] = cat.split(':').map((s) => s.trim());
          if (left && right) pairs.push({ left: left.slice(0, 12), right: right.slice(0, 12) });
        }
      }
    }

    return pairs.slice(0, 8);
  }

  /** Infer background type from text content */
  private inferLegacyBgType(text: string): string {
    if (/(夜|晚上|星星|月亮|黑夜|睡觉)/.test(text)) return 'night';
    if (/(春|花开|发芽|播种)/.test(text)) return 'spring';
    if (/(夏|热|太阳大|游泳|西瓜)/.test(text)) return 'summer';
    if (/(秋|落叶|丰收|果实)/.test(text)) return 'autumn';
    if (/(冬|雪|冷|棉袄)/.test(text)) return 'winter';
    if (/(教室|课堂|室内|家|房间|厨房)/.test(text)) return 'indoor';
    return 'day';
  }

  private computeCacheKey(content: Content, payload: Record<string, any>): string {
    const seed = JSON.stringify({
      contentId: content.id,
      updatedAt: content.updatedAt || '',
      payload,
    });
    return createHash('sha1').update(seed).digest('hex');
  }

  private resolveProviderName(engine: RenderAttemptEngine): string {
    if (engine === 'dynamic-remotion') {
      return 'remotion-dynamic';
    }
    if (engine === 'hyperframes') {
      return String(process.env.HYPERFRAMES_PROVIDER_NAME || 'hyperframes').trim();
    }
    if (engine === 'remotion') {
      return 'remotion';
    }
    return String(process.env.VIDEO_PROVIDER_NAME || 'third_party').trim();
  }

  private normalizeRenderEngine(value: unknown): VideoRenderEngine {
    const raw = String(value || 'auto')
      .trim()
      .toLowerCase();
    if (raw === 'hyperframes') return 'hyperframes';
    if (raw === 'remotion') return 'remotion';
    return 'auto';
  }

  private resolveEngineOrder(engine: VideoRenderEngine): RenderAttemptEngine[] {
    if (engine === 'hyperframes') return ['hyperframes'];
    if (engine === 'remotion') return ['dynamic-remotion', 'remotion'];
    return [...FALLBACK_RENDER_ENGINES];
  }

  private isThirdPartyEnabled(): boolean {
    const baseUrl = String(process.env.VIDEO_PROVIDER_BASE_URL || '').trim();
    const mode = String(process.env.VIDEO_PROVIDER_MODE || 'hybrid')
      .trim()
      .toLowerCase();
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
    const mode = String(process.env.VIDEO_PROVIDER_CREATE_BODY_MODE || 'generic')
      .trim()
      .toLowerCase();

    if (mode === 'raw_payload') {
      return payload;
    }
    if (mode === 'wrapped_payload') {
      const inputKey =
        String(process.env.VIDEO_PROVIDER_CREATE_INPUT_KEY || 'input').trim() || 'input';
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

    if (
      hostname === '::1' ||
      hostname.startsWith('fe80:') ||
      hostname.startsWith('fc') ||
      hostname.startsWith('fd')
    ) {
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
    const status = String(statusRaw || '')
      .trim()
      .toLowerCase();
    if (!status) return 'unknown';
    if (['queued', 'pending', 'waiting'].includes(status)) return 'queued';
    if (['running', 'processing', 'in_progress', 'started', 'progress'].includes(status))
      return 'processing';
    if (['completed', 'done', 'success', 'succeeded', 'finished'].includes(status))
      return 'completed';
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
      .reduce(
        (acc: any, key: string) => (acc && typeof acc === 'object' ? acc[key] : undefined),
        source,
      );
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

  private toText(value: any, fallback = ''): string {
    if (value == null) return fallback;
    const text = String(value).replace(/\s+/g, ' ').trim();
    return text || fallback;
  }

  private toBool(value: any, fallback: boolean): boolean {
    if (value == null) return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
  }
}
