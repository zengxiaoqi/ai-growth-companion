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
type TeachingSlide = TeachingVideoData['slides'][number];
type TeachingSlideItem = NonNullable<TeachingSlide['items']>[number];

type LessonModules = {
  listening?: Record<string, any>;
  reading?: Record<string, any>;
  writing?: Record<string, any>;
  game?: Record<string, any>;
  quiz?: Record<string, any>;
};

type LessonVideoPayload = {
  topic: string;
  title: string;
  summary: string;
  ageGroup?: string;
  watchScene?: Record<string, any> | null;
  visualStory?: Record<string, any>;
  videoLesson?: Record<string, any>;
  modules?: LessonModules;
};

type SlideTheme = {
  emoji?: string;
  layout?: TeachingSlide['layout'];
  bgColor?: string;
  accentColor?: string;
  subtitle?: string;
  items?: TeachingSlideItem[];
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
const SEASON_EMOJI = ['🌸', '☀️', '🍂', '❄️'] as const;
const SEASON_BG = ['#F0FFF4', '#FFF8E1', '#FFF3E0', '#E8F4FF'] as const;
const SEASON_ACCENT = ['#6BCB77', '#F59E0B', '#E67E22', '#4D96FF'] as const;

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
        modules: {},
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
      modules: input?.modules && typeof input.modules === 'object'
        ? {
            listening: this.asRecord(input.modules.listening),
            reading: this.asRecord(input.modules.reading),
            writing: this.asRecord(input.modules.writing),
            game: this.asRecord(input.modules.game),
            quiz: this.asRecord(input.modules.quiz),
          }
        : {},
    };
  }

  private hasLessonVideoSource(payload: LessonVideoPayload): boolean {
    return (
      Array.isArray(payload.watchScene?.scenes) && payload.watchScene.scenes.length > 0
    ) || (
      Array.isArray(payload.visualStory?.scenes) && payload.visualStory.scenes.length > 0
    ) || (
      Array.isArray(payload.videoLesson?.shots) && payload.videoLesson.shots.length > 0
    ) || this.hasSupplementSlides(payload.modules);
  }

  private hasSupplementSlides(modules?: LessonModules): boolean {
    if (!modules) return false;
    return [modules.listening, modules.reading, modules.writing, modules.game, modules.quiz]
      .some((entry) => entry && Object.keys(entry).length > 0);
  }

  private buildVideoDataFromLesson(payload: LessonVideoPayload): TeachingVideoData {
    const watchSlides = this.buildWatchSlides(payload);
    const supportSlides = this.buildSupplementSlides(payload.modules || {}, watchSlides.length);
    const reservedSupportCount = Math.min(4, supportSlides.length);
    const maxWatchSlides = Math.max(1, 8 - reservedSupportCount);
    const slides = [
      ...watchSlides.slice(0, maxWatchSlides),
      ...supportSlides,
    ].slice(0, 8);

    return {
      title: this.toText(payload.videoLesson?.title, this.toText(payload.title, `认识${payload.topic}`)),
      subtitle: this.toText(
        payload.summary,
        payload.ageGroup ? `${payload.ageGroup}岁启蒙课程` : `${slides.length || 1}个知识点动画课`,
      ),
      introBg: '#667EEA',
      outroBg: '#F093FB',
      slides: slides.length > 0 ? slides : [this.buildFallbackSlide(payload.topic)],
    };
  }

  private buildWatchSlides(payload: LessonVideoPayload): TeachingSlide[] {
    const sceneDoc = Array.isArray(payload.watchScene?.scenes) && payload.watchScene.scenes.length > 0
      ? payload.watchScene
      : deriveWatchSceneDocument(
          {
            visualStory: payload.visualStory || {},
            videoLesson: payload.videoLesson || {},
          },
          payload.topic,
        );

    return (Array.isArray(sceneDoc?.scenes) ? sceneDoc.scenes : [])
      .slice(0, 8)
      .map((scene: Record<string, any>, index: number) => this.buildSlideFromScene(scene, index));
  }

  private buildSupplementSlides(modules: LessonModules, startIndex: number): TeachingSlide[] {
    const slides: TeachingSlide[] = [];

    const listeningSlide = this.buildListeningSlide(modules.listening, startIndex + slides.length);
    if (listeningSlide) slides.push(listeningSlide);

    const readingSlide = this.buildReadingSlide(modules.reading, startIndex + slides.length);
    if (readingSlide) slides.push(readingSlide);

    const writingSlide = this.buildWritingSlide(modules.writing, startIndex + slides.length);
    if (writingSlide) slides.push(writingSlide);

    const practiceSlide = this.buildPracticeSlide(modules.game, startIndex + slides.length);
    if (practiceSlide) slides.push(practiceSlide);

    const assessSlide = this.buildAssessSlide(modules.quiz, startIndex + slides.length);
    if (assessSlide) slides.push(assessSlide);

    return slides;
  }

  private buildListeningSlide(listening: Record<string, any> | undefined, _index: number): TeachingSlide | null {
    if (!listening || Object.keys(listening).length === 0) return null;
    const script = Array.isArray(listening.audioScript) ? listening.audioScript : [];
    const questions = Array.isArray(listening.questions) ? listening.questions : [];
    const items = this.createItems(
      [
        ...script.map((entry: any) => this.toText(entry?.segment || entry?.narration)),
        ...questions.map((entry: any) => this.toText(entry)),
      ].filter(Boolean).slice(0, 4),
      ['🎧', '🎵', '🗣️', '👂'],
    );

    return {
      title: this.toText(listening.goal, '听一听').slice(0, 12),
      emoji: '🎧',
      subtitle: this.toText(script[0]?.narration, '听老师讲一讲').slice(0, 20) || undefined,
      bgColor: '#FFF8F0',
      accentColor: '#E67E22',
      layout: items.length >= 3 ? 'grid' : items.length > 0 ? 'list' : 'hero',
      items: items.length > 0 ? items : undefined,
      narration: this.toText(script[0]?.narration, '先竖起小耳朵，跟着老师认真听一听。').slice(0, 100),
    };
  }

  private buildReadingSlide(reading: Record<string, any> | undefined, _index: number): TeachingSlide | null {
    if (!reading || Object.keys(reading).length === 0) return null;
    const keywords = Array.isArray(reading.keywords) ? reading.keywords : [];
    const questions = Array.isArray(reading.questions) ? reading.questions : [];
    const items = this.createItems(
      [
        ...keywords.map((entry: any) => this.toText(entry)),
        ...questions.map((entry: any) => this.toText(entry)),
      ].filter(Boolean).slice(0, 4),
      ['📚', '🔤', '📝', '💡'],
    );

    return {
      title: this.toText(reading.goal, '读一读').slice(0, 12),
      emoji: '📚',
      subtitle: this.toText(reading.text, '一起读一读重点内容').slice(0, 20) || undefined,
      bgColor: '#F8F0FF',
      accentColor: '#9B59B6',
      layout: items.length >= 3 ? 'grid' : items.length > 0 ? 'list' : 'hero',
      items: items.length > 0 ? items : undefined,
      narration: this.toText(reading.text, '我们一起读一读，把重点内容记下来。').slice(0, 100),
    };
  }

  private buildWritingSlide(writing: Record<string, any> | undefined, _index: number): TeachingSlide | null {
    if (!writing || Object.keys(writing).length === 0) return null;
    const tracingItems = Array.isArray(writing.tracingItems) ? writing.tracingItems : [];
    const practiceTasks = Array.isArray(writing.practiceTasks) ? writing.practiceTasks : [];
    const firstTarget = this.toText(tracingItems[0]);
    const items = this.createItems(
      [
        ...tracingItems.map((entry: any) => this.toText(entry)),
        ...practiceTasks.map((entry: any) => this.toText(entry)),
      ].filter(Boolean).slice(0, 4),
      ['✍️', '📝', '📏', '⭐'],
    );

    return {
      title: this.toText(writing.goal, firstTarget ? `写一写 ${firstTarget}` : '写一写').slice(0, 12),
      emoji: '✍️',
      subtitle: firstTarget ? `描红练习：${firstTarget}`.slice(0, 20) : '跟着提示动笔练习',
      bgColor: '#EBF5FF',
      accentColor: '#4D96FF',
      layout: items.length >= 3 ? 'grid' : items.length > 0 ? 'list' : 'hero',
      items: items.length > 0 ? items : undefined,
      narration: this.toText(practiceTasks[0], firstTarget ? `我们来描一描${firstTarget}。` : '拿起笔，跟着老师一起写一写。').slice(0, 100),
    };
  }

  private buildPracticeSlide(game: Record<string, any> | undefined, _index: number): TeachingSlide | null {
    if (!game || Object.keys(game).length === 0) return null;
    const activityData = this.asRecord(game.activityData);
    const questionCount = Array.isArray(activityData.questions) ? activityData.questions.length : 0;
    const pairCount = Array.isArray(activityData.pairs) ? activityData.pairs.length : 0;
    const items = this.createItems(
      [
        this.toText(game.activityType),
        questionCount > 0 ? `${questionCount}道题` : '',
        pairCount > 0 ? `${pairCount}组配对` : '',
        this.toText(activityData.title),
      ].filter(Boolean).slice(0, 4),
      ['🎮', '🧩', '🎯', '🏅'],
    );

    return {
      title: this.toText(activityData.title, '练一练').slice(0, 12),
      emoji: '🎮',
      subtitle: this.toText(game.activityType, '互动练习').slice(0, 20) || undefined,
      bgColor: '#FFF0F6',
      accentColor: '#FF6B9D',
      layout: items.length >= 3 ? 'grid' : items.length > 0 ? 'list' : 'hero',
      items: items.length > 0 ? items : undefined,
      narration: `现在开始互动练习，一起挑战${this.toText(activityData.title, '小游戏')}。`.slice(0, 100),
    };
  }

  private buildAssessSlide(quiz: Record<string, any> | undefined, _index: number): TeachingSlide | null {
    if (!quiz || Object.keys(quiz).length === 0) return null;
    const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
    const items = this.createItems(
      questions
        .map((entry: any) => this.toText(entry?.question))
        .filter(Boolean)
        .slice(0, 4),
      ['✅', '🧠', '📌', '🏁'],
    );

    return {
      title: this.toText(quiz.title, '评一评').slice(0, 12),
      emoji: '✅',
      subtitle: questions.length > 0 ? `共${questions.length}道题` : '小测验时间',
      bgColor: '#F0FFF4',
      accentColor: '#6BCB77',
      layout: items.length >= 3 ? 'grid' : items.length > 0 ? 'list' : 'hero',
      items: items.length > 0 ? items : undefined,
      narration: questions.length > 0 ? `最后我们来做${questions.length}道题，看看今天学会了什么。` : '最后来做一个小测验。',
    };
  }

  private buildSlideFromScene(scene: Record<string, any>, index: number): TeachingSlide {
    const theme = this.resolveSceneTheme(scene, index);
    const visualLabels = [
      ...(Array.isArray(scene?.visual?.items)
        ? scene.visual.items.map((item: any) => this.toText(item?.label)).filter(Boolean)
        : []),
      ...(Array.isArray(scene?.visual?.characters)
        ? scene.visual.characters.map((item: any) => this.toText(item?.label)).filter(Boolean)
        : []),
    ];

    const mergedItems = this.mergeItems(
      theme.items || [],
      this.createItems(visualLabels.slice(0, 4), EMOJI_PALETTE),
    );

    const headline = this.toText(scene?.onScreenText, this.toText(scene?.title, `知识点${index + 1}`));
    const subtitle = theme.subtitle || (
      this.toText(scene?.title, '') === headline
        ? this.toText(scene?.visual?.caption)
        : this.toText(scene?.title, this.toText(scene?.visual?.caption))
    );

    return {
      title: headline.slice(0, 12),
      emoji: theme.emoji || EMOJI_PALETTE[index % EMOJI_PALETTE.length],
      subtitle: subtitle.slice(0, 20) || undefined,
      bgColor: theme.bgColor || this.toText(scene?.visual?.background?.themeColor, BG_PALETTE[index % BG_PALETTE.length]),
      accentColor: theme.accentColor || this.toText(scene?.visual?.background?.accentColor, ACCENT_PALETTE[index % ACCENT_PALETTE.length]),
      layout: theme.layout || (mergedItems.length >= 3 ? 'grid' : mergedItems.length >= 1 ? 'list' : 'hero'),
      items: mergedItems.length > 0 ? mergedItems : undefined,
      narration: this.toText(scene?.narration, '请和老师一起学习。').slice(0, 100),
    };
  }

  private resolveSceneTheme(scene: Record<string, any>, index: number): SlideTheme {
    const templateId = this.toText(scene?.visual?.templateId);
    const templateParams = this.asRecord(scene?.visual?.templateParams);

    if (templateId === 'science.seasons-cycle') {
      const focusSeason = this.toSeasonIndex(templateParams.focusSeason);
      const seasonNames = Array.isArray(templateParams.seasonNames) ? templateParams.seasonNames : ['春', '夏', '秋', '冬'];
      return {
        emoji: SEASON_EMOJI[focusSeason],
        layout: 'grid',
        bgColor: SEASON_BG[focusSeason],
        accentColor: SEASON_ACCENT[focusSeason],
        subtitle: '四季轮转',
        items: seasonNames.slice(0, 4).map((name: any, itemIndex: number) => ({
          emoji: SEASON_EMOJI[itemIndex % SEASON_EMOJI.length],
          label: this.toText(name).slice(0, 8),
        })),
      };
    }

    if (templateId === 'science.day-night-cycle') {
      return {
        emoji: '🌞',
        layout: 'list',
        bgColor: '#E8F4FF',
        accentColor: '#4D96FF',
        subtitle: '白天和黑夜',
        items: this.createItems(['太阳升起', '月亮出现', '昼夜变化'], ['☀️', '🌙', '⭐']),
      };
    }

    if (templateId === 'science.water-cycle') {
      return {
        emoji: '💧',
        layout: 'list',
        bgColor: '#E8F8FF',
        accentColor: '#00B4D8',
        subtitle: '水循环过程',
        items: this.createItems(['蒸发', '成云', '下雨'], ['💨', '☁️', '🌧️']),
      };
    }

    if (templateId === 'science.plant-growth') {
      return {
        emoji: '🌱',
        layout: 'list',
        bgColor: '#F0FFF4',
        accentColor: '#6BCB77',
        subtitle: '植物慢慢长大',
        items: this.createItems(['种子', '发芽', '开花'], ['🌰', '🌱', '🌸']),
      };
    }

    if (templateId === 'language.character-stroke') {
      const character = this.toText(templateParams.character);
      return {
        emoji: '✍️',
        layout: 'hero',
        bgColor: '#FFF8F0',
        accentColor: '#E67E22',
        subtitle: character ? `认识“${character}”` : '跟着老师学笔顺',
        items: character
          ? this.createItems([character, '笔顺'], ['🀄', '✏️'])
          : this.createItems(['笔顺'], ['✏️']),
      };
    }

    if (templateId === 'language.word-reveal') {
      const words = Array.isArray(templateParams.words) ? templateParams.words : [];
      return {
        emoji: '🔤',
        layout: 'list',
        bgColor: '#F8F0FF',
        accentColor: '#9B59B6',
        subtitle: '词语逐个出现',
        items: this.createItems(words.map((entry: any) => this.toText(entry)).filter(Boolean).slice(0, 4), ['🔤', '🪄', '📖', '✨']),
      };
    }

    if (templateId === 'language.story-scene') {
      return {
        emoji: '📖',
        layout: 'hero',
        bgColor: '#FFF5F5',
        accentColor: '#FF6B6B',
        subtitle: this.toText(scene?.visual?.caption, '故事时间'),
      };
    }

    const backgroundType = this.toText(scene?.visual?.background?.type);
    if (backgroundType === 'night') {
      return { emoji: '🌙', bgColor: '#E8F0FF', accentColor: '#667EEA' };
    }
    if (backgroundType === 'seasonal') {
      return { emoji: '🍃', bgColor: '#F0FFF4', accentColor: '#6BCB77' };
    }
    if (backgroundType === 'indoor') {
      return { emoji: '🏫', bgColor: '#FFF8F0', accentColor: '#E67E22' };
    }
    if (backgroundType === 'abstract') {
      return { emoji: '✨', bgColor: '#F8F0FF', accentColor: '#9B59B6' };
    }

    return {
      emoji: EMOJI_PALETTE[index % EMOJI_PALETTE.length],
    };
  }

  private buildFallbackSlide(topic: string): TeachingSlide {
    return {
      title: `认识${topic}`.slice(0, 12),
      emoji: '✨',
      subtitle: '启蒙动画课',
      bgColor: '#FFF5F5',
      accentColor: '#FF6B6B',
      layout: 'hero',
      items: this.createItems(['一起观察', '一起学习'], ['👀', '📘']),
      narration: `请跟着老师一起认识${topic}。`.slice(0, 100),
    };
  }

  private mergeItems(primary: TeachingSlideItem[], secondary: TeachingSlideItem[]): TeachingSlideItem[] {
    const seen = new Set<string>();
    return [...primary, ...secondary].filter((item) => {
      const key = this.toText(item?.label);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 4);
  }

  private createItems(labels: string[], emojiSource: readonly string[]): TeachingSlideItem[] {
    return labels
      .map((label, index) => ({
        emoji: emojiSource[index % emojiSource.length],
        label: this.toText(label).slice(0, 8),
      }))
      .filter((item) => item.label);
  }

  private toSeasonIndex(value: unknown): number {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 3) {
      return Math.trunc(numeric);
    }
    return 0;
  }

  private asRecord(value: unknown): Record<string, any> {
    return value && typeof value === 'object' ? value as Record<string, any> : {};
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
