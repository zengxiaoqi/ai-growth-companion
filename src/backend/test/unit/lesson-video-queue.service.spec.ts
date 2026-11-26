import { promises as fs } from 'fs';
import { LessonVideoQueueService } from '../../src/modules/learning/lesson-video-queue.service';
import { ScienceFactGateError } from '../../src/modules/learning/science-fact-guards';
import {
  announcePortOwner,
  isWorkerActive,
  markWorkerInactive,
} from '../../src/common/instance-guard';

describe('LessonVideoQueueService', () => {
  let service: LessonVideoQueueService;
  let taskRepo: { update: jest.Mock; findOne: jest.Mock; save: jest.Mock };
  let contentRepo: { update: jest.Mock; findOne: jest.Mock };
  let aiService: { renderTeachingVideoFromPack: jest.Mock };
  let remotionRender: {
    resolveComposition: jest.Mock;
    renderComposition: jest.Mock;
    renderGeneratedComposition: jest.Mock;
    cleanupNarrationFiles: jest.Mock;
  };
  let hyperframesRender: {
    renderLessonVideo: jest.Mock;
  };
  let dshBridge: {
    renderWithDsh: jest.Mock;
  };

  beforeEach(() => {
    taskRepo = {
      update: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation(async (x) => x),
    };

    contentRepo = {
      update: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn().mockResolvedValue(null),
    };

    aiService = {
      renderTeachingVideoFromPack: jest.fn().mockResolvedValue(null),
    };

    remotionRender = {
      resolveComposition: jest.fn(),
      renderComposition: jest.fn(),
      renderGeneratedComposition: jest.fn(),
      cleanupNarrationFiles: jest.fn().mockResolvedValue(undefined),
    };

    hyperframesRender = {
      renderLessonVideo: jest.fn(),
    };

    dshBridge = {
      renderWithDsh: jest.fn().mockResolvedValue(null),
    };

    service = new LessonVideoQueueService(
      taskRepo as any,
      contentRepo as any,
      aiService as any,
      remotionRender as any,
      hyperframesRender as any,
      dshBridge as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('prefers native Remotion for whiteboard scenes in auto and remotion modes only', () => {
    const payload = {
      watchScene: {
        scenes: [
          {
            visual: {
              templateId: 'language.whiteboard-story',
              templateParams: { sourceImage: 'whiteboard/shapes.png' },
            },
          },
        ],
      },
    };

    expect((service as any).resolveEngineOrder('auto', payload)[0]).toBe('remotion');
    expect((service as any).resolveEngineOrder('remotion', payload)).toEqual([
      'remotion',
      'dynamic-remotion',
    ]);
    expect((service as any).resolveEngineOrder('agent-remotion', payload)[0]).toBe(
      'agent-remotion',
    );
    expect((service as any).resolveEngineOrder('hyperframes', payload)).toEqual(['hyperframes']);
    expect((service as any).normalizeRenderEngine('dynamic-remotion')).toBe('dynamic-remotion');
    expect((service as any).resolveEngineOrder('dynamic-remotion', payload)).toEqual([
      'dynamic-remotion',
    ]);
  });

  it('includes whiteboard region changes and renderer version in the cache key', async () => {
    const content = { id: 12, updatedAt: new Date('2026-11-24T00:00:00Z') } as any;
    const payload = {
      watchScene: {
        scenes: [
          {
            visual: {
              templateId: 'language.whiteboard-story',
              templateParams: {
                sourceImage: 'whiteboard/shapes.png',
                regions: [{ id: 'circle', region: { x: 10, y: 10, width: 100, height: 100 } }],
              },
            },
          },
        ],
      },
    };
    const changed = JSON.parse(JSON.stringify(payload));
    changed.watchScene.scenes[0].visual.templateParams.regions[0].region.x = 20;

    const first = await (service as any).computeCacheKey(content, payload);
    expect(await (service as any).computeCacheKey(content, changed)).not.toBe(first);
    expect(await (service as any).computeCacheKey(content, payload)).toBe(first);
  });

  it('includes whiteboard source image bytes in the cache key', async () => {
    const content = { id: 13, updatedAt: new Date('2026-11-24T00:00:00Z') } as any;
    const payload = {
      watchScene: {
        scenes: [
          {
            visual: {
              templateId: 'language.whiteboard-story',
              templateParams: { sourceImage: 'assets/lesson/whiteboard/shapes.png' },
            },
          },
        ],
      },
    };
    const readFile = jest
      .spyOn(fs, 'readFile')
      .mockResolvedValueOnce(Buffer.from('first image'))
      .mockResolvedValueOnce(Buffer.from('second image'));

    const first = await (service as any).computeCacheKey(content, payload);
    const second = await (service as any).computeCacheKey(content, payload);
    expect(second).not.toBe(first);
    expect(readFile).toHaveBeenCalledTimes(2);
  });

  it('ignores stale whiteboard markers outside the effective Watch scenes', () => {
    const payload = {
      watchScene: {
        scenes: [
          {
            narration: '普通故事镜头',
            visual: { templateId: 'language.story-scene' },
          },
        ],
      },
      visualStory: {
        __storyboard: { templateId: 'language.whiteboard-story' },
      },
    };

    expect((service as any).payloadHasWhiteboard(payload)).toBe(false);
    expect((service as any).resolveEngineOrder('auto', payload)[0]).not.toBe('remotion');
  });

  it('syncs current watch scene text into legacy video payload fields', () => {
    const payload = {
      watchScene: {
        scenes: [{ title: '分享讲解', narration: '新旁白', onScreenText: '新字幕' }],
      },
      visualStory: { scenes: [{ narration: '旧旁白', onScreenText: '旧字幕' }] },
      videoLesson: { shots: [{ narration: '旧旁白', caption: '旧字幕' }] },
    };

    const synced = (service as any).syncVideoPayloadFromWatchScene(payload);

    expect(synced.visualStory.scenes[0].narration).toBe('新旁白');
    expect(synced.visualStory.scenes[0].onScreenText).toBe('新字幕');
    expect(synced.videoLesson.shots[0].narration).toBe('新旁白');
    expect(synced.videoLesson.shots[0].caption).toBe('新字幕');
  });

  function createDynamicManifest(compositionId = 'GeneratedLesson_tiger') {
    return {
      compositionId,
      files: [
        { path: 'index.ts', content: 'dynamic visual tiger stripe forest' },
        { path: 'Root.tsx', content: 'dynamic visual tiger stripe forest' },
        {
          path: 'GeneratedLesson.tsx',
          content: 'dynamic visual tiger stripe forest river',
        },
      ],
      props: {
        title: '认识动物老虎视频',
        durationFrames: 360,
        scenes: [
          {
            title: '老虎登场',
            narration: '老虎是大型猫科动物，身上有黑色条纹。',
            generatedVisual: 'tiger-showFeatures-forest-stripe',
            durationFrames: 180,
          },
        ],
      },
      assets: [],
      durationFrames: 360,
      sceneAssetSummary: [
        {
          title: '老虎登场',
          generatedVisual: 'tiger-showFeatures-forest-stripe',
        },
      ],
    };
  }

  function createVideoAgent(overrides: Record<string, any> = {}) {
    return {
      generateViaAgent: jest.fn().mockResolvedValue({
        storyboard: {
          title: '认识动物老虎视频',
          topic: '认识动物老虎',
          domain: 'science',
          totalDurationSec: 24,
          scenes: [
            {
              sequence: 1,
              title: '老虎登场',
              concept: '条纹',
              narration: '老虎是大型猫科动物，身上有黑色条纹。',
              onScreenText: '老虎条纹',
              visualDescription: '森林里的卡通老虎展示黑色条纹',
              durationSec: 12,
            },
          ],
        },
        qualityScore: 92,
        qualityPassed: true,
        issues: [],
        toolCalls: [],
        agentFiles: new Map([['GeneratedLesson.tsx', 'broken generated lesson component']]),
      }),
      generateRemotionComposition: jest.fn().mockResolvedValue(createDynamicManifest()),
      repairGeneratedRemotionComposition: jest
        .fn()
        .mockResolvedValue(createDynamicManifest('GeneratedLesson_tiger_repair')),
      generateFallbackStoryboard: jest.fn().mockResolvedValue(null),
      ...overrides,
    };
  }

  function createAgentBackedService(videoAgent: Record<string, any>) {
    return new LessonVideoQueueService(
      taskRepo as any,
      contentRepo as any,
      aiService as any,
      remotionRender as any,
      hyperframesRender as any,
      dshBridge as any,
      videoAgent as any,
    );
  }

  it('blocks a risky agent storyboard without silently using another fallback', async () => {
    const videoAgent = createVideoAgent({
      generateViaAgent: jest.fn().mockResolvedValue({
        storyboard: {
          title: '蜗牛壳',
          topic: '蜗牛壳上的花纹',
          scenes: [{ title: '壳上的圈', narration: '蜗牛长一岁多一圈。' }],
        },
        qualityScore: 99,
        qualityPassed: true,
        toolCalls: [],
        agentFiles: new Map(),
      }),
      generateFallbackStoryboard: jest.fn(),
    });
    const agentService = createAgentBackedService(videoAgent);

    await expect(
      (agentService as any).generateVideoBuffer(
        { id: 61, contentId: 68, cacheKey: 'risky-agent', renderEngine: 'dynamic-remotion' },
        { topic: '蜗牛壳上的花纹', domain: 'science', ageGroup: '5-6' },
      ),
    ).rejects.toBeInstanceOf(ScienceFactGateError);
    expect(videoAgent.generateFallbackStoryboard).not.toHaveBeenCalled();
    expect(remotionRender.renderGeneratedComposition).not.toHaveBeenCalled();
    expect(remotionRender.renderComposition).not.toHaveBeenCalled();
    expect(hyperframesRender.renderLessonVideo).not.toHaveBeenCalled();
  });

  it('blocks a risky fallback storyboard instead of degrading to legacy rendering', async () => {
    const videoAgent = createVideoAgent({
      generateViaAgent: jest.fn().mockRejectedValue(new Error('agent unavailable')),
      generateFallbackStoryboard: jest.fn().mockResolvedValue({
        title: '蜗牛壳',
        topic: '蜗牛壳上的花纹',
        scenes: [{ title: '保护作用', narration: '有壳就不怕被小鸟啄。' }],
      }),
    });
    const agentService = createAgentBackedService(videoAgent);

    await expect(
      (agentService as any).generateVideoBuffer(
        { id: 62, contentId: 68, cacheKey: 'risky-fallback', renderEngine: 'auto' },
        { topic: '蜗牛壳上的花纹', domain: 'science', ageGroup: '5-6' },
      ),
    ).rejects.toBeInstanceOf(ScienceFactGateError);
    expect(remotionRender.renderGeneratedComposition).not.toHaveBeenCalled();
    expect(remotionRender.renderComposition).not.toHaveBeenCalled();
    expect(aiService.renderTeachingVideoFromPack).not.toHaveBeenCalled();
  });

  it('builds remotion payload from structured lesson watch content', () => {
    const watchScene = {
      version: 1,
      stepType: 'watch',
      mode: 'playback',
      scenes: [{ id: 'watch-1', title: '春天', narration: '看看春天。' }],
    };
    const visualStory = {
      scenes: [{ scene: '春天', narration: '春天来了。', onScreenText: '春天' }],
    };
    const videoLesson = {
      title: '四季视频',
      shots: [{ shot: '春天', narration: '春天来了。', caption: '春天' }],
    };

    const payload = (service as any).buildPackPayloadFromContent({
      id: 12,
      title: '四季变化课程',
      subtitle: '课程总结',
      topic: '四季变化',
      ageRange: '5-6',
      domain: 'science',
      content: {
        type: 'structured_lesson',
        topic: '四季变化',
        ageGroup: '5-6',
        domain: 'science',
        summary: '先认识四季，再观察变化',
        steps: [
          {
            id: 'watch',
            module: {
              type: 'video',
              scene: watchScene,
              visualStory,
              videoLesson,
            },
          },
        ],
      },
    });

    expect(payload).toMatchObject({
      title: '四季变化课程',
      topic: '四季变化',
      domain: 'science',
      summary: '先认识四季，再观察变化',
      ageGroup: '5-6',
      watchScene,
      visualStory,
      videoLesson,
    });
  });

  it('passes lesson-derived payload into remotion composition resolution', async () => {
    const payload = {
      topic: '认识动物',
      ageGroup: '3-4',
      title: '动物观察课',
      summary: '观察小动物',
      watchScene: {
        scenes: [{ id: 'watch-1', title: '小猫', narration: '这是小猫。' }],
      },
      visualStory: {},
      videoLesson: {},
    };

    remotionRender.resolveComposition.mockResolvedValue({
      compositionId: 'TopicVideo',
      inputProps: { title: '认识动物', slides: [] },
    });
    remotionRender.renderComposition.mockImplementation(
      async (_id, _props, _outputPath, onProgress) => {
        if (onProgress) {
          await onProgress(42);
        }
      },
    );

    jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined as any);
    jest.spyOn(fs, 'readFile').mockResolvedValue(Buffer.from('video'));
    jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);

    const buffer = await (service as any).generateByRemotion(
      { id: 7, cacheKey: 'cache-key' },
      payload,
    );

    expect(remotionRender.resolveComposition).toHaveBeenCalledWith(payload, '3-4');
    expect(remotionRender.renderComposition).toHaveBeenCalled();
    expect(taskRepo.update).toHaveBeenCalledWith(7, { progress: 42 });
    expect(buffer).toEqual(Buffer.from('video'));
  });

  it('keeps watchScene in generic provider payload fallback', () => {
    const payload = {
      title: '动物观察课',
      topic: '认识动物',
      summary: '观察小动物',
      watchScene: {
        scenes: [{ id: 'watch-1', title: '小猫', narration: '这是小猫。' }],
      },
      visualStory: {},
      videoLesson: {},
      modules: {},
    };

    const originalMode = process.env.VIDEO_PROVIDER_CREATE_BODY_MODE;
    delete process.env.VIDEO_PROVIDER_CREATE_BODY_MODE;

    const body = (service as any).buildProviderCreateBody(
      { contentId: 11, childId: 22, cacheKey: 'cache-key' },
      payload,
    );

    if (originalMode === undefined) {
      delete process.env.VIDEO_PROVIDER_CREATE_BODY_MODE;
    } else {
      process.env.VIDEO_PROVIDER_CREATE_BODY_MODE = originalMode;
    }

    expect(body).toMatchObject({
      title: '动物观察课',
      topic: '认识动物',
      summary: '观察小动物',
      watchScene: payload.watchScene,
    });
  });

  it('routes auto engine to fixed remotion when no dynamic storyboard is available', async () => {
    remotionRender.resolveComposition.mockResolvedValue({
      compositionId: 'TopicVideo',
      inputProps: { title: '认识动物', slides: [] },
    });
    remotionRender.renderComposition.mockResolvedValue(undefined);

    jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined as any);
    jest.spyOn(fs, 'readFile').mockResolvedValue(Buffer.from('video'));
    jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);

    const result = await (service as any).generateVideoBuffer(
      { id: 9, cacheKey: 'cache-key', renderEngine: 'auto' },
      { topic: '认识动物', ageGroup: '3-4', videoLesson: { shots: [] } },
    );

    expect(hyperframesRender.renderLessonVideo).not.toHaveBeenCalled();
    expect(remotionRender.resolveComposition).toHaveBeenCalled();
    expect(result.buffer).toEqual(Buffer.from('video'));
  });

  it('uses video generation agent before rendering and renders agent storyboard', async () => {
    const videoAgent = {
      generateViaAgent: jest.fn().mockResolvedValue({
        storyboard: {
          title: '认识动物老虎视频',
          topic: '认识动物老虎',
          domain: 'science',
          totalDurationSec: 24,
          scenes: [
            {
              sequence: 1,
              title: '老虎登场',
              concept: '老虎',
              narration: '老虎是大型猫科动物，身上有黑色条纹。',
              onScreenText: '老虎条纹',
              visualDescription: '森林里的卡通老虎展示黑色条纹',
              durationSec: 12,
              transitionToNext: 'fade',
              emphasis: 'intro',
            },
            {
              sequence: 2,
              title: '老虎捕食',
              concept: '捕食',
              narration: '老虎爱吃肉，会安静观察再行动。',
              onScreenText: '爱吃肉',
              visualDescription: '老虎在草丛边观察',
              durationSec: 12,
              transitionToNext: 'fade',
              emphasis: 'core-concept',
            },
          ],
          visualTheme: {
            primaryPalette: 'forest',
            accentColor: '#35A86B',
            mood: 'playful',
          },
          narrativeArc: '认识老虎特点',
        },
        qualityScore: 92,
        qualityPassed: true,
        issues: [],
        toolCalls: [],
        agentFiles: new Map([['GeneratedLesson.tsx', 'dynamic visual tiger stripe forest river']]),
      }),
      generateRemotionComposition: jest.fn().mockResolvedValue({
        compositionId: 'GeneratedLesson_tiger',
        files: [
          { path: 'index.ts', content: 'dynamic visual tiger stripe forest' },
          { path: 'Root.tsx', content: 'dynamic visual tiger stripe forest' },
          {
            path: 'GeneratedLesson.tsx',
            content: 'dynamic visual tiger stripe forest river',
          },
        ],
        props: {
          title: '认识动物老虎视频',
          durationFrames: 360,
          scenes: [
            {
              title: '老虎登场',
              narration: '老虎是大型猫科动物，身上有黑色条纹。',
              generatedVisual: 'tiger-showFeatures-forest-stripe',
              durationFrames: 180,
            },
          ],
        },
        assets: [],
        durationFrames: 360,
        sceneAssetSummary: [
          {
            title: '老虎登场',
            generatedVisual: 'tiger-showFeatures-forest-stripe',
          },
        ],
      }),
    };
    const agentService = new LessonVideoQueueService(
      taskRepo as any,
      contentRepo as any,
      aiService as any,
      remotionRender as any,
      hyperframesRender as any,
      dshBridge as any,
      videoAgent as any,
    );
    remotionRender.renderGeneratedComposition.mockResolvedValue(undefined);
    jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined as any);
    jest.spyOn(fs, 'readFile').mockResolvedValue(Buffer.from('video'));
    jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);

    const result = await (agentService as any).generateVideoBuffer(
      {
        id: 15,
        contentId: 62,
        childId: 3,
        cacheKey: 'cache-key',
        renderEngine: 'auto',
      },
      {
        topic: '认识动物老虎',
        ageGroup: '5-6',
        domain: 'science',
        videoLesson: {
          shots: [{ shot: '春天讲解', narration: '春天花开了。', caption: '春天' }],
        },
      },
    );

    expect(videoAgent.generateViaAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: '认识动物老虎',
        domain: 'science',
        ageGroup: '5-6',
        contentId: 62,
      }),
    );
    expect(videoAgent.generateRemotionComposition).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '认识动物老虎视频',
      }),
      expect.anything(),
      expect.any(Map),
    );
    expect(remotionRender.renderGeneratedComposition).toHaveBeenCalledWith(
      expect.objectContaining({ id: 15 }),
      expect.objectContaining({
        compositionId: 'GeneratedLesson_tiger',
      }),
      expect.stringContaining('dynamic-remotion.mp4'),
      expect.any(Function),
    );
    expect(hyperframesRender.renderLessonVideo).not.toHaveBeenCalled();
    expect(result.buffer).toEqual(Buffer.from('video'));
  });

  it('renders via DSH without touching other engines when renderEngine is dsh', async () => {
    dshBridge.renderWithDsh.mockResolvedValue(Buffer.from('dsh-video'));
    const result = await (service as any).generateVideoBufferWithEngines(
      { id: 20, cacheKey: 'dsh-cache', renderEngine: 'dsh' },
      {
        topic: '水循环',
        ageGroup: '5-6',
        domain: 'science',
        videoLesson: { shots: [{ narration: '水变成水蒸气。' }] },
      },
    );
    expect(dshBridge.renderWithDsh).toHaveBeenCalledTimes(1);
    expect(dshBridge.renderWithDsh).toHaveBeenCalledWith(
      expect.objectContaining({ id: 20, renderEngine: 'dsh' }),
      expect.objectContaining({ topic: '水循环' }),
    );
    expect(result.buffer).toEqual(Buffer.from('dsh-video'));
    expect(remotionRender.renderGeneratedComposition).not.toHaveBeenCalled();
    expect(hyperframesRender.renderLessonVideo).not.toHaveBeenCalled();
  });

  it('retries once with a rebuilt manifest when dynamic Remotion render fails', async () => {
    const videoAgent = createVideoAgent();
    const agentService = createAgentBackedService(videoAgent);
    remotionRender.renderGeneratedComposition
      .mockRejectedValueOnce(new Error('Failed to compile GeneratedLesson.tsx: Unexpected token'))
      .mockResolvedValueOnce(undefined);
    jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined as any);
    jest.spyOn(fs, 'readFile').mockResolvedValue(Buffer.from('repaired-video'));
    jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);

    const result = await (agentService as any).generateVideoBuffer(
      {
        id: 16,
        contentId: 62,
        childId: 3,
        cacheKey: 'cache-key',
        renderEngine: 'auto',
      },
      { topic: '认识动物老虎', ageGroup: '5-6', domain: 'science' },
    );

    // 画面代码由内置模板产出，重试不是"让 AI 重写 TSX"，而是用同一模板重建清单，
    // 只用来吸收 bundle / 缓存类的偶发失败
    expect(videoAgent.generateRemotionComposition).toHaveBeenCalledTimes(2);
    expect(remotionRender.renderGeneratedComposition).toHaveBeenCalledTimes(2);
    expect(hyperframesRender.renderLessonVideo).not.toHaveBeenCalled();
    expect(result.buffer).toEqual(Buffer.from('repaired-video'));
  });

  it('skips AI repair for dynamic Remotion environment failures', async () => {
    const videoAgent = createVideoAgent();
    const agentService = createAgentBackedService(videoAgent);
    remotionRender.renderGeneratedComposition.mockRejectedValueOnce(
      new Error('"browserExecutable" was specified as \'C:\\Program\' but the path does not exist'),
    );
    remotionRender.resolveComposition.mockRejectedValue(new Error('fixed remotion unavailable'));
    hyperframesRender.renderLessonVideo.mockResolvedValue(Buffer.from('hf'));
    jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined as any);

    const result = await (agentService as any).generateVideoBuffer(
      {
        id: 17,
        contentId: 62,
        childId: 3,
        cacheKey: 'cache-key',
        renderEngine: 'auto',
      },
      { topic: '认识动物老虎', ageGroup: '5-6', domain: 'science' },
    );

    expect(videoAgent.repairGeneratedRemotionComposition).not.toHaveBeenCalled();
    expect(hyperframesRender.renderLessonVideo).toHaveBeenCalled();
    expect(result.buffer).toEqual(Buffer.from('hf'));
  });

  it('falls back to HyperFrames when the rebuilt-manifest retry also fails', async () => {
    const videoAgent = createVideoAgent();
    const agentService = createAgentBackedService(videoAgent);
    remotionRender.renderGeneratedComposition
      .mockRejectedValueOnce(new Error('Failed to compile GeneratedLesson.tsx: Unexpected token'))
      .mockRejectedValueOnce(new Error('Failed to compile GeneratedLesson.tsx: rebuilt error'));
    remotionRender.resolveComposition.mockRejectedValue(new Error('fixed remotion unavailable'));
    hyperframesRender.renderLessonVideo.mockResolvedValue(Buffer.from('hf'));
    jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined as any);

    const result = await (agentService as any).generateVideoBuffer(
      {
        id: 18,
        contentId: 62,
        childId: 3,
        cacheKey: 'cache-key',
        renderEngine: 'auto',
      },
      { topic: '认识动物老虎', ageGroup: '5-6', domain: 'science' },
    );

    // 2 calls: 首次渲染 + 重建清单后再渲染；两次都失败才降级到 HyperFrames
    expect(remotionRender.renderGeneratedComposition).toHaveBeenCalledTimes(2);
    expect(videoAgent.generateRemotionComposition).toHaveBeenCalledTimes(2);
    expect(hyperframesRender.renderLessonVideo).toHaveBeenCalled();
    expect(result.buffer).toEqual(Buffer.from('hf'));
  });

  it('uses remotion only when renderEngine is remotion', async () => {
    remotionRender.resolveComposition.mockResolvedValue({
      compositionId: 'TopicVideo',
      inputProps: { title: '认识动物', slides: [] },
    });
    remotionRender.renderComposition.mockResolvedValue(undefined);

    jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined as any);
    jest.spyOn(fs, 'readFile').mockResolvedValue(Buffer.from('video-remotion'));
    jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);

    const result = await (service as any).generateVideoBuffer(
      { id: 10, cacheKey: 'cache-key', renderEngine: 'remotion' },
      { topic: '认识动物', ageGroup: '5-6' },
    );

    expect(hyperframesRender.renderLessonVideo).not.toHaveBeenCalled();
    expect(remotionRender.resolveComposition).toHaveBeenCalled();
    expect(result.buffer).toEqual(Buffer.from('video-remotion'));
  });

  it('blocks a failed native Remotion QA verdict before releasing the buffer', async () => {
    const previousGate = process.env.VIDEO_QA_GATE;
    delete process.env.VIDEO_QA_GATE;
    const visualQa = {
      isConfigured: true,
      qaDir: jest.fn().mockReturnValue('qa-dir'),
      sceneSampleTimes: jest.fn().mockReturnValue([0, 1]),
      extractFrames: jest.fn().mockResolvedValue([]),
      reviewVideo: jest.fn().mockResolvedValue({
        passed: false,
        score: 62,
        blockers: ['subtitle unreadable'],
        issues: ['subtitle unreadable'],
        scenes: [],
        framesReviewed: 2,
      }),
    };
    const qaService = new LessonVideoQueueService(
      taskRepo as any,
      contentRepo as any,
      aiService as any,
      remotionRender as any,
      hyperframesRender as any,
      dshBridge as any,
      undefined,
      visualQa as any,
    );
    remotionRender.resolveComposition.mockResolvedValue({
      compositionId: 'TopicVideo',
      inputProps: {
        slides: [{ title: '第一幕', narration: '这是旁白。', durationFrames: 240 }],
      },
    });
    remotionRender.renderComposition.mockResolvedValue(undefined);
    jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined as any);
    jest.spyOn(fs, 'rm').mockResolvedValue(undefined);
    jest.spyOn(fs, 'readFile').mockResolvedValue(Buffer.from('video-remotion'));
    jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);

    try {
      await expect(
        (qaService as any).generateByRemotion(
          { id: 12, cacheKey: 'qa-cache' },
          {
            topic: '蜗牛',
            __storyboard: {
              scenes: [{ title: '第一幕', narration: '这是旁白。', durationSec: 8 }],
            },
          },
        ),
      ).rejects.toThrow('remotion QA failed: score=62');
      expect(visualQa.reviewVideo).toHaveBeenCalledTimes(1);
      expect(taskRepo.update).toHaveBeenCalledWith(
        12,
        expect.objectContaining({ qaPassed: false, qaScore: 62 }),
      );
    } finally {
      if (previousGate === undefined) delete process.env.VIDEO_QA_GATE;
      else process.env.VIDEO_QA_GATE = previousGate;
    }
  });

  it('uses hyperframes only when renderEngine is hyperframes', async () => {
    hyperframesRender.renderLessonVideo.mockResolvedValue(Buffer.from('video-hf'));

    const result = await (service as any).generateVideoBuffer(
      { id: 11, cacheKey: 'cache-key', renderEngine: 'hyperframes' },
      { topic: '认识动物', ageGroup: '5-6' },
    );

    expect(hyperframesRender.renderLessonVideo).toHaveBeenCalled();
    expect(remotionRender.resolveComposition).not.toHaveBeenCalled();
    expect(result.buffer).toEqual(Buffer.from('video-hf'));
  });

  it('builds remotion payload from video_lesson content (no steps)', () => {
    const payload = (service as any).buildPackPayloadFromContent({
      id: 30,
      title: '四季变化课程',
      subtitle: '课程总结',
      topic: '四季变化',
      ageRange: '5-6',
      domain: 'science',
      content: {
        topic: '四季变化',
        domain: 'science',
        summary: '先认识四季',
        ageGroup: '5-6',
        videoLesson: { title: '四季视频', shots: [{ shot: '春天', narration: '春天来了。' }] },
        visualStory: { scenes: [{ scene: '春天' }] },
      },
    });

    expect(payload).toMatchObject({
      title: '四季变化课程',
      topic: '四季变化',
      domain: 'science',
      summary: '先认识四季',
      ageGroup: '5-6',
      videoLesson: { title: '四季视频', shots: [{ shot: '春天', narration: '春天来了。' }] },
      visualStory: { scenes: [{ scene: '春天' }] },
    });
    expect(payload.watchScene).toBeUndefined();
    expect(payload.modules).toBeUndefined();
  });

  describe('course-pack storyboard fast path', () => {
    const alignedPayload = {
      topic: '认识动物老虎',
      title: '老虎观察课',
      ageGroup: '5-6',
      domain: 'science',
      visualStory: {
        scenes: [
          {
            scene: '老虎登场',
            imagePrompt: '森林里的卡通老虎展示黑色条纹',
            narration: '老虎是大型猫科动物，身上有黑色条纹。',
            onScreenText: '老虎条纹',
            durationSec: 12,
            animationTemplate: 'science.animal-intro',
            animationParams: { animal: 'tiger' },
            performance: {
              actors: [{ id: 'tiger', label: '老虎', role: 'helper' }],
              actions: [{ verb: 'walk', caption: '老虎从森林里走出来' }],
            },
          },
          {
            scene: '老虎捕食',
            imagePrompt: '老虎在草丛边观察猎物',
            narration: '老虎爱吃肉，会安静观察再行动。',
            onScreenText: '爱吃肉',
            durationSec: 10,
            sceneGraph: {
              relation: 'compare',
              nodes: [
                { id: 'tiger', label: '老虎', subject: '老虎', role: 'subject' },
                { id: 'prey', label: '猎物', subject: '猎物', role: 'object' },
              ],
            },
          },
        ],
      },
      videoLesson: { shots: [] },
    };

    it('skips the storyboard agent when course-pack scenes are topic-aligned', async () => {
      const videoAgent = createVideoAgent();
      const agentService = createAgentBackedService(videoAgent);
      remotionRender.renderGeneratedComposition.mockResolvedValue(undefined);
      jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined as any);
      jest.spyOn(fs, 'readFile').mockResolvedValue(Buffer.from('pack-video'));
      jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);

      const result = await (agentService as any).generateVideoBuffer(
        { id: 40, contentId: 62, childId: 3, cacheKey: 'pack-cache', renderEngine: 'auto' },
        alignedPayload,
      );

      expect(videoAgent.generateViaAgent).not.toHaveBeenCalled();
      expect(videoAgent.generateRemotionComposition).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: '认识动物老虎',
          sceneCount: 2,
          scenes: expect.arrayContaining([
            expect.objectContaining({
              title: '老虎登场',
              narration: '老虎是大型猫科动物，身上有黑色条纹。',
              visualDescription: '森林里的卡通老虎展示黑色条纹',
              animationTemplate: { id: 'science.animal-intro', params: { animal: 'tiger' } },
              emphasis: 'intro',
            }),
            expect.objectContaining({ title: '老虎捕食', emphasis: 'summary' }),
          ]),
        }),
        expect.anything(),
        expect.any(Map),
      );
      expect(result.buffer).toEqual(Buffer.from('pack-video'));
    });

    it('runs the storyboard agent when aligned pack scenes only have prose visuals', async () => {
      const videoAgent = createVideoAgent();
      const agentService = createAgentBackedService(videoAgent);
      remotionRender.renderGeneratedComposition.mockResolvedValue(undefined);
      jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined as any);
      jest.spyOn(fs, 'readFile').mockResolvedValue(Buffer.from('agent-video'));
      jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);

      await (agentService as any).generateVideoBuffer(
        { id: 42, contentId: 62, childId: 3, cacheKey: 'prose-pack', renderEngine: 'auto' },
        {
          ...alignedPayload,
          visualStory: {
            scenes: alignedPayload.visualStory.scenes.map((scene: any) => {
              const proseOnly = { ...scene };
              delete proseOnly.performance;
              delete proseOnly.sceneGraph;
              return proseOnly;
            }),
          },
        },
      );

      expect(videoAgent.generateViaAgent).toHaveBeenCalledTimes(1);
      expect(videoAgent.generateRemotionComposition).toHaveBeenCalledWith(
        expect.objectContaining({ topic: '认识动物老虎' }),
        expect.anything(),
        expect.any(Map),
      );
    });

    it('still runs the storyboard agent when pack scenes are off-topic', async () => {
      const videoAgent = createVideoAgent();
      const agentService = createAgentBackedService(videoAgent);
      remotionRender.renderGeneratedComposition.mockResolvedValue(undefined);
      jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined as any);
      jest.spyOn(fs, 'readFile').mockResolvedValue(Buffer.from('agent-video'));
      jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);

      await (agentService as any).generateVideoBuffer(
        { id: 41, contentId: 62, childId: 3, cacheKey: 'off-topic', renderEngine: 'auto' },
        {
          ...alignedPayload,
          visualStory: {
            scenes: [{ scene: '春天花园', narration: '春天来了，花开了。', onScreenText: '春天' }],
          },
        },
      );

      expect(videoAgent.generateViaAgent).toHaveBeenCalled();
    });

    it('falls back to the agent when aligned scenes have no narration at all', () => {
      const storyboard = (service as any).buildStoryboardFromPackScenes({
        ...alignedPayload,
        visualStory: {
          scenes: alignedPayload.visualStory.scenes.map((scene) => ({
            ...scene,
            narration: '',
          })),
        },
      });
      expect(storyboard).toBeNull();
    });

    it('synthesizes a storyboard from aligned watchScene.scenes when visualStory is empty', () => {
      const storyboard = (service as any).buildStoryboardFromPackScenes({
        topic: '认识动物老虎',
        domain: 'science',
        visualStory: {},
        watchScene: {
          scenes: [
            {
              title: '老虎登场',
              narration: '老虎有条纹。',
              durationSec: 99,
              sceneGraph: {
                relation: 'compare',
                nodes: [
                  { id: 'tiger', label: '老虎', subject: '老虎', role: 'subject' },
                  { id: 'stripe', label: '条纹', subject: '黑色条纹', role: 'object' },
                ],
              },
            },
          ],
        },
      });

      expect(storyboard).toMatchObject({
        topic: '认识动物老虎',
        sceneCount: 1,
        scenes: [
          expect.objectContaining({
            title: '老虎登场',
            durationSec: 30,
            sceneGraph: expect.objectContaining({ relation: 'compare' }),
          }),
        ],
      });
    });
  });

  it('claims the newest pending task first so the lesson being previewed renders next', async () => {
    taskRepo.findOne.mockResolvedValue(null);
    await (service as any).processNextTask();
    expect(taskRepo.findOne).toHaveBeenCalledWith({
      where: { status: 'pending' },
      order: { createdAt: 'DESC' },
    });
  });

  describe('restart checkpoint resume', () => {
    it('recovers interrupted processing tasks to pending instead of leaving zombies', async () => {
      const chain: any = {
        update: jest.fn(),
        set: jest.fn(),
        where: jest.fn(),
        execute: jest.fn().mockResolvedValue({ affected: 2 }),
      };
      chain.update.mockReturnValue(chain);
      chain.set.mockReturnValue(chain);
      chain.where.mockReturnValue(chain);
      (taskRepo as any).createQueryBuilder = jest.fn().mockReturnValue(chain);

      await (service as any).resetOrphanedProcessingTasks();

      expect(chain.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending', progress: 0 }),
      );
      // 超预算的僵尸也要复活：计数拉回预算线而非拒绝复活
      expect(typeof chain.set.mock.calls[0][0].attemptCount).toBe('function');
      const [whereSql] = chain.where.mock.calls[0];
      expect(whereSql).toContain("status = 'processing'");
      expect(whereSql).toContain('Server restarted during processing');
    });

    it('resumes from a persisted storyboard without rerunning the storyboard agent', async () => {
      const videoAgent = createVideoAgent();
      const agentService = createAgentBackedService(videoAgent);
      remotionRender.renderGeneratedComposition.mockResolvedValue(undefined);
      jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined as any);
      jest.spyOn(fs, 'readFile').mockResolvedValue(Buffer.from('resume-video'));
      jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);

      const result = await (agentService as any).generateVideoBuffer(
        { id: 42, contentId: 62, childId: 3, cacheKey: 'resume-cache', renderEngine: 'auto' },
        {
          topic: '认识动物老虎',
          ageGroup: '5-6',
          domain: 'science',
          __storyboard: {
            title: '认识动物老虎视频',
            topic: '认识动物老虎',
            scenes: [
              {
                sequence: 1,
                title: '老虎登场',
                narration: '老虎是大型猫科动物。',
                durationSec: 12,
              },
            ],
          },
        },
      );

      expect(videoAgent.generateViaAgent).not.toHaveBeenCalled();
      expect(videoAgent.generateRemotionComposition).toHaveBeenCalledWith(
        expect.objectContaining({ topic: '认识动物老虎' }),
        expect.anything(),
        expect.any(Map),
      );
      expect(result.buffer).toEqual(Buffer.from('resume-video'));
    });

    it('persists the agent storyboard into requestPayload as a resume checkpoint', async () => {
      const videoAgent = createVideoAgent();
      const agentService = createAgentBackedService(videoAgent);
      remotionRender.renderGeneratedComposition.mockResolvedValue(undefined);
      jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined as any);
      jest.spyOn(fs, 'readFile').mockResolvedValue(Buffer.from('video'));
      jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);

      await (agentService as any).generateVideoBuffer(
        { id: 43, contentId: 62, childId: 3, cacheKey: 'persist-cache', renderEngine: 'auto' },
        { topic: '认识动物老虎', ageGroup: '5-6', domain: 'science' },
      );

      expect(videoAgent.generateViaAgent).toHaveBeenCalled();
      expect(taskRepo.update).toHaveBeenCalledWith(
        43,
        expect.objectContaining({
          requestPayload: expect.objectContaining({
            __storyboard: expect.objectContaining({ topic: '认识动物老虎' }),
          }),
        }),
      );
    });

    it('writes the rendered agent storyboard back into quick-generated course content', async () => {
      const videoAgent = createVideoAgent();
      const agentService = createAgentBackedService(videoAgent);
      contentRepo.findOne.mockResolvedValue({
        id: 62,
        title: '认识老虎',
        subtitle: '',
        topic: '认识老虎',
        domain: 'language',
        ageRange: '5-6',
        content: { content: null, finishReason: 'length' },
      });
      remotionRender.renderGeneratedComposition.mockResolvedValue(undefined);
      jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined as any);
      jest.spyOn(fs, 'readFile').mockResolvedValue(Buffer.from('video'));
      jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);

      await (agentService as any).generateVideoBuffer(
        { id: 44, contentId: 62, childId: 3, cacheKey: 'content-cache', renderEngine: 'auto' },
        {
          topic: '认识动物老虎',
          ageGroup: '5-6',
          domain: 'science',
          __contentSource: 'quick_generate',
          __contentType: 'video_lesson',
        },
      );

      expect(contentRepo.update).toHaveBeenCalledWith(
        62,
        expect.objectContaining({
          title: '认识动物老虎视频',
          domain: 'science',
          content: expect.objectContaining({
            topic: '认识动物老虎',
            domain: 'science',
            generatedStoryboard: expect.objectContaining({ topic: '认识动物老虎' }),
            visualStory: expect.objectContaining({
              scenes: [
                expect.objectContaining({
                  scene: '老虎登场',
                  narration: '老虎是大型猫科动物，身上有黑色条纹。',
                }),
              ],
            }),
            videoLesson: expect.objectContaining({
              title: '认识动物老虎视频',
              shots: [
                expect.objectContaining({ narration: '老虎是大型猫科动物，身上有黑色条纹。' }),
              ],
            }),
          }),
        }),
      );
    });
  });

  describe('final QA release policy', () => {
    const originalQaGate = process.env.VIDEO_QA_GATE;
    const failedVerdict = {
      passed: false,
      score: 67,
      issues: [{ severity: 'blocker' }],
    } as any;

    afterEach(() => {
      if (originalQaGate === undefined) delete process.env.VIDEO_QA_GATE;
      else process.env.VIDEO_QA_GATE = originalQaGate;
    });

    it('blocks a failed final QA verdict by default', () => {
      delete process.env.VIDEO_QA_GATE;
      expect(() => (service as any).enforceQaGate(failedVerdict, 'dynamic-remotion')).toThrow(
        'dynamic-remotion QA failed: score=67',
      );
    });

    it('allows an explicit warn-only mode without silently changing the default', () => {
      process.env.VIDEO_QA_GATE = 'warn';
      expect(() => (service as any).enforceQaGate(failedVerdict, 'dynamic-remotion')).not.toThrow();
    });

    it('allows QA to be explicitly disabled', () => {
      process.env.VIDEO_QA_GATE = 'off';
      expect(() => (service as any).enforceQaGate(null, 'dynamic-remotion')).not.toThrow();
    });

    it('blocks a missing verdict when the gate is enabled', () => {
      delete process.env.VIDEO_QA_GATE;
      expect(() => (service as any).enforceQaGate(null, 'dynamic-remotion')).toThrow(
        'QA returned no verdict',
      );
    });

    it('releases a passing verdict', () => {
      delete process.env.VIDEO_QA_GATE;
      expect(() =>
        (service as any).enforceQaGate(
          { ...failedVerdict, passed: true, score: 90 },
          'dynamic-remotion',
        ),
      ).not.toThrow();
    });
  });

  it.each(['approved', 'pending_approval'])(
    'preserves %s approval status after rendering completes',
    async (approvalStatus) => {
      const task = {
        id: 45,
        contentId: 62,
        childId: 3,
        cacheKey: 'approval-cache',
        renderEngine: 'hyperframes',
        attemptCount: 1,
        approvalStatus,
        requestPayload: { topic: '认识老虎' },
      };
      taskRepo.findOne.mockResolvedValueOnce(task).mockResolvedValueOnce(task);
      const chain: any = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      (taskRepo as any).createQueryBuilder = jest.fn().mockReturnValue(chain);
      jest
        .spyOn(service as any, 'generateVideoBuffer')
        .mockResolvedValue({ buffer: Buffer.from('video') });
      jest
        .spyOn(service as any, 'writeVideoToCache')
        .mockResolvedValue('storage/lesson-videos/approval-cache.mp4');

      await (service as any).processNextTask();

      expect(taskRepo.update).toHaveBeenCalledWith(
        45,
        expect.objectContaining({ status: 'completed', approvalStatus }),
      );
    },
  );

  /**
   * 单实例闸门。这两个用例对应真实事故：`nest start --watch` 留下了旧进程，
   * 新进程拿不到 3001 却已经跑完 OnModuleInit —— 定时器在跑、僵尸任务被复位、
   * 任务被标成 processing，然后进程带着任务消失，页面永远停在 0%。
   */
  describe('单实例闸门', () => {
    afterEach(() => {
      // 恢复"单测默认视为唯一实例"，避免影响同文件里的其他用例
      announcePortOwner(3001);
    });

    it('没有端口归属时一个任务都不认领', async () => {
      markWorkerInactive();
      taskRepo.findOne.mockClear();

      await (service as any).processNextTask();

      expect(taskRepo.findOne).not.toHaveBeenCalled();
    });

    it('OnModuleInit 不立刻复位僵尸任务，要等端口归属信号', () => {
      markWorkerInactive();
      const reset = jest
        .spyOn(service as any, 'resetOrphanedProcessingTasks')
        .mockResolvedValue(undefined);
      const diagnostics = jest
        .spyOn(service as any, 'logEnvironmentDiagnostics')
        .mockResolvedValue(undefined);

      service.onModuleInit();
      // 端口还没到手：此时复位会把别的进程正在渲染的任务打回 pending
      expect(reset).not.toHaveBeenCalled();
      expect(diagnostics).not.toHaveBeenCalled();

      announcePortOwner(3001);
      expect(reset).toHaveBeenCalledTimes(1);
      expect(diagnostics).toHaveBeenCalledTimes(1);

      service.onModuleDestroy();
      expect(isWorkerActive()).toBe(false);
    });
  });
});
