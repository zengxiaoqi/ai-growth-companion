import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import TapTargetGame from '@/components/games/TapTargetGame';
import GameRenderer from '@/components/games/GameRenderer';
import {
  normalizeActivityType,
  normalizeTapTargetData,
} from '@/components/ai-chat/activity-normalizer';
import type { ActivityData, ActivityResult } from '@/types';

const speakMock = vi.fn();
const stopMock = vi.fn();

// TTS is not available in jsdom; the component locks taps on isPlaying.
vi.mock('@/hooks/useGameVoice', () => ({
  useGameVoice: () => ({ speak: speakMock, stop: stopMock, isPlaying: false }),
}));

const data: ActivityData = {
  type: 'tap_target',
  title: '听指令点一点',
  rounds: [
    {
      id: 'r1',
      prompt: '请点出小猫',
      targets: [
        { id: 't1', label: '小猫', icon: '🐱' },
        { id: 't2', label: '小狗', icon: '🐶' },
        { id: 't3', label: '苹果', icon: '🍎' },
      ],
      correctIds: ['t1'],
    },
    {
      id: 'r2',
      prompt: '小狗在哪里',
      targets: [
        { id: 't4', label: '小鸭', icon: '🦆' },
        { id: 't5', label: '小狗', icon: '🐶' },
        { id: 't6', label: '西瓜', icon: '🍉' },
      ],
      correctIds: ['t5'],
    },
  ],
  passingScore: 80,
  timeLimitSec: 120,
};

function tap(label: string) {
  fireEvent.click(screen.getByRole('button', { name: `目标 ${label}` }));
}

describe('TapTargetGame', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    speakMock.mockClear();
    stopMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('speaks the round prompt on mount and on round change', () => {
    const onComplete = vi.fn<(result: ActivityResult) => void>();
    render(<TapTargetGame data={data} onComplete={onComplete} />);

    expect(speakMock).toHaveBeenCalledWith('请点出小猫');

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '再听一遍指令' }));
    });
    expect(speakMock).toHaveBeenCalledTimes(2);
  });

  it('completes both rounds cleanly and reports first-try results', () => {
    const onComplete = vi.fn<(result: ActivityResult) => void>();
    render(<TapTargetGame data={data} onComplete={onComplete} />);

    tap('🐱 小猫');
    expect(screen.getByRole('status')).toHaveTextContent('答对啦');

    // 800ms judgement window, then the next round speaks its own prompt.
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(speakMock).toHaveBeenCalledWith('小狗在哪里');

    tap('🐶 小狗');

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result.score).toBe(100);
    expect(result.correctAnswers).toBe(2);
    expect(result.totalQuestions).toBe(2);
    expect(result.interactionData.activityType).toBe('tap_target');
    expect(result.interactionData.roundResults).toEqual([
      { roundId: 'r1', firstTry: true, taps: 1 },
      { roundId: 'r2', firstTry: true, taps: 1 },
    ]);
  });

  it('fails the round on a decoy tap, reveals the answer and advances', () => {
    const onComplete = vi.fn<(result: ActivityResult) => void>();
    render(<TapTargetGame data={data} onComplete={onComplete} />);

    tap('🍎 苹果'); // decoy
    expect(screen.getByRole('status')).toHaveTextContent('再听一次指令哦');
    // The correct target lights up during the reveal window.
    expect(
      screen.getByRole('button', { name: '目标 🐱 小猫' }).className,
    ).toContain('border-primary');

    tap('🐱 小猫'); // ignored during the reveal window
    expect(onComplete).not.toHaveBeenCalled();

    // The reveal window elapses and the board advances to round 2.
    act(() => {
      vi.advanceTimersByTime(800);
    });
    tap('🐶 小狗');

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result.correctAnswers).toBe(1);
    expect(result.interactionData.roundResults[0]).toEqual({
      roundId: 'r1',
      firstTry: false,
      taps: 1,
    });
  });

  it('renders an empty state for unusable parameters', () => {
    const onComplete = vi.fn<(result: ActivityResult) => void>();
    render(
      <TapTargetGame
        data={{ type: 'tap_target', title: 'bad', rounds: [] }}
        onComplete={onComplete}
      />,
    );
    expect(screen.getByText('暂无听指令题目')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('is dispatched by GameRenderer for the new activity type', () => {
    const onComplete = vi.fn<(result: ActivityResult) => void>();
    render(<GameRenderer type="tap_target" data={data} onComplete={onComplete} />);
    expect(screen.getByText('听指令点一点')).toBeTruthy();
  });
});

describe('tap_target normalization', () => {
  it('infers tap_target from bare rounds without confusing legacy types', () => {
    expect(
      normalizeActivityType(undefined, {
        rounds: [
          {
            id: 'r1',
            prompt: '请点出小猫',
            targets: [
              { id: 't1', label: '小猫' },
              { id: 't2', label: '小狗' },
            ],
            correctIds: ['t1'],
          },
        ],
      }),
    ).toBe('tap_target');
    // quiz (questions) and matching (pairs) keep their original inference.
    expect(normalizeActivityType(undefined, { questions: [{ question: '1+1?' }] })).toBe('quiz');
    expect(normalizeActivityType(undefined, { pairs: [{ id: 'p1', left: 'a', right: 'b' }] })).toBe(
      'matching',
    );
  });

  it('de-duplicates labels, re-anchors correctIds and drops unanswerable rounds', () => {
    const normalized = normalizeTapTargetData({
      rounds: [
        {
          id: 'r1',
          prompt: '请点出小猫',
          targets: [
            { id: 't1', label: '小猫' },
            { id: 'dup', label: '小猫' }, // duplicate label -> dropped
            { id: 't2', label: '小狗' },
          ],
          correctIds: ['t1', 'nope'], // dangling id ignored, t1 re-anchored
        },
        {
          id: 'r2',
          prompt: '请点出小鸭',
          targets: [
            { id: 'x1', label: '母鸡' },
            { id: 'x2', label: '小猪' },
          ],
          correctIds: ['missing'], // correct target dropped -> round dropped
        },
      ],
      passingScore: 999,
      timeLimitSec: 1,
    });

    expect(normalized.rounds).toHaveLength(1);
    expect(normalized.rounds[0].targets.map((t) => t.label)).toEqual(['小猫', '小狗']);
    expect(normalized.rounds[0].correctIds).toEqual(['t1']);
    expect(normalized.passingScore).toBe(100);
    expect(normalized.timeLimitSec).toBe(30);
  });
});
