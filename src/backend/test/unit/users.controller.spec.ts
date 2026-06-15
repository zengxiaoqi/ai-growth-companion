import { UsersController } from '../../src/modules/users/users.controller';

describe('UsersController', () => {
  const usersService = {
    findByParentId: jest.fn(),
    findSafeById: jest.fn(),
    update: jest.fn(),
    linkChild: jest.fn(),
  };

  let controller: UsersController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new UsersController(usersService as any);
  });

  describe('GET /users/children/:parentId', () => {
    it('should return children for a parent', async () => {
      const children = [
        { id: 2, name: '小明', role: 'student' },
        { id: 3, name: '小红', role: 'student' },
      ];
      usersService.findByParentId.mockResolvedValue(children);

      const result = await controller.findChildren('1');

      expect(result).toEqual(children);
      expect(usersService.findByParentId).toHaveBeenCalledWith(1);
    });

    it('should return empty array when parent has no children', async () => {
      usersService.findByParentId.mockResolvedValue([]);

      const result = await controller.findChildren('99');

      expect(result).toEqual([]);
    });
  });

  describe('GET /users/:id', () => {
    it('should return user info', async () => {
      const user = { id: 5, nickname: '家长A', phone: '138****0001' };
      usersService.findSafeById.mockResolvedValue(user);

      const result = await controller.findOne('5');

      expect(result).toEqual(user);
      expect(usersService.findSafeById).toHaveBeenCalledWith(5);
    });

    it('should convert string id to number', async () => {
      usersService.findSafeById.mockResolvedValue(null);

      await controller.findOne('42');

      expect(usersService.findSafeById).toHaveBeenCalledWith(42);
    });
  });

  describe('PUT /users/:id', () => {
    it('should update user info', async () => {
      const userData = { nickname: '新名字' };
      const updated = { id: 5, nickname: '新名字' };
      usersService.update.mockResolvedValue(updated);

      const result = await controller.update('5', userData);

      expect(result).toEqual(updated);
      expect(usersService.update).toHaveBeenCalledWith(5, userData);
    });

    it('should pass partial data to service', async () => {
      usersService.update.mockResolvedValue({});

      await controller.update('3', { avatar: 'new-avatar.png' });

      expect(usersService.update).toHaveBeenCalledWith(3, { avatar: 'new-avatar.png' });
    });
  });

  describe('POST /users/link-child', () => {
    it('should link child by phone number', async () => {
      const req = { user: { sub: 10 } };
      const body = { childPhone: '13800000002' };
      const linked = { parentId: 10, childId: 2 };
      usersService.linkChild.mockResolvedValue(linked);

      const result = await controller.linkChild(req, body);

      expect(result).toEqual(linked);
      expect(usersService.linkChild).toHaveBeenCalledWith(10, '13800000002');
    });

    it('should use req.user.sub as parentId', async () => {
      const req = { user: { sub: 99 } };
      usersService.linkChild.mockResolvedValue({});

      await controller.linkChild(req, { childPhone: '13800000003' });

      expect(usersService.linkChild).toHaveBeenCalledWith(99, '13800000003');
    });
  });
});
