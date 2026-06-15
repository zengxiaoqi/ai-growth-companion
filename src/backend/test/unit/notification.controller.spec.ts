import { NotificationController } from '../../src/modules/notification/notification.controller';

describe('NotificationController', () => {
  const notificationService = {
    findByUser: jest.fn(),
    getUnreadCount: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
  };

  let controller: NotificationController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new NotificationController(notificationService as any);
  });

  describe('GET /notifications/:userId', () => {
    it('should return notifications with unread count', async () => {
      const notifications = [{ id: 1, title: '新课程', read: false }];
      notificationService.findByUser.mockResolvedValue(notifications);
      notificationService.getUnreadCount.mockResolvedValue(3);

      const result = await controller.list('5', '10');

      expect(result).toEqual({ notifications, unreadCount: 3 });
      expect(notificationService.findByUser).toHaveBeenCalledWith(5, 10);
      expect(notificationService.getUnreadCount).toHaveBeenCalledWith(5);
    });

    it('should default limit to 20 when not provided', async () => {
      notificationService.findByUser.mockResolvedValue([]);
      notificationService.getUnreadCount.mockResolvedValue(0);

      await controller.list('5');

      expect(notificationService.findByUser).toHaveBeenCalledWith(5, 20);
    });

    it('should handle limit as string number', async () => {
      notificationService.findByUser.mockResolvedValue([]);
      notificationService.getUnreadCount.mockResolvedValue(0);

      await controller.list('5', '50');

      expect(notificationService.findByUser).toHaveBeenCalledWith(5, 50);
    });
  });

  describe('GET /notifications/:userId/unread-count', () => {
    it('should return unread count', async () => {
      notificationService.getUnreadCount.mockResolvedValue(7);

      const result = await controller.unreadCount('3');

      expect(result).toEqual({ count: 7 });
      expect(notificationService.getUnreadCount).toHaveBeenCalledWith(3);
    });

    it('should return zero when no unread notifications', async () => {
      notificationService.getUnreadCount.mockResolvedValue(0);

      const result = await controller.unreadCount('1');

      expect(result).toEqual({ count: 0 });
    });
  });

  describe('POST /notifications/:id/read', () => {
    it('should mark notification as read', async () => {
      const updated = { id: 5, read: true };
      notificationService.markAsRead.mockResolvedValue(updated);

      const result = await controller.markAsRead('5');

      expect(result).toEqual(updated);
      expect(notificationService.markAsRead).toHaveBeenCalledWith(5);
    });
  });

  describe('POST /notifications/user/:userId/read-all', () => {
    it('should mark all notifications as read', async () => {
      notificationService.markAllAsRead.mockResolvedValue(undefined);

      const result = await controller.markAllAsRead('10');

      expect(result).toEqual({ success: true });
      expect(notificationService.markAllAsRead).toHaveBeenCalledWith(10);
    });
  });
});
