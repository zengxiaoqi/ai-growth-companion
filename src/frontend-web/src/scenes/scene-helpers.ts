import type {
  ActivityData,
  ActivityType,
  LessonScene,
  LessonSceneDocument,
  LessonSceneMode,
  LessonSceneStepType,
} from '@/types';

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

function toArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

function buildSceneSource(scene: any): string {
  return [
    toText(scene?.onScreenText || scene?.caption),
    toText(scene?.title || scene?.scene || scene?.shot),
    toText(scene?.narration),
    toText(scene?.imagePrompt || scene?.visualPrompt),
  ]
    .filter(Boolean)
    .join(' ');
}

function hasSceneDocument(value: any): value is LessonSceneDocument {
  return !!value && typeof value === 'object' && Array.isArray(value.scenes);
}

function normalizeSceneDocument(
  raw: any,
  stepType: LessonSceneStepType,
  mode: LessonSceneMode,
): LessonSceneDocument | null {
  if (!hasSceneDocument(raw)) return null;

  const scenes = raw.scenes
    .map((scene: any, index: number) => normalizeScene(scene, stepType, index))
    .filter(Boolean) as LessonScene[];

  if (scenes.length === 0) return null;

  return {
    version: 1,
    stepType,
    mode,
    scenes,
    completionPolicy: raw.completionPolicy && typeof raw.completionPolicy === 'object'
      ? raw.completionPolicy
      : undefined,
  };
}

function normalizeScene(scene: any, stepType: LessonSceneStepType, index: number): LessonScene | null {
  const title = toText(scene?.title || scene?.scene || scene?.caption, `${stepType} 场景 ${index + 1}`);
  const narration = toText(scene?.narration);
  const interaction = scene?.interaction && typeof scene.interaction === 'object' ? scene.interaction : undefined;
  if (!title && !narration && !interaction) return null;

  return {
    id: toText(scene?.id, `${stepType}-scene-${index + 1}`),
    title,
    narration,
    onScreenText: toText(scene?.onScreenText || scene?.caption) || undefined,
    durationSec: toSafeInt(scene?.durationSec, stepType === 'write' ? 20 : 12, 3, 180),
    visual: scene?.visual && typeof scene.visual === 'object' ? scene.visual : undefined,
    timeline: Array.isArray(scene?.timeline) ? scene.timeline : undefined,
    interaction,
    fallbackActivity: scene?.fallbackActivity && typeof scene.fallbackActivity === 'object'
      ? scene.fallbackActivity
      : undefined,
  };
}

