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
import { ToolRegistryService } from '../../src/agent-framework/tools/tool-registry.service';
import { LessonVideoQueueService } from '../../src/modules/learning/lesson-video-queue.service';

describe('LessonContentService modifyDraft scene sync', () => {
  let service: LessonContentService;
  let contentRepo: any;
  let llmClient: { generate: jest.Mock };
  let assignmentRepo: any;

  beforeEach(async () => {
    contentRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
      save: jest.fn((value) => Promise.resolve(value)),
      update: jest.fn(),
    };
    llmClient = {
      generate: jest.fn(),
    };
    assignmentRepo = {
      createQueryBuilder: jest.fn(),
    };
    const studyPlanRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LessonContentService,
        { provide: getRepositoryToken(Content), useValue: contentRepo },
        { provide: getRepositoryToken(LearningRecord), useValue: {} },
        { provide: getRepositoryToken(Assignment), useValue: assignmentRepo },
        {
          provide: getRepositoryToken(StudyPlanRecord),
          useValue: studyPlanRepo,
        },
        { provide: ContentsService, useValue: {} },
        { provide: GenerateCoursePackTool, useValue: {} },
        { provide: GenerateActivityTool, useValue: {} },
        { provide: AiService, useValue: {} },
        { provide: AssignmentService, useValue: {} },
        { provide: LearningTrackerService, useValue: {} },
        { provide: LlmClientService, useValue: llmClient },
        {
          provide: LessonVideoQueueService,
          useValue: { enqueue: jest.fn(), processQueue: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(LessonContentService);
  });

  it('onModuleInit fails every orphaned generating lesson regardless of age', async () => {
    const execute = jest.fn().mockResolvedValue({ affected: 2 });
    const where = jest.fn().mockReturnValue({ execute });
    const set = jest.fn().mockReturnValue({ where });
    const update = jest.fn().mockReturnValue({ set });
    contentRepo.createQueryBuilder.mockReturnValue({ update });

    await service.onModuleInit();

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'generation_failed' }),
    );
    const [clause, params] = where.mock.calls[0];
    expect(clause).not.toContain('datetime');
    expect(params).toEqual({
      status: 'generating',
      contentType: 'structured_lesson',
    });
    expect(execute).toHaveBeenCalled();
  });

  it('returns child draft lessons ordered by newest first', async () => {
    const builder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          id: 12,
          title: '新草稿',
          subtitle: '新内容',
          domain: 'science',
          status: 'draft',
          contentType: 'structured_lesson',
          createdAt: new Date('2026-04-09T09:00:00.000Z'),
          updatedAt: new Date('2026-04-09T09:15:00.000Z'),
        },
        {
          id: 8,
          title: '旧草稿',
          subtitle: '旧内容',
          domain: 'language',
          status: 'generating',
          contentType: 'structured_lesson',
          createdAt: new Date('2026-04-08T10:00:00.000Z'),
          updatedAt: new Date('2026-04-08T10:30:00.000Z'),
        },
      ]),
    };
    contentRepo.createQueryBuilder = jest.fn().mockReturnValue(builder);

    const result = await service.listDraftLessonsForChild(22);

    expect(contentRepo.createQueryBuilder).toHaveBeenCalledWith('content');
    expect(builder.where).toHaveBeenCalledWith('content.childId = :childId', {
      childId: 22,
    });
    expect(builder.andWhere).toHaveBeenCalledWith('content.status IN (:...statuses)', {
      statuses: ['draft', 'generating'],
    });
    expect(builder.andWhere).toHaveBeenCalledWith('content.contentType = :contentType', {
      contentType: 'structured_lesson',
    });
    expect(builder.orderBy).toHaveBeenCalledWith('content.createdAt', 'DESC');
    expect(result).toEqual([
      {
        id: 12,
        title: '新草稿',
        subtitle: '新内容',
        domain: 'science',
        status: 'draft',
        contentType: 'structured_lesson',
        childId: 22,
        createdAt: '2026-04-09T09:00:00.000Z',
        updatedAt: '2026-04-09T09:15:00.000Z',
      },
      {
        id: 8,
        title: '旧草稿',
        subtitle: '旧内容',
        domain: 'language',
        status: 'generating',
        contentType: 'structured_lesson',
        childId: 22,
        createdAt: '2026-04-08T10:00:00.000Z',
        updatedAt: '2026-04-08T10:30:00.000Z',
      },
    ]);
  });

  it('returns only drafts linked to the requested child record set', async () => {
    const builder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          id: 12,
          title: '目标孩子草稿',
          subtitle: '新内容',
          domain: 'science',
          status: 'draft',
          contentType: 'structured_lesson',
          createdAt: new Date('2026-04-09T09:00:00.000Z'),
          updatedAt: new Date('2026-04-09T09:15:00.000Z'),
        },
      ]),
    };
    contentRepo.createQueryBuilder = jest.fn().mockReturnValue(builder);

    const result = await service.listDraftLessonsForChild(22);

    expect(contentRepo.createQueryBuilder).toHaveBeenCalledWith('content');
    expect(builder.select).toHaveBeenCalled();
    expect(builder.where).toHaveBeenCalledWith('content.childId = :childId', {
      childId: 22,
    });
    expect(builder.andWhere).toHaveBeenCalledWith('content.status IN (:...statuses)', {
      statuses: ['draft', 'generating'],
    });
    expect(builder.andWhere).toHaveBeenCalledWith('content.contentType = :contentType', {
      contentType: 'structured_lesson',
    });
    expect(builder.orderBy).toHaveBeenCalledWith('content.createdAt', 'DESC');
    expect(result).toEqual([
      {
        id: 12,
        title: '目标孩子草稿',
        subtitle: '新内容',
        domain: 'science',
        status: 'draft',
        contentType: 'structured_lesson',
        childId: 22,
        createdAt: '2026-04-09T09:00:00.000Z',
        updatedAt: '2026-04-09T09:15:00.000Z',
      },
    ]);
  });

  it('re-derives watch scene when parent edit changes legacy watch content but llm leaves stale scene behind', async () => {
    const lesson = {
      type: 'structured_lesson',
      version: 1,
      topic: '四季变化',
      ageGroup: '5-6',
      summary: '原始总结',
      outcomes: ['观察季节'],
      sourceCoursePackId: null,
      generatedAt: '2026-04-09T00:00:00.000Z',
      parentGuide: {
        beforeClass: [],
        duringClass: [],
        afterClass: [],
      },
      steps: [
        {
          id: 'watch',
          label: '看',
          icon: 'eye',
          order: 1,
          module: {
            type: 'video',
            scene: {
              version: 1,
              stepType: 'watch',
              mode: 'playback',
              scenes: [
                {
                  id: 'watch-scene-1',
                  title: '旧场景',
                  narration: '旧旁白',
                  durationSec: 10,
                },
              ],
            },
            visualStory: {
              scenes: [
                {
                  scene: '旧场景',
                  narration: '旧旁白',
                  onScreenText: '旧字幕',
                  durationSec: 10,
                },
              ],
            },
            videoLesson: { shots: [] },
          },
        },
        {
          id: 'write',
          label: '写',
          icon: 'pen',
          order: 4,
          module: {
            type: 'writing',
            writing: {
              tracingItems: ['春'],
              practiceTasks: ['描一描'],
            },
          },
        },
      ],
    };

    contentRepo.findOne.mockResolvedValue({
      id: 99,
      status: 'draft',
      title: '四季变化 全方位学习课',
      subtitle: '原始总结',
      content: lesson,
    });

    llmClient.generate.mockResolvedValueOnce(
      JSON.stringify({
        summary: '加入更多四季观察内容',
        steps: [
          {
            id: 'watch',
            module: {
              type: 'video',
              scene: lesson.steps[0].module.scene,
              visualStory: {
                scenes: [
                  {
                    scene: '四季观察',
                    narration: '春夏秋冬会带来不同的景色',
                    onScreenText: '四季观察',
                    durationSec: 12,
                  },
                ],
              },
              videoLesson: { shots: [] },
            },
          },
        ],
      }),
    );

    const saved = await service.modifyDraft(99, 1, '把看这一部分改得更贴近四季观察');
    const watchStep = (saved.content as any).steps.find((step: any) => step.id === 'watch');

    expect(watchStep.module.scene.scenes[0].title).toBe('四季观察');
    expect(watchStep.module.scene.scenes[0].narration).toContain('春夏秋冬');
    expect(saved.subtitle).toBe('加入更多四季观察内容');
  });

  it('keeps explicit edited scene when parent modification directly changes scene payload', async () => {
    const lesson = {
      type: 'structured_lesson',
      version: 1,
      topic: '数字 1-5',
      ageGroup: '5-6',
      summary: '原始总结',
      outcomes: ['认识数字'],
      sourceCoursePackId: null,
      generatedAt: '2026-04-09T00:00:00.000Z',
      parentGuide: {
        beforeClass: [],
        duringClass: [],
        afterClass: [],
      },
      steps: [
        {
          id: 'write',
          label: '写',
          icon: 'pen',
          order: 4,
          module: {
            type: 'writing',
            scene: {
              version: 1,
              stepType: 'write',
              mode: 'guided_trace',
              scenes: [
                {
                  id: 'write-scene-1',
                  title: '描一描 1',
                  narration: '沿着虚线描一描 1',
                  durationSec: 20,
                  interaction: {
                    type: 'trace_path',
                    targets: [{ id: 'trace-1', label: '1', kind: 'glyph', text: '1' }],
                  },
                },
              ],
            },
            writing: {
              tracingItems: ['1'],
              practiceTasks: ['描一描'],
            },
          },
        },
      ],
    };

    contentRepo.findOne.mockResolvedValue({
      id: 100,
      status: 'draft',
      title: '数字 1-5 全方位学习课',
      subtitle: '原始总结',
      content: lesson,
    });

    llmClient.generate.mockResolvedValueOnce(
      JSON.stringify({
        steps: [
          {
            id: 'write',
            module: {
              type: 'writing',
              scene: {
                version: 1,
                stepType: 'write',
                mode: 'guided_trace',
                scenes: [
                  {
                    id: 'write-scene-1',
                    title: '描一描数字 1',
                    narration: '跟着新的提示描一描数字 1',
                    durationSec: 20,
                    interaction: {
                      type: 'trace_path',
                      targets: [
                        {
                          id: 'trace-1',
                          label: '1',
                          kind: 'glyph',
                          text: '1',
                          fontSize: 90,
                        },
                      ],
                    },
                  },
                ],
              },
              writing: lesson.steps[0].module.writing,
            },
          },
        ],
      }),
    );

    const saved = await service.modifyDraft(100, 1, '把描红提示换成更鼓励式');
    const writeStep = (saved.content as any).steps.find((step: any) => step.id === 'write');

    expect(writeStep.module.scene.scenes[0].title).toBe('描一描数字 1');
    expect(writeStep.module.scene.scenes[0].narration).toContain('新的提示');
    expect(writeStep.module.scene.scenes[0].interaction.targets[0].fontSize).toBe(90);
  });
  it('includes target step context in the llm prompt for step-scoped edits', async () => {
    const lesson = {
      type: 'structured_lesson',
      version: 1,
      topic: '鍔ㄧ墿瑙傚療',
      ageGroup: '5-6',
      summary: '鍘熷鎬荤粨',
      outcomes: ['瑙傚療鍔ㄧ墿'],
      sourceCoursePackId: null,
      generatedAt: '2026-04-09T00:00:00.000Z',
      parentGuide: {
        beforeClass: [],
        duringClass: [],
        afterClass: [],
      },
      steps: [
        {
          id: 'watch',
          label: '鐪?',
          icon: 'eye',
          order: 1,
          module: {
            type: 'video',
            visualStory: {
              scenes: [{ scene: '灏忕尗瑙傚療', narration: '涓€璧疯瀵熷皬鐚?' }],
            },
            videoLesson: { shots: [] },
          },
        },
        {
          id: 'write',
          label: '鍐?',
          icon: 'pen',
          order: 4,
          module: {
            type: 'writing',
            writing: {
              goal: '鎻忎竴鎻?灏忕尗',
              tracingItems: ['鐚?'],
              practiceTasks: ['娌跨潃铏氱嚎鎻忎竴鎻?'],
            },
          },
        },
      ],
    };

    contentRepo.findOne.mockResolvedValue({
      id: 101,
      status: 'draft',
      title: '鍔ㄧ墿瑙傚療 鍏ㄦ柟浣嶅涔犺',
      subtitle: '鍘熷鎬荤粨',
      content: lesson,
    });

    llmClient.generate.mockResolvedValueOnce(
      JSON.stringify({
        steps: [
          {
            id: 'write',
            module: {
              type: 'writing',
              writing: {
                goal: '鎻忎竴鎻?灏忕尗',
                tracingItems: ['鐚?'],
                practiceTasks: ['鎶婃弿绾㈢嚎鏉″彉寰楁洿娓呮櫚'],
              },
            },
          },
        ],
      }),
    );

    await service.modifyDraft(101, 1, '鎶婃弿绾㈡彁绀烘敼寰楁洿娓呮櫚', {
      stepId: 'write',
    });

    const prompt = llmClient.generate.mock.calls[0][0];
    expect(prompt).toContain('Target step for this edit');
    expect(prompt).toContain('"id": "write"');
    expect(prompt).toContain('"moduleType": "writing"');
    expect(prompt).toContain('Focus on step "write" first');
  });
});

