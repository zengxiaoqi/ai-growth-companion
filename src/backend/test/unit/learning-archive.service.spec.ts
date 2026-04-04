import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LearningArchiveService } from '../../src/modules/learning/learning-archive.service';
import { LearningPoint } from '../../src/database/entities/learning-point.entity';
import { WrongQuestion } from '../../src/database/entities/wrong-question.entity';
import { StudyPlanRecord } from '../../src/database/entities/study-plan-record.entity';

describe('LearningArchiveService', () => {
  let service: LearningArchiveService;
  let pointRepo: any;
  let wrongRepo: any;
  let planRepo: any;

  beforeEach(async () => {
    pointRepo = {
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => ({ id: v.id || 1, ...v })),
      find: jest.fn(async () => []),
      findAndCount: jest.fn(async () => [[], 0]),
    };

    wrongRepo = {
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => ({ id: v.id || 1, ...v })),
      findAndCount: jest.fn(async () => [[], 0]),
    };

    planRepo = {
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => ({ id: v.id || 1, ...v })),
      findAndCount: jest.fn(async () => [[], 0]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LearningArchiveService,
        { provide: getRepositoryToken(LearningPoint), useValue: pointRepo },
        { provide: getRepositoryToken(WrongQuestion), useValue: wrongRepo },
        { provide: getRepositoryToken(StudyPlanRecord), useValue: planRepo },
      ],
    }).compile();

    service = module.get<LearningArchiveService>(LearningArchiveService);
  });

  afterEach(() => jest.clearAllMocks());

  it('upserts learning point by childId + pointKey', async () => {
    pointRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 11,
      childId: 9,
      pointKey: 'math-addition',
      pointLabel: '加法',
      source: 'chat_summary',
      lastLearnedAt: new Date(),
      cooldownUntil: new Date(),
      sessionId: null,
      domain: 'math',
    });

    await service.upsertLearningPoint({
      childId: 9,
      pointLabel: 'Math Addition',
      source: 'chat_summary',
    });
    await service.upsertLearningPoint({
      childId: 9,
      pointLabel: 'Math Addition',
      source: 'activity',
    });

    expect(pointRepo.save).toHaveBeenCalledTimes(2);
    expect(pointRepo.create).toHaveBeenCalledTimes(1);
  });

  it('stores only wrong items into wrong question book', async () => {
    wrongRepo.findOne.mockResolvedValue(null);

    await service.recordWrongQuestions({
      childId: 2,
      domain: 'math',
      reviewItems: [
        { question: '1+1=?', userAnswer: '3', correctAnswer: '2', isCorrect: false },
        { question: '2+2=?', userAnswer: '4', correctAnswer: '4', isCorrect: true },
      ],
    });

    expect(wrongRepo.create).toHaveBeenCalledTimes(1);
    expect(wrongRepo.save).toHaveBeenCalledTimes(1);
  });
});

