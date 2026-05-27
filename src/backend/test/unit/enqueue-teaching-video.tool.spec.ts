import { EnqueueTeachingVideoTool } from '../../src/agent-framework/tools/impl/enqueue-teaching-video';

describe('EnqueueTeachingVideoTool', () => {
  let queueService: { enqueue: jest.Mock };
  let usersService: { canAccessChild: jest.Mock };
  let tool: EnqueueTeachingVideoTool;

  beforeEach(() => {
    queueService = {
      enqueue: jest.fn(),
    };
    usersService = {
      canAccessChild: jest.fn().mockResolvedValue(true),
    };
    tool = new EnqueueTeachingVideoTool(queueService as any, usersService as any);
  });

  it('validates lessonId', async () => {
    const result = await tool.execute({ childId: 1 }, {
      ageGroup: 'parent',
      conversationId: 'conv-1',
    } as any);

    expect(result.success).toBe(false);
    expect(result.error).toContain('lessonId');
  });

  it('validates childId from args/context', async () => {
    const result = await tool.execute({ lessonId: 12 }, {
      ageGroup: 'parent',
      conversationId: 'conv-1',
    } as any);

    expect(result.success).toBe(false);
    expect(result.error).toContain('childId');
  });

  it('rejects invalid engine', async () => {
    const result = await tool.execute({ lessonId: 12, childId: 2, engine: 'invalid' as any }, {
      ageGroup: 'parent',
      conversationId: 'conv-1',
    } as any);

    expect(result.success).toBe(false);
    expect(result.error).toContain('engine');
  });

  it('rejects unauthorized parent-child access', async () => {
    usersService.canAccessChild.mockResolvedValue(false);

    const result = await tool.execute({ lessonId: 12, childId: 2, engine: 'auto', parentId: 99 }, {
      ageGroup: 'parent',
      parentId: 99,
      conversationId: 'conv-1',
    } as any);

    expect(usersService.canAccessChild).toHaveBeenCalledWith(99, 'parent', 2);
    expect(result.success).toBe(false);
    expect(result.error).toContain('permission');
  });

  it('creates async task and returns task payload', async () => {
    queueService.enqueue.mockResolvedValue({
      id: 99,
      status: 'pending',
      progress: 0,
      provider: 'hyperframes',
      renderEngine: 'auto',
      errorMessage: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await tool.execute({ lessonId: 12, engine: 'auto', force: true }, {
      childId: 2,
      ageGroup: 'parent',
      conversationId: 'conv-1',
    } as any);

    expect(queueService.enqueue).toHaveBeenCalledWith(12, 2, true, 'auto');
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      taskId: 99,
      status: 'pending',
      progress: 0,
      provider: 'hyperframes',
      renderEngine: 'auto',
      ready: false,
    });
  });
});
