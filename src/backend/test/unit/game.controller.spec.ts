import { GameController } from '../../src/modules/game/game.controller';

describe('GameController', () => {
  const gameService = {
    getGameList: jest.fn(),
    generateGame: jest.fn(),
    saveGameResult: jest.fn(),
    getLevelInfo: jest.fn(),
  };

  let controller: GameController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new GameController(gameService as any);
  });

  describe('GET /game/list', () => {
    it('returns game list with default age range', () => {
      const games = [{ id: 'game1', name: 'Memory Match' }];
      gameService.getGameList.mockReturnValue(games);

      const result = controller.getGameList(undefined as any);

      expect(result).toEqual(games);
      expect(gameService.getGameList).toHaveBeenCalledWith('3-4');
    });

    it('passes ageRange filter', () => {
      gameService.getGameList.mockReturnValue([]);

      controller.getGameList('5-6');

      expect(gameService.getGameList).toHaveBeenCalledWith('5-6');
    });
  });

  describe('GET /game/:gameId', () => {
    it('generates game with default difficulty', () => {
      const game = { id: 'math-quiz', questions: [] };
      gameService.generateGame.mockReturnValue(game);

      const result = controller.generateGame('math-quiz', undefined as any);

      expect(result).toEqual(game);
      expect(gameService.generateGame).toHaveBeenCalledWith('math-quiz', 1);
    });

    it('generates game with specified difficulty', () => {
      gameService.generateGame.mockReturnValue({});

      controller.generateGame('word-match', '3');

      expect(gameService.generateGame).toHaveBeenCalledWith('word-match', 3);
    });
  });

  describe('POST /game/result', () => {
    it('saves game result', async () => {
      const result = { id: 1, score: 90 };
      gameService.saveGameResult.mockResolvedValue(result);

      const response = await controller.saveGameResult({
        userId: 2,
        gameId: 'quiz-1',
        score: 90,
        timeSpent: 120,
        correctAnswers: 9,
        totalQuestions: 10,
      });

      expect(response).toEqual(result);
      expect(gameService.saveGameResult).toHaveBeenCalledWith(2, 'quiz-1', {
        gameId: 'quiz-1',
        score: 90,
        timeSpent: 120,
        correctAnswers: 9,
        totalQuestions: 10,
      });
    });
  });

  describe('GET /game/level/:userId', () => {
    it('returns level info for user', () => {
      const level = { level: 3, xp: 450 };
      gameService.getLevelInfo.mockReturnValue(level);

      const result = controller.getLevelInfo('2');

      expect(result).toEqual(level);
      expect(gameService.getLevelInfo).toHaveBeenCalledWith(2);
    });
  });
});