import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from '../../src/modules/users/users.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../../src/database/entities/user.entity';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('UsersService', () => {
  let service: UsersService;
  let mockRepo: any;

  const mockUser: Partial<User> = {
    id: 1,
    phone: '13800000001',
    name: 'TestParent',
    type: 'parent',
    password: 'hashed',
  };

  const mockChild: Partial<User> = {
    id: 2,
    phone: '13800000002',
    name: 'TestChild',
    type: 'child',
    parentId: 1,
    password: 'hashed',
  };

  beforeEach(async () => {
    mockRepo = {
      create: jest.fn((data) => data),
      save: jest.fn((data) => ({ ...data, id: data.id || Math.floor(Math.random() * 1000) })),
      findOne: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findById', () => {
    it('returns user by id', async () => {
      mockRepo.findOne.mockResolvedValue(mockUser);
      const result = await service.findById(1);
      expect(result).toEqual(mockUser);
    });

    it('returns null if not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      const result = await service.findById(999);
      expect(result).toBeNull();
    });
  });

  describe('findByPhone', () => {
    it('returns user by phone', async () => {
      mockRepo.findOne.mockResolvedValue(mockUser);
      const result = await service.findByPhone('13800000001');
      expect(result).toEqual(mockUser);
    });
  });

  describe('findByParentId', () => {
    it('returns children list', async () => {
      mockRepo.find.mockResolvedValue([mockChild]);
      const result = await service.findByParentId(1);
      expect(result).toHaveLength(1);
      expect(result[0].parentId).toBe(1);
    });
  });

  describe('update', () => {
    it('updates and returns user', async () => {
      mockRepo.update.mockResolvedValue({ affected: 1 });
      mockRepo.findOne.mockResolvedValue({ ...mockUser, name: 'Updated' });
      const result = await service.update(1, { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });

    it('throws if user not found', async () => {
      mockRepo.update.mockResolvedValue({ affected: 1 });
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.update(999, { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('linkChild', () => {
    it('links child to parent', async () => {
      mockRepo.findOne
        .mockResolvedValueOnce(mockUser) // parent lookup
        .mockResolvedValueOnce(mockChild); // child lookup
      mockRepo.save.mockResolvedValue({ ...mockChild, parentId: 1 });

      const result = await service.linkChild(1, '13800000002');
      expect(result.parentId).toBe(1);
    });

    it('throws if parent not found', async () => {
      mockRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.linkChild(999, '13800000002')).rejects.toThrow(BadRequestException);
    });

    it('throws if child phone not found', async () => {
      mockRepo.findOne
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(null);
      await expect(service.linkChild(1, '00000000000')).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('deletes user', async () => {
      mockRepo.delete.mockResolvedValue({ affected: 1 });
      await expect(service.delete(1)).resolves.toBeUndefined();
    });

    it('throws if user not found', async () => {
      mockRepo.delete.mockResolvedValue({ affected: 0 });
      await expect(service.delete(999)).rejects.toThrow(NotFoundException);
    });
  });
});
