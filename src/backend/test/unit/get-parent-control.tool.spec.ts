import { GetParentControlTool } from '../../src/modules/ai/agent/tools/get-parent-control';

describe('GetParentControlTool', () => {
  const parentService = { getByChild: jest.fn() };
  let tool: GetParentControlTool;

  beforeEach(() => {
    jest.resetAllMocks();
    tool = new GetParentControlTool(parentService as any);
  });

  it('returns control settings when they exist', async () => {
    parentService.getByChild.mockResolvedValue({
      dailyLimitMinutes: 60,
      allowedDomains: ['数学', '科学'],
      blockedTopics: ['暴力'],
    });

    const result = JSON.parse(await tool.execute({ childId: 1 }));
    expect(result.controls).toEqual({
      dailyLimitMinutes: 60,
      allowedDomains: ['数学', '科学'],
      blockedTopics: ['暴力'],
    });
  });

  it('returns null controls when not set', async () => {
    parentService.getByChild.mockResolvedValue(null);

    const result = JSON.parse(await tool.execute({ childId: 1 }));
    expect(result.message).toBe('未设置家长控制');
    expect(result.controls).toBeNull();
  });

  it('returns error on service exception', async () => {
    parentService.getByChild.mockRejectedValue(new Error('fail'));

    const result = JSON.parse(await tool.execute({ childId: 1 }));
    expect(result.error).toContain('获取家长控制失败');
  });
});
