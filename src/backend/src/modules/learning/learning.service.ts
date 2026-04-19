import { Injectable, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { LearningRecord } from "../../database/entities/learning-record.entity";
import { ParentControl } from "../../database/entities/parent-control.entity";
import { SseService } from "../sse/sse.service";
import { v4 as uuidv4 } from "uuid";

@Injectable()
export class LearningService {
  constructor(
    @InjectRepository(LearningRecord)
    private recordRepository: Repository<LearningRecord>,
    @InjectRepository(ParentControl)
    private controlRepository: Repository<ParentControl>,
    private sseService: SseService,
  ) {}

  async create(userId: number, contentId: number) {
    // Check daily time limit from parent controls
    await this.enforceTimeLimit(userId);

    const record = this.recordRepository.create({
      uuid: uuidv4(),
      userId,
      contentId,
      status: "in_progress",
    });
    const saved = await this.recordRepository.save(record);

    // Notify parent via SSE
    const parentControl = await this.controlRepository.findOne({
      where: { childId: userId },
    });
    if (parentControl) {
      this.sseService.sendToUser(parentControl.parentId, "learning_started", {
        childId: userId,
        contentId,
        recordId: saved.id,
      });
    }

    return saved;
  }

  async update(id: number, data: Partial<LearningRecord>) {
    await this.recordRepository.update(id, data);
    const record = await this.findById(id);

    // Notify parent via SSE on completion
    if (record && data.status === "completed") {
      const parentControl = await this.controlRepository.findOne({
        where: { childId: record.userId },
      });
      if (parentControl) {
        this.sseService.sendToUser(
          parentControl.parentId,
          "learning_completed",
          {
            childId: record.userId,
            recordId: id,
            score: record.score,
          },
        );
      }
    }

    return record;
  }

  async findById(id: number) {
    return this.recordRepository.findOne({ where: { id } });
  }

  async findByUser(userId: number, limit = 10) {
    return this.recordRepository.find({
      where: { userId },
      order: { startedAt: "DESC" },
      take: limit,
      relations: ["content"],
    });
  }

  async getTodayStats(userId: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const records = await this.recordRepository
      .createQueryBuilder("record")
      .where("record.userId = :userId", { userId })
      .andWhere("record.startedAt >= :today", { today })
      .getMany();

    const totalMinutes =
      records.reduce((sum, r) => sum + (r.durationSeconds || 0), 0) / 60;
    const completedCount = records.filter(
      (r) => r.status === "completed",
    ).length;

    return {
      totalMinutes: Math.round(totalMinutes),
      completedCount,
      recordsCount: records.length,
    };
  }

  async getTodayStatsWithSources(userId: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const records = await this.recordRepository
      .createQueryBuilder("record")
      .where("record.userId = :userId", { userId })
      .andWhere("record.startedAt >= :today", { today })
      .getMany();

    const totalMinutes =
      records.reduce((sum, r) => sum + (r.durationSeconds || 0), 0) / 60;
    const completedCount = records.filter(
      (r) => r.status === "completed",
    ).length;

    // Breakdown by source
    const sources = {
      content: 0,
      assignment: 0,
      activity: 0,
      unknown: 0,
    };

    for (const r of records) {
      const source = r.interactionData?.source;
      if (source === "content_completion") sources.content++;
      else if (source === "assignment_completion") sources.assignment++;
      else if (source === "interactive_activity") sources.activity++;
      else sources.unknown++;
    }

    return {
      totalMinutes: Math.round(totalMinutes),
      completedCount,
      recordsCount: records.length,
      sources,
    };
  }

  private async enforceTimeLimit(userId: number) {
    // Find parent control for this child
    const control = await this.controlRepository.findOne({
      where: { childId: userId },
    });
    if (!control || !control.dailyLimitMinutes) return;

    const stats = await this.getTodayStats(userId);
    if (stats.totalMinutes >= control.dailyLimitMinutes) {
      throw new BadRequestException(
        `今日学习时间已达上限（${control.dailyLimitMinutes}分钟），请明天再来学习吧！`,
      );
    }
  }
}
