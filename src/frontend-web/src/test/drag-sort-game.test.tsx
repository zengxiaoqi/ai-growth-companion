import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DragSortGame from '@/components/games/DragSortGame';
import GameRenderer from '@/components/games/GameRenderer';
import {
  normalizeActivityType,
  normalizeDragSortData,
} from '@/components/ai-chat/activity-normalizer';
import type { ActivityData, ActivityResult } from '@/types';

const data: ActivityData = {
  type: 'drag_sort',
  title: '把小动物送回家',
  prompt: '送它们回家吧',
  buckets: [
    { id: 'sky', label: '天上', icon: '☁️' },
    { id: 'water', label: '水里', icon: '💧' },
  ],
  items: [
    { id: 'i1', label: '小鸟', icon: '🐦', bucketId: 'sky' },
    { id: 'i2', label: '小鱼', icon: '🐟', bucketId: 'water' },
    { id: 'i3', label: '蝴蝶', icon: '🦋', bucketId: 'sky' },
  ],
  passingScore: 80,
  timeLimitSec: 120,
};

async function place(user: ReturnType<typeof userEvent.setup>, item: string, bucket: string) {
  await user.click(screen.getByRole('button', { name: `选择卡片 ${item}` }));
  await user.click(screen.getByRole('button', { name: `投放到${bucket}` }));
}

describe('DragSortGame', () => {
  it('completes with a 0-100 percentage score when every first placement is correct', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn<(result: ActivityResult) => void>();

    render(<DragSortGame data={data} onComplete={onComplete} />);

    await place(user, '小鸟', '天上');
    await place(user, '小鱼', '水里');
    await place(user, '蝴蝶', '天上');

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const result = onComplete.mock.calls[0][0];
    expect(result.score).toBe(100);
    expect(result.correctAnswers).toBe(3);
    expect(result.totalQuestions).toBe(3);
    expect(result.interactionData.activityType).toBe('drag_sort');
    expect(result.interactionData.totalErrors).toBe(0);
    expect(result.interactionData.placements).toHaveLength(3);
  });

  it('does not score an item whose first placement was wrong', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn<(result: ActivityResult) => void>();

    render(<DragSortGame data={data} onComplete={onComplete} />);

    await place(user, '小鸟', '水里'); // wrong bucket, card stays in tray
    expect(screen.getByRole('status').textContent).toContain('再想一想');
    expect(screen.getByRole('button', { name: '选择卡片 小鸟' })).toBeTruthy();

    await place(user, '小鸟', '天上');
    await place(user, '小鱼', '水里');
    await place(user, '蝴蝶', '天上');

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const result = onComplete.mock.calls[0][0];
    expect(result.score).toBe(67);
    expect(result.correctAnswers).toBe(2);
    expect(result.interactionData.totalErrors).toBe(1);
    expect(result.interactionData.placements[0].correctOnFirstTry).toBe(false);
    expect(result.interactionData.placements[0].attempts).toBe(2);
  });

  it('asks the child to pick a card first and never writes back early', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn<(result: ActivityResult) => void>();

    render(<DragSortGame data={data} onComplete={onComplete} />);
    await user.click(screen.getByRole('button', { name: '投放到天上' }));

    expect(screen.getByRole('status').textContent).toContain('先点一张卡片');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('keeps attempt history when a placement is undone', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn<(result: ActivityResult) => void>();

    render(<DragSortGame data={data} onComplete={onComplete} />);
    await place(user, '小鸟', '天上');
    await user.click(screen.getByRole('button', { name: '取回小鸟' }));
    await place(user, '小鸟', '天上');
    await place(user, '小鱼', '水里');
    await place(user, '蝴蝶', '天上');

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const result = onComplete.mock.calls[0][0];
    expect(result.score).toBe(67);
    expect(result.interactionData.placements[0].attempts).toBe(2);
  });

  it('renders an empty state for unusable parameters', () => {
    const onComplete = vi.fn<(result: ActivityResult) => void>();
    render(
      <DragSortGame
        data={{ type: 'drag_sort', title: 'bad', buckets: [], items: [] }}
        onComplete={onComplete}
      />,
    );
    expect(screen.getByText('暂无分类题目')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('is dispatched by GameRenderer for the new activity type', () => {
    const onComplete = vi.fn<(result: ActivityResult) => void>();
    render(<GameRenderer type="drag_sort" data={data} onComplete={onComplete} />);
    expect(screen.getByText('把小动物送回家')).toBeTruthy();
  });
});

describe('drag_sort normalization', () => {
  it('infers drag_sort from buckets + items instead of mis-typing it as sequencing', () => {
    expect(
      normalizeActivityType(undefined, {
        buckets: [{ id: 'a', label: 'A' }],
        items: [{ id: 'i', label: 'I', bucketId: 'a' }],
      }),
    ).toBe('drag_sort');
  });

  it('drops items pointing at unknown buckets and de-duplicates ids', () => {
    const normalized = normalizeDragSortData({
      buckets: [
        { id: 'sky', label: '天上' },
        { id: 'sky', label: '重复' },
        { id: 'water', label: '水里' },
      ],
      items: [
        { id: 'i1', label: '小鸟', bucketId: 'sky' },
        { id: 'i1', label: '蝴蝶', bucketId: 'sky' },
        { id: 'i2', label: '小鱼', bucketId: 'missing' },
      ],
      passingScore: 999,
      timeLimitSec: 1,
    });

    expect(normalized.buckets).toHaveLength(3);
    expect(new Set(normalized.buckets.map((b) => b.id)).size).toBe(3);
    expect(normalized.items).toHaveLength(2);
    expect(new Set(normalized.items.map((i) => i.id)).size).toBe(2);
    expect(normalized.passingScore).toBe(100);
    expect(normalized.timeLimitSec).toBe(30);
  });
});
