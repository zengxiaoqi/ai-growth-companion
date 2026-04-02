import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Assignment } from '../../database/entities/assignment.entity';
import { GenerateActivityTool } from '../ai/agent/tools/generate-activity';

@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);

  constructor(
    @InjectRepository(Assignment)
    private readonly assignmentRepo: Repository<Assignment>,
    private readonly generateActivityTool: GenerateActivityTool,
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
    let activityData = data.activityData;

    // If activityData only contains a topic (no actual game content),
    // auto-generate the full activity data via LLM
    if (
      !activityData ||
      (activityData.topic &&
        !activityData.questions &&
        !activityData.statements &&
        !activityData.sentences &&
        !activityData.pairs &&
        !activityData.leftItems &&
        !activityData.items &&
        !activityData.pieces)
    ) {
      try {
        const topic = activityData?.topic || data.domain || '综合';
        const difficulty = data.difficulty || 1;
        const ageGroup = difficulty <= 1 ? '3-4' : '5-6';
        const jsonStr = await this.generateActivityTool.execute({
          type: data.activityType as any,
          topic,
          difficulty,
          ageGroup,
          domain: data.domain,
        });
        activityData = JSON.parse(jsonStr);
        this.logger.log(`Auto-generated activity data for topic "${topic}" (${data.activityType})`);
      } catch (err) {
        this.logger.warn(`Failed to generate activity data: ${err.message}, using fallback`);
      }
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
    return this.assignmentRepo.save(assignment);
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

    // If activityData only has a topic, auto-generate the full game content
    await this.ensureActivityData(assignment);

    return assignment;
  }

  /** Generate full game data if the assignment only has a topic string */
  private async ensureActivityData(assignment: Assignment): Promise<void> {
    const data = assignment.activityData;
    if (
      !data ||
      (data.topic &&
        !data.questions &&
        !data.statements &&
        !data.sentences &&
        !data.pairs &&
        !data.leftItems &&
        !data.items &&
        !data.pieces)
    ) {
      try {
        const topic = data?.topic || assignment.domain || '综合';
        const difficulty = assignment.difficulty || 1;
        const ageGroup = difficulty <= 1 ? '3-4' : '5-6';
        const jsonStr = await this.generateActivityTool.execute({
          type: assignment.activityType as any,
          topic,
          difficulty,
          ageGroup,
          domain: assignment.domain,
        });
        assignment.activityData = JSON.parse(jsonStr);
        await this.assignmentRepo.save(assignment);
        this.logger.log(`Generated activity data for assignment ${assignment.id}, topic "${topic}"`);
      } catch (err) {
        this.logger.warn(`Failed to generate activity data for assignment ${assignment.id}: ${err.message}`);
      }
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
    return this.assignmentRepo.save(assignment);
  }

  async getPendingCount(childId: number): Promise<number> {
    return this.assignmentRepo.count({
      where: { childId, status: 'pending' },
    });
  }
}
