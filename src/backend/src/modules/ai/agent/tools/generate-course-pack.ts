import { Injectable, Logger } from '@nestjs/common';
import { LlmClient } from '../../llm/llm-client';
import { GenerateActivityTool, type ActivityType } from './generate-activity';
import { buildTemplatePromptContext, KNOWN_TEMPLATE_IDS, suggestTemplateByDomain } from '../../../../animations/animation-templates';
import {
  derivePracticeSceneDocument,
  deriveWatchSceneDocument,
  deriveWriteSceneDocument,
  sanitizeSceneDocument,
  type LessonSceneDocument,
} from '../../../learning/lesson-scene';
import { getCoursePackCurriculumSeed } from '../../../learning/course-curriculum-fallback';

type CourseFocus = 'literacy' | 'math' | 'science' | 'mixed';
type AgeGroup = '3-4' | '5-6';
type CourseDomain = 'language' | 'math' | 'science' | 'art' | 'social';

type GenerateCoursePackArgs = {
  topic: string;
  ageGroup?: AgeGroup;
  durationMinutes?: number;
  focus?: CourseFocus;
  domain?: CourseDomain;
  difficulty?: number;
  includeGame?: boolean;
  includeAudio?: boolean;
  includeVideo?: boolean;
  parentPrompt?: string;
};

type NormalizedArgs = {
  topic: string;
  ageGroup: AgeGroup;
  durationMinutes: number;
  focus: CourseFocus;
  difficulty: number;
  includeGame: boolean;
  includeAudio: boolean;
  includeVideo: boolean;
  parentPrompt: string;
  domain: CourseDomain;
  gameType: ActivityType;
};

const MAX_ATTEMPTS = 3;
const ACTIVITY_TYPES: ActivityType[] = [
  'quiz',
  'true_false',
  'fill_blank',
  'matching',
  'connection',
  'sequencing',
  'puzzle',
];

@Injectable()
export class GenerateCoursePackTool {
  private readonly logger = new Logger(GenerateCoursePackTool.name);

  constructor(
    private readonly llmClient: LlmClient,
    private readonly generateActivityTool: GenerateActivityTool,
  ) {}

