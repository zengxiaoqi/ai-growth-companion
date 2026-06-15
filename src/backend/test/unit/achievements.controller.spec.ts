import { AchievementsController } from '../../src/modules/achievements/achievements.controller';

describe('AchievementsController', () => {
  const achievementsService = {
    findByUser: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
  };

  let controller: AchievementsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AchievementsController(achievementsService as any);
  });

  describe('GET /achievements/user/:userId', () => {
    it('should return achievements for a user', async () => {
      const achievements = [
        { id: 1, title: '首次登录', userId: 3 },
        { id: 2, title: '完成10节课', userId: 3 },
      ];
      achievementsService.findByUser.mockResolvedValue(achievements);

      const result = await controller.findByUser('3');

      expect(result).toEqual(achievements);
      expect(achievementsService.findByUser).toHaveBeenCalledWith(3);
    });

    it('should convert string userId to number', async () => {
      achievementsService.findByUser.mockResolvedValue([]);

      await controller.findByUser('100');

      expect(achievementsService.findByUser).toHaveBeenCalledWith(100);
    });

    it('should return empty array when user has no achievements', async () => {
      achievementsService.findByUser.mockResolvedValue([]);

      const result = await controller.findByUser('999');

      expect(result).toEqual([]);
    });
  });

  describe('GET /achievements/:id', () => {
    it('should return a single achievement by id', async () => {
      const achievement = { id: 5, title: '数学达人', userId: 3 };
      achievementsService.findById.mockResolvedValue(achievement);

      const result = await controller.findById('5');

      expect(result).toEqual(achievement);
      expect(achievementsService.findById).toHaveBeenCalledWith(5);
    });

    it('should convert string id to number', async () => {
      achievementsService.findById.mockResolvedValue(null);

      await controller.findById('42');

      expect(achievementsService.findById).toHaveBeenCalledWith(42);
    });
  });

  describe('POST /achievements', () => {
    it('should create a new achievement', async () => {
      const data = { userId: 3, title: '新课程完成', description: '完成了第一课' };
      const created = { id: 10, ...data };
      achievementsService.create.mockResolvedValue(created);

      const result = await controller.create(data);

      expect(result).toEqual(created);
      expect(achievementsService.create).toHaveBeenCalledWith(data);
    });

    it('should pass data as-is to service', async () => {
      achievementsService.create.mockResolvedValue({});

      await controller.create({ userId: 1, title: '测试' });

      expect(achievementsService.create).toHaveBeenCalledWith({ userId: 1, title: '测试' });
    });
  });
});
