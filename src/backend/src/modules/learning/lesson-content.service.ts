import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  OnModuleInit,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomUUID } from "crypto";
import { Content } from "../../database/entities/content.entity";
import { LearningRecord } from "../../database/entities/learning-record.entity";
import { Assignment } from "../../database/entities/assignment.entity";
import { StudyPlanRecord } from "../../database/entities/study-plan-record.entity";
import { ContentsService } from "../contents/contents.service";
import { GenerateCoursePackTool } from "../ai/agent/tools/generate-course-pack";
import { GenerateActivityTool } from "../ai/agent/tools/generate-activity";
import { AiService } from "../ai/ai.service";
import { AssignmentService } from "../assignment/assignment.service";
import { LearningTrackerService } from "./learning-tracker.service";
import { LlmClientService } from "../../agent-framework/llm/llm-client.service";
import {
  derivePracticeSceneDocument,
  deriveWatchSceneDocument,
  deriveWriteSceneDocument,
  sanitizeSceneDocument,
  type LessonSceneDocument,
} from "./lesson-scene";
import { getCoursePackCurriculumSeed } from "./course-curriculum-fallback";

type AgeGroup = "3-4" | "5-6";
type LessonDomain = "language" | "math" | "science" | "art" | "social";

export interface GenerateLessonParams {
  topic: string;
  childId: number;
  parentId: number;
  ageGroup?: AgeGroup;
  domain?: LessonDomain;
  focus?: "literacy" | "math" | "science" | "mixed";
  difficulty?: number;
  durationMinutes?: number;
  parentPrompt?: string;
}

export interface CompleteStepParams {
  contentId: number;
  childId: number;
  stepId: string;
  score?: number;
  durationSeconds?: number;
  interactionData?: Record<string, any>;
}

interface LessonStep {
  id: string;
  label: string;
  icon: string;
  order: number;
  module: {
    type: string;
    [key: string]: any;
  };
  assignmentId?: number;
}

interface StructuredLessonContent {
  type: "structured_lesson";
  version: 1;
  topic: string;
  ageGroup: AgeGroup;
  summary: string;
  outcomes: string[];
  sourceCoursePackId: number | null;
  steps: LessonStep[];
  parentGuide: {
    beforeClass: string[];
    duringClass: string[];
    afterClass: string[];
  };
  generatedAt: string;
}

interface ModifyLessonDraftOptions {
  stepId?: string;
}

const STEP_DEFINITIONS: Array<{ id: string; label: string; icon: string }> = [
  { id: "watch", label: "看", icon: "eye" },
  { id: "read", label: "读", icon: "book" },
  { id: "write", label: "写", icon: "pen" },
  { id: "practice", label: "练", icon: "gamepad" },
];

