import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GenerateVideoDataTool, TeachingVideoData } from '../ai/agent/tools/generate-video-data';
import { VoiceService } from '../voice/voice.service';
import { deriveWatchSceneDocument } from './lesson-scene';

export type ResolvedComposition = {
  compositionId: string;
  inputProps: Record<string, any>;
};

type ResolveCompositionInput = string | Record<string, any>;
type OriginalTeachingSlide = TeachingVideoData['slides'][number];
type TeachingSlide = OriginalTeachingSlide & {
  durationFrames?: number;
  narrationSrc?: string;
};
type TeachingSlideItem = NonNullable<OriginalTeachingSlide['items']>[number];

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

const DOMAIN_THEMES: Record<string, {
  introBg: string; outroBg: string;
  bgPalette: string[]; accentPalette: string[];
}> = {
  language: {
    introBg: '#667EEA', outroBg: '#764BA2',
    bgPalette: ['#FFF5F5', '#FFFBEB', '#F8F0FF', '#FFF0F6', '#FFF8F0'],
    accentPalette: ['#FF6B6B', '#E67E22', '#9B59B6', '#FF6B9D', '#FF9A76'],
  },
  math: {
    introBg: '#4D96FF', outroBg: '#6BCB77',
    bgPalette: ['#EBF5FF', '#E8F8FF', '#F0FFF4', '#F8F0FF', '#F0F0FF'],
    accentPalette: ['#4D96FF', '#00B4D8', '#6BCB77', '#9B59B6', '#667EEA'],
  },
  science: {
    introBg: '#00B4D8', outroBg: '#6BCB77',
    bgPalette: ['#E8F8FF', '#F0FFF4', '#FFF8E1', '#FFF3E0', '#E8F4FF'],
    accentPalette: ['#00B4D8', '#6BCB77', '#F59E0B', '#E67E22', '#4D96FF'],
  },
  art: {
    introBg: '#FF6B6B', outroBg: '#FFD93D',
    bgPalette: ['#FFF0F6', '#FFF5F5', '#FFFBEB', '#F8F0FF', '#FFF0E8'],
    accentPalette: ['#FF6B9D', '#FF6B6B', '#FFD93D', '#9B59B6', '#FF9A76'],
  },
  social: {
    introBg: '#FFD93D', outroBg: '#6BCB77',
    bgPalette: ['#FFFBEB', '#F0FFF4', '#FFF8F0', '#FFF5F5', '#F8F0FF'],
    accentPalette: ['#FFD93D', '#6BCB77', '#E67E22', '#FF6B6B', '#9B59B6'],
  },
};

@Injectable()
export class RemotionRenderService {
  private readonly logger = new Logger(RemotionRenderService.name);
  private readonly remotionDir = path.resolve(__dirname, '../../../../video-remotion');

  constructor(
    private readonly generateVideoDataTool: GenerateVideoDataTool,
    private readonly voiceService: VoiceService,
  ) {}

