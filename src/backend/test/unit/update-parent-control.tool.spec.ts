import { UpdateParentControlTool } from '../../src/modules/ai/agent/tools/update-parent-control';

describe('UpdateParentControlTool', () => {
  const parentService = {
    getByParent: jest.fn(),
    createWithDefaults: jest.fn(),
    update: jest.fn(),
  };
  let tool: UpdateParentControlTool;

  beforeEach(() => {
    jest.resetAllMocks();
    tool = new UpdateParentControlTool(parentService as any);
  });

  it('updates existing control with specified fields', async () => {
    parentService.getByParent.mockResolvedValue({ id: 5 });
    parentService.update.mockResolvedValue({
      dailyLimitMinutes: 90,
      allowedDomains: ['数学'],
      blockedTopics: [],
      eyeProtectionEnabled: true,
      restReminderMinutes: 20,
    });

    const result = JSON.parse(
      await tool.execute({
        parentId: 10,
        dailyLimitMinutes: 90,
        allowedDomains: ['数学'],
        eyeProtectionEnabled: true,
        restReminderMinutes: 20,
      }),
    );

    expect(result.success).toBe(true);
    expect(result.controls.dailyLimitMinutes).toBe(90);
    expect(parentService.update).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        dailyLimitMinutes: 90,
        allowedDomains: ['数学'],
        eyeProtectionEnabled: true,
        restReminderMinutes: 20,
      }),
    );
    expect(parentService.createWithDefaults).not.toHaveBeenCalled();
  });

  it('creates new control when existing has id 0', async () => {
    parentService.getByParent.mockResolvedValue({ id: 0 });
    parentService.createWithDefaults.mockResolvedValue({ id: 99 });
    parentService.update.mockResolvedValue({
      dailyLimitMinutes: 30,
      allowedDomains: [],
      blockedTopics: [],
      eyeProtectionEnabled: false,
      restReminderMinutes: 15,
    });

    const result = JSON.parse(await tool.execute({ parentId: 10, dailyLimitMinutes: 30 }));

    expect(result.success).toBe(true);
    expect(parentService.createWithDefaults).toHaveBeenCalledWith(10);
    expect(parentService.update).toHaveBeenCalledWith(99, expect.any(Object));
  });

  it('only includes defined fields in update data', async () => {
    parentService.getByParent.mockResolvedValue({ id: 5 });
    parentService.update.mockResolvedValue({
      dailyLimitMinutes: 60,
      allowedDomains: [],
      blockedTopics: [],
      eyeProtectionEnabled: false,
      restReminderMinutes: 15,
    });

    await tool.execute({ parentId: 10, blockedTopics: ['暴力'] });

    const updateArg = parentService.update.mock.calls[0][1];
    expect(updateArg).toHaveProperty('blockedTopics', ['暴力']);
    expect(updateArg).not.toHaveProperty('dailyLimitMinutes');
    expect(updateArg).not.toHaveProperty('allowedDomains');
    expect(updateArg).not.toHaveProperty('eyeProtectionEnabled');
    expect(updateArg).not.toHaveProperty('restReminderMinutes');
  });

  it('returns error on service exception', async () => {
    parentService.getByParent.mockRejectedValue(new Error('fail'));

    const result = JSON.parse(await tool.execute({ parentId: 10, dailyLimitMinutes: 60 }));
    expect(result.error).toContain('更新设置失败');
  });
});
