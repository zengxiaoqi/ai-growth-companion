import { UsersController } from '../../src/modules/users/users.controller';

describe('UsersController', () => {
  const usersService = {
    findByParentId: jest.fn(),
    findSafeById: jest.fn(),
    addChild: jest.fn(),
    updateChild: jest.fn(),
    deleteChild: jest.fn(),
    linkChild: jest.fn(),
  };

  let controller: UsersController;
  const mockReq = { user: { sub: 1 } };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new UsersController(usersService as any);
  });

  describe('GET /users/children', () => {
    it('should return children for the current parent', async () => {
      const children = [
        { id: 2, name: '小明', role: 'student' },
        { id: 3, name: '小红', role: 'student' },
      ];
      usersService.findByParentId.mockResolvedValue(children);

      const result = await controller.getChildren(mockReq);

      expect(result).toEqual(children);
      expect(usersService.findByParentId).toHaveBeenCalledWith(1);
    });

    it('should return empty array when parent has no children', async () => {
      usersService.findByParentId.mockResolvedValue([]);

      const result = await controller.getChildren({ user: { sub: 99 } });

      expect(result).toEqual([]);
      expect(usersService.findByParentId).toHaveBeenCalledWith(99);
    });
  });

  describe('GET /users/me', () => {
    it('should return current user info', async () => {
      const user = { id: 5, nickname: '家长A', phone: '138****0001' };
      usersService.findSafeById.mockResolvedValue(user);

      const result = await controller.getMe({ user: { sub: 5 } });

      expect(result).toEqual(user);
      expect(usersService.findSafeById).toHaveBeenCalledWith(5);
    });

    it('should return null when user not found', async () => {
      usersService.findSafeById.mockResolvedValue(null);

      const result = await controller.getMe({ user: { sub: 42 } });

      expect(result).toBeNull();
      expect(usersService.findSafeById).toHaveBeenCalledWith(42);
    });
  });

  describe('POST /users/child', () => {
    it('should add a child for the current parent', async () => {
      const body = { name: '小明', age: 5 };
      const child = { id: 10, ...body };
      usersService.addChild.mockResolvedValue(child);

      const result = await controller.addChild(mockReq, body);

      expect(result).toEqual(child);
      expect(usersService.addChild).toHaveBeenCalledWith(1, body);
    });
  });

  describe('PUT /users/child/:id', () => {
    it('should update child info', async () => {
      const body = { name: '新名字' };
      const updated = { id: 5, name: '新名字' };
      usersService.updateChild.mockResolvedValue(updated);

      const result = await controller.updateChild(mockReq, '5', body);

      expect(result).toEqual(updated);
      expect(usersService.updateChild).toHaveBeenCalledWith(1, 5, body);
    });

    it('should pass partial data to service', async () => {
      usersService.updateChild.mockResolvedValue({});

      await controller.updateChild(mockReq, '3', { age: 6 });

      expect(usersService.updateChild).toHaveBeenCalledWith(1, 3, { age: 6 });
    });
  });

  describe('DELETE /users/child/:id', () => {
    it('should delete a child', async () => {
      usersService.deleteChild.mockResolvedValue(undefined);

      const result = await controller.deleteChild(mockReq, '5');

      expect(result).toEqual({ success: true });
      expect(usersService.deleteChild).toHaveBeenCalledWith(1, 5);
    });
  });

  describe('POST /users/link-child', () => {
    it('should link child by phone number with loginCode', async () => {
      const req = { user: { sub: 10 } };
      const body = { childPhone: '13800000002', loginCode: 'ABCDEF' };
      const linked = { parentId: 10, childId: 2 };
      usersService.linkChild.mockResolvedValue(linked);

      const result = await controller.linkChild(req, body);

      expect(result).toEqual(linked);
      expect(usersService.linkChild).toHaveBeenCalledWith(10, '13800000002', 'ABCDEF');
    });

    it('should use req.user.sub as parentId', async () => {
      const req = { user: { sub: 99 } };
      usersService.linkChild.mockResolvedValue({});

      await controller.linkChild(req, {
        childPhone: '13800000003',
        loginCode: 'XYZWXY',
      });

      expect(usersService.linkChild).toHaveBeenCalledWith(99, '13800000003', 'XYZWXY');
    });
  });
});
