import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
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

      expect(behaviorRepo.find).toHaveBeenCalledWith({
        where: { userId: 1 },
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
      });
      expect(result).toEqual(behaviors);
    });

    it('should return empty array when no behaviors exist', async () => {
      behaviorRepo.find.mockResolvedValue([]);

      const result = await service.getBehaviors(999);
      expect(result).toEqual([]);
    });
  });

  describe('createBehavior', () => {
    it('should create a behavior with defaults', async () => {
      const data = { userId: 1, name: '阅读', points: 3 };
      const saved = { id: 1, userId: 1, name: '阅读', emoji: '⭐', points: 3, category: 'daily' };
      behaviorRepo.create.mockImplementation((d) => d);
      behaviorRepo.save.mockResolvedValue(saved);

      const result = await service.createBehavior(data);

      expect(behaviorRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          name: '阅读',
          emoji: '⭐',
          points: 3,
          category: 'daily',
          isDefault: false,
          sortOrder: 0,
        }),
      );
      expect(result).toEqual(saved);
    });

    it('should use provided emoji, category, and sortOrder', async () => {
      const data = {
        userId: 1,
        name: '运动',
        emoji: '🏃',
        points: 5,
        category: 'extra',
        sortOrder: 10,
      };
      behaviorRepo.create.mockImplementation((d) => d);
      behaviorRepo.save.mockResolvedValue({});

      await service.createBehavior(data);

      expect(behaviorRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          emoji: '🏃',
          category: 'extra',
          sortOrder: 10,
        }),
      );
    });
  });

  describe('updateBehavior', () => {
    it('should update and return the behavior', async () => {
      const updated = { id: 1, name: '新名称' };
      behaviorRepo.update.mockResolvedValue({ affected: 1 });
      behaviorRepo.findOne.mockResolvedValue(updated);

      const result = await service.updateBehavior(1, { name: '新名称' });

      expect(behaviorRepo.update).toHaveBeenCalledWith(1, { name: '新名称' });
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
      expect(behaviorRepo.save).toHaveBeenCalled();
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
    it('should return paginated point records', async () => {
      const records = [{ id: 1, points: 3 }, { id: 2, points: -1 }];
      pointRecordRepo.findAndCount.mockResolvedValue([records, 2]);

      const result = await service.getPointRecords(1, 1, 20);

      expect(pointRecordRepo.findAndCount).toHaveBeenCalledWith({
        where: { childId: 1 },
        order: { recordedAt: 'DESC' },
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({ records, total: 2, page: 1, limit: 20 });
    });

    it('should calculate correct skip for page 2', async () => {
      pointRecordRepo.findAndCount.mockResolvedValue([[], 25]);

      await service.getPointRecords(1, 2, 10);

      expect(pointRecordRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('should use default page=1 and limit=20', async () => {
      pointRecordRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.getPointRecords(1);

      expect(pointRecordRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
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
      const saved = { id: 1, ...data, recordedAt: expect.any(Date) };
      pointRecordRepo.create.mockImplementation((d) => d);
      pointRecordRepo.save.mockResolvedValue(saved);

      const result = await service.recordPoints(data);

      expect(pointRecordRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          childId: 1,
          behaviorName: '起床洗漱',
          points: 2,
          recordedBy: 10,
          templateId: null,
          note: null,
        }),
      );
      expect(result).toEqual(saved);
    });

    it('should record negative points for bad behavior', async () => {
      const data = {
        childId: 1,
        behaviorName: '发脾气',
        points: -2,
        recordedBy: 10,
      };
      pointRecordRepo.create.mockImplementation((d) => d);
      pointRecordRepo.save.mockResolvedValue({ id: 1, ...data });

      const result = await service.recordPoints(data);

      expect(pointRecordRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ points: -2 }),
      );
    });

    it('should use provided templateId and note', async () => {
      const data = {
        childId: 1,
        templateId: 5,
        behaviorName: '阅读',
        points: 3,
        note: '读了30分钟',
        recordedBy: 10,
      };
      pointRecordRepo.create.mockImplementation((d) => d);
      pointRecordRepo.save.mockResolvedValue({});

      await service.recordPoints(data);

      expect(pointRecordRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          templateId: 5,
          note: '读了30分钟',
        }),
      );
    });
  });

  describe('deletePointRecord', () => {
    it('should delete a point record', async () => {
      pointRecordRepo.delete.mockResolvedValue({ affected: 1 });

      const result = await service.deletePointRecord(1);

      expect(pointRecordRepo.delete).toHaveBeenCalledWith(1);
      expect(result).toEqual({ affected: 1 });
    });
  });

  describe('getPointsSummary', () => {
    it('should calculate total, today, week, month points and streak', async () => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Mock all records (total)
      const allRecords = [
        { points: 5, recordedAt: new Date() },
        { points: -2, recordedAt: new Date() },
        { points: 3, recordedAt: new Date('2026-01-01') },
      ];
      pointRecordRepo.find.mockImplementation(({ where }) => {
        if (!where.recordedAt) return Promise.resolve(allRecords);
        // today
        if (where.recordedAt.from?.getTime() === todayStart.getTime()) {
          return Promise.resolve([{ points: 5, recordedAt: new Date() }]);
        }
        // week and month - return same for simplicity
        return Promise.resolve([{ points: 5, recordedAt: new Date() }]);
      });

      const result = await service.getPointsSummary(1);

      expect(result.totalPoints).toBe(6); // 5 + (-2) + 3
      expect(result.todayPoints).toBe(5);
      expect(result).toHaveProperty('weekPoints');
      expect(result).toHaveProperty('monthPoints');
      expect(result).toHaveProperty('streak');
      expect(result).toHaveProperty('todayRecordCount');
    });

    it('should return 0 totalPoints when negative', async () => {
      pointRecordRepo.find.mockResolvedValue([{ points: -10, recordedAt: new Date() }]);

      const result = await service.getPointsSummary(1);

      expect(result.totalPoints).toBe(0); // Math.max(0, -10)
    });

    it('should return zero summary when no records exist', async () => {
      pointRecordRepo.find.mockResolvedValue([]);

      const result = await service.getPointsSummary(1);

      expect(result.totalPoints).toBe(0);
      expect(result.todayPoints).toBe(0);
      expect(result.weekPoints).toBe(0);
      expect(result.monthPoints).toBe(0);
      expect(result.streak).toBe(0);
      expect(result.todayRecordCount).toBe(0);
    });
  });

  describe('calculateStreak (via getPointsSummary)', () => {
    it('should return 0 when no records', async () => {
      pointRecordRepo.find.mockResolvedValue([]);

      const result = await service.getPointsSummary(1);
      expect(result.streak).toBe(0);
    });

    it('should return 1 when only today has records', async () => {
      const today = new Date();
      pointRecordRepo.find.mockResolvedValue([
        { points: 2, recordedAt: today },
      ]);

      const result = await service.getPointsSummary(1);
      expect(result.streak).toBe(1);
    });

    it('should return 2 for consecutive today and yesterday', async () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      pointRecordRepo.find.mockResolvedValue([
        { points: 2, recordedAt: today },
        { points: 3, recordedAt: yesterday },
      ]);

      const result = await service.getPointsSummary(1);
      expect(result.streak).toBe(2);
    });

    it('should return 0 when last record is older than yesterday', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 5);

      pointRecordRepo.find.mockResolvedValue([
        { points: 2, recordedAt: oldDate },
      ]);

      const result = await service.getPointsSummary(1);
      expect(result.streak).toBe(0);
    });
  });

  // ==================== 礼品管理 ====================

  describe('getGifts', () => {
    it('should return gifts ordered by sortOrder and pointsCost', async () => {
      const gifts = [
        { id: 1, name: '零食', pointsCost: 15 },
        { id: 2, name: '玩具', pointsCost: 100 },
      ];
      giftRepo.find.mockResolvedValue(gifts);

      const result = await service.getGifts(1);

      expect(giftRepo.find).toHaveBeenCalledWith({
        where: { userId: 1 },
        order: { sortOrder: 'ASC', pointsCost: 'ASC' },
      });
      expect(result).toEqual(gifts);
    });
  });

  describe('createGift', () => {
    it('should create a gift with defaults', async () => {
      const data = { userId: 1, name: '玩具', pointsCost: 100 };
      const saved = { id: 1, ...data, emoji: '🎁', category: 'other', stock: -1 };
      giftRepo.create.mockImplementation((d) => d);
      giftRepo.save.mockResolvedValue(saved);

      const result = await service.createGift(data);

      expect(giftRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          name: '玩具',
          emoji: '🎁',
          pointsCost: 100,
          category: 'other',
          stock: -1,
          sortOrder: 0,
        }),
      );
      expect(result).toEqual(saved);
    });

    it('should use provided emoji, description, category, stock', async () => {
      const data = {
        userId: 1,
        name: '书',
        emoji: '📚',
        description: '一本好书',
        pointsCost: 50,
        category: 'study',
        stock: 5,
        sortOrder: 3,
      };
      giftRepo.create.mockImplementation((d) => d);
      giftRepo.save.mockResolvedValue({});

      await service.createGift(data);

      expect(giftRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          emoji: '📚',
          description: '一本好书',
          category: 'study',
          stock: 5,
          sortOrder: 3,
        }),
      );
    });
  });

  describe('updateGift', () => {
    it('should update and return the gift', async () => {
      const updated = { id: 1, name: '新礼品', pointsCost: 200 };
      giftRepo.update.mockResolvedValue({ affected: 1 });
      giftRepo.findOne.mockResolvedValue(updated);

      const result = await service.updateGift(1, { pointsCost: 200 });

      expect(giftRepo.update).toHaveBeenCalledWith(1, { pointsCost: 200 });
      expect(result).toEqual(updated);
    });
  });

  describe('deleteGift', () => {
    it('should delete a gift by id', async () => {
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
        { id: 2, redeemedAt: new Date('2026-06-20') },
        { id: 1, redeemedAt: new Date('2026-06-15') },
      ];
      redemptionRepo.find.mockResolvedValue(redemptions);

      const result = await service.getRedemptions(1);

      expect(redemptionRepo.find).toHaveBeenCalledWith({
        where: { childId: 1 },
        order: { redeemedAt: 'DESC' },
      });
      expect(result).toEqual(redemptions);
    });
  });

  describe('redeemGift', () => {
    it('should create redemption and record point deduction when points sufficient', async () => {
      // Mock getPointsSummary to return enough points
      pointRecordRepo.find.mockResolvedValue([
        { points: 10, recordedAt: new Date() },
        { points: 20, recordedAt: new Date() },
      ]);

      const redemptionData = {
        childId: 1,
        giftId: 1,
        giftName: '零食',
        pointsCost: 15,
      };
      const savedRedemption = { id: 1, ...redemptionData, status: 'pending' };
      redemptionRepo.create.mockImplementation((d) => d);
      redemptionRepo.save.mockResolvedValue(savedRedemption);
      pointRecordRepo.create.mockImplementation((d) => d);
      pointRecordRepo.save.mockResolvedValue({});

      const result = await service.redeemGift(redemptionData);

      expect(result).toEqual(savedRedemption);
      expect(redemptionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          childId: 1,
          giftId: 1,
          giftName: '零食',
          pointsCost: 15,
          status: 'pending',
        }),
      );
      // Should also record negative points
      expect(pointRecordRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          behaviorName: '兑换: 零食',
          points: -15,
        }),
      );
    });

    it('should throw error when points are insufficient', async () => {
      // Mock getPointsSummary to return low points
      pointRecordRepo.find.mockResolvedValue([
        { points: 5, recordedAt: new Date() },
      ]);

      const redemptionData = {
        childId: 1,
        giftId: 1,
        giftName: '玩具',
        pointsCost: 100,
      };

      await expect(service.redeemGift(redemptionData)).rejects.toThrow('积分不足');
    });

    it('should throw with correct message showing current and needed points', async () => {
      pointRecordRepo.find.mockResolvedValue([
        { points: 3, recordedAt: new Date() },
      ]);

      const redemptionData = {
        childId: 1,
        giftId: 2,
        giftName: '大玩具',
        pointsCost: 50,
      };

      await expect(service.redeemGift(redemptionData)).rejects.toThrow(
        '积分不足！当前 3，需要 50',
      );
    });
  });

  describe('updateRedemptionStatus', () => {
    it('should update status and set approvedBy', async () => {
      const updated = { id: 1, status: 'approved', approvedBy: 10 };
      redemptionRepo.update.mockResolvedValue({ affected: 1 });
      redemptionRepo.findOne.mockResolvedValue(updated);

      const result = await service.updateRedemptionStatus(1, 'approved', 10);

      expect(redemptionRepo.update).toHaveBeenCalledWith(1, {
        status: 'approved',
        approvedBy: 10,
      });
      expect(result).toEqual(updated);
    });

    it('should set completedAt when status is completed', async () => {
      const updated = { id: 1, status: 'completed', completedAt: expect.any(Date) };
      redemptionRepo.update.mockResolvedValue({ affected: 1 });
      redemptionRepo.findOne.mockResolvedValue(updated);

      const result = await service.updateRedemptionStatus(1, 'completed');

      expect(redemptionRepo.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          status: 'completed',
          completedAt: expect.any(Date),
        }),
      );
    });

    it('should not set approvedBy when not provided', async () => {
      redemptionRepo.update.mockResolvedValue({ affected: 1 });
      redemptionRepo.findOne.mockResolvedValue({});

      await service.updateRedemptionStatus(1, 'pending');

      expect(redemptionRepo.update).toHaveBeenCalledWith(1, { status: 'pending' });
    });
  });

  // ==================== 统计 ====================

  describe('getWeeklyStats', () => {
    it('should return 7 days of stats', async () => {
      pointRecordRepo.find.mockResolvedValue([]);

      const result = await service.getWeeklyStats(1);

      expect(result).toHaveLength(7);
      expect(result[0]).toHaveProperty('date');
      expect(result[0]).toHaveProperty('points');
    });

    it('should sum points per day', async () => {
      // Return points for every call so each day gets 5 points (3 + 2)
      pointRecordRepo.find.mockResolvedValue([
        { points: 3, recordedAt: new Date() },
        { points: 2, recordedAt: new Date() },
      ]);

      const result = await service.getWeeklyStats(1);

      expect(result).toHaveLength(7);
      // Each day should have 5 points since mock returns same records for every query
      result.forEach((day) => {
        expect(day.points).toBe(5);
      });
    });

    it('should return 0 points for days with no records', async () => {
      pointRecordRepo.find.mockResolvedValue([]);

      const result = await service.getWeeklyStats(1);

      result.forEach((day) => {
        expect(day.points).toBe(0);
      });
    });
  });

  // ==================== 种子数据 ====================

  describe('seedDefaultBehaviors', () => {
    it('should skip seeding when behaviors already exist', async () => {
      behaviorRepo.count.mockResolvedValue(5);

      const result = await service.seedDefaultBehaviors(1);

      expect(result).toEqual({ created: 0, message: '已有行为模板' });
      expect(behaviorRepo.save).not.toHaveBeenCalled();
    });

    it('should seed all default behaviors when none exist', async () => {
      behaviorRepo.count.mockResolvedValue(0);
      behaviorRepo.create.mockImplementation((d) => d);
      behaviorRepo.save.mockResolvedValue({});

      const result = await service.seedDefaultBehaviors(1);

      expect(result).toEqual({ created: 18 }); // 18 default behaviors
      expect(behaviorRepo.save).toHaveBeenCalledTimes(18);
    });

    it('should mark all seeded behaviors as default and enabled', async () => {
      behaviorRepo.count.mockResolvedValue(0);
      behaviorRepo.create.mockImplementation((d) => d);
      behaviorRepo.save.mockResolvedValue({});

      await service.seedDefaultBehaviors(1);

      // Check that each save call includes isDefault: true and isEnabled: true
      const saveCalls = behaviorRepo.save.mock.calls;
      saveCalls.forEach((call) => {
        expect(call[0]).toEqual(
          expect.objectContaining({ isDefault: true, isEnabled: true }),
        );
      });
    });
  });

  describe('seedDefaultGifts', () => {
    it('should skip seeding when gifts already exist', async () => {
      giftRepo.count.mockResolvedValue(3);

      const result = await service.seedDefaultGifts(1);

      expect(result).toEqual({ created: 0, message: '已有礼品' });
      expect(giftRepo.save).not.toHaveBeenCalled();
    });

    it('should seed all default gifts when none exist', async () => {
      giftRepo.count.mockResolvedValue(0);
      giftRepo.create.mockImplementation((d) => d);
      giftRepo.save.mockResolvedValue({});

      const result = await service.seedDefaultGifts(1);

      expect(result).toEqual({ created: 6 }); // 6 default gifts
      expect(giftRepo.save).toHaveBeenCalledTimes(6);
    });

    it('should set stock to -1 (unlimited) for all seeded gifts', async () => {
      giftRepo.count.mockResolvedValue(0);
      giftRepo.create.mockImplementation((d) => d);
      giftRepo.save.mockResolvedValue({});

      await service.seedDefaultGifts(1);

      const saveCalls = giftRepo.save.mock.calls;
      saveCalls.forEach((call) => {
        expect(call[0]).toEqual(
          expect.objectContaining({ stock: -1, isEnabled: true }),
        );
      });
    });
  });
});
