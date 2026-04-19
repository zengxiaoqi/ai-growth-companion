import type { ActivityType } from '../ai/agent/tools/generate-activity';
import { suggestTemplateByDomain, getDefaultTemplateForDomain } from '../../animations/animation-templates';

export type ActivityData = Record<string, any> & {
  type?: ActivityType;
  title?: string;
};

export type LessonSceneStepType = 'watch' | 'write' | 'practice';
export type LessonSceneMode = 'playback' | 'guided_trace' | 'activity_shell';
export type SceneTimelineActionType =
  | 'enter'
  | 'move'
  | 'highlight'
  | 'state_change'
  | 'particle'
  | 'caption'
  | 'pause';

export interface SceneBackground {
  type: 'day' | 'night' | 'indoor' | 'seasonal' | 'abstract';
  themeColor?: string;
  accentColor?: string;
  season?: 'spring' | 'summer' | 'autumn' | 'winter';
}

export interface SceneCharacter {
  id: string;
  label: string;
  pose?: string;
  mood?: string;
  color?: string;
}

export interface SceneItem {
  id: string;
  label: string;
  kind?: string;
  state?: string;
  color?: string;
}

export interface SceneVisual {
  background?: SceneBackground;
  characters?: SceneCharacter[];
  items?: SceneItem[];
  effects?: string[];
  caption?: string;
  templateId?: string;
  templateParams?: Record<string, any>;
}

export interface SceneTimelineAction {
  type: SceneTimelineActionType;
  target?: string;
  value?: string;
  durationSec?: number;
  atSec?: number;
}

export interface TraceGlyphTarget {
  id: string;
  label: string;
  kind: 'glyph';
  text: string;
  fontSize?: number;
}

export interface TracePolylineTarget {
  id: string;
  label: string;
  kind: 'polyline';
  points: Array<{ x: number; y: number }>;
}

export type TracePathSpec = TraceGlyphTarget | TracePolylineTarget;

export interface TracePathInteraction {
  type: 'trace_path';
  prompt?: string;
  targets: TracePathSpec[];
  minCoverage?: number;
}

export interface LaunchActivityInteraction {
  type: 'launch_activity';
  prompt?: string;
  activityType: ActivityType;
  activityData: ActivityData;
}

export type SceneInteraction = TracePathInteraction | LaunchActivityInteraction;

export interface LessonScene {
  id: string;
  title: string;
  narration: string;
  onScreenText?: string;
  durationSec: number;
  visual?: SceneVisual;
  timeline?: SceneTimelineAction[];
  interaction?: SceneInteraction;
  fallbackActivity?: {
    activityType: ActivityType;
    activityData: ActivityData;
  };
}

export interface LessonSceneCompletionPolicy {
  type: 'all_scenes' | 'any_interaction';
  passingScore?: number;
  minCoverage?: number;
}

export interface LessonSceneDocument {
  version: 1;
  stepType: LessonSceneStepType;
  mode: LessonSceneMode;
  scenes: LessonScene[];
  completionPolicy?: LessonSceneCompletionPolicy;
}

type AnyRecord = Record<string, any>;

const ALLOWED_STEP_TYPES = new Set<LessonSceneStepType>(['watch', 'write', 'practice']);
const ALLOWED_MODES = new Set<LessonSceneMode>(['playback', 'guided_trace', 'activity_shell']);
const ALLOWED_TIMELINE_TYPES = new Set<SceneTimelineActionType>([
  'enter',
  'move',
  'highlight',
  'state_change',
  'particle',
  'caption',
  'pause',
]);

function toText(value: any, fallback = ''): string {
  if (value == null) return fallback;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function toSafeInt(value: any, fallback: number, min = 0, max = 3600): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function toStringArray(value: any, max = 6): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => toText(item)).filter(Boolean).slice(0, max);
}

function sanitizeBackground(raw: any): SceneBackground | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const type = toText(raw.type, 'abstract') as SceneBackground['type'];
  if (!['day', 'night', 'indoor', 'seasonal', 'abstract'].includes(type)) return undefined;
  const season = toText(raw.season) as SceneBackground['season'];
  return {
    type,
    themeColor: toText(raw.themeColor) || undefined,
    accentColor: toText(raw.accentColor) || undefined,
    season: ['spring', 'summer', 'autumn', 'winter'].includes(season) ? season : undefined,
  };
}

