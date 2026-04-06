import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Content } from '../../database/entities/content.entity';
import { LearningRecord } from '../../database/entities/learning-record.entity';
import { ContentsService } from '../contents/contents.service';
import { GenerateCoursePackTool } from '../ai/agent/tools/generate-course-pack';
import { GenerateActivityTool } from '../ai/agent/tools/generate-activity';
import { AiService } from '../ai/ai.service';
import { AssignmentService } from '../assignment/assignment.service';
import { LearningTrackerService } from './learning-tracker.service';
import { LlmClient } from '../ai/llm/llm-client';

type AgeGroup = '3-4' | '5-6';
type LessonDomain = 'language' | 'math' | 'science' | 'art' | 'social';

export interface GenerateLessonParams {
  topic: string;
  childId: number;
  parentId: number;
  ageGroup?: AgeGroup;
  domain?: LessonDomain;
  focus?: 'literacy' | 'math' | 'science' | 'mixed';
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
  type: 'structured_lesson';
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

const STEP_DEFINITIONS: Array<{ id: string; label: string; icon: string }> = [
  { id: 'watch', label: '看', icon: 'eye' },
  { id: 'listen', label: '听', icon: 'ear' },
  { id: 'read', label: '读', icon: 'book' },
  { id: 'write', label: '写', icon: 'pen' },
  { id: 'practice', label: '练', icon: 'gamepad' },
  { id: 'assess', label: '评', icon: 'clipboard-check' },
];

@Injectable()
export class LessonContentService {
  private readonly logger = new Logger(LessonContentService.name);

  constructor(
    @InjectRepository(Content)
    private readonly contentRepo: Repository<Content>,
    @InjectRepository(LearningRecord)
    private readonly recordRepo: Repository<LearningRecord>,
    private readonly contentsService: ContentsService,
    private readonly generateCoursePackTool: GenerateCoursePackTool,
    private readonly generateActivityTool: GenerateActivityTool,
    private readonly aiService: AiService,
    private readonly assignmentService: AssignmentService,
    private readonly learningTracker: LearningTrackerService,
    private readonly llmClient: LlmClient,
  ) {}

  /**
   * Start async lesson generation. Creates a placeholder Content (status='generating')
   * and returns immediately. The actual generation runs in background.
   */
  async startGeneration(params: GenerateLessonParams): Promise<Content> {
    const {
      topic,
      ageGroup = '5-6',
      domain = 'language',
      difficulty = ageGroup === '3-4' ? 1 : 2,
      durationMinutes = 20,
    } = params;

    // Create placeholder content immediately
    const placeholder = await this.contentsService.create({
      uuid: randomUUID(),
      title: `${topic} 全方位学习课`,
      subtitle: `正在生成围绕${topic}的六步课程...`,
      ageRange: ageGroup,
      domain,
      topic,
      difficulty,
      durationMinutes,
      contentType: 'structured_lesson',
      content: {
        type: 'structured_lesson',
        version: 1,
        topic,
        ageGroup,
        summary: '',
        outcomes: [],
        sourceCoursePackId: null,
        steps: [],
        parentGuide: { beforeClass: [], duringClass: [], afterClass: [] },
        generatedAt: new Date().toISOString(),
      } as any,
      mediaUrls: [] as any,
      status: 'generating',
    });

    this.logger.log(`Lesson generation started: contentId=${placeholder.id}, topic="${topic}"`);

    // Run generation in background (fire-and-forget)
    this.runGeneration(placeholder.id, params).catch((err: any) => {
      this.logger.error(`Background generation failed for contentId=${placeholder.id}: ${err?.message}`);
    });

    return placeholder;
  }

