import { GetRecommendationsTool } from '../../src/modules/ai/agent/tools/get-recommendations';

describe('GetRecommendationsTool', () => {
  const recommendService = { recommend: jest.fn() };
  const usersService = { findById: jest.fn() };
  let tool: GetRecommendationsTool;

  beforeEach(() => {
    jest.resetAllMocks();
    tool = new GetRecommendationsTool(recommendService as any, usersService as any);
  });

  it('returns recommendations with content details', async () => {
    usersService.findById.mockResolvedValue({ age: 4 });
    recommendService.recommend.mockResolvedValue({
      recommended: [
        {
          contentId: 10,
          content: { title: '认识动物', domain: '科学' },
          reason: '适合年龄',
          priority: 1,
        },
      ],
      reason: '综合推荐',
      nextLevel: '中级',
    });

    const result = JSON.parse(await tool.execute({ childId: 1 }));
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].title).toBe('认识动物');
    expect(result.overallReason).toBe('综合推荐');
    expect(result.nextLevel).toBe('中级');
  });

  it('maps age 3-4 to ageRange 3-4', async () => {
    usersService.findById.mockResolvedValue({ age: 3 });
    recommendService.recommend.mockResolvedValue({ recommended: [], reason: '', nextLevel: '' });

    await tool.execute({ childId: 1 });
    expect(recommendService.recommend).toHaveBeenCalledWith(
      expect.objectContaining({ ageRange: '3-4' }),
    );
  });

  it('maps age 5-6 to ageRange 5-6', async () => {
    usersService.findById.mockResolvedValue({ age: 6 });
    recommendService.recommend.mockResolvedValue({ recommended: [], reason: '', nextLevel: '' });

    await tool.execute({ childId: 1 });
    expect(recommendService.recommend).toHaveBeenCalledWith(
      expect.objectContaining({ ageRange: '5-6' }),
    );
  });

  it('returns error when user not found', async () => {
    usersService.findById.mockResolvedValue(null);

    const result = JSON.parse(await tool.execute({ childId: 999 }));
    expect(result.error).toBe('用户不存在');
    expect(recommendService.recommend).not.toHaveBeenCalled();
  });

  it('handles missing content fields gracefully', async () => {
    usersService.findById.mockResolvedValue({ age: 5 });
    recommendService.recommend.mockResolvedValue({
      recommended: [{ contentId: 10, content: null, reason: 'test', priority: 1 }],
      reason: '',
      nextLevel: '',
    });

    const result = JSON.parse(await tool.execute({ childId: 1 }));
    expect(result.recommendations[0].title).toBe('未知');
    expect(result.recommendations[0].domain).toBe('未知');
  });

  it('returns error on service exception', async () => {
    usersService.findById.mockRejectedValue(new Error('fail'));

    const result = JSON.parse(await tool.execute({ childId: 1 }));
    expect(result.error).toContain('获取推荐失败');
  });
});
