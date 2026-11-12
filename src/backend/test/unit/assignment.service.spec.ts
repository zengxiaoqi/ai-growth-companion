import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AssignmentService } from '../../src/modules/assignment/assignment.service';

describe('AssignmentService parent-child ownership', () => {
  const assignmentRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    remove: jest.fn(),
    count: jest.fn(),
  };
  const generateActivityTool = {
    execute: jest.fn(),
  };
  const learningTracker = {
    recordActivity: jest.fn(),
  };
  const learningArchive = {
    createStudyPlanRecord: jest.fn(),
  };
  const usersService = {
    findById: jest.fn(),
  };

  let service: AssignmentService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new AssignmentService(
      assignmentRepo as any,
      generateActivityTool as any,
      learningTracker as any,
      learningArchive as any,
      usersService as any,
    );
  });

  it('rejects creating assignment for non-owned child', async () => {
    usersService.findById.mockResolvedValue({
      id: 22,
      type: 'child',
      parentId: 99,
    });

    await expect(
      service.create({
        parentId: 10,
        childId: 22,
        activityType: 'quiz',
        activityData: { type: 'quiz', questions: [] },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects creating assignment for non-child target', async () => {
    usersService.findById.mockResolvedValue({
      id: 22,
      type: 'parent',
      parentId: null,
    });

    await expect(
      service.create({
        parentId: 10,
        childId: 22,
        activityType: 'quiz',
        activityData: { type: 'quiz', questions: [] },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // P1 方案 B 六种参数化题型的题目数组各不相同。之前只有 items/pairs 被识别为
  // "已提供完整数据"，其余四种会被误判为空并触发 AI 重新生成（超时且覆盖合法参数）。
  const parameterizedCases = [
    {
      activityType: 'drag_sort',
      activityData: { type: 'drag_sort', items: [{ id: 'i1' }], buckets: [{ id: 'b1' }] },
    },
    {
      activityType: 'memory_flip',
      activityData: { type: 'memory_flip', pairs: [{ id: 'p1' }] },
    },
    {
      activityType: 'pattern_next',
      activityData: { type: 'pattern_next', sequence: [{ id: 's1' }], options: [] },
    },
    {
      activityType: 'color_fill',
      activityData: { type: 'color_fill', regions: [{ id: 'r1' }], palette: [] },
    },
    {
      activityType: 'trace_path',
      activityData: { type: 'trace_path', targets: [{ id: 't1' }] },
    },
    {
      activityType: 'tap_target',
      activityData: { type: 'tap_target', rounds: [{ id: 'round1' }] },
    },
  ];

  it.each(parameterizedCases)(
    'keeps provided $activityType data instead of calling AI generation',
    async ({ activityType, activityData }) => {
      usersService.findById.mockResolvedValue({
        id: 22,
        type: 'child',
        parentId: 10,
      });
      assignmentRepo.create.mockImplementation((data) => ({ id: 100, ...data }));
      assignmentRepo.save.mockImplementation(async (data) => data);
      learningArchive.createStudyPlanRecord.mockResolvedValue({});

      await service.create({
        parentId: 10,
        childId: 22,
        activityType,
        activityData,
      });

      expect(generateActivityTool.execute).not.toHaveBeenCalled();
      expect(assignmentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ activityType, activityData }),
      );
    },
  );

  it('still generates data when a parameterized activity is empty', async () => {
    usersService.findById.mockResolvedValue({
      id: 22,
      type: 'child',
      parentId: 10,
    });
    assignmentRepo.create.mockImplementation((data) => ({ id: 100, ...data }));
    assignmentRepo.save.mockImplementation(async (data) => data);
    learningArchive.createStudyPlanRecord.mockResolvedValue({});
    generateActivityTool.execute.mockResolvedValue(
      JSON.stringify({ type: 'color_fill', regions: [{ id: 'r1' }] }),
    );

    await service.create({
      parentId: 10,
      childId: 22,
      activityType: 'color_fill',
      activityData: { type: 'color_fill', regions: [] },
    });

    expect(generateActivityTool.execute).toHaveBeenCalledTimes(1);
  });
});