describe('LessonContentService completeStep', () => {
  let service: any;
  let contentRepo: any;
  let llmClient: { generate: jest.Mock };
  let learningTrackerMock: any;

  beforeEach(async () => {
    contentRepo = {
      findOne: jest.fn(),
      save: jest.fn((value) => Promise.resolve(value)),
    };
    llmClient = { generate: jest.fn() };
    learningTrackerMock = {
      recordActivity: jest.fn().mockResolvedValue({
        learningRecord: { id: 99 },
        abilityUpdated: false,
        achievementsAwarded: [],
      }),
    };
    const module = await Test.createTestingModule({
      providers: [
        LessonContentService,
        { provide: getRepositoryToken(Content), useValue: contentRepo },
        { provide: getRepositoryToken(LearningRecord), useValue: {} },
        { provide: getRepositoryToken(Assignment), useValue: {} },
        { provide: getRepositoryToken(StudyPlanRecord), useValue: {} },
        { provide: ContentsService, useValue: {} },
        { provide: GenerateCoursePackTool, useValue: {} },
        { provide: GenerateActivityTool, useValue: {} },
        { provide: AiService, useValue: {} },
        { provide: AssignmentService, useValue: {} },
        { provide: LearningTrackerService, useValue: learningTrackerMock },
        { provide: LlmClientService, useValue: llmClient },
        {
          provide: LessonVideoQueueService,
          useValue: { enqueue: jest.fn(), processQueue: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(LessonContentService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('completes a video_lesson step via synthetic "watch" step', async () => {
    contentRepo.findOne.mockResolvedValue({
      id: 5,
      domain: 'science',
      content: {
        videoLesson: { shots: [{ shot: '春天' }] },
        visualStory: { scenes: [] },
      },
    });

    const result = await service.completeStep({ contentId: 5, childId: 2, stepId: 'watch' });

    expect(result.success).toBe(true);
    expect(result.recordId).toBe(99);
    expect(learningTrackerMock.recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'content_completion',
        domain: 'science',
      }),
    );
  });

  it('throws NotFoundException when no steps and no video markers', async () => {
    contentRepo.findOne.mockResolvedValue({
      id: 6,
      domain: 'language',
      content: {},
    });

    await expect(
      service.completeStep({ contentId: 6, childId: 2, stepId: 'watch' }),
    ).rejects.toThrow('not found');
  });

  it('works with structured lesson steps', async () => {
    contentRepo.findOne.mockResolvedValue({
      id: 7,
      domain: 'math',
      content: {
        steps: [{ id: 'watch', module: { type: 'video' } }],
      },
    });

    const result = await service.completeStep({ contentId: 7, childId: 2, stepId: 'watch' });

    expect(result.success).toBe(true);
    expect(learningTrackerMock.recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'content_completion', domain: 'math' }),
    );
  });
});

describe('LessonContentService runGeneration quality closed-loop', () => {
  let service: any;
  let contentRepo: any;
  let toolRegistry: { has: jest.Mock; execute: jest.Mock };
  let generateActivityTool: { execute: jest.Mock };
  let generateCoursePackSpy: jest.SpyInstance;

  const basePack = (overrides: Record<string, any> = {}) => ({
    type: 'course_pack',
    title: '彩虹课',
    topic: '彩虹',
    ageGroup: '5-6',
    summary: '彩虹总结',
    outcomes: ['认识彩虹'],
    modules: { reading: { text: '彩虹有七种颜色' } },
    visualStory: { scenes: [{ narration: '彩虹' }] },
    ...overrides,
  });

  const reviewResult = (score: number) => ({
    success: true,
    data: {
      score,
      passed: score >= 70,
      issues: score >= 70 ? [] : ['目标对齐不足'],
      suggestions: score >= 70 ? [] : ['覆盖目标关键词'],
      breakdown: {
        outcomeAlignment: 10,
        ageAppropriateness: 10,
        factualAccuracy: 10,
        contentSpecificity: 10,
        structuralCompleteness: 10,
      },
    },
  });

  const savedDraft = () => {
    const call = contentRepo.update.mock.calls.find(
      (c: any[]) => c[1]?.status === 'draft',
    );
    return call ? call[1] : null;
  };

  const params = {
    topic: '彩虹',
    ageGroup: '5-6',
    domain: 'science',
    childId: 1,
    parentId: 1,
  };

  beforeEach(async () => {
    contentRepo = {
      update: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn(),
    };
    toolRegistry = { has: jest.fn().mockReturnValue(true), execute: jest.fn() };
    generateActivityTool = {
      execute: jest
        .fn()
        .mockResolvedValue(JSON.stringify({ type: 'quiz', topic: '彩虹', questions: [] })),
    };

    const module = await Test.createTestingModule({
      providers: [
        LessonContentService,
        { provide: getRepositoryToken(Content), useValue: contentRepo },
        { provide: getRepositoryToken(LearningRecord), useValue: {} },
        { provide: getRepositoryToken(Assignment), useValue: {} },
        { provide: getRepositoryToken(StudyPlanRecord), useValue: {} },
        { provide: ContentsService, useValue: {} },
        { provide: GenerateCoursePackTool, useValue: {} },
        { provide: GenerateActivityTool, useValue: generateActivityTool },
        { provide: AiService, useValue: {} },
        { provide: AssignmentService, useValue: {} },
        { provide: LearningTrackerService, useValue: {} },
        { provide: LlmClientService, useValue: { generate: jest.fn() } },
        {
          provide: LessonVideoQueueService,
          useValue: { enqueue: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: ToolRegistryService, useValue: toolRegistry },
      ],
    }).compile();
    service = module.get(LessonContentService);

    jest.spyOn(service, 'assembleLesson').mockImplementation((pack: any) => ({
      type: 'structured_lesson',
      version: 1,
      topic: pack.topic,
      ageGroup: '5-6',
      summary: pack.summary || '',
      outcomes: pack.outcomes || [],
      sourceCoursePackId: null,
      steps: [],
      parentGuide: { beforeClass: [], duringClass: [], afterClass: [] },
      generatedAt: '2026-01-01T00:00:00.000Z',
    }));
    generateCoursePackSpy = jest.spyOn(service, 'generateCoursePackForLesson');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stores passing quality without regeneration', async () => {
    generateCoursePackSpy.mockResolvedValue(JSON.stringify(basePack()));
    toolRegistry.execute.mockResolvedValue(reviewResult(85));

    await service.runGeneration(10, params);

    const draft = savedDraft();
    expect(draft.content.quality).toMatchObject({
      score: 85,
      passed: true,
      warning: false,
    });
    expect(generateCoursePackSpy).toHaveBeenCalledTimes(1);
  });

  it('regenerates once below threshold and keeps the improved pack', async () => {
    generateCoursePackSpy
      .mockResolvedValueOnce(JSON.stringify(basePack({ title: '原始课' })))
      .mockResolvedValueOnce(JSON.stringify(basePack({ title: '改进课' })));
    toolRegistry.execute
      .mockResolvedValueOnce(reviewResult(50))
      .mockResolvedValueOnce(reviewResult(82));

    await service.runGeneration(11, params);

    const draft = savedDraft();
    expect(generateCoursePackSpy).toHaveBeenCalledTimes(2);
    expect(draft.title).toBe('改进课');
    expect(draft.content.quality).toMatchObject({
      score: 82,
      passed: true,
      warning: false,
    });
    const retryArgs = generateCoursePackSpy.mock.calls[1][1];
    expect(retryArgs.parentPrompt).toContain('质量改进要求');
    expect(retryArgs.parentPrompt).toContain('目标对齐不足');
  });

  it('keeps the original pack when regeneration scores worse', async () => {
    generateCoursePackSpy
      .mockResolvedValueOnce(JSON.stringify(basePack({ title: '原始课' })))
      .mockResolvedValueOnce(JSON.stringify(basePack({ title: '更差课' })));
    toolRegistry.execute
      .mockResolvedValueOnce(reviewResult(60))
      .mockResolvedValueOnce(reviewResult(40));

    await service.runGeneration(12, params);

    const draft = savedDraft();
    expect(draft.title).toBe('原始课');
    expect(draft.content.quality).toMatchObject({
      score: 60,
      passed: false,
      warning: true,
    });
  });

  it('flags warning when still below threshold after retry', async () => {
    generateCoursePackSpy
      .mockResolvedValueOnce(JSON.stringify(basePack()))
      .mockResolvedValueOnce(JSON.stringify(basePack()));
    toolRegistry.execute
      .mockResolvedValueOnce(reviewResult(50))
      .mockResolvedValueOnce(reviewResult(55));

    await service.runGeneration(13, params);

    const draft = savedDraft();
    expect(draft.content.quality).toMatchObject({
      score: 55,
      passed: false,
      warning: true,
    });
    expect(draft.content.quality.issues).toContain('目标对齐不足');
  });

  it('skips quality scoring when the review tool is unavailable', async () => {
    toolRegistry.has.mockReturnValue(false);
    generateCoursePackSpy.mockResolvedValue(JSON.stringify(basePack()));

    await service.runGeneration(14, params);

    const draft = savedDraft();
    expect(draft.status).toBe('draft');
    expect(draft.content.quality).toBeUndefined();
    expect(toolRegistry.execute).not.toHaveBeenCalled();
  });
});

describe('LessonContentService assembleLesson practice type', () => {
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

  const meta = {
    topic: '彩虹的颜色',
    ageGroup: '5-6' as const,
    domain: 'language' as const,
    summary: '',
    outcomes: [],
  };

  const practiceGame = (lesson: any) =>
    lesson.steps.find((s: any) => s.id === 'practice').module.game;

  it('follows the activity data type instead of the focus-derived type', () => {
    const lesson = (service as any).assembleLesson(
      { focus: 'literacy', modules: {} },
      {
        type: 'matching',
        title: '彩虹的颜色',
        pairs: [{ id: 'p1', left: '红色', right: '🔴' }],
      },
      meta,
    );
    expect(practiceGame(lesson).activityType).toBe('matching');
  });

  it('falls back to focus-derived type when data has no valid type', () => {
    const lesson = (service as any).assembleLesson(
      { focus: 'literacy', modules: {} },
      { title: '彩虹的颜色' },
      meta,
    );
    expect(practiceGame(lesson).activityType).toBe('fill_blank');
  });

  it('falls back to focus-derived type when practice data is missing', () => {
    const lesson = (service as any).assembleLesson(
      { focus: 'math', modules: {} },
      null,
      meta,
    );
    expect(practiceGame(lesson).activityType).toBe('quiz');
  });

  it('fallback activity payload matches its type for pool types without static fallback', () => {
    const activity = (service as any).buildFallbackActivity(
      'tap_target',
      '海洋动物',
      '5-6',
      'science',
    );
    if (activity.type === 'connection') {
      expect(activity.leftItems.length).toBeGreaterThan(0);
      expect(activity.connections.length).toBeGreaterThan(0);
    } else {
      expect(activity.type).toBe('quiz');
      expect(activity.questions.length).toBeGreaterThan(0);
    }
  });

  it('fill_blank without seed data degrades to a valid quiz payload', () => {
    const activity = (service as any).buildFallbackActivity(
      'fill_blank',
      '未知主题xyz',
      '5-6',
      'science',
    );
    expect(activity.type).toBe('quiz');
    expect(activity.questions.length).toBeGreaterThan(0);
    expect(activity.questions[0].options.length).toBeGreaterThanOrEqual(3);
  });
});
