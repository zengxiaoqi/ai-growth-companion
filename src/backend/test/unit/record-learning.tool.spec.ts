import { RecordLearningTool } from '../../src/modules/ai/agent/tools/record-learning';

describe('RecordLearningTool', () => {
  const learningTracker = { recordActivity: jest.fn() };
  let tool: RecordLearningTool;

  beforeEach(() => {
    jest.resetAllMocks();
    tool = new RecordLearningTool(learningTracker as any);
  });

  it('records activity and returns success', async () => {
    learningTracker.recordActivity.mockResolvedValue({
      learningRecord: { id: 42 },
      abilityUpdated: 'math',
      achievementsAwarded: [],
    });

    const result = JSON.parse(
      await tool.execute({ childId: 1, contentId: 10, score: 85, domain: '数学' }),
    );
    expect(result.success).toBe(true);
    expect(result.recordId).toBe(42);
    expect(result.abilityUpdated).toBe('math');
    expect(learningTracker.recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'interactive_activity',
        childId: 1,
        contentId: 10,
        domain: '数学',
        score: 85,
      }),
    );
  });

  it('includes achievement names in message', async () => {
    learningTracker.recordActivity.mockResolvedValue({
      learningRecord: { id: 1 },
      abilityUpdated: 'language',
      achievementsAwarded: ['数学小达人', '学习之星'],
    });

    const result = JSON.parse(
      await tool.execute({ childId: 1, contentId: 10, score: 100, domain: '数学' }),
    );
    expect(result.message).toContain('数学小达人');
    expect(result.message).toContain('学习之星');
  });

  it('rejects score below 0', async () => {
    const result = JSON.parse(
      await tool.execute({ childId: 1, contentId: 10, score: -5, domain: '数学' }),
    );
    expect(result.error).toContain('分数必须在0-100之间');
    expect(learningTracker.recordActivity).not.toHaveBeenCalled();
  });

  it('rejects score above 100', async () => {
    const result = JSON.parse(
      await tool.execute({ childId: 1, contentId: 10, score: 101, domain: '数学' }),
    );
    expect(result.error).toContain('分数必须在0-100之间');
  });

  it('accepts boundary scores 0 and 100', async () => {
    learningTracker.recordActivity.mockResolvedValue({
      learningRecord: { id: 1 },
      abilityUpdated: '',
      achievementsAwarded: [],
    });

    await tool.execute({ childId: 1, contentId: 10, score: 0, domain: '数学' });
    await tool.execute({ childId: 1, contentId: 10, score: 100, domain: '数学' });
    expect(learningTracker.recordActivity).toHaveBeenCalledTimes(2);
  });

  it('returns error on service exception', async () => {
    learningTracker.recordActivity.mockRejectedValue(new Error('fail'));

    const result = JSON.parse(
      await tool.execute({ childId: 1, contentId: 10, score: 50, domain: '数学' }),
    );
    expect(result.error).toContain('记录学习结果失败');
  });
});
