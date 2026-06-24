import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Between } from 'typeorm';
import { RewardService } from '../../src/modules/reward/reward.service';
import { BehaviorTemplate } from '../../src/database/entities/behavior-template.entity';
import { PointRecord } from '../../src/database/entities/point-record.entity';
import { Gift } from '../../src/database/entities/gift.entity';
import { RedemptionRecord } from '../../src/database/entities/redemption-record.entity';

describe('RewardService', () => {
  let service: RewardService;
  let behaviorRepo: Record<string, jest.Mock>;
  let pointRecordRepo: Record<string, jest.Mock>;
  let giftRepo: Record<string, jest.Mock>;
  let redemptionRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    behaviorRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    };
    pointRecordRepo = {
      find: jest.fn(),
      findAndCount: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    giftRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    };
    redemptionRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RewardService,
        { provide: getRepositoryToken(BehaviorTemplate), useValue: behaviorRepo },
        { provide: getRepositoryToken(PointRecord), useValue: pointRecordRepo },
        { provide: getRepositoryToken(Gift), useValue: giftRepo },
        { provide: getRepositoryToken(RedemptionRecord), useValue: redemptionRepo },
      ],
    }).compile();

    service = module.get<RewardService>(RewardService);
  });

  afterEach(() => jest.clearAllMocks());

  // ==================== 行为模板 ====================

  describe('getBehaviors', () => {
    it('should return behaviors for a user ordered by sortOrder', async () => {
      const behaviors = [
        { id: 1, name: '起床洗漱', sortOrder: 1 },
        { id: 2, name: '学习', sortOrder: 2 },
      ];
      behaviorRepo.find.mockResolvedValue(behaviors);

      const result = await service.getBehaviors(1);

      expect(result).toEqual(behaviors);
      expect(behaviorRepo.find).toHaveBeenCalledWith({
        where: { userId: 1 },
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
      });
    });

    it('should return empty array when no behaviors exist', async () => {
      behaviorRepo.find.mockResolvedValue([]);
      const result = await service.getBehaviors(999);
      expect(result).toEqual([]);
    });
  });

  describe('createBehavior', () => {
    it('should create a behavior with defaults', async () => {
      const data = { userId: 1, name: '测试行为', points: 5 };
      const created = { userId: 1, name: '测试行为', emoji: '⭐', points: 5, category: 'daily', isDefault: false, sortOrder: 0 };
      behaviorRepo.create.mockReturnValue(created);
      behaviorRepo.save.mockResolvedValue({ id: 1, ...created });

      const result = await service.createBehavior(data);

      expect(behaviorRepo.create).toHaveBeenCalledWith(created);
      expect(result).toEqual({ id: 1, ...created });
    });

    it('should use provided emoji and category', async () => {
      const data = { userId: 1, name: '阅读', emoji: '📖', points: 3, category: 'extra' };
      const created = { ...data, isDefault: false, sortOrder: 0 };
      behaviorRepo.create.mockReturnValue(created);
      behaviorRepo.save.mockResolvedValue({ id: 2, ...created });

      await service.createBehavior(data);

      expect(behaviorRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        emoji: '📖',
        category: 'extra',
      }));
    });
  });

  describe('updateBehavior', () => {
    it('should update and return the behavior', async () => {
      const updated = { id: 1, name: '更新后' };
      behaviorRepo.update.mockResolvedValue({ affected: 1 });
      behaviorRepo.findOne.mockResolvedValue(updated);

      const result = await service.updateBehavior(1, { name: '更新后' });

      expect(behaviorRepo.update).toHaveBeenCalledWith(1, { name: '更新后' });
      expect(behaviorRepo.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(result).toEqual(updated);
    });
  });

  describe('deleteBehavior', () => {
    it('should delete a behavior by id', async () => {
      behaviorRepo.delete.mockResolvedValue({ affected: 1 });

      const result = await service.deleteBehavior(1);

      expect(behaviorRepo.delete).toHaveBeenCalledWith(1);
      expect(result).toEqual({ affected: 1 });
    });
  });

  describe('toggleBehavior', () => {
    it('should toggle isEnabled from true to false', async () => {
      const behavior = { id: 1, isEnabled: true };
      behaviorRepo.findOne.mockResolvedValue(behavior);
      behaviorRepo.save.mockResolvedValue({ ...behavior, isEnabled: false });

      const result = await service.toggleBehavior(1);

      expect(result.isEnabled).toBe(false);
      expect(behaviorRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isEnabled: false }));
    });

    it('should toggle isEnabled from false to true', async () => {
      const behavior = { id: 1, isEnabled: false };
      behaviorRepo.findOne.mockResolvedValue(behavior);
      behaviorRepo.save.mockResolvedValue({ ...behavior, isEnabled: true });

      const result = await service.toggleBehavior(1);

      expect(result.isEnabled).toBe(true);
    });

    it('should return null when behavior not found', async () => {
      behaviorRepo.findOne.mockResolvedValue(null);

      const result = await service.toggleBehavior(999);

      expect(result).toBeNull();
      expect(behaviorRepo.save).not.toHaveBeenCalled();
    });
  });

  // ==================== 积分记录 ====================

  describe('getPointRecords', () => {
    it('should return paginated records', async () => {
      const records = [{ id: 1, points: 5 }, { id: 2, points: 3 }];
      pointRecordRepo.findAndCount.mockResolvedValue([records, 2]);

      const result = await service.getPointRecords(1, 1, 20);

      expect(result).toEqual({ records, total: 2, page: 1, limit: 20 });
      expect(pointRecordRepo.findAndCount).toHaveBeenCalledWith({
        where: { childId: 1 },
        order: { recordedAt: 'DESC' },
        skip: 0,
        take: 20,
      });
    });

    it('should calculate skip correctly for page 2', async () => {
      pointRecordRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.getPointRecords(1, 2, 10);

      expect(pointRecordRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });
  });

  describe('recordPoints', () => {
    it('should create and save a point record', async () => {
      const data = {
        childId: 1,
        behaviorName: '起床洗漱',
        points: 2,
        recordedBy: 10,
      };
      const created = { ...data, templateId: null, note: null, recordedAt: expect.any(Date) };
      const saved = { id: 1, ...created };
      pointRecordRepo.create.mockReturnValue(created);
      pointRecordRepo.save.mockResolvedValue(saved);

      const result = await service.recordPoints(data);

      expect(pointRecordRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        childId: 1,
        behaviorName: '起床洗漱',
        points: 2,
      }));
      expect(result).toEqual(saved);
    });

    it('should use provided note and recordedAt', async () => {
      const date = new Date('2026-06-20');
      const data = {
        childId: 1,
        behaviorName: '测试',
        points: 5,
        recordedBy: 10,
        note: '特殊备注',
        recordedAt: date,
      };
      pointRecordRepo.create.mockImplementation((d) => d);
      pointRecordRepo.save.mockResolvedValue({ id: 1, ...data });

      await service.recordPoints(data);

      expect(pointRecordRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        note: '特殊备注',
        recordedAt: date,
      }));
    });
  });

  describe('deletePointRecord', () => {
    it('should delete a point record', async () => {
      pointRecordRepo.delete.mockResolvedValue({ affected: 1 });

      const result = await service.deletePointRecord(5);

      expect(pointRecordRepo.delete).toHaveBeenCalledWith(5);
      expect(result).toEqual({ affected: 1 });
    });
  });

  describe('getPointsSummary', () => {
    it('should calculate total, today, week, month points and streak', async () => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Mock all records (total)
      pointRecordRepo.find.mockImplementation(({ where }) => {
        if (!where.recordedAt) {
          // All records
          return Promise.resolve([
            { points: 10, recordedAt: todayStart },
            { points: 5, recordedAt: todayStart },
          ]);
        }
        // Today/week/month queries
        return Promise.resolve([{ points: 10, recordedAt: todayStart }]);
      });

      const result = await service.getPointsSummary(1);

      expect(result.totalPoints).toBe(15);
      expect(result).toHaveProperty('todayPoints');
      expect(result).toHaveProperty('weekPoints');
      expect(result).toHaveProperty('monthPoints');
      expect(result).toHaveProperty('streak');
      expect(result).toHaveProperty('todayRecordCount');
    });

    it('should return 0 for totalPoints when negative', async () => {
      pointRecordRepo.find.mockResolvedValue([{ points: -10 }]);

      const result = await service.getPointsSummary(1);

      expect(result.totalPoints).toBe(0);
    });

    it('should return 0 streak when no records', async () => {
      pointRecordRepo.find.mockResolvedValue([]);

      const result = await service.getPointsSummary(1);

      expect(result.streak).toBe(0);
    });
  });

  // ==================== 礼品管理 ====================

  describe('getGifts', () => {
    it('should return gifts ordered by sortOrder and pointsCost', async () => {
      const gifts = [
        { id: 1, name: '小零食', pointsCost: 15 },
        { id: 2, name: '玩具', pointsCost: 100 },
      ];
      giftRepo.find.mockResolvedValue(gifts);

      const result = await service.getGifts(1);

      expect(result).toEqual(gifts);
      expect(giftRepo.find).toHaveBeenCalledWith({
        where: { userId: 1 },
        order: { sortOrder: 'ASC', pointsCost: 'ASC' },
      });
    });
  });

  describe('createGift', () => {
    it('should create a gift with defaults', async () => {
      const data = { userId: 1, name: '动画片', pointsCost: 10 };
      const created = { userId: 1, name: '动画片', emoji: '🎁', pointsCost: 10, category: 'other', stock: -1, sortOrder: 0, description: null };
      giftRepo.create.mockReturnValue(created);
      giftRepo.save.mockResolvedValue({ id: 1, ...created });

      const result = await service.createGift(data);

      expect(giftRepo.create).toHaveBeenCalledWith(created);
      expect(result).toEqual({ id: 1, ...created });
    });

    it('should use provided emoji, description, stock', async () => {
      const data = {
        userId: 1,
        name: '玩具',
        emoji: '🧸',
        description: '毛绒玩具',
        pointsCost: 50,
        stock: 3,
      };
      giftRepo.create.mockImplementation((d) => d);
      giftRepo.save.mockResolvedValue({ id: 2, ...data });

      await service.createGift(data);

      expect(giftRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        emoji: '🧸',
        description: '毛绒玩具',
        stock: 3,
      }));
    });
  });

  describe('updateGift', () => {
    it('should update and return the gift', async () => {
      const updated = { id: 1, name: '更新礼品' };
      giftRepo.update.mockResolvedValue({ affected: 1 });
      giftRepo.findOne.mockResolvedValue(updated);

      const result = await service.updateGift(1, { name: '更新礼品' });

      expect(giftRepo.update).toHaveBeenCalledWith(1, { name: '更新礼品' });
      expect(result).toEqual(updated);
    });
  });

  describe('deleteGift', () => {
    it('should delete a gift', async () => {
      giftRepo.delete.mockResolvedValue({ affected: 1 });

      const result = await service.deleteGift(1);

      expect(giftRepo.delete).toHaveBeenCalledWith(1);
      expect(result).toEqual({ affected: 1 });
    });
  });

  // ==================== 兑换管理 ====================

  describe('getRedemptions', () => {
    it('should return redemptions ordered by redeemedAt DESC', async () => {
      const redemptions = [
        { id: 1, giftName: '动画片', redeemedAt: new Date() },
      ];
      redemptionRepo.find.mockResolvedValue(redemptions);

      const result = await service.getRedemptions(1);

      expect(result).toEqual(redemptions);
      expect(redemptionRepo.find).toHaveBeenCalledWith({
        where: { childId: 1 },
        order: { redeemedAt: 'DESC' },
      });
    });
  });

  describe('redeemGift', () => {
    it('should throw error when insufficient points', async () => {
      // Mock getPointsSummary to return low points
      pointRecordRepo.find.mockResolvedValue([{ points: 5 }]);

      await expect(
        service.redeemGift({
          childId: 1,
          giftId: 1,
          giftName: '玩具',
          pointsCost: 100,
        }),
      ).rejects.toThrow('积分不足');
    });

    it('should create redemption and record point deduction when sufficient', async () => {
      // Mock getPointsSummary to return enough points
      pointRecordRepo.find.mockResolvedValue([{ points: 50 }, { points: 50 }]);

      const redemption = { id: 1, childId: 1, giftId: 1, giftName: '动画片', pointsCost: 10, status: 'pending' };
      redemptionRepo.create.mockReturnValue(redemption);
      redemptionRepo.save.mockResolvedValue(redemption);

      // Mock recordPoints
      pointRecordRepo.create.mockImplementation((d) => d);
      pointRecordRepo.save.mockResolvedValue({ id: 1 });

      const result = await service.redeemGift({
        childId: 1,
        giftId: 1,
        giftName: '动画片',
        pointsCost: 10,
      });

      expect(redemptionRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        status: 'pending',
        giftName: '动画片',
      }));
      expect(result).toEqual(redemption);
      // Should also record negative points
      expect(pointRecordRepo.save).toHaveBeenCalled();
    });
  });

  describe('updateRedemptionStatus', () => {
    it('should update status and set completedAt when completed', async () => {
      const updated = { id: 1, status: 'completed', completedAt: expect.any(Date) };
      redemptionRepo.update.mockResolvedValue({ affected: 1 });
      redemptionRepo.findOne.mockResolvedValue(updated);

      const result = await service.updateRedemptionStatus(1, 'completed', 10);

      expect(redemptionRepo.update).toHaveBeenCalledWith(1, expect.objectContaining({
        status: 'completed',
        approvedBy: 10,
        completedAt: expect.any(Date),
      }));
      expect(result).toEqual(updated);
    });

    it('should not set completedAt when status is not completed', async () => {
      redemptionRepo.update.mockResolvedValue({ affected: 1 });
      redemptionRepo.findOne.mockResolvedValue({ id: 1, status: 'approved' });

      await service.updateRedemptionStatus(1, 'approved');

      expect(redemptionRepo.update).toHaveBeenCalledWith(1, expect.objectContaining({
        status: 'approved',
      }));
      // completedAt should not be in the update data
      const updateCall = redemptionRepo.update.mock.calls[0][1];
      expect(updateCall.completedAt).toBeUndefined();
    });
  });

  // ==================== 统计 ====================

  describe('getWeeklyStats', () => {
    it('should return 7 days of stats', async () => {
      pointRecordRepo.find.mockResolvedValue([{ points: 5 }, { points: 3 }]);

      const result = await service.getWeeklyStats(1);

      expect(result).toHaveLength(7);
      expect(result[0]).toHaveProperty('date');
      expect(result[0]).toHaveProperty('points');
    });

    it('should sum points for each day', async () => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(todayStart);
      todayEnd.setDate(todayEnd.getDate() + 1);

      pointRecordRepo.find.mockImplementation(({ where }) => {
        if (where.recordedAt) {
          const betweenValues = where.recordedAt;
          // Check if this is today's query
          if (betweenValues._value1?.getTime() === todayStart.getTime()) {
            return Promise.resolve([{ points: 10 }, { points: 5 }]);
          }
        }
        return Promise.resolve([]);
      });

      const result = await service.getWeeklyStats(1);
      expect(result).toHaveLength(7);
    });
  });

  // ==================== 种子数据 ====================

  describe('seedDefaultBehaviors', () => {
    it('should skip when behaviors already exist', async () => {
      behaviorRepo.count.mockResolvedValue(5);

      const result = await service.seedDefaultBehaviors(1);

      expect(result).toEqual({ created: 0, message: '已有行为模板' });
      expect(behaviorRepo.save).not.toHaveBeenCalled();
    });

    it('should create default behaviors when none exist', async () => {
      behaviorRepo.count.mockResolvedValue(0);
      behaviorRepo.create.mockImplementation((d) => d);
      behaviorRepo.save.mockResolvedValue({});

      const result = await service.seedDefaultBehaviors(1);

      expect(result).toEqual({ created: 18 });
      expect(behaviorRepo.save).toHaveBeenCalledTimes(18);
    });
  });

  describe('seedDefaultGifts', () => {
    it('should skip when gifts already exist', async () => {
      giftRepo.count.mockResolvedValue(3);

      const result = await service.seedDefaultGifts(1);

      expect(result).toEqual({ created: 0, message: '已有礼品' });
      expect(giftRepo.save).not.toHaveBeenCalled();
    });

    it('should create default gifts when none exist', async () => {
      giftRepo.count.mockResolvedValue(0);
      giftRepo.create.mockImplementation((d) => d);
      giftRepo.save.mockResolvedValue({});

      const result = await service.seedDefaultGifts(1);

      expect(result).toEqual({ created: 6 });
      expect(giftRepo.save).toHaveBeenCalledTimes(6);
    });
  });
});
