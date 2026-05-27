import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { VideoGenerationTask } from '../../database/entities/video-generation-task.entity';

type HyperframesShot = {
  title: string;
  caption: string;
  narration: string;
  durationSec: number;
};

/** Domain color palettes reused from RemotionRenderService */
const DOMAIN_PALETTES: Record<
  string,
  { bg: string; accent: string; bgAlt: string; accentAlt: string }
> = {
  language: {
    bg: '#FFF5F5',
    accent: '#FF6B6B',
    bgAlt: '#FFF0F6',
    accentAlt: '#9B59B6',
  },
  math: {
    bg: '#EBF5FF',
    accent: '#4D96FF',
    bgAlt: '#E8F8FF',
    accentAlt: '#00B4D8',
  },
  science: {
    bg: '#E8F8FF',
    accent: '#00B4D8',
    bgAlt: '#F0FFF4',
    accentAlt: '#6BCB77',
  },
  art: {
    bg: '#FFF0F6',
    accent: '#FF6B9D',
    bgAlt: '#FFF5F5',
    accentAlt: '#FFD93D',
  },
  social: {
    bg: '#FFFBEB',
    accent: '#FFD93D',
    bgAlt: '#F0FFF4',
    accentAlt: '#6BCB77',
  },
};

const DEFAULT_PALETTE = DOMAIN_PALETTES.language;

const ENTRANCE_PATTERNS = [
  { from: '{ opacity: 0, y: 60 }', ease: '"power3.out"' },
  { from: '{ opacity: 0, x: -80 }', ease: '"expo.out"' },
  { from: '{ opacity: 0, scale: 0.7 }', ease: '"back.out(1.6)"' },
  { from: '{ opacity: 0, y: -50, rotation: -5 }', ease: '"power2.out"' },
  { from: '{ opacity: 0, x: 80, scale: 0.9 }', ease: '"power3.out"' },
  { from: '{ opacity: 0, y: 40, scale: 0.95 }', ease: '"sine.out"' },
];

const DECORATIVE_SHAPES = ['circle', 'triangle', 'square', 'star', 'diamond'];

