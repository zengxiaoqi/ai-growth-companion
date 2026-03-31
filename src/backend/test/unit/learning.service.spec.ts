import { Test, TestingModule } from '@nestjs/testing';
import { LearningService } from '../../src/modules/learning/learning.service';
import { SseService } from '../../src/modules/sse/sse.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LearningRecord } from '../../src/database/entities/learning-record.entity';
import { ParentControl } from '../../src/database/entities/parent-control.entity';
import { BadRequestException } from '@nestjs/common';

describe('LearningService', () => {
  let service: LearningService;
  let recordRepo: any;
  let controlRepo: any;
  let sseService: any;

  beforeEach(async () => {
    recordRepo = {
      create: jest.fn((data) => data),
      save: jest.fn((data) => ({ ...data, id: 1 })),
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
      update: jest.fn(),
    };

    controlRepo = {
      findOne: jest.fn(),
    };

    sseService = {
      sendToUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LearningService,
        { provide: getRepositoryToken(LearningRecord), useValue: recordRepo },
        { provide: getRepositoryToken(ParentControl), useValue: controlRepo },
        { provide: SseService, useValue: sseService },
      ],
    }).compile();

    service = module.get<LearningService>(LearningService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('creates a learning record and notifies parent', async () => {
      controlRepo.findOne.mockResolvedValue(null); // no parent control
      recordRepo.create.mockReturnValue({ uuid: 'test', userId: 1, contentId: 1, status: 'in_progress' });
      recordRepo.save.mockResolvedValue({ id: 1, userId: 1, contentId: 1 });

      const result = await service.create(1, 1);
      expect(result).toBeDefined();
    });

    it('rejects when daily limit exceeded', async () => {
      controlRepo.findOne.mockResolvedValue({ childId: 1, dailyLimitMinutes: 30 });
      recordRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { durationSeconds: 1800, status: 'completed' }, // 30 min already
        ]),
      });

      await expect(service.create(1, 1)).rejects.toThrow(BadRequestException);
    });

    it('sends SSE event to parent on create', async () => {
      controlRepo.findOne.mockResolvedValue({ parentId: 10, childId: 1 });
      recordRepo.create.mockReturnValue({ uuid: 'test', userId: 1, contentId: 5, status: 'in_progress' });
      recordRepo.save.mockResolvedValue({ id: 1, userId: 1, contentId: 5 });

      await service.create(1, 5);
      expect(sseService.sendToUser).toHaveBeenCalledWith(10, 'learning_started', expect.any(Object));
    });
  });

  describe('update', () => {
    it('updates record and sends SSE on completion', async () => {
      recordRepo.update.mockResolvedValue({ affected: 1 });
      recordRepo.findOne
        .mockResolvedValueOnce({ id: 1, userId: 2, status: 'completed', score: 90 }) // after update
        .mockResolvedValueOnce({ id: 1, userId: 2, status: 'completed', score: 90 }); // parent lookup
      controlRepo.findOne.mockResolvedValue({ parentId: 10, childId: 2 });

      const result = await service.update(1, { status: 'completed', score: 90 });
      expect(sseService.sendToUser).toHaveBeenCalledWith(10, 'learning_completed', expect.any(Object));
    });
  });

  describe('getTodayStats', () => {
    it('returns today stats', async () => {
      recordRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { durationSeconds: 300, status: 'completed' },
          { durationSeconds: 600, status: 'in_progress' },
        ]),
      });

      const stats = await service.getTodayStats(1);
      expect(stats.recordsCount).toBe(2);
      expect(stats.completedCount).toBe(1);
      expect(stats.totalMinutes).toBe(15);
    });
  });
});