function sanitizeCharacters(value: any): SceneCharacter[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const characters = value
    .map((entry: any, index: number) => ({
      id: toText(entry?.id, `character-${index + 1}`),
      label: toText(entry?.label || entry?.name),
      pose: toText(entry?.pose) || undefined,
      mood: toText(entry?.mood) || undefined,
      color: toText(entry?.color) || undefined,
    }))
    .filter((entry) => entry.label);
  return characters.length > 0 ? characters.slice(0, 8) : undefined;
}

function sanitizeItems(value: any): SceneItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((entry: any, index: number) => ({
      id: toText(entry?.id, `item-${index + 1}`),
      label: toText(entry?.label || entry?.name),
      kind: toText(entry?.kind) || undefined,
      state: toText(entry?.state) || undefined,
      color: toText(entry?.color) || undefined,
    }))
    .filter((entry) => entry.label);
  return items.length > 0 ? items.slice(0, 12) : undefined;
}

function sanitizeVisual(raw: any): SceneVisual | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const visual: SceneVisual = {
    background: sanitizeBackground(raw.background),
    characters: sanitizeCharacters(raw.characters),
    items: sanitizeItems(raw.items),
    effects: toStringArray(raw.effects),
    caption: toText(raw.caption) || undefined,
    templateId: toText(raw.templateId) || undefined,
    templateParams: raw.templateParams && typeof raw.templateParams === 'object' ? raw.templateParams : undefined,
  };
  return visual.background || visual.characters || visual.items || visual.effects?.length || visual.caption || visual.templateId
    ? visual
    : undefined;
}

function sanitizeTimeline(value: any): SceneTimelineAction[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const timeline = value
    .map((entry: any) => {
      const type = toText(entry?.type) as SceneTimelineActionType;
      if (!ALLOWED_TIMELINE_TYPES.has(type)) return null;
      return {
        type,
        target: toText(entry?.target) || undefined,
        value: toText(entry?.value) || undefined,
        durationSec: entry?.durationSec != null ? toSafeInt(entry.durationSec, 1, 0, 60) : undefined,
        atSec: entry?.atSec != null ? toSafeInt(entry.atSec, 0, 0, 3600) : undefined,
      };
    })
    .filter(Boolean) as SceneTimelineAction[];
  return timeline.length > 0 ? timeline.slice(0, 12) : undefined;
}

function sanitizeTraceTargets(value: any): TracePathSpec[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry: any, index: number) => {
      const kind = toText(entry?.kind, 'glyph');
      if (kind === 'polyline' && Array.isArray(entry?.points)) {
        const points = entry.points
          .map((point: any) => ({
            x: Number(point?.x),
            y: Number(point?.y),
          }))
          .filter((point: any) => Number.isFinite(point.x) && Number.isFinite(point.y))
          .map((point: any) => ({
            x: Math.max(0, Math.min(1, point.x)),
            y: Math.max(0, Math.min(1, point.y)),
          }));
        if (points.length >= 2) {
          return {
            id: toText(entry?.id, `trace-${index + 1}`),
            label: toText(entry?.label, `描一描 ${index + 1}`),
            kind: 'polyline' as const,
            points,
          };
        }
      }

      const text = toText(entry?.text || entry?.label);
      if (!text) return null;
      return {
        id: toText(entry?.id, `trace-${index + 1}`),
        label: toText(entry?.label, text),
        kind: 'glyph' as const,
        text,
        fontSize: entry?.fontSize != null ? toSafeInt(entry.fontSize, 72, 24, 140) : undefined,
      };
    })
    .filter(Boolean) as TracePathSpec[];
}

