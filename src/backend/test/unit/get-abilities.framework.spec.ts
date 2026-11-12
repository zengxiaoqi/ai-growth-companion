import { GetAbilitiesTool } from '../../src/agent-framework/tools/impl/get-abilities';

describe('GetAbilitiesTool (framework)', () => {
  const abilitiesService = { getByUser: jest.fn() };
  let tool: GetAbilitiesTool;

  beforeEach(() => {
    jest.resetAllMocks();
    tool = new GetAbilitiesTool(abilitiesService as any);
  });

  it('labels all six domains incl english', async () => {
    abilitiesService.getByUser.mockResolvedValue([
      { domain: 'language', score: 85, level: 'advanced' },
      { domain: 'english', score: 72, level: 'intermediate' },
    ]);

    const result = await tool.execute({ childId: 1 }, {} as any);
    expect(result.success).toBe(true);
    expect(result.data).toEqual([
      { domain: 'language', domainLabel: '语言表达', score: 85, level: 'advanced' },
      { domain: 'english', domainLabel: '英语能力', score: 72, level: 'intermediate' },
    ]);
  });

  it('falls back to raw key for unknown domain', async () => {
    abilitiesService.getByUser.mockResolvedValue([
      { domain: 'music', score: 50, level: 'beginner' },
    ]);

    const result = await tool.execute({ childId: 1 }, {} as any);
    expect((result.data as any[])[0].domainLabel).toBe('music');
  });

  it('returns failure on service exception', async () => {
    abilitiesService.getByUser.mockRejectedValue(new Error('boom'));

    const result = await tool.execute({ childId: 1 }, {} as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain('获取能力信息失败');
  });
});