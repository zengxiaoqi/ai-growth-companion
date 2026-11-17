import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Content } from '../../src/database/entities/content.entity';
import { Assignment } from '../../src/database/entities/assignment.entity';
import { LearningRecord } from '../../src/database/entities/learning-record.entity';
import { StudyPlanRecord } from '../../src/database/entities/study-plan-record.entity';
import { LessonContentService } from '../../src/modules/learning/lesson-content.service';
import { ContentsService } from '../../src/modules/contents/contents.service';
import { GenerateCoursePackTool } from '../../src/modules/ai/agent/tools/generate-course-pack';
import { GenerateActivityTool } from '../../src/modules/ai/agent/tools/generate-activity';
import { AiService } from '../../src/modules/ai/ai.service';
import { AssignmentService } from '../../src/modules/assignment/assignment.service';
import { LearningTrackerService } from '../../src/modules/learning/learning-tracker.service';
import { LlmClientService } from '../../src/agent-framework/llm/llm-client.service';
import { LessonVideoQueueService } from '../../src/modules/learning/lesson-video-queue.service';
import { RemotionRenderService } from '../../src/modules/learning/remotion-render.service';
import {
  sanitizeDrawingModule,
  sanitizeRoleplayModule,
  sanitizeExperimentModule,
  deriveDrawingSceneDocument,
  deriveRoleplaySceneDocument,
  deriveExperimentSceneDocument,
  sanitizeSceneDocument,
} from '../../src/modules/learning/lesson-scene';
import { getCoursePackCurriculumSeed } from '../../src/modules/learning/course-curriculum-fallback';

