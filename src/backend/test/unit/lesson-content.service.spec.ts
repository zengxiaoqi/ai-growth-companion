import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Content } from "../../src/database/entities/content.entity";
import { Assignment } from "../../src/database/entities/assignment.entity";
import { LearningRecord } from "../../src/database/entities/learning-record.entity";
import { StudyPlanRecord } from "../../src/database/entities/study-plan-record.entity";
import { LessonContentService } from "../../src/modules/learning/lesson-content.service";
import { ContentsService } from "../../src/modules/contents/contents.service";
import { GenerateCoursePackTool } from "../../src/modules/ai/agent/tools/generate-course-pack";
import { GenerateActivityTool } from "../../src/modules/ai/agent/tools/generate-activity";
import { AiService } from "../../src/modules/ai/ai.service";
import { AssignmentService } from "../../src/modules/assignment/assignment.service";
import { LearningTrackerService } from "../../src/modules/learning/learning-tracker.service";
import { LlmClientService } from "../../src/agent-framework/llm/llm-client.service";

describe("LessonContentService modifyDraft scene sync", () => {
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
      ],
    }).compile();

    service = module.get(LessonContentService);
  });

  it("returns child draft lessons ordered by newest first", async () => {
    const builder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          id: 12,
          title: "新草稿",
          subtitle: "新内容",
          domain: "science",
          status: "draft",
          contentType: "structured_lesson",
          createdAt: new Date("2026-04-09T09:00:00.000Z"),
          updatedAt: new Date("2026-04-09T09:15:00.000Z"),
        },
        {
          id: 8,
          title: "旧草稿",
          subtitle: "旧内容",
          domain: "language",
          status: "generating",
          contentType: "structured_lesson",
          createdAt: new Date("2026-04-08T10:00:00.000Z"),
          updatedAt: new Date("2026-04-08T10:30:00.000Z"),
        },
      ]),
    };
    contentRepo.createQueryBuilder = jest.fn().mockReturnValue(builder);

    const result = await service.listDraftLessonsForChild(22);

    expect(contentRepo.createQueryBuilder).toHaveBeenCalledWith("content");
    expect(builder.where).toHaveBeenCalledWith("content.childId = :childId", {
      childId: 22,
    });
    expect(builder.andWhere).toHaveBeenCalledWith(
      "content.status IN (:...statuses)",
      { statuses: ["draft", "generating"] },
    );
    expect(builder.andWhere).toHaveBeenCalledWith(
      "content.contentType = :contentType",
      { contentType: "structured_lesson" },
    );
    expect(builder.orderBy).toHaveBeenCalledWith("content.createdAt", "DESC");
    expect(result).toEqual([
      {
        id: 12,
        title: "新草稿",
        subtitle: "新内容",
        domain: "science",
        status: "draft",
        contentType: "structured_lesson",
        childId: 22,
        createdAt: "2026-04-09T09:00:00.000Z",
        updatedAt: "2026-04-09T09:15:00.000Z",
      },
      {
        id: 8,
        title: "旧草稿",
        subtitle: "旧内容",
        domain: "language",
        status: "generating",
        contentType: "structured_lesson",
        childId: 22,
        createdAt: "2026-04-08T10:00:00.000Z",
        updatedAt: "2026-04-08T10:30:00.000Z",
      },
    ]);
  });

  it("returns only drafts linked to the requested child record set", async () => {
    const builder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          id: 12,
          title: "目标孩子草稿",
          subtitle: "新内容",
          domain: "science",
          status: "draft",
          contentType: "structured_lesson",
          createdAt: new Date("2026-04-09T09:00:00.000Z"),
          updatedAt: new Date("2026-04-09T09:15:00.000Z"),
        },
      ]),
    };
    contentRepo.createQueryBuilder = jest.fn().mockReturnValue(builder);

    const result = await service.listDraftLessonsForChild(22);

    expect(contentRepo.createQueryBuilder).toHaveBeenCalledWith("content");
    expect(builder.select).toHaveBeenCalled();
    expect(builder.where).toHaveBeenCalledWith("content.childId = :childId", {
      childId: 22,
    });
    expect(builder.andWhere).toHaveBeenCalledWith(
      "content.status IN (:...statuses)",
      { statuses: ["draft", "generating"] },
    );
    expect(builder.andWhere).toHaveBeenCalledWith(
      "content.contentType = :contentType",
      { contentType: "structured_lesson" },
    );
    expect(builder.orderBy).toHaveBeenCalledWith("content.createdAt", "DESC");
    expect(result).toEqual([
      {
        id: 12,
        title: "目标孩子草稿",
        subtitle: "新内容",
        domain: "science",
        status: "draft",
        contentType: "structured_lesson",
        childId: 22,
        createdAt: "2026-04-09T09:00:00.000Z",
        updatedAt: "2026-04-09T09:15:00.000Z",
      },
    ]);
  });

  it("re-derives watch scene when parent edit changes legacy watch content but llm leaves stale scene behind", async () => {
    const lesson = {
      type: "structured_lesson",
      version: 1,
      topic: "四季变化",
      ageGroup: "5-6",
      summary: "原始总结",
      outcomes: ["观察季节"],
      sourceCoursePackId: null,
      generatedAt: "2026-04-09T00:00:00.000Z",
      parentGuide: {
        beforeClass: [],
        duringClass: [],
        afterClass: [],
      },
      steps: [
        {
          id: "watch",
          label: "看",
          icon: "eye",
          order: 1,
          module: {
            type: "video",
            scene: {
              version: 1,
              stepType: "watch",
              mode: "playback",
              scenes: [
                {
                  id: "watch-scene-1",
                  title: "旧场景",
                  narration: "旧旁白",
                  durationSec: 10,
                },
              ],
            },
            visualStory: {
              scenes: [
                {
                  scene: "旧场景",
                  narration: "旧旁白",
                  onScreenText: "旧字幕",
                  durationSec: 10,
                },
              ],
            },
            videoLesson: { shots: [] },
          },
        },
        {
          id: "write",
          label: "写",
          icon: "pen",
          order: 4,
          module: {
            type: "writing",
            writing: {
              tracingItems: ["春"],
              practiceTasks: ["描一描"],
            },
          },
        },
      ],
    };

    contentRepo.findOne.mockResolvedValue({
      id: 99,
      status: "draft",
      title: "四季变化 全方位学习课",
      subtitle: "原始总结",
      content: lesson,
    });

    llmClient.generate.mockResolvedValueOnce(
      JSON.stringify({
        summary: "加入更多四季观察内容",
        steps: [
          {
            id: "watch",
            module: {
              type: "video",
              scene: lesson.steps[0].module.scene,
              visualStory: {
                scenes: [
                  {
                    scene: "四季观察",
                    narration: "春夏秋冬会带来不同的景色",
                    onScreenText: "四季观察",
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

    const saved = await service.modifyDraft(
      99,
      1,
      "把看这一部分改得更贴近四季观察",
    );
    const watchStep = (saved.content as any).steps.find(
      (step: any) => step.id === "watch",
    );

    expect(watchStep.module.scene.scenes[0].title).toBe("四季观察");
    expect(watchStep.module.scene.scenes[0].narration).toContain("春夏秋冬");
    expect(saved.subtitle).toBe("加入更多四季观察内容");
  });

  it("keeps explicit edited scene when parent modification directly changes scene payload", async () => {
    const lesson = {
      type: "structured_lesson",
      version: 1,
      topic: "数字 1-5",
      ageGroup: "5-6",
      summary: "原始总结",
      outcomes: ["认识数字"],
      sourceCoursePackId: null,
      generatedAt: "2026-04-09T00:00:00.000Z",
      parentGuide: {
        beforeClass: [],
        duringClass: [],
        afterClass: [],
      },
      steps: [
        {
          id: "write",
          label: "写",
          icon: "pen",
          order: 4,
          module: {
            type: "writing",
            scene: {
              version: 1,
              stepType: "write",
              mode: "guided_trace",
              scenes: [
                {
                  id: "write-scene-1",
                  title: "描一描 1",
                  narration: "沿着虚线描一描 1",
                  durationSec: 20,
                  interaction: {
                    type: "trace_path",
                    targets: [
                      { id: "trace-1", label: "1", kind: "glyph", text: "1" },
                    ],
                  },
                },
              ],
            },
            writing: {
              tracingItems: ["1"],
              practiceTasks: ["描一描"],
            },
          },
        },
      ],
    };

    contentRepo.findOne.mockResolvedValue({
      id: 100,
      status: "draft",
      title: "数字 1-5 全方位学习课",
      subtitle: "原始总结",
      content: lesson,
    });

    llmClient.generate.mockResolvedValueOnce(
      JSON.stringify({
        steps: [
          {
            id: "write",
            module: {
              type: "writing",
              scene: {
                version: 1,
                stepType: "write",
                mode: "guided_trace",
                scenes: [
                  {
                    id: "write-scene-1",
                    title: "描一描数字 1",
                    narration: "跟着新的提示描一描数字 1",
                    durationSec: 20,
                    interaction: {
                      type: "trace_path",
                      targets: [
                        {
                          id: "trace-1",
                          label: "1",
                          kind: "glyph",
                          text: "1",
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

    const saved = await service.modifyDraft(100, 1, "把描红提示换成更鼓励式");
    const writeStep = (saved.content as any).steps.find(
      (step: any) => step.id === "write",
    );

    expect(writeStep.module.scene.scenes[0].title).toBe("描一描数字 1");
    expect(writeStep.module.scene.scenes[0].narration).toContain("新的提示");
    expect(
      writeStep.module.scene.scenes[0].interaction.targets[0].fontSize,
    ).toBe(90);
  });
  it("includes target step context in the llm prompt for step-scoped edits", async () => {
    const lesson = {
      type: "structured_lesson",
      version: 1,
      topic: "鍔ㄧ墿瑙傚療",
      ageGroup: "5-6",
      summary: "鍘熷鎬荤粨",
      outcomes: ["瑙傚療鍔ㄧ墿"],
      sourceCoursePackId: null,
      generatedAt: "2026-04-09T00:00:00.000Z",
      parentGuide: {
        beforeClass: [],
        duringClass: [],
        afterClass: [],
      },
      steps: [
        {
          id: "watch",
          label: "鐪?",
          icon: "eye",
          order: 1,
          module: {
            type: "video",
            visualStory: {
              scenes: [
                { scene: "灏忕尗瑙傚療", narration: "涓€璧疯瀵熷皬鐚?" },
              ],
            },
            videoLesson: { shots: [] },
          },
        },
        {
          id: "write",
          label: "鍐?",
          icon: "pen",
          order: 4,
          module: {
            type: "writing",
            writing: {
              goal: "鎻忎竴鎻?灏忕尗",
              tracingItems: ["鐚?"],
              practiceTasks: ["娌跨潃铏氱嚎鎻忎竴鎻?"],
            },
          },
        },
      ],
    };

    contentRepo.findOne.mockResolvedValue({
      id: 101,
      status: "draft",
      title: "鍔ㄧ墿瑙傚療 鍏ㄦ柟浣嶅涔犺",
      subtitle: "鍘熷鎬荤粨",
      content: lesson,
    });

    llmClient.generate.mockResolvedValueOnce(
      JSON.stringify({
        steps: [
          {
            id: "write",
            module: {
              type: "writing",
              writing: {
                goal: "鎻忎竴鎻?灏忕尗",
                tracingItems: ["鐚?"],
                practiceTasks: ["鎶婃弿绾㈢嚎鏉″彉寰楁洿娓呮櫚"],
              },
            },
          },
        ],
      }),
    );

    await service.modifyDraft(101, 1, "鎶婃弿绾㈡彁绀烘敼寰楁洿娓呮櫚", {
      stepId: "write",
    });

    const prompt = llmClient.generate.mock.calls[0][0];
    expect(prompt).toContain("Target step for this edit");
    expect(prompt).toContain('"id": "write"');
    expect(prompt).toContain('"moduleType": "writing"');
    expect(prompt).toContain('Focus on step "write" first');
  });
});
