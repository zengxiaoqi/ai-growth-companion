import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ActivityProcessDetails, {
  summarizeInteraction,
} from '@/components/parent/ActivityProcessDetails';
import type { LearningHistoryRecord, LearningInteractionData } from '@/types';

const getLearningHistoryMock = vi.fn();

vi.mock('@/services/api', () => ({
  default: { getLearningHistory: (...args: unknown[]) => getLearningHistoryMock(...args) },
}));

function record(overrides: Partial<LearningHistoryRecord>): LearningHistoryRecord {
  return {
    id: 1,
    startedAt: '2026-11-10T10:00:00.000Z',
    completedAt: '2026-11-10T10:03:00.000Z',
    durationSeconds: 180,
    score: 100,
    status: 'completed',
    content: { id: 9, title: '动物分类' },
    interactionData: { activityType: 'quiz' },
    ...overrides,
  };
}

describe('summarizeInteraction', () => {
  it('summarizes every parameterized activity type in parent-readable language', () => {
    const dragSort: LearningInteractionData = {
      activityType: 'drag_sort',
      totalErrors: 1,
      placements: [
        { itemId: 'a', bucketId: 'b1', correctOnFirstTry: true },
        { itemId: 'b', bucketId: 'b2', correctOnFirstTry: true },
        { itemId: 'c', bucketId: 'b1', correctOnFirstTry: false },
      ],
    };
    expect(summarizeInteraction(dragSort)).toBe('放错 1 次 · 2/3 个物品首次放对');

    expect(
      summarizeInteraction({ activityType: 'memory_flip', moves: 8, mismatches: 2 }),
    ).toBe('8 步完成全部配对 · 翻错 2 次');

    expect(
      summarizeInteraction({ activityType: 'pattern_next', attempts: 1, firstTryCorrect: true }),
    ).toBe('每个规律一次接对');
    expect(
      summarizeInteraction({ activityType: 'pattern_next', attempts: 3, firstTryCorrect: false }),
    ).toBe('共尝试 3 次后接对全部规律');

    expect(
      summarizeInteraction({
        activityType: 'trace_path',
        minCoverage: 0.7,
        perTarget: [
          { id: 't1', coverage: 0.8, attempts: 1, firstTry: true },
          { id: 't2', coverage: 0.75, attempts: 2, firstTry: false },
        ],
      }),
    ).toBe('描红 2 个字（达标线 70% 覆盖）· 1/2 个字一次完成');

    expect(
      summarizeInteraction({
        activityType: 'color_fill',
        regionResults: [
          { id: 'r1', colorKey: 'red', firstTry: true },
          { id: 'r2', colorKey: 'blue', firstTry: false },
        ],
      }),
    ).toBe('1/2 个区域一次涂对');

    expect(
      summarizeInteraction({
        activityType: 'tap_target',
        roundResults: [
          { roundId: 'r1', firstTry: true, taps: 1 },
          { roundId: 'r2', firstTry: true, taps: 1 },
          { roundId: 'r3', firstTry: false, taps: 2 },
        ],
      }),
    ).toBe('2/3 轮一次听对指令');
  });

  it('returns null for legacy or incomplete interaction data', () => {
    expect(summarizeInteraction({ activityType: 'quiz' })).toBeNull();
    expect(summarizeInteraction({ activityType: 'drag_sort', placements: [] })).toBeNull();
    expect(summarizeInteraction({})).toBeNull();
  });
});

describe('ActivityProcessDetails', () => {
  beforeEach(() => {
    getLearningHistoryMock.mockReset();
  });

  it('renders process summaries for recent parameterized records only', async () => {
    getLearningHistoryMock.mockResolvedValue([
      record({
        id: 1,
        interactionData: {
          activityType: 'tap_target',
          roundResults: [{ roundId: 'r1', firstTry: true, taps: 1 }],
        },
      }),
      record({ id: 2, interactionData: { activityType: 'quiz' } }), // legacy -> filtered out
      record({
        id: 3,
        interactionData: {
          activityType: 'color_fill',
          regionResults: [{ id: 'r1', colorKey: 'red', firstTry: true }],
        },
        score: 100,
      }),
    ]);

    render(<ActivityProcessDetails userId={42} />);

    await waitFor(() => {
      expect(screen.getByText('听指令点一点')).toBeTruthy();
    });
    expect(screen.getByText('1/1 轮一次听对指令')).toBeTruthy();
    expect(screen.getByText('涂色游戏')).toBeTruthy();
    expect(screen.getByText('1/1 个区域一次涂对')).toBeTruthy();
    expect(screen.getByText('最近 2 次')).toBeTruthy();
    // Legacy quiz record is not rendered.
    expect(screen.queryByText('选择题')).toBeNull();
    expect(getLearningHistoryMock).toHaveBeenCalledWith(42, 20);
  });

  it('shows the empty state when there are no parameterized records', async () => {
    getLearningHistoryMock.mockResolvedValue([
      record({ id: 1, interactionData: { activityType: 'quiz' } }),
    ]);

    render(<ActivityProcessDetails userId={42} />);

    await waitFor(() => {
      expect(screen.getByText('暂无互动游戏记录')).toBeTruthy();
    });
  });

  it('degrades to the empty state when the history request fails', async () => {
    getLearningHistoryMock.mockRejectedValue(new Error('network down'));

    render(<ActivityProcessDetails userId={42} />);

    await waitFor(() => {
      expect(screen.getByText('暂无互动游戏记录')).toBeTruthy();
    });
  });
});