describe('sanitize*Module always returns valid data', () => {
  it('drawing fallback is themed and complete', () => {
    const drawing = sanitizeDrawingModule(null, '彩虹');
    expect(drawing.prompt).toContain('彩虹');
    expect(drawing.minStrokes).toBeGreaterThanOrEqual(1);
    expect(drawing.suggestedColors.length).toBeGreaterThan(0);
    for (const color of drawing.suggestedColors) {
      expect(color).toMatch(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
    }
    expect(drawing.checklist.length).toBeGreaterThan(0);
  });

  it('drawing keeps valid raw data and drops bad colors', () => {
    const drawing = sanitizeDrawingModule(
      {
        prompt: '画一道彩虹',
        suggestedColors: ['#FF0000', 'not-a-color', '#GGGGGG'],
        minStrokes: 4,
      },
      '彩虹',
    );
    expect(drawing.prompt).toBe('画一道彩虹');
    expect(drawing.suggestedColors).toEqual(['#FF0000']);
    expect(drawing.minStrokes).toBe(4);
  });

  it('roleplay fallback has tappable options on every turn', () => {
    const roleplay = sanitizeRoleplayModule(undefined, '礼貌用语');
    expect(roleplay.turns.length).toBeGreaterThanOrEqual(3);
    expect(roleplay.minTurns).toBeLessThanOrEqual(roleplay.turns.length);
    for (const turn of roleplay.turns) {
      expect(turn.text.length).toBeGreaterThan(0);
      expect(turn.options.length).toBeGreaterThanOrEqual(2);
      expect(turn.keywords.length).toBeGreaterThan(0);
    }
  });

  it('roleplay turns without options get a listen-again fallback option', () => {
    const roleplay = sanitizeRoleplayModule(
      { turns: [{ speaker: '小熊', text: '你好！', childLine: '你好，小熊！' }] },
      '打招呼',
    );
    expect(roleplay.turns).toHaveLength(1);
    expect(roleplay.turns[0].options).toContain('你好，小熊！');
    expect(roleplay.turns[0].options.length).toBeGreaterThanOrEqual(2);
  });

  it('experiment fallback has one tappable step with an observe question', () => {
    const experiment = sanitizeExperimentModule({}, '沉与浮');
    expect(experiment.steps.length).toBeGreaterThanOrEqual(1);
    const step = experiment.steps[0];
    expect(step.instruction.length).toBeGreaterThan(0);
    expect(step.targets.length).toBeGreaterThan(0);
    expect(step.observe).toBeDefined();
    expect(step.observe!.options.length).toBeGreaterThanOrEqual(2);
    expect(step.observe!.correctIndex).toBeLessThan(step.observe!.options.length);
    expect(experiment.conclusion.length).toBeGreaterThan(0);
  });

  it('experiment drops steps without instruction and clamps observe index', () => {
    const experiment = sanitizeExperimentModule(
      {
        steps: [
          { text: '' },
          {
            instruction: '把积木放进水里',
            targets: ['积木'],
            reveal: '积木浮起来了',
            observe: { question: '看到了什么？', options: ['浮起来', '沉下去'], correctIndex: 9 },
          },
        ],
      },
      '沉与浮',
    );
    expect(experiment.steps).toHaveLength(1);
    const observe = experiment.steps[0].observe!;
    expect(observe.correctIndex).toBeGreaterThanOrEqual(0);
    expect(observe.correctIndex).toBeLessThan(observe.options.length);
  });
});

describe('derive*SceneDocument + sanitize round-trip', () => {
  it('drawing scenes use draw/free_draw and survive sanitize', () => {
    const doc = deriveDrawingSceneDocument(sanitizeDrawingModule(null, '彩虹'), '彩虹');
    expect(doc.stepType).toBe('draw');
    expect(doc.mode).toBe('free_draw');
    expect(doc.scenes.length).toBeGreaterThanOrEqual(2);
    const sanitized = sanitizeSceneDocument(doc, 'draw', 'free_draw');
    expect(sanitized).not.toBeNull();
    expect(sanitized!.scenes.length).toBe(doc.scenes.length);
  });

  it('roleplay scenes use roleplay/dialogue with one scene per turn', () => {
    const roleplay = sanitizeRoleplayModule(null, '打招呼');
    const doc = deriveRoleplaySceneDocument(roleplay, '打招呼');
    expect(doc.stepType).toBe('roleplay');
    expect(doc.mode).toBe('dialogue');
    expect(doc.scenes.length).toBeGreaterThanOrEqual(roleplay.turns.length);
    expect(sanitizeSceneDocument(doc, 'roleplay', 'dialogue')).not.toBeNull();
  });

  it('experiment scenes use experiment/simulation with one scene per step', () => {
    const experiment = sanitizeExperimentModule(null, '沉与浮');
    const doc = deriveExperimentSceneDocument(experiment, '沉与浮');
    expect(doc.stepType).toBe('experiment');
    expect(doc.mode).toBe('simulation');
    expect(doc.scenes.length).toBeGreaterThanOrEqual(experiment.steps.length);
    expect(sanitizeSceneDocument(doc, 'experiment', 'simulation')).not.toBeNull();
  });
});

describe('assembleLesson domain-adaptive output step', () => {
  let service: LessonContentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LessonContentService,
        { provide: getRepositoryToken(Content), useValue: {} },
        { provide: getRepositoryToken(LearningRecord), useValue: {} },
        { provide: getRepositoryToken(Assignment), useValue: {} },
        { provide: getRepositoryToken(StudyPlanRecord), useValue: {} },
        { provide: ContentsService, useValue: {} },
        { provide: GenerateCoursePackTool, useValue: {} },
        { provide: GenerateActivityTool, useValue: {} },
        { provide: AiService, useValue: {} },
        { provide: AssignmentService, useValue: {} },
        { provide: LearningTrackerService, useValue: {} },
        { provide: LlmClientService, useValue: {} },
        { provide: LessonVideoQueueService, useValue: {} },
      ],
    }).compile();
    service = module.get(LessonContentService);
  });

  const assemble = (domain: string, modules: Record<string, any> = {}) =>
    (service as any).assembleLesson(
      { domain, modules },
      null,
      { topic: '测试主题', ageGroup: '5-6', domain, summary: '', outcomes: [] },
    );

  const outputStep = (lesson: any) => lesson.steps.find((s: any) => s.id === 'write');
  const readStep = (lesson: any) => lesson.steps.find((s: any) => s.id === 'read');

  it.each([
    ['language', '读', '写', 'writing'],
    ['math', '读', '写', 'writing'],
    ['science', '观察', '做', 'experiment'],
    ['art', '赏', '画', 'drawing'],
    ['social', '听说', '演', 'roleplay'],
  ])('%s → step2 %s / step3 %s (%s)', (domain, readLabel, writeLabel, moduleType) => {
    const lesson = assemble(domain);
    expect(lesson.domain).toBe(domain);
    expect(readStep(lesson).label).toBe(readLabel);
    const step = outputStep(lesson);
    expect(step.label).toBe(writeLabel);
    expect(step.module.type).toBe(moduleType);
    // step ids stay stable for video queue / completeStep compatibility
    expect(lesson.steps.map((s: any) => s.id)).toEqual(['watch', 'read', 'write', 'practice']);
  });

  it('science output carries non-empty experiment data even when pack omits it', () => {
    const step = outputStep(assemble('science'));
    expect(step.module.experiment.steps.length).toBeGreaterThan(0);
    expect(step.module.experiment.conclusion.length).toBeGreaterThan(0);
    expect(step.module.scene).toBeDefined();
  });

  it('art output carries non-empty drawing data even when pack omits it', () => {
    const step = outputStep(assemble('art'));
    expect(step.module.drawing.prompt.length).toBeGreaterThan(0);
    expect(step.module.drawing.suggestedColors.length).toBeGreaterThan(0);
  });

  it('social output carries non-empty roleplay data even when pack omits it', () => {
    const step = outputStep(assemble('social'));
    expect(step.module.roleplay.turns.length).toBeGreaterThan(0);
    for (const turn of step.module.roleplay.turns) {
      expect(turn.options.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('uses pack-provided module data when present', () => {
    const step = outputStep(
      assemble('art', { drawing: { prompt: '画一只小猫', minStrokes: 3 } }),
    );
    expect(step.module.drawing.prompt).toBe('画一只小猫');
    expect(step.module.drawing.minStrokes).toBe(3);
  });

  it('coursePack.domain wins over meta.domain', () => {
    const lesson = (service as any).assembleLesson(
      { domain: 'art', modules: {} },
      null,
      { topic: '测试主题', ageGroup: '5-6', domain: 'language', summary: '', outcomes: [] },
    );
    expect(outputStep(lesson).module.type).toBe('drawing');
  });
});

describe('curriculum seed output fallbacks', () => {
  it('provides themed drawing/roleplay/experiment seeds', () => {
    const seed = getCoursePackCurriculumSeed({
      topic: '认识动物老虎',
      ageGroup: '5-6',
      domain: 'science',
    });
    expect(seed).not.toBeNull();
    expect(seed!.drawingTask?.prompt).toBeTruthy();
    expect(seed!.roleplayScript?.turns?.length).toBeGreaterThan(0);
    expect(seed!.experimentSteps?.steps?.length).toBeGreaterThan(0);
  });
});

describe('video pipeline passthrough for new output modules', () => {
  let queue: LessonVideoQueueService;

  beforeEach(() => {
    queue = new LessonVideoQueueService(
      { update: jest.fn(), findOne: jest.fn(), save: jest.fn() } as any,
      {} as any,
      { renderTeachingVideoFromPack: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  const stepsWithOutput = (module: Record<string, any>) => [
    { id: 'watch', module: { type: 'video', visualStory: { scenes: [] } } },
    { id: 'read', module: { type: 'reading', reading: { text: '文本' } } },
    { id: 'write', module },
    { id: 'practice', module: { type: 'game', game: {} } },
  ];

  it.each([
    ['drawing', { prompt: '画彩虹' }],
    ['roleplay', { scenario: '打招呼', turns: [{ text: '你好' }] }],
    ['experiment', { question: '沉还是浮', steps: [{ instruction: '点一点' }] }],
  ])('passes %s key through the write slot', (type, data) => {
    const payload = (queue as any).buildPayloadFromSteps(
      { topic: '测试' },
      { title: '测试', ageGroup: '5-6' },
      stepsWithOutput({ type, [type]: data }),
    );
    expect(payload.modules[type]).toEqual(data);
    expect(payload.modules.writing).toEqual({});
  });

  it('still passes writing key for language lessons', () => {
    const payload = (queue as any).buildPayloadFromSteps(
      { topic: '测试' },
      { title: '测试', ageGroup: '5-6' },
      stepsWithOutput({ type: 'writing', writing: { tracingItems: ['猫'] } }),
    );
    expect(payload.modules.writing).toEqual({ tracingItems: ['猫'] });
    expect(payload.modules.drawing).toBeUndefined();
  });
});

describe('Remotion supplement slides for new output modules', () => {
  let service: RemotionRenderService;

  beforeEach(() => {
    service = new RemotionRenderService(
      { execute: jest.fn() } as any,
      {
        textToSpeech: jest.fn(),
        textToSpeechWithTiming: jest.fn(),
      } as any,
    );
  });

  it('builds preview cards for drawing/roleplay/experiment', () => {
    const slides = (service as any).buildSupplementSlides(
      {
        drawing: { title: '彩虹画', prompt: '画一道彩虹' },
        roleplay: { title: '打招呼', scenario: '见到新朋友' },
        experiment: { title: '沉与浮', question: '积木会浮起来吗？' },
      },
      0,
    );
    const titles = slides.map((s: any) => s.title);
    expect(titles).toContain('彩虹画');
    expect(titles).toContain('打招呼');
    expect(titles).toContain('沉与浮');
    const emojis = slides.map((s: any) => s.emoji);
    expect(emojis).toContain('🎨');
    expect(emojis).toContain('🎭');
    expect(emojis).toContain('🔬');
  });

  it('hasSupplementSlides detects each new module key', () => {
    for (const key of ['drawing', 'roleplay', 'experiment']) {
      expect((service as any).hasSupplementSlides({ [key]: { title: 'x' } })).toBe(true);
    }
    expect((service as any).hasSupplementSlides({})).toBe(false);
  });

  it('skips empty modules without crashing', () => {
    const slides = (service as any).buildSupplementSlides(
      { drawing: {}, roleplay: {}, experiment: {} },
      0,
    );
    expect(Array.isArray(slides)).toBe(true);
  });
});