  async execute(args: GenerateCoursePackArgs): Promise<string> {
    const normalized = this.normalizeArgs(args);
    const gameBundle = normalized.includeGame
      ? await this.generateGameBundle(normalized)
      : null;
    const failures: string[] = [];

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const prompt = this.buildPrompt(normalized, attempt, failures);
        const llmResponse = await this.llmClient.generate(prompt);
        const parsed = this.extractJsonObject(llmResponse);
        if (!parsed) {
          failures.push(`attempt ${attempt}: invalid JSON`);
          continue;
        }

        const coursePack = this.sanitizeCoursePack(normalized, parsed, gameBundle);
        return JSON.stringify(coursePack);
      } catch (error: any) {
        failures.push(`attempt ${attempt}: ${error?.message || 'unknown'}`);
      }
    }

    this.logger.warn(`generateCoursePack fell back to template. ${failures.join(' | ')}`);
    return JSON.stringify(this.fallbackCoursePack(normalized, gameBundle));
  }

  ensureTeachingMediaPack(pack: Record<string, any>): Record<string, any> {
    const source = pack && typeof pack === 'object' ? pack : {};
    const topic = this.toText(source?.topic || source?.title, '学习主题');
    const normalized = this.normalizeArgs({
      topic,
      ageGroup: source?.ageGroup,
      durationMinutes: this.toSafeInt(
        source?.durationMinutes,
        Math.max(10, Math.ceil(this.toSafeInt(source?.videoLesson?.durationSec, 120) / 60)),
      ),
      focus: this.deriveFocusFromPack(source),
      difficulty: this.toSafeInt(source?.difficulty, 2),
      includeAudio: true,
      includeVideo: true,
      includeGame: false,
      parentPrompt: this.toText(source?.parentPrompt, topic),
    });

    const next = JSON.parse(JSON.stringify(source || {}));
    next.topic = this.toText(next.topic, normalized.topic);
    next.ageGroup = this.toText(next.ageGroup, normalized.ageGroup);
    next.focus = this.toText(next.focus, normalized.focus);
    next.durationMinutes = this.toSafeInt(next.durationMinutes, normalized.durationMinutes);
    next.visualStory = next.visualStory && typeof next.visualStory === 'object' ? next.visualStory : {};
    next.modules = next.modules && typeof next.modules === 'object' ? next.modules : {};
    next.modules.listening =
      next.modules.listening && typeof next.modules.listening === 'object' ? next.modules.listening : {};
    next.videoLesson = next.videoLesson && typeof next.videoLesson === 'object' ? next.videoLesson : {};
    next.videoLesson.renderGuide =
      next.videoLesson.renderGuide && typeof next.videoLesson.renderGuide === 'object'
        ? next.videoLesson.renderGuide
        : {};

    const existingScenes = Array.isArray(next.visualStory.scenes) ? next.visualStory.scenes : [];
    const existingShots = Array.isArray(next.videoLesson.shots) ? next.videoLesson.shots : [];
    const existingAudio = Array.isArray(next.modules.listening.audioScript)
      ? next.modules.listening.audioScript
      : [];

    if (this.shouldUseFallbackScenes(existingScenes, normalized)) {
      next.visualStory.scenes = this.buildTopicSceneFallback(normalized);
    }
    // Inject animation templates into scenes that don't have them yet
    if (Array.isArray(next.visualStory.scenes)) {
      next.visualStory.scenes = next.visualStory.scenes.map((scene: any) => {
        if (scene.animationTemplate) return scene;
        return { ...scene, ...this.validateAnimationTemplate(scene, normalized) };
      });
    }
    if (this.shouldUseFallbackShots(existingShots, normalized)) {
      next.videoLesson.shots = this.buildTopicShotFallback(normalized);
    }
    if (this.shouldUseFallbackAudioScript(existingAudio, normalized)) {
      next.modules.listening.audioScript = this.buildTopicAudioFallback(normalized);
    }

    next.videoLesson.title = this.toText(next.videoLesson.title, `${normalized.topic} 视频讲解`);
    next.videoLesson.durationSec = this.toSafeInt(
      next.videoLesson.durationSec,
      next.videoLesson.shots?.reduce((sum: number, shot: any) => sum + this.toSafeInt(shot?.durationSec, 12), 0) || 120,
    );
    next.videoLesson.renderGuide.aspectRatio = this.toText(next.videoLesson.renderGuide.aspectRatio, '16:9');
    next.videoLesson.renderGuide.voiceStyle = this.toText(next.videoLesson.renderGuide.voiceStyle, 'friendly teacher');
    next.videoLesson.renderGuide.musicStyle = this.toText(next.videoLesson.renderGuide.musicStyle, 'light and playful');

    return next;
  }

  private async generateGameBundle(normalized: NormalizedArgs): Promise<{
    activityType: ActivityType;
    domain: string;
    instructions: string;
    activityData: Record<string, any>;
  } | null> {
    try {
      const rawGame = await this.generateActivityTool.execute({
        type: normalized.gameType,
        topic: normalized.topic,
        difficulty: normalized.difficulty,
        ageGroup: normalized.ageGroup,
        domain: normalized.domain,
      });
      const parsedGame = this.extractJsonObject(rawGame);
      if (!parsedGame || parsedGame.error) {
        throw new Error('invalid activity payload');
      }

      return {
        activityType: normalized.gameType,
        domain: normalized.domain,
        instructions: 'Play this interactive game after the main lesson.',
        activityData: parsedGame,
      };
    } catch (error: any) {
      this.logger.warn(`generateCoursePack game generation failed: ${error?.message || 'unknown'}`);
      return null;
    }
  }

  private buildPrompt(args: NormalizedArgs, attempt: number, failures: string[]): string {
    const retryNote = failures.length
      ? `Previous issues:\n${failures.slice(-2).map((f) => `- ${f}`).join('\n')}`
      : '';

    const schema = `{
  "title": "string",
  "summary": "string",
  "outcomes": ["string", "string", "string"],
  "modules": {
    "listening": {
      "goal": "string",
      "audioScript": [{"segment":"string","narration":"string","soundCue":"string","durationSec":20}],
      "questions": ["string", "string"]
    },
    "speaking": {
      "goal": "string",
      "warmup": "string",
      "prompts": [{"prompt":"string","sampleAnswer":"string","coachTip":"string"}]
    },
    "reading": {
      "goal": "string",
      "text": "string",
      "keywords": ["string", "string", "string"],
      "questions": ["string", "string"]
    },
    "writing": {
      "goal": "string",
      "tracingItems": ["string", "string"],
      "practiceTasks": ["string", "string"],
      "checklist": ["string", "string"]
    }
  },
  "watch": {
    "scene": {
      "version": 1,
      "stepType": "watch",
      "mode": "playback",
      "scenes": [{"id":"watch-scene-1","title":"string","narration":"string","onScreenText":"string","durationSec":12,"visual":{"background":{"type":"day"},"characters":[{"id":"teacher","label":"老师"}],"items":[{"id":"item-1","label":"花"}],"effects":["focus"],"caption":"string","templateId":"optional-template-id","templateParams":{}},"timeline":[{"type":"caption","value":"string","atSec":0}]}],
      "completionPolicy": {"type":"all_scenes","passingScore":85}
    }
  },
  "write": {
    "scene": {
      "version": 1,
      "stepType": "write",
      "mode": "guided_trace",
      "scenes": [{"id":"write-scene-1","title":"string","narration":"string","onScreenText":"string","durationSec":20,"visual":{"background":{"type":"indoor"},"caption":"string"},"interaction":{"type":"trace_path","prompt":"string","minCoverage":0.7,"targets":[{"id":"trace-1","label":"string","kind":"glyph","text":"string","fontSize":84}]}}],
      "completionPolicy": {"type":"all_scenes","minCoverage":0.7,"passingScore":80}
    }
  },
  "practice": {
    "scene": {
      "version": 1,
      "stepType": "practice",
      "mode": "activity_shell",
      "scenes": [{"id":"practice-intro","title":"string","narration":"string","onScreenText":"string","durationSec":10,"visual":{"background":{"type":"indoor"},"caption":"string","items":[{"id":"rule-1","label":"看提示"}]}},{"id":"practice-activity","title":"string","narration":"string","onScreenText":"开始练习","durationSec":20,"visual":{"background":{"type":"abstract"},"caption":"string"},"interaction":{"type":"launch_activity","prompt":"string","activityType":"matching","activityData":{"type":"matching","title":"string"}}}],
      "completionPolicy": {"type":"any_interaction","passingScore":80}
    }
  },
  "visualStory": {
    "style": "string",
    "scenes": [{"scene":"string","imagePrompt":"string","narration":"string","onScreenText":"string","durationSec":12,"animationTemplate":"template-id (optional, from the template list above)","animationParams":{}}]
  },
  "videoLesson": {
    "title": "string",
    "durationSec": 180,
    "shots": [{"shot":"string","visualPrompt":"string","narration":"string","caption":"string","durationSec":18}],
    "renderGuide": {"aspectRatio":"16:9","voiceStyle":"friendly teacher","musicStyle":"light"}
  },
  "parentGuide": {
    "beforeClass": ["string", "string"],
    "duringClass": ["string", "string"],
    "afterClass": ["string", "string"],
    "assessmentChecklist": ["string", "string", "string"]
  }
}`;

    return [
      'You are a curriculum designer for preschool and early primary learners.',
      'Generate a complete multimodal course pack.',
      `Topic: ${args.topic}`,
      `Age group: ${args.ageGroup}`,
      `Domain: ${args.domain}`,
      `Focus: ${args.focus}`,
      `Duration: ${args.durationMinutes} minutes`,
      `Difficulty: ${args.difficulty} (1-3)`,
      `Parent request: ${args.parentPrompt}`,
      `Include listening module: ${args.includeAudio ? 'yes' : 'no'}`,
      `Include video module: ${args.includeVideo ? 'yes' : 'no'}`,
      `Attempt: ${attempt}`,
      retryNote,
      'Rules:',
      '- Keep all content age-appropriate and practical for home learning.',
      '- Every module must align with the topic.',
      '- Keep narration concise, concrete, and easy to perform by parents.',
      '- Use Chinese output text for learner-facing content.',
      '- Return strict JSON only. No markdown. No explanation.',
      'Animation templates:',
      buildTemplatePromptContext(),
      'For each visualStory scene, if an animation template matches, set animationTemplate to the template id and provide appropriate animationParams. If no template fits well, omit animationTemplate.',
      'JSON schema:',
      schema,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private deriveFocusFromPack(pack: Record<string, any>): CourseFocus {
    const focus = this.toText(pack?.focus).toLowerCase();
    if (focus === 'literacy' || focus === 'math' || focus === 'science' || focus === 'mixed') {
      return focus;
    }

    const source = [this.toText(pack?.topic), this.toText(pack?.title), this.toText(pack?.summary)].join(' ');

    if (/汉字|识字|字词|拼音|阅读|朗读/.test(source)) return 'literacy';
    if (/数字|数数|加法|减法|数学|图形|排序/.test(source)) return 'math';
    if (/科学|动物|植物|天气|季节|实验|观察/.test(source)) return 'science';
    return 'mixed';
  }

  private sanitizeCoursePack(
    args: NormalizedArgs,
    raw: Record<string, any>,
    gameBundle: {
      activityType: ActivityType;
      domain: string;
      instructions: string;
      activityData: Record<string, any>;
    } | null,
  ): Record<string, any> {
    const curriculumSeed = this.getCurriculumSeed(args);
    const outcomes = this.toStringArray(raw?.outcomes, 3, curriculumSeed?.outcomes?.length
      ? curriculumSeed.outcomes
      : [
          `理解${args.topic}的重点内容`,
          '完成一次互动练习',
          '练习听、说、读、写',
        ]);

    const listening = raw?.modules?.listening || {};
    const speaking = raw?.modules?.speaking || {};
    const reading = raw?.modules?.reading || {};
    const writing = raw?.modules?.writing || {};

    const scenes = this.normalizeSceneList(raw?.visualStory?.scenes, args);
    const fallbackListeningQuestions = curriculumSeed?.listeningQuestions?.length
      ? curriculumSeed.listeningQuestions
      : [
          `你听到了哪些和${args.topic}有关的关键词？`,
          '你最喜欢哪一部分？',
        ];
    const fallbackReadingKeywords = curriculumSeed?.readingKeywords?.length
      ? curriculumSeed.readingKeywords
      : [args.topic, '观察', '表达'];
    const fallbackReadingQuestions = curriculumSeed?.quizItems?.length
      ? curriculumSeed.quizItems.map((item) => item.question).slice(0, 3)
      : [
          '这段内容讲了什么？',
          '你学到了什么？',
        ];
    const fallbackTracingItems = curriculumSeed?.tracingItems?.length
      ? curriculumSeed.tracingItems
      : [args.topic, '关键词'];
    const fallbackWritingTasks = curriculumSeed?.practiceTasks?.length
      ? curriculumSeed.practiceTasks
      : [
          '写下你最喜欢的知识点。',
          '用一句话总结今天的学习内容。',
        ];
    const shots = this.normalizeShotList(raw?.videoLesson?.shots, args);
    const watchScene = this.normalizeWatchScene(raw?.watch?.scene, { visualStory: { scenes }, videoLesson: { shots } }, args);
    const writeScene = this.normalizeWriteScene(raw?.write?.scene || raw?.modules?.writing?.scene, writing, args);
    const practiceScene = this.normalizePracticeScene(raw?.practice?.scene);

    const pack: Record<string, any> = {
      type: 'course_pack',
      title: this.toText(raw?.title, `${args.topic} 全方位学习课`),
      topic: args.topic,
      ageGroup: args.ageGroup,
      focus: args.focus,
      durationMinutes: args.durationMinutes,
      summary: this.toText(
        raw?.summary,
        curriculumSeed?.summary || `围绕${args.topic}进行的听说读写综合学习课程。`,
      ),
      outcomes,
      modules: {
        listening: {
          goal: this.toText(listening?.goal, `通过倾听理解${args.topic}的核心概念。`),
          audioScript: this.normalizeAudioScript(listening?.audioScript, args),
          questions: this.toStringArray(listening?.questions, 2, fallbackListeningQuestions),
        },
        speaking: {
          goal: this.toText(speaking?.goal, `用自己的话说出你对${args.topic}的理解。`),
          warmup: this.toText(speaking?.warmup, `先用一句话说说你知道的${args.topic}。`),
          prompts: this.normalizeSpeakingPrompts(speaking?.prompts, args.topic),
        },
        reading: {
          goal: this.toText(reading?.goal, `阅读并理解与${args.topic}相关的内容。`),
          text: this.toText(reading?.text, curriculumSeed?.readingText || `今天我们一起学习${args.topic}，请大声读一读。`),
          keywords: this.toStringArray(reading?.keywords, 3, fallbackReadingKeywords),
          questions: this.toStringArray(reading?.questions, 2, fallbackReadingQuestions),
        },
        writing: {
          goal: this.toText(writing?.goal, '通过书写和练习巩固今天学到的知识。'),
          tracingItems: this.toStringArray(writing?.tracingItems, 2, fallbackTracingItems),
          practiceTasks: this.toStringArray(writing?.practiceTasks, 2, fallbackWritingTasks),
          checklist: this.toStringArray(
            writing?.checklist,
            2,
            curriculumSeed?.outcomes?.slice(0, 2) || ['书写清楚', '表达完整'],
          ),
        },
      },
      watch: { scene: watchScene },
      write: { scene: writeScene },
      practice: practiceScene ? { scene: practiceScene } : undefined,
      visualStory: {
        style: this.toText(raw?.visualStory?.style, 'storyboard illustration'),
        scenes,
      },
      videoLesson: {
        title: this.toText(raw?.videoLesson?.title, `${args.topic} 视频讲解`),
        durationSec: this.toSafeInt(raw?.videoLesson?.durationSec, args.durationMinutes * 60),
        shots,
        renderGuide: {
          aspectRatio: this.toText(raw?.videoLesson?.renderGuide?.aspectRatio, '16:9'),
          voiceStyle: this.toText(raw?.videoLesson?.renderGuide?.voiceStyle, 'friendly teacher'),
          musicStyle: this.toText(raw?.videoLesson?.renderGuide?.musicStyle, 'light and playful'),
        },
      },
      parentGuide: {
        beforeClass: this.toStringArray(raw?.parentGuide?.beforeClass, 2, [
          '准备安静的学习环境。',
          '准备纸笔和计时器。',
        ]),
        duringClass: this.toStringArray(raw?.parentGuide?.duringClass, 2, [
          '每段活动后鼓励孩子复述重点。',
          '保持节奏，避免一次讲太多。',
        ]),
        afterClass: this.toStringArray(raw?.parentGuide?.afterClass, 2, [
          '复盘今天的关键词。',
          '记录孩子完成情况。',
        ]),
        assessmentChecklist: this.toStringArray(raw?.parentGuide?.assessmentChecklist, 3, [
          '能说出一个关键点',
          '能完成互动练习',
          '能完成书写任务',
        ]),
      },
      parentPrompt: args.parentPrompt,
      generatedAt: new Date().toISOString(),
    };

    if (!args.includeAudio) {
      delete pack.modules.listening.audioScript;
    }
    if (!args.includeVideo) {
      delete pack.videoLesson;
    }
    if (gameBundle) {
      pack.game = gameBundle;
    }
    if (!pack.practice?.scene && gameBundle?.activityData) {
      pack.practice = {
        scene: {
          version: 1,
          stepType: 'practice',
          mode: 'activity_shell',
          scenes: [
            {
              id: 'practice-intro',
              title: `${args.topic} 互动练习`,
              narration: '先看清楚规则，再开始互动练习。',
              onScreenText: `${args.topic} 互动练习`,
              durationSec: 10,
              visual: {
                background: { type: 'indoor' },
                caption: `${args.topic} 互动练习`,
                items: [{ id: 'rule-1', label: '看提示' }, { id: 'rule-2', label: '动动手' }],
              },
            },
            {
              id: 'practice-activity',
              title: '开始练习',
              narration: '现在轮到你来试一试。',
              onScreenText: '开始练习',
              durationSec: 20,
              visual: { background: { type: 'abstract' }, caption: '开始练习' },
              interaction: {
                type: 'launch_activity',
                prompt: '开始互动练习',
                activityType: gameBundle.activityType,
                activityData: gameBundle.activityData,
              },
            },
          ],
          completionPolicy: { type: 'any_interaction', passingScore: 80 },
        },
      };
    }
    if ((!raw?.practice?.scene || !practiceScene) && gameBundle?.activityData) {
      pack.practice = {
        scene: derivePracticeSceneDocument(
          gameBundle.activityType,
          gameBundle.activityData,
          args.topic,
        ),
      };
    }
    if (!pack.practice) delete pack.practice;
    if (!pack.write) delete pack.write;

    return pack;
  }

  private fallbackCoursePack(
    args: NormalizedArgs,
    gameBundle: {
      activityType: ActivityType;
      domain: string;
      instructions: string;
      activityData: Record<string, any>;
    } | null,
  ): Record<string, any> {
    return this.sanitizeCoursePack(args, {}, gameBundle);
  }

  private normalizeSceneList(rawScenes: any, args: NormalizedArgs): Array<Record<string, any>> {
    const scenes = Array.isArray(rawScenes) ? rawScenes : [];
    const normalized = scenes
      .map((s: any, idx: number) => ({
        scene: this.toText(s?.scene, `场景${idx + 1}`),
        imagePrompt: this.toText(s?.imagePrompt, `展示${args.topic}重点内容的课堂画面`),
        narration: this.toText(s?.narration, `请看画面，和老师一起认识${args.topic}。`),
        onScreenText: this.toText(s?.onScreenText, ''),
        durationSec: this.toSafeInt(s?.durationSec, 10),
        ...this.validateAnimationTemplate(s, args),
      }))
      .filter((s: any) => s.imagePrompt);

    if (!this.shouldUseFallbackScenes(normalized, args)) return normalized.slice(0, 8);
    return this.injectAnimationTemplates(this.buildTopicSceneFallback(args), args);
  }

  /** Inject animation template data into scenes that lack it */
  private injectAnimationTemplates(scenes: Array<Record<string, any>>, args: NormalizedArgs): Array<Record<string, any>> {
    return scenes.map((scene) => {
      if (scene.animationTemplate) return scene;
      const templateData = this.validateAnimationTemplate(scene, args);
      return { ...scene, ...templateData };
    });
  }

  private validateAnimationTemplate(scene: any, args: NormalizedArgs): Record<string, any> {
    const templateId = scene?.animationTemplate;
    if (templateId && KNOWN_TEMPLATE_IDS.has(templateId)) {
      return {
        animationTemplate: templateId,
        animationParams: (scene?.animationParams && typeof scene.animationParams === 'object')
          ? scene.animationParams : {},
      };
    }
    // Rule-based fallback: suggest a template based on domain + topic
    const suggested = suggestTemplateByDomain(args.domain, args.topic);
    if (suggested) {
      return { animationTemplate: suggested, animationParams: this.buildDefaultParams(suggested, args) };
    }
    return {};
  }

  private buildDefaultParams(templateId: string, args: NormalizedArgs): Record<string, any> {
    switch (templateId) {
      case 'language.character-stroke':
        return { character: args.topic.charAt(0), showGrid: true };
      case 'language.word-reveal':
        return { words: [args.topic] };
      case 'language.story-scene':
        return { bgType: 'day', characters: [args.topic], items: [] };
      case 'math.counting-objects':
        return { targetCount: 5, objectType: 'star' };
      case 'math.shape-builder':
        return { shapes: ['circle', 'square', 'triangle'] };
      case 'math.number-line':
        return { endNum: 10, highlightNum: 5, hopSequence: [1, 3, 5] };
      case 'math.abacus':
        return { rows: 3, values: [3, 5, 2] };
      case 'science.water-cycle':
        return { speed: 1, showLabels: true };
      case 'science.day-night-cycle':
        return { rotationSpeed: 1, showLabels: true };
      case 'science.plant-growth':
        return { plantType: 'flower', stages: 5 };
      case 'science.seasons-cycle':
        return { seasonNames: ['春', '夏', '秋', '冬'], focusSeason: -1, showLabels: true };
      case 'art.color-mixing':
        return { color1: '#EF4444', color2: '#3B82F6', resultLabel: '紫色' };
      case 'art.drawing-steps':
        return { steps: ['circle', 'line', 'circle'] };
      case 'social.emotion-faces':
        return { emotions: ['happy', 'sad', 'angry', 'surprised'] };
      case 'social.daily-routine':
        return { activities: ['起床', '上学', '午餐', '放学', '睡觉'], highlightIndex: 0 };
      default:
        return {};
     }
  }

  private mergeWatchSceneDocuments(
    primary: LessonSceneDocument | null,
    fallback: LessonSceneDocument,
  ): LessonSceneDocument {
    if (!primary) return fallback;

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

  private normalizeWatchScene(rawScene: any, packLike: Record<string, any>, args: NormalizedArgs): LessonSceneDocument {
    const nativeScene = sanitizeSceneDocument(rawScene, 'watch', 'playback');
    const derivedScene = deriveWatchSceneDocument(packLike, args.topic);
    return this.mergeWatchSceneDocuments(nativeScene, derivedScene);
  }

  private normalizeWriteScene(rawScene: any, writing: Record<string, any>, args: NormalizedArgs): LessonSceneDocument {
    return sanitizeSceneDocument(rawScene, 'write', 'guided_trace')
      || deriveWriteSceneDocument(writing, args.topic);
  }

  private normalizePracticeScene(rawScene: any): LessonSceneDocument | null {
    return sanitizeSceneDocument(rawScene, 'practice', 'activity_shell');
  }

  private normalizeShotList(rawShots: any, args: NormalizedArgs): Array<Record<string, any>> {
    const shots = Array.isArray(rawShots) ? rawShots : [];
    const normalized = shots
      .map((s: any, idx: number) => ({
        shot: this.toText(s?.shot, `讲解步骤${idx + 1}`),
        visualPrompt: this.toText(s?.visualPrompt, `展示${args.topic}学习过程的课堂动画画面`),
        narration: this.toText(s?.narration, `请跟着老师一起学习${args.topic}。`),
        caption: this.toText(s?.caption, ''),
        durationSec: this.toSafeInt(s?.durationSec, 12),
      }))
      .filter((s: any) => s.visualPrompt);

    if (!this.shouldUseFallbackShots(normalized, args)) return normalized.slice(0, 12);
    return this.buildTopicShotFallback(args);
  }

  private normalizeAudioScript(rawScript: any, args: NormalizedArgs): Array<Record<string, any>> {
    const script = Array.isArray(rawScript) ? rawScript : [];
    const normalized = script
      .map((item: any, idx: number) => ({
        segment: this.toText(item?.segment, `听力片段${idx + 1}`),
        narration: this.toText(item?.narration, `我们来听一段关于${args.topic}的内容。`),
        soundCue: this.toText(item?.soundCue, 'soft chime'),
        durationSec: this.toSafeInt(item?.durationSec, 12),
      }))
      .filter((item: any) => item.narration);

    if (!this.shouldUseFallbackAudioScript(normalized, args)) return normalized.slice(0, 8);
    return this.buildTopicAudioFallback(args);
  }

  private normalizeSpeakingPrompts(rawPrompts: any, topic: string): Array<Record<string, any>> {
    const prompts = Array.isArray(rawPrompts) ? rawPrompts : [];
    const normalized = prompts
      .map((item: any) => ({
        prompt: this.toText(item?.prompt),
        sampleAnswer: this.toText(item?.sampleAnswer, '我来试着回答。'),
        coachTip: this.toText(item?.coachTip, '鼓励孩子说完整句子。'),
      }))
      .filter((item: any) => item.prompt);

    if (normalized.length >= 2) return normalized.slice(0, 6);

    return [
      {
        prompt: `请用一句话说说你理解的${topic}。`,
        sampleAnswer: `我学会了${topic}。`,
        coachTip: '先让孩子慢慢说，再补充。',
      },
      {
        prompt: '你觉得最有趣的部分是什么？',
        sampleAnswer: '我觉得练习环节最有趣。',
        coachTip: '可以继续追问“为什么”。',
      },
    ];
  }

  private shouldUseFallbackScenes(
    scenes: Array<Record<string, any>>,
    args: NormalizedArgs,
  ): boolean {
    if (scenes.length < 4) return true;
    if (!this.hasEnoughUnitCoverage(scenes, args)) return true;
    const weakCount = scenes.filter((scene) =>
      this.isWeakTeachingContent(
        [scene.scene, scene.narration, scene.onScreenText, scene.imagePrompt],
        args.topic,
      ),
    ).length;
    return weakCount >= Math.ceil(scenes.length / 2);
  }

  private shouldUseFallbackShots(
    shots: Array<Record<string, any>>,
    args: NormalizedArgs,
  ): boolean {
    if (shots.length < 4) return true;
    if (!this.hasEnoughUnitCoverage(shots, args)) return true;
    const weakCount = shots.filter((shot) =>
      this.isWeakTeachingContent(
        [shot.shot, shot.narration, shot.caption, shot.visualPrompt],
        args.topic,
      ),
    ).length;
    return weakCount >= Math.ceil(shots.length / 2);
  }

  private shouldUseFallbackAudioScript(
    script: Array<Record<string, any>>,
    args: NormalizedArgs,
  ): boolean {
    if (script.length < 2) return true;
    if (!this.hasEnoughUnitCoverage(script, args)) return true;
    const weakCount = script.filter((item) =>
      this.isWeakTeachingContent([item.segment, item.narration], args.topic),
    ).length;
    return weakCount >= Math.ceil(script.length / 2);
  }

  private hasEnoughUnitCoverage(items: Array<Record<string, any>>, args: NormalizedArgs): boolean {
    const units = this.resolveTeachingUnits(args);
    if (units.length < 2) return true;

    const coveredCount = units.filter((unit) =>
      items.some((item) => {
        const haystack = Object.values(item || {})
          .map((value) => this.toText(value))
          .join(' ');
        return haystack.includes(unit);
      }),
    ).length;

    return coveredCount >= units.length;
  }

  private isWeakTeachingContent(values: any[], topic: string): boolean {
    const text = values
      .map((value) => this.toText(value))
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!text) return true;

    const genericPattern =
      /(opening|concept|practice|wrap[\s-]?up|scene\s*\d+|shot\s*\d+|part\s*\d+|segment\s*\d+|child interactive|educational visual|simple concept explainer|happy summary ending|learn together|intro|summary)/i;
    const hasChinese = /[\u4e00-\u9fff]/.test(text);
    const normalizedTopic = this.toText(topic).toLowerCase();
    const mentionsTopic = !!normalizedTopic && text.includes(normalizedTopic);

    if (genericPattern.test(text)) return true;
    if (!hasChinese && !mentionsTopic) return true;
    return false;
  }

  private buildTopicSceneFallback(args: NormalizedArgs): Array<Record<string, any>> {
    const guide = this.buildTopicGuide(args);
    const units = this.resolveTeachingUnits(args);
    const curriculumSeed = this.getCurriculumSeed(args);

    if (units.length >= 2) {
      const introScene = {
        scene: '情境导入',
        imagePrompt: `温暖明亮的课堂开场，引出${args.topic}里的重点内容`,
        narration: this.toText(
          curriculumSeed?.summary,
          `小朋友，今天我们来学习${args.topic}。这节课会把重点一个一个讲清楚。`,
        ),
        onScreenText: `认识${args.topic}`,
        durationSec: 10,
      };
      const unitScenes = units.slice(0, 4).map((unit, index) => ({
        scene: `${this.describeUnitLabel(unit, args, index)}讲解`,
        imagePrompt: this.buildUnitVisualPrompt(unit, args, index),
        narration: this.buildUnitNarration(unit, args, index),
        onScreenText: this.buildUnitCaption(unit, args, index),
        durationSec: 10,
      }));
      const summaryScene = {
        scene: '总结回顾',
        imagePrompt: `课堂结尾回顾${units.join('、')}的区别和联系，孩子开心回答问题`,
        narration: `${this.buildReviewPrompt(args, units)}。`,
        onScreenText: `复习${units.join('、')}`,
        durationSec: 10,
      };
      return [introScene, ...unitScenes, summaryScene];
    }

    const reviewPrompt = this.buildReviewPrompt(args, units);

    return [
      {
        scene: '情境导入',
        imagePrompt: `温暖明亮的课堂开场，用生活场景引出${args.topic}`,
        narration: this.toText(
          curriculumSeed?.summary,
          `小朋友，今天我们要学习${args.topic}。先看看它在生活里会在哪里出现。`,
        ),
        onScreenText: `认识${args.topic}`,
        durationSec: 10,
      },
      {
        scene: '重点观察',
        imagePrompt: `放大展示${args.topic}的关键特征，配合简单图示和手势引导`,
        narration: guide.observationNarration,
        onScreenText: guide.observationCaption,
        durationSec: 12,
      },
      {
        scene: '互动思考',
        imagePrompt: `老师提问，孩子看图回答，与${args.topic}相关的互动练习场景`,
        narration: guide.practiceNarration,
        onScreenText: '动脑想一想',
        durationSec: 12,
      },
      {
        scene: '总结鼓励',
        imagePrompt: `孩子完成${args.topic}学习后获得贴纸奖励，课堂氛围轻松愉快`,
        narration: `${reviewPrompt}。`,
        onScreenText: '学会啦',
        durationSec: 10,
      },
    ];
  }

  private buildTopicShotFallback(args: NormalizedArgs): Array<Record<string, any>> {
    const guide = this.buildTopicGuide(args);
    const units = this.resolveTeachingUnits(args);
    const curriculumSeed = this.getCurriculumSeed(args);
    const reviewPrompt = this.buildReviewPrompt(args, units);

    if (units.length >= 2) {
      return [
        {
          shot: '主题导入',
          visualPrompt: `卡通课堂开场，老师展示${args.topic}的学习卡片`,
          narration: this.toText(
            curriculumSeed?.summary,
            `欢迎来到今天的学习时间。我们要把${args.topic}里面的重点，一个一个学会。`,
          ),
          caption: `认识${args.topic}`,
          durationSec: 12,
        },
        ...units.slice(0, 4).map((unit, index) => ({
          shot: `${this.describeUnitLabel(unit, args, index)}讲解`,
          visualPrompt: this.buildUnitVisualPrompt(unit, args, index),
          narration: this.buildUnitNarration(unit, args, index),
          caption: this.buildUnitCaption(unit, args, index),
          durationSec: 14,
        })),
        {
          shot: '对比复习',
          visualPrompt: `课堂结尾把${units.join('、')}并排展示，老师带着孩子一起回顾`,
          narration: reviewPrompt,
          caption: `复习${units.join('、')}`,
          durationSec: 14,
        },
      ];
    }

    return [
      {
        shot: '主题导入',
        visualPrompt: `卡通课堂开场，展示${args.topic}与日常生活的联系`,
        narration: this.toText(curriculumSeed?.summary, `欢迎来到今天的学习时间，我们先来认识${args.topic}。`),
        caption: `认识${args.topic}`,
        durationSec: 12,
      },
      {
        shot: '观察讲解',
        visualPrompt: `聚焦${args.topic}的关键元素，老师边指边讲解`,
        narration: guide.observationNarration,
        caption: guide.observationCaption,
        durationSec: 16,
      },
      {
        shot: '分步示范',
        visualPrompt: `把${args.topic}拆成几个简单步骤，老师逐步示范`,
        narration: guide.demonstrationNarration,
        caption: guide.demonstrationCaption,
        durationSec: 18,
      },
      {
        shot: '互动练习',
        visualPrompt: `孩子跟着老师完成${args.topic}练习，画面中出现可回答的小任务`,
        narration: guide.practiceNarration,
        caption: '现在轮到你',
        durationSec: 18,
      },
      {
        shot: '总结回顾',
        visualPrompt: `课程结尾回顾${args.topic}要点，孩子开心举手回答`,
        narration: reviewPrompt,
        caption: '一起回顾重点',
        durationSec: 12,
      },
    ];
  }

  private buildTopicAudioFallback(args: NormalizedArgs): Array<Record<string, any>> {
    const guide = this.buildTopicGuide(args);
    const units = this.resolveTeachingUnits(args);
    const curriculumSeed = this.getCurriculumSeed(args);
    const reviewPrompt = this.buildReviewPrompt(args, units);

    if (units.length >= 2) {
      return [
        {
          segment: '开场聆听',
          narration: this.toText(
            curriculumSeed?.summary,
            `请竖起小耳朵，今天我们来学习${args.topic}。`,
          ),
          soundCue: 'intro music',
          durationSec: 10,
        },
        ...units.slice(0, 4).map((unit, index) => ({
          segment: `${this.describeUnitLabel(unit, args, index)}讲解`,
          narration: this.buildUnitNarration(unit, args, index),
          soundCue: 'soft bell',
          durationSec: 12,
        })),
        {
          segment: '复习提问',
          narration: reviewPrompt,
          soundCue: 'gentle chime',
          durationSec: 12,
        },
      ];
    }

    return [
      {
        segment: '开场聆听',
        narration: this.toText(curriculumSeed?.summary, `请竖起小耳朵，先听老师讲一讲${args.topic}。`),
        soundCue: 'intro music',
        durationSec: 10,
      },
      {
        segment: '重点提示',
        narration: guide.observationNarration,
        soundCue: 'soft bell',
        durationSec: 12,
      },
      {
        segment: '回顾提问',
        narration: reviewPrompt,
        soundCue: 'gentle chime',
        durationSec: 12,
      },
    ];
  }

  private buildTopicGuide(args: NormalizedArgs): {
    observationNarration: string;
    observationCaption: string;
    demonstrationNarration: string;
    demonstrationCaption: string;
    practiceNarration: string;
  } {
    switch (args.focus) {
      case 'math':
        return {
          observationNarration: `请仔细观察${args.topic}里的数量、顺序和大小规律，和老师一起数一数、比一比。`,
          observationCaption: '数一数，比一比',
          demonstrationNarration: `老师会把${args.topic}分成几个小步骤来示范，你可以边看边伸出手指一起做。`,
          demonstrationCaption: '跟着老师做一做',
          practiceNarration: '现在轮到你啦，试着自己数一数、找一找，再大声说出答案。',
        };
      case 'literacy':
        return {
          observationNarration: `先看清${args.topic}里的字词和图画，跟着老师认一认、读一读、说一说。`,
          observationCaption: '认一认，读一读',
          demonstrationNarration: `老师会慢慢示范${args.topic}的读法和表达方法，你可以边听边跟读。`,
          demonstrationCaption: '跟读与表达',
          practiceNarration: '现在请你自己试一试，把看到的内容完整地说出来。',
        };
      case 'science':
        return {
          observationNarration: `我们先观察${args.topic}的现象和变化，再猜一猜为什么会这样。`,
          observationCaption: '先观察，再思考',
          demonstrationNarration: `老师会一步一步演示${args.topic}里的关键过程，帮助你发现原因。`,
          demonstrationCaption: '发现小秘密',
          practiceNarration: '现在请你根据画面说说你的发现，也可以试着做一个小判断。',
        };
      default:
        return {
          observationNarration: `请跟着老师一起观察${args.topic}，看看里面有什么重要信息。`,
          observationCaption: '一起观察重点',
          demonstrationNarration: `老师会把${args.topic}分成简单的小步骤来讲，你可以边听边做动作。`,
          demonstrationCaption: '一步一步学',
          practiceNarration: '现在轮到你试试看，回答一个小问题，或者完成一个小任务。',
        };
    }
  }

  private getCurriculumSeed(args: NormalizedArgs) {
    return getCoursePackCurriculumSeed({
      topic: args.topic,
      ageGroup: args.ageGroup,
      domain: args.domain,
    });
  }

  private resolveTeachingUnits(args: NormalizedArgs): string[] {
    const curriculumUnits = this.getCurriculumSeed(args)?.teachingUnits || [];
    if (curriculumUnits.length >= 2) {
      return curriculumUnits.slice(0, 4);
    }
    return this.extractTopicTeachingUnits(args.topic, args.focus);
  }

  private extractTopicTeachingUnits(topic: string, focus: CourseFocus): string[] {
    const source = this.toText(topic);
    if (!source) return [];

    const explicitPart = source.includes('：')
      ? source.split('：').pop() || source
      : source.includes(':')
        ? source.split(':').pop() || source
        : source;

    const splitUnits = explicitPart
      .split(/[、，,；;\/|]/)
      .map((item) => this.toText(item))
      .filter(Boolean)
      .filter((item) => !/^(认识|学习|观察|练习|复习|汉字|拼音|数字|字词)$/.test(item));

    if (splitUnits.length >= 2) {
      return Array.from(new Set(splitUnits)).slice(0, 4);
    }

    const rangeMatch = source.match(/(\d+)\s*[-~到至]\s*(\d+)/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
        const middle = Math.floor((start + end) / 2);
        return Array.from(new Set([String(start), String(middle), String(end)])).slice(0, 4);
      }
    }

    if (focus === 'literacy' || /汉字|识字|字词|生字/.test(source)) {
      const chars = Array.from(source.matchAll(/[\u4e00-\u9fff]/g))
        .map((match) => match[0])
        .filter((char) => !'认识汉字识字学习全方位课程'.includes(char));
      const uniqueChars = Array.from(new Set(chars));
      if (uniqueChars.length >= 2) {
        return uniqueChars.slice(0, 4);
      }
    }

    return [];
  }

  private describeUnitLabel(unit: string, args: NormalizedArgs, index: number): string {
    const literacyLike = this.isLiteracyLikeTopic(args.topic, args.focus);
    if (literacyLike && /^[\u4e00-\u9fff]{1,2}$/.test(unit)) {
      return `${unit}字`;
    }
    if (args.focus === 'math' && /^\d+$/.test(unit)) {
      return `${unit}`;
    }
    return unit || `重点${index + 1}`;
  }

  private buildUnitCaption(unit: string, args: NormalizedArgs, index: number): string {
    const literacyLike = this.isLiteracyLikeTopic(args.topic, args.focus);
    if (literacyLike && /^[\u4e00-\u9fff]{1,2}$/.test(unit)) {
      return `认识“${unit}”字`;
    }
    if (args.focus === 'math' && /^\d+$/.test(unit)) {
      return `认识数字${unit}`;
    }
    return `学习${this.describeUnitLabel(unit, args, index)}`;
  }

  private buildUnitVisualPrompt(unit: string, args: NormalizedArgs, index: number): string {
    const literacyLike = this.isLiteracyLikeTopic(args.topic, args.focus);
    if (literacyLike && /^[\u4e00-\u9fff]{1,2}$/.test(unit)) {
      return `课堂画面中放大展示汉字“${unit}”，老师用手势讲解字形和字义，并配合生活场景插图`;
    }
    if (args.focus === 'math' && /^\d+$/.test(unit)) {
      return `老师展示数字${unit}的卡片和对应数量的物体，帮助孩子建立数字概念`;
    }
    return `老师围绕${unit}进行重点讲解，画面中有清晰的教学卡片和互动提示`;
  }

  private buildUnitNarration(unit: string, args: NormalizedArgs, index: number): string {
    if (this.isLiteracyLikeTopic(args.topic, args.focus) && /^[\u4e00-\u9fff]{1,2}$/.test(unit)) {
      const glossary = this.getCharacterGlossary(unit);
      if (glossary) {
        return `先来看”${unit}”字。${glossary.meaning}。${glossary.shape}。请你跟老师读一读：”${unit}”。`;
      }
      return `先来看”${unit}”字。请你先看清它的样子，再跟着老师读一读，想一想这个字在生活里会出现在什么地方。`;
    }

    if (args.focus === 'math' && /^\d+$/.test(unit)) {
      return `现在我们来认识数字${unit}。请你看看有多少个物体，再把数字${unit}大声读出来。`;
    }

    const curriculumSeed = this.getCurriculumSeed(args);
    const fact = curriculumSeed?.unitFacts?.[unit];
    if (fact) {
      return `现在我们来学习${unit}。${unit}是${fact}。请你仔细看，跟老师一起说一说。`;
    }

    return `现在我们来学习${unit}。请你先观察，再跟着老师说一说这个知识点的特点。`;
  }

  private buildReviewPrompt(args: NormalizedArgs, units: string[]): string {
    const curriculumSeed = this.getCurriculumSeed(args);
    if (units.length >= 2) {
      const unitSummary = units
        .map((unit) => {
          const fact = curriculumSeed?.unitFacts?.[unit];
          return fact ? `${unit}是${fact}` : unit;
        })
        .join('；');
      return `真棒，今天我们学习了${units.join('、')}。${unitSummary}。请你再说一遍今天记住的重点。`;
    }
    if (curriculumSeed?.summary) {
      return `真棒，今天我们学习了${args.topic}。${curriculumSeed.summary}。请你回家讲给爸爸妈妈听吧。`;
    }
    return `真棒，今天我们已经认识了${args.topic}。记住一个关键点，等会讲给爸爸妈妈听吧。`;
  }

  private isLiteracyLikeTopic(topic: string, focus: CourseFocus): boolean {
    return focus === 'literacy' || /汉字|识字|字词|生字/.test(this.toText(topic));
  }

  private getCharacterGlossary(unit: string): { meaning: string; shape: string } | null {
    const glossary: Record<string, { meaning: string; shape: string }> = {
      天: {
        meaning: '它表示头顶上的天空，我们一抬头就能看到天',
        shape: '上面的横画像展开的天空，下面部分可以帮助我们记住它',
      },
      地: {
        meaning: '它表示脚下的大地，花草树木都长在地上',
        shape: '左边的部件提醒我们它和土地有关，右边帮助我们把字记得更牢',
      },
      人: {
        meaning: '它表示人，像一个人张开双腿站立的样子',
        shape: '撇和捺向两边展开，看起来就像一个人站着',
      },
      日: {
        meaning: '它表示太阳，也可以表示白天',
        shape: '外面的框像太阳的轮廓，中间一横帮助我们记住它',
      },
      月: {
        meaning: '它表示月亮，也常常和身体部位有关',
        shape: '弯弯的外形像月亮挂在天空中',
      },
      山: {
        meaning: '它表示大山和山峰',
        shape: '中间高、两边低，看起来像连在一起的山峰',
      },
      水: {
        meaning: '它表示水流和河水',
        shape: '中间像主水流，两边像溅开的水花',
      },
      口: {
        meaning: '它表示嘴巴，也像一个小小的方框',
        shape: '四四方方的样子很容易记住',
      },
    };
    return glossary[unit] || null;
  }

  private normalizeArgs(args: GenerateCoursePackArgs): NormalizedArgs {
    const topic = this.toText(args?.topic);
    const ageGroupRaw = this.toText(args?.ageGroup, '5-6');
    const ageGroup = (ageGroupRaw === '3-4' || ageGroupRaw === '5-6' ? ageGroupRaw : '5-6') as AgeGroup;
    if (!topic) throw new Error('topic is required');

    const parentPrompt = this.toText(args?.parentPrompt, topic);
    const requestedFocus = this.toText(args?.focus, 'mixed') as CourseFocus;
    let safeFocus: CourseFocus =
      ['literacy', 'math', 'science', 'mixed'].includes(requestedFocus) ? requestedFocus : 'mixed';
    const difficulty = Math.max(1, Math.min(3, this.toSafeInt(args?.difficulty, ageGroup === '3-4' ? 1 : 2)));
    const durationMinutes = Math.max(10, Math.min(45, this.toSafeInt(args?.durationMinutes, 20)));

    const explicitDomain = this.normalizeDomain(args?.domain);
    const inferredFocus = this.deriveFocusFromPack({
      topic,
      title: topic,
      summary: parentPrompt,
    });

    if (safeFocus === 'mixed') {
      const focusFromDomain = this.mapDomainToFocus(explicitDomain);
      if (focusFromDomain) {
        safeFocus = focusFromDomain;
      } else if (inferredFocus !== 'mixed') {
        safeFocus = inferredFocus;
      }
    }

    const domainMap: Record<CourseFocus, CourseDomain> = {
      literacy: 'language',
      math: 'math',
      science: 'science',
      mixed: 'language',
    };
    const gameTypeMap: Record<CourseFocus, ActivityType> = {
      literacy: 'fill_blank',
      math: 'quiz',
      science: 'connection',
      mixed: 'matching',
    };
    const domain = explicitDomain ?? (safeFocus === 'mixed'
      ? this.inferDomainFromText(`${topic} ${parentPrompt}`)
      : domainMap[safeFocus]);
    const gameType = this.resolveGameType(safeFocus, domain);

    return {
      topic,
      ageGroup,
      durationMinutes,
      focus: safeFocus,
      difficulty,
      includeGame: this.toBoolean(args?.includeGame, true),
      includeAudio: this.toBoolean(args?.includeAudio, true),
      includeVideo: this.toBoolean(args?.includeVideo, true),
      parentPrompt,
      domain,
      gameType: this.toText((args as any)?.gameType) && ACTIVITY_TYPES.includes((args as any).gameType)
        ? (args as any).gameType
        : gameType || gameTypeMap[safeFocus],
    };
  }

  private normalizeDomain(value: unknown): CourseDomain | null {
    const domain = this.toText(value).toLowerCase();
    if (domain === 'language' || domain === 'math' || domain === 'science' || domain === 'art' || domain === 'social') {
      return domain;
    }
    return null;
  }

  private mapDomainToFocus(domain: CourseDomain | null): CourseFocus | null {
    if (domain === 'language') return 'literacy';
    if (domain === 'math') return 'math';
    if (domain === 'science') return 'science';
    return null;
  }

  private inferDomainFromText(source: string): CourseDomain {
    const text = this.toText(source);
    if (!text) return 'language';

    if (/数学|数感|数字|计数|加减|形状|图形|排序|规律/.test(text)) return 'math';
    if (/科学|动物|植物|天气|季节|四季|自然|实验|观察|昼夜|太阳|月亮|地球|水循环/.test(text)) return 'science';
    if (/画画|绘画|颜色|色彩|手工|涂鸦|美术|折纸/.test(text)) return 'art';
    if (/情绪|表情|礼貌|分享|社交|合作|规则|安全|习惯|作息/.test(text)) return 'social';
    if (/汉字|识字|拼音|阅读|朗读|写字|词语|语文/.test(text)) return 'language';
    return 'language';
  }

  private resolveGameType(focus: CourseFocus, domain: CourseDomain): ActivityType {
    if (focus === 'literacy') return 'fill_blank';
    if (focus === 'math') return 'quiz';
    if (focus === 'science') return 'connection';
    if (domain === 'science') return 'connection';
    if (domain === 'math') return 'quiz';
    if (domain === 'language') return 'fill_blank';
    return 'matching';
  }

  private extractJsonObject(text: string): Record<string, any> | null {
    const source = this.toText(text);
    if (!source) return null;

    try {
      const parsed = JSON.parse(source);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {}

    const codeBlock = source.match(/```json\s*([\s\S]*?)```/i) || source.match(/```\s*([\s\S]*?)```/i);
    if (codeBlock?.[1]) {
      try {
        const parsed = JSON.parse(codeBlock[1].trim());
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch {}
    }

    const firstBrace = source.indexOf('{');
    const lastBrace = source.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        const parsed = JSON.parse(source.slice(firstBrace, lastBrace + 1));
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch {}
    }

    return null;
  }

  private toText(value: any, fallback = ''): string {
    if (value == null) return fallback;
    const text = String(value).replace(/\s+/g, ' ').trim();
    return text || fallback;
  }

  private toSafeInt(value: any, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
  }

  private toBoolean(value: any, fallback = false): boolean {
    if (typeof value === 'boolean') return value;
    if (value == null) return fallback;
    const text = this.toText(value).toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(text)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(text)) return false;
    return fallback;
  }

  private toStringArray(value: any, minLen: number, fallback: string[]): string[] {
    const arr = Array.isArray(value)
      ? value.map((item) => this.toText(item)).filter(Boolean)
      : [];
    const base = arr.length >= minLen ? arr : fallback;
    return Array.from(new Set(base)).slice(0, 10);
  }
}
