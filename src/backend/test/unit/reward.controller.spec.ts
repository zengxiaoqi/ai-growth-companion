import { HttpException, HttpStatus, ForbiddenException, ConflictException } from '@nestjs/common';
import { RewardController } from '../../src/modules/reward/reward.controller';

describe('RewardController', () => {
  const rewardService = {
    getBehaviorsWithAutoSeed: jest.fn(),
    getBehaviorById: jest.fn(),
    createBehavior: jest.fn(),
    updateBehavior: jest.fn(),
    deleteBehavior: jest.fn(),
    toggleBehavior: jest.fn(),
    getPointRecords: jest.fn(),
    getPointRecordById: jest.fn(),
    recordPoints: jest.fn(),
    deletePointRecord: jest.fn(),
    getPointsSummary: jest.fn(),
    getGiftsWithAutoSeed: jest.fn(),
    getGiftById: jest.fn(),
    createGift: jest.fn(),
    updateGift: jest.fn(),
    deleteGift: jest.fn(),
    getRedemptions: jest.fn(),
    getRedemptionById: jest.fn(),
    redeemGift: jest.fn(),
    updateRedemptionStatus: jest.fn(),
    getWeeklyStats: jest.fn(),
    getCalendarData: jest.fn(),
    getDayRecords: jest.fn(),
    seedDefaultBehaviors: jest.fn(),
    seedDefaultGifts: jest.fn(),
  };

  const usersService = {
    canAccessChild: jest.fn().mockResolvedValue(true),
  };

  let controller: RewardController;

  // Helper: create a mock JWT request object
  const mockReq = (userId = 1, type = 'parent') => ({ user: { sub: userId, type } });

  beforeEach(() => {
    jest.clearAllMocks();
    usersService.canAccessChild.mockResolvedValue(true);
    controller = new RewardController(rewardService as any, usersService as any);
  });

  // ==================== 行为模板 ====================

  describe('GET /reward/behaviors', () => {
    it('should return behaviors with auto-seed for the authenticated user', async () => {
      const behaviors = [{ id: 1, name: '起床洗漱' }];
      rewardService.getBehaviorsWithAutoSeed.mockResolvedValue(behaviors);

      const result = await controller.getBehaviors(mockReq(1));

      expect(result).toEqual(behaviors);
      expect(rewardService.getBehaviorsWithAutoSeed).toHaveBeenCalledWith(1);
    });

    it('should use userId from JWT, not URL param', async () => {
      rewardService.getBehaviorsWithAutoSeed.mockResolvedValue([]);

      await controller.getBehaviors(mockReq(42));

      expect(rewardService.getBehaviorsWithAutoSeed).toHaveBeenCalledWith(42);
    });
  });

  describe('POST /reward/behaviors', () => {
    it('should create a behavior with userId from JWT', async () => {
      const data = { name: '阅读', points: 3, emoji: '📖', category: 'extra' };
      const created = { id: 1, ...data, userId: 1 };
      rewardService.createBehavior.mockResolvedValue(created);

      const result = await controller.createBehavior(mockReq(1), data);

      expect(result).toEqual(created);
      expect(rewardService.createBehavior).toHaveBeenCalledWith({ ...data, userId: 1 });
    });
  });

  describe('PUT /reward/behaviors/:id', () => {
    it('should update a behavior owned by the user', async () => {
      const existing = { id: 1, name: '旧名称', userId: 1 };
      const updated = { id: 1, name: '新名称' };
      rewardService.getBehaviorById.mockResolvedValue(existing);
      rewardService.updateBehavior.mockResolvedValue(updated);

      const result = await controller.updateBehavior(mockReq(1), '1', { name: '新名称' });

      expect(result).toEqual(updated);
      expect(rewardService.updateBehavior).toHaveBeenCalledWith(1, { name: '新名称' });
    });

    it('should strip userId from update data to prevent hijacking', async () => {
      const existing = { id: 1, name: '旧', userId: 1 };
      rewardService.getBehaviorById.mockResolvedValue(existing);
      rewardService.updateBehavior.mockResolvedValue(existing);

      await controller.updateBehavior(mockReq(1), '1', { name: '新', userId: 999 });

      expect(rewardService.updateBehavior).toHaveBeenCalledWith(1, { name: '新' });
    });

    it('should throw 403 when updating another user behavior', async () => {
      const existing = { id: 1, name: '旧', userId: 2 };
      rewardService.getBehaviorById.mockResolvedValue(existing);

      await expect(controller.updateBehavior(mockReq(1), '1', { name: '新' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw 404 when behavior not found', async () => {
      rewardService.getBehaviorById.mockResolvedValue(null);

      await expect(controller.updateBehavior(mockReq(1), '1', { name: '新' })).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('DELETE /reward/behaviors/:id', () => {
    it('should delete a behavior owned by the user', async () => {
      const existing = { id: 1, userId: 1 };
      rewardService.getBehaviorById.mockResolvedValue(existing);
      rewardService.deleteBehavior.mockResolvedValue({ affected: 1 });

      const result = await controller.deleteBehavior(mockReq(1), '1');

      expect(result).toEqual({ affected: 1 });
      expect(rewardService.deleteBehavior).toHaveBeenCalledWith(1);
    });

    it('should throw 403 when deleting another user behavior', async () => {
      const existing = { id: 1, userId: 2 };
      rewardService.getBehaviorById.mockResolvedValue(existing);

      await expect(controller.deleteBehavior(mockReq(1), '1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('PATCH /reward/behaviors/:id/toggle', () => {
    it('should toggle a behavior owned by the user', async () => {
      const existing = { id: 1, userId: 1 };
      const toggled = { id: 1, isEnabled: false };
      rewardService.getBehaviorById.mockResolvedValue(existing);
      rewardService.toggleBehavior.mockResolvedValue(toggled);

      const result = await controller.toggleBehavior(mockReq(1), '1');

      expect(result).toEqual(toggled);
      expect(rewardService.toggleBehavior).toHaveBeenCalledWith(1);
    });

    it('should throw 403 when toggling another user behavior', async () => {
      const existing = { id: 1, userId: 2 };
      rewardService.getBehaviorById.mockResolvedValue(existing);

      await expect(controller.toggleBehavior(mockReq(1), '1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ==================== 积分记录 ====================

  describe('GET /reward/points/:childId', () => {
    it('should return paginated point records after access check', async () => {
      const data = { records: [{ id: 1, points: 5 }], total: 1, page: 1, limit: 20 };
      rewardService.getPointRecords.mockResolvedValue(data);

      const result = await controller.getPointRecords(mockReq(1), '1', '1', '20');

      expect(result).toEqual(data);
      expect(usersService.canAccessChild).toHaveBeenCalledWith(1, 'parent', 1);
      expect(rewardService.getPointRecords).toHaveBeenCalledWith(1, 1, 20);
    });

    it('should use default pagination values', async () => {
      rewardService.getPointRecords.mockResolvedValue({
        records: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      await controller.getPointRecords(mockReq(1), '1');

      expect(rewardService.getPointRecords).toHaveBeenCalledWith(1, 1, 20);
    });

    it('should throw 403 when parent cannot access child', async () => {
      usersService.canAccessChild.mockResolvedValue(false);

      await expect(controller.getPointRecords(mockReq(1), '99', '1', '20')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('POST /reward/points', () => {
    it('should record points with recordedBy from JWT', async () => {
      const data = { childId: 1, behaviorName: '起床洗漱', points: 2 };
      const saved = { id: 1, ...data, recordedBy: 1 };
      rewardService.recordPoints.mockResolvedValue(saved);

      const result = await controller.recordPoints(mockReq(1), data);

      expect(result).toEqual(saved);
      expect(rewardService.recordPoints).toHaveBeenCalledWith(
        expect.objectContaining({ childId: 1, behaviorName: '起床洗漱', points: 2, recordedBy: 1 }),
      );
    });

    it('should convert recordedAt string to Date', async () => {
      const data = {
        childId: 1,
        behaviorName: '学习',
        points: 3,
        recordedAt: '2026-06-20T10:00:00Z',
      };
      rewardService.recordPoints.mockResolvedValue({});

      await controller.recordPoints(mockReq(1), data);

      expect(rewardService.recordPoints).toHaveBeenCalledWith(
        expect.objectContaining({ recordedAt: new Date('2026-06-20T10:00:00Z') }),
      );
    });

    it('should pass undefined recordedAt when not provided', async () => {
      const data = { childId: 1, behaviorName: '学习', points: 3 };
      rewardService.recordPoints.mockResolvedValue({});

      await controller.recordPoints(mockReq(1), data);

      expect(rewardService.recordPoints).toHaveBeenCalledWith(
        expect.objectContaining({ recordedAt: undefined }),
      );
    });

    it('should throw ConflictException on duplicate check-in', async () => {
      const data = { childId: 1, behaviorName: '起床洗漱', points: 2 };
      rewardService.recordPoints.mockResolvedValue(null);

      await expect(controller.recordPoints(mockReq(1), data)).rejects.toThrow(ConflictException);
    });
  });

  describe('DELETE /reward/points/:id', () => {
    it('should delete a point record after access check', async () => {
      const record = { id: 5, childId: 1 };
      rewardService.getPointRecordById.mockResolvedValue(record);
      rewardService.deletePointRecord.mockResolvedValue({ affected: 1 });

      const result = await controller.deletePointRecord(mockReq(1), '5');

      expect(result).toEqual({ affected: 1 });
      expect(rewardService.deletePointRecord).toHaveBeenCalledWith(5);
    });

    it('should throw 404 when record not found', async () => {
      rewardService.getPointRecordById.mockResolvedValue(null);

      await expect(controller.deletePointRecord(mockReq(1), '5')).rejects.toThrow(HttpException);
    });

    it('should throw 403 when parent cannot access child', async () => {
      const record = { id: 5, childId: 99 };
      rewardService.getPointRecordById.mockResolvedValue(record);
      usersService.canAccessChild.mockResolvedValue(false);

      await expect(controller.deletePointRecord(mockReq(1), '5')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('GET /reward/points/summary/:childId', () => {
    it('should return points summary after access check', async () => {
      const summary = {
        totalPoints: 100,
        todayPoints: 10,
        weekPoints: 50,
        monthPoints: 80,
        streak: 5,
        todayRecordCount: 3,
      };
      rewardService.getPointsSummary.mockResolvedValue(summary);

      const result = await controller.getPointsSummary(mockReq(1), '1');

      expect(result).toEqual(summary);
      expect(rewardService.getPointsSummary).toHaveBeenCalledWith(1);
    });
  });

  // ==================== 礼品管理 ====================

  describe('GET /reward/gifts', () => {
    it('should return gifts with auto-seed for the authenticated user', async () => {
      const gifts = [{ id: 1, name: '动画片', pointsCost: 10 }];
      rewardService.getGiftsWithAutoSeed.mockResolvedValue(gifts);

      const result = await controller.getGifts(mockReq(1));

      expect(result).toEqual(gifts);
      expect(rewardService.getGiftsWithAutoSeed).toHaveBeenCalledWith(1);
    });
  });

  describe('POST /reward/gifts', () => {
    it('should create a gift with userId from JWT', async () => {
      const data = { name: '零食', pointsCost: 15 };
      const created = { id: 1, ...data, userId: 1 };
      rewardService.createGift.mockResolvedValue(created);

      const result = await controller.createGift(mockReq(1), data);

      expect(result).toEqual(created);
      expect(rewardService.createGift).toHaveBeenCalledWith({ ...data, userId: 1 });
    });
  });

  describe('PUT /reward/gifts/:id', () => {
    it('should update a gift owned by the user', async () => {
      const existing = { id: 1, name: '旧', userId: 1 };
      const updated = { id: 1, name: '新礼品', pointsCost: 20 };
      rewardService.getGiftById.mockResolvedValue(existing);
      rewardService.updateGift.mockResolvedValue(updated);

      const result = await controller.updateGift(mockReq(1), '1', {
        name: '新礼品',
        pointsCost: 20,
      });

      expect(result).toEqual(updated);
      expect(rewardService.updateGift).toHaveBeenCalledWith(1, { name: '新礼品', pointsCost: 20 });
    });

    it('should strip userId from update data', async () => {
      const existing = { id: 1, name: '旧', userId: 1 };
      rewardService.getGiftById.mockResolvedValue(existing);
      rewardService.updateGift.mockResolvedValue(existing);

      await controller.updateGift(mockReq(1), '1', { name: '新', userId: 999 });

      expect(rewardService.updateGift).toHaveBeenCalledWith(1, { name: '新' });
    });

    it('should throw 403 when updating another user gift', async () => {
      const existing = { id: 1, userId: 2 };
      rewardService.getGiftById.mockResolvedValue(existing);

      await expect(controller.updateGift(mockReq(1), '1', { name: '新' })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('DELETE /reward/gifts/:id', () => {
    it('should delete a gift owned by the user', async () => {
      const existing = { id: 1, userId: 1 };
      rewardService.getGiftById.mockResolvedValue(existing);
      rewardService.deleteGift.mockResolvedValue({ affected: 1 });

      const result = await controller.deleteGift(mockReq(1), '1');

      expect(result).toEqual({ affected: 1 });
      expect(rewardService.deleteGift).toHaveBeenCalledWith(1);
    });

    it('should throw 403 when deleting another user gift', async () => {
      const existing = { id: 1, userId: 2 };
      rewardService.getGiftById.mockResolvedValue(existing);

      await expect(controller.deleteGift(mockReq(1), '1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ==================== 兑换管理 ====================

  describe('GET /reward/redemptions/:childId', () => {
    it('should return redemptions after access check', async () => {
      const redemptions = [{ id: 1, giftName: '动画片', status: 'pending' }];
      rewardService.getRedemptions.mockResolvedValue(redemptions);

      const result = await controller.getRedemptions(mockReq(1), '1');

      expect(result).toEqual(redemptions);
      expect(rewardService.getRedemptions).toHaveBeenCalledWith(1);
    });
  });

  describe('POST /reward/redemptions', () => {
    it('should redeem a gift successfully', async () => {
      const data = { childId: 1, giftId: 5, giftName: '动画片', pointsCost: 10 };
      const saved = { id: 1, ...data, status: 'pending' };
      rewardService.redeemGift.mockResolvedValue(saved);

      const result = await controller.redeemGift(mockReq(1), data);

      expect(result).toEqual(saved);
      expect(rewardService.redeemGift).toHaveBeenCalledWith(data);
    });

    it('should throw HttpException with BAD_REQUEST when points are insufficient', async () => {
      const data = { childId: 1, giftId: 5, giftName: '玩具', pointsCost: 100 };
      rewardService.redeemGift.mockRejectedValue(new Error('积分不足！当前 30，需要 100'));

      await expect(controller.redeemGift(mockReq(1), data)).rejects.toThrow(HttpException);

      try {
        await controller.redeemGift(mockReq(1), data);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
        expect((error as HttpException).message).toContain('积分不足');
      }
    });
  });

  describe('PATCH /reward/redemptions/:id', () => {
    it('should update redemption status with approvedBy from JWT fallback', async () => {
      const redemption = { id: 1, childId: 1 };
      const updated = { id: 1, status: 'approved', approvedBy: 1 };
      rewardService.getRedemptionById.mockResolvedValue(redemption);
      rewardService.updateRedemptionStatus.mockResolvedValue(updated);

      const result = await controller.updateRedemptionStatus(mockReq(1), '1', {
        status: 'approved',
      });

      expect(result).toEqual(updated);
      expect(rewardService.updateRedemptionStatus).toHaveBeenCalledWith(1, 'approved', 1);
    });

    it('should use provided approvedBy when given', async () => {
      const redemption = { id: 1, childId: 1 };
      rewardService.getRedemptionById.mockResolvedValue(redemption);
      rewardService.updateRedemptionStatus.mockResolvedValue({ id: 1, status: 'approved' });

      await controller.updateRedemptionStatus(mockReq(1), '1', {
        status: 'approved',
        approvedBy: 10,
      });

      expect(rewardService.updateRedemptionStatus).toHaveBeenCalledWith(1, 'approved', 10);
    });

    it('should throw 404 when redemption not found', async () => {
      rewardService.getRedemptionById.mockResolvedValue(null);

      await expect(
        controller.updateRedemptionStatus(mockReq(1), '1', { status: 'approved' }),
      ).rejects.toThrow(HttpException);
    });
  });

  // ==================== 统计 ====================

  describe('GET /reward/stats/weekly/:childId', () => {
    it('should return weekly stats after access check', async () => {
      const stats = [
        { date: '一', points: 10 },
        { date: '二', points: 5 },
      ];
      rewardService.getWeeklyStats.mockResolvedValue(stats);

      const result = await controller.getWeeklyStats(mockReq(1), '1');

      expect(result).toEqual(stats);
      expect(rewardService.getWeeklyStats).toHaveBeenCalledWith(1);
    });
  });

  // ==================== 日历 ====================

  describe('GET /reward/calendar/:childId', () => {
    it('should return calendar data with year and month', async () => {
      const calData = { '2026-06-01': { points: 5, count: 1 } };
      rewardService.getCalendarData.mockResolvedValue(calData);

      const result = await controller.getCalendarData(mockReq(1), '1', '2026', '6');

      expect(result).toEqual(calData);
      expect(rewardService.getCalendarData).toHaveBeenCalledWith(1, 2026, 6);
    });

    it('should use current year/month when not provided', async () => {
      rewardService.getCalendarData.mockResolvedValue({});

      await controller.getCalendarData(mockReq(1), '1', '', '');

      expect(rewardService.getCalendarData).toHaveBeenCalledWith(
        1,
        new Date().getFullYear(),
        new Date().getMonth() + 1,
      );
    });
  });

  describe('GET /reward/calendar/:childId/day', () => {
    it('should return day records for a specific date', async () => {
      const records = [{ id: 1, points: 3 }];
      rewardService.getDayRecords.mockResolvedValue(records);

      const result = await controller.getDayRecords(mockReq(1), '1', '2026-06-28');

      expect(result).toEqual(records);
      expect(rewardService.getDayRecords).toHaveBeenCalledWith(1, '2026-06-28');
    });

    it('should throw 400 when date param is missing', async () => {
      await expect(controller.getDayRecords(mockReq(1), '1', '')).rejects.toThrow(HttpException);
    });
  });

  // ==================== 种子数据 ====================

  describe('POST /reward/seed/behaviors', () => {
    it('should seed default behaviors for the authenticated user', async () => {
      rewardService.seedDefaultBehaviors.mockResolvedValue({ created: 18 });

      const result = await controller.seedBehaviors(mockReq(1));

      expect(result).toEqual({ created: 18 });
      expect(rewardService.seedDefaultBehaviors).toHaveBeenCalledWith(1);
    });
  });

  describe('POST /reward/seed/gifts', () => {
    it('should seed default gifts for the authenticated user', async () => {
      rewardService.seedDefaultGifts.mockResolvedValue({ created: 6 });

      const result = await controller.seedGifts(mockReq(1));

      expect(result).toEqual({ created: 6 });
      expect(rewardService.seedDefaultGifts).toHaveBeenCalledWith(1);
    });
  });
});
