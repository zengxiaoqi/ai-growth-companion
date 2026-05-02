import { promises as fs } from "fs";
import { LessonVideoQueueService } from "../../src/modules/learning/lesson-video-queue.service";

describe("LessonVideoQueueService", () => {
  let service: LessonVideoQueueService;
  let taskRepo: { update: jest.Mock; findOne: jest.Mock; save: jest.Mock };
  let aiService: { renderTeachingVideoFromPack: jest.Mock };
  let remotionRender: {
    resolveComposition: jest.Mock;
    renderComposition: jest.Mock;
    cleanupNarrationFiles: jest.Mock;
  };
  let hyperframesRender: {
    renderLessonVideo: jest.Mock;
  };

  beforeEach(() => {
    taskRepo = {
      update: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation(async (x) => x),
    };

    aiService = {
      renderTeachingVideoFromPack: jest.fn().mockResolvedValue(null),
    };

    remotionRender = {
      resolveComposition: jest.fn(),
      renderComposition: jest.fn(),
      cleanupNarrationFiles: jest.fn().mockResolvedValue(undefined),
    };

    hyperframesRender = {
      renderLessonVideo: jest.fn(),
    };

    service = new LessonVideoQueueService(
      taskRepo as any,
      {} as any,
      aiService as any,
      remotionRender as any,
      hyperframesRender as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("builds remotion payload from structured lesson watch content", () => {
    const watchScene = {
      version: 1,
      stepType: "watch",
      mode: "playback",
      scenes: [{ id: "watch-1", title: "春天", narration: "看看春天。" }],
    };
    const visualStory = {
      scenes: [
        { scene: "春天", narration: "春天来了。", onScreenText: "春天" },
      ],
    };
    const videoLesson = {
      title: "四季视频",
      shots: [{ shot: "春天", narration: "春天来了。", caption: "春天" }],
    };

    const payload = (service as any).buildPackPayloadFromContent({
      id: 12,
      title: "四季变化课程",
      subtitle: "课程总结",
      topic: "四季变化",
      ageRange: "5-6",
      content: {
        type: "structured_lesson",
        topic: "四季变化",
        ageGroup: "5-6",
        summary: "先认识四季，再观察变化",
        steps: [
          {
            id: "watch",
            module: {
              type: "video",
              scene: watchScene,
              visualStory,
              videoLesson,
            },
          },
        ],
      },
    });

    expect(payload).toMatchObject({
      title: "四季变化课程",
      topic: "四季变化",
      summary: "先认识四季，再观察变化",
      ageGroup: "5-6",
      watchScene,
      visualStory,
      videoLesson,
    });
  });

  it("passes lesson-derived payload into remotion composition resolution", async () => {
    const payload = {
      topic: "认识动物",
      ageGroup: "3-4",
      title: "动物观察课",
      summary: "观察小动物",
      watchScene: {
        scenes: [{ id: "watch-1", title: "小猫", narration: "这是小猫。" }],
      },
      visualStory: {},
      videoLesson: {},
    };

    remotionRender.resolveComposition.mockResolvedValue({
      compositionId: "TopicVideo",
      inputProps: { title: "认识动物", slides: [] },
    });
    remotionRender.renderComposition.mockImplementation(
      async (_id, _props, _outputPath, onProgress) => {
        if (onProgress) {
          await onProgress(42);
        }
      },
    );

    jest.spyOn(fs, "mkdir").mockResolvedValue(undefined as any);
    jest.spyOn(fs, "readFile").mockResolvedValue(Buffer.from("video"));
    jest.spyOn(fs, "unlink").mockResolvedValue(undefined);

    const buffer = await (service as any).generateByRemotion(
      { id: 7, cacheKey: "cache-key" },
      payload,
    );

    expect(remotionRender.resolveComposition).toHaveBeenCalledWith(
      payload,
      "3-4",
    );
    expect(remotionRender.renderComposition).toHaveBeenCalled();
    expect(taskRepo.update).toHaveBeenCalledWith(7, { progress: 42 });
    expect(buffer).toEqual(Buffer.from("video"));
  });

  it("keeps watchScene in generic provider payload fallback", () => {
    const payload = {
      title: "动物观察课",
      topic: "认识动物",
      summary: "观察小动物",
      watchScene: {
        scenes: [{ id: "watch-1", title: "小猫", narration: "这是小猫。" }],
      },
      visualStory: {},
      videoLesson: {},
      modules: {},
    };

    const originalMode = process.env.VIDEO_PROVIDER_CREATE_BODY_MODE;
    delete process.env.VIDEO_PROVIDER_CREATE_BODY_MODE;

    const body = (service as any).buildProviderCreateBody(
      { contentId: 11, childId: 22, cacheKey: "cache-key" },
      payload,
    );

    if (originalMode === undefined) {
      delete process.env.VIDEO_PROVIDER_CREATE_BODY_MODE;
    } else {
      process.env.VIDEO_PROVIDER_CREATE_BODY_MODE = originalMode;
    }

    expect(body).toMatchObject({
      title: "动物观察课",
      topic: "认识动物",
      summary: "观察小动物",
      watchScene: payload.watchScene,
    });
  });

  it("routes auto engine to hyperframes first and falls back to remotion", async () => {
    hyperframesRender.renderLessonVideo.mockRejectedValueOnce(
      new Error("hyperframes failed"),
    );
    remotionRender.resolveComposition.mockResolvedValue({
      compositionId: "TopicVideo",
      inputProps: { title: "认识动物", slides: [] },
    });
    remotionRender.renderComposition.mockResolvedValue(undefined);

    jest.spyOn(fs, "mkdir").mockResolvedValue(undefined as any);
    jest.spyOn(fs, "readFile").mockResolvedValue(Buffer.from("video"));
    jest.spyOn(fs, "unlink").mockResolvedValue(undefined);

    const result = await (service as any).generateVideoBuffer(
      { id: 9, cacheKey: "cache-key", renderEngine: "auto" },
      { topic: "认识动物", ageGroup: "3-4", videoLesson: { shots: [] } },
    );

    expect(hyperframesRender.renderLessonVideo).toHaveBeenCalled();
    expect(remotionRender.resolveComposition).toHaveBeenCalled();
    expect(result.buffer).toEqual(Buffer.from("video"));
  });

  it("uses remotion only when renderEngine is remotion", async () => {
    remotionRender.resolveComposition.mockResolvedValue({
      compositionId: "TopicVideo",
      inputProps: { title: "认识动物", slides: [] },
    });
    remotionRender.renderComposition.mockResolvedValue(undefined);

    jest.spyOn(fs, "mkdir").mockResolvedValue(undefined as any);
    jest.spyOn(fs, "readFile").mockResolvedValue(Buffer.from("video-remotion"));
    jest.spyOn(fs, "unlink").mockResolvedValue(undefined);

    const result = await (service as any).generateVideoBuffer(
      { id: 10, cacheKey: "cache-key", renderEngine: "remotion" },
      { topic: "认识动物", ageGroup: "5-6" },
    );

    expect(hyperframesRender.renderLessonVideo).not.toHaveBeenCalled();
    expect(remotionRender.resolveComposition).toHaveBeenCalled();
    expect(result.buffer).toEqual(Buffer.from("video-remotion"));
  });

  it("uses hyperframes only when renderEngine is hyperframes", async () => {
    hyperframesRender.renderLessonVideo.mockResolvedValue(
      Buffer.from("video-hf"),
    );

    const result = await (service as any).generateVideoBuffer(
      { id: 11, cacheKey: "cache-key", renderEngine: "hyperframes" },
      { topic: "认识动物", ageGroup: "5-6" },
    );

    expect(hyperframesRender.renderLessonVideo).toHaveBeenCalled();
    expect(remotionRender.resolveComposition).not.toHaveBeenCalled();
    expect(result.buffer).toEqual(Buffer.from("video-hf"));
  });
});
