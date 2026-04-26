import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { AssignmentService } from "../../src/modules/assignment/assignment.service";

describe("AssignmentService parent-child ownership", () => {
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

  it("rejects creating assignment for non-owned child", async () => {
    usersService.findById.mockResolvedValue({
      id: 22,
      type: "child",
      parentId: 99,
    });

    await expect(
      service.create({
        parentId: 10,
        childId: 22,
        activityType: "quiz",
        activityData: { type: "quiz", questions: [] },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects creating assignment for non-child target", async () => {
    usersService.findById.mockResolvedValue({
      id: 22,
      type: "parent",
      parentId: null,
    });

    await expect(
      service.create({
        parentId: 10,
        childId: 22,
        activityType: "quiz",
        activityData: { type: "quiz", questions: [] },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
