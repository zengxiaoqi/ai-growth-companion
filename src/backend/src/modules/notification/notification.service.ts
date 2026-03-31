import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../../database/entities/notification.entity';

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
  ) {}

  async create(data: Partial<Notification>): Promise<Notification> {
    const notification = this.notificationRepository.create(data);
    return this.notificationRepository.save(notification);
  }

  async findByUser(userId: number, limit = 20): Promise<Notification[]> {
    return this.notificationRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getUnreadCount(userId: number): Promise<number> {
    return this.notificationRepository.count({
      where: { userId, read: false },
    });
  }

  async markAsRead(id: number): Promise<Notification> {
    await this.notificationRepository.update(id, { read: true });
    const notification = await this.notificationRepository.findOne({ where: { id } });
    if (!notification) throw new NotFoundException('通知不存在');
    return notification;
  }

  async markAllAsRead(userId: number): Promise<void> {
    await this.notificationRepository.update(
      { userId, read: false },
      { read: true },
    );
  }

  async delete(id: number): Promise<void> {
    await this.notificationRepository.delete(id);
  }

  async notifyAchievement(userId: number, achievementName: string, _icon?: string) {
    return this.create({
      userId,
      title: '获得新成就！',
      message: `恭喜你获得了「${achievementName}」成就！`,
      type: 'achievement',
    });
  }

  async notifyLearningReminder(userId: number) {
    return this.create({
      userId,
      title: '学习提醒',
      message: '今天还没有开始学习哦，快来探索新知识吧！',
      type: 'reminder',
    });
  }
}
