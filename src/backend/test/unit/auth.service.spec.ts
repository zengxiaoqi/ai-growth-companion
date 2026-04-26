import { Test, TestingModule } from "@nestjs/testing";
import { AuthService } from "../../src/modules/auth/auth.service";
import { UsersService } from "../../src/modules/users/users.service";
import { JwtService } from "@nestjs/jwt";
import { UnauthorizedException, ConflictException } from "@nestjs/common";

describe("AuthService", () => {
  let service: AuthService;
  let _usersService: UsersService;
  let _jwtService: JwtService;

  const mockUsersService = {
    findByPhone: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(() => "mock-token"),
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

  describe("register", () => {
    it("should register a new user successfully", async () => {
      const registerDto = {
        phone: "13800000001",
        password: "password123",
        name: "Test User",
        type: "parent",
      };

      mockUsersService.findByPhone.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue({
        id: 1,
        phone: registerDto.phone,
        name: registerDto.name,
        type: registerDto.type,
        password: "hashed",
      });
      mockJwtService.sign.mockReturnValue("token-123");

      const result = await service.register(registerDto);

      expect(result).toHaveProperty("user");
      expect(result).toHaveProperty("token");
      expect(mockUsersService.findByPhone).toHaveBeenCalledWith(
        registerDto.phone,
      );
    });

    it("should throw ConflictException if phone already exists", async () => {
      const registerDto = {
        phone: "13800000000",
        password: "password123",
        name: "Test User",
      };

      mockUsersService.findByPhone.mockResolvedValue({
        id: 1,
        phone: registerDto.phone,
      });

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe("login", () => {
    it("should return token and user on successful login", async () => {
      const loginDto = { phone: "13800000000", password: "password123" };
      const mockUser = {
        id: 1,
        phone: loginDto.phone,
        password: "hashed-password",
        name: "Test",
        type: "parent",
      };

      mockUsersService.findByPhone.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue("token-123");

      // Mock bcrypt compare
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      jest.spyOn(require("bcrypt"), "compare").mockResolvedValue(true);

      const result = await service.login(loginDto);

      expect(result).toHaveProperty("token");
      expect(result).toHaveProperty("user");
    });

    it("should throw UnauthorizedException for invalid phone", async () => {
      const loginDto = { phone: "13800000000", password: "password123" };

      mockUsersService.findByPhone.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe("validateUser", () => {
    it("should return user by id", async () => {
      const mockUser = { id: 1, phone: "13800000000", name: "Test" };
      mockUsersService.findById.mockResolvedValue(mockUser);

      const result = await service.validateUser(1);

      expect(result).toEqual(mockUser);
    });

    it("should throw UnauthorizedException if user not found", async () => {
      mockUsersService.findById.mockResolvedValue(null);

      await expect(service.validateUser(999)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
