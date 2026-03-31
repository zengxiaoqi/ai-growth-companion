import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Achievement } from '../../database/entities/achievement.entity';
import { NotificationService } from '../notification/notification.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AchievementsService {
  constructor(
    @InjectRepository(Achievement)
    private achievementRepository: Repository<Achievement>,
    private notificationService: NotificationService,
  ) {}

  async create(data: { userId: number; type: string; name: string; description?: string }) {
    const achievement = this.achievementRepository.create({
      uuid: uuidv4(),
      userId: data.userId,
      achievementType: data.type,
      achievementName: data.name,
      description: data.description,
    });
    const saved = await this.achievementRepository.save(achievement);

    // Send notification for new achievement
    await this.notificationService.notifyAchievement(
      data.userId,
      data.name,
    );

    return saved;
  }

  async findById(id: number) {
    return this.achievementRepository.findOne({ where: { id } });
  }

  async findByUser(userId: number) {
    return this.achievementRepository.find({
      where: { userId },
      order: { earnedAt: 'DESC' },
    });
  }

  async checkAndAward(userId: number, type: string): Promise<Achievement | null> {
    const existing = await this.achievementRepository.findOne({
      where: { userId, achievementType: type },
    });
    if (existing) return null;
    return this.create({ userId, type, name: this.getNameByType(type) });
  }

  private getNameByType(type: string): string {
    const names: Record<string, string> = {
      'first_lesson': '初次学习',
      'daily_goal': '每日目标',
      'week_streak': '连续学习',
      'language_master': '语言大师',
      'math_wizard': '数学小天才',
      'science_explorer': '科学探索者',
    };
    return names[type] || '成就';
  }
}