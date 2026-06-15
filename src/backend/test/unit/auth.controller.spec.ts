import { AuthController } from '../../src/modules/auth/auth.controller';

describe('AuthController', () => {
  const authService = {
    register: jest.fn(),
    login: jest.fn(),
    validateUser: jest.fn(),
    verifyPin: jest.fn(),
    setPin: jest.fn(),
  };

  let controller: AuthController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AuthController(authService as any);
  });

  describe('POST /auth/register', () => {
    it('should register a new user', async () => {
      const dto = { phone: '13800000001', password: 'password123', role: 'parent' };
      const result = { id: 1, token: 'jwt-token' };
      authService.register.mockResolvedValue(result);

      const response = await controller.register(dto as any);

      expect(response).toEqual(result);
      expect(authService.register).toHaveBeenCalledWith(dto);
    });
  });

  describe('POST /auth/login', () => {
    it('should login and return token', async () => {
      const dto = { phone: '13800000001', password: 'password123' };
      const result = { token: 'jwt-token', user: { id: 1, role: 'parent' } };
      authService.login.mockResolvedValue(result);

      const response = await controller.login(dto as any);

      expect(response).toEqual(result);
      expect(authService.login).toHaveBeenCalledWith(dto);
    });
  });

  describe('GET /auth/profile', () => {
    it('should return user profile from JWT', async () => {
      const user = { id: 5, nickname: '家长A', role: 'parent' };
      authService.validateUser.mockResolvedValue(user);

      const result = await controller.getProfile({ user: { sub: 5 } });

      expect(result).toEqual(user);
      expect(authService.validateUser).toHaveBeenCalledWith(5);
    });
  });

  describe('POST /auth/verify-pin', () => {
    it('should verify parent PIN', async () => {
      authService.verifyPin.mockResolvedValue({ valid: true });

      const result = await controller.verifyPin({ user: { sub: 10 } }, { pin: '1234' } as any);

      expect(result).toEqual({ valid: true });
      expect(authService.verifyPin).toHaveBeenCalledWith(10, '1234');
    });
  });

  describe('POST /auth/set-pin', () => {
    it('should set parent PIN', async () => {
      authService.setPin.mockResolvedValue({ success: true });

      const result = await controller.setPin({ user: { sub: 10 } }, { pin: '5678' } as any);

      expect(result).toEqual({ success: true });
      expect(authService.setPin).toHaveBeenCalledWith(10, '5678');
    });
  });
});