function inferBackgroundType(source: string): 'day' | 'night' | 'indoor' | 'seasonal' | 'abstract' {
  if (/(夜|晚上|星星|月亮|黑夜)/.test(source)) return 'night';
  if (/(四季|季节|春夏秋冬)/.test(source)) return 'seasonal';
  if (/(教室|课堂|室内|老师)/.test(source)) return 'indoor';
  return 'day';
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

function extractSceneItems(source: string): string[] {
  return Array.from(new Set((source.match(/春|夏|秋|冬|花|太阳|树叶|雪花|观察|发现/g) || []))).slice(0, 4);
}

function inferSeasonIndex(source: string): number {
  if (/春/.test(source)) return 0;
  if (/夏/.test(source)) return 1;
  if (/秋/.test(source)) return 2;
  if (/冬/.test(source)) return 3;
  return -1;
}

function inferWatchTemplate(scene: any): { templateId: string; templateParams: Record<string, any> } | null {
  const headline = [scene?.onScreenText, scene?.title, scene?.scene, scene?.caption, scene?.shot]
    .map((value) => toText(value))
    .join(' ')
    .trim();
  const source = buildSceneSource(scene);

  // Also include visual field data for inference (new rich visual data from LLM)
  const visual = scene?.visual && typeof scene.visual === 'object' ? scene.visual : {};
  const visualSource = [
    toText(visual?.bgType),
    toText(visual?.caption),
    ...(Array.isArray(visual?.characters) ? visual.characters.map((c: any) => toText(c)) : []),
    ...(Array.isArray(visual?.items) ? visual.items.map((i: any) => toText(i)) : []),
  ].filter(Boolean).join(' ');
  const combinedSource = `${source} ${visualSource}`.trim();

  const character = extractTeachingCharacter(headline) || extractTeachingCharacter(source);
  if (character) {
    return {
      templateId: 'language.character-stroke',
      templateParams: { character, showGrid: true },
    };
  }

  if (/(四季|季节|春夏秋冬)/.test(combinedSource)) {
    return {
      templateId: 'science.seasons-cycle',
      templateParams: {
        seasonNames: ['春', '夏', '秋', '冬'],
        focusSeason: inferSeasonIndex(combinedSource),
        showLabels: true,
      },
    };
  }

  if (/(白天|黑夜|昼夜|太阳|月亮)/.test(combinedSource)) {
    return {
      templateId: 'science.day-night-cycle',
      templateParams: { rotationSpeed: 1, showLabels: true },
    };
  }

  if (/(水循环|蒸发|云|下雨|水)/.test(combinedSource)) {
    return {
      templateId: 'science.water-cycle',
      templateParams: { speed: 1, showLabels: true },
    };
  }

  if (/(植物|种子|发芽|开花|生长)/.test(combinedSource)) {
    return {
      templateId: 'science.plant-growth',
      templateParams: { plantType: 'flower', stages: 5 },
    };
  }

  const words = extractRevealWords(headline);
  if (words.length > 0) {
    return {
      templateId: 'language.word-reveal',
      templateParams: { words },
    };
  }

  if (!source) return null;

  const bgType = inferBackgroundType(source);
  return {
    templateId: 'language.story-scene',
    templateParams: {
      bgType: bgType === 'seasonal' ? 'day' : bgType,
      characters: ['老师', '小朋友'],
      items: extractSceneItems(source),
    },
  };
}

function enrichWatchScene(scene: LessonScene, fallbackScene?: any): LessonScene {
  if (scene.visual?.templateId) return scene;

  const inferred = inferWatchTemplate(fallbackScene || scene);
  if (!inferred) return scene;

  return {
    ...scene,
    visual: {
      ...(scene.visual || {}),
      templateId: inferred.templateId,
      templateParams: scene.visual?.templateParams || inferred.templateParams,
    },
  };
}

function mergeWatchSceneDocuments(
  primary: LessonSceneDocument | null,
  fallback: LessonSceneDocument | null,
): LessonSceneDocument | null {
  if (!primary) return fallback;
  if (!fallback) return primary;

  return {
    ...primary,
    scenes: primary.scenes.map((scene, index) => {
      const fallbackScene = fallback.scenes[index];
      if (!fallbackScene) return scene;

      return {
        ...scene,
        visual: {
          ...(fallbackScene.visual || {}),
          ...(scene.visual || {}),
          templateId: scene.visual?.templateId || fallbackScene.visual?.templateId,
          templateParams: scene.visual?.templateParams || fallbackScene.visual?.templateParams,
        },
      };
    }),
  };
}

function normalizeWordRevealWords(scene: any): string[] {
  const rawWords = scene?.animationParams?.words;
  if (!Array.isArray(rawWords)) return [];
  return rawWords.map((word) => toText(word)).filter(Boolean);
}

function isLowInformationWordReveal(scenes: any[]): boolean {
  if (scenes.length < 2) return false;
  if (!scenes.every((scene) => scene?.animationTemplate === 'language.word-reveal')) return false;
  const uniqueWords = new Set(scenes.map((scene) => normalizeWordRevealWords(scene).join('|')).filter(Boolean));
  if (uniqueWords.size !== 1) return false;
  const [value = ''] = Array.from(uniqueWords);
  return value.split('|').filter(Boolean).length <= 1;
}

function repairLegacyWatchScenes(scenes: any[]): any[] {
  if (!isLowInformationWordReveal(scenes)) return scenes;
  const source = scenes
    .map((scene) => [scene?.scene, scene?.imagePrompt, scene?.narration, scene?.onScreenText].join(' '))
    .join(' ');
  const isSeasonTopic = /(四季|季节|春夏秋冬)/.test(source);

  return scenes.map((scene, index) => ({
    ...scene,
    animationTemplate: isSeasonTopic ? 'science.seasons-cycle' : 'language.story-scene',
    animationParams: isSeasonTopic
      ? { seasonNames: ['春', '夏', '秋', '冬'], focusSeason: index % 4, showLabels: true }
      : {
          bgType: inferBackgroundType(source) === 'night' ? 'night' : 'day',
          characters: ['老师', '小朋友'],
          items: ['观察', '发现'],
        },
  }));
}

function deriveWatchScene(module: any): LessonSceneDocument | null {
  const rawScenes = toArray(module?.visualStory?.scenes);
  const repairedScenes = repairLegacyWatchScenes(rawScenes);
  const watchScenes = repairedScenes.length > 0 ? repairedScenes : toArray(module?.videoLesson?.shots);

  if (watchScenes.length === 0) return null;

  return {
    version: 1,
    stepType: 'watch',
    mode: 'playback',
    completionPolicy: { type: 'all_scenes', passingScore: 85 },
    scenes: watchScenes.slice(0, 8).map((scene: any, index: number) => {
      const source = [
        toText(scene?.scene || scene?.shot),
        toText(scene?.imagePrompt || scene?.visualPrompt),
        toText(scene?.narration),
        toText(scene?.onScreenText || scene?.caption),
      ].join(' ');
      const inferredTemplate = scene?.animationTemplate
        ? {
            templateId: toText(scene.animationTemplate),
            templateParams: scene?.animationParams && typeof scene.animationParams === 'object'
              ? scene.animationParams
              : undefined,
          }
        : inferWatchTemplate(scene);

      return enrichWatchScene({
        id: `watch-scene-${index + 1}`,
        title: toText(scene?.scene || scene?.shot, `场景 ${index + 1}`),
        narration: toText(scene?.narration, '请跟着老师一起观察。'),
        onScreenText: toText(scene?.onScreenText || scene?.caption) || undefined,
        durationSec: toSafeInt(scene?.durationSec, 12, 3, 120),
        visual: {
          background: { type: inferBackgroundType(source) },
          caption: toText(scene?.onScreenText || scene?.caption),
          characters: [{ id: 'teacher', label: '老师' }, { id: 'child', label: '小朋友' }],
          items: Array.from(new Set((source.match(/春|夏|秋|冬|花|太阳|树叶|雪花|观察|发现/g) || []))).slice(0, 4).map((label, itemIndex) => ({
            id: `watch-item-${itemIndex + 1}`,
            label,
          })),
          templateId: inferredTemplate?.templateId,
          templateParams: inferredTemplate?.templateParams,
        },
        timeline: [{ type: 'caption', value: toText(scene?.onScreenText || scene?.caption), atSec: 0 }],
      }, scene);
    }),
  };
}

function deriveWriteScene(module: any): LessonSceneDocument | null {
  const writing = module?.writing || {};
  const tracingItems = toArray(writing?.tracingItems);
  const practiceTasks = toArray(writing?.practiceTasks);
  if (tracingItems.length === 0 && practiceTasks.length === 0) return null;

  const items = tracingItems.length > 0 ? tracingItems : [toText(writing?.goal, '描一描')];

  return {
    version: 1,
    stepType: 'write',
    mode: 'guided_trace',
    completionPolicy: { type: 'all_scenes', minCoverage: 0.7, passingScore: 80 },
    scenes: items.slice(0, 6).map((item: any, index: number) => {
      const text = toText(item, '写一写');
      return {
        id: `write-scene-${index + 1}`,
        title: `描一描 ${text}`,
        narration: `沿着提示描一描“${text}”。`,
        onScreenText: `描一描 ${text}`,
        durationSec: 20,
        visual: {
          background: { type: 'indoor' },
          caption: toText(writing?.goal, `描一描 ${text}`),
          characters: [{ id: 'teacher', label: '老师' }],
          items: practiceTasks.slice(0, 2).map((task: any, taskIndex: number) => ({
            id: `write-task-${taskIndex + 1}`,
            label: toText(task),
          })),
        },
        interaction: {
          type: 'trace_path',
          prompt: toText(practiceTasks[index], `描一描 ${text}`),
          targets: [{ id: `trace-${index + 1}`, label: text, kind: 'glyph', text, fontSize: 84 }],
          minCoverage: 0.7,
        },
      };
    }),
  };
}

function derivePracticeScene(module: any): LessonSceneDocument | null {
  const game = module?.game || {};
  const activityType = toText(game?.activityType || game?.type || 'quiz') as ActivityType;
  const activityData = (game?.activityData || game || { type: activityType, title: '互动练习' }) as ActivityData;
  if (!activityType) return null;

  return {
    version: 1,
    stepType: 'practice',
    mode: 'activity_shell',
    completionPolicy: { type: 'any_interaction', passingScore: 80 },
    scenes: [
      {
        id: 'practice-intro',
        title: toText(activityData?.title, '互动练习'),
        narration: '先看清楚规则，再开始互动练习。',
        onScreenText: toText(activityData?.title, '互动练习'),
        durationSec: 10,
        visual: {
          background: { type: 'indoor' },
          caption: toText(activityData?.title, '互动练习'),
          characters: [{ id: 'teacher', label: '老师' }, { id: 'child', label: '小朋友' }],
          items: [{ id: 'rule-1', label: '看提示' }, { id: 'rule-2', label: '动动手' }, { id: 'rule-3', label: '试一试' }],
        },
      },
      {
        id: 'practice-activity',
        title: '开始练习',
        narration: '现在轮到你来试一试。',
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
        fallbackActivity: { activityType, activityData },
      },
      {
        id: 'practice-feedback',
        title: '练习完成',
        narration: '做得很好，我们来回顾一下刚才的练习重点。',
        onScreenText: '练习完成',
        durationSec: 8,
        visual: {
          background: { type: 'day' },
          caption: '练习完成',
          effects: ['celebrate'],
        },
      },
    ],
  };
}

export function resolveLessonSceneDocument(stepType: LessonSceneStepType, module: any): LessonSceneDocument | null {
  const directScene = normalizeSceneDocument(module?.scene, stepType, stepType === 'watch'
    ? 'playback'
    : stepType === 'write'
      ? 'guided_trace'
      : 'activity_shell');

  if (stepType === 'watch') {
    const derivedWatchScene = deriveWatchScene(module);
    if (!directScene) return derivedWatchScene;

    return mergeWatchSceneDocuments(
      {
        ...directScene,
        scenes: directScene.scenes.map((scene, index) => enrichWatchScene(scene, derivedWatchScene?.scenes[index])),
      },
      derivedWatchScene,
    );
  }

  if (directScene) return directScene;
  if (stepType === 'write') return deriveWriteScene(module);
  if (stepType === 'practice') return derivePracticeScene(module);
  return null;
}
