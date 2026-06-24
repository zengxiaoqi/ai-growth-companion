import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { BehaviorTemplate } from '../../database/entities/behavior-template.entity';
import { PointRecord } from '../../database/entities/point-record.entity';
import { Gift } from '../../database/entities/gift.entity';
import { RedemptionRecord } from '../../database/entities/redemption-record.entity';

@Injectable()
export class RewardService {
  private readonly logger = new Logger('RewardService');

  constructor(
    @InjectRepository(BehaviorTemplate)
    private behaviorRepo: Repository<BehaviorTemplate>,
    @InjectRepository(PointRecord)
    private pointRecordRepo: Repository<PointRecord>,
    @InjectRepository(Gift)
    private giftRepo: Repository<Gift>,
    @InjectRepository(RedemptionRecord)
    private redemptionRepo: Repository<RedemptionRecord>,
  ) {}

  // ==================== 行为模板 ====================

  async getBehaviors(userId: number) {
    return this.behaviorRepo.find({
      where: { userId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async createBehavior(data: {
    userId: number;
    name: string;
    emoji?: string;
    points: number;
    category?: string;
    isDefault?: boolean;
    sortOrder?: number;
  }) {
    const behavior = this.behaviorRepo.create({
      userId: data.userId,
      name: data.name,
      emoji: data.emoji || '⭐',
      points: data.points,
      category: data.category || 'daily',
      isDefault: data.isDefault || false,
      sortOrder: data.sortOrder || 0,
    });
    return this.behaviorRepo.save(behavior);
  }

  async updateBehavior(id: number, data: Partial<BehaviorTemplate>) {
    await this.behaviorRepo.update(id, data);
    return this.behaviorRepo.findOne({ where: { id } });
  }

  async deleteBehavior(id: number) {
    return this.behaviorRepo.delete(id);
  }

  async toggleBehavior(id: number) {
    const behavior = await this.behaviorRepo.findOne({ where: { id } });
    if (!behavior) return null;
    behavior.isEnabled = !behavior.isEnabled;
    return this.behaviorRepo.save(behavior);
  }

  // ==================== 积分记录 ====================

  async getPointRecords(childId: number, page = 1, limit = 20) {
    const [records, total] = await this.pointRecordRepo.findAndCount({
      where: { childId },
      order: { recordedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { records, total, page, limit };
  }

  async recordPoints(data: {
    childId: number;
    templateId?: number;
    behaviorName: string;
    points: number;
    note?: string;
    recordedBy: number;
    recordedAt?: Date;
  }) {
    const record = this.pointRecordRepo.create({
      childId: data.childId,
      templateId: data.templateId || null,
      behaviorName: data.behaviorName,
      points: data.points,
      note: data.note || null,
      recordedBy: data.recordedBy,
      recordedAt: data.recordedAt || new Date(),
    });
    const saved = await this.pointRecordRepo.save(record);
    this.logger.log(
      `Points recorded: child=${data.childId}, behavior="${data.behaviorName}", points=${data.points}`,
    );
    return saved;
  }

  async deletePointRecord(id: number) {
    return this.pointRecordRepo.delete(id);
  }

  async getPointsSummary(childId: number) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // 总积分
    const allRecords = await this.pointRecordRepo.find({
      where: { childId },
    });
    const totalPoints = allRecords.reduce((sum, r) => sum + r.points, 0);

    // 今日积分
    const todayRecords = await this.pointRecordRepo.find({
      where: { childId, recordedAt: Between(todayStart, now) },
    });
    const todayPoints = todayRecords.reduce((sum, r) => sum + r.points, 0);

    // 本周积分
    const weekRecords = await this.pointRecordRepo.find({
      where: { childId, recordedAt: Between(weekStart, now) },
    });
    const weekPoints = weekRecords.reduce((sum, r) => sum + r.points, 0);

    // 本月积分
    const monthRecords = await this.pointRecordRepo.find({
      where: { childId, recordedAt: Between(monthStart, now) },
    });
    const monthPoints = monthRecords.reduce((sum, r) => sum + r.points, 0);

    // 连续打卡天数
    const streak = await this.calculateStreak(childId);

    return {
      totalPoints: Math.max(0, totalPoints),
      todayPoints,
      weekPoints,
      monthPoints,
      streak,
      todayRecordCount: todayRecords.length,
    };
  }

  private async calculateStreak(childId: number): Promise<number> {
    const records = await this.pointRecordRepo.find({
      where: { childId },
      order: { recordedAt: 'DESC' },
    });

    if (records.length === 0) return 0;

    const uniqueDays = new Set<string>();
    for (const r of records) {
      const d = new Date(r.recordedAt);
      uniqueDays.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    }

    const sortedDays = Array.from(uniqueDays).sort((a, b) => {
      const [ay, am, ad] = a.split('-').map(Number);
      const [by, bm, bd] = b.split('-').map(Number);
      return new Date(by, bm, bd).getTime() - new Date(ay, am, ad).getTime();
    });

    let streak = 1;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < sortedDays.length - 1; i++) {
      const [cy, cm, cd] = sortedDays[i].split('-').map(Number);
      const [ny, nm, nd] = sortedDays[i + 1].split('-').map(Number);
      const current = new Date(cy, cm, cd);
      const next = new Date(ny, nm, nd);
      const diff = (current.getTime() - next.getTime()) / (1000 * 60 * 60 * 24);

      if (diff === 1) {
        streak++;
      } else {
        break;
      }
    }

    // 检查最后一天是否是今天或昨天
    const [ly, lm, ld] = sortedDays[0].split('-').map(Number);
    const lastDay = new Date(ly, lm, ld);
    const dayDiff = (today.getTime() - lastDay.getTime()) / (1000 * 60 * 60 * 24);
    if (dayDiff > 1) return 0;

    return streak;
  }

  // ==================== 礼品管理 ====================

  async getGifts(userId: number) {
    return this.giftRepo.find({
      where: { userId },
      order: { sortOrder: 'ASC', pointsCost: 'ASC' },
    });
  }

  async createGift(data: {
    userId: number;
    name: string;
    emoji?: string;
    description?: string;
    pointsCost: number;
    category?: string;
    stock?: number;
    sortOrder?: number;
  }) {
    const gift = this.giftRepo.create({
      userId: data.userId,
      name: data.name,
      emoji: data.emoji || '🎁',
      description: data.description || null,
      pointsCost: data.pointsCost,
      category: data.category || 'other',
      stock: data.stock ?? -1,
      sortOrder: data.sortOrder || 0,
    });
    return this.giftRepo.save(gift);
  }

  async updateGift(id: number, data: Partial<Gift>) {
    await this.giftRepo.update(id, data);
    return this.giftRepo.findOne({ where: { id } });
  }

  async deleteGift(id: number) {
    return this.giftRepo.delete(id);
  }

  // ==================== 兑换管理 ====================

  async getRedemptions(childId: number) {
    return this.redemptionRepo.find({
      where: { childId },
      order: { redeemedAt: 'DESC' },
    });
  }

  async redeemGift(data: {
    childId: number;
    giftId: number;
    giftName: string;
    pointsCost: number;
  }) {
    // 检查积分是否足够
    const summary = await this.getPointsSummary(data.childId);
    if (summary.totalPoints < data.pointsCost) {
      throw new Error(`积分不足！当前 ${summary.totalPoints}，需要 ${data.pointsCost}`);
    }

    const record = this.redemptionRepo.create({
      childId: data.childId,
      giftId: data.giftId,
      giftName: data.giftName,
      pointsCost: data.pointsCost,
      status: 'pending',
    });
    const saved = await this.redemptionRepo.save(record);

    // 同时记录积分扣减
    await this.recordPoints({
      childId: data.childId,
      behaviorName: `兑换: ${data.giftName}`,
      points: -data.pointsCost,
      note: `兑换礼品 #${data.giftId}`,
      recordedBy: data.childId, // 系统自动记录
    });

    this.logger.log(
      `Redemption created: child=${data.childId}, gift="${data.giftName}", cost=${data.pointsCost}`,
    );
    return saved;
  }

  async updateRedemptionStatus(id: number, status: string, approvedBy?: number) {
    const data: Partial<RedemptionRecord> = { status };
    if (approvedBy) data.approvedBy = approvedBy;
    if (status === 'completed') data.completedAt = new Date();
    await this.redemptionRepo.update(id, data);
    return this.redemptionRepo.findOne({ where: { id } });
  }

  // ==================== 统计 ====================

  async getWeeklyStats(childId: number) {
    const now = new Date();
    const stats: { date: string; points: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const day = new Date(now);
      day.setDate(day.getDate() - i);
      const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const records = await this.pointRecordRepo.find({
        where: { childId, recordedAt: Between(dayStart, dayEnd) },
      });
      const points = records.reduce((sum, r) => sum + r.points, 0);
      const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
      stats.push({
        date: dayNames[day.getDay()],
        points,
      });
    }

    return stats;
  }

  // ==================== 种子数据 ====================

  async seedDefaultBehaviors(userId: number) {
    const defaults = [
      { name: '起床洗漱', emoji: '🌅', points: 2, category: 'daily', sortOrder: 1 },
      { name: '早餐', emoji: '🥣', points: 1, category: 'daily', sortOrder: 2 },
      { name: '学习/作业', emoji: '📚', points: 3, category: 'daily', sortOrder: 3 },
      { name: '中午吃饭', emoji: '🍱', points: 1, category: 'daily', sortOrder: 4 },
      { name: '晚上吃饭', emoji: '🍽️', points: 1, category: 'daily', sortOrder: 5 },
      { name: '晚上洗漱', emoji: '🪥', points: 2, category: 'daily', sortOrder: 6 },
      { name: '睡觉', emoji: '😴', points: 2, category: 'daily', sortOrder: 7 },
      { name: '课外阅读', emoji: '📖', points: 3, category: 'extra', sortOrder: 10 },
      { name: '运动', emoji: '🏃', points: 3, category: 'extra', sortOrder: 11 },
      { name: '帮忙做家务', emoji: '🧹', points: 2, category: 'extra', sortOrder: 12 },
      { name: '练琴/乐器', emoji: '🎹', points: 3, category: 'extra', sortOrder: 13 },
      { name: '画画', emoji: '🎨', points: 2, category: 'extra', sortOrder: 14 },
      { name: '发脾气/哭闹', emoji: '😤', points: -2, category: 'negative', sortOrder: 20 },
      { name: '超时使用电子设备', emoji: '📱', points: -3, category: 'negative', sortOrder: 21 },
      { name: '说谎', emoji: '❌', points: -5, category: 'negative', sortOrder: 22 },
      { name: '乱扔东西', emoji: '🗑️', points: -1, category: 'negative', sortOrder: 23 },
      { name: '迟到/拖延', emoji: '⏰', points: -1, category: 'negative', sortOrder: 24 },
      { name: '打人/骂人', emoji: '😠', points: -5, category: 'negative', sortOrder: 25 },
    ];

    const existing = await this.behaviorRepo.count({ where: { userId } });
    if (existing > 0) return { created: 0, message: '已有行为模板' };

    for (const d of defaults) {
      await this.behaviorRepo.save(
        this.behaviorRepo.create({
          userId,
          ...d,
          isDefault: true,
          isEnabled: true,
        }),
      );
    }

    this.logger.log(`Seeded ${defaults.length} default behaviors for user ${userId}`);
    return { created: defaults.length };
  }

  async seedDefaultGifts(userId: number) {
    const defaults = [
      {
        name: '看动画片 30分钟',
        emoji: '📺',
        pointsCost: 10,
        category: 'entertainment',
        sortOrder: 1,
      },
      { name: '选一个小零食', emoji: '🍪', pointsCost: 15, category: 'food', sortOrder: 2 },
      { name: '去公园玩', emoji: '🏞️', pointsCost: 30, category: 'outing', sortOrder: 3 },
      { name: '买一本新书', emoji: '📚', pointsCost: 50, category: 'study', sortOrder: 4 },
      { name: '买一个玩具', emoji: '🎮', pointsCost: 100, category: 'entertainment', sortOrder: 5 },
      { name: '去游乐园', emoji: '🎢', pointsCost: 200, category: 'outing', sortOrder: 6 },
    ];

    const existing = await this.giftRepo.count({ where: { userId } });
    if (existing > 0) return { created: 0, message: '已有礼品' };

    for (const d of defaults) {
      await this.giftRepo.save(
        this.giftRepo.create({
          userId,
          ...d,
          isEnabled: true,
          stock: -1,
        }),
      );
    }

    this.logger.log(`Seeded ${defaults.length} default gifts for user ${userId}`);
    return { created: defaults.length };
  }
}
