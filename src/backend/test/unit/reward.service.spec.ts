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
      findOne: jest.fn(),
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
    it('should return behaviors for a user ordered by sortOrder then createdAt', async () => {
      const behaviors = [
        { id: 1, name: '起床洗漱', sortOrder: 1 },
        { id: 2, name: '学习', sortOrder: 3 },
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
      const data = { userId: 1, name: '测试行为', points: 5 };
      const created = {
        id: 1,
        ...data,
        emoji: '⭐',
        category: 'daily',
        isDefault: false,
        sortOrder: 1,
      };

      // Mock the auto-sortOrder query (no existing behaviors → sortOrder = 1)
      behaviorRepo.find.mockResolvedValue([]);
      behaviorRepo.create.mockReturnValue(created);
      behaviorRepo.save.mockResolvedValue(created);

      const result = await service.createBehavior(data);

      expect(behaviorRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          name: '测试行为',
          points: 5,
          emoji: '⭐',
          category: 'daily',
          isDefault: false,
          sortOrder: 1,
        }),
      );
      expect(result).toEqual(created);
    });

    it('should use provided emoji and category', async () => {
      const data = {
        userId: 1,
        name: '阅读',
        emoji: '📖',
        points: 3,
        category: 'extra',
        sortOrder: 10,
      };
      const created = { id: 2, ...data, isDefault: false };

      behaviorRepo.create.mockReturnValue(created);
      behaviorRepo.save.mockResolvedValue(created);

      await service.createBehavior(data);

      expect(behaviorRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ emoji: '📖', category: 'extra', sortOrder: 10 }),
      );
    });
  });

  describe('updateBehavior', () => {
    it('should update and return the behavior', async () => {
      const updated = { id: 1, name: '新名称', points: 10 };
      behaviorRepo.update.mockResolvedValue({ affected: 1 });
      behaviorRepo.findOne.mockResolvedValue(updated);

      const result = await service.updateBehavior(1, { name: '新名称', points: 10 });

      expect(behaviorRepo.update).toHaveBeenCalledWith(1, { name: '新名称', points: 10 });
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
      const records = [
        { id: 1, points: 5 },
        { id: 2, points: 3 },
      ];
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

      pointRecordRepo.findOne.mockResolvedValue(null);
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

    it('should handle negative points (deduction)', async () => {
      const data = {
        childId: 1,
        behaviorName: '发脾气',
        points: -2,
        recordedBy: 10,
      };
      pointRecordRepo.findOne.mockResolvedValue(null);
      pointRecordRepo.create.mockImplementation((d) => d);
      pointRecordRepo.save.mockResolvedValue({ id: 1, ...data });

      await service.recordPoints(data);

      expect(pointRecordRepo.create).toHaveBeenCalledWith(expect.objectContaining({ points: -2 }));
    });

    it('should use provided recordedAt when given', async () => {
      const customDate = new Date('2026-07-15T10:00:00Z');
      const data = {
        childId: 1,
        behaviorName: '学习',
        points: 3,
        recordedBy: 10,
        recordedAt: customDate,
      };
      pointRecordRepo.findOne.mockResolvedValue(null);
      pointRecordRepo.create.mockImplementation((d) => d);
      pointRecordRepo.save.mockResolvedValue({});

      await service.recordPoints(data);

      expect(pointRecordRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ recordedAt: customDate }),
      );
    });

    it('should include templateId and note when provided', async () => {
      const data = {
        childId: 1,
        templateId: 5,
        behaviorName: '阅读',
        points: 3,
        note: '读了30分钟',
        recordedBy: 10,
      };
      pointRecordRepo.findOne.mockResolvedValue(null);
      pointRecordRepo.create.mockImplementation((d) => d);
      pointRecordRepo.save.mockResolvedValue({});

      await service.recordPoints(data);

      expect(pointRecordRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ templateId: 5, note: '读了30分钟' }),
      );
    });

    it('should return null when same-day duplicate check-in is detected', async () => {
      const data = {
        childId: 1,
        behaviorName: '起床洗漱',
        points: 2,
        recordedBy: 10,
      };
      const existingRecord = { id: 99, childId: 1, behaviorName: '起床洗漱', points: 2 };
      pointRecordRepo.findOne.mockResolvedValue(existingRecord);

      const result = await service.recordPoints(data);

      expect(result).toBeNull();
      expect(pointRecordRepo.create).not.toHaveBeenCalled();
      expect(pointRecordRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('deletePointRecord', () => {
    it('should delete a point record by id', async () => {
      pointRecordRepo.delete.mockResolvedValue({ affected: 1 });

      const result = await service.deletePointRecord(5);

      expect(pointRecordRepo.delete).toHaveBeenCalledWith(5);
      expect(result).toEqual({ affected: 1 });
    });
  });

  describe('getPointsSummary', () => {
    it('should return summary with total, today, week, month points and streak', async () => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // All records
      pointRecordRepo.find.mockImplementation(({ where }) => {
        if (!where.recordedAt) {
          return Promise.resolve([
            { points: 10, recordedAt: todayStart },
            { points: -3, recordedAt: todayStart },
          ]);
        }
        // today
        if (where.recordedAt instanceof Object && !Array.isArray(where.recordedAt)) {
          return Promise.resolve([{ points: 5, recordedAt: todayStart }]);
        }
        return Promise.resolve([]);
      });

      // Override for Between-based queries - we need to handle the Between operator
      // Since Between creates a special query object, let's mock more precisely
      pointRecordRepo.find.mockResolvedValue([]);

      // First call: all records (no recordedAt filter)
      pointRecordRepo.find
        .mockResolvedValueOnce([
          { points: 10, recordedAt: todayStart },
          { points: -3, recordedAt: todayStart },
        ])
        // today
        .mockResolvedValueOnce([{ points: 5, recordedAt: todayStart }])
        // week
        .mockResolvedValueOnce([{ points: 15, recordedAt: todayStart }])
        // month
        .mockResolvedValueOnce([{ points: 50, recordedAt: todayStart }])
        // streak records
        .mockResolvedValueOnce([{ points: 5, recordedAt: todayStart }]);

      const result = await service.getPointsSummary(1);

      expect(result.totalPoints).toBe(7); // 10 + (-3)
      expect(result.todayPoints).toBe(5);
      expect(result.weekPoints).toBe(15);
      expect(result.monthPoints).toBe(50);
      expect(result.streak).toBe(1);
      expect(result.todayRecordCount).toBe(1);
    });

    it('should return 0 streak when no records exist', async () => {
      pointRecordRepo.find.mockResolvedValue([]);

      const result = await service.getPointsSummary(1);

      expect(result.totalPoints).toBe(0);
      expect(result.streak).toBe(0);
      expect(result.todayRecordCount).toBe(0);
    });

    it('should clamp totalPoints to 0 minimum', async () => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      pointRecordRepo.find
        .mockResolvedValueOnce([{ points: -10, recordedAt: todayStart }]) // all
        .mockResolvedValueOnce([]) // today
        .mockResolvedValueOnce([]) // week
        .mockResolvedValueOnce([]) // month
        .mockResolvedValueOnce([{ points: -10, recordedAt: todayStart }]); // streak

      const result = await service.getPointsSummary(1);

      expect(result.totalPoints).toBe(0); // clamped from -10
    });
  });

  // ==================== 礼品管理 ====================

  describe('getGifts', () => {
    it('should return gifts ordered by sortOrder then pointsCost', async () => {
      const gifts = [
        { id: 1, name: '动画片', pointsCost: 10 },
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
      const data = { userId: 1, name: '零食', pointsCost: 15 };
      const created = {
        id: 1,
        ...data,
        emoji: '🎁',
        description: null,
        category: 'other',
        stock: -1,
        sortOrder: 1,
      };

      // Mock the auto-sortOrder query (no existing gifts → sortOrder = 1)
      giftRepo.find.mockResolvedValue([]);
      giftRepo.create.mockReturnValue(created);
      giftRepo.save.mockResolvedValue(created);

      const result = await service.createGift(data);

      expect(giftRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          name: '零食',
          pointsCost: 15,
          emoji: '🎁',
          description: null,
          category: 'other',
          stock: -1,
          sortOrder: 1,
        }),
      );
      expect(result).toEqual(created);
    });

    it('should use provided values over defaults', async () => {
      const data = {
        userId: 1,
        name: '公园',
        emoji: '🏞️',
        description: '去公园玩半天',
        pointsCost: 30,
        category: 'outing',
        stock: 5,
        sortOrder: 3,
      };
      giftRepo.create.mockReturnValue(data);
      giftRepo.save.mockResolvedValue({ id: 1, ...data });

      await service.createGift(data);

      expect(giftRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          emoji: '🏞️',
          description: '去公园玩半天',
          category: 'outing',
          stock: 5,
          sortOrder: 3,
        }),
      );
    });
  });

  describe('updateGift', () => {
    it('should update and return the gift', async () => {
      const updated = { id: 1, name: '新礼品', pointsCost: 20 };
      giftRepo.update.mockResolvedValue({ affected: 1 });
      giftRepo.findOne.mockResolvedValue(updated);

      const result = await service.updateGift(1, { name: '新礼品', pointsCost: 20 });

      expect(giftRepo.update).toHaveBeenCalledWith(1, { name: '新礼品', pointsCost: 20 });
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
        { id: 2, giftName: '玩具', redeemedAt: new Date('2026-06-20') },
        { id: 1, giftName: '零食', redeemedAt: new Date('2026-06-15') },
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
    it('should create redemption and record point deduction when balance is sufficient', async () => {
      const data = { childId: 1, giftId: 5, giftName: '动画片', pointsCost: 10 };

      // Mock getPointsSummary to return sufficient points
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      pointRecordRepo.find
        .mockResolvedValueOnce([{ points: 50, recordedAt: todayStart }]) // all records
        .mockResolvedValueOnce([]) // today
        .mockResolvedValueOnce([]) // week
        .mockResolvedValueOnce([]) // month
        .mockResolvedValueOnce([{ points: 50, recordedAt: todayStart }]); // streak

      const savedRedemption = { id: 1, ...data, status: 'pending' };
      redemptionRepo.create.mockReturnValue(savedRedemption);
      redemptionRepo.save.mockResolvedValue(savedRedemption);

      // recordPoints mock
      pointRecordRepo.findOne.mockResolvedValue(null);
      pointRecordRepo.create.mockImplementation((d) => d);
      pointRecordRepo.save.mockResolvedValue({ id: 1, points: -10 });

      const result = await service.redeemGift(data);

      expect(redemptionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          childId: 1,
          giftId: 5,
          giftName: '动画片',
          pointsCost: 10,
          status: 'pending',
        }),
      );
      expect(result).toEqual(savedRedemption);

      // Verify point deduction was recorded
      expect(pointRecordRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          behaviorName: '兑换: 动画片',
          points: -10,
        }),
      );
    });

    it('should throw error when points are insufficient', async () => {
      const data = { childId: 1, giftId: 5, giftName: '玩具', pointsCost: 100 };

      // Mock getPointsSummary to return insufficient points
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      pointRecordRepo.find
        .mockResolvedValueOnce([{ points: 20, recordedAt: todayStart }]) // all records (total = 20)
        .mockResolvedValueOnce([]) // today
        .mockResolvedValueOnce([]) // week
        .mockResolvedValueOnce([]) // month
        .mockResolvedValueOnce([{ points: 20, recordedAt: todayStart }]); // streak

      await expect(service.redeemGift(data)).rejects.toThrow('积分不足');
      expect(redemptionRepo.create).not.toHaveBeenCalled();
    });

    it('should throw error with exact point values in message', async () => {
      const data = { childId: 1, giftId: 5, giftName: '玩具', pointsCost: 50 };

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      pointRecordRepo.find
        .mockResolvedValueOnce([{ points: 30, recordedAt: todayStart }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ points: 30, recordedAt: todayStart }]);

      await expect(service.redeemGift(data)).rejects.toThrow('当前 30，需要 50');
    });
  });

  describe('updateRedemptionStatus', () => {
    it('should update status and approvedBy', async () => {
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

      await service.updateRedemptionStatus(1, 'completed');

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
      redemptionRepo.findOne.mockResolvedValue({ id: 1, status: 'pending' });

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
      expect(pointRecordRepo.find).toHaveBeenCalledTimes(7);
    });

    it('should include day names in Chinese', async () => {
      pointRecordRepo.find.mockResolvedValue([]);

      const result = await service.getWeeklyStats(1);

      const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
      for (const stat of result) {
        expect(dayNames).toContain(stat.date);
        expect(typeof stat.points).toBe('number');
      }
    });

    it('should sum points for each day', async () => {
      const todayRecords = [{ points: 5 }, { points: 3 }];
      // First call is for the oldest day (6 days ago), last call is today
      pointRecordRepo.find
        .mockResolvedValueOnce([]) // 6 days ago
        .mockResolvedValueOnce([]) // 5 days ago
        .mockResolvedValueOnce([]) // 4 days ago
        .mockResolvedValueOnce([]) // 3 days ago
        .mockResolvedValueOnce([]) // 2 days ago
        .mockResolvedValueOnce([]) // yesterday
        .mockResolvedValueOnce(todayRecords); // today

      const result = await service.getWeeklyStats(1);

      const today = result[result.length - 1];
      expect(today.points).toBe(8); // 5 + 3
    });
  });

  // ==================== 种子数据 ====================

  describe('seedDefaultBehaviors', () => {
    it('should create 18 default behaviors when none exist', async () => {
      behaviorRepo.count.mockResolvedValue(0);
      behaviorRepo.create.mockImplementation((d) => d);
      behaviorRepo.save.mockResolvedValue({});

      const result = await service.seedDefaultBehaviors(1);

      expect(result).toEqual({ created: 18 });
      expect(behaviorRepo.save).toHaveBeenCalledTimes(18);
    });

    it('should skip when behaviors already exist', async () => {
      behaviorRepo.count.mockResolvedValue(5);

      const result = await service.seedDefaultBehaviors(1);

      expect(result).toEqual({ created: 0, message: '已有行为模板' });
      expect(behaviorRepo.save).not.toHaveBeenCalled();
    });

    it('should include negative point behaviors', async () => {
      behaviorRepo.count.mockResolvedValue(0);
      behaviorRepo.create.mockImplementation((d) => d);
      behaviorRepo.save.mockResolvedValue({});

      await service.seedDefaultBehaviors(1);

      // Check that at least one call included negative points
      const negativeCalls = behaviorRepo.create.mock.calls.filter((call) => call[0].points < 0);
      expect(negativeCalls.length).toBeGreaterThan(0);
    });
  });

  describe('seedDefaultGifts', () => {
    it('should create 6 default gifts when none exist', async () => {
      giftRepo.count.mockResolvedValue(0);
      giftRepo.create.mockImplementation((d) => d);
      giftRepo.save.mockResolvedValue({});

      const result = await service.seedDefaultGifts(1);

      expect(result).toEqual({ created: 6 });
      expect(giftRepo.save).toHaveBeenCalledTimes(6);
    });

    it('should skip when gifts already exist', async () => {
      giftRepo.count.mockResolvedValue(3);

      const result = await service.seedDefaultGifts(1);

      expect(result).toEqual({ created: 0, message: '已有礼品' });
      expect(giftRepo.save).not.toHaveBeenCalled();
    });
  });
});
