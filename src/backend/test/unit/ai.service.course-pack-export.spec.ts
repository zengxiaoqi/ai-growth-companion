import * as JSZip from "jszip";
import { AiService } from "../../src/modules/ai/ai.service";

describe("AiService course pack export", () => {
  const agentExecutor = {
    classifyAge: jest.fn(),
  };
  const usersService = {
    canAccessChild: jest.fn(),
    findById: jest.fn(),
  };

  const learningArchiveService = {
    getStudyPlanById: jest.fn(),
    getStudyPlanVersions: jest.fn(),
    createStudyPlanRecord: jest.fn(),
    updateStudyPlanRecord: jest.fn(),
  };
  const llmConfig = {
    isConfigured: false,
  };
  const llmClient = {
    generate: jest.fn(),
  };
  const generateCoursePackTool = {
    execute: jest.fn(),
    ensureTeachingMediaPack: jest.fn(),
  };

  let service: AiService;

  beforeEach(() => {
    jest.resetAllMocks();
    agentExecutor.classifyAge.mockReturnValue("5-6");
    usersService.canAccessChild.mockResolvedValue(true);
    usersService.findById.mockResolvedValue({ id: 22, age: 5, name: "Kid" });
    learningArchiveService.updateStudyPlanRecord.mockResolvedValue(null);
    generateCoursePackTool.ensureTeachingMediaPack.mockImplementation(
      (pack: any) => pack,
    );

    service = new AiService(
      agentExecutor as any,
      {} as any,
      {} as any,
      usersService as any,
      learningArchiveService as any,
      llmConfig as any,
      llmClient as any,
      generateCoursePackTool as any,
    );
  });

  const mockCoursePackRow = () => ({
    id: 11,
    childId: 22,
    sourceType: "ai_course_pack",
    title: "Chinese Lesson",
    planContent: {
      title: "Chinese Lesson",
      videoLesson: {
        shots: [
          {
            shot: "1",
            caption: "Sun Moon Mountains Rivers",
            captionEn: "Sun Moon Mountains Rivers",
            durationSec: 2,
          },
          {
            shot: "2",
            caption: "Learn together",
            durationSec: 2,
          },
        ],
      },
    },
  });

  it("exports bilingual subtitle srt and falls back to same text when EN is missing", async () => {
    learningArchiveService.getStudyPlanById.mockResolvedValue(
      mockCoursePackRow(),
    );

    const exported = await service.exportCoursePack({
      viewerId: 1,
      viewerType: "parent",
      id: 11,
      format: "subtitle_srt_bilingual",
    });

    expect(exported.filename).toBe("Chinese-Lesson-subtitle-bilingual.srt");
    expect(exported.mimeType).toContain("application/x-subrip");
    expect(String(exported.body)).toContain(
      "Sun Moon Mountains Rivers\nSun Moon Mountains Rivers",
    );
    expect(String(exported.body)).toContain("Learn together\nLearn together");
  });

  it("includes bilingual subtitle file inside bundle zip", async () => {
    learningArchiveService.getStudyPlanById.mockResolvedValue(
      mockCoursePackRow(),
    );

    const exported = await service.exportCoursePack({
      viewerId: 1,
      viewerType: "parent",
      id: 11,
      format: "bundle_zip",
    });

    expect(exported.filename).toBe("Chinese-Lesson-bundle.zip");
    expect(Buffer.isBuffer(exported.body)).toBe(true);

    const zip = await JSZip.loadAsync(exported.body as Buffer);
    const names = Object.keys(zip.files);
    const bilingualName = names.find((n) =>
      n.endsWith("-subtitle-bilingual.srt"),
    );
    expect(bilingualName).toBeTruthy();

    const content = await zip.file(bilingualName as string)?.async("string");
    expect(content).toContain(
      "Sun Moon Mountains Rivers\nSun Moon Mountains Rivers",
    );
  });

  it("expands generic literacy packs into per-character teaching narration before export", async () => {
    learningArchiveService.getStudyPlanById.mockResolvedValue({
      id: 41,
      childId: 22,
      sourceType: "ai_course_pack",
      title: "识字课",
      planContent: {
        title: "识字课",
        topic: "认识汉字：天、地、人",
        ageGroup: "5-6",
        videoLesson: {
          shots: [
            { shot: "1", caption: "认识汉字：天、地、人", durationSec: 6 },
          ],
        },
      },
    });
    generateCoursePackTool.ensureTeachingMediaPack.mockImplementation(
      (pack: any) => ({
        ...pack,
        videoLesson: {
          ...(pack.videoLesson || {}),
          shots: [
            {
              shot: "天字讲解",
              caption: "天字讲解",
              narration: "先来认识天字，它表示天空。",
              durationSec: 6,
            },
            {
              shot: "地字讲解",
              caption: "地字讲解",
              narration: "再来认识地字，它表示大地。",
              durationSec: 6,
            },
            {
              shot: "人字讲解",
              caption: "人字讲解",
              narration: "最后认识人字，它像一个人站立。",
              durationSec: 6,
            },
          ],
        },
        visualStory: {
          scenes: [
            {
              scene: "天字讲解",
              onScreenText: "天字讲解",
              narration: "先来认识天字，它表示天空。",
              durationSec: 6,
            },
            {
              scene: "地字讲解",
              onScreenText: "地字讲解",
              narration: "再来认识地字，它表示大地。",
              durationSec: 6,
            },
            {
              scene: "人字讲解",
              onScreenText: "人字讲解",
              narration: "最后认识人字，它像一个人站立。",
              durationSec: 6,
            },
          ],
        },
        modules: {
          listening: {
            audioScript: [
              {
                segment: "天",
                narration: "先来认识天字，它表示天空。",
                durationSec: 6,
              },
              {
                segment: "地",
                narration: "再来认识地字，它表示大地。",
                durationSec: 6,
              },
              {
                segment: "人",
                narration: "最后认识人字，它像一个人站立。",
                durationSec: 6,
              },
            ],
          },
        },
      }),
    );

    const exported = await service.exportCoursePack({
      viewerId: 1,
      viewerType: "parent",
      id: 41,
      format: "subtitle_srt",
    });

    expect(generateCoursePackTool.ensureTeachingMediaPack).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: "认识汉字：天、地、人",
      }),
    );
    expect(String(exported.body)).toContain("天字讲解");
    expect(String(exported.body)).toContain("地字讲解");
    expect(String(exported.body)).toContain("人字讲解");
  });

  it("exports enriched capcut payload with transitions, tracks, and edit plan", async () => {
    learningArchiveService.getStudyPlanById.mockResolvedValue({
      id: 12,
      childId: 22,
      sourceType: "ai_course_pack",
      title: "Math Video",
      planContent: {
        title: "Math Video",
        topic: "Addition",
        ageGroup: "5-6",
        videoLesson: {
          renderGuide: {
            voiceStyle: "warm teacher",
            musicStyle: "light piano",
          },
          shots: [
            {
              shot: "Opening",
              visualPrompt: "opening board",
              narration: "Let us start",
              caption: "Start",
              durationSec: 4,
            },
            {
              shot: "Practice",
              visualPrompt: "kids counting apples",
              narration: "Now try this one",
              caption: "Try now",
              durationSec: 6,
            },
          ],
        },
      },
    });

    const exported = await service.exportCoursePack({
      viewerId: 1,
      viewerType: "parent",
      id: 12,
      format: "capcut_json",
    });

    const payload = JSON.parse(String(exported.body));
    expect(payload.version).toBe("1.1");
    expect(payload.timeline).toHaveLength(2);
    expect(payload.timeline[0]).toEqual(
      expect.objectContaining({
        startSec: 0,
        endSec: 4,
        pauseAfterSec: expect.any(Number),
      }),
    );
    expect(payload.timeline[0].transitionToNext?.type).toBeTruthy();
    expect(payload.timeline[1].transitionToNext?.type).toBe("none");
    expect(payload.tracks?.voiceOver?.trackId).toBe("voice-main");
    expect(payload.tracks?.voiceOver?.segments).toHaveLength(2);
    expect(payload.tracks?.backgroundMusic?.preset).toBe("light piano");
    expect(Array.isArray(payload.editPlan?.pausePointsSec)).toBe(true);
    expect(Array.isArray(payload.editPlan?.beatPointsSec)).toBe(true);
    expect(payload.totalDurationSec).toBe(10);
  });

  it("exports multiple records into one batch zip with manifest", async () => {
    learningArchiveService.getStudyPlanById.mockImplementation(
      async (id: number) => {
        if (id === 11) return mockCoursePackRow();
        if (id === 12) {
          return {
            id: 12,
            childId: 22,
            sourceType: "ai_course_pack",
            title: "Math Video",
            planContent: {
              title: "Math Video",
              videoLesson: {
                shots: [
                  { shot: "1", caption: "One plus one", durationSec: 2 },
                  { shot: "2", caption: "Equals two", durationSec: 2 },
                ],
              },
            },
          };
        }
        return null;
      },
    );

    const exported = await service.exportCoursePacksBatch({
      viewerId: 1,
      viewerType: "parent",
      ids: [11, 12, 999],
      formats: ["capcut_json", "subtitle_srt_bilingual"],
    });

    expect(exported.mimeType).toBe("application/zip");
    expect(exported.filename.startsWith("course-pack-batch-")).toBe(true);
    expect(exported.filename.endsWith(".zip")).toBe(true);

    const zip = await JSZip.loadAsync(exported.body as Buffer);
    const names = Object.keys(zip.files);
    expect(
      names.some((n) =>
        n.includes("Chinese-Lesson-11/Chinese-Lesson-capcut.json"),
      ),
    ).toBe(true);
    expect(
      names.some((n) =>
        n.includes("Chinese-Lesson-11/Chinese-Lesson-subtitle-bilingual.srt"),
      ),
    ).toBe(true);
    expect(
      names.some((n) => n.includes("Math-Video-12/Math-Video-capcut.json")),
    ).toBe(true);
    expect(
      names.some((n) =>
        n.includes("Math-Video-12/Math-Video-subtitle-bilingual.srt"),
      ),
    ).toBe(true);

    const readme = await zip.file("README.txt")?.async("string");
    expect(readme).toContain("Requested IDs: 11, 12, 999");
    expect(readme).toContain("- #999: skipped (not found)");
  });

  it("saves edited course pack as a new version record", async () => {
    learningArchiveService.getStudyPlanById.mockResolvedValue({
      id: 31,
      childId: 22,
      parentId: 1,
      sourceType: "ai_course_pack",
      sourceId: 31,
      title: "Chinese Lesson",
      planContent: { title: "Chinese Lesson", summary: "old" },
      sessionId: "s-1",
    });
    learningArchiveService.getStudyPlanVersions.mockResolvedValue({
      list: [{ id: 31 }],
      total: 1,
      page: 1,
      limit: 20,
    });
    learningArchiveService.createStudyPlanRecord.mockResolvedValue({
      id: 32,
    });

    const result = await service.saveCoursePackVersion({
      viewerId: 1,
      viewerType: "parent",
      id: 31,
      note: "manual_edit",
      planContent: { title: "Chinese Lesson", summary: "new summary" },
    });

    expect(result.coursePackRecordId).toBe(32);
    expect(result.versionNumber).toBe(2);
    expect(result.rootSourceId).toBe(31);
    expect(learningArchiveService.createStudyPlanRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        childId: 22,
        sourceType: "ai_course_pack",
        sourceId: 31,
      }),
    );
  });

  it("enriches bilingual fields and returns preview when saveAsVersion is false", async () => {
    learningArchiveService.getStudyPlanById.mockResolvedValue({
      id: 41,
      childId: 22,
      sourceType: "ai_course_pack",
      title: "Lesson",
      planContent: {
        title: "中文标题",
        videoLesson: {
          shots: [{ caption: "你好", durationSec: 2 }],
        },
      },
    });

    const result = await service.enrichCoursePackBilingual({
      viewerId: 1,
      viewerType: "parent",
      id: 41,
      saveAsVersion: false,
    });

    expect(result.saved).toBe(false);
    expect(result.titleEn).toBe("中文标题");
    expect(result.videoLesson.shots[0].captionEn).toBe("你好");
  });

  it("generates weekly plan with multiple saved course packs", async () => {
    generateCoursePackTool.execute.mockResolvedValue(
      JSON.stringify({
        title: "Daily Pack",
        summary: "lesson",
      }),
    );
    let recordSeed = 100;
    learningArchiveService.createStudyPlanRecord.mockImplementation(
      async () => ({
        id: ++recordSeed,
      }),
    );

    const result = await service.generateWeeklyCoursePacks({
      viewerId: 1,
      viewerType: "parent",
      topic: "汉字启蒙",
      childId: 22,
      days: 3,
      focus: "literacy",
      includeGame: true,
      includeAudio: true,
      includeVideo: true,
    });

    expect(result.type).toBe("weekly_course_plan");
    expect(result.days).toBe(3);
    expect(result.items).toHaveLength(3);
    expect(result.items.every((item: any) => item.saved === true)).toBe(true);
    expect(learningArchiveService.createStudyPlanRecord).toHaveBeenCalledTimes(
      3,
    );
  });

  it("builds TTS narration without cue labels and promotes subtitle text over generic shot names", async () => {
    const voiceService = {
      textToSpeech: jest.fn().mockResolvedValue(Buffer.from("mp3")),
    };
    const serviceWithVoice = new AiService(
      agentExecutor as any,
      {} as any,
      {} as any,
      usersService as any,
      learningArchiveService as any,
      llmConfig as any,
      llmClient as any,
      generateCoursePackTool as any,
      voiceService as any,
    );

    const pack = {
      videoLesson: {
        shots: [
          {
            shot: "Practice",
            caption: "练习数字",
            narration: "现在请你一起练习数字十到二十。",
            durationSec: 12,
          },
        ],
      },
    };

    await (serviceWithVoice as any).buildNarrationMp3(pack);

    expect(voiceService.textToSpeech).toHaveBeenCalledTimes(1);
    const [ttsText, ttsVoice] = voiceService.textToSpeech.mock.calls[0];
    expect(ttsVoice).toBe("zh-CN-XiaoxiaoNeural");
    expect(ttsText).toContain("现在请你一起练习数字十到二十。");
    expect(ttsText).not.toMatch(/Shot|Scene|Audio|\(12s\)|Practice/);

    const segments = (serviceWithVoice as any).collectStoryboardVideoSegments(
      pack,
    );
    expect(segments[0].headline).toBe("练习数字");
    expect(segments[0].subtitle).toBe("练习数字");
  });
});
