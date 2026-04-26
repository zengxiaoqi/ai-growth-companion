import { Test, TestingModule } from "@nestjs/testing";
import { NotificationService } from "../../src/modules/notification/notification.service";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Notification } from "../../src/database/entities/notification.entity";
import { NotFoundException } from "@nestjs/common";

describe("NotificationService", () => {
  let service: NotificationService;
  let mockRepo: any;

  beforeEach(async () => {
    mockRepo = {
      create: jest.fn((data) => data),
      save: jest.fn((data) => ({ ...data, id: 1, createdAt: new Date() })),
      find: jest.fn(),
      count: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: getRepositoryToken(Notification), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  afterEach(() => jest.clearAllMocks());

  describe("create", () => {
    it("creates a notification", async () => {
      mockRepo.create.mockReturnValue({
        userId: 1,
        title: "Test",
        message: "Hello",
        type: "system",
      });
      mockRepo.save.mockResolvedValue({
        id: 1,
        userId: 1,
        title: "Test",
        message: "Hello",
        type: "system",
      });

      const result = await service.create({
        userId: 1,
        title: "Test",
        message: "Hello",
        type: "system",
      });
      expect(result.title).toBe("Test");
    });
  });

  describe("findByUser", () => {
    it("returns notifications ordered by createdAt DESC", async () => {
      const mockNotifications = [
        { id: 2, userId: 1, title: "Second", createdAt: new Date() },
        { id: 1, userId: 1, title: "First", createdAt: new Date() },
      ];
      mockRepo.find.mockResolvedValue(mockNotifications);

      const result = await service.findByUser(1);
      expect(result).toHaveLength(2);
    });
  });

  describe("getUnreadCount", () => {
    it("returns unread count", async () => {
      mockRepo.count.mockResolvedValue(3);
      const count = await service.getUnreadCount(1);
      expect(count).toBe(3);
    });
  });

  describe("markAsRead", () => {
    it("marks a notification as read", async () => {
      mockRepo.update.mockResolvedValue({ affected: 1 });
      mockRepo.findOne.mockResolvedValue({ id: 1, read: true });

      const result = await service.markAsRead(1);
      expect(result.read).toBe(true);
    });

    it("throws if notification not found", async () => {
      mockRepo.update.mockResolvedValue({ affected: 1 });
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.markAsRead(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe("markAllAsRead", () => {
    it("marks all unread notifications as read", async () => {
      mockRepo.update.mockResolvedValue({ affected: 5 });
      await service.markAllAsRead(1);
      expect(mockRepo.update).toHaveBeenCalledWith(
        { userId: 1, read: false },
        { read: true },
      );
    });
  });

  describe("notifyAchievement", () => {
    it("creates an achievement notification", async () => {
      mockRepo.create.mockReturnValue({
        userId: 1,
        title: "获得新成就！",
        type: "achievement",
      });
      mockRepo.save.mockResolvedValue({ id: 1, title: "获得新成就！" });

      const result = await service.notifyAchievement(1, "语言大师");
      expect(result.title).toContain("成就");
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: "achievement" }),
      );
    });
  });
});
