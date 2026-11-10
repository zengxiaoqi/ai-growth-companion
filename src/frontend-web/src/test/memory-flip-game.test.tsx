import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MemoryFlipGame from '@/components/games/MemoryFlipGame';
import GameRenderer from '@/components/games/GameRenderer';
import {
  normalizeActivityType,
  normalizeMemoryFlipData,
} from '@/components/ai-chat/activity-normalizer';
import type { ActivityData, ActivityResult } from '@/types';

const data: ActivityData = {
  type: 'memory_flip',
  title: '动物记忆翻翻乐',
  prompt: '找到一模一样的一对',
  pairs: [
    { id: 'p1', label: '小猫', icon: '🐱' },
    { id: 'p2', label: '小狗', icon: '🐶' },
    { id: 'p3', label: '小兔', icon: '🐰' },
    { id: 'p4', label: '小鸭', icon: '🦆' },
  ],
  gridSize: { rows: 2, cols: 4 },
  passingScore: 80,
  timeLimitSec: 180,
};

// Replicates the deterministic shuffle inside MemoryFlipGame so tests can
// click the exact positions of each pair instead of brute-forcing.
function expectedDeckOrder(pairs: Array<{ id: string }>): string[] {
  const keys: string[] = [];
  pairs.forEach((pair) => {
    keys.push(`${pair.id}#a`, `${pair.id}#b`);
  });
  const seedSource = keys.join('|');
  let hash = 2166136261;
  for (let i = 0; i < seedSource.length; i++) {
    hash ^= seedSource.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const deck = [...keys];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.map((key) => key.split('#')[0]);
}

/**
 * Clicks the face-down card located at deck order index `deckIndex`.
 * Face-up cards (matched pairs + already flipped) are skipped, because DOM
 * order equals deck order and face-down buttons keep their relative order.
 */
async function clickFaceDown(
  user: ReturnType<typeof userEvent.setup>,
  deckIndex: number,
  hidden: Set<number>,
) {
  const candidates = [...hidden].sort((a, b) => a - b);
  const local = candidates.indexOf(deckIndex);
  expect(local).toBeGreaterThanOrEqual(0);
  const buttons = screen.getAllByRole('button', { name: '背面卡片' });
  expect(buttons).toHaveLength(candidates.length);
  await user.click(buttons[local]);
}

/** Clicks the two face-down cards belonging to `pairId`, returning nothing. */
async function matchPair(
  user: ReturnType<typeof userEvent.setup>,
  pairId: string,
  deck: string[],
  hidden: Set<number>,
) {
  const positions = deck
    .map((id, index) => ({ id, index }))
    .filter((entry) => entry.id === pairId)
    .map((entry) => entry.index);
  expect(positions).toHaveLength(2);
  expect(hidden.has(positions[0])).toBe(true);
  expect(hidden.has(positions[1])).toBe(true);

  await clickFaceDown(user, positions[0], hidden);
  hidden.delete(positions[0]);
  await clickFaceDown(user, positions[1], hidden);
  hidden.delete(positions[1]);
}

describe('MemoryFlipGame', () => {
  it('completes with a 100% score when every pair is matched', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn<(result: ActivityResult) => void>();

    render(<MemoryFlipGame data={data} onComplete={onComplete} />);

    const deck = expectedDeckOrder(data.pairs);
    const hidden = new Set(deck.map((_, index) => index));
    for (const pair of data.pairs) {
      await matchPair(user, pair.id, deck, hidden);
    }

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const result = onComplete.mock.calls[0][0];
    expect(result.score).toBe(100);
    expect(result.correctAnswers).toBe(4);
    expect(result.totalQuestions).toBe(4);
    expect(result.interactionData.activityType).toBe('memory_flip');
    expect(result.interactionData.mismatches).toBe(0);
    expect(result.interactionData.moves).toBe(4);
    expect(result.interactionData.pairs).toHaveLength(4);
  });

  it('flips a mismatch back and records it, then still completes', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn<(result: ActivityResult) => void>();

    render(<MemoryFlipGame data={data} onComplete={onComplete} />);

    const deck = expectedDeckOrder(data.pairs);
    // First click two cards from different pairs.
    const firstPair = deck[0];
    const otherIndex = deck.findIndex((id, index) => id !== firstPair && index > 0);
    expect(otherIndex).toBeGreaterThan(0);

    const all = new Set(deck.map((_, index) => index));
    await clickFaceDown(user, 0, all);
    const afterFirst = new Set(all);
    afterFirst.delete(0);
    await clickFaceDown(user, otherIndex, afterFirst);

    expect(await screen.findByRole('status')).toHaveTextContent('不是一对');
    expect(screen.getByText(/翻了 1 次/)).toBeTruthy();

    // After 800ms the two cards flip back — nothing is matched yet.
    await waitFor(
      () => {
        expect(screen.getAllByRole('button', { name: '背面卡片' })).toHaveLength(8);
      },
      { timeout: 2000 },
    );

    const hidden = new Set(deck.map((_, index) => index));
    for (const pair of data.pairs) {
      await matchPair(user, pair.id, deck, hidden);
    }

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const result = onComplete.mock.calls[0][0];
    expect(result.score).toBe(100);
    expect(result.interactionData.mismatches).toBe(1);
    expect(result.interactionData.moves).toBe(5);
  });

  it('renders an empty state for unusable parameters', () => {
    const onComplete = vi.fn<(result: ActivityResult) => void>();
    render(
      <MemoryFlipGame
        data={{ type: 'memory_flip', title: 'bad', pairs: [], gridSize: { rows: 2, cols: 2 } }}
        onComplete={onComplete}
      />,
    );
    expect(screen.getByText('暂无记忆翻牌题目')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('is dispatched by GameRenderer for the new activity type', () => {
    const onComplete = vi.fn<(result: ActivityResult) => void>();
    render(<GameRenderer type="memory_flip" data={data} onComplete={onComplete} />);
    expect(screen.getByText('动物记忆翻翻乐')).toBeTruthy();
  });
});

describe('memory_flip normalization', () => {
  it('infers memory_flip from pairs + gridSize instead of mis-typing it as matching', () => {
    expect(
      normalizeActivityType(undefined, {
        pairs: [{ id: 'p1', label: '小猫' }],
        gridSize: { rows: 2, cols: 2 },
      }),
    ).toBe('memory_flip');
    // without gridSize the generic pairs -> matching fallback still applies
    expect(normalizeActivityType(undefined, { pairs: [{ id: 'p1', left: 'a', right: 'b' }] })).toBe(
      'matching',
    );
  });

  it('de-duplicates faces, trims illegal pair counts and re-derives the grid', () => {
    const normalized = normalizeMemoryFlipData({
      pairs: [
        { id: 'p1', label: '小猫', icon: '🐱' },
        { id: 'p1', label: '小狗', icon: '🐶' }, // duplicate id -> deduped
        { id: 'p3', label: '小猫', icon: '🐱' }, // duplicate face -> dropped
        { id: 'p4', label: '小兔', icon: '🐰' },
        { id: 'p5', label: '小鸭', icon: '🦆' },
        { id: 'p6', label: '小猪', icon: '🐷' }, // 5 legal pairs -> trimmed to 4
      ],
      gridSize: { rows: 9, cols: 9 },
      passingScore: 999,
      timeLimitSec: 1,
    });

    expect(normalized.pairs).toHaveLength(4);
    expect(normalized.gridSize).toEqual({ rows: 2, cols: 4 });
    expect(new Set(normalized.pairs.map((pair) => pair.id)).size).toBe(4);
    expect(new Set(normalized.pairs.map((pair) => `${pair.label}|${pair.icon}`)).size).toBe(4);
    expect(normalized.passingScore).toBe(100);
    expect(normalized.timeLimitSec).toBe(60);
  });
});
