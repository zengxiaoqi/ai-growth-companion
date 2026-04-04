import { describe, it, expect } from 'vitest';
import { normalizeActivityData, normalizeActivityType } from '@/components/ai-chat/activity-normalizer';

describe('normalizeActivityData', () => {
  it('normalizes quiz correctIndex from 1-based string to 0-based number', () => {
    const normalized = normalizeActivityData('quiz', {
      title: 'Quiz',
      questions: [
        {
          question: 'Pick C',
          options: ['A', 'B', 'C'],
          correctIndex: '3',
        },
      ],
    });

    expect(normalized.type).toBe('quiz');
    expect(normalized.questions).toHaveLength(1);
    expect(normalized.questions[0].correctIndex).toBe(2);
    expect(normalized.questions[0].options[normalized.questions[0].correctIndex]).toBe('C');
  });

  it('defaults out-of-range correctIndex to 0', () => {
    const normalized = normalizeActivityData('quiz', {
      questions: [
        {
          question: 'Pick A',
          options: ['A', 'B', 'C'],
          correctIndex: 99,
        },
      ],
    });

    expect(normalized.questions[0].correctIndex).toBe(0);
  });

  it('filters out invalid quiz questions and keeps valid ones', () => {
    const normalized = normalizeActivityData('quiz', {
      questions: [
        { question: '', options: ['A', 'B'], correctIndex: 0 },
        { question: 'Only one option', options: ['A'], correctIndex: 0 },
        { question: 'Valid', options: ['A', 'B'], correctIndex: 1 },
      ],
    });

    expect(normalized.questions).toHaveLength(1);
    expect(normalized.questions[0].question).toBe('Valid');
    expect(normalized.questions[0].correctIndex).toBe(1);
  });
});

describe('normalizeActivityType', () => {
  it('falls back to payload type when event activityType is missing', () => {
    expect(normalizeActivityType(undefined, { type: 'matching', pairs: [{ left: 'A', right: 'B' }] })).toBe('matching');
  });

  it('infers type from payload structure when type field is missing', () => {
    expect(normalizeActivityType(undefined, { questions: [{ question: 'Q', options: ['A', 'B'], correctIndex: 0 }] })).toBe('quiz');
  });
});
