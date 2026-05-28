import { ParentController } from '../../src/modules/parent/parent.controller';

describe('ParentController', () => {
  const parentService = {
    getByParent: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    createWithDefaults: jest.fn(),
  };

  let controller: ParentController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new ParentController(parentService as any);
  });

  describe('GET /parent/controls/:parentId', () => {
    it('returns parent controls', async () => {
      const controls = { id: 1, parentId: 1, childId: 2, dailyLimitMinutes: 30 };
      parentService.getByParent.mockResolvedValue(controls);

      const result = await controller.getControls('1');

      expect(result).toEqual(controls);
      expect(parentService.getByParent).toHaveBeenCalledWith(1);
    });

    it('returns empty when no controls exist', async () => {
      parentService.getByParent.mockResolvedValue({ id: 0 });

      const result = await controller.getControls('99');

      expect(result).toEqual({ id: 0 });
    });
  });

  describe('POST /parent/controls', () => {
    it('creates parent control', async () => {
      const created = { id: 1, parentId: 1, childId: 2 };
      parentService.create.mockResolvedValue(created);

      const result = await controller.create({ parentId: 1, childId: 2 });

      expect(result).toEqual(created);
      expect(parentService.create).toHaveBeenCalledWith(1, 2);
    });
  });

  describe('PATCH /parent/controls/:parentId', () => {
    it('updates existing controls', async () => {
      const existing = { id: 1, parentId: 1, dailyLimitMinutes: 30 };
      const updated = { id: 1, parentId: 1, dailyLimitMinutes: 45 };
      parentService.getByParent.mockResolvedValue(existing);
      parentService.update.mockResolvedValue(updated);

      const result = await controller.update('1', { dailyLimitMinutes: 45 });

      expect(result).toEqual(updated);
      expect(parentService.update).toHaveBeenCalledWith(1, { dailyLimitMinutes: 45 });
    });

    it('creates defaults when no existing controls', async () => {
      const defaults = { id: 2, parentId: 1, dailyLimitMinutes: 60 };
      const updated = { id: 2, parentId: 1, dailyLimitMinutes: 45, allowedDomains: ['language'] };
      parentService.getByParent.mockResolvedValue({ id: 0 });
      parentService.createWithDefaults.mockResolvedValue(defaults);
      parentService.update.mockResolvedValue(updated);

      const result = await controller.update('1', {
        dailyLimitMinutes: 45,
        allowedDomains: ['language'],
      });

      expect(result).toEqual(updated);
      expect(parentService.createWithDefaults).toHaveBeenCalledWith(1);
      expect(parentService.update).toHaveBeenCalledWith(2, {
        dailyLimitMinutes: 45,
        allowedDomains: ['language'],
      });
    });

    it('returns created defaults when update body is empty', async () => {
      const defaults = { id: 3, parentId: 1 };
      parentService.getByParent.mockResolvedValue({ id: 0 });
      parentService.createWithDefaults.mockResolvedValue(defaults);

      const result = await controller.update('1', {});

      expect(result).toEqual(defaults);
      expect(parentService.update).not.toHaveBeenCalled();
    });
  });
});