  private async runGeneration(contentId: number, params: GenerateLessonParams): Promise<void> {
    const {
      topic,
      ageGroup = '5-6',
      domain = 'language',
      focus = 'mixed',
      difficulty = ageGroup === '3-4' ? 1 : 2,
      durationMinutes = 20,
      parentPrompt = '',
    } = params;

    try {
      // 1. Generate course pack
      this.logger.log(`[contentId=${contentId}] Step 1/5: Generating course pack...`);
      const coursePackRaw = await this.generateCoursePackTool.execute({
        topic,
        ageGroup,
        focus,
        difficulty,
        durationMinutes,
        includeGame: false,
        includeAudio: true,
        includeVideo: true,
        parentPrompt: parentPrompt || topic,
      });

      const coursePack = this.parseJson(coursePackRaw);
      if (!coursePack) {
        throw new Error('LLM returned non-JSON for course pack');
      }

      // 2. Generate practice game
      const practiceType = this.resolveGameType(focus);
      this.logger.log(`[contentId=${contentId}] Step 2/5: Generating practice game (${practiceType})...`);
      let practiceData: Record<string, any> | null = null;
      try {
        const practiceRaw = await this.generateActivityTool.execute({
          type: practiceType, topic, difficulty, ageGroup, domain,
        });
        practiceData = this.parseJson(practiceRaw);
      } catch (actErr: any) {
        this.logger.warn(`[contentId=${contentId}] Practice game failed, using fallback: ${actErr?.message}`);
        practiceData = this.buildFallbackActivity(practiceType, topic, ageGroup);
      }

      // 3. Generate assessment quiz
      this.logger.log(`[contentId=${contentId}] Step 3/5: Generating assessment quiz...`);
      let assessData: Record<string, any> | null = null;
      try {
        const assessRaw = await this.generateActivityTool.execute({
          type: 'quiz', topic, difficulty, ageGroup, domain,
        });
        assessData = this.parseJson(assessRaw);
      } catch (actErr: any) {
        this.logger.warn(`[contentId=${contentId}] Assessment quiz failed, using fallback: ${actErr?.message}`);
        assessData = this.buildFallbackActivity('quiz', topic, ageGroup);
      }

      // 4. Assemble 6-step lesson
      this.logger.log(`[contentId=${contentId}] Step 4/5: Assembling lesson...`);
      const lessonContent = this.assembleLesson(
        coursePack, practiceData, assessData,
        { topic, ageGroup, summary: coursePack.summary || '', outcomes: coursePack.outcomes || [] },
      );

      // 5. Update content with generated data
      this.logger.log(`[contentId=${contentId}] Step 5/5: Saving completed lesson...`);
      const title = coursePack.title || `${topic} 全方位学习课`;
      const subtitle = coursePack.summary || `围绕${topic}的六步综合课程`;

      await this.contentRepo.update(contentId, {
        title,
        subtitle,
        content: lessonContent as any,
        status: 'draft',
      });

      this.logger.log(`Lesson generation completed: contentId=${contentId}`);
    } catch (error: any) {
      this.logger.error(`Lesson generation FAILED: contentId=${contentId}, ${error?.message}`, error?.stack);
      // Mark as failed so frontend knows
      await this.contentRepo.update(contentId, {
        status: 'generation_failed',
        subtitle: `生成失败: ${error?.message || '未知错误'}`,
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
  ): Promise<Content> {
    const content = await this.contentRepo.findOne({ where: { id: contentId } });
    if (!content) throw new NotFoundException('Content not found');
    if (content.status !== 'draft') throw new ForbiddenException('Only draft lessons can be modified');

    const lesson = content.content as unknown as StructuredLessonContent;
    if (!lesson || lesson.type !== 'structured_lesson') {
      throw new ForbiddenException('Not a structured lesson');
    }

    // Send modification request to LLM
    const prompt = [
      'You are a curriculum designer. A parent has requested modifications to a lesson plan.',
      `Current lesson JSON:\n${JSON.stringify(lesson, null, 2)}`,
      `Parent's modification request: ${modification}`,
      'Rules:',
      '- Apply the modification to the relevant parts of the lesson.',
      '- Keep all content age-appropriate and in Chinese for learner-facing text.',
      '- Return the COMPLETE updated lesson JSON (same structure).',
      '- Do NOT change the "type", "version", or "steps[].id" fields.',
      '- Return strict JSON only. No markdown. No explanation.',
    ].join('\n');

    const llmResponse = await this.llmClient.generate(prompt);
    const updated = this.parseJson(llmResponse);

    if (updated && updated.steps) {
      const merged = {
        ...lesson,
        ...updated,
        type: 'structured_lesson' as const,
        version: 1,
      };
      content.content = merged as any;
      const saved = await this.contentRepo.save(content);
      this.logger.log(`Lesson modified: contentId=${contentId}`);
      return saved;
    }

    throw new Error('Failed to apply modifications. Please try again.');
  }

  async confirmAndPublish(
    contentId: number,
    parentId: number,
    childId: number,
  ): Promise<Content> {
    const content = await this.contentRepo.findOne({ where: { id: contentId } });
    if (!content) throw new NotFoundException('Content not found');
    if (content.status !== 'draft') throw new ForbiddenException('Only draft lessons can be confirmed');

    const lesson = content.content as unknown as StructuredLessonContent;

    // Create assignments for practice and assess steps
    const updatedSteps = [...lesson.steps];

    for (let i = 0; i < updatedSteps.length; i++) {
      const step = updatedSteps[i];
      if (step.id === 'practice' && step.module?.game) {
        const assignment = await this.assignmentService.create({
          parentId,
          childId,
          activityType: step.module.game.activityType || 'quiz',
          activityData: step.module.game.activityData || step.module.game,
          contentId: content.id,
          domain: content.domain,
          difficulty: content.difficulty,
        });
        updatedSteps[i] = { ...step, assignmentId: assignment.id };
      }

      if (step.id === 'assess' && step.module?.quiz) {
        const assignment = await this.assignmentService.create({
          parentId,
          childId,
          activityType: 'quiz',
          activityData: step.module.quiz,
          contentId: content.id,
          domain: content.domain,
          difficulty: content.difficulty,
        });
        updatedSteps[i] = { ...step, assignmentId: assignment.id };
      }
    }

    // Update content
    content.status = 'published';
    content.content = {
      ...lesson,
      steps: updatedSteps,
    } as any;

    const saved = await this.contentRepo.save(content);
    this.logger.log(`Lesson published: contentId=${contentId}, with ${updatedSteps.filter(s => s.assignmentId).length} assignments`);
    return saved;
  }

  async completeStep(params: CompleteStepParams): Promise<{
    success: boolean;
    recordId: number;
    abilityUpdated: boolean;
    achievementsAwarded: string[];
  }> {
    const { contentId, childId, stepId, score = 0, durationSeconds = 0, interactionData } = params;

    const content = await this.contentRepo.findOne({ where: { id: contentId } });
    if (!content) throw new NotFoundException('Content not found');

    const lesson = content.content as unknown as StructuredLessonContent;
    const step = lesson.steps.find(s => s.id === stepId);
    if (!step) throw new NotFoundException(`Step "${stepId}" not found`);

    // Check if this step has an assignment (practice/assess)
    if (step.assignmentId) {
      // Complete via assignment service
      const result = await this.learningTracker.recordActivity({
        type: 'assignment_completion',
        childId,
        assignmentId: step.assignmentId,
        contentId,
        domain: content.domain || 'language',
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
      type: 'content_completion',
      childId,
      contentId,
      domain: content.domain || 'language',
      score,
      durationSeconds,
      interactionData: {
        stepId,
        lessonType: 'structured_lesson',
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
      .createQueryBuilder('r')
      .where('r.userId = :childId', { childId })
      .andWhere('r.contentId = :contentId', { contentId })
      .getMany();

    const stepResults: Record<string, { status: string; score: number | null }> = {};
    const completedSteps: string[] = [];
    let totalScore = 0;
    let scoreCount = 0;

    for (const record of records) {
      const stepId = record.interactionData?.stepId;
      if (stepId) {
        const status = record.status === 'completed' ? 'completed' : 'in_progress';
        stepResults[stepId] = { status, score: record.score ?? null };
        if (status === 'completed') {
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

  async getTeachingVideo(contentId: number): Promise<{ filename: string; mimeType: string; body: Buffer }> {
    const content = await this.contentRepo.findOne({ where: { id: contentId } });
    if (!content) throw new NotFoundException('Content not found');

    const lesson = content.content as unknown as StructuredLessonContent;
    if (!lesson || lesson.type !== 'structured_lesson') {
      throw new ForbiddenException('Not a structured lesson');
    }

    const watchModule: Record<string, any> = lesson.steps.find((step) => step.id === 'watch')?.module || {};
    const listenModule: Record<string, any> = lesson.steps.find((step) => step.id === 'listen')?.module || {};
    const readModule: Record<string, any> = lesson.steps.find((step) => step.id === 'read')?.module || {};
    const writeModule: Record<string, any> = lesson.steps.find((step) => step.id === 'write')?.module || {};

    const packLike: Record<string, any> = {
      title: content.title || `${lesson.topic} 全方位学习课`,
      summary: lesson.summary || content.subtitle || '',
      topic: lesson.topic || content.topic || '',
      visualStory: watchModule.visualStory || {},
      videoLesson: watchModule.videoLesson || {},
      modules: {
        listening: listenModule.listening || {},
        reading: readModule.reading || {},
        writing: writeModule.writing || {},
      },
    };

    const body = await this.aiService.renderTeachingVideoFromPack(packLike);
    if (!body) {
      throw new Error('TEACHING_VIDEO_UNAVAILABLE');
    }

    const safeTitle = String(content.title || lesson.topic || `lesson-${contentId}`)
      .replace(/[\\/:*?"<>|]+/g, '-')
      .trim();

    return {
      filename: `${safeTitle || `lesson-${contentId}`}-teaching-video.mp4`,
      mimeType: 'video/mp4',
      body,
    };
  }

  private assembleLesson(
    coursePack: Record<string, any>,
    practiceData: Record<string, any> | null,
    assessData: Record<string, any> | null,
    meta: { topic: string; ageGroup: AgeGroup; summary: string; outcomes: string[] },
  ): StructuredLessonContent {
    const modules = coursePack.modules || {};
    const parentGuide = coursePack.parentGuide || {};

    const steps: LessonStep[] = [
      {
        id: 'watch',
        label: '看',
        icon: 'eye',
        order: 1,
        module: {
          type: 'video',
          visualStory: coursePack.visualStory || {},
          videoLesson: coursePack.videoLesson || {},
        },
      },
      {
        id: 'listen',
        label: '听',
        icon: 'ear',
        order: 2,
        module: {
          type: 'audio',
          listening: modules.listening || {},
        },
      },
      {
        id: 'read',
        label: '读',
        icon: 'book',
        order: 3,
        module: {
          type: 'reading',
          reading: modules.reading || {},
        },
      },
      {
        id: 'write',
        label: '写',
        icon: 'pen',
        order: 4,
        module: {
          type: 'writing',
          writing: modules.writing || {},
        },
      },
      {
        id: 'practice',
        label: '练',
        icon: 'gamepad',
        order: 5,
        module: {
          type: 'game',
          game: {
            activityType: this.resolveGameType(coursePack.focus || 'mixed'),
            activityData: practiceData || {},
          },
        },
      },
      {
        id: 'assess',
        label: '评',
        icon: 'clipboard-check',
        order: 6,
        module: {
          type: 'quiz',
          quiz: assessData || {},
        },
      },
    ];

    return {
      type: 'structured_lesson',
      version: 1,
      topic: meta.topic,
      ageGroup: meta.ageGroup,
      summary: meta.summary || `围绕${meta.topic}的六步综合课程`,
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

  private resolveGameType(focus: string): 'quiz' | 'true_false' | 'fill_blank' | 'matching' | 'connection' | 'sequencing' | 'puzzle' {
    const map: Record<string, 'quiz' | 'true_false' | 'fill_blank' | 'matching' | 'connection' | 'sequencing' | 'puzzle'> = {
      literacy: 'fill_blank',
      math: 'quiz',
      science: 'connection',
      mixed: 'matching',
    };
    return map[focus] || 'matching';
  }

  private buildFallbackActivity(type: string, topic: string, ageGroup: string): Record<string, any> {
    if (type === 'quiz') {
      return {
        type: 'quiz',
        title: `${topic} 测评`,
        topic,
        ageGroup,
        questions: [
          { question: `关于${topic}，你学到了什么？`, options: ['新知识', '新技能', '新发现', '全部都是'], correctIndex: 3, explanation: `${topic}包含很多有趣的内容` },
          { question: `你觉得${topic}最有趣的地方是？`, options: ['观察', '动手', '思考', '分享'], correctIndex: 0, explanation: '每个人都可以有自己的发现' },
          { question: `今天学习${topic}后，你记住了什么？`, options: ['一个关键词', '一个故事', '一个游戏', '以上都有'], correctIndex: 3, explanation: '学习可以有很多收获' },
        ],
      };
    }

    if (type === 'matching') {
      return {
        type: 'matching',
        title: `${topic} 配对游戏`,
        topic,
        ageGroup,
        pairs: [
          { id: 'p1', left: `${topic} 概念1`, right: '对应内容1' },
          { id: 'p2', left: `${topic} 概念2`, right: '对应内容2' },
          { id: 'p3', left: `${topic} 概念3`, right: '对应内容3' },
        ],
      };
    }

    // Generic fallback for other types
    return {
      type: type || 'quiz',
      title: `${topic} 练习`,
      topic,
      ageGroup,
      questions: [
        { question: `关于${topic}，下面哪个是对的？`, options: ['A', 'B', 'C'], correctIndex: 0, explanation: `${topic}的知识点` },
      ],
    };
  }

  private parseJson(text: string): Record<string, any> | null {
    if (!text) return null;

    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {}

    const codeBlock = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
    if (codeBlock?.[1]) {
      try {
        const parsed = JSON.parse(codeBlock[1].trim());
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch {}
    }

    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        const parsed = JSON.parse(text.slice(firstBrace, lastBrace + 1));
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch {}
    }

    return null;
  }
}
