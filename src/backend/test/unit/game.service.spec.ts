import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GameService } from '../../src/modules/game/game.service';
import { LearningRecord } from '../../src/database/entities/learning-record.entity';
import { Content } from '../../src/database/entities/content.entity';

// Polyfill crypto.randomUUID for test environment
if (typeof crypto === 'undefined' || !crypto.randomUUID) {
  (global as any).crypto = { randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2) };
} else if (!crypto.randomUUID) {
  (crypto as any).randomUUID = () => 'test-uuid-' + Math.random().toString(36).slice(2);
}

describe('GameService', () => {
  let service: GameService;
  let mockLearningRecordRepo: Record<string, jest.Mock>;
  let mockContentRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockLearningRecordRepo = {
      create: jest.fn(),
      save: jest.fn(),
    };
    mockContentRepo = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameService,
        { provide: getRepositoryToken(LearningRecord), useValue: mockLearningRecordRepo },
        { provide: getRepositoryToken(Content), useValue: mockContentRepo },
      ],
    }).compile();

    service = module.get<GameService>(GameService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getGameList', () => {
    it('should return 4 games for age range 3-4', () => {
      const games = service.getGameList('3-4');
      expect(games).toHaveLength(4);
      expect(games.map((g: any) => g.id)).toEqual([
        'color_match',
        'shape_match',
        'animal_sound',
        'count_simple',
      ]);
    });

    it('should return 4 games for age range 5-6', () => {
      const games = service.getGameList('5-6');
      expect(games).toHaveLength(4);
      expect(games.map((g: any) => g.id)).toEqual([
        'word_match',
        'math_quiz',
        'sequence',
        'riddle',
      ]);
    });

    it('should fallback to 3-4 games for unknown age range', () => {
      const games = service.getGameList('7-8');
      expect(games[0].id).toBe('color_match');
    });
  });

  describe('generateGame', () => {
    it('should return error for unknown game id', () => {
      const result = service.generateGame('nonexistent_game');
      expect(result).toEqual({ error: '游戏不存在' });
    });

    it('should generate a color_match game with correct structure', () => {
      const result = service.generateGame('color_match', 1) as any;
      expect(result.gameType).toBe('match');
      expect(result.title).toBe('颜色配对');
      expect(result.items.length).toBeGreaterThanOrEqual(2);
      expect(result.targets.length).toBe(result.items.length);
      expect(result.timeLimit).toBe(60);
    });

    it('should generate a math_quiz with 5 questions', () => {
      const result = service.generateGame('math_quiz', 1) as any;
      expect(result.gameType).toBe('quiz');
      expect(result.questions).toHaveLength(5);
      for (const q of result.questions) {
        expect(q.options).toHaveLength(4);
        expect(q.correctAnswer).toBeGreaterThanOrEqual(0);
        expect(q.correctAnswer).toBeLessThan(4);
      }
    });

    it('should generate a riddle game', () => {
      const result = service.generateGame('riddle', 1) as any;
      expect(result.gameType).toBe('riddle');
      expect(result.questions.length).toBeGreaterThanOrEqual(2);
    });

    it('should generate a shape_match game with correct structure', () => {
      const result = service.generateGame('shape_match', 1) as any;
      expect(result.gameType).toBe('match');
      expect(result.title).toBe('形状配对');
      expect(result.items.length).toBeGreaterThanOrEqual(2);
      expect(result.targets.length).toBe(result.items.length);
      expect(result.timeLimit).toBe(60);
    });

    it('should generate an animal_sound game with correct structure', () => {
      const result = service.generateGame('animal_sound', 1) as any;
      expect(result.gameType).toBe('quiz');
      expect(result.title).toBe('动物叫声');
      expect(result.questions.length).toBeGreaterThanOrEqual(3);
      for (const q of result.questions) {
        expect(q.options).toHaveLength(4);
        expect(q.correctAnswer).toBeGreaterThanOrEqual(0);
        expect(q.correctAnswer).toBeLessThan(4);
      }
      expect(result.timeLimit).toBe(120);
    });

    it('should generate a count_simple game with correct structure', () => {
      const result = service.generateGame('count_simple', 1) as any;
      expect(result.gameType).toBe('count');
      expect(result.title).toBe('数一数');
      expect(result.questions).toHaveLength(5);
      for (const q of result.questions) {
        expect(q.options).toHaveLength(3);
        expect(q.correctAnswer).toBeGreaterThanOrEqual(0);
        expect(q.correctAnswer).toBeLessThan(3);
      }
      expect(result.timeLimit).toBe(120);
    });

    it('should generate a word_match game with correct structure', () => {
      const result = service.generateGame('word_match', 1) as any;
      expect(result.gameType).toBe('match');
      expect(result.title).toBe('汉字配对');
      expect(result.items.length).toBeGreaterThanOrEqual(2);
      expect(result.targets.length).toBe(result.items.length);
      expect(result.timeLimit).toBe(90);
    });

    it('should generate a sequence game with correct structure', () => {
      const result = service.generateGame('sequence', 1) as any;
      expect(result.gameType).toBe('sequence');
      expect(result.title).toBe('找规律');
      expect(result.questions.length).toBeGreaterThanOrEqual(2);
      expect(result.timeLimit).toBe(120);
    });
  });

  describe('saveGameResult', () => {
    it('should calculate score as percentage of correct answers', async () => {
      mockContentRepo.findOne.mockResolvedValue({ id: 5 });
      mockLearningRecordRepo.create.mockImplementation((data: any) => data);
      mockLearningRecordRepo.save.mockResolvedValue({ id: 1 });

      await service.saveGameResult(1, 'color_match', {
        gameId: 'color_match',
        score: 0,
        timeSpent: 30,
        correctAnswers: 3,
        totalQuestions: 4,
      });

      expect(mockLearningRecordRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          score: 75,
          status: 'completed',
        }),
      );
    });

    it('should set status to in_progress when less than half correct', async () => {
      mockContentRepo.findOne.mockResolvedValue({ id: 5 });
      mockLearningRecordRepo.create.mockImplementation((data: any) => data);
      mockLearningRecordRepo.save.mockResolvedValue({});

      await service.saveGameResult(1, 'math_quiz', {
        gameId: 'math_quiz',
        score: 0,
        timeSpent: 60,
        correctAnswers: 1,
        totalQuestions: 5,
      });

      expect(mockLearningRecordRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'in_progress' }),
      );
    });

    it('should fallback to contentId 1 when no content found', async () => {
      mockContentRepo.findOne.mockResolvedValue(null);
      mockLearningRecordRepo.create.mockImplementation((data: any) => data);
      mockLearningRecordRepo.save.mockResolvedValue({});

      await service.saveGameResult(1, 'riddle', {
        gameId: 'riddle',
        score: 0,
        timeSpent: 10,
        correctAnswers: 2,
        totalQuestions: 2,
      });

      expect(mockLearningRecordRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ contentId: 1 }),
      );
    });
  });

  describe('getLevelInfo', () => {
    it('should return level info with badges', () => {
      const info = service.getLevelInfo(1);
      expect(info.currentLevel).toBe(1);
      expect(info.totalLevels).toBe(10);
      expect(info.badges).toHaveLength(3);
      expect(info.badges[0].earned).toBe(true);
      expect(info.badges[2].earned).toBe(false);
    });
  });
});
