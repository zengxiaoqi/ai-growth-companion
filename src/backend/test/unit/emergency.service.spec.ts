import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmergencyService } from '../../src/modules/emergency/emergency.service';
import { EmergencyCall } from '../../src/database/entities/emergency-call.entity';

describe('EmergencyService', () => {
  let service: EmergencyService;

  const mockRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockUser = {
    id: 1,
    name: '小明',
    phone: '13800000001',
    parentId: 2,
  };

  const mockParent = {
    id: 2,
    name: '爸爸',
    phone: '13800000002',
    parentId: null,
  };

  const mockUsersService = {
    findById: jest.fn(),
  };

  const mockNotificationService = {
    create: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      // Return empty strings for API credentials so EmergencyService uses mock mode
      // instead of attempting real Alicloud API calls that would timeout
      if (key === 'ALIBABA_CLOUD_ACCESS_KEY_ID') return '';
      if (key === 'ALIBABA_CLOUD_ACCESS_KEY_SECRET') return '';
      if (key === 'ALIBABA_CLOUD_SMS_SIGN_NAME') return '灵犀伴学';
      if (key === 'ALIBABA_CLOUD_SMS_TEMPLATE_CODE') return 'SMS_123456';
      if (key === 'ALIBABA_CLOUD_VOICE_TTS_CODE') return 'TTS_123456';
      return '';
    }),
  };

  const createMockQueryBuilder = (countResult: number) => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(countResult),
  });

  beforeEach(() => {
    mockRepo.create.mockImplementation(
      (data: Partial<EmergencyCall>) =>
        ({
          ...data,
          id: 1,
          createdAt: new Date(),
        }) as EmergencyCall,
    );
    mockRepo.save.mockImplementation((entity: any) => Promise.resolve(entity));
    mockRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder(0));
    mockUsersService.findById.mockImplementation((id: number) => {
      if (id === 1) return Promise.resolve(mockUser);
      if (id === 2) return Promise.resolve(mockParent);
      return Promise.resolve(null);
    });
    mockNotificationService.create.mockResolvedValue({});

    service = new EmergencyService(
      mockRepo as any,
      mockUsersService as any,
      mockNotificationService as any,
      mockConfigService as any,
    );
  });

  describe('triggerEmergencyCall', () => {
    it('should throw NotFoundException when child not found', async () => {
      mockUsersService.findById.mockResolvedValueOnce(null);

      await expect(service.triggerEmergencyCall(999)).rejects.toThrow(NotFoundException);
      await expect(service.triggerEmergencyCall(999)).rejects.toThrow('用户不存在');
    });

    it('should throw BadRequestException when child has no parent binding', async () => {
      mockUsersService.findById.mockImplementation((id: number) => {
        if (id === 1) return Promise.resolve({ ...mockUser, parentId: null });
        return Promise.resolve(null);
      });

      await expect(service.triggerEmergencyCall(1)).rejects.toThrow(BadRequestException);
      await expect(service.triggerEmergencyCall(1)).rejects.toThrow('还没有绑定家长账号');
    });

    it('should throw BadRequestException when parent not found', async () => {
      mockUsersService.findById.mockImplementation((id: number) => {
        if (id === 1) return Promise.resolve(mockUser);
        return Promise.resolve(null);
      });

      await expect(service.triggerEmergencyCall(1)).rejects.toThrow(BadRequestException);
      await expect(service.triggerEmergencyCall(1)).rejects.toThrow('家长账号不存在');
    });

    it('should throw BadRequestException when parent has no phone', async () => {
      mockUsersService.findById.mockImplementation((id: number) => {
        if (id === 1) return Promise.resolve(mockUser);
        if (id === 2) return Promise.resolve({ ...mockParent, phone: null });
        return Promise.resolve(null);
      });

      await expect(service.triggerEmergencyCall(1)).rejects.toThrow(BadRequestException);
      await expect(service.triggerEmergencyCall(1)).rejects.toThrow('家长手机号未设置');
    });

    it('should create emergency call record on success', async () => {
      const result = await service.triggerEmergencyCall(1);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          childId: 1,
          parentId: 2,
          parentPhone: '13800000002',
          status: 'pending',
        }),
      );
      expect(result).toHaveProperty('childId', 1);
      expect(result).toHaveProperty('parentId', 2);
    });

    it('should create notification for parent', async () => {
      await service.triggerEmergencyCall(1);

      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 2,
          title: '紧急呼叫',
          type: 'system',
        }),
      );
    });

    it('should handle notification failure gracefully', async () => {
      mockNotificationService.create.mockRejectedValue(new Error('通知失败'));

      // Should not throw — notification failure is caught internally
      const result = await service.triggerEmergencyCall(1);

      expect(result).toBeDefined();
      expect(result.childId).toBe(1);
    });
  });

  describe('getHistory', () => {
    it('should return emergency call history for a child', async () => {
      const mockHistory = [
        { id: 1, childId: 1, parentId: 2, status: 'completed' },
        { id: 2, childId: 1, parentId: 2, status: 'failed' },
      ];
      mockRepo.find.mockResolvedValue(mockHistory);

      const result = await service.getHistory(1);

      expect(mockRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { childId: 1 },
          order: { createdAt: 'DESC' },
          take: 20,
        }),
      );
      expect(result).toEqual(mockHistory);
    });

    it('should respect custom limit parameter', async () => {
      mockRepo.find.mockResolvedValue([]);

      await service.getHistory(1, 5);

      expect(mockRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { childId: 1 },
          take: 5,
        }),
      );
    });

    it('should return empty array when no history', async () => {
      mockRepo.find.mockResolvedValue([]);

      const result = await service.getHistory(1);

      expect(result).toEqual([]);
    });
  });

  describe('rate limiting', () => {
    it('should allow first call within limit', async () => {
      mockRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder(0));

      const result = await service.triggerEmergencyCall(1);
      expect(result).toBeDefined();
    });

    it('should reject when rate limit exceeded (1 per 60s)', async () => {
      mockRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder(1));

      await expect(service.triggerEmergencyCall(1)).rejects.toThrow(BadRequestException);
      await expect(service.triggerEmergencyCall(1)).rejects.toThrow('操作太频繁');
    });

    it('should reject when hourly limit exceeded (5 per hour)', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest
          .fn()
          .mockResolvedValueOnce(0) // minute check passes
          .mockResolvedValueOnce(5), // hour check fails
      };
      mockRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(service.triggerEmergencyCall(1)).rejects.toThrow('紧急呼叫次数已达上限');
    });
  });
});
