import {
  getDifficultyProfile,
  difficultyPromptLines,
} from '../../src/common/learning/difficulty-profiles';

describe('getDifficultyProfile — design table', () => {
  it('3-4 math: counting only, 5 → 10 → 10', () => {
    expect(getDifficultyProfile('3-4', 1, 'math')).toMatchObject({
      maxNumber: 5,
      allowedOps: ['count'],
    });
    expect(getDifficultyProfile('3-4', 2, 'math').maxNumber).toBe(10);
    expect(getDifficultyProfile('3-4', 3, 'math')).toMatchObject({
      maxNumber: 10,
      allowedOps: ['count'],
      patternComplexity: 'ABAB',
    });
  });

  it('5-6 math: 10 → 20 → 50 with add/sub', () => {
    expect(getDifficultyProfile('5-6', 1, 'math')).toMatchObject({
      maxNumber: 10,
      allowedOps: ['count', 'add', 'sub'],
    });
    expect(getDifficultyProfile('5-6', 2, 'math')).toMatchObject({
      maxNumber: 20,
      patternComplexity: 'ABC',
    });
    expect(getDifficultyProfile('5-6', 3, 'math')).toMatchObject({
      maxNumber: 50,
      patternComplexity: 'growing',
    });
  });

  it('language rows carry vocabulary and sentence caps', () => {
    const d1 = getDifficultyProfile('3-4', 1, 'language');
    expect(d1.sentenceLength).toBeLessThanOrEqual(8);
    expect(d1.vocabLevel).toContain('单字');
    const d3 = getDifficultyProfile('5-6', 3, 'language');
    expect(d3.cognitiveNotes.join()).toContain('因果');
  });

  it('clamps out-of-range difficulty and unknown age groups', () => {
    expect(getDifficultyProfile('5-6', 0, 'math').maxNumber).toBe(10);
    expect(getDifficultyProfile('5-6', 9, 'math').maxNumber).toBe(50);
    expect(getDifficultyProfile('5-6', NaN, 'math').maxNumber).toBe(10);
    expect(getDifficultyProfile('7-8', 2, 'math').maxNumber).toBe(20);
  });

  it('other domains get generic notes but keep arithmetic bounds', () => {
    const profile = getDifficultyProfile('3-4', 1, 'science');
    expect(profile.allowedOps).toEqual(['count']);
    expect(profile.cognitiveNotes.join()).toContain('具体形象');
  });
});

describe('difficultyPromptLines', () => {
  it('replaces the bare difficulty number with enforceable constraints', () => {
    const lines = difficultyPromptLines('3-4', 1, 'math');
    const text = lines.join('\n');
    expect(text).toContain('不做加减运算');
    expect(text).toContain('不超过5');
    expect(text).not.toMatch(/^Difficulty: \d$/m);
  });
});