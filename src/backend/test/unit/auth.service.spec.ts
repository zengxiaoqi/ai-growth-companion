import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../../src/modules/auth/auth.service';
import { UsersService } from '../../src/modules/users/users.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';

// Mock bcrypt at the module level — avoids "Cannot redefine property" issues
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
}));
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let _usersService: UsersService;
  let _jwtService: JwtService;

  const mockUsersService = {
    findByPhone: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    findByParentId: jest.fn(),
    findByLoginCode: jest.fn(),
    generateUniqueLoginCode: jest.fn(),
    update: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(() => 'mock-token'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    _usersService = module.get<UsersService>(UsersService);
    _jwtService = module.get<JwtService>(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const registerDto = {
        phone: '13800000001',
        password: 'password123',
        name: 'Test User',
        type: 'parent',
      };

      mockUsersService.findByPhone.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue({
        id: 1,
        phone: registerDto.phone,
        name: registerDto.name,
        type: registerDto.type,
        password: 'hashed',
      });
      mockJwtService.sign.mockReturnValue('token-123');

      const result = await service.register(registerDto);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('token');
      expect(mockUsersService.findByPhone).toHaveBeenCalledWith(registerDto.phone);
    });

    it('should throw ConflictException if phone already exists', async () => {
      const registerDto = {
        phone: '13800000000',
        password: 'password123',
        name: 'Test User',
      };

      mockUsersService.findByPhone.mockResolvedValue({
        id: 1,
        phone: registerDto.phone,
      });

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should return token and user on successful login', async () => {
      const loginDto = { phone: '13800000000', password: 'password123' };
      const mockUser = {
        id: 1,
        phone: loginDto.phone,
        password: 'hashed-password',
        name: 'Test',
        type: 'parent',
      };

      mockUsersService.findByPhone.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('token-123');
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('user');
    });

    it('should throw UnauthorizedException for invalid phone', async () => {
      const loginDto = { phone: '13800000000', password: 'password123' };

      mockUsersService.findByPhone.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateUser', () => {
    it('should return user by id', async () => {
      const mockUser = { id: 1, phone: '13800000000', name: 'Test' };
      mockUsersService.findById.mockResolvedValue(mockUser);

      const result = await service.validateUser(1);

      expect(result).toEqual(mockUser);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockUsersService.findById.mockResolvedValue(null);

      await expect(service.validateUser(999)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('switchToChild', () => {
    it('should switch to first child when no childId specified', async () => {
      const parent = {
        id: 1,
        phone: '13800000001',
        type: 'parent',
        name: 'Parent',
      };
      const child = {
        id: 2,
        phone: '13800000002',
        type: 'child',
        name: 'Child',
        parentId: 1,
      };
      mockUsersService.findById
        .mockResolvedValueOnce(parent) // first call: parent lookup
        .mockResolvedValueOnce(child); // second call: child lookup by id
      mockUsersService.findByParentId.mockResolvedValue([{ id: 2 }]);
      mockJwtService.sign.mockReturnValue('child-token');

      const result = await service.switchToChild(1);

      expect(result.token).toBe('child-token');
      expect(result.user.id).toBe(2);
      expect(result.user).not.toHaveProperty('password');
      expect(mockUsersService.findByParentId).toHaveBeenCalledWith(1);
    });

    it('should switch to specified child when childId provided', async () => {
      const parent = {
        id: 1,
        phone: '13800000001',
        type: 'parent',
      };
      const child = {
        id: 3,
        type: 'child',
        parentId: 1,
        name: 'Kid2',
      };
      mockUsersService.findById.mockResolvedValueOnce(parent).mockResolvedValueOnce(child);

      const result = await service.switchToChild(1, 3);

      expect(result.user.id).toBe(3);
      expect(mockUsersService.findByParentId).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if user is not a parent', async () => {
      mockUsersService.findById.mockResolvedValue({
        id: 2,
        type: 'child',
      });

      await expect(service.switchToChild(2)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if parent not found', async () => {
      mockUsersService.findById.mockResolvedValue(null);

      await expect(service.switchToChild(999)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw BadRequestException if no children bound', async () => {
      const parent = { id: 1, type: 'parent' };
      mockUsersService.findById.mockResolvedValue(parent);
      mockUsersService.findByParentId.mockResolvedValue([]);

      await expect(service.switchToChild(1)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if childId is invalid (wrong type)', async () => {
      const parent = { id: 1, type: 'parent' };
      const notAChild = { id: 5, type: 'parent', parentId: 1 };
      mockUsersService.findById.mockResolvedValueOnce(parent).mockResolvedValueOnce(notAChild);

      await expect(service.switchToChild(1, 5)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if child does not belong to parent', async () => {
      const parent = { id: 1, type: 'parent' };
      const otherChild = { id: 10, type: 'child', parentId: 999 };
      mockUsersService.findById.mockResolvedValueOnce(parent).mockResolvedValueOnce(otherChild);

      await expect(service.switchToChild(1, 10)).rejects.toThrow(BadRequestException);
    });

    it('should not leak password or pin in returned user', async () => {
      const parent = { id: 1, type: 'parent' };
      const child = {
        id: 2,
        type: 'child',
        parentId: 1,
        password: 'secret-hash',
        pin: 'pin-hash',
      };
      mockUsersService.findById.mockResolvedValueOnce(parent).mockResolvedValueOnce(child);

      const result = await service.switchToChild(1, 2);

      expect(result.user).not.toHaveProperty('password');
      expect(result.user).not.toHaveProperty('pin');
    });
  });

  describe('switchToParent', () => {
    it('should switch to parent with correct password', async () => {
      const child = {
        id: 2,
        type: 'child',
        parentId: 1,
      };
      const parent = {
        id: 1,
        type: 'parent',
        phone: '13800000001',
        password: 'hashed-password',
        name: 'Parent',
      };
      mockUsersService.findById.mockResolvedValueOnce(child).mockResolvedValueOnce(parent);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.switchToParent(2, 'password123');

      expect(result.user.id).toBe(1);
      expect(result.token).toBeDefined();
      expect(result.user).not.toHaveProperty('password');
    });

    it('should throw BadRequestException if password is empty', async () => {
      await expect(service.switchToParent(2, '')).rejects.toThrow(BadRequestException);
    });

    it('should throw UnauthorizedException if child not found', async () => {
      mockUsersService.findById.mockResolvedValue(null);

      await expect(service.switchToParent(999, 'password123')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if user is not a child', async () => {
      mockUsersService.findById.mockResolvedValue({
        id: 1,
        type: 'parent',
      });

      await expect(service.switchToParent(1, 'password123')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw BadRequestException if child has no parentId', async () => {
      const child = { id: 2, type: 'child', parentId: null };
      mockUsersService.findById.mockResolvedValue(child);

      await expect(service.switchToParent(2, 'password123')).rejects.toThrow(BadRequestException);
    });

    it('should throw UnauthorizedException if parent not found', async () => {
      const child = { id: 2, type: 'child', parentId: 999 };
      mockUsersService.findById.mockResolvedValueOnce(child).mockResolvedValueOnce(null);

      await expect(service.switchToParent(2, 'password123')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if parent password is wrong', async () => {
      const child = { id: 2, type: 'child', parentId: 1 };
      const parent = {
        id: 1,
        type: 'parent',
        password: 'hashed-password',
      };
      mockUsersService.findById.mockResolvedValueOnce(child).mockResolvedValueOnce(parent);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.switchToParent(2, 'wrong-password')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should not leak password or pin in returned parent user', async () => {
      const child = { id: 2, type: 'child', parentId: 1 };
      const parent = {
        id: 1,
        type: 'parent',
        password: 'hashed-password',
        pin: 'pin-hash',
      };
      mockUsersService.findById.mockResolvedValueOnce(child).mockResolvedValueOnce(parent);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.switchToParent(2, 'password123');

      expect(result.user).not.toHaveProperty('password');
      expect(result.user).not.toHaveProperty('pin');
    });
  });

  describe('childLogin', () => {
    it('should return token and user on valid loginCode', async () => {
      const mockChild = {
        id: 2,
        phone: '13800000002',
        type: 'child',
        name: 'Kid',
        loginCode: 'ABC123',
      };
      mockUsersService.findByLoginCode.mockResolvedValue(mockChild);
      mockJwtService.sign.mockReturnValue('child-token');

      const result = await service.childLogin({ loginCode: 'ABC123' });

      expect(result.token).toBe('child-token');
      expect(result.user.id).toBe(2);
      expect(result.user).not.toHaveProperty('password');
    });

    it('should throw UnauthorizedException for invalid loginCode', async () => {
      mockUsersService.findByLoginCode.mockResolvedValue(null);

      await expect(service.childLogin({ loginCode: 'INVALID' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if loginCode belongs to non-child', async () => {
      mockUsersService.findByLoginCode.mockResolvedValue({
        id: 1,
        type: 'parent',
      });

      await expect(service.childLogin({ loginCode: 'XYZ789' })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
