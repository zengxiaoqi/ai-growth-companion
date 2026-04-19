import { AssignActivityTool } from '../../src/agent-framework/tools/impl/assign-activity';

describe('AssignActivityTool draft/publish flow', () => {
  const generateActivityTool = {
    execute: jest.fn(),
  };
  const assignmentService = {
    create: jest.fn(),
  };
  const conversationManager = {
    getConversationByUuid: jest.fn(),
    updateMetadata: jest.fn(),
  };

  let tool: AssignActivityTool;
  const context = {
    childId: undefined,
    parentId: 10,
    ageGroup: 'parent',
    conversationId: 'conv-1',
    extra: {},
  };

  beforeEach(() => {
    jest.resetAllMocks();
    generateActivityTool.execute.mockResolvedValue({
      success: true,
      data: { type: 'quiz', questions: [{ question: 'Q1' }] },
    });
    assignmentService.create.mockResolvedValue({ id: 88 });
    tool = new AssignActivityTool(
      generateActivityTool as any,
      assignmentService as any,
      conversationManager as any,
    );
  });

  it('creates a pending draft when confirmPublish is false', async () => {
    const result = await tool.execute(
      {
        childId: 22,
        activityType: 'quiz',
        topic: '动物',
        difficulty: 1,
        ageGroup: '5-6',
        confirmPublish: false,
      },
      context as any,
    );

    expect(result.success).toBe(true);
    expect((result.data as any).status).toBe('draft_ready');
    expect(assignmentService.create).not.toHaveBeenCalled();
    expect(conversationManager.updateMetadata).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({
        pendingAssignmentDraft: expect.objectContaining({
          childId: 22,
          parentId: 10,
          topic: '动物',
        }),
      }),
    );
  });

  it('publishes assignment from valid draft when confirmPublish is true', async () => {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    conversationManager.getConversationByUuid.mockResolvedValue({
      metadata: {
        pendingAssignmentDraft: {
          childId: 22,
          parentId: 10,
          activityType: 'quiz',
          topic: '动物',
          difficulty: 1,
          ageGroup: '5-6',
          activityData: { type: 'quiz', questions: [] },
          createdAt: new Date().toISOString(),
          expiresAt,
        },
      },
    });

    const result = await tool.execute({ confirmPublish: true }, context as any);
    expect(result.success).toBe(true);
    expect((result.data as any).status).toBe('published');
    expect(assignmentService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: 10,
        childId: 22,
        activityType: 'quiz',
      }),
    );
    expect(conversationManager.updateMetadata).toHaveBeenLastCalledWith(
      'conv-1',
      expect.objectContaining({ pendingAssignmentDraft: null }),
    );
  });

  it('clears draft when cancelDraft is true', async () => {
    const result = await tool.execute({ cancelDraft: true }, context as any);
    expect(result.success).toBe(true);
    expect((result.data as any).status).toBe('draft_cleared');
    expect(conversationManager.updateMetadata).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({ pendingAssignmentDraft: null }),
    );
  });

  it('rejects publish when stored draft is expired', async () => {
    conversationManager.getConversationByUuid.mockResolvedValue({
      metadata: {
        pendingAssignmentDraft: {
          childId: 22,
          parentId: 10,
          activityType: 'quiz',
          topic: '动物',
          difficulty: 1,
          ageGroup: '5-6',
          activityData: { type: 'quiz', questions: [] },
          createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
          expiresAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        },
      },
    });

    const result = await tool.execute({ confirmPublish: true }, context as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain('未找到可发布的作业草稿');
    expect(conversationManager.updateMetadata).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({ pendingAssignmentDraft: null }),
    );
    expect(assignmentService.create).not.toHaveBeenCalled();
  });
});
