import { RecommendController } from '../../src/modules/recommend/recommend.controller';

describe('RecommendController', () => {
  const recommendService = {
    recommend: jest.fn(),
  };

  let controller: RecommendController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new RecommendController(recommendService as any);
  });

  describe('GET /recommend', () => {
    it('should return recommendations for user', async () => {
      const recs = [{ contentId: 1, reason: '适合3-4岁' }];
      recommendService.recommend.mockResolvedValue(recs);

      const result = await controller.recommend('5', '3-4');

      expect(result).toEqual(recs);
      expect(recommendService.recommend).toHaveBeenCalledWith({
        userId: 5,
        ageRange: '3-4',
      });
    });

    it('should default ageRange to 3-4 when not provided', async () => {
      recommendService.recommend.mockResolvedValue([]);

      await controller.recommend('5', undefined);

      expect(recommendService.recommend).toHaveBeenCalledWith({
        userId: 5,
        ageRange: '3-4',
      });
    });

    it('should handle 5-6 age range', async () => {
      recommendService.recommend.mockResolvedValue([]);

      await controller.recommend('10', '5-6');

      expect(recommendService.recommend).toHaveBeenCalledWith({
        userId: 10,
        ageRange: '5-6',
      });
    });

    it('should convert userId string to number', async () => {
      recommendService.recommend.mockResolvedValue([]);

      await controller.recommend('42', '3-4');

      expect(recommendService.recommend).toHaveBeenCalledWith({
        userId: 42,
        ageRange: '3-4',
      });
    });
  });
});
