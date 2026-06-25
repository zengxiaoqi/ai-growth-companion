import { HttpException, HttpStatus } from '@nestjs/common';
import { RewardController } from '../../src/modules/reward/reward.controller';

describe('RewardController', () => {
  const rewardService = {
    getBehaviors: jest.fn(),
    createBehavior: jest.fn(),
    updateBehavior: jest.fn(),
    deleteBehavior: jest.fn(),
    toggleBehavior: jest.fn(),
    getPointRecords: jest.fn(),
    recordPoints: jest.fn(),
    deletePointRecord: jest.fn(),
    getPointsSummary: jest.fn(),
    getGifts: jest.fn(),
    createGift: jest.fn(),
    updateGift: jest.fn(),
    deleteGift: jest.fn(),
    getRedemptions: jest.fn(),
    redeemGift: jest.fn(),
    updateRedemptionStatus: jest.fn(),
    getWeeklyStats: jest.fn(),
    seedDefaultBehaviors: jest.fn(),
    seedDefaultGifts: jest.fn(),
  };

  let controller: RewardController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new RewardController(rewardService as any);
  });

  // ==================== 行为模板 ====================

  describe('GET /reward/behaviors/:userId', () => {
    it('should return behaviors for a user', async () => {
      const behaviors = [{ id: 1, name: '起床洗漱' }];
      rewardService.getBehaviors.mockResolvedValue(behaviors);

      const result = await controller.getBehaviors('1');

      expect(result).toEqual(behaviors);
      expect(rewardService.getBehaviors).toHaveBeenCalledWith(1);
    });

    it('should convert string userId to number', async () => {
      rewardService.getBehaviors.mockResolvedValue([]);

      await controller.getBehaviors('42');

      expect(rewardService.getBehaviors).toHaveBeenCalledWith(42);
    });
  });

  describe('POST /reward/behaviors', () => {
    it('should create a behavior', async () => {
      const data = { userId: 1, name: '阅读', points: 3, emoji: '📖', category: 'extra' };
      const created = { id: 1, ...data };
      rewardService.createBehavior.mockResolvedValue(created);

      const result = await controller.createBehavior(data);

      expect(result).toEqual(created);
      expect(rewardService.createBehavior).toHaveBeenCalledWith(data);
    });
  });

  describe('PUT /reward/behaviors/:id', () => {
    it('should update a behavior', async () => {
      const updated = { id: 1, name: '新名称' };
      rewardService.updateBehavior.mockResolvedValue(updated);

      const result = await controller.updateBehavior('1', { name: '新名称' });

      expect(result).toEqual(updated);
      expect(rewardService.updateBehavior).toHaveBeenCalledWith(1, { name: '新名称' });
    });
  });

  describe('DELETE /reward/behaviors/:id', () => {
    it('should delete a behavior', async () => {
      rewardService.deleteBehavior.mockResolvedValue({ affected: 1 });

      const result = await controller.deleteBehavior('1');

      expect(result).toEqual({ affected: 1 });
      expect(rewardService.deleteBehavior).toHaveBeenCalledWith(1);
    });
  });

  describe('PATCH /reward/behaviors/:id/toggle', () => {
    it('should toggle a behavior', async () => {
      const toggled = { id: 1, isEnabled: false };
      rewardService.toggleBehavior.mockResolvedValue(toggled);

      const result = await controller.toggleBehavior('1');

      expect(result).toEqual(toggled);
      expect(rewardService.toggleBehavior).toHaveBeenCalledWith(1);
    });
  });

  // ==================== 积分记录 ====================

  describe('GET /reward/points/:childId', () => {
    it('should return paginated point records', async () => {
      const data = { records: [{ id: 1, points: 5 }], total: 1, page: 1, limit: 20 };
      rewardService.getPointRecords.mockResolvedValue(data);

      const result = await controller.getPointRecords('1', '1', '20');

      expect(result).toEqual(data);
      expect(rewardService.getPointRecords).toHaveBeenCalledWith(1, 1, 20);
    });

    it('should use default pagination values', async () => {
      rewardService.getPointRecords.mockResolvedValue({
        records: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      await controller.getPointRecords('1');

      expect(rewardService.getPointRecords).toHaveBeenCalledWith(1, 1, 20);
    });
  });

  describe('POST /reward/points', () => {
    it('should record points', async () => {
      const data = {
        childId: 1,
        behaviorName: '起床洗漱',
        points: 2,
        recordedBy: 10,
      };
      const saved = { id: 1, ...data };
      rewardService.recordPoints.mockResolvedValue(saved);

      const result = await controller.recordPoints(data);

      expect(result).toEqual(saved);
      expect(rewardService.recordPoints).toHaveBeenCalledWith(
        expect.objectContaining({ childId: 1, behaviorName: '起床洗漱', points: 2 }),
      );
    });

    it('should convert recordedAt string to Date', async () => {
      const data = {
        childId: 1,
        behaviorName: '学习',
        points: 3,
        recordedBy: 10,
        recordedAt: '2026-06-20T10:00:00Z',
      };
      rewardService.recordPoints.mockResolvedValue({});

      await controller.recordPoints(data);

      expect(rewardService.recordPoints).toHaveBeenCalledWith(
        expect.objectContaining({
          recordedAt: new Date('2026-06-20T10:00:00Z'),
        }),
      );
    });

    it('should pass undefined recordedAt when not provided', async () => {
      const data = {
        childId: 1,
        behaviorName: '学习',
        points: 3,
        recordedBy: 10,
      };
      rewardService.recordPoints.mockResolvedValue({});

      await controller.recordPoints(data);

      expect(rewardService.recordPoints).toHaveBeenCalledWith(
        expect.objectContaining({ recordedAt: undefined }),
      );
    });
  });

  describe('DELETE /reward/points/:id', () => {
    it('should delete a point record', async () => {
      rewardService.deletePointRecord.mockResolvedValue({ affected: 1 });

      const result = await controller.deletePointRecord('5');

      expect(result).toEqual({ affected: 1 });
      expect(rewardService.deletePointRecord).toHaveBeenCalledWith(5);
    });
  });

  describe('GET /reward/points/summary/:childId', () => {
    it('should return points summary', async () => {
      const summary = {
        totalPoints: 100,
        todayPoints: 10,
        weekPoints: 50,
        monthPoints: 80,
        streak: 5,
        todayRecordCount: 3,
      };
      rewardService.getPointsSummary.mockResolvedValue(summary);

      const result = await controller.getPointsSummary('1');

      expect(result).toEqual(summary);
      expect(rewardService.getPointsSummary).toHaveBeenCalledWith(1);
    });
  });

  // ==================== 礼品管理 ====================

  describe('GET /reward/gifts/:userId', () => {
    it('should return gifts for a user', async () => {
      const gifts = [{ id: 1, name: '动画片', pointsCost: 10 }];
      rewardService.getGifts.mockResolvedValue(gifts);

      const result = await controller.getGifts('1');

      expect(result).toEqual(gifts);
      expect(rewardService.getGifts).toHaveBeenCalledWith(1);
    });
  });

  describe('POST /reward/gifts', () => {
    it('should create a gift', async () => {
      const data = { userId: 1, name: '零食', pointsCost: 15 };
      const created = { id: 1, ...data };
      rewardService.createGift.mockResolvedValue(created);

      const result = await controller.createGift(data);

      expect(result).toEqual(created);
      expect(rewardService.createGift).toHaveBeenCalledWith(data);
    });
  });

  describe('PUT /reward/gifts/:id', () => {
    it('should update a gift', async () => {
      const updated = { id: 1, name: '新礼品', pointsCost: 20 };
      rewardService.updateGift.mockResolvedValue(updated);

      const result = await controller.updateGift('1', { name: '新礼品', pointsCost: 20 });

      expect(result).toEqual(updated);
      expect(rewardService.updateGift).toHaveBeenCalledWith(1, { name: '新礼品', pointsCost: 20 });
    });
  });

  describe('DELETE /reward/gifts/:id', () => {
    it('should delete a gift', async () => {
      rewardService.deleteGift.mockResolvedValue({ affected: 1 });

      const result = await controller.deleteGift('1');

      expect(result).toEqual({ affected: 1 });
      expect(rewardService.deleteGift).toHaveBeenCalledWith(1);
    });
  });

  // ==================== 兑换管理 ====================

  describe('GET /reward/redemptions/:childId', () => {
    it('should return redemptions', async () => {
      const redemptions = [{ id: 1, giftName: '动画片', status: 'pending' }];
      rewardService.getRedemptions.mockResolvedValue(redemptions);

      const result = await controller.getRedemptions('1');

      expect(result).toEqual(redemptions);
      expect(rewardService.getRedemptions).toHaveBeenCalledWith(1);
    });
  });

  describe('POST /reward/redemptions', () => {
    it('should redeem a gift successfully', async () => {
      const data = { childId: 1, giftId: 5, giftName: '动画片', pointsCost: 10 };
      const saved = { id: 1, ...data, status: 'pending' };
      rewardService.redeemGift.mockResolvedValue(saved);

      const result = await controller.redeemGift(data);

      expect(result).toEqual(saved);
      expect(rewardService.redeemGift).toHaveBeenCalledWith(data);
    });

    it('should throw HttpException with BAD_REQUEST when points are insufficient', async () => {
      const data = { childId: 1, giftId: 5, giftName: '玩具', pointsCost: 100 };
      rewardService.redeemGift.mockRejectedValue(new Error('积分不足！当前 30，需要 100'));

      await expect(controller.redeemGift(data)).rejects.toThrow(HttpException);

      try {
        await controller.redeemGift(data);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        expect(error.message).toContain('积分不足');
      }
    });
  });

  describe('PATCH /reward/redemptions/:id', () => {
    it('should update redemption status', async () => {
      const updated = { id: 1, status: 'approved', approvedBy: 10 };
      rewardService.updateRedemptionStatus.mockResolvedValue(updated);

      const result = await controller.updateRedemptionStatus('1', {
        status: 'approved',
        approvedBy: 10,
      });

      expect(result).toEqual(updated);
      expect(rewardService.updateRedemptionStatus).toHaveBeenCalledWith(1, 'approved', 10);
    });

    it('should update status without approvedBy', async () => {
      rewardService.updateRedemptionStatus.mockResolvedValue({ id: 1, status: 'pending' });

      await controller.updateRedemptionStatus('1', { status: 'pending' });

      expect(rewardService.updateRedemptionStatus).toHaveBeenCalledWith(1, 'pending', undefined);
    });
  });

  // ==================== 统计 ====================

  describe('GET /reward/stats/weekly/:childId', () => {
    it('should return weekly stats', async () => {
      const stats = [
        { date: '一', points: 10 },
        { date: '二', points: 5 },
      ];
      rewardService.getWeeklyStats.mockResolvedValue(stats);

      const result = await controller.getWeeklyStats('1');

      expect(result).toEqual(stats);
      expect(rewardService.getWeeklyStats).toHaveBeenCalledWith(1);
    });
  });

  // ==================== 种子数据 ====================

  describe('POST /reward/seed/behaviors/:userId', () => {
    it('should seed default behaviors', async () => {
      rewardService.seedDefaultBehaviors.mockResolvedValue({ created: 18 });

      const result = await controller.seedBehaviors('1');

      expect(result).toEqual({ created: 18 });
      expect(rewardService.seedDefaultBehaviors).toHaveBeenCalledWith(1);
    });
  });

  describe('POST /reward/seed/gifts/:userId', () => {
    it('should seed default gifts', async () => {
      rewardService.seedDefaultGifts.mockResolvedValue({ created: 6 });

      const result = await controller.seedGifts('1');

      expect(result).toEqual({ created: 6 });
      expect(rewardService.seedDefaultGifts).toHaveBeenCalledWith(1);
    });
  });
});
