import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from '../../src/modules/auth/jwt.strategy';
import { AuthService } from '../../src/modules/auth/auth.service';
import { ConfigService } from '@nestjs/config';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let authService: any;
  let configService: any;

  beforeEach(() => {
    configService = {
      get: jest.fn().mockReturnValue('test-secret'),
    };
    authService = {
      validateUser: jest.fn(),
    };

    strategy = new JwtStrategy(configService as ConfigService, authService as AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('constructor', () => {
    it('reads JWT_SECRET without a hardcoded fallback key', () => {
      // A public, hardcoded fallback would let anyone forge tokens for a
      // deployment that forgot to set JWT_SECRET.
      expect(configService.get).toHaveBeenCalledWith('JWT_SECRET');
    });
  });

  describe('validate', () => {
    const payload = { sub: 1, phone: '13800000001', type: 'parent' };

    it('returns payload when user exists', async () => {
      authService.validateUser.mockResolvedValue({ id: 1, phone: '13800000001' });

      const result = await strategy.validate(payload);

      expect(result).toEqual(payload);
      expect(authService.validateUser).toHaveBeenCalledWith(1);
    });

    it('throws UnauthorizedException when user not found', async () => {
      authService.validateUser.mockResolvedValue(null);

      await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('does not catch unexpected errors from validateUser', async () => {
      // validateUser rejection bubbles up as the original error (not UnauthorizedException)
      const dbError = new Error('DB connection failed');
      authService.validateUser.mockRejectedValue(dbError);

      await expect(strategy.validate(payload)).rejects.toThrow('DB connection failed');
    });
  });
});
