import { ForbiddenException } from "@nestjs/common";
import { AssignmentController } from "../../src/modules/assignment/assignment.controller";

describe("AssignmentController access control", () => {
  const assignmentService = {
    create: jest.fn(),
    findByChild: jest.fn(),
    findByParent: jest.fn(),
    findById: jest.fn(),
    complete: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const usersService = {
    canAccessChild: jest.fn(),
  };

  let controller: AssignmentController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new AssignmentController(
      assignmentService as any,
      usersService as any,
    );
  });

  it("blocks child user from creating assignment", async () => {
    await expect(
      controller.create({ user: { sub: 2, type: "child" } } as any, {
        parentId: 1,
        childId: 2,
        activityType: "quiz",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("blocks parent from reading assignments of non-owned child", async () => {
    usersService.canAccessChild.mockResolvedValue(false);

    await expect(
      controller.findByChild({ user: { sub: 1, type: "parent" } } as any, "22"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("blocks child from completing another child assignment", async () => {
    assignmentService.findById.mockResolvedValue({
      id: 99,
      childId: 33,
    });

    await expect(
      controller.complete({ user: { sub: 2, type: "child" } } as any, "99", {
        score: 90,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
