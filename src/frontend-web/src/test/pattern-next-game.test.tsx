import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PatternNextGame from '@/components/games/PatternNextGame';
import GameRenderer from '@/components/games/GameRenderer';
import {
  normalizeActivityType,
  normalizePatternNextData,
} from '@/components/ai-chat/activity-normalizer';
import type { ActivityData, ActivityResult } from '@/types';

const data: ActivityData = {
  type: 'pattern_next',
  title: '水果接龙',
  prompt: '下一个水果是什么？',
  sequence: [
    { id: 's1', label: '苹果', icon: '🍎' },
    { id: 's2', label: '香蕉', icon: '🍌' },
    { id: 's3', label: '苹果', icon: '🍎' },
  ],
  options: [
    { id: 'o1', label: '香蕉', icon: '🍌' },
    { id: 'o2', label: '葡萄', icon: '🍇' },
    { id: 'o3', label: '西瓜', icon: '🍉' },
  ],
  answerIndex: 0,
  passingScore: 80,
  timeLimitSec: 120,
};

async function pick(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole('button', { name: `选项 ${label}` }));
}

describe('PatternNextGame', () => {
  it('completes with a 100% score on a first-try correct pick', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn<(result: ActivityResult) => void>();

    render(<PatternNextGame data={data} onComplete={onComplete} />);
    await pick(user, '🍌 香蕉');

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const result = onComplete.mock.calls[0][0];
    expect(result.score).toBe(100);
    expect(result.correctAnswers).toBe(1);
    expect(result.totalQuestions).toBe(1);
    expect(result.interactionData.activityType).toBe('pattern_next');
    expect(result.interactionData.firstTryCorrect).toBe(true);
    expect(result.interactionData.attempts).toBe(1);
    expect(result.interactionData.sequenceLabels).toEqual(['苹果', '香蕉', '苹果']);
  });

  it('records a wrong pick, still lets the child retry, but scores 0', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn<(result: ActivityResult) => void>();

    render(<PatternNextGame data={data} onComplete={onComplete} />);

    await pick(user, '🍇 葡萄');
    expect(await screen.findByRole('status')).toHaveTextContent('再想一想');
    expect(screen.getByText(/已尝试 1 次/)).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();

    await pick(user, '🍌 香蕉');

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const result = onComplete.mock.calls[0][0];
    expect(result.score).toBe(0);
    expect(result.interactionData.firstTryCorrect).toBe(false);
    expect(result.interactionData.attempts).toBe(2);
  });

  it('renders an empty state for unusable parameters', () => {
    const onComplete = vi.fn<(result: ActivityResult) => void>();
    render(
      <PatternNextGame
        data={{ type: 'pattern_next', title: 'bad', sequence: [], options: [] }}
        onComplete={onComplete}
      />,
    );
    expect(screen.getByText('暂无规律接龙题目')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('is dispatched by GameRenderer for the new activity type', () => {
    const onComplete = vi.fn<(result: ActivityResult) => void>();
    render(<GameRenderer type="pattern_next" data={data} onComplete={onComplete} />);
    expect(screen.getByText('水果接龙')).toBeTruthy();
  });
});

describe('pattern_next normalization', () => {
  it('infers pattern_next from sequence + options without confusing legacy types', () => {
    expect(
      normalizeActivityType(undefined, {
        sequence: [{ id: 's1', label: '苹果' }],
        options: [{ id: 'o1', label: '香蕉' }],
      }),
    ).toBe('pattern_next');
    // quiz (questions) and matching (pairs) keep their original inference.
    expect(normalizeActivityType(undefined, { questions: [{ question: '1+1?' }] })).toBe('quiz');
    expect(normalizeActivityType(undefined, { pairs: [{ id: 'p1', left: 'a', right: 'b' }] })).toBe(
      'matching',
    );
  });

  it('de-duplicates option labels and re-anchors the answer by label', () => {
    const normalized = normalizePatternNextData({
      sequence: [
        { id: 's1', label: '苹果', icon: '🍎' },
        { id: 's1', label: '香蕉', icon: '🍌' }, // duplicate id -> deduped
        { id: 's3', label: '苹果', icon: '🍎' },
      ],
      options: [
        { id: 'o1', label: '香蕉', icon: '🍌' },
        { id: 'o2', label: '香蕉', icon: '🍌' }, // duplicate label -> dropped
        { id: 'o3', label: '葡萄', icon: '🍇' },
        { id: 'o4', label: '西瓜', icon: '🍉' },
      ],
      answerIndex: 0, // declared answer label is 香蕉
      passingScore: 999,
      timeLimitSec: 1,
    });

    expect(normalized.sequence).toHaveLength(3);
    expect(normalized.options.map((option) => option.label)).toEqual(['香蕉', '葡萄', '西瓜']);
    expect(normalized.answerIndex).toBe(0); // re-anchored to the 香蕉 option
    expect(normalized.passingScore).toBe(100);
    expect(normalized.timeLimitSec).toBe(30);
  });

  it('caps sequence and option counts and re-anchors answers outside the list', () => {
    const normalized = normalizePatternNextData({
      sequence: Array.from({ length: 12 }, (_, i) => ({ id: `s${i + 1}`, label: `项${i + 1}` })),
      options: Array.from({ length: 6 }, (_, i) => ({ id: `o${i + 1}`, label: `选${i + 1}` })),
      answerIndex: 5, // out of the surviving 4 options
    });

    expect(normalized.sequence).toHaveLength(8);
    expect(normalized.options).toHaveLength(4);
    // The declared answer was dropped by the cap; the board stays playable.
    expect(normalized.answerIndex).toBe(0);
    expect(normalized.answerIndex).toBeLessThan(normalized.options.length);
  });
});
