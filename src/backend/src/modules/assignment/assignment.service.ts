import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Assignment } from '../../database/entities/assignment.entity';
import { GenerateActivityTool } from '../ai/agent/tools/generate-activity';
import { LearningTrackerService } from '../learning/learning-tracker.service';
import { LearningArchiveService } from '../learning/learning-archive.service';
import { UsersService } from '../users/users.service';

const ACTIVITY_GENERATION_TIMEOUT_MS = 45000;

@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);

  constructor(
    @InjectRepository(Assignment)
    private readonly assignmentRepo: Repository<Assignment>,
    private readonly generateActivityTool: GenerateActivityTool,
    private readonly learningTracker: LearningTrackerService,
    private readonly learningArchive: LearningArchiveService,
    private readonly usersService: UsersService,
  ) {}

  async create(data: {
    parentId: number;
    childId: number;
    activityType: string;
    activityData?: any;
    contentId?: number;
    domain?: string;
    difficulty?: number;
    dueDate?: string;
  }): Promise<Assignment> {
    const child = await this.usersService.findById(data.childId);
    if (!child || child.type !== 'child') {
      throw new BadRequestException('Child not found');
    }
    if (child.parentId !== data.parentId) {
      throw new ForbiddenException('You can only assign homework to your own child');
    }

    let activityData = data.activityData;

    if (this.shouldGenerateActivityData(activityData)) {
      const topic = this.resolveTopic(activityData?.topic, data.domain);
      const difficulty = data.difficulty || 1;
      const ageGroup = difficulty <= 1 ? '3-4' : '5-6';

      activityData = await this.generateActivityDataByAI(
        {
          activityType: data.activityType,
          topic,
          difficulty,
          ageGroup,
          domain: data.domain,
        },
        { strict: true },
      );
    }

    const assignment = this.assignmentRepo.create({
      uuid: uuidv4(),
      parentId: data.parentId,
      childId: data.childId,
      activityType: data.activityType,
      activityData,
      contentId: data.contentId,
      domain: data.domain,
      difficulty: data.difficulty || 1,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      status: 'pending',
    });
    const saved = await this.assignmentRepo.save(assignment);

    try {
      await this.learningArchive.createStudyPlanRecord({
        childId: data.childId,
        parentId: data.parentId,
        sourceType: 'parent_assignment',
        sourceId: saved.id,
        title: activityData?.topic || `${saved.activityType} assignment`,
        planContent: {
          activityType: saved.activityType,
          domain: saved.domain,
          difficulty: saved.difficulty,
          dueDate: saved.dueDate,
          activityData: saved.activityData,
        },
        status: saved.status,
      });
    } catch (err: any) {
      this.logger.warn(`Failed to create study plan record for assignment ${saved.id}: ${err.message}`);
    }

    return saved;
  }

  async findByChild(childId: number): Promise<Assignment[]> {
    return this.assignmentRepo.find({
      where: { childId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByParent(parentId: number): Promise<Assignment[]> {
    return this.assignmentRepo.find({
      where: { parentId },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: number): Promise<Assignment> {
    const assignment = await this.assignmentRepo.findOne({ where: { id } });
    if (!assignment) throw new NotFoundException(`Assignment ${id} not found`);

    await this.ensureActivityData(assignment);

    return assignment;
  }

  async update(
    id: number,
    parentId: number,
    data: {
      activityType?: string;
      activityData?: any;
      domain?: string;
      difficulty?: number;
      dueDate?: string | null;
      topic?: string;
    },
  ): Promise<Assignment> {
    const assignment = await this.findById(id);
    this.assertParentCanManagePendingAssignment(assignment, parentId);

    const nextActivityType = data.activityType || assignment.activityType;
    const nextDomain = data.domain ?? assignment.domain;
    const nextDifficulty = data.difficulty || assignment.difficulty || 1;
    const nextAgeGroup = nextDifficulty <= 1 ? '3-4' : '5-6';

    let nextActivityData = data.activityData ?? assignment.activityData;
    if (data.topic !== undefined) {
      const sanitizedTopic = data.topic.trim();
      nextActivityData = {
        ...(nextActivityData && typeof nextActivityData === 'object' ? nextActivityData : {}),
        topic: sanitizedTopic,
      };
    }

    const shouldRegenerate =
      data.activityType !== undefined ||
      data.topic !== undefined ||
      this.shouldGenerateActivityData(nextActivityData);

    if (shouldRegenerate) {
      const topic = this.resolveTopic(nextActivityData?.topic, nextDomain);
      nextActivityData = await this.generateActivityDataByAI(
        {
          activityType: nextActivityType,
          topic,
          difficulty: nextDifficulty,
          ageGroup: nextAgeGroup,
          domain: nextDomain,
          assignmentId: assignment.id,
        },
        { strict: true },
      );
    }

    assignment.activityType = nextActivityType;
    assignment.activityData = nextActivityData;
    assignment.domain = nextDomain;
    assignment.difficulty = nextDifficulty;
    if (data.dueDate !== undefined) {
      assignment.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    }

    return this.assignmentRepo.save(assignment);
  }

  async remove(id: number, parentId: number): Promise<{ success: boolean }> {
    const assignment = await this.findById(id);
    this.assertParentCanManagePendingAssignment(assignment, parentId);
    await this.assignmentRepo.remove(assignment);
    return { success: true };
  }

  private assertParentCanManagePendingAssignment(assignment: Assignment, parentId: number): void {
    if (assignment.parentId !== parentId) {
      throw new ForbiddenException('You can only manage your own assignments');
    }
    if (assignment.status !== 'pending') {
      throw new BadRequestException('Only pending assignments can be edited or deleted');
    }
  }

  private async ensureActivityData(assignment: Assignment): Promise<void> {
    const data = assignment.activityData;
    if (this.shouldGenerateActivityData(data)) {
      const topic = this.resolveTopic(data?.topic, assignment.domain);
      const difficulty = assignment.difficulty || 1;
      const ageGroup = difficulty <= 1 ? '3-4' : '5-6';

      const generated = await this.generateActivityDataByAI(
        {
          activityType: assignment.activityType,
          topic,
          difficulty,
          ageGroup,
          domain: assignment.domain,
          assignmentId: assignment.id,
        },
        { strict: false },
      );

      if (generated) {
        assignment.activityData = generated;
        await this.assignmentRepo.save(assignment);
      }
    }
  }

  private shouldGenerateActivityData(activityData: any): boolean {
    return !this.hasStructuredActivityData(activityData);
  }

  private hasStructuredActivityData(activityData: any): boolean {
    if (!activityData || typeof activityData !== 'object') return false;

    return (
      (Array.isArray(activityData.questions) && activityData.questions.length > 0) ||
      (Array.isArray(activityData.statements) && activityData.statements.length > 0) ||
      (Array.isArray(activityData.sentences) && activityData.sentences.length > 0) ||
      (Array.isArray(activityData.pairs) && activityData.pairs.length > 0) ||
      ((Array.isArray(activityData.leftItems) && activityData.leftItems.length > 0) &&
        (Array.isArray(activityData.rightItems) && activityData.rightItems.length > 0) &&
        (Array.isArray(activityData.connections) && activityData.connections.length > 0)) ||
      (Array.isArray(activityData.items) && activityData.items.length > 0) ||
      (Array.isArray(activityData.pieces) && activityData.pieces.length > 0)
    );
  }

  private resolveTopic(topic?: string, domain?: string): string {
    const normalizedTopic = typeof topic === 'string' ? topic.trim() : '';
    const normalizedDomain = typeof domain === 'string' ? domain.trim() : '';
    return normalizedTopic || normalizedDomain || 'general';
  }

  private async generateActivityDataByAI(
    params: {
      activityType: string;
      topic: string;
      difficulty: number;
      ageGroup: string;
      domain?: string;
      assignmentId?: number;
    },
    options: { strict: boolean },
  ): Promise<any | null> {
    const scope = params.assignmentId ? `assignment ${params.assignmentId}` : 'new assignment';

    try {
      const jsonStr = await this.withTimeout(
        this.generateActivityTool.execute({
          type: params.activityType as any,
          topic: params.topic,
          difficulty: params.difficulty,
          ageGroup: params.ageGroup,
          domain: params.domain,
        }),
        ACTIVITY_GENERATION_TIMEOUT_MS,
      );

      const generated = JSON.parse(jsonStr);
      if (!this.hasStructuredActivityData(generated)) {
        throw new Error('AI returned no playable content');
      }

      this.logger.log(
        `Generated activity data for ${scope} topic="${params.topic}" type=${params.activityType}`,
      );
      return generated;
    } catch (err: any) {
      this.logger.warn(
        `AI generation failed for ${scope}: ${err.message}`,
      );

      if (options.strict) {
        throw new BadRequestException('AI 生成题目失败，请稍后重试');
      }

      return null;
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout | null = null;

    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`generation timeout after ${timeoutMs}ms`));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async complete(id: number, result: {
    score: number;
    resultData?: any;
  }): Promise<Assignment> {
    const assignment = await this.findById(id);
    assignment.status = 'completed';
    assignment.completedAt = new Date();
    assignment.score = result.score;
    assignment.resultData = result.resultData;
    const saved = await this.assignmentRepo.save(assignment);

    try {
      await this.learningTracker.recordActivity({
        type: 'assignment_completion',
        childId: assignment.childId,
        assignmentId: assignment.id,
        domain: assignment.domain || 'language',
        score: result.score,
        activityType: assignment.activityType,
        topic: assignment.activityData?.topic,
        interactionData: result.resultData,
        metadata: {
          activityType: assignment.activityType,
          difficulty: assignment.difficulty,
          resultData: result.resultData,
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to record learning activity for assignment ${id}: ${err.message}`);
    }

    return saved;
  }

  async getPendingCount(childId: number): Promise<number> {
    return this.assignmentRepo.count({
      where: { childId, status: 'pending' },
    });
  }
}