function sanitizeInteraction(raw: any): SceneInteraction | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const type = toText(raw.type);
  if (type === 'trace_path') {
    const targets = sanitizeTraceTargets(raw.targets);
    if (targets.length === 0) return undefined;
    return {
      type: 'trace_path',
      prompt: toText(raw.prompt) || undefined,
      targets,
      minCoverage: raw.minCoverage != null ? Math.max(0.1, Math.min(1, Number(raw.minCoverage))) : undefined,
    };
  }

  if (type === 'launch_activity') {
    const activityType = toText(raw.activityType) as ActivityType;
    if (!activityType) return undefined;
    const activityData = raw.activityData && typeof raw.activityData === 'object'
      ? raw.activityData as ActivityData
      : ({ type: activityType, title: toText(raw.prompt, '互动练习') } as ActivityData);
    return {
      type: 'launch_activity',
      prompt: toText(raw.prompt) || undefined,
      activityType,
      activityData,
    };
  }

  return undefined;
}

function sanitizeFallbackActivity(raw: any): LessonScene['fallbackActivity'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const activityType = toText(raw.activityType) as ActivityType;
  const activityData = raw.activityData && typeof raw.activityData === 'object' ? raw.activityData as ActivityData : null;
  if (!activityType || !activityData) return undefined;
  return { activityType, activityData };
}

function sanitizeCompletionPolicy(raw: any, fallbackMode: LessonSceneMode): LessonSceneCompletionPolicy {
  const type = toText(raw?.type, fallbackMode === 'activity_shell' ? 'any_interaction' : 'all_scenes');
  return {
    type: type === 'any_interaction' ? 'any_interaction' : 'all_scenes',
    passingScore: raw?.passingScore != null ? toSafeInt(raw.passingScore, 80, 0, 100) : undefined,
    minCoverage: raw?.minCoverage != null ? Math.max(0.1, Math.min(1, Number(raw.minCoverage))) : undefined,
  };
}

export function sanitizeSceneDocument(
  raw: any,
  stepType: LessonSceneStepType,
  fallbackMode: LessonSceneMode,
): LessonSceneDocument | null {
  if (!raw || typeof raw !== 'object') return null;
  const resolvedStepType = toText(raw.stepType, stepType) as LessonSceneStepType;
  const resolvedMode = toText(raw.mode, fallbackMode) as LessonSceneMode;
  const scenesRaw = Array.isArray(raw.scenes) ? raw.scenes : [];

  const scenes = scenesRaw
    .map((entry: any, index: number) => {
      const scene: LessonScene = {
        id: toText(entry?.id, `${stepType}-scene-${index + 1}`),
        title: toText(entry?.title || entry?.scene || entry?.caption, `场景 ${index + 1}`),
        narration: toText(entry?.narration),
        onScreenText: toText(entry?.onScreenText || entry?.caption) || undefined,
        durationSec: toSafeInt(entry?.durationSec, fallbackMode === 'guided_trace' ? 20 : 12, 3, 180),
        visual: sanitizeVisual(entry?.visual),
        timeline: sanitizeTimeline(entry?.timeline),
        interaction: sanitizeInteraction(entry?.interaction),
        fallbackActivity: sanitizeFallbackActivity(entry?.fallbackActivity),
      };
      return scene.title || scene.narration || scene.interaction ? scene : null;
    })
    .filter(Boolean) as LessonScene[];

  if (scenes.length === 0) return null;

  return {
    version: 1,
    stepType: ALLOWED_STEP_TYPES.has(resolvedStepType) ? resolvedStepType : stepType,
    mode: ALLOWED_MODES.has(resolvedMode) ? resolvedMode : fallbackMode,
    scenes: scenes.slice(0, 12),
    completionPolicy: sanitizeCompletionPolicy(raw.completionPolicy, fallbackMode),
  };
}

function inferWatchBackground(source: string): SceneBackground {
  if (/(夜|晚上|星星|月亮|黑夜)/.test(source)) return { type: 'night' };
  if (/(教室|课堂|室内|老师)/.test(source)) return { type: 'indoor' };
  if (/(四季|季节|春夏秋冬)/.test(source)) return { type: 'seasonal' };
  return { type: 'day' };
}

