import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GenerateVideoDataTool, TeachingVideoData } from '../ai/agent/tools/generate-video-data';
import { deriveWatchSceneDocument } from './lesson-scene';

export type ResolvedComposition = {
  compositionId: string;
  inputProps: Record<string, any>;
};

type ResolveCompositionInput = string | Record<string, any>;

type LessonVideoPayload = {
  topic: string;
  title: string;
  summary: string;
  ageGroup?: string;
  watchScene?: Record<string, any> | null;
  visualStory?: Record<string, any>;
  videoLesson?: Record<string, any>;
};

const BG_PALETTE = [
  '#FFF5F5', '#FFFBEB', '#EBF5FF', '#E8F8FF', '#F8F0FF',
  '#F0FFF4', '#FFF0F6', '#FFF8F0', '#F0F0FF', '#FFF0E8',
] as const;

const ACCENT_PALETTE = [
  '#FF6B6B', '#FFD93D', '#4D96FF', '#00B4D8', '#9B59B6',
  '#6BCB77', '#FF6B9D', '#E67E22', '#667EEA', '#FF9A76',
] as const;

const EMOJI_PALETTE = ['✨', '📘', '🌟', '🎈', '🧠', '🎨', '🔍', '🎵'] as const;

@Injectable()
export class RemotionRenderService {
  private readonly logger = new Logger(RemotionRenderService.name);
  private readonly remotionDir = path.resolve(__dirname, '../../../../video-remotion');

  constructor(private readonly generateVideoDataTool: GenerateVideoDataTool) {}

  async resolveComposition(
    input: ResolveCompositionInput,
    ageGroup?: string,
  ): Promise<ResolvedComposition> {
    const payload = this.normalizePayload(input, ageGroup);

    if (this.hasLessonVideoSource(payload)) {
      return {
        compositionId: 'TopicVideo',
        inputProps: this.buildVideoDataFromLesson(payload),
      };
    }

    if (this.isNumbersTopic(payload.topic)) {
      return { compositionId: 'NumbersVideo', inputProps: {} };
    }

    const videoData = await this.generateVideoDataTool.execute({
      topic: payload.topic,
      ageGroup: payload.ageGroup === '3-4' ? '3-4' : '5-6',
    });

    return { compositionId: 'TopicVideo', inputProps: videoData };
  }

  private normalizePayload(input: ResolveCompositionInput, ageGroup?: string): LessonVideoPayload {
    if (typeof input === 'string') {
      return {
        topic: this.toText(input, '课程'),
        title: '',
        summary: '',
        ageGroup,
        watchScene: null,
        visualStory: {},
        videoLesson: {},
      };
    }

    return {
      topic: this.toText(input?.topic, '课程'),
      title: this.toText(input?.title),
      summary: this.toText(input?.summary),
      ageGroup: this.toText(input?.ageGroup || ageGroup) || undefined,
      watchScene: input?.watchScene && typeof input.watchScene === 'object' ? input.watchScene : null,
      visualStory: input?.visualStory && typeof input.visualStory === 'object' ? input.visualStory : {},
      videoLesson: input?.videoLesson && typeof input.videoLesson === 'object' ? input.videoLesson : {},
    };
  }

  private hasLessonVideoSource(payload: LessonVideoPayload): boolean {
    return (
      Array.isArray(payload.watchScene?.scenes) && payload.watchScene.scenes.length > 0
    ) || (
      Array.isArray(payload.visualStory?.scenes) && payload.visualStory.scenes.length > 0
    ) || (
      Array.isArray(payload.videoLesson?.shots) && payload.videoLesson.shots.length > 0
    );
  }

  private buildVideoDataFromLesson(payload: LessonVideoPayload): TeachingVideoData {
    const sceneDoc = Array.isArray(payload.watchScene?.scenes) && payload.watchScene.scenes.length > 0
      ? payload.watchScene
      : deriveWatchSceneDocument(
          {
            visualStory: payload.visualStory || {},
            videoLesson: payload.videoLesson || {},
          },
          payload.topic,
        );

    const slides = (Array.isArray(sceneDoc?.scenes) ? sceneDoc.scenes : [])
      .slice(0, 8)
      .map((scene: any, index: number) => this.buildSlideFromScene(scene, index));

    return {
      title: this.toText(payload.videoLesson?.title, this.toText(payload.title, `认识${payload.topic}`)),
      subtitle: this.toText(
        payload.summary,
        payload.ageGroup ? `${payload.ageGroup}岁启蒙课程` : `${slides.length || 1}个知识点动画课`,
      ),
      introBg: '#667EEA',
      outroBg: '#F093FB',
      slides,
    };
  }

  private buildSlideFromScene(scene: Record<string, any>, index: number): TeachingVideoData['slides'][number] {
    const labels = [
      ...(Array.isArray(scene?.visual?.items)
        ? scene.visual.items.map((item: any) => this.toText(item?.label)).filter(Boolean)
        : []),
      ...(Array.isArray(scene?.visual?.characters)
        ? scene.visual.characters.map((item: any) => this.toText(item?.label)).filter(Boolean)
        : []),
    ].slice(0, 4);

    const items = labels.length > 0
      ? labels.map((label, itemIndex) => ({
          emoji: EMOJI_PALETTE[(index + itemIndex) % EMOJI_PALETTE.length],
          label: label.slice(0, 8),
        }))
      : undefined;

    const layout = labels.length >= 3 ? 'grid' : labels.length >= 1 ? 'list' : 'hero';
    const headline = this.toText(scene?.onScreenText, this.toText(scene?.title, `知识点${index + 1}`));
    const subtitle = this.toText(scene?.title, '') === headline
      ? this.toText(scene?.visual?.caption)
      : this.toText(scene?.title, this.toText(scene?.visual?.caption));

    return {
      title: headline.slice(0, 12),
      emoji: EMOJI_PALETTE[index % EMOJI_PALETTE.length],
      subtitle: subtitle.slice(0, 20) || undefined,
      bgColor: BG_PALETTE[index % BG_PALETTE.length],
      accentColor: ACCENT_PALETTE[index % ACCENT_PALETTE.length],
      layout,
      items,
      narration: this.toText(scene?.narration, '请和老师一起学习。').slice(0, 100),
    };
  }

  private toText(value: unknown, fallback = ''): string {
    if (value == null) return fallback;
    const text = String(value).replace(/\s+/g, ' ').trim();
    return text || fallback;
  }

  async renderComposition(
    compositionId: string,
    inputProps: Record<string, any>,
    outputPath: string,
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    const propsPath = await this.writePropsFile(inputProps);

    try {
      await this.runRemotionRender(compositionId, outputPath, propsPath, onProgress);
    } finally {
      await this.cleanupFile(propsPath);
    }
  }

  private isNumbersTopic(topic: string): boolean {
    const normalized = topic.trim().toLowerCase();
    return (
      normalized === '认识数字' ||
      normalized === '数字' ||
      normalized === 'numbers' ||
      normalized === '1-10' ||
      /^认识数字\s*[1１]?[-—]?\s*10$/.test(normalized)
    );
  }

  private async writePropsFile(props: Record<string, any>): Promise<string> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'remotion-props-'));
    const propsPath = path.join(tmpDir, 'input-props.json');
    await fs.writeFile(propsPath, JSON.stringify(props), 'utf-8');
    return propsPath;
  }

  private runRemotionRender(
    compositionId: string,
    outputPath: string,
    propsPath: string,
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        'remotion',
        'render',
        compositionId,
        outputPath,
        '--codec=h264',
        `--props=${propsPath}`,
      ];

      this.logger.log(`Spawning remotion render: npx ${args.join(' ')}`);

      const proc = spawn('npx', args, {
        cwd: this.remotionDir,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let lastError = '';

      proc.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        const percent = this.parseProgress(text);
        if (percent !== null && onProgress) {
          onProgress(percent);
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        const percent = this.parseProgress(text);
        if (percent !== null && onProgress) {
          onProgress(percent);
        }
        // Capture last error line for diagnostics
        const lines = text.trim().split('\n');
        const lastLine = lines[lines.length - 1]?.trim();
        if (lastLine && !lastLine.startsWith('[') && lastLine.length < 200) {
          lastError = lastLine;
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`remotion spawn failed: ${err.message}`));
      });

      proc.on('close', (code) => {
        if (code === 0) {
          this.logger.log(`Remotion render completed: ${compositionId} → ${outputPath}`);
          resolve();
        } else {
          reject(new Error(`remotion render exited with code ${code}: ${lastError}`));
        }
      });
    });
  }

  private parseProgress(text: string): number | null {
    // Remotion outputs progress like "Rendering... 45%" or "[45%]"
    const match = text.match(/(\d{1,3})\s*%/);
    if (!match) return null;
    const value = parseInt(match[1], 10);
    return value >= 0 && value <= 100 ? value : null;
  }

  private async cleanupFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      const dir = path.dirname(filePath);
      await fs.rmdir(dir);
    } catch {
      // best effort cleanup
    }
  }
}