export interface DraftLessonSummary {
  id: number;
  title: string;
  subtitle: string | null;
  domain: string;
  status: string;
  contentType: string;
  childId: number;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class LessonContentService implements OnModuleInit {
  private readonly logger = new Logger(LessonContentService.name);

  async onModuleInit(): Promise<void> {
    // Recover content records stuck in 'generating' status from previous server crash/restart
    const staleThresholdMinutes = 5;
    try {
      const result = await this.contentRepo
        .createQueryBuilder()
        .update(Content)
        .set({
          status: "generation_failed",
          subtitle: "生成中断：服务器重启，请重新生成",
        })
        .where(
          "status = :status AND contentType = :contentType AND updatedAt < datetime('now', '-5 minutes')",
          {
            status: "generating",
            contentType: "structured_lesson",
          },
        )
        .execute();

      if (result.affected && result.affected > 0) {
        this.logger.warn(
          `Recovered ${result.affected} stuck lesson generation(s) on startup`,
        );
      }
    } catch (error: any) {
      this.logger.warn(`Stuck generation recovery failed: ${error?.message}`);
    }
  }

  constructor(
    @InjectRepository(Content)
    private readonly contentRepo: Repository<Content>,
    @InjectRepository(LearningRecord)
    private readonly recordRepo: Repository<LearningRecord>,
    @InjectRepository(Assignment)
    private readonly assignmentRepo: Repository<Assignment>,
    @InjectRepository(StudyPlanRecord)
    private readonly studyPlanRepo: Repository<StudyPlanRecord>,
    private readonly contentsService: ContentsService,
    private readonly generateCoursePackTool: GenerateCoursePackTool,
    private readonly generateActivityTool: GenerateActivityTool,
    private readonly aiService: AiService,
    private readonly assignmentService: AssignmentService,
    private readonly learningTracker: LearningTrackerService,
    private readonly llmClient: LlmClientService,
  ) {}

  async listDraftLessonsForChild(
    childId: number,
  ): Promise<DraftLessonSummary[]> {
    const drafts = await this.contentRepo
      .createQueryBuilder("content")
      .select([
        "content.id AS id",
        "content.title AS title",
        "content.subtitle AS subtitle",
        "content.domain AS domain",
        "content.status AS status",
        "content.contentType AS contentType",
        "content.createdAt AS createdAt",
        "content.updatedAt AS updatedAt",
      ])
      .where("content.childId = :childId", { childId })
      .andWhere("content.status IN (:...statuses)", {
        statuses: ["draft", "generating"],
      })
      .andWhere("content.contentType = :contentType", {
        contentType: "structured_lesson",
      })
      .orderBy("content.createdAt", "DESC")
      .getRawMany<{
        id: number;
        title: string;
        subtitle: string | null;
        domain: string;
        status: string;
        contentType: string;
        createdAt: Date | string;
        updatedAt: Date | string;
      }>();

    const structuredLessonDrafts = drafts.map((draft) => ({
      id: Number(draft.id),
      title: draft.title,
      subtitle: draft.subtitle || null,
      domain: draft.domain,
      status: draft.status,
      contentType: draft.contentType,
      childId,
      createdAt:
        draft.createdAt instanceof Date
          ? draft.createdAt.toISOString()
          : new Date(draft.createdAt).toISOString(),
      updatedAt:
        draft.updatedAt instanceof Date
          ? draft.updatedAt.toISOString()
          : new Date(draft.updatedAt).toISOString(),
    }));

    const coursePackDrafts = await this.studyPlanRepo
      .createQueryBuilder("plan")
      .select([
        "plan.id AS id",
        "plan.title AS title",
        "plan.sourceType AS sourceType",
        "plan.status AS status",
        "plan.createdAt AS createdAt",
        "plan.updatedAt AS updatedAt",
      ])
      .where("plan.childId = :childId", { childId })
      .andWhere("plan.sourceType = :sourceType", {
        sourceType: "ai_course_pack",
      })
      .orderBy("plan.createdAt", "DESC")
      .getRawMany<{
        id: number;
        title: string;
        sourceType: string;
        status: string;
        createdAt: Date | string;
        updatedAt: Date | string;
      }>();

    const mappedCoursePackDrafts: DraftLessonSummary[] = coursePackDrafts.map(
      (row) => ({
        id: Number(row.id),
        title: row.title,
        subtitle: null,
        domain: "",
        status: row.status || "draft",
        contentType: "course_pack",
        childId,
        createdAt:
          row.createdAt instanceof Date
            ? row.createdAt.toISOString()
            : new Date(row.createdAt).toISOString(),
        updatedAt:
          row.updatedAt instanceof Date
            ? row.updatedAt.toISOString()
            : new Date(row.updatedAt).toISOString(),
      }),
    );

    return [...structuredLessonDrafts, ...mappedCoursePackDrafts].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  /**
   * Start async lesson generation. Creates a placeholder Content (status='generating')
   * and returns immediately. The actual generation runs in background.
   */
  async startGeneration(params: GenerateLessonParams): Promise<Content> {
    const {
      topic,
      ageGroup = "5-6",
      domain = "language",
      difficulty = ageGroup === "3-4" ? 1 : 2,
      durationMinutes = 20,
      childId,
      parentId,
    } = params;

    // Create placeholder content immediately
    const placeholder = await this.contentsService.create({
      uuid: randomUUID(),
      title: `${topic} 全方位学习课`,
      subtitle: `正在生成围绕${topic}的四步课程...`,
      ageRange: ageGroup,
      domain,
      topic,
      difficulty,
      durationMinutes,
      contentType: "structured_lesson",
      parentId,
      childId,
      content: {
        type: "structured_lesson",
        version: 1,
        topic,
        ageGroup,
        summary: "",
        outcomes: [],
        sourceCoursePackId: null,
        steps: [],
        parentGuide: { beforeClass: [], duringClass: [], afterClass: [] },
        generatedAt: new Date().toISOString(),
      } as any,
      mediaUrls: [] as any,
      status: "generating",
    });

    this.logger.log(
      `Lesson generation started: contentId=${placeholder.id}, topic="${topic}"`,
    );

    // Run generation in background (fire-and-forget)
    this.runGeneration(placeholder.id, params).catch((err: any) => {
      this.logger.error(
        `Background generation failed for contentId=${placeholder.id}: ${err?.message}`,
      );
    });

    return placeholder;
  }

  private async runGeneration(
    contentId: number,
    params: GenerateLessonParams,
  ): Promise<void> {
    const {
      topic,
      ageGroup = "5-6",
      domain = "language",
      focus = "mixed",
      difficulty = ageGroup === "3-4" ? 1 : 2,
      durationMinutes = 20,
      parentPrompt = "",
    } = params;

    try {
      // 1 & 2. Generate course pack AND practice game in parallel
      const practiceType = this.resolveGameType(focus);
      this.logger.log(
        `[contentId=${contentId}] Step 1/2: Generating course pack + practice game in parallel...`,
      );
      await this.contentRepo.update(contentId, {
        subtitle: "正在生成课程内容...",
      } as any);

      const [coursePackRaw, practiceRaw] = await Promise.allSettled([
        this.generateCoursePackTool.execute({
          topic,
          ageGroup,
          domain,
          focus,
          difficulty,
          durationMinutes,
          includeGame: false,
          includeAudio: false,
          includeVideo: true,
          parentPrompt: parentPrompt || topic,
        }),
        this.generateActivityTool
          .execute({
            type: practiceType,
            topic,
            difficulty,
            ageGroup,
            domain,
          })
          .catch((err: any) => {
            this.logger.warn(
              `[contentId=${contentId}] Practice game failed: ${err?.message}`,
            );
            return null;
          }),
      ]);

      const coursePack =
        coursePackRaw.status === "fulfilled"
          ? this.parseJson(coursePackRaw.value)
          : null;
      if (!coursePack) {
        throw new Error(
          coursePackRaw.status === "rejected"
            ? `Course pack generation failed: ${coursePackRaw.reason?.message || "unknown"}`
            : "LLM returned non-JSON for course pack",
        );
      }

      let practiceData: Record<string, any> | null = null;
      if (practiceRaw.status === "fulfilled" && practiceRaw.value) {
        practiceData = this.parseJson(practiceRaw.value);
      }
      if (!practiceData) {
        this.logger.log(
          `[contentId=${contentId}] Using fallback practice activity`,
        );
        practiceData = this.buildFallbackActivity(
          practiceType,
          topic,
          ageGroup,
          domain,
        );
      }

      // 3. Assemble 4-step lesson
      this.logger.log(
        `[contentId=${contentId}] Step 2/2: Assembling lesson...`,
      );
      await this.contentRepo.update(contentId, {
        subtitle: "正在组装课程...",
      } as any);
      const lessonContent = this.assembleLesson(coursePack, practiceData, {
        topic,
        ageGroup,
        summary: coursePack.summary || "",
        outcomes: coursePack.outcomes || [],
      });

      const title = coursePack.title || `${topic} 全方位学习课`;
      const subtitle = coursePack.summary || `围绕${topic}的四步综合课程`;

      await this.contentRepo.update(contentId, {
        title,
        subtitle,
        content: lessonContent as any,
        status: "draft",
      });

      this.logger.log(`Lesson generation completed: contentId=${contentId}`);
    } catch (error: any) {
      this.logger.error(
        `Lesson generation FAILED: contentId=${contentId}, ${error?.message}`,
        error?.stack,
      );
      // Mark as failed so frontend knows
      await this.contentRepo.update(contentId, {
        status: "generation_failed",
        subtitle: `生成失败: ${error?.message || "未知错误"}`,
      });
    }
  }

  /**
   * Original synchronous method kept for backward compatibility.
   */
  async generateDraft(params: GenerateLessonParams): Promise<Content> {
    return this.startGeneration(params);
  }

  async modifyDraft(
    contentId: number,
    parentId: number,
    modification: string,
    options: ModifyLessonDraftOptions = {},
  ): Promise<Content> {
    const content = await this.contentRepo.findOne({
      where: { id: contentId },
    });
    if (!content) throw new NotFoundException("Content not found");
    if (content.status !== "draft")
      throw new ForbiddenException("Only draft lessons can be modified");

    const lesson = content.content as unknown as StructuredLessonContent;
    if (!lesson || lesson.type !== "structured_lesson") {
      throw new ForbiddenException("Not a structured lesson");
    }

    const targetStep = options.stepId
      ? lesson.steps.find((step) => step.id === options.stepId) || null
      : null;

    // Send modification request to LLM
    const prompt = [
      "You are a curriculum designer. A parent has requested modifications to a lesson plan.",
      `Current lesson JSON:\n${JSON.stringify(lesson, null, 2)}`,
      `Parent's modification request: ${modification}`,
      targetStep
        ? `Target step for this edit:\n${JSON.stringify(this.describeStepForPrompt(targetStep), null, 2)}`
        : "Target step for this edit: all steps (whole-lesson edit).",
      "Rules:",
      "- Apply the modification to the relevant parts of the lesson.",
      targetStep
        ? `- Focus on step "${targetStep.id}" first and keep other steps unchanged unless a small sync update is necessary.`
        : "- You may update multiple steps if the parent request is about the whole lesson.",
      "- Keep all content age-appropriate and in Chinese for learner-facing text.",
      "- Return the COMPLETE updated lesson JSON (same structure).",
      '- Do NOT change the "type", "version", or "steps[].id" fields.',
      "- Preserve steps[].module.scene unless the parent request explicitly changes that step.",
      "- If watch/write/practice content changes, update the related steps[].module.scene to stay in sync.",
      "- Return strict JSON only. No markdown. No explanation.",
    ].join("\n");

    const llmResponse = await this.llmClient.generate(prompt);
    const updated = this.parseJson(llmResponse);

    if (updated && updated.steps) {
      const merged = this.mergeModifiedLesson(lesson, updated);
      const nextTopic = this.toText((merged as any)?.topic, lesson.topic);
      content.content = merged as any;
      content.title = this.toText(
        (updated as any)?.title,
        nextTopic ? `${nextTopic} 鍏ㄦ柟浣嶅涔犺` : content.title,
      );
      content.subtitle = this.toText(
        (merged as any)?.summary,
        content.subtitle || "",
      );
      const saved = await this.contentRepo.save(content);
      this.logger.log(`Lesson modified: contentId=${contentId}`);
      return saved;
    }

    throw new Error("Failed to apply modifications. Please try again.");
  }

  async confirmAndPublish(
    contentId: number,
    parentId: number,
    childId: number,
  ): Promise<Content> {
    const content = await this.contentRepo.findOne({
      where: { id: contentId },
    });
    if (!content) throw new NotFoundException("Content not found");
    if (content.status !== "draft")
      throw new ForbiddenException("Only draft lessons can be confirmed");

    const lesson = content.content as unknown as StructuredLessonContent;

    // Create assignments for practice step
    const updatedSteps = [...lesson.steps];

    for (let i = 0; i < updatedSteps.length; i++) {
      const step = updatedSteps[i];
      if (step.id === "practice" && step.module?.game) {
        const assignment = await this.assignmentService.create({
          parentId,
          childId,
          activityType: step.module.game.activityType || "quiz",
          activityData: step.module.game.activityData || step.module.game,
          contentId: content.id,
          domain: content.domain,
          difficulty: content.difficulty,
        });
        updatedSteps[i] = { ...step, assignmentId: assignment.id };
      }
    }

    // Update content
    content.status = "published";
    content.content = {
      ...lesson,
      steps: updatedSteps,
    } as any;

    const saved = await this.contentRepo.save(content);
    this.logger.log(
      `Lesson published: contentId=${contentId}, with ${updatedSteps.filter((s) => s.assignmentId).length} assignments`,
    );
    return saved;
  }

  async completeStep(params: CompleteStepParams): Promise<{
    success: boolean;
    recordId: number;
    abilityUpdated: boolean;
    achievementsAwarded: string[];
  }> {
    const {
      contentId,
      childId,
      stepId,
      score = 0,
      durationSeconds = 0,
      interactionData,
    } = params;

    const content = await this.contentRepo.findOne({
      where: { id: contentId },
    });
    if (!content) throw new NotFoundException("Content not found");

    const lesson = content.content as unknown as StructuredLessonContent;
    const step = lesson.steps.find((s) => s.id === stepId);
    if (!step) throw new NotFoundException(`Step "${stepId}" not found`);

    // Check if this step has an assignment (practice/assess)
    if (step.assignmentId) {
      // Complete via assignment service
      const result = await this.learningTracker.recordActivity({
        type: "assignment_completion",
        childId,
        assignmentId: step.assignmentId,
        contentId,
        domain: content.domain || "language",
        score,
        durationSeconds,
        interactionData: {
          stepId,
          ...interactionData,
        },
      });

      return {
        success: true,
        recordId: result.learningRecord.id,
        abilityUpdated: result.abilityUpdated,
        achievementsAwarded: result.achievementsAwarded,
      };
    }

    // For non-assignment steps, record as a learning activity
    const result = await this.learningTracker.recordActivity({
      type: "content_completion",
      childId,
      contentId,
      domain: content.domain || "language",
      score,
      durationSeconds,
      interactionData: {
        stepId,
        lessonType: "structured_lesson",
        ...interactionData,
      },
    });

    return {
      success: true,
      recordId: result.learningRecord.id,
      abilityUpdated: result.abilityUpdated,
      achievementsAwarded: result.achievementsAwarded,
    };
  }

  async getLessonProgress(
    contentId: number,
    childId: number,
  ): Promise<{
    contentId: number;
    childId: number;
    completedSteps: string[];
    overallScore: number;
    stepResults: Record<string, { status: string; score: number | null }>;
  }> {
    const records = await this.recordRepo
      .createQueryBuilder("r")
      .where("r.userId = :childId", { childId })
      .andWhere("r.contentId = :contentId", { contentId })
      .getMany();

    const stepResults: Record<
      string,
      { status: string; score: number | null }
    > = {};
    const completedSteps: string[] = [];
    let totalScore = 0;
    let scoreCount = 0;

    for (const record of records) {
      const stepId = record.interactionData?.stepId;
      if (stepId) {
        const status =
          record.status === "completed" ? "completed" : "in_progress";
        stepResults[stepId] = { status, score: record.score ?? null };
        if (status === "completed") {
          completedSteps.push(stepId);
          if (record.score != null) {
            totalScore += record.score;
            scoreCount++;
          }
        }
      }
    }

    return {
      contentId,
      childId,
      completedSteps,
      overallScore: scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0,
      stepResults,
    };
  }

  async getTeachingVideo(
    contentId: number,
  ): Promise<{ filename: string; mimeType: string; body: Buffer }> {
    const content = await this.contentRepo.findOne({
      where: { id: contentId },
    });
    if (!content) throw new NotFoundException("Content not found");

    const lesson = content.content as unknown as StructuredLessonContent;
    if (!lesson || lesson.type !== "structured_lesson") {
      throw new ForbiddenException("Not a structured lesson");
    }

    const watchModule: Record<string, any> =
      lesson.steps.find((step) => step.id === "watch")?.module || {};
    const readModule: Record<string, any> =
      lesson.steps.find((step) => step.id === "read")?.module || {};
    const writeModule: Record<string, any> =
      lesson.steps.find((step) => step.id === "write")?.module || {};

    const packLike: Record<string, any> = {
      title: content.title || `${lesson.topic} 全方位学习课`,
      summary: lesson.summary || content.subtitle || "",
      topic: lesson.topic || content.topic || "",
      visualStory: watchModule.visualStory || {},
      videoLesson: watchModule.videoLesson || {},
      modules: {
        reading: readModule.reading || {},
        writing: writeModule.writing || {},
      },
    };

    const body = await this.aiService.renderTeachingVideoFromPack(packLike);
    if (!body) {
      throw new Error("TEACHING_VIDEO_UNAVAILABLE");
    }

    const safeTitle = String(
      content.title || lesson.topic || `lesson-${contentId}`,
    )
      .replace(/[\\/:*?"<>|]+/g, "-")
      .trim();

    return {
      filename: `${safeTitle || `lesson-${contentId}`}-teaching-video.mp4`,
      mimeType: "video/mp4",
      body,
    };
  }

  private assembleLesson(
    coursePack: Record<string, any>,
    practiceData: Record<string, any> | null,
    meta: {
      topic: string;
      ageGroup: AgeGroup;
      summary: string;
      outcomes: string[];
    },
  ): StructuredLessonContent {
    const modules = coursePack.modules || {};
    const parentGuide = coursePack.parentGuide || {};
    const watchScene = this.resolveWatchScene(
      coursePack,
      meta.topic,
      coursePack.domain as string,
    );
    const writeScene = this.resolveWriteScene(coursePack, meta.topic);
    const practiceType = this.resolveGameType(coursePack.focus || "mixed");
    const practiceScene = this.resolvePracticeScene(
      coursePack,
      practiceData,
      practiceType,
      meta.topic,
    );

    const steps: LessonStep[] = [
      {
        id: "watch",
        label: "看",
        icon: "eye",
        order: 1,
        module: {
          type: "video",
          scene: watchScene,
          visualStory: coursePack.visualStory || {},
          videoLesson: coursePack.videoLesson || {},
        },
      },
      {
        id: "read",
        label: "读",
        icon: "book",
        order: 2,
        module: {
          type: "reading",
          reading: modules.reading || {},
        },
      },
      {
        id: "write",
        label: "写",
        icon: "pen",
        order: 3,
        module: {
          type: "writing",
          scene: writeScene,
          writing: modules.writing || {},
        },
      },
      {
        id: "practice",
        label: "练",
        icon: "gamepad",
        order: 4,
        module: {
          type: "game",
          scene: practiceScene,
          game: {
            activityType: practiceType,
            activityData: practiceData || {},
          },
        },
      },
    ];

    return {
      type: "structured_lesson",
      version: 1,
      topic: meta.topic,
      ageGroup: meta.ageGroup,
      summary: meta.summary || `围绕${meta.topic}的四步综合课程`,
      outcomes: meta.outcomes || [],
      sourceCoursePackId: null,
      steps,
      parentGuide: {
        beforeClass: parentGuide.beforeClass || [],
        duringClass: parentGuide.duringClass || [],
        afterClass: parentGuide.afterClass || [],
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private resolveGameType(
    focus: string,
  ):
    | "quiz"
    | "true_false"
    | "fill_blank"
    | "matching"
    | "connection"
    | "sequencing"
    | "puzzle" {
    const map: Record<
      string,
      | "quiz"
      | "true_false"
      | "fill_blank"
      | "matching"
      | "connection"
      | "sequencing"
      | "puzzle"
    > = {
      literacy: "fill_blank",
      math: "quiz",
      science: "connection",
      mixed: "matching",
    };
    return map[focus] || "matching";
  }

  private buildFallbackActivity(
    type: string,
    topic: string,
    ageGroup: string,
    domain?: LessonDomain,
  ): Record<string, any> {
    const curriculumSeed =
      ageGroup === "3-4" || ageGroup === "5-6"
        ? getCoursePackCurriculumSeed({ topic, ageGroup, domain })
        : null;

    if (type === "quiz") {
      const quizItems = curriculumSeed?.quizItems?.length
        ? curriculumSeed.quizItems.slice(0, 3)
        : [];

      return {
        type: "quiz",
        title: `${topic} 测评`,
        topic,
        ageGroup,
        questions:
          quizItems.length > 0
            ? quizItems.map((item, index) => ({
                question: item.question,
                options: item.options,
                correctIndex: Math.max(
                  0,
                  item.options.findIndex((option) => option === item.answer),
                ),
                explanation:
                  curriculumSeed?.outcomes?.[index] ||
                  `${topic}包含很多有趣的内容`,
              }))
            : [
                {
                  question: `关于${topic}，你学到了什么？`,
                  options: ["新知识", "新技能", "新发现", "全部都是"],
                  correctIndex: 3,
                  explanation: `${topic}包含很多有趣的内容`,
                },
                {
                  question: `你觉得${topic}最有趣的地方是？`,
                  options: ["观察", "动手", "思考", "分享"],
                  correctIndex: 0,
                  explanation: "每个人都可以有自己的发现",
                },
                {
                  question: `今天学习${topic}后，你记住了什么？`,
                  options: ["一个关键词", "一个故事", "一个游戏", "以上都有"],
                  correctIndex: 3,
                  explanation: "学习可以有很多收获",
                },
              ],
      };
    }

    if (type === "matching") {
      const pairs = curriculumSeed?.matchingPairs?.length
        ? curriculumSeed.matchingPairs.slice(0, 4).map((pair, index) => ({
            id: `p${index + 1}`,
            left: pair.left,
            right: pair.right,
          }))
        : [];

      return {
        type: "matching",
        title: `${topic} 配对游戏`,
        topic,
        ageGroup,
        pairs:
          pairs.length > 0
            ? pairs
            : [
                { id: "p1", left: `${topic} 概念1`, right: "对应内容1" },
                { id: "p2", left: `${topic} 概念2`, right: "对应内容2" },
                { id: "p3", left: `${topic} 概念3`, right: "对应内容3" },
              ],
      };
    }

    if (type === "connection") {
      const pairs = curriculumSeed?.matchingPairs?.length
        ? curriculumSeed.matchingPairs.slice(0, 4)
        : [];
      const leftItems = pairs.map((pair, index) => ({
        id: `l${index + 1}`,
        label: pair.left,
      }));
      const rightItems = pairs.map((pair, index) => ({
        id: `r${index + 1}`,
        label: pair.right,
      }));
      const connections = pairs.map((pair, index) => ({
        left: `l${index + 1}`,
        right: `r${index + 1}`,
      }));

      if (pairs.length > 0) {
        return {
          type: "connection",
          title: `${topic} 连线练习`,
          topic,
          ageGroup,
          leftItems,
          rightItems,
          connections,
        };
      }
    }

    if (type === "fill_blank") {
      const quizItems = curriculumSeed?.quizItems?.length
        ? curriculumSeed.quizItems.slice(0, 3)
        : [];
      const sentences = quizItems
        .map((item, index) => {
          const answer = item.answer;
          if (!answer || !item.question.includes(answer)) return null;
          return {
            id: `s${index + 1}`,
            text: item.question.replace(answer, "___"),
            answer,
            options: item.options,
            hint: curriculumSeed?.outcomes?.[index] || `${topic}小提示`,
          };
        })
        .filter(Boolean);

      if (sentences.length > 0) {
        return {
          type: "fill_blank",
          title: `${topic} 填空练习`,
          topic,
          ageGroup,
          sentences,
        };
      }
    }

    return {
      type: type || "quiz",
      title: `${topic} 练习`,
      topic,
      ageGroup,
      questions: [
        {
          question: `关于${topic}，下面哪个是对的？`,
          options: ["A", "B", "C"],
          correctIndex: 0,
          explanation: `${topic}的知识点`,
        },
      ],
    };
  }

  private parseJson(text: string): Record<string, any> | null {
    if (!text) return null;

    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {}

    const codeBlock =
      text.match(/```json\s*([\s\S]*?)```/i) ||
      text.match(/```\s*([\s\S]*?)```/i);
    if (codeBlock?.[1]) {
      try {
        const parsed = JSON.parse(codeBlock[1].trim());
        return parsed && typeof parsed === "object" ? parsed : null;
      } catch {}
    }

    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        const parsed = JSON.parse(text.slice(firstBrace, lastBrace + 1));
        return parsed && typeof parsed === "object" ? parsed : null;
      } catch {}
    }

    return null;
  }

  private resolveWatchScene(
    coursePack: Record<string, any>,
    topic: string,
    domain?: string,
  ): LessonSceneDocument {
    return (
      sanitizeSceneDocument(coursePack?.watch?.scene, "watch", "playback") ||
      deriveWatchSceneDocument(
        {
          visualStory: coursePack.visualStory || {},
          videoLesson: coursePack.videoLesson || {},
        },
        topic,
        domain || coursePack.domain,
      )
    );
  }

  private resolveWriteScene(
    coursePack: Record<string, any>,
    topic: string,
  ): LessonSceneDocument {
    return (
      sanitizeSceneDocument(
        coursePack?.write?.scene || coursePack?.modules?.writing?.scene,
        "write",
        "guided_trace",
      ) || deriveWriteSceneDocument(coursePack?.modules?.writing || {}, topic)
    );
  }

  private resolvePracticeScene(
    coursePack: Record<string, any>,
    practiceData: Record<string, any> | null,
    activityType:
      | "quiz"
      | "true_false"
      | "fill_blank"
      | "matching"
      | "connection"
      | "sequencing"
      | "puzzle",
    topic: string,
  ): LessonSceneDocument {
    return (
      sanitizeSceneDocument(
        coursePack?.practice?.scene,
        "practice",
        "activity_shell",
      ) ||
      derivePracticeSceneDocument(
        activityType,
        (practiceData || {
          type: activityType,
          title: `${topic} 互动练习`,
        }) as any,
        topic,
      )
    );
  }

  private mergeModifiedLesson(
    originalLesson: StructuredLessonContent,
    updatedLesson: Record<string, any>,
  ): StructuredLessonContent {
    const merged = {
      ...originalLesson,
      ...updatedLesson,
      type: "structured_lesson" as const,
      version: 1 as const,
    };

    const topic = this.toText(merged.topic, originalLesson.topic);
    const stepsById = new Map<string, Record<string, any>>(
      (Array.isArray(updatedLesson?.steps) ? updatedLesson.steps : [])
        .filter((step: any) => step && typeof step === "object" && step.id)
        .map((step: any) => [String(step.id), step] as const),
    );

    const steps = originalLesson.steps.map((originalStep) => {
      const updatedStep = stepsById.get(originalStep.id) || {};
      const mergedStep: LessonStep = {
        ...originalStep,
        ...(updatedStep as Record<string, any>),
        module: {
          ...(originalStep.module || {}),
          ...((updatedStep as any)?.module || {}),
        },
      };

      return this.syncModifiedStepScene(mergedStep, originalStep, topic);
    });

    return {
      ...merged,
      topic,
      ageGroup:
        merged.ageGroup === "3-4" || merged.ageGroup === "5-6"
          ? merged.ageGroup
          : originalLesson.ageGroup,
      summary: this.toText(merged.summary, originalLesson.summary),
      outcomes: Array.isArray(merged.outcomes)
        ? merged.outcomes
        : originalLesson.outcomes,
      steps,
      parentGuide: {
        beforeClass: Array.isArray(merged.parentGuide?.beforeClass)
          ? merged.parentGuide.beforeClass
          : originalLesson.parentGuide.beforeClass,
        duringClass: Array.isArray(merged.parentGuide?.duringClass)
          ? merged.parentGuide.duringClass
          : originalLesson.parentGuide.duringClass,
        afterClass: Array.isArray(merged.parentGuide?.afterClass)
          ? merged.parentGuide.afterClass
          : originalLesson.parentGuide.afterClass,
      },
    };
  }

  private syncModifiedStepScene(
    step: LessonStep,
    originalStep: LessonStep,
    topic: string,
  ): LessonStep {
    const module: Record<string, any> = step.module || {};
    const originalModule: Record<string, any> = originalStep?.module || {};

    if (step.id === "watch" || module.type === "video") {
      return {
        ...step,
        module: {
          ...module,
          scene: this.resolveModifiedWatchScene(module, originalModule, topic),
        } as unknown as LessonStep["module"],
      };
    }

    if (step.id === "write" || module.type === "writing") {
      return {
        ...step,
        module: {
          ...module,
          scene: this.resolveModifiedWriteScene(module, originalModule, topic),
        } as unknown as LessonStep["module"],
      };
    }

    if (step.id === "practice" || module.type === "game") {
      return {
        ...step,
        module: {
          ...module,
          scene: this.resolveModifiedPracticeScene(
            module,
            originalModule,
            topic,
          ),
        } as unknown as LessonStep["module"],
      };
    }

    return step;
  }

  private resolveModifiedWatchScene(
    module: Record<string, any>,
    originalModule: Record<string, any>,
    topic: string,
  ): LessonSceneDocument {
    const domain = module?.domain || originalModule?.domain;
    const nextScene = sanitizeSceneDocument(module?.scene, "watch", "playback");
    const sourceChanged = this.didSceneSourceChange(
      {
        visualStory: originalModule?.visualStory,
        videoLesson: originalModule?.videoLesson,
      },
      { visualStory: module?.visualStory, videoLesson: module?.videoLesson },
    );

    if (
      nextScene &&
      this.didSceneDocChange(originalModule?.scene, module?.scene)
    ) {
      return nextScene;
    }

    if (sourceChanged) {
      return deriveWatchSceneDocument(
        {
          visualStory: module?.visualStory || {},
          videoLesson: module?.videoLesson || {},
        },
        topic,
        domain,
      );
    }

    return (
      nextScene ||
      sanitizeSceneDocument(originalModule?.scene, "watch", "playback") ||
      deriveWatchSceneDocument(
        {
          visualStory: module?.visualStory || {},
          videoLesson: module?.videoLesson || {},
        },
        topic,
        domain,
      )
    );
  }

  private resolveModifiedWriteScene(
    module: Record<string, any>,
    originalModule: Record<string, any>,
    topic: string,
  ): LessonSceneDocument {
    const nextScene = sanitizeSceneDocument(
      module?.scene,
      "write",
      "guided_trace",
    );
    const sourceChanged = this.didSceneSourceChange(
      originalModule?.writing,
      module?.writing,
    );

    if (
      nextScene &&
      this.didSceneDocChange(originalModule?.scene, module?.scene)
    ) {
      return nextScene;
    }

    if (sourceChanged) {
      return deriveWriteSceneDocument(module?.writing || {}, topic);
    }

    return (
      nextScene ||
      sanitizeSceneDocument(originalModule?.scene, "write", "guided_trace") ||
      deriveWriteSceneDocument(module?.writing || {}, topic)
    );
  }

  private resolveModifiedPracticeScene(
    module: Record<string, any>,
    originalModule: Record<string, any>,
    topic: string,
  ): LessonSceneDocument {
    const nextScene = sanitizeSceneDocument(
      module?.scene,
      "practice",
      "activity_shell",
    );
    const sourceChanged = this.didSceneSourceChange(
      originalModule?.game,
      module?.game,
    );
    const activityType = this.toText(
      module?.game?.activityType || originalModule?.game?.activityType,
      "quiz",
    ) as any;
    const activityData = (module?.game?.activityData ||
      module?.game ||
      originalModule?.game?.activityData || {
        type: activityType,
        title: `${topic} 浜掑姩缁冧範`,
      }) as Record<string, any>;

    if (
      nextScene &&
      this.didSceneDocChange(originalModule?.scene, module?.scene)
    ) {
      return nextScene;
    }

    if (sourceChanged) {
      return derivePracticeSceneDocument(activityType, activityData, topic);
    }

    return (
      nextScene ||
      sanitizeSceneDocument(
        originalModule?.scene,
        "practice",
        "activity_shell",
      ) ||
      derivePracticeSceneDocument(activityType, activityData, topic)
    );
  }

  private didSceneDocChange(
    previousScene: unknown,
    nextScene: unknown,
  ): boolean {
    return (
      this.safeStableStringify(previousScene) !==
      this.safeStableStringify(nextScene)
    );
  }

  private didSceneSourceChange(
    previousSource: unknown,
    nextSource: unknown,
  ): boolean {
    return (
      this.safeStableStringify(previousSource) !==
      this.safeStableStringify(nextSource)
    );
  }

  private safeStableStringify(value: unknown): string {
    try {
      return JSON.stringify(value ?? null) || "null";
    } catch {
      return String(value ?? "null");
    }
  }

  private toText(value: unknown, fallback = ""): string {
    if (value == null) return fallback;
    const text = String(value).replace(/\s+/g, " ").trim();
    return text || fallback;
  }

  private describeStepForPrompt(step: LessonStep): Record<string, any> {
    return {
      id: step.id,
      label: step.label,
      moduleType: step.module?.type,
      title: this.describeStepTitle(step),
      summary: this.describeStepSummary(step),
    };
  }

  private describeStepTitle(step: LessonStep): string {
    const module: Record<string, any> = step.module || {};
    if (module.type === "video") return "观看动画讲解";
    if (module.type === "reading")
      return this.toText(module.reading?.goal, "阅读理解");
    if (module.type === "writing")
      return this.toText(module.writing?.goal, "书写练习");
    if (module.type === "game") return "互动练习";
    return step.label;
  }

  private describeStepSummary(step: LessonStep): string {
    const module: Record<string, any> = step.module || {};
    if (module.type === "video") {
      const scenes = Array.isArray(module.visualStory?.scenes)
        ? module.visualStory.scenes
        : Array.isArray(module.videoLesson?.shots)
          ? module.videoLesson.shots
          : [];
      return scenes
        .slice(0, 3)
        .map((scene: any) =>
          this.toText(
            scene?.narration ||
              scene?.onScreenText ||
              scene?.caption ||
              scene?.scene ||
              scene?.shot,
          ),
        )
        .filter(Boolean)
        .join(" | ");
    }
    if (module.type === "reading") {
      return this.toText(module.reading?.text).slice(0, 120);
    }
    if (module.type === "writing") {
      return [
        this.toText(module.writing?.goal),
        Array.isArray(module.writing?.tracingItems)
          ? module.writing.tracingItems.join(", ")
          : "",
      ]
        .filter(Boolean)
        .join(" | ");
    }
    if (module.type === "game") {
      return [
        this.toText(module.game?.activityType),
        this.toText(module.game?.activityData?.title),
      ]
        .filter(Boolean)
        .join(" | ");
    }
    return this.toText(JSON.stringify(module)).slice(0, 120);
  }
}
