import { ViewAbilitiesTool } from '../../src/agent-framework/tools/impl/view-abilities';

describe('ViewAbilitiesTool (framework)', () => {
  const abilitiesService = { getByUser: jest.fn() };
  const reportService = { getAbilityTrend: jest.fn() };
  let tool: ViewAbilitiesTool;

  beforeEach(() => {
    jest.resetAllMocks();
    tool = new ViewAbilitiesTool(abilitiesService as any, reportService as any);
  });

  it('labels english in abilities (drift fix) and passes trend through', async () => {
    abilitiesService.getByUser.mockResolvedValue([
      { domain: 'english', score: 80, level: 'advanced' },
      { domain: 'social', score: 60, level: 'intermediate' },
    ]);
    reportService.getAbilityTrend.mockResolvedValue([
      { week: '第1周', language: 0, math: 0, science: 0, art: 0, social: 60, english: 80 },
    ]);

    const result = await tool.execute({ childId: 1 }, {} as any);
    expect(result.success).toBe(true);
    const data = result.data as any;
    expect(data.abilities).toEqual([
      { domain: 'english', domainLabel: '英语能力', score: 80, level: 'advanced' },
      { domain: 'social', domainLabel: '社会交往', score: 60, level: 'intermediate' },
    ]);
    expect(data.trend[0].english).toBe(80);
  });

  it('returns failure on exception', async () => {
    abilitiesService.getByUser.mockRejectedValue(new Error('boom'));
    reportService.getAbilityTrend.mockResolvedValue([]);

    const result = await tool.execute({ childId: 1 }, {} as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain('获取能力数据失败');
  });
});