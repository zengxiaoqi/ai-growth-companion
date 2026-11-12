import {
  coldStartEnglishLevel,
  scoreToEnglishLevel,
  resolveEnglishProfile,
} from '../../src/modules/abilities/english-level';

describe('english-level helpers', () => {
  describe('coldStartEnglishLevel', () => {
    it('maps 3-4 to L1', () => {
      expect(coldStartEnglishLevel('3-4')).toBe('L1');
    });

    it('maps 5-6 to L2', () => {
      expect(coldStartEnglishLevel('5-6')).toBe('L2');
    });

    it('maps older age groups to L2 (stretched by assessment later)', () => {
      expect(coldStartEnglishLevel('7-9')).toBe('L2');
      expect(coldStartEnglishLevel('10-12')).toBe('L2');
    });
  });

  describe('scoreToEnglishLevel (boundaries aligned with AbilitiesService.getLevel)', () => {
    it.each([
      [0, 'L1'],
      [59, 'L1'],
      [60, 'L2'],
      [79, 'L2'],
      [80, 'L3'],
      [100, 'L3'],
    ])('score %i → %s', (score, level) => {
      expect(scoreToEnglishLevel(score as number)).toBe(level);
    });
  });

  describe('resolveEnglishProfile', () => {
    it('uses the latest assessment when present', () => {
      expect(resolveEnglishProfile({ score: 85 }, '3-4')).toEqual({
        level: 'L3',
        score: 85,
        source: 'assessment',
      });
    });

    it('cold-starts by age when no assessment exists', () => {
      expect(resolveEnglishProfile(null, '3-4')).toEqual({
        level: 'L1',
        score: null,
        source: 'cold-start',
      });
      expect(resolveEnglishProfile(undefined, '5-6')).toEqual({
        level: 'L2',
        score: null,
        source: 'cold-start',
      });
    });

    it('cold-starts when the assessment has no numeric score', () => {
      expect(resolveEnglishProfile({} as any, '5-6').source).toBe('cold-start');
    });
  });
});