@Injectable()
export class HyperframesRenderService {
  private readonly logger = new Logger(HyperframesRenderService.name);
  private readonly cliCmd = String(process.env.HYPERFRAMES_CLI_COMMAND || 'npx').trim();
  private readonly cliArgsPrefix = String(process.env.HYPERFRAMES_CLI_ARGS_PREFIX || '')
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean);
  private readonly renderTimeoutMs = this.toInt(
    process.env.HYPERFRAMES_RENDER_TIMEOUT_MS,
    5 * 60 * 1000,
    15_000,
    30 * 60 * 1000,
  );
  private readonly enabledByDefault = this.toBool(process.env.HYPERFRAMES_ENABLED, true);

  async renderLessonVideo(
    task: VideoGenerationTask,
    payload: Record<string, any>,
    onProgress?: (percent: number) => Promise<void> | void,
  ): Promise<Buffer> {
    if (!this.enabledByDefault) {
      this.logger.warn(`[renderLessonVideo] HyperFrames disabled by HYPERFRAMES_ENABLED env`);
      throw new Error('HYPERFRAMES_DISABLED');
    }

    const shots = this.buildShots(payload);
    if (!shots.length) {
      this.logger.warn(
        `[renderLessonVideo] taskId=${task.id} no shots built from payload — videoLesson.shots=${Array.isArray(payload?.videoLesson?.shots) ? payload.videoLesson.shots.length : 0}, watchScene.scenes=${Array.isArray(payload?.watchScene?.scenes) ? payload.watchScene.scenes.length : 0}, visualStory.scenes=${Array.isArray(payload?.visualStory?.scenes) ? payload.visualStory.scenes.length : 0}`,
      );
      throw new Error('HYPERFRAMES_EMPTY_SHOTS');
    }

    const domain = String(payload?.domain || 'language').toLowerCase();
    const palette = DOMAIN_PALETTES[domain] || DEFAULT_PALETTE;

    this.logger.log(
      `[renderLessonVideo] taskId=${task.id} building HTML composition: domain=${domain}, shots=${shots.length}, palette.bg=${palette.bg}, palette.accent=${palette.accent}`,
    );
    this.logger.debug(
      `[renderLessonVideo] taskId=${task.id} shots detail: ${shots.map((s, i) => `#${i + 1} "${s.title}" (${s.durationSec}s)`).join(', ')}`,
    );

    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lingxi-hyperframes-'));
    const outputPath = path.join(projectDir, `${task.cacheKey || `task-${task.id}`}.mp4`);

    this.logger.debug(
      `[renderLessonVideo] taskId=${task.id} projectDir=${projectDir}, outputPath=${outputPath}`,
    );

    try {
      const totalDuration = shots.reduce((sum, shot) => sum + Math.max(1, shot.durationSec), 0);
      const html = this.buildIndexHtml(shots, totalDuration, palette);
      const htmlSize = Buffer.byteLength(html, 'utf-8');
      this.logger.log(
        `[renderLessonVideo] taskId=${task.id} HTML generated: ${htmlSize} bytes, totalDuration=${totalDuration}s, shots=${shots.length}`,
      );
      await fs.writeFile(path.join(projectDir, 'index.html'), html, 'utf-8');
      if (onProgress) await onProgress(10);

      this.logger.log(
        `[renderLessonVideo] taskId=${task.id} starting CLI render: cmd=${this.cliCmd}, timeout=${this.renderTimeoutMs}ms`,
      );
      await this.runHyperframesRender(projectDir, outputPath);
      if (onProgress) await onProgress(95);

      const buffer = await fs.readFile(outputPath);
      this.logger.log(
        `[renderLessonVideo] taskId=${task.id} render complete: output=${buffer.length} bytes`,
      );
      return buffer;
    } catch (error: any) {
      this.logger.error(
        `[renderLessonVideo] taskId=${task.id} FAILED: ${error?.message || 'unknown'}`,
      );
      throw error;
    } finally {
      await this.safeRemove(projectDir);
    }
  }

  private buildShots(payload: Record<string, any>): HyperframesShot[] {
    const fromVideoLesson = Array.isArray(payload?.videoLesson?.shots)
      ? payload.videoLesson.shots
      : [];
    const fromWatchScenes = Array.isArray(payload?.watchScene?.scenes)
      ? payload.watchScene.scenes
      : [];
    const fromVisualStory = Array.isArray(payload?.visualStory?.scenes)
      ? payload.visualStory.scenes
      : [];

    const mapped = (
      fromVideoLesson.length > 0
        ? fromVideoLesson
        : fromWatchScenes.length > 0
          ? fromWatchScenes
          : fromVisualStory
    )
      .map((item: any, idx: number) => {
        const title = this.toText(item?.title || item?.shot, `场景 ${idx + 1}`);
        const narration = this.toText(item?.narration, this.toText(item?.caption, ''));
        const caption = this.toText(item?.caption, title).slice(0, 40);
        const durationSec = this.toInt(item?.durationSec, 8, 2, 30);

        if (!title && !narration && !caption) return null;
        return {
          title: title.slice(0, 40),
          caption,
          narration: narration.slice(0, 180),
          durationSec,
        };
      })
      .filter((item: HyperframesShot | null): item is HyperframesShot => !!item);

    return mapped.slice(0, 16);
  }

  private buildIndexHtml(
    shots: HyperframesShot[],
    totalDuration: number,
    palette: (typeof DOMAIN_PALETTES)[string],
  ): string {
    const transitionDur = 0.4;
    let cursor = 0;

    const clipHtml: string[] = [];
    const transitionHtml: string[] = [];
    const entranceStatements: string[] = [];
    const exitStatements: string[] = [];
    const ambientStatements: string[] = [];
    const sceneCursors: number[] = [];

    shots.forEach((shot, index) => {
      const id = `scene-${index + 1}`;
      const isLast = index === shots.length - 1;
      const start = cursor;
      sceneCursors.push(start);
      cursor += shot.durationSec;

      const entranceIdx = index % ENTRANCE_PATTERNS.length;
      const titleEntrance = ENTRANCE_PATTERNS[(entranceIdx + 2) % ENTRANCE_PATTERNS.length];
      const captionEntrance = ENTRANCE_PATTERNS[(entranceIdx + 4) % ENTRANCE_PATTERNS.length];

      const decoratives = this.buildDecoratives(id, index, palette, ambientStatements);

      clipHtml.push(
        `<section id="${id}" class="scene" data-start="${start}" data-duration="${shot.durationSec}" data-track-index="${index * 2 + 1}">`,
        `  <div class="scene-content">`,
        ...decoratives,
        `    <h1 class="title">${this.escapeHtml(shot.title)}</h1>`,
        `    <p class="caption">${this.escapeHtml(shot.caption)}</p>`,
        shot.narration ? `    <p class="narration">${this.escapeHtml(shot.narration)}</p>` : '',
        `  </div>`,
        `</section>`,
      );

      const titleStart = start + 0.3;
      const captionStart = start + 0.55;
      entranceStatements.push(
        `tl.from("#${id} .title", ${titleEntrance.from}, { duration: 0.6, ease: ${titleEntrance.ease} }, ${titleStart});`,
      );
      entranceStatements.push(
        `tl.from("#${id} .caption", ${captionEntrance.from}, { duration: 0.5, ease: ${captionEntrance.ease} }, ${captionStart});`,
      );
      if (shot.narration) {
        entranceStatements.push(
          `tl.from("#${id} .narration", { opacity: 0, y: 20 }, { duration: 0.4, ease: "power2.out" }, ${start + 0.75});`,
        );
      }

      if (isLast) {
        exitStatements.push(
          `tl.to("#${id} .scene-content", { opacity: 0, duration: 0.8, ease: "power2.inOut" }, ${cursor - 1.0});`,
        );
      }

      if (!isLast) {
        const transId = `trans-${index + 1}`;
        const transStart = cursor - transitionDur;
        transitionHtml.push(
          `<div id="${transId}" class="transition transition-${this.transitionType(index)}" data-start="${transStart}" data-duration="${transitionDur}" data-track-index="${index * 2 + 2}"></div>`,
        );
        cursor += transitionDur;
      }
    });

    return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1.0" />
    <title>Lingxi HyperFrames Lesson</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@400;600;700&family=Nunito:wght@400;600;700&display=swap');

      * { box-sizing: border-box; margin: 0; padding: 0; }
      html, body { width: 100%; height: 100%; }

      [data-composition-id="lesson-video"] {
        position: relative;
        width: 1920px;
        height: 1080px;
        overflow: hidden;
        background: ${palette.bg};
        font-family: "Fredoka", "Nunito", "Noto Sans SC", "Microsoft YaHei", sans-serif;
      }

      .scene {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .scene-content {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        padding: 100px 180px;
        gap: 28px;
        text-align: center;
        z-index: 2;
      }

      .title {
        font-family: "Fredoka", "Noto Sans SC", sans-serif;
        font-size: 96px;
        font-weight: 700;
        line-height: 1.15;
        color: ${palette.accent};
        text-shadow: 0 2px 8px rgba(0,0,0,0.06);
      }

      .caption {
        font-family: "Nunito", "Noto Sans SC", sans-serif;
        font-size: 52px;
        font-weight: 600;
        line-height: 1.25;
        color: #1a1a1a;
      }

      .narration {
        font-family: "Nunito", "Noto Sans SC", sans-serif;
        font-size: 36px;
        font-weight: 400;
        line-height: 1.5;
        color: #3a3a3a;
        max-width: 1200px;
      }

      /* Decorative shapes */
      .deco {
        position: absolute;
        pointer-events: none;
        z-index: 1;
      }
      .deco-circle {
        border-radius: 50%;
        opacity: 0.12;
      }
      .deco-square {
        border-radius: 16px;
        opacity: 0.08;
      }
      .deco-triangle {
        width: 0; height: 0;
        opacity: 0.1;
      }
      .deco-diamond {
        border-radius: 8px;
        opacity: 0.09;
      }

      /* Ghost text background */
      .ghost-text {
        position: absolute;
        font-size: 180px;
        font-weight: 700;
        opacity: 0.03;
        color: ${palette.accent};
        z-index: 0;
        pointer-events: none;
        white-space: nowrap;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
      }

      /* Scene transitions */
      .transition {
        position: absolute;
        inset: 0;
        z-index: 10;
        pointer-events: none;
      }
      .transition-fade {
        background: ${palette.bgAlt};
      }
      .transition-slide {
        background: ${palette.bgAlt};
      }
      .transition-wipe {
        background: ${palette.bgAlt};
      }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="lesson-video"
      data-start="0"
      data-duration="${Math.max(2, totalDuration + (shots.length - 1) * transitionDur)}"
      data-width="1920"
      data-height="1080"
    >
      ${clipHtml.join('\n      ')}
      ${transitionHtml.join('\n      ')}
    </div>

    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });

      /* Entrance animations */
      ${entranceStatements.join('\n      ')}

      /* Exit animation (final scene only) */
      ${exitStatements.join('\n      ')}

      /* Ambient decorative animations */
      ${ambientStatements.join('\n      ')}

      /* Transitions */
${shots
  .slice(0, -1)
  .map((_, i) => {
    const transId = `trans-${i + 1}`;
    const type = this.transitionType(i);
    const transStart = sceneCursors[i] + shots[i].durationSec - transitionDur;
    if (type === 'fade') {
      return `      tl.fromTo("#${transId}", { opacity: 0 }, { opacity: 1, duration: ${transitionDur / 2}, ease: "power1.inOut" }, ${transStart});
      tl.to("#${transId}", { opacity: 0, duration: ${transitionDur / 2}, ease: "power1.inOut" });`;
    }
    if (type === 'slide') {
      return `      tl.fromTo("#${transId}", { xPercent: 100 }, { xPercent: 0, duration: ${transitionDur}, ease: "power2.inOut" }, ${transStart});`;
    }
    return `      tl.fromTo("#${transId}", { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: ${transitionDur}, ease: "power2.inOut" }, ${transStart});`;
  })
  .join('\n')}

      window.__timelines["lesson-video"] = tl;
    </script>
  </body>
</html>`;
  }

  private buildDecoratives(
    sceneId: string,
    sceneIndex: number,
    palette: (typeof DOMAIN_PALETTES)[string],
    ambientStatements: string[],
  ): string[] {
    const count = 3 + (sceneIndex % 3);
    const html: string[] = [];

    html.push(`<span class="ghost-text">${this.escapeHtml(palette.accent)}</span>`);

    for (let i = 0; i < count; i++) {
      const decoId = `${sceneId}-deco-${i + 1}`;
      const shape = DECORATIVE_SHAPES[(sceneIndex + i) % DECORATIVE_SHAPES.length];
      const size = 60 + ((sceneIndex * 37 + i * 53) % 120);
      const left = 5 + ((sceneIndex * 29 + i * 41) % 85);
      const top = 5 + ((sceneIndex * 31 + i * 47) % 80);
      const color = i % 2 === 0 ? palette.accent : palette.accentAlt;

      if (shape === 'circle') {
        html.push(
          `<div id="${decoId}" class="deco deco-circle" style="width:${size}px;height:${size}px;left:${left}%;top:${top}%;background:${color};"></div>`,
        );
      } else if (shape === 'square') {
        html.push(
          `<div id="${decoId}" class="deco deco-square" style="width:${size}px;height:${size}px;left:${left}%;top:${top}%;background:${color};transform:rotate(${(sceneIndex * 15 + i * 20) % 45}deg);"></div>`,
        );
      } else if (shape === 'diamond') {
        html.push(
          `<div id="${decoId}" class="deco deco-diamond" style="width:${size}px;height:${size}px;left:${left}%;top:${top}%;background:${color};transform:rotate(45deg);"></div>`,
        );
      } else if (shape === 'triangle') {
        const half = Math.trunc(size / 2);
        html.push(
          `<div id="${decoId}" class="deco deco-triangle" style="left:${left}%;top:${top}%;border-left:${half}px solid transparent;border-right:${half}px solid transparent;border-bottom:${size}px solid ${color};"></div>`,
        );
      } else {
        html.push(
          `<div id="${decoId}" class="deco deco-circle" style="width:${size}px;height:${size}px;left:${left}%;top:${top}%;background:${color};border-radius:50%;"></div>`,
        );
      }

      const breathDur = 2.5 + (i % 3) * 0.8;
      const scaleTarget = 1.04 + (i % 3) * 0.03;
      ambientStatements.push(
        `tl.to("#${decoId}", { scale: ${scaleTarget}, duration: ${breathDur}, ease: "sine.inOut", repeat: 1, yoyo: true }, 0);`,
      );
    }

    return html;
  }

  private transitionType(index: number): 'fade' | 'slide' | 'wipe' {
    const types: Array<'fade' | 'slide' | 'wipe'> = ['fade', 'slide', 'wipe'];
    return types[index % types.length];
  }

  private async runHyperframesRender(projectDir: string, outputPath: string): Promise<void> {
    const args = [
      ...this.cliArgsPrefix,
      'hyperframes',
      'render',
      '--quality',
      'draft',
      '--output',
      outputPath,
    ];
    this.logger.log(
      `[runHyperframesRender] cmd=${this.cliCmd} ${args.join(' ')}, cwd=${projectDir}, timeout=${this.renderTimeoutMs}ms`,
    );

    await new Promise<void>((resolve, reject) => {
      const child = spawn(this.cliCmd, args, {
        cwd: projectDir,
        windowsHide: true,
        shell: process.platform === 'win32',
      });

      const timer = setTimeout(() => {
        this.logger.warn(
          `[runHyperframesRender] render timed out after ${this.renderTimeoutMs}ms, sending SIGTERM to pid=${child.pid}`,
        );
        if (child.pid && !child.killed) {
          child.kill('SIGTERM');
        }

        // Force SIGKILL after 2 seconds if process is still alive
        setTimeout(() => {
          if (child.pid && !child.killed) {
            this.logger.error(
              `[runHyperframesRender] SIGTERM ineffective, sending SIGKILL to pid=${child.pid}`,
            );
            child.kill('SIGKILL');
          }
        }, 2000);
      }, this.renderTimeoutMs);

      let stderr = '';
      let stdout = '';
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        this.logger.error(
          `[runHyperframesRender] spawn error: ${error.message}. Check if "${this.cliCmd}" is installed and accessible in PATH.`,
        );
        reject(error);
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          if (stdout.trim()) {
            this.logger.debug(`[runHyperframesRender] stdout: ${stdout.trim().slice(0, 500)}`);
          }
          resolve();
          return;
        }
        this.logger.error(
          `[runHyperframesRender] exited with code=${code}. stderr: ${stderr.trim().slice(0, 800)}`,
        );
        reject(
          new Error(`hyperframes render failed (code=${code}): ${stderr.trim().slice(0, 800)}`),
        );
      });
    });
  }

  private async safeRemove(targetPath: string): Promise<void> {
    try {
      await fs.rm(targetPath, { recursive: true, force: true });
    } catch {}
  }

  private escapeHtml(value: string): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private toText(value: unknown, fallback = ''): string {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
    return fallback;
  }

  private toInt(value: unknown, fallback: number, min: number, max: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(parsed)));
  }

  private toBool(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
      if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    }
    return fallback;
  }
}
