import { AbilitiesController } from '../../src/modules/abilities/abilities.controller';

describe('AbilitiesController', () => {
  const abilitiesService = {
    create: jest.fn(),
    getByUser: jest.fn(),
  };

  let controller: AbilitiesController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AbilitiesController(abilitiesService as any);
  });

  describe('POST /abilities', () => {
    it('should create an ability assessment', async () => {
      const body = { userId: 1, domain: 'language', score: 85 };
      const created = { id: 1, ...body };
      abilitiesService.create.mockResolvedValue(created);

      const result = await controller.create(body);

      expect(result).toEqual(created);
      expect(abilitiesService.create).toHaveBeenCalledWith(1, 'language', 85);
    });

    it('should pass score as-is to service', async () => {
      abilitiesService.create.mockResolvedValue({});

      await controller.create({ userId: 2, domain: 'math', score: 0 });

      expect(abilitiesService.create).toHaveBeenCalledWith(2, 'math', 0);
    });
  });

  describe('GET /abilities/:userId', () => {
    it('should return abilities for a user', async () => {
      const abilities = [
        { id: 1, domain: 'language', score: 85 },
        { id: 2, domain: 'math', score: 70 },
      ];
      abilitiesService.getByUser.mockResolvedValue(abilities);

      const result = await controller.findByUser('5');

      expect(result).toEqual(abilities);
      expect(abilitiesService.getByUser).toHaveBeenCalledWith(5);
    });

    it('should convert string userId to number', async () => {
      abilitiesService.getByUser.mockResolvedValue([]);

      await controller.findByUser('42');

      expect(abilitiesService.getByUser).toHaveBeenCalledWith(42);
    });

    it('should return empty array when user has no assessments', async () => {
      abilitiesService.getByUser.mockResolvedValue([]);

      const result = await controller.findByUser('999');

      expect(result).toEqual([]);
    });
  });
});
