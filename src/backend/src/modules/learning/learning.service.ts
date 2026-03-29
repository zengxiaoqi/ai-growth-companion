import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LearningRecord } from '../../database/entities/learning-record.entity';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LearningService {
  constructor(
    @InjectRepository(LearningRecord)
    private recordRepository: Repository<LearningRecord>,
  ) {}

  async create(userId: number, contentId: number) {
    const record = this.recordRepository.create({
      uuid: uuidv4(),
      userId,
      contentId,
      status: 'in_progress',
    });
    return this.recordRepository.save(record);
  }

  async update(id: number, data: Partial<LearningRecord>) {
    await this.recordRepository.update(id, data);
    return this.findById(id);
  }

  async findById(id: number) {
    return this.recordRepository.findOne({ where: { id } });
  }

  async findByUser(userId: number, limit = 10) {
    return this.recordRepository.find({
      where: { userId },
      order: { startedAt: 'DESC' },
      take: limit,
      relations: ['content'],
    });
  }

  async getTodayStats(userId: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const records = await this.recordRepository
      .createQueryBuilder('record')
      .where('record.userId = :userId', { userId })
      .andWhere('record.startedAt >= :today', { today })
      .getMany();

    const totalMinutes = records.reduce((sum, r) => sum + (r.durationSeconds || 0), 0) / 60;
    const completedCount = records.filter(r => r.status === 'completed').length;

    return {
      totalMinutes: Math.round(totalMinutes),
      completedCount,
      recordsCount: records.length,
    };
  }
}