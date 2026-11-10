import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ColorFillGame from '@/components/games/ColorFillGame';
import GameRenderer from '@/components/games/GameRenderer';
import {
  normalizeActivityType,
  normalizeColorFillData,
} from '@/components/ai-chat/activity-normalizer';
import type { ActivityData, ActivityResult } from '@/types';

const data: ActivityData = {
  type: 'color_fill',
  title: '给太阳和云朵涂色',
  prompt: '给太阳涂上黄色，给云朵涂上白色',
  regions: [
    { id: 's1', shape: 'sun', colorKey: 'yellow' },
    { id: 's2', shape: 'cloud', colorKey: 'white' },
    { id: 's3', shape: 'star', colorKey: 'yellow' },
  ],
  palette: ['red', 'yellow', 'blue', 'white'],
  passingScore: 80,
  timeLimitSec: 120,
};

function pickColor(label: string) {
  fireEvent.click(screen.getByRole('button', { name: `选择${label}` }));
}

function paintRegion(shape: string) {
  fireEvent.click(screen.getByRole('button', { name: `涂色 ${shape}` }));
}

describe('ColorFillGame', () => {
  it('guides the child to pick a color first', () => {
    const onComplete = vi.fn<(result: ActivityResult) => void>();
    render(<ColorFillGame data={data} onComplete={onComplete} />);

    paintRegion('sun');
    expect(screen.getByRole('status')).toHaveTextContent('先在下面选一个颜色吧');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('completes when every region is painted correctly and reports first-try results', () => {
    const onComplete = vi.fn<(result: ActivityResult) => void>();
    render(<ColorFillGame data={data} onComplete={onComplete} />);

    // sun and star are both yellow; cloud is white. First-try all.
    pickColor('黄色');
    paintRegion('sun');
    paintRegion('star');
    pickColor('白色');
    paintRegion('cloud');

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result.score).toBe(100);
    expect(result.correctAnswers).toBe(3);
    expect(result.totalQuestions).toBe(3);
    expect(result.interactionData.activityType).toBe('color_fill');
    expect(result.interactionData.regionResults).toEqual([
      { id: 's1', colorKey: 'yellow', firstTry: true },
      { id: 's2', colorKey: 'white', firstTry: true },
      { id: 's3', colorKey: 'yellow', firstTry: true },
    ]);
  });

  it('keeps firstTry=false for a wrongly painted region even after repainting', () => {
    const onComplete = vi.fn<(result: ActivityResult) => void>();
    render(<ColorFillGame data={data} onComplete={onComplete} />);

    pickColor('红色');
    paintRegion('sun'); // wrong on first coloring
    pickColor('黄色');
    paintRegion('sun'); // repaint correct: last state wins, firstTry lost
    paintRegion('star');
    pickColor('白色');
    paintRegion('cloud');

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result.correctAnswers).toBe(2);
    expect(result.totalQuestions).toBe(3);
    expect(result.interactionData.regionResults[0]).toEqual({
      id: 's1',
      colorKey: 'yellow',
      firstTry: false,
    });
  });

  it('renders an empty state for unusable parameters', () => {
    const onComplete = vi.fn<(result: ActivityResult) => void>();
    render(
      <ColorFillGame
        data={{ type: 'color_fill', title: 'bad', regions: [], palette: [] }}
        onComplete={onComplete}
      />,
    );
    expect(screen.getByText('暂无涂色题目')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('is dispatched by GameRenderer for the new activity type', () => {
    const onComplete = vi.fn<(result: ActivityResult) => void>();
    render(<GameRenderer type="color_fill" data={data} onComplete={onComplete} />);
    expect(screen.getByText('给太阳和云朵涂色')).toBeTruthy();
  });
});

describe('color_fill normalization', () => {
  it('infers color_fill from bare regions without confusing legacy types', () => {
    expect(
      normalizeActivityType(undefined, {
        regions: [
          { id: 's1', shape: 'sun', colorKey: 'yellow' },
          { id: 's2', shape: 'cloud', colorKey: 'white' },
        ],
        palette: ['red', 'yellow', 'white'],
      }),
    ).toBe('color_fill');
    // quiz (questions) and matching (pairs) keep their original inference.
    expect(normalizeActivityType(undefined, { questions: [{ question: '1+1?' }] })).toBe('quiz');
    expect(normalizeActivityType(undefined, { pairs: [{ id: 'p1', left: 'a', right: 'b' }] })).toBe(
      'matching',
    );
  });

  it('drops unknown shapes/colors and regions missing from the palette', () => {
    const normalized = normalizeColorFillData({
      regions: [
        { id: 's1', shape: 'sun', colorKey: 'yellow' },
        { id: 's2', shape: 'dragon', colorKey: 'yellow' }, // unknown shape -> dropped
        { id: 's3', shape: 'star', colorKey: 'gold' }, // unknown color -> dropped
        { id: 's4', shape: 'heart', colorKey: 'pink' }, // not in palette -> dropped
        { id: 's5', shape: 'cloud', colorKey: 'white' },
      ],
      palette: ['not-a-color', 'yellow', 'yellow', 'white', 'red'],
      passingScore: 999,
      timeLimitSec: 1,
    });

    expect(normalized.regions.map((r) => r.shape)).toEqual(['sun', 'cloud']);
    expect(normalized.palette).toEqual(['yellow', 'white', 'red']);
    expect(normalized.passingScore).toBe(100);
    expect(normalized.timeLimitSec).toBe(30);
  });

  it('caps regions and palette at the configured limits', () => {
    const normalized = normalizeColorFillData({
      regions: Array.from({ length: 9 }, (_, i) => ({
        id: `s${i + 1}`,
        shape: 'circle',
        colorKey: 'yellow',
      })),
      palette: ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink', 'brown', 'black', 'white'],
    });
    expect(normalized.regions).toHaveLength(6);
    expect(normalized.palette).toHaveLength(8);
  });
});
