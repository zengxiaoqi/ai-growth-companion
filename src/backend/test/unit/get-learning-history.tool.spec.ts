import { GetLearningHistoryTool } from '../../src/modules/ai/agent/tools/get-learning-history';

describe('GetLearningHistoryTool', () => {
  const learningService = { findByUser: jest.fn() };
  let tool: GetLearningHistoryTool;

  beforeEach(() => {
    jest.resetAllMocks();
    tool = new GetLearningHistoryTool(learningService as any);
  });

  it('returns mapped learning records', async () => {
    learningService.findByUser.mockResolvedValue([
      {
        contentId: 10,
        content: { title: '认识动物' },
        score: 85,
        durationSeconds: 600,
        status: 'completed',
        startedAt: '2026-06-15T10:00:00Z',
        completedAt: '2026-06-15T10:10:00Z',
      },
    ]);

    const result = JSON.parse(await tool.execute({ childId: 1 }));
    expect(result.records).toHaveLength(1);
    expect(result.records[0].contentTitle).toBe('认识动物');
    expect(result.records[0].score).toBe(85);
    expect(learningService.findByUser).toHaveBeenCalledWith(1, 10);
  });

  it('uses custom limit', async () => {
    learningService.findByUser.mockResolvedValue([]);

    await tool.execute({ childId: 1, limit: 20 });
    expect(learningService.findByUser).toHaveBeenCalledWith(1, 20);
  });

  it('returns empty message when no records', async () => {
    learningService.findByUser.mockResolvedValue([]);

    const result = JSON.parse(await tool.execute({ childId: 1 }));
    expect(result.message).toBe('暂无学习记录');
    expect(result.records).toEqual([]);
  });

  it('returns empty message when null', async () => {
    learningService.findByUser.mockResolvedValue(null);

    const result = JSON.parse(await tool.execute({ childId: 1 }));
    expect(result.records).toEqual([]);
  });

  it('handles missing content relation', async () => {
    learningService.findByUser.mockResolvedValue([
      {
        contentId: 10,
        score: 50,
        durationSeconds: 300,
        status: 'in_progress',
        startedAt: '2026-06-15',
        completedAt: null,
      },
    ]);

    const result = JSON.parse(await tool.execute({ childId: 1 }));
    expect(result.records[0].contentTitle).toBe('未知内容');
  });

  it('returns error on service exception', async () => {
    learningService.findByUser.mockRejectedValue(new Error('fail'));

    const result = JSON.parse(await tool.execute({ childId: 1 }));
    expect(result.error).toContain('获取学习记录失败');
  });
});
