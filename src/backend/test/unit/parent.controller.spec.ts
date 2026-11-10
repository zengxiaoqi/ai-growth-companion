import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ParentController } from '../../src/modules/parent/parent.controller';

describe('ParentController', () => {
  const parentService = {
    getByParent: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    createWithDefaults: jest.fn(),
    getCasualTools: jest.fn(),
    setCasualTools: jest.fn(),
  };
  const usersService = {
    canAccessChild: jest.fn(),
  };
  const configService = {
    get: jest.fn(),
  };

  let controller: ParentController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new ParentController(
      parentService as any,
      usersService as any,
      configService as any,
    );
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

  describe('GET /parent/controls/child/:childId/casual-tools', () => {
    const req = { user: { sub: 1, type: 'parent' } };

    it('returns catalog, default, override and effective (override wins)', async () => {
      usersService.canAccessChild.mockResolvedValue(true);
      parentService.getCasualTools.mockResolvedValue(['translate']);
      configService.get.mockReturnValue(undefined);

      const result = await controller.getCasualTools('2', req);

      expect(usersService.canAccessChild).toHaveBeenCalledWith(1, 'parent', 2);
      expect(result.default).toEqual(['translate', 'playStory']);
      expect(result.override).toEqual(['translate']);
      expect(result.effective).toEqual(['translate']);
      expect(result.available.map((t: any) => t.name)).toEqual(['translate', 'playStory']);
    });

    it('falls back to default when override is null', async () => {
      usersService.canAccessChild.mockResolvedValue(true);
      parentService.getCasualTools.mockResolvedValue(null);
      configService.get.mockReturnValue('playStory');

      const result = await controller.getCasualTools('2', req);

      expect(result.override).toBeNull();
      expect(result.default).toEqual(['playStory']);
      expect(result.effective).toEqual(['playStory']);
    });

    it('rejects non-parent callers', async () => {
      const childReq = { user: { sub: 2, type: 'child' } };

      await expect(controller.getCasualTools('2', childReq)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(usersService.canAccessChild).not.toHaveBeenCalled();
    });

    it('rejects parents without access to the child', async () => {
      usersService.canAccessChild.mockResolvedValue(false);

      await expect(controller.getCasualTools('2', req)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(parentService.getCasualTools).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /parent/controls/child/:childId/casual-tools', () => {
    const req = { user: { sub: 1, type: 'parent' } };

    beforeEach(() => {
      usersService.canAccessChild.mockResolvedValue(true);
    });

    it('deduplicates and persists a valid tool list', async () => {
      parentService.setCasualTools.mockResolvedValue({ casualTools: ['translate', 'playStory'] });

      const result = await controller.setCasualTools(
        '2',
        { tools: ['translate', 'playStory', 'translate'] },
        req,
      );

      expect(parentService.setCasualTools).toHaveBeenCalledWith(1, 2, ['translate', 'playStory']);
      expect(result).toEqual({ override: ['translate', 'playStory'] });
    });

    it('accepts null to inherit the default', async () => {
      parentService.setCasualTools.mockResolvedValue({ casualTools: null });

      const result = await controller.setCasualTools('2', { tools: null }, req);

      expect(parentService.setCasualTools).toHaveBeenCalledWith(1, 2, null);
      expect(result).toEqual({ override: null });
    });

    it('rejects unknown tool names', async () => {
      await expect(
        controller.setCasualTools('2', { tools: ['translate', 'bogus'] }, req),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(parentService.setCasualTools).not.toHaveBeenCalled();
    });

    it('rejects a non-array, non-null body', async () => {
      await expect(
        controller.setCasualTools('2', { tools: 'translate' as any }, req),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(parentService.setCasualTools).not.toHaveBeenCalled();
    });

    it('rejects parents without access to the child', async () => {
      usersService.canAccessChild.mockResolvedValue(false);

      await expect(
        controller.setCasualTools('2', { tools: ['translate'] }, req),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(parentService.setCasualTools).not.toHaveBeenCalled();
    });
  });
});
