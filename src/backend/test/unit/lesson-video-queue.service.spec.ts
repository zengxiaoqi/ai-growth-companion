import { promises as fs } from 'fs';
import { LessonVideoQueueService } from '../../src/modules/learning/lesson-video-queue.service';

describe('LessonVideoQueueService', () => {
  let service: LessonVideoQueueService;
  let taskRepo: { update: jest.Mock };
  let remotionRender: { resolveComposition: jest.Mock; renderComposition: jest.Mock; cleanupNarrationFiles: jest.Mock };

  beforeEach(() => {
    taskRepo = {
      update: jest.fn().mockResolvedValue(undefined),
    };

    remotionRender = {
      resolveComposition: jest.fn(),
      renderComposition: jest.fn(),
      cleanupNarrationFiles: jest.fn().mockResolvedValue(undefined),
    };

    service = new LessonVideoQueueService(
      taskRepo as any,
      {} as any,
      {} as any,
      remotionRender as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
      content: {
        type: 'structured_lesson',
        topic: '四季变化',
        ageGroup: '5-6',
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
      summary: '先认识四季，再观察变化',
      ageGroup: '5-6',
      watchScene,
      visualStory,
      videoLesson,
    });
  });

  it('preserves supplemental lesson modules in remotion payload', () => {
    const listening = {
      goal: '听听动物叫声',
      audioScript: [{ segment: '猫叫', narration: '小猫喵喵叫。' }],
      questions: ['谁在叫？'],
    };
    const reading = {
      goal: '读读动物名称',
      text: '小猫和小狗都是动物。',
      keywords: ['小猫', '小狗'],
      questions: ['你认识哪一种动物？'],
    };
    const writing = {
      goal: '写一写小猫',
      tracingItems: ['猫'],
      practiceTasks: ['描一描“猫”字'],
    };
    const game = {
      activityType: 'matching',
      activityData: {
        title: '动物配对',
        pairs: [{ left: '猫', right: '小猫' }],
      },
    };
    const quiz = {
      title: '动物小测验',
      questions: [{ question: '哪一种会喵喵叫？' }],
    };

    const payload = (service as any).buildPackPayloadFromContent({
      id: 13,
      title: '动物观察课程',
      subtitle: '课程总结',
      topic: '认识动物',
      ageRange: '3-4',
      content: {
        type: 'structured_lesson',
        topic: '认识动物',
        ageGroup: '3-4',
        summary: '先观察，再练习，再测一测',
        steps: [
          { id: 'listen', module: { type: 'audio', listening } },
          { id: 'read', module: { type: 'reading', reading } },
          { id: 'write', module: { type: 'writing', writing } },
          { id: 'practice', module: { type: 'game', game } },
          { id: 'assess', module: { type: 'quiz', quiz } },
        ],
      },
    } as any);

    expect(payload.modules).toMatchObject({
      listening,
      reading,
      writing,
      game,
      quiz,
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
    remotionRender.renderComposition.mockImplementation(async (_id, _props, _outputPath, onProgress) => {
      if (onProgress) {
        await onProgress(42);
      }
    });

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
});
