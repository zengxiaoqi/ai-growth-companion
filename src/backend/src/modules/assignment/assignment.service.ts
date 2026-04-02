import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Assignment } from '../../database/entities/assignment.entity';

@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);

  constructor(
    @InjectRepository(Assignment)
    private readonly assignmentRepo: Repository<Assignment>,
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
    const assignment = this.assignmentRepo.create({
      uuid: uuidv4(),
      parentId: data.parentId,
      childId: data.childId,
      activityType: data.activityType,
      activityData: data.activityData,
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
    return assignment;
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
