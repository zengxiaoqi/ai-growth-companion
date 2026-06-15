import { NotFoundException } from '@nestjs/common';
import { ParentService } from '../../src/modules/parent/parent.service';

describe('ParentService', () => {
  const repository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  let service: ParentService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ParentService(repository as any);
  });

  describe('getByParent', () => {
    it('should return existing control when found', async () => {
      const existing = { id: 1, parentId: 10, dailyLimitMinutes: 30 };
      repository.find.mockResolvedValue([existing]);

      const result = await service.getByParent(10);

      expect(result).toEqual(existing);
      expect(repository.find).toHaveBeenCalledWith({ where: { parentId: 10 } });
    });

    it('should return first control when multiple exist', async () => {
      const first = { id: 1, parentId: 10 };
      const second = { id: 2, parentId: 10 };
      repository.find.mockResolvedValue([first, second]);

      const result = await service.getByParent(10);

      expect(result).toEqual(first);
    });

    it('should return default control when none exist', async () => {
      repository.find.mockResolvedValue([]);

      const result = await service.getByParent(99);

      expect(result).toEqual({
        id: 0,
        parentId: 99,
        dailyLimitMinutes: 30,
        allowedDomains: ['language', 'math', 'science', 'art', 'social'],
        blockedTopics: [],
        studySchedule: null,
        notifications: null,
        eyeProtectionEnabled: true,
        restReminderMinutes: 20,
        contentFilterEnabled: true,
      });
    });
  });

  describe('getByChild', () => {
    it('should return control for the given child', async () => {
      const control = { id: 1, childId: 5, parentId: 10 };
      repository.findOne.mockResolvedValue(control);

      const result = await service.getByChild(5);

      expect(result).toEqual(control);
      expect(repository.findOne).toHaveBeenCalledWith({ where: { childId: 5 } });
    });

    it('should return null when no control exists for child', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.getByChild(999);

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should return existing control if already exists', async () => {
      const existing = { id: 1, parentId: 10, childId: 5 };
      repository.findOne.mockResolvedValue(existing);

      const result = await service.create(10, 5);

      expect(result).toEqual(existing);
      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('should create and save new control when none exists', async () => {
      repository.findOne.mockResolvedValue(null);
      const created = { id: 2, uuid: 'test-uuid', parentId: 10, childId: 5 };
      repository.create.mockReturnValue(created);
      repository.save.mockResolvedValue(created);

      const result = await service.create(10, 5);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          parentId: 10,
          childId: 5,
          studySchedule: '{}',
          notifications: '{}',
        }),
      );
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ uuid: expect.any(String) }),
      );
      expect(repository.save).toHaveBeenCalledWith(created);
      expect(result).toEqual(created);
    });
  });

  describe('createWithDefaults', () => {
    it('should return existing control if any exists for parent', async () => {
      const existing = { id: 1, parentId: 10, childId: 3 };
      repository.findOne.mockResolvedValue(existing);

      const result = await service.createWithDefaults(10);

      expect(result).toEqual(existing);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('should create default control when none exists for parent', async () => {
      repository.findOne.mockResolvedValue(null);
      const created = { id: 3, uuid: 'test-uuid', parentId: 10, childId: 0 };
      repository.create.mockReturnValue(created);
      repository.save.mockResolvedValue(created);

      const result = await service.createWithDefaults(10);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          parentId: 10,
          childId: 0,
          studySchedule: '{}',
          notifications: '{}',
        }),
      );
      expect(repository.save).toHaveBeenCalledWith(created);
      expect(result).toEqual(created);
    });
  });

  describe('update', () => {
    it('should update and return the control', async () => {
      const updated = { id: 1, parentId: 10, dailyLimitMinutes: 60 };
      repository.update.mockResolvedValue(undefined);
      repository.findOne.mockResolvedValue(updated);

      const result = await service.update(1, { dailyLimitMinutes: 60 });

      expect(repository.update).toHaveBeenCalledWith(1, { dailyLimitMinutes: 60 });
      expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(result).toEqual(updated);
    });

    it('should throw NotFoundException when control not found after update', async () => {
      repository.update.mockResolvedValue(undefined);
      repository.findOne.mockResolvedValue(null);

      await expect(service.update(999, { dailyLimitMinutes: 60 })).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.update(999, { dailyLimitMinutes: 60 })).rejects.toThrow('设置不存在');
    });

    it('should handle partial updates', async () => {
      const updated = {
        id: 1,
        parentId: 10,
        dailyLimitMinutes: 30,
        eyeProtectionEnabled: false,
      };
      repository.update.mockResolvedValue(undefined);
      repository.findOne.mockResolvedValue(updated);

      const result = await service.update(1, { eyeProtectionEnabled: false });

      expect(repository.update).toHaveBeenCalledWith(1, { eyeProtectionEnabled: false });
      expect(result.eyeProtectionEnabled).toBe(false);
    });

    it('should handle updating allowedDomains', async () => {
      const updated = {
        id: 1,
        parentId: 10,
        allowedDomains: ['language', 'math'],
      };
      repository.update.mockResolvedValue(undefined);
      repository.findOne.mockResolvedValue(updated);

      const result = await service.update(1, { allowedDomains: ['language', 'math'] });

      expect(result.allowedDomains).toEqual(['language', 'math']);
    });
  });
});
