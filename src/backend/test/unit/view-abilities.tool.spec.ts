import { ViewAbilitiesTool } from '../../src/modules/ai/agent/tools/view-abilities';

describe('ViewAbilitiesTool', () => {
  const abilitiesService = { getByUser: jest.fn() };
  const reportService = { getAbilityTrend: jest.fn() };
  let tool: ViewAbilitiesTool;

  beforeEach(() => {
    jest.resetAllMocks();
    tool = new ViewAbilitiesTool(abilitiesService as any, reportService as any);
  });

  it('returns abilities with domain labels and trend', async () => {
    abilitiesService.getByUser.mockResolvedValue([
      { domain: 'language', score: 85, level: 'advanced' },
      { domain: 'math', score: 70, level: 'intermediate' },
    ]);
    reportService.getAbilityTrend.mockResolvedValue([{ date: '2026-06-01', scores: {} }]);

    const result = JSON.parse(await tool.execute({ childId: 1 }));
    expect(result.abilities).toHaveLength(2);
    expect(result.abilities[0].domainLabel).toBe('语言表达');
    expect(result.abilities[1].domainLabel).toBe('数学逻辑');
    expect(result.trend).toHaveLength(1);
    expect(abilitiesService.getByUser).toHaveBeenCalledWith(1);
    expect(reportService.getAbilityTrend).toHaveBeenCalledWith(1, 4);
  });

  it('uses domain as label when no mapping exists', async () => {
    abilitiesService.getByUser.mockResolvedValue([{ domain: 'custom', score: 50, level: 'basic' }]);
    reportService.getAbilityTrend.mockResolvedValue([]);

    const result = JSON.parse(await tool.execute({ childId: 1 }));
    expect(result.abilities[0].domainLabel).toBe('custom');
  });

  it('handles all five domain labels', async () => {
    abilitiesService.getByUser.mockResolvedValue([
      { domain: 'language', score: 1, level: 'a' },
      { domain: 'math', score: 2, level: 'b' },
      { domain: 'science', score: 3, level: 'c' },
      { domain: 'art', score: 4, level: 'd' },
      { domain: 'social', score: 5, level: 'e' },
    ]);
    reportService.getAbilityTrend.mockResolvedValue([]);

    const result = JSON.parse(await tool.execute({ childId: 1 }));
    expect(result.abilities.map((a: any) => a.domainLabel)).toEqual([
      '语言表达',
      '数学逻辑',
      '科学探索',
      '艺术创造',
      '社会交往',
    ]);
  });

  it('returns error on service exception', async () => {
    abilitiesService.getByUser.mockRejectedValue(new Error('fail'));
    reportService.getAbilityTrend.mockResolvedValue([]);

    const result = JSON.parse(await tool.execute({ childId: 1 }));
    expect(result.error).toContain('获取能力数据失败');
  });
});
