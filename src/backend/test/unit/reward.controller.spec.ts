import { HttpException, HttpStatus } from '@nestjs/common';
import { RewardController } from '../../src/modules/reward/reward.controller';
import { RewardService } from '../../src/modules/reward/reward.service';

describe('RewardController', () => {
  let controller: RewardController;
  let service: Record<string, jest.Mock>;

  beforeEach(() => {
    service = {
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

    controller = new RewardController(service as any);
  });

  afterEach(() => jest.clearAllMocks());

  // ==================== 行为模板 ====================

  describe('GET /reward/behaviors/:userId', () => {
    it('should return behaviors for a user', async () => {
      const behaviors = [{ id: 1, name: '起床洗漱' }];
      service.getBehaviors.mockResolvedValue(behaviors);

      const result = await controller.getBehaviors('1');

      expect(service.getBehaviors).toHaveBeenCalledWith(1);
      expect(result).toEqual(behaviors);
    });

    it('should convert string userId to number', async () => {
      service.getBehaviors.mockResolvedValue([]);

      await controller.getBehaviors('42');

      expect(service.getBehaviors).toHaveBeenCalledWith(42);
    });
  });

  describe('POST /reward/behaviors', () => {
    it('should create a behavior', async () => {
      const data = { userId: 1, name: '阅读', points: 3 };
      const created = { id: 1, ...data };
      service.createBehavior.mockResolvedValue(created);

      const result = await controller.createBehavior(data);

      expect(service.createBehavior).toHaveBeenCalledWith(data);
      expect(result).toEqual(created);
    });
  });

  describe('PUT /reward/behaviors/:id', () => {
    it('should update a behavior', async () => {
      const data = { name: '新名称' };
      const updated = { id: 1, ...data };
      service.updateBehavior.mockResolvedValue(updated);

      const result = await controller.updateBehavior('1', data);

      expect(service.updateBehavior).toHaveBeenCalledWith(1, data);
      expect(result).toEqual(updated);
    });
  });

  describe('DELETE /reward/behaviors/:id', () => {
    it('should delete a behavior', async () => {
      service.deleteBehavior.mockResolvedValue({ affected: 1 });

      const result = await controller.deleteBehavior('1');

      expect(service.deleteBehavior).toHaveBeenCalledWith(1);
      expect(result).toEqual({ affected: 1 });
    });
  });

  describe('PATCH /reward/behaviors/:id/toggle', () => {
    it('should toggle a behavior', async () => {
      const toggled = { id: 1, isEnabled: false };
      service.toggleBehavior.mockResolvedValue(toggled);

      const result = await controller.toggleBehavior('1');

      expect(service.toggleBehavior).toHaveBeenCalledWith(1);
      expect(result).toEqual(toggled);
    });
  });

  // ==================== 积分记录 ====================

  describe('GET /reward/points/:childId', () => {
    it('should return paginated point records', async () => {
      const records = { records: [], total: 0, page: 1, limit: 20 };
      service.getPointRecords.mockResolvedValue(records);

      const result = await controller.getPointRecords('1', '1', '20');

      expect(service.getPointRecords).toHaveBeenCalledWith(1, 1, 20);
      expect(result).toEqual(records);
    });

    it('should use default pagination values', async () => {
      service.getPointRecords.mockResolvedValue({ records: [], total: 0, page: 1, limit: 20 });

      await controller.getPointRecords('1');

      expect(service.getPointRecords).toHaveBeenCalledWith(1, 1, 20);
    });

    it('should handle custom page and limit', async () => {
      service.getPointRecords.mockResolvedValue({ records: [], total: 50, page: 3, limit: 10 });

      await controller.getPointRecords('5', '3', '10');

      expect(service.getPointRecords).toHaveBeenCalledWith(5, 3, 10);
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
      service.recordPoints.mockResolvedValue(saved);

      const result = await controller.recordPoints(data);

      expect(service.recordPoints).toHaveBeenCalledWith(
        expect.objectContaining({
          childId: 1,
          behaviorName: '起床洗漱',
          points: 2,
        }),
      );
      expect(result).toEqual(saved);
    });

    it('should convert recordedAt string to Date', async () => {
      const data = {
        childId: 1,
        behaviorName: '测试',
        points: 1,
        recordedBy: 10,
        recordedAt: '2026-06-24T10:00:00.000Z',
      };
      service.recordPoints.mockResolvedValue({});

      await controller.recordPoints(data);

      expect(service.recordPoints).toHaveBeenCalledWith(
        expect.objectContaining({
          recordedAt: new Date('2026-06-24T10:00:00.000Z'),
        }),
      );
    });

    it('should pass undefined for recordedAt when not provided', async () => {
      const data = {
        childId: 1,
        behaviorName: '测试',
        points: 1,
        recordedBy: 10,
      };
      service.recordPoints.mockResolvedValue({});

      await controller.recordPoints(data);

      expect(service.recordPoints).toHaveBeenCalledWith(
        expect.objectContaining({
          recordedAt: undefined,
        }),
      );
    });
  });

  describe('DELETE /reward/points/:id', () => {
    it('should delete a point record', async () => {
      service.deletePointRecord.mockResolvedValue({ affected: 1 });

      const result = await controller.deletePointRecord('5');

      expect(service.deletePointRecord).toHaveBeenCalledWith(5);
      expect(result).toEqual({ affected: 1 });
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
      service.getPointsSummary.mockResolvedValue(summary);

      const result = await controller.getPointsSummary('1');

      expect(service.getPointsSummary).toHaveBeenCalledWith(1);
      expect(result).toEqual(summary);
    });
  });

  // ==================== 礼品管理 ====================

  describe('GET /reward/gifts/:userId', () => {
    it('should return gifts for a user', async () => {
      const gifts = [{ id: 1, name: '零食', pointsCost: 10 }];
      service.getGifts.mockResolvedValue(gifts);

      const result = await controller.getGifts('1');

      expect(service.getGifts).toHaveBeenCalledWith(1);
      expect(result).toEqual(gifts);
    });
  });

  describe('POST /reward/gifts', () => {
    it('should create a gift', async () => {
      const data = { userId: 1, name: '玩具', pointsCost: 100 };
      const created = { id: 1, ...data };
      service.createGift.mockResolvedValue(created);

      const result = await controller.createGift(data);

      expect(service.createGift).toHaveBeenCalledWith(data);
      expect(result).toEqual(created);
    });
  });

  describe('PUT /reward/gifts/:id', () => {
    it('should update a gift', async () => {
      const data = { pointsCost: 150 };
      const updated = { id: 1, pointsCost: 150 };
      service.updateGift.mockResolvedValue(updated);

      const result = await controller.updateGift('1', data);

      expect(service.updateGift).toHaveBeenCalledWith(1, data);
      expect(result).toEqual(updated);
    });
  });

  describe('DELETE /reward/gifts/:id', () => {
    it('should delete a gift', async () => {
      service.deleteGift.mockResolvedValue({ affected: 1 });

      const result = await controller.deleteGift('1');

      expect(service.deleteGift).toHaveBeenCalledWith(1);
      expect(result).toEqual({ affected: 1 });
    });
  });

  // ==================== 兑换管理 ====================

  describe('GET /reward/redemptions/:childId', () => {
    it('should return redemptions for a child', async () => {
      const redemptions = [{ id: 1, giftName: '零食', status: 'pending' }];
      service.getRedemptions.mockResolvedValue(redemptions);

      const result = await controller.getRedemptions('1');

      expect(service.getRedemptions).toHaveBeenCalledWith(1);
      expect(result).toEqual(redemptions);
    });
  });

  describe('POST /reward/redemptions', () => {
    it('should redeem a gift successfully', async () => {
      const data = { childId: 1, giftId: 1, giftName: '零食', pointsCost: 10 };
      const redemption = { id: 1, ...data, status: 'pending' };
      service.redeemGift.mockResolvedValue(redemption);

      const result = await controller.redeemGift(data);

      expect(service.redeemGift).toHaveBeenCalledWith(data);
      expect(result).toEqual(redemption);
    });

    it('should throw HttpException when points insufficient', async () => {
      const data = { childId: 1, giftId: 1, giftName: '玩具', pointsCost: 100 };
      service.redeemGift.mockRejectedValue(new Error('积分不足！当前 5，需要 100'));

      await expect(controller.redeemGift(data)).rejects.toThrow(HttpException);
    });

    it('should throw with BAD_REQUEST status on insufficient points', async () => {
      const data = { childId: 1, giftId: 1, giftName: '玩具', pointsCost: 100 };
      service.redeemGift.mockRejectedValue(new Error('积分不足！当前 5，需要 100'));

      try {
        await controller.redeemGift(data);
        fail('Expected HttpException');
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect((e as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      }
    });

    it('should preserve error message in HttpException', async () => {
      const data = { childId: 1, giftId: 1, giftName: '玩具', pointsCost: 100 };
      service.redeemGift.mockRejectedValue(new Error('积分不足！当前 5，需要 100'));

      try {
        await controller.redeemGift(data);
        fail('Expected HttpException');
      } catch (e) {
        expect((e as HttpException).message).toBe('积分不足！当前 5，需要 100');
      }
    });
  });

  describe('PATCH /reward/redemptions/:id', () => {
    it('should update redemption status', async () => {
      const data = { status: 'approved', approvedBy: 10 };
      const updated = { id: 1, ...data };
      service.updateRedemptionStatus.mockResolvedValue(updated);

      const result = await controller.updateRedemptionStatus('1', data);

      expect(service.updateRedemptionStatus).toHaveBeenCalledWith(1, 'approved', 10);
      expect(result).toEqual(updated);
    });

    it('should handle status update without approvedBy', async () => {
      const data = { status: 'cancelled' };
      service.updateRedemptionStatus.mockResolvedValue({ id: 1, status: 'cancelled' });

      await controller.updateRedemptionStatus('1', data);

      expect(service.updateRedemptionStatus).toHaveBeenCalledWith(1, 'cancelled', undefined);
    });
  });

  // ==================== 统计 ====================

  describe('GET /reward/stats/weekly/:childId', () => {
    it('should return weekly stats', async () => {
      const stats = [
        { date: '一', points: 5 },
        { date: '二', points: 3 },
      ];
      service.getWeeklyStats.mockResolvedValue(stats);

      const result = await controller.getWeeklyStats('1');

      expect(service.getWeeklyStats).toHaveBeenCalledWith(1);
      expect(result).toEqual(stats);
    });
  });

  // ==================== 种子数据 ====================

  describe('POST /reward/seed/behaviors/:userId', () => {
    it('should seed default behaviors', async () => {
      const result = { created: 18 };
      service.seedDefaultBehaviors.mockResolvedValue(result);

      const response = await controller.seedBehaviors('1');

      expect(service.seedDefaultBehaviors).toHaveBeenCalledWith(1);
      expect(response).toEqual(result);
    });
  });

  describe('POST /reward/seed/gifts/:userId', () => {
    it('should seed default gifts', async () => {
      const result = { created: 6 };
      service.seedDefaultGifts.mockResolvedValue(result);

      const response = await controller.seedGifts('1');

      expect(service.seedDefaultGifts).toHaveBeenCalledWith(1);
      expect(response).toEqual(result);
    });
  });
});
