import { GetAbilitiesTool } from '../../src/modules/ai/agent/tools/get-abilities';

describe('GetAbilitiesTool', () => {
  const abilitiesService = { getByUser: jest.fn() };
  let tool: GetAbilitiesTool;

  beforeEach(() => {
    jest.resetAllMocks();
    tool = new GetAbilitiesTool(abilitiesService as any);
  });

  it('returns mapped abilities when data exists', async () => {
    abilitiesService.getByUser.mockResolvedValue([
      { domain: 'language', score: 85, level: 'advanced' },
      { domain: 'math', score: 70, level: 'intermediate' },
    ]);

    const result = JSON.parse(await tool.execute({ childId: 1 }));
    expect(result.abilities).toEqual([
      { domain: 'language', score: 85, level: 'advanced' },
      { domain: 'math', score: 70, level: 'intermediate' },
    ]);
  });

  it('returns empty message when no assessments', async () => {
    abilitiesService.getByUser.mockResolvedValue([]);

    const result = JSON.parse(await tool.execute({ childId: 1 }));
    expect(result.message).toBe('暂无能力评估数据');
    expect(result.abilities).toEqual([]);
  });

  it('returns empty message when null', async () => {
    abilitiesService.getByUser.mockResolvedValue(null);

    const result = JSON.parse(await tool.execute({ childId: 1 }));
    expect(result.abilities).toEqual([]);
  });

  it('returns error on service exception', async () => {
    abilitiesService.getByUser.mockRejectedValue(new Error('fail'));

    const result = JSON.parse(await tool.execute({ childId: 1 }));
    expect(result.error).toContain('获取能力评估失败');
  });
});
