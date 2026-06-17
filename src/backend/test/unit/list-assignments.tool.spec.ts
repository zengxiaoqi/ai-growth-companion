import { ListAssignmentsTool } from '../../src/modules/ai/agent/tools/list-assignments';

describe('ListAssignmentsTool', () => {
  const assignmentService = { findByChild: jest.fn() };
  let tool: ListAssignmentsTool;

  beforeEach(() => {
    jest.resetAllMocks();
    tool = new ListAssignmentsTool(assignmentService as any);
  });

  it('returns mapped assignments', async () => {
    assignmentService.findByChild.mockResolvedValue([
      {
        id: 1,
        activityType: 'quiz',
        domain: '数学',
        difficulty: 2,
        status: 'pending',
        dueDate: '2026-06-20',
        score: null,
        createdAt: '2026-06-15',
      },
    ]);

    const result = JSON.parse(await tool.execute({ childId: 1 }));
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0]).toEqual(
      expect.objectContaining({
        id: 1,
        activityType: 'quiz',
        domain: '数学',
        status: 'pending',
      }),
    );
  });

  it('returns empty array when no assignments', async () => {
    assignmentService.findByChild.mockResolvedValue([]);

    const result = JSON.parse(await tool.execute({ childId: 1 }));
    expect(result.assignments).toEqual([]);
  });

  it('returns error on service exception', async () => {
    assignmentService.findByChild.mockRejectedValue(new Error('fail'));

    const result = JSON.parse(await tool.execute({ childId: 1 }));
    expect(result.error).toContain('获取作业列表失败');
  });
});
