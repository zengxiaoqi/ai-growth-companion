import {
  computeQuestionHash,
  computeActivityQuestionHashes,
  splitActivityItems,
  extractItemCorrectness,
} from '../../src/common/activity/question-hash';

describe('question-hash', () => {
  describe('computeQuestionHash', () => {
    it('is independent of quiz option order and correctIndex', () => {
      const a = { question: '猫有几条腿？', options: ['2', '4', '6'], correctIndex: 1 };
      const b = { question: '猫有几条腿？', options: ['6', '2', '4'], correctIndex: 2 };
      expect(computeQuestionHash('quiz', a)).toBe(computeQuestionHash('quiz', b));
    });

    it('normalizes whitespace and case', () => {
      const a = { question: 'How many legs?', options: ['Two', 'Four'], correctIndex: 1 };
      const b = { question: '  how   many legs? ', options: ['four', 'two'], correctIndex: 0 };
      expect(computeQuestionHash('quiz', a)).toBe(computeQuestionHash('quiz', b));
    });

    it('changes when the question text changes', () => {
      const a = { question: '猫有几条腿？', options: ['2', '4'], correctIndex: 1 };
      const b = { question: '狗有几条腿？', options: ['2', '4'], correctIndex: 1 };
      expect(computeQuestionHash('quiz', a)).not.toBe(computeQuestionHash('quiz', b));
    });

    it('distinguishes true_false by statement and verdict', () => {
      const base = { statement: '太阳从东边升起', isCorrect: true };
      const flipped = { statement: '太阳从东边升起', isCorrect: false };
      expect(computeQuestionHash('true_false', base)).not.toBe(
        computeQuestionHash('true_false', flipped),
      );
    });

    it('hashes fill_blank by text and sorted options', () => {
      const a = { text: '一年有___个月', answer: '12', options: ['12', '10', '8'] };
      const b = { text: '一年有___个月', answer: '12', options: ['8', '10', '12'] };
      expect(computeQuestionHash('fill_blank', a)).toBe(computeQuestionHash('fill_blank', b));
    });

    it('hashes a matching group independent of pair order and ids', () => {
      const a = {
        type: 'matching',
        pairs: [
          { id: 'p1', left: '牛', right: '牛奶' },
          { id: 'p2', left: '鸡', right: '鸡蛋' },
        ],
      };
      const b = {
        type: 'matching',
        pairs: [
          { id: 'x9', left: '鸡', right: '鸡蛋' },
          { id: 'x8', left: '牛', right: '牛奶' },
        ],
      };
      expect(computeQuestionHash('matching', a)).toBe(computeQuestionHash('matching', b));
    });
  });

  describe('splitActivityItems / computeActivityQuestionHashes', () => {
    it('splits quiz into per-question items', () => {
      const activity = {
        type: 'quiz',
        questions: [{ question: 'q1' }, { question: 'q2' }],
      };
      expect(splitActivityItems(activity)).toHaveLength(2);
      expect(computeActivityQuestionHashes(activity)).toHaveLength(2);
    });

    it('keeps a group activity as a single item', () => {
      const activity = { type: 'matching', pairs: [{ left: 'a', right: 'b' }] };
      expect(splitActivityItems(activity)).toHaveLength(1);
      expect(computeActivityQuestionHashes(activity)).toHaveLength(1);
    });

    it('returns empty for missing item arrays', () => {
      expect(splitActivityItems({ type: 'quiz' })).toEqual([]);
      expect(computeActivityQuestionHashes({ type: 'quiz' })).toEqual([]);
    });
  });

  describe('extractItemCorrectness', () => {
    const quiz = {
      type: 'quiz',
      questions: [
        { question: 'q1', options: ['a', 'b'], correctIndex: 1 },
        { question: 'q2', options: ['a', 'b'], correctIndex: 0 },
      ],
    };

    it('aligns quiz answer indexes to correctIndex', () => {
      const result = { interactionData: { answers: [1, 1] } };
      expect(extractItemCorrectness(quiz, result)).toEqual([true, false]);
    });

    it('aligns true_false booleans', () => {
      const activity = {
        type: 'true_false',
        statements: [{ statement: 's1', isCorrect: true }, { statement: 's2', isCorrect: false }],
      };
      const result = { interactionData: { answers: [true, true] } };
      expect(extractItemCorrectness(activity, result)).toEqual([true, false]);
    });

    it('aligns fill_blank user answers (normalized)', () => {
      const activity = {
        type: 'fill_blank',
        sentences: [{ text: 't1', answer: '12' }, { text: 't2', answer: '8' }],
      };
      const result = { interactionData: { userAnswers: [' 12 ', '9'] } };
      expect(extractItemCorrectness(activity, result)).toEqual([true, false]);
    });

    it('uses aggregate score for group types', () => {
      const activity = { type: 'matching', pairs: [{ left: 'a', right: 'b' }] };
      expect(extractItemCorrectness(activity, { totalQuestions: 4, correctAnswers: 3 })).toEqual([
        true,
      ]);
      expect(extractItemCorrectness(activity, { totalQuestions: 4, correctAnswers: 1 })).toEqual([
        false,
      ]);
    });

    it('returns null when answer data is missing or short', () => {
      expect(extractItemCorrectness(quiz, null)).toBeNull();
      expect(extractItemCorrectness(quiz, { interactionData: {} })).toBeNull();
      expect(extractItemCorrectness(quiz, { interactionData: { answers: [1] } })).toBeNull();
    });
  });
});