  async resolveComposition(
    input: ResolveCompositionInput,
    ageGroup?: string,
  ): Promise<ResolvedComposition> {
    const payload = this.normalizePayload(input, ageGroup);

    if (this.hasLessonVideoSource(payload)) {
      const videoData = this.buildVideoDataFromLesson(payload);
      const enrichedData = await this.generateNarrationAudioFiles(videoData);
      return {
        compositionId: 'TopicVideo',
        inputProps: enrichedData,
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
    const domain = this.inferDomain(payload.topic, payload);
    const theme = DOMAIN_THEMES[domain] || DOMAIN_THEMES.language;

    const watchSlides = this.buildWatchSlides(payload, domain);
    const mergedSlides = this.mergeListeningIntoWatchSlides(watchSlides, payload.modules?.listening);
    const supportSlides = this.buildSupplementSlides(payload.modules || {}, mergedSlides.length);

    // Dynamic allocation: watch content 60%, supplement 40%
    const MAX_SLIDES = 12;
    const watchBudget = Math.max(3, Math.floor(MAX_SLIDES * 0.6));
    const supportBudget = MAX_SLIDES - watchBudget;

    const selectedSupport = supportSlides.slice(0, supportBudget);
    // Return unused support quota to watch slides
    const unused = supportBudget - selectedSupport.length;
    const selectedWatch = mergedSlides.slice(0, watchBudget + unused);

    const slides = [...selectedWatch, ...selectedSupport];

    return {
      title: this.toText(payload.videoLesson?.title, this.toText(payload.title, `认识${payload.topic}`)),
      subtitle: this.toText(
        payload.summary,
        payload.ageGroup ? `${payload.ageGroup}岁启蒙课程` : `${slides.length || 1}个知识点动画课`,
      ),
      introBg: theme.introBg,
      outroBg: theme.outroBg,
      slides: slides.length > 0 ? slides : [this.buildFallbackSlide(payload.topic)],
    };
  }

  private buildWatchSlides(payload: LessonVideoPayload, domain: string): TeachingSlide[] {
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
      .slice(0, 12)
      .map((scene: Record<string, any>, index: number) => this.buildSlideFromScene(scene, index, domain));
  }

  private mergeListeningIntoWatchSlides(
    watchSlides: TeachingSlide[],
    listening: Record<string, any> | undefined,
  ): TeachingSlide[] {
    if (!listening || Object.keys(listening).length === 0) return watchSlides;
    if (watchSlides.length === 0) return watchSlides;

    const script = Array.isArray(listening.audioScript) ? listening.audioScript : [];
    if (script.length === 0) return watchSlides;

    return watchSlides.map((slide, index) => {
      const segment = script[index % script.length];
      const segmentNarration = this.toText(segment?.narration);
      if (!segmentNarration) return slide;

      // Join at sentence boundary instead of raw space concatenation
      const mergedNarration = slide.narration
        ? `${slide.narration.replace(/[。！？，]$/, '')}。${segmentNarration}`
        : segmentNarration;

      return {
        ...slide,
        narration: this.truncateAtSentenceEnd(mergedNarration, 150),
      };
    });
  }

  private buildSupplementSlides(modules: LessonModules, startIndex: number): TeachingSlide[] {
    const slides: TeachingSlide[] = [];

    // Listening content is merged into watch slides, skip separate listening slide
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
      title: this.toText(listening.goal, '听一听').slice(0, 16),
      emoji: '🎧',
      subtitle: this.toText(script[0]?.narration, '听老师讲一讲').slice(0, 30) || undefined,
      bgColor: '#FFF8F0',
      accentColor: '#E67E22',
      layout: items.length >= 3 ? 'grid' : items.length > 0 ? 'list' : 'hero',
      items: items.length > 0 ? items : undefined,
      narration: this.truncateAtSentenceEnd(this.toText(script[0]?.narration, '先竖起小耳朵，跟着老师认真听一听。'), 150),
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

    // Build narration from actual content, not a generic template
    const keywordsIntro = keywords.length > 0
      ? `重点词语有：${keywords.slice(0, 4).map((k: any) => this.toText(k)).join('、')}。`
      : '';
    const narration = this.toText(
      reading.text,
      keywordsIntro || '我们一起读一读，把重点内容记下来。',
    );

    return {
      title: this.toText(reading.goal, '读一读').slice(0, 16),
      emoji: '📚',
      subtitle: this.toText(reading.text, '一起读一读重点内容').slice(0, 30) || undefined,
      bgColor: '#F8F0FF',
      accentColor: '#9B59B6',
      layout: items.length >= 3 ? 'grid' : items.length > 0 ? 'list' : 'hero',
      items: items.length > 0 ? items : undefined,
      narration: this.truncateAtSentenceEnd(narration, 150),
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
      title: this.toText(writing.goal, firstTarget ? `写一写 ${firstTarget}` : '写一写').slice(0, 16),
      emoji: '✍️',
      subtitle: firstTarget ? `描红练习：${firstTarget}`.slice(0, 30) : '跟着提示动笔练习',
      bgColor: '#EBF5FF',
      accentColor: '#4D96FF',
      layout: items.length >= 3 ? 'grid' : items.length > 0 ? 'list' : 'hero',
      items: items.length > 0 ? items : undefined,
      narration: this.truncateAtSentenceEnd(this.toText(practiceTasks[0], firstTarget ? `我们来描一描${firstTarget}。` : '拿起笔，跟着老师一起写一写。'), 150),
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
      title: this.toText(activityData.title, '练一练').slice(0, 16),
      emoji: '🎮',
      subtitle: this.toText(game.activityType, '互动练习').slice(0, 30) || undefined,
      bgColor: '#FFF0F6',
      accentColor: '#FF6B9D',
      layout: items.length >= 3 ? 'grid' : items.length > 0 ? 'list' : 'hero',
      items: items.length > 0 ? items : undefined,
      narration: this.truncateAtSentenceEnd(`现在开始互动练习，一起挑战${this.toText(activityData.title, '小游戏')}。`, 150),
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
      title: this.toText(quiz.title, '评一评').slice(0, 16),
      emoji: '✅',
      subtitle: questions.length > 0 ? `共${questions.length}道题` : '小测验时间',
      bgColor: '#F0FFF4',
      accentColor: '#6BCB77',
      layout: items.length >= 3 ? 'grid' : items.length > 0 ? 'list' : 'hero',
      items: items.length > 0 ? items : undefined,
      narration: this.truncateAtSentenceEnd(questions.length > 0 ? `最后我们来做${questions.length}道题，看看今天学会了什么。` : '最后来做一个小测验。', 150),
    };
  }

  private buildSlideFromScene(scene: Record<string, any>, index: number, domain: string): TeachingSlide {
    const domainTheme = DOMAIN_THEMES[domain] || DOMAIN_THEMES.language;
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

    // Extract animation template from scene visual data
    const templateId = this.toText(scene?.visual?.templateId);
    const templateParams = this.asRecord(scene?.visual?.templateParams);
    const animationTemplate = templateId
      ? { id: templateId, params: templateParams }
      : undefined;

    // Build visual scene descriptor from scene data
    const bgType = this.toText(scene?.visual?.background?.type);
    const validBgTypes = ['day', 'night', 'indoor', 'spring', 'summer', 'autumn', 'winter'];
    const sceneCharacters = Array.isArray(scene?.visual?.characters)
      ? scene.visual.characters.map((c: any) => this.toText(c?.label || c)).filter(Boolean).slice(0, 4)
      : [];
    const sceneVisualItems = Array.isArray(scene?.visual?.items)
      ? scene.visual.items.map((i: any) => this.toText(i?.label || i)).filter(Boolean).slice(0, 6)
      : [];
    const visual = {
      bgType: validBgTypes.includes(bgType) ? bgType : undefined,
      caption: this.toText(scene?.onScreenText || scene?.visual?.caption) || undefined,
      characters: sceneCharacters.length > 0 ? sceneCharacters : undefined,
      items: sceneVisualItems.length > 0 ? sceneVisualItems : undefined,
      mood: 'playful' as const,
    };

    return {
      title: headline.slice(0, 16),
      emoji: theme.emoji || EMOJI_PALETTE[index % EMOJI_PALETTE.length],
      subtitle: subtitle.slice(0, 30) || undefined,
      bgColor: theme.bgColor || this.toText(scene?.visual?.background?.themeColor, domainTheme.bgPalette[index % domainTheme.bgPalette.length]),
      accentColor: theme.accentColor || this.toText(scene?.visual?.background?.accentColor, domainTheme.accentPalette[index % domainTheme.accentPalette.length]),
      layout: theme.layout || (mergedItems.length >= 3 ? 'grid' : mergedItems.length >= 1 ? 'list' : 'hero'),
      items: mergedItems.length > 0 ? mergedItems : undefined,
      narration: this.truncateAtSentenceEnd(this.toText(scene?.narration, '请和老师一起学习。'), 150),
      ...(animationTemplate ? { animationTemplate } : {}),
      visual,
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
      title: `认识${topic}`.slice(0, 16),
      emoji: '✨',
      subtitle: '启蒙动画课',
      bgColor: '#FFF5F5',
      accentColor: '#FF6B6B',
      layout: 'hero',
      items: this.createItems(['一起观察', '一起学习'], ['👀', '📘']),
      narration: this.truncateAtSentenceEnd(`请跟着老师一起认识${topic}。`, 150),
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
        label: this.toText(label).slice(0, 12),
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

  /** Truncate at the last complete sentence within the limit */
  private truncateAtSentenceEnd(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    const sub = text.slice(0, maxLen);
    const lastPunc = Math.max(
      sub.lastIndexOf('。'),
      sub.lastIndexOf('！'),
      sub.lastIndexOf('？'),
      sub.lastIndexOf('，'),
    );
    return lastPunc > maxLen * 0.5 ? sub.slice(0, lastPunc + 1) : sub;
  }

  private async generateNarrationAudioFiles(
    data: TeachingVideoData,
  ): Promise<TeachingVideoData> {
    const publicDir = path.join(this.remotionDir, 'public');
    await fs.mkdir(publicDir, { recursive: true });

    // Sequential TTS calls with one retry — parallel calls exhaust the TLS
    // connection pool on slower networks, causing all slides to fail at once.
    const slideResults: TeachingSlide[] = [];
    for (const slide of data.slides) {
      if (!slide.narration || slide.narration.trim().length === 0) {
        slideResults.push(slide);
        continue;
      }

      let buffer: Buffer | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          buffer = await this.voiceService.textToSpeech(slide.narration);
          break; // success
        } catch (err: any) {
          if (attempt === 0) {
            this.logger.warn(
              `TTS attempt 1 failed for slide "${slide.title}", retrying in 1 s: ${err?.message || 'unknown'}`,
            );
            await new Promise((r) => setTimeout(r, 1000));
          } else {
            this.logger.warn(
              `TTS generation failed for slide "${slide.title}" after 2 attempts: ${err?.message || 'unknown'}`,
            );
          }
        }
      }

      if (!buffer) {
        // Fallback: estimate duration from text length (≈4 chars/s for Chinese TTS)
        const chars = slide.narration.replace(/\s+/g, '').length;
        const estimatedSeconds = Math.max(3, chars / 4);
        slideResults.push({
          ...slide,
          durationFrames: Math.ceil(estimatedSeconds * 30) + 30,
        });
        continue;
      }

      const hash = createHash('sha1').update(slide.narration).digest('hex').slice(0, 12);
      const filename = `narration-${hash}.mp3`;
      await fs.writeFile(path.join(publicDir, filename), buffer);

      const durationFrames = this.parseMp3DurationFrames(buffer);
      slideResults.push({
        ...slide,
        narrationSrc: filename,
        durationFrames,
      });
    }

    return { ...data, slides: slideResults };
  }

  /**
   * Parse MP3 frame headers to compute an accurate duration in Remotion frames.
   * Scans the first sync word in the first 64 KB to detect bitrate/samplerate,
   * then calculates total frames from file size. Falls back to a byte-rate
   * heuristic if the file is malformed. Adds 0.3 s lead-in + 0.5 s tail buffer.
   */
  private parseMp3DurationFrames(mp3Buffer: Buffer): number {
    const FPS = 30;
    const LEAD_IN_FRAMES = Math.ceil(0.3 * FPS);  // 9 frames — slide entrance anim
    const TAIL_FRAMES    = Math.ceil(0.5 * FPS);  // 15 frames — pause after speech
    const MIN_FRAMES     = 6 * FPS;               // 6 s minimum slide duration

    try {
      // Scan up to 64 KB for the first valid MPEG sync word (0xFF 0xE0 mask)
      const scanLimit = Math.min(mp3Buffer.length - 4, 65536);
      for (let i = 0; i < scanLimit; i++) {
        if (mp3Buffer[i] !== 0xff || (mp3Buffer[i + 1] & 0xe0) !== 0xe0) continue;

        const h = (mp3Buffer[i] << 24) | (mp3Buffer[i + 1] << 16) | (mp3Buffer[i + 2] << 8) | mp3Buffer[i + 3];

        const mpegVersion = (h >> 19) & 0x3; // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
        const layerBits   = (h >> 17) & 0x3; // 3=Layer1, 2=Layer2, 1=Layer3
        const bitrateIdx  = (h >> 12) & 0xf;
        const srateIdx    = (h >> 10) & 0x3;
        const padding     = (h >>  9) & 0x1;

        if (mpegVersion === 1 || layerBits === 0 || bitrateIdx === 0 || bitrateIdx === 15 || srateIdx === 3) {
          continue; // reserved/free/bad values — keep scanning
        }

        // MPEG1 Layer3 bitrate table (kbps)
        const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
        // MPEG2/2.5 Layer3 bitrate table (kbps)
        const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];

        // MPEG1 sample rates (Hz)
        const SRATES_V1 = [44100, 48000, 32000, 0];
        // MPEG2 sample rates (Hz)
        const SRATES_V2 = [22050, 24000, 16000, 0];
        // MPEG2.5 sample rates (Hz)
        const SRATES_V25 = [11025, 12000, 8000, 0];

        const isV1   = mpegVersion === 3;
        const isL3   = layerBits   === 1;

        const bitrate = (isV1 ? BITRATES_V1_L3 : BITRATES_V2_L3)[bitrateIdx] * 1000;
        const srate   = (isV1 ? SRATES_V1 : mpegVersion === 2 ? SRATES_V2 : SRATES_V25)[srateIdx];

        if (!bitrate || !srate || !isL3) continue;

        // Samples per frame: MPEG1 L3 = 1152, MPEG2/2.5 L3 = 576
        const samplesPerFrame = isV1 ? 1152 : 576;
        // Frame size in bytes (without padding byte)
        const frameBytes = Math.floor(samplesPerFrame * bitrate / 8 / srate) + padding;

        if (frameBytes < 24 || frameBytes > 1442) continue; // sanity check

        // Estimate total MP3 frame count from file size and first-frame size
        const dataBytes  = mp3Buffer.length - i;
        const frameCount = Math.max(1, Math.floor(dataBytes / frameBytes));
        const seconds    = (frameCount * samplesPerFrame) / srate;

        const rawFrames = Math.ceil(seconds * FPS);
        return Math.max(MIN_FRAMES, rawFrames + LEAD_IN_FRAMES + TAIL_FRAMES);
      }
    } catch {
      // fall through to heuristic
    }

    // Fallback: assume 40 kbps mono MP3 (typical TTS output)
    const seconds = mp3Buffer.length / 5000;
    return Math.max(MIN_FRAMES, Math.ceil(seconds * FPS) + LEAD_IN_FRAMES + TAIL_FRAMES);
  }

  async cleanupNarrationFiles(inputProps: Record<string, any>): Promise<void> {
    const slides = inputProps?.slides;
    if (!Array.isArray(slides)) return;

    const publicDir = path.join(this.remotionDir, 'public');
    for (const slide of slides) {
      if (slide.narrationSrc) {
        try {
          await fs.unlink(path.join(publicDir, slide.narrationSrc));
        } catch {
          // best effort cleanup
        }
      }
    }
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

  /** Infer content domain from topic text and payload hints */
  private inferDomain(topic: string, payload: LessonVideoPayload): string {
    // Check if payload has an explicit domain field
    const explicitDomain = this.toText((payload as any)?.domain);
    if (explicitDomain && DOMAIN_THEMES[explicitDomain]) return explicitDomain;

    // Check visualStory scenes for animation template hints
    const scenes = Array.isArray(payload.visualStory?.scenes) ? payload.visualStory.scenes : [];
    for (const scene of scenes) {
      const templateId = this.toText(scene?.visual?.templateId);
      if (templateId) {
        const domain = templateId.split('.')[0];
        if (DOMAIN_THEMES[domain]) return domain;
      }
    }

    // Keyword-based inference from topic
    const t = topic.trim();
    if (/(汉字|识字|拼音|词语|词汇|朗读|阅读|认字|生字|写字|笔画|偏旁|部首|古诗|诗歌|儿歌|故事|绘本|童话)/.test(t)) return 'language';
    if (/(数字|数数|加法|减法|形状|图形|算盘|排序|规律|数学|计数|比大小)/.test(t)) return 'math';
    if (/(四季|季节|水循环|白天|黑夜|植物|种子|动物|昆虫|天气|身体|食物|声音|光|磁铁|科学)/.test(t)) return 'science';
    if (/(颜色|色彩|画画|绘画|简笔画|手工|折纸|音乐|唱歌|乐器|美术)/.test(t)) return 'art';
    if (/(情绪|表情|作息|习惯|朋友|分享|合作|礼貌|家庭|节日|安全|社交)/.test(t)) return 'social';

    return 'language';
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
      const cpuCount = Math.max(1, (require('os').cpus() || []).length);
      const concurrency = Math.min(cpuCount - 1 || 1, 4); // Use N-1 cores, max 4
      const args = [
        'remotion',
        'render',
        compositionId,
        outputPath,
        '--codec=h264',
        `--concurrency=${concurrency}`,
        `--props=${propsPath}`,
      ];

      this.logger.log(`Spawning remotion render (concurrency=${concurrency}): npx ${args.join(' ')}`);

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