function extractTeachingCharacter(source: string): string | null {
  const patterns = [
    /认识[“"'‘]?([\u4e00-\u9fff])[”"'’]?字/,
    /[“"'‘]([\u4e00-\u9fff])[”"'’]字/,
    /([\u4e00-\u9fff])字讲解/,
    /汉字[“"'‘]?([\u4e00-\u9fff])[”"'’]?/,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

function extractRevealWords(source: string): string[] {
  const quoted = source.match(/[“"'‘]([\u4e00-\u9fff]{2,8})[”"'’]/)?.[1];
  if (quoted) return quoted.length <= 4 ? quoted.split('') : [quoted];

  const separated = source
    .split(/[、，,]/)
    .map((part) => (part.match(/[\u4e00-\u9fff]{1,4}/g) || []).join(''))
    .filter(Boolean);
  if (separated.length >= 2) return Array.from(new Set(separated)).slice(0, 4);

  if (/(认识|复习|词语|生字|汉字|朗读)/.test(source)) {
    const chars = (source.match(/[\u4e00-\u9fff]/g) || []).filter(
      (char) => !'认识复习字词语讲解朗读老师小朋友'.includes(char),
    );
    const uniqueChars = Array.from(new Set(chars));
    if (uniqueChars.length >= 2) return uniqueChars.slice(0, 4);
  }

  const phrase = source.match(/[\u4e00-\u9fff]{2,4}/g)?.find((item) => item.length >= 2);
  return phrase ? [phrase] : [];
}

function inferSeasonIndex(source: string): number {
  if (/春/.test(source)) return 0;
  if (/夏/.test(source)) return 1;
  if (/秋/.test(source)) return 2;
  if (/冬/.test(source)) return 3;
  return -1;
}

function inferWatchTemplateHint(scene: AnyRecord, domain?: string): Pick<SceneVisual, 'templateId' | 'templateParams'> {
  const headline = [
    toText(scene?.onScreenText || scene?.caption),
    toText(scene?.title || scene?.scene || scene?.shot),
  ]
    .filter(Boolean)
    .join(' ');
  const source = [
    headline,
    toText(scene?.narration),
    toText(scene?.imagePrompt || scene?.visualPrompt),
  ]
    .filter(Boolean)
    .join(' ');

  // 1. Explicit template from LLM output
  if (scene?.animationTemplate) {
    return {
      templateId: toText(scene.animationTemplate) || undefined,
      templateParams: scene?.animationParams && typeof scene.animationParams === 'object'
        ? scene.animationParams
        : undefined,
    };
  }

  // 2. Character stroke detection (single Chinese character)
  const character = extractTeachingCharacter(headline) || extractTeachingCharacter(source);
  if (character) {
    return {
      templateId: 'language.character-stroke',
      templateParams: { character, showGrid: true },
    };
  }

  // 3. Domain-based template suggestion (uses full rule library covering all 15 templates)
  if (domain) {
    const suggested = suggestTemplateByDomain(domain, source);
    if (suggested) {
      return { templateId: suggested, templateParams: {} };
    }
  }

  // 4. Science domain patterns
  if (/(四季|季节|春夏秋冬|天气|春|夏|秋|冬)/.test(source)) {
    return {
      templateId: 'science.seasons-cycle',
      templateParams: {
        seasonNames: ['春', '夏', '秋', '冬'],
        focusSeason: inferSeasonIndex(source),
        showLabels: true,
      },
    };
  }

  if (/(白天|黑夜|昼夜|太阳|月亮|早晨|晚上|黄昏|地球|星空|影子)/.test(source)) {
    return {
      templateId: 'science.day-night-cycle',
      templateParams: { rotationSpeed: 1, showLabels: true },
    };
  }

  if (/(水循环|蒸发|云|下雨|冰|雪|彩虹|降水|声音|光|磁铁|溶解)/.test(source)) {
    return {
      templateId: 'science.water-cycle',
      templateParams: { speed: 1, showLabels: true },
    };
  }

  if (/(植物|种子|发芽|开花|生长|树|草|果实|花|蔬菜|动物|昆虫|蝴蝶|蚂蚁|鸟|鱼|食物|水果|营养)/.test(source)) {
    return {
      templateId: 'science.plant-growth',
      templateParams: { plantType: 'flower', stages: 5 },
    };
  }

  // 4. Math domain patterns
  if (/(数字|数数|计数|数量|加法|减法|一共|还剩|分成|比大小)/.test(source)) {
    return {
      templateId: 'math.counting-objects',
      templateParams: { objectType: 'star', targetCount: 5 },
    };
  }

  if (/(形状|三角|圆形|方形|图形|长方|正方|梯形|菱形|五角星)/.test(source)) {
    return {
      templateId: 'math.shape-builder',
      templateParams: { shapes: ['circle', 'square', 'triangle'] },
    };
  }

  if (/(数轴|排序|顺序|相邻|倒数|单数|双数|规律)/.test(source)) {
    return {
      templateId: 'math.number-line',
      templateParams: { startNum: 1, endNum: 10 },
    };
  }

  if (/算盘/.test(source)) {
    return {
      templateId: 'math.abacus',
      templateParams: { rows: 5, showNumbers: true },
    };
  }

  // 5. Art domain patterns
  if (/(颜色|色彩|调色|混色|红|蓝|黄|绿|紫|橙|粉)/.test(source)) {
    return {
      templateId: 'art.color-mixing',
      templateParams: {},
    };
  }

  if (/(画画|绘画|简笔画|手工|折纸|剪纸|涂色|描线|音乐|唱歌|乐器|节奏)/.test(source)) {
    return {
      templateId: 'art.drawing-steps',
      templateParams: {},
    };
  }

  // 6. Social domain patterns
  if (/(情绪|表情|开心|生气|难过|害怕|勇敢|害羞|感动|委屈)/.test(source)) {
    return {
      templateId: 'social.emotion-faces',
      templateParams: { emotions: ['happy', 'sad', 'angry', 'surprised'] },
    };
  }

  if (/(作息|习惯|日常|时间安排|一天|起床|睡觉|刷牙|吃饭|家庭|节日)/.test(source)) {
    return {
      templateId: 'social.daily-routine',
      templateParams: {},
    };
  }

  // 7. Word reveal for language content
  const words = extractRevealWords(headline);
  if (words.length > 0) {
    return {
      templateId: 'language.word-reveal',
      templateParams: { words },
    };
  }

  return {
    templateId: 'language.story-scene',
    templateParams: {
      bgType: inferWatchBackground(source).type === 'seasonal' ? 'day' : inferWatchBackground(source).type,
      characters: ['老师', '小朋友'],
      items: toStringArray(source.match(/春|夏|秋|冬|花|太阳|树叶|雪花|观察|发现/g) || []),
    },
  };
}

function buildWatchTemplateHint(source: string, scene: AnyRecord, domain?: string): SceneVisual {
  const templateHint = inferWatchTemplateHint(scene, domain);
  const visual: SceneVisual = {
    background: inferWatchBackground(source),
    caption: toText(scene?.onScreenText || scene?.caption),
    characters: [{ id: 'teacher', label: '老师' }, { id: 'child', label: '小朋友' }],
    items: toStringArray(source.match(/春|夏|秋|冬|花|太阳|树叶|雪花/g) || []).map((label, index) => ({
      id: `item-${index + 1}`,
      label,
    })),
    templateId: templateHint.templateId,
    templateParams: templateHint.templateParams,
  };

  return visual;
}

export function deriveWatchSceneDocument(
  module: AnyRecord,
  topic: string,
  domain?: string,
): LessonSceneDocument {
  const sourceScenes = Array.isArray(module?.visualStory?.scenes) && module.visualStory.scenes.length > 0
    ? module.visualStory.scenes
    : Array.isArray(module?.videoLesson?.shots)
      ? module.videoLesson.shots
      : [];

  const scenes = sourceScenes.slice(0, 12).map((entry: AnyRecord, index: number) => {
    const source = [
      toText(entry?.scene || entry?.shot),
      toText(entry?.imagePrompt || entry?.visualPrompt),
      toText(entry?.narration),
      toText(entry?.onScreenText || entry?.caption),
    ].join(' ');

    return {
      id: `watch-scene-${index + 1}`,
      title: toText(entry?.scene || entry?.shot, `场景 ${index + 1}`),
      narration: toText(entry?.narration, `请跟着老师一起观察${topic}。`),
      onScreenText: toText(entry?.onScreenText || entry?.caption) || undefined,
      durationSec: toSafeInt(entry?.durationSec, 12, 3, 120),
      visual: buildWatchTemplateHint(source, entry, domain),
      timeline: [{ type: 'caption', value: toText(entry?.onScreenText || entry?.caption), atSec: 0 }],
    } satisfies LessonScene;
  });

  return {
    version: 1,
    stepType: 'watch',
    mode: 'playback',
    scenes: scenes.length > 0 ? scenes : [{
      id: 'watch-scene-1',
      title: `认识${topic}`,
      narration: `请跟着老师一起认识${topic}。`,
      onScreenText: `认识${topic}`,
      durationSec: 12,
      visual: {
        background: { type: 'day' },
        caption: `认识${topic}`,
        characters: [{ id: 'teacher', label: '老师' }, { id: 'child', label: '小朋友' }],
      },
    }],
    completionPolicy: { type: 'all_scenes', passingScore: 85 },
  };
}

export function deriveWriteSceneDocument(
  writing: AnyRecord,
  topic: string,
): LessonSceneDocument {
  const tracingItems = Array.isArray(writing?.tracingItems) ? writing.tracingItems : [];
  const practiceTasks = Array.isArray(writing?.practiceTasks) ? writing.practiceTasks : [];
  const checklist = Array.isArray(writing?.checklist) ? writing.checklist : [];
  const targets = tracingItems.length > 0 ? tracingItems : [topic];

  const scenes = targets.slice(0, 6).map((item: any, index: number) => {
    const text = toText(item, topic);
    return {
      id: `write-scene-${index + 1}`,
      title: `描一描 ${text}`,
      narration: `沿着提示描一描“${text}”，描完整再进入下一项。`,
      onScreenText: `描一描 ${text}`,
      durationSec: 20,
      visual: {
        background: { type: 'indoor' },
        caption: writing?.goal ? toText(writing.goal) : `描一描 ${text}`,
        characters: [{ id: 'teacher', label: '老师' }],
        items: checklist.slice(0, 3).map((label: any, itemIndex: number) => ({
          id: `write-check-${itemIndex + 1}`,
          label: toText(label),
        })),
      },
      interaction: {
        type: 'trace_path',
        prompt: practiceTasks[index] ? toText(practiceTasks[index]) : `描好“${text}”`,
        targets: [{ id: `trace-${index + 1}`, label: text, kind: 'glyph', text, fontSize: 84 }],
        minCoverage: 0.9,
      },
    } satisfies LessonScene;
  });

  return {
    version: 1,
    stepType: 'write',
    mode: 'guided_trace',
    scenes,
    completionPolicy: { type: 'all_scenes', minCoverage: 0.9, passingScore: 80 },
  };
}

export function derivePracticeSceneDocument(
  activityType: ActivityType,
  activityData: ActivityData,
  topic: string,
): LessonSceneDocument {
  return {
    version: 1,
    stepType: 'practice',
    mode: 'activity_shell',
    scenes: [
      {
        id: 'practice-intro',
        title: `${topic} 互动练习`,
        narration: `我们先看清楚练习规则，再开始动手挑战。`,
        onScreenText: `${topic} 互动练习`,
        durationSec: 10,
        visual: {
          background: { type: 'indoor' },
          caption: toText(activityData?.title, `${topic} 互动练习`),
          characters: [{ id: 'teacher', label: '老师' }, { id: 'child', label: '小朋友' }],
          items: [{ id: 'rule-1', label: '看提示' }, { id: 'rule-2', label: '动动手' }, { id: 'rule-3', label: '试一试' }],
        },
      },
      {
        id: 'practice-activity',
        title: `开始${toText(activityData?.title, '互动练习')}`,
        narration: `现在轮到你来试一试，完成互动练习吧。`,
        onScreenText: '开始练习',
        durationSec: 20,
        visual: {
          background: { type: 'abstract' },
          caption: toText(activityData?.title, '互动练习'),
          effects: ['focus'],
        },
        interaction: {
          type: 'launch_activity',
          prompt: '开始互动练习',
          activityType,
          activityData,
        },
        fallbackActivity: {
          activityType,
          activityData,
        },
      },
      {
        id: 'practice-feedback',
        title: '练习反馈',
        narration: `做得很好，回顾一下刚才完成的练习重点吧。`,
        onScreenText: '练习完成',
        durationSec: 8,
        visual: {
          background: { type: 'day' },
          caption: '练习完成',
          effects: ['celebrate'],
        },
      },
    ],
    completionPolicy: { type: 'any_interaction', passingScore: 80 },
  };
}
