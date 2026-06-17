import { GetUserProfileTool } from '../../src/modules/ai/agent/tools/get-user-profile';

describe('GetUserProfileTool', () => {
  const usersService = { findById: jest.fn() };
  let tool: GetUserProfileTool;

  beforeEach(() => {
    jest.resetAllMocks();
    tool = new GetUserProfileTool(usersService as any);
  });

  it('returns profile fields when user exists', async () => {
    usersService.findById.mockResolvedValue({
      name: '小明',
      age: 5,
      gender: 'male',
      avatar: 'avatar1.png',
    });

    const result = JSON.parse(await tool.execute({ childId: 1 }));
    expect(result).toEqual({
      name: '小明',
      age: 5,
      gender: 'male',
      avatar: 'avatar1.png',
    });
    expect(usersService.findById).toHaveBeenCalledWith(1);
  });

  it('returns error when user not found', async () => {
    usersService.findById.mockResolvedValue(null);

    const result = JSON.parse(await tool.execute({ childId: 999 }));
    expect(result.error).toBe('用户不存在');
  });

  it('returns error message on service exception', async () => {
    usersService.findById.mockRejectedValue(new Error('DB down'));

    const result = JSON.parse(await tool.execute({ childId: 1 }));
    expect(result.error).toContain('获取用户信息失败');
    expect(result.error).toContain('DB down');
  });
});
