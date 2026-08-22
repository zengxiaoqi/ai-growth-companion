import { Injectable, Logger } from '@nestjs/common';
import { spawn, execFile, type ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { promisify } from 'util';
import * as path from 'path';
import type { VideoGenerationTask } from '../../database/entities/video-generation-task.entity';
import { VoiceService } from '../voice/voice.service';

const execFileAsync = promisify(execFile);

/**
 * DshBridgeService - renders a teaching video by delegating to DSH headless.
 *
 * This is the 'DSH as enhanced rendering backend' bridge: lingxi keeps the
 * product surface (queue / cache / TTS / auth) while DSH authors a bespoke
 * Remotion composition and renders a topic-specific mp4.
 *
 * Contract (docs/video/DSH-增强渲染后端-架构设计.md):
 *   - Mode-1 (final): DSH renders the mp4 directly and hands it back.
 *   - DSH uses its OWN model/credentials (not lingxi's .env).
 *   - Concurrency is bounded by an in-process semaphore (VIDEO_DSH_MAX_CONCURRENCY).
 *
 * Child process protocol:
 *   input : spawn '<dsh>' --profile headless '<prompt>' with cwd = repo root,
 *           plus an input.json written into an isolated per-task work dir.
 *   output: the DSH agent prints ONE machine-parseable JSON line as its final
 *           stdout line: { status:'ok', manifestPath } (or failed).
 */
@Injectable()
export class DshBridgeService {
  private readonly logger = new Logger(DshBridgeService.name);

  constructor(private readonly voiceService: VoiceService) {}

  // Paths (anchored on __dirname so dev/ts and dist builds agree)
  private readonly repoRoot = path.resolve(__dirname, '../../../../..');
  private readonly workRoot = path.join(this.repoRoot, 'storage', 'dsh-video');
  private readonly dshBin = String(process.env.DSH_BIN || 'dsh').trim();
  private readonly dshProfile = String(process.env.DSH_PROFILE || 'headless').trim();

  // Env-driven limits
  private readonly enabled = this.toBool(process.env.VIDEO_DSH_ENABLED, true);
  private readonly hardTimeoutMs = this.toInt(
    process.env.VIDEO_DSH_TIMEOUT_MS,
    25 * 60 * 1000,
    60_000,
    60 * 60 * 1000,
  );
  private readonly maxConcurrent = this.toInt(process.env.VIDEO_DSH_MAX_CONCURRENCY, 2, 1, 8);

  // Concurrency semaphore
  private activeRuns = 0;
  private readonly waiters: Array<() => void> = [];

  async renderWithDsh(
    task: VideoGenerationTask,
    payload: Record<string, any>,
  ): Promise<Buffer | null> {
    if (!this.enabled) {
      this.logger.warn('[DshBridge] taskId=' + task.id + ' skipped: VIDEO_DSH_ENABLED=false');
      return null;
    }
    const topic = String(payload?.topic || '').trim();
    if (!topic) {
      this.logger.warn('[DshBridge] taskId=' + task.id + ' skipped: no topic in payload');
      return null;
    }

    const workDir = path.join(this.workRoot, task.cacheKey);
    await fs.mkdir(workDir, { recursive: true });

    // 为每个场景的 narration 文本预生成 TTS 配音（DSH 只负责画面，不重新生成音频）
    const narrationSrcPaths = await this.generateNarrationAudio(payload, workDir);

    const inputPath = path.join(workDir, 'input.json');
    await fs.writeFile(
      inputPath,
      JSON.stringify(this.buildInput(payload, workDir, narrationSrcPaths), null, 2),
      'utf-8',
    );

    await this.acquire();
    try {
      this.logger.log(
        '[DshBridge] taskId=' + task.id + ' rendering via DSH, topic="' + topic + '"',
      );
      const prompt = this.buildPrompt(inputPath, workDir);
      const run = await this.runDshOnce(prompt);
      if (run.timedOut) {
        this.logger.error(
          '[DshBridge] taskId=' +
            task.id +
            ' DSH render timed out after ' +
            this.hardTimeoutMs +
            'ms',
        );
        return null;
      }
      if (run.exitCode !== 0) {
        this.logger.warn(
          '[DshBridge] taskId=' +
            task.id +
            ' DSH exited ' +
            run.exitCode +
            ': ' +
            (run.stderr || run.stdout).slice(0, 500),
        );
        return null;
      }
      const result = this.extractResultJson(run.stdout);
      if (!result || result.status !== 'ok' || typeof result.manifestPath !== 'string') {
        this.logger.warn(
          '[DshBridge] taskId=' +
            task.id +
            ' DSH returned no ok manifest: ' +
            run.stdout.slice(-500),
        );
        return null;
      }
      return this.readVideoFromManifest(result.manifestPath, topic);
    } catch (error: any) {
      this.logger.warn('[DshBridge] taskId=' + task.id + ' failed: ' + (error?.message || error));
      return null;
    } finally {
      this.release();
    }
  }

  /**
   * 为每个场景的 narration 文本调用 TTS 生成配音 mp3，返回绝对路径数组（与 shots 一一对应）。
   * 单条配音失败时对应位置放空字符串（DSH 侧对该场景跳过配音）。
   */
  private async generateNarrationAudio(
    payload: Record<string, any>,
    workDir: string,
  ): Promise<string[]> {
    const shots = Array.isArray(payload?.videoLesson?.shots)
      ? payload.videoLesson.shots
      : Array.isArray(payload?.visualStory?.scenes)
        ? payload.visualStory.scenes
        : [];

    const paths: string[] = [];
    for (let i = 0; i < shots.length; i++) {
      const narration = String(shots[i]?.narration ?? '').trim();
      if (!narration) {
        paths.push('');
        continue;
      }
      try {
        const buffer = await this.voiceService.textToSpeech(narration);
        if (!buffer || buffer.length === 0) {
          paths.push('');
          continue;
        }
        const filename = `narration-${i + 1}.mp3`;
        const filepath = path.join(workDir, filename);
        await fs.writeFile(filepath, buffer);
        paths.push(filepath);
        this.logger.log(
          `[DshBridge] narration generated for scene ${i + 1} (${buffer.length} bytes): ${filename}`,
        );
      } catch (error: any) {
        this.logger.warn(`[DshBridge] TTS failed for scene ${i + 1}: ${error?.message || error}`);
        paths.push('');
      }
    }
    return paths;
  }

  private buildInput(
    payload: Record<string, any>,
    workDir: string,
    narrationSrcPaths: string[],
  ): Record<string, any> {
    const shots = Array.isArray(payload?.videoLesson?.shots)
      ? payload.videoLesson.shots
      : Array.isArray(payload?.visualStory?.scenes)
        ? payload.visualStory.scenes
        : [];
    const durationSec = this.pickNumber(
      payload?.durationSec,
      payload?.videoLesson?.totalDurationSec,
      payload?.visualStory?.totalDurationSec,
      60,
    );
    const sceneCount = this.pickNumber(payload?.sceneCount, shots.length, 5);
    return {
      topic: payload?.topic,
      title: payload?.title || payload?.topic,
      summary: payload?.summary || '',
      ageGroup: payload?.ageGroup || '5-6',
      domain: payload?.domain,
      style: payload?.style,
      durationSec,
      sceneCount: Math.max(3, Math.min(8, sceneCount)),
      storyboard: shots.length > 0 ? { shots } : undefined,
      narrationSrc: narrationSrcPaths.some((p) => p && p.length > 0)
        ? narrationSrcPaths
        : undefined,
      outputDir: workDir,
      width: payload?.width || 1920,
      height: payload?.height || 1080,
      fps: payload?.fps || 30,
    };
  }

  private buildPrompt(inputPath: string, workDir: string): string {
    return [
      'Use the teaching-video skill to generate a teaching video from the input below.',
      'The task input is already written at this absolute path: ' + inputPath,
      'Write the rendered mp4 and manifest.json into this absolute directory: ' + workDir,
      'The Remotion project lives at: ' + path.join(this.repoRoot, 'src', 'video-remotion'),
      'Your FINAL message must contain exactly one line of JSON and nothing else, one of:',
      '{"status":"ok","manifestPath":"<absolute manifest.json path>"}',
      '{"status":"failed","error":"<short reason>"}',
    ].join(String.fromCharCode(10));
  }

  private runDshOnce(
    prompt: string,
  ): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let settled = false;
      let sigkillTimer: NodeJS.Timeout | null = null;

      let child: ChildProcess;
      try {
        child = spawn(this.dshBin, ['--profile', this.dshProfile, prompt], {
          cwd: this.repoRoot,
          env: { ...process.env, DSH_TOOLS_MODE: process.env.DSH_TOOLS_MODE || 'native' },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error: any) {
        resolve({ stdout, stderr, exitCode: -1, timedOut: false });
        return;
      }

      const done = (exitCode: number) => {
        if (settled) return;
        settled = true;
        if (sigkillTimer) clearTimeout(sigkillTimer);
        resolve({ stdout, stderr, exitCode, timedOut });
      };

      const hardTimer = setTimeout(() => {
        timedOut = true;
        this.logger.error('[DshBridge] DSH render timeout - SIGTERM pid=' + child.pid);
        child.kill('SIGTERM');
        sigkillTimer = setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
        }, 2000);
      }, this.hardTimeoutMs);

      child.stdout?.on('data', (d) => (stdout += d.toString()));
      child.stderr?.on('data', (d) => (stderr += d.toString()));
      child.on('error', (err: any) => {
        stderr += String(err?.message || err);
        clearTimeout(hardTimer);
        done(-1);
      });
      child.on('close', (code) => {
        clearTimeout(hardTimer);
        done(code ?? -1);
      });
    });
  }

  private extractResultJson(stdout: string): { status?: string; manifestPath?: string } | null {
    const lines = stdout
      .split(String.fromCharCode(10))
      .map((l) => l.trim())
      .filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = lines[i].match(/\{[\s\S]*\}/);
      if (!m) continue;
      try {
        const obj = JSON.parse(m[0]);
        if (obj && typeof obj === 'object' && ('status' in obj || 'manifestPath' in obj))
          return obj;
      } catch {
        /* not JSON - keep scanning upward */
      }
    }
    return null;
  }

  private async readVideoFromManifest(manifestPath: string, topic: string): Promise<Buffer | null> {
    try {
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
      const videoPath = manifest?.output?.videoPath;
      if (!videoPath || typeof videoPath !== 'string') {
        this.logger.warn('[DshBridge] manifest has no output.videoPath');
        return null;
      }
      const stat = await fs.stat(videoPath);
      if (stat.size <= 0) {
        this.logger.warn('[DshBridge] produced empty video: ' + videoPath);
        return null;
      }

      // DSH 用 Remotion 渲染的 mp4 常是 full-range YUV（pix_fmt=yuvj420p），
      // iOS Safari / 多数 Web <video> 无法解码 → 画面停在首帧黑屏、时长 00:00。
      // 检测并在必要时用 ffmpeg 转码为 limited-range yuv420p 保证浏览器兼容。
      const compatiblePath = await this.ensureBrowserCompatible(videoPath);
      const finalStat = await fs.stat(compatiblePath);

      this.logger.log(
        '[DshBridge] read video ' +
          compatiblePath +
          ' (' +
          finalStat.size +
          ' bytes) for "' +
          topic +
          '"',
      );
      return await fs.readFile(compatiblePath);
    } catch (error: any) {
      this.logger.warn('[DshBridge] manifest read failed: ' + (error?.message || error));
      return null;
    }
  }

  /**
   * 确保视频是浏览器可解码的 limited-range yuv420p。
   * DSH 用 Remotion/ffmpeg 渲染常输出 full-range yuvj420p，iOS Safari / Web <video>
   * 无法解码（画面停在首帧黑屏、时长 00:00）。检测到 full-range 就用 ffmpeg
   * 转码，否则原样返回。转码失败时降级返回原文件（不阻断渲染结果）。
   * public：供 LessonVideoQueueService 对任意引擎输出统一做兼容转码调用。
   */
  async ensureBrowserCompatible(videoPath: string): Promise<string> {
    try {
      const pixFmt = await this.detectPixFmt(videoPath);
      if (!pixFmt) return videoPath;
      const normalized = pixFmt.trim().toLowerCase();
      // yuvj420p / yuvj422p / yuvj444p = full-range（j = JPEG range），需转码
      if (!normalized.startsWith('yuvj')) return videoPath;

      const outPath = videoPath.replace(/\.mp4$/i, '') + '.compat.mp4';
      this.logger.log(
        '[DshBridge] detected full-range ' + pixFmt + ' -> transcoding to yuv420p: ' + videoPath,
      );
      await this.transcodeToYuv420p(videoPath, outPath);
      return outPath;
    } catch (error: any) {
      this.logger.warn(
        '[DshBridge] ensureBrowserCompatible failed, returning original: ' +
          (error?.message || error),
      );
      return videoPath;
    }
  }

  private async detectPixFmt(videoPath: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=pix_fmt',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        videoPath,
      ]);
      return String(stdout).trim() || null;
    } catch {
      return null;
    }
  }

  private async transcodeToYuv420p(src: string, dst: string): Promise<void> {
    // 重编码为「720p + limited-range bt709 yuv420p + 低码率」，保证移动端在慢速网络
    // （CF 免费 tunnel 国际带宽仅 ~0.2MB/s）下也能流畅加载播放。
    // 关键：DSH 源视频是 full-range yuvj420p、color_primaries=unknown、1080p 高码率，
    // 若不处理——(1) 移动端硬件解码器对 full-range 支持差；(2) libx264 会推导出错误
    // 的 bt470bg 矩阵；(3) 18MB 高码率在慢速网络下加载不动。这里一次性全部归位。
    await execFileAsync('ffmpeg', [
      '-y',
      '-v',
      'error',
      '-i',
      src,
      '-vf',
      'scale=1280:720,setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709',
      '-c:v',
      'libx264',
      '-crf',
      '23',
      '-preset',
      'fast',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '96k',
      '-movflags',
      '+faststart',
      dst,
    ]);
  }

  private async acquire(): Promise<void> {
    if (this.activeRuns < this.maxConcurrent) {
      this.activeRuns += 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.activeRuns += 1;
  }

  private release(): void {
    this.activeRuns -= 1;
    const next = this.waiters.shift();
    if (next) next();
  }

  private pickNumber(...values: Array<unknown>): number {
    for (const v of values) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return 60;
  }

  private toInt(raw: string | undefined, def: number, min: number, max: number): number {
    const n = Number(raw);
    if (!Number.isFinite(n)) return def;
    return Math.max(min, Math.min(max, Math.floor(n)));
  }

  private toBool(raw: string | undefined, def: boolean): boolean {
    if (raw === undefined) return def;
    return !['0', 'false', 'no', 'off'].includes(raw.trim().toLowerCase());
  }
}
