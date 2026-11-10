import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import TracePathGame from '@/components/games/TracePathGame';
import GameRenderer from '@/components/games/GameRenderer';
import {
  normalizeActivityType,
  normalizeTracePathData,
} from '@/components/ai-chat/activity-normalizer';
import type { ActivityData, ActivityResult } from '@/types';

/**
 * trace_path (plan B, appendix H.2): jsdom has no canvas implementation, so
 * HTMLCanvasElement#getContext is stubbed and getImageData simulates a glyph
 * region whose alpha>128 pixels the component samples. The pointer coordinate
 * mapping is pinned with a getBoundingClientRect stub.
 */
const SIZE = 300;

interface Region {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

let glyphRegion: Region = { x0: 140, x1: 160, y0: 140, y1: 160 };

function makeImageData(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = glyphRegion.y0; y < glyphRegion.y1 && y < height; y++) {
    for (let x = glyphRegion.x0; x < glyphRegion.x1 && x < width; x++) {
      const alphaIndex = (y * width + x) * 4 + 3;
      if (alphaIndex < data.length) data[alphaIndex] = 255;
    }
  }
  return { data, width, height, colorSpace: 'srgb' };
}

const ctxStub = {
  clearRect: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  scale: vi.fn(),
  fillText: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  getImageData: (_x: number, _y: number, w: number, h: number) => makeImageData(w, h),
};

const data: ActivityData = {
  type: 'trace_path',
  title: '描一描：火与山',
  prompt: '请沿着虚线描一描',
  targets: [
    { id: 'g1', kind: 'glyph', text: '火', label: '火' },
    { id: 'g2', kind: 'glyph', text: '山', label: '山' },
  ],
  minCoverage: 0.7,
  passingScore: 80,
  timeLimitSec: 180,
};

function pointerTap(x: number, y: number, label: string) {
  const canvas = screen.getByLabelText(`描红 ${label}`);
  act(() => {
    fireEvent.pointerDown(canvas, { clientX: x, clientY: y, pointerId: 1 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
  });
  // 1s inactivity triggers the coverage evaluation (mirrors Web behaviour).
  act(() => {
    vi.advanceTimersByTime(1000);
  });
}

describe('TracePathGame', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    glyphRegion = { x0: 140, x1: 160, y0: 140, y1: 160 };
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ctxStub) as any;
    HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn(() => ({
      left: 0,
      top: 0,
      right: SIZE,
      bottom: SIZE,
      width: SIZE,
      height: SIZE,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })) as any;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('completes every glyph and reports first-try results', () => {
    const onComplete = vi.fn<(result: ActivityResult) => void>();
    render(<TracePathGame data={data} onComplete={onComplete} />);

    expect(screen.getByText('描一描：火与山')).toBeTruthy();
    expect(screen.getByText('火')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();

    // The stubbed glyph region is a 20x20 block around the canvas centre; a
    // tap at the centre covers every sample -> first evaluation passes.
    pointerTap(150, 150, '火');
    expect(screen.getByRole('status')).toHaveTextContent('真棒');

    // 900ms later the board advances to the second glyph.
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(screen.getByText(/第 2 \/ 2 个/)).toBeTruthy();

    pointerTap(150, 150, '山');

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result.score).toBe(100);
    expect(result.correctAnswers).toBe(2);
    expect(result.totalQuestions).toBe(2);
    expect(result.interactionData.activityType).toBe('trace_path');
    expect(result.interactionData.minCoverage).toBe(0.7);
    expect(result.interactionData.perTarget).toEqual([
      { id: 'g1', coverage: 1, attempts: 1, firstTry: true },
      { id: 'g2', coverage: 1, attempts: 1, firstTry: true },
    ]);
  });

  it('keeps the child tracing when coverage is below the threshold', () => {
    const onComplete = vi.fn<(result: ActivityResult) => void>();
    // A wide band of samples: one tap covers only a fraction of them.
    // Must be set BEFORE render — samples are built on mount.
    glyphRegion = { x0: 40, x1: 260, y0: 80, y1: 220 };
    render(<TracePathGame data={data} onComplete={onComplete} />);

    pointerTap(150, 150, '火');

    expect(screen.getByRole('status')).toHaveTextContent('再描一次');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('renders an empty state for unusable parameters', () => {
    const onComplete = vi.fn<(result: ActivityResult) => void>();
    render(
      <TracePathGame
        data={{ type: 'trace_path', title: 'bad', targets: [] }}
        onComplete={onComplete}
      />,
    );
    expect(screen.getByText('暂无描红题目')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('is dispatched by GameRenderer for the new activity type', () => {
    const onComplete = vi.fn<(result: ActivityResult) => void>();
    render(<GameRenderer type="trace_path" data={data} onComplete={onComplete} />);
    expect(screen.getByText('描一描：火与山')).toBeTruthy();
  });
});

describe('trace_path normalization', () => {
  it('infers trace_path from bare targets without confusing legacy types', () => {
    expect(
      normalizeActivityType(undefined, {
        targets: [
          { id: 'g1', kind: 'glyph', text: '火', label: '火' },
          { id: 'g2', kind: 'glyph', text: '山', label: '山' },
        ],
      }),
    ).toBe('trace_path');
    // quiz (questions) and matching (pairs) keep their original inference.
    expect(normalizeActivityType(undefined, { questions: [{ question: '1+1?' }] })).toBe('quiz');
    expect(normalizeActivityType(undefined, { pairs: [{ id: 'p1', left: 'a', right: 'b' }] })).toBe(
      'matching',
    );
  });

  it('drops emoji, rare characters and polyline targets, and de-duplicates texts', () => {
    const normalized = normalizeTracePathData({
      targets: [
        { id: 'g1', kind: 'glyph', text: '火', label: '火' },
        { id: 'g2', kind: 'glyph', text: '🐱' }, // emoji -> dropped
        { id: 'g3', kind: 'glyph', text: '𠀀' }, // CJK extension B -> dropped
        { id: 'g4', kind: 'polyline', text: '山', points: [] }, // polyline -> dropped
        { id: 'g5', kind: 'glyph', text: '火', label: '重复' }, // duplicate text -> dropped
        { id: 'g6', kind: 'glyph', text: '山', label: '' }, // label falls back to text
      ],
      minCoverage: 0.95,
      passingScore: 999,
      timeLimitSec: 1,
    });

    expect(normalized.targets.map((t) => t.text)).toEqual(['火', '山']);
    expect(normalized.targets[1].label).toBe('山');
    expect(normalized.minCoverage).toBe(0.85); // clamped from 0.95
    expect(normalized.passingScore).toBe(100);
    expect(normalized.timeLimitSec).toBe(30);
  });

  it('caps the target count at 4 and defaults coverage on garbage input', () => {
    const normalized = normalizeTracePathData({
      targets: Array.from({ length: 6 }, (_, i) => ({
        id: `g${i + 1}`,
        kind: 'glyph',
        text: `字${i}`,
        label: `字${i}`,
      })),
      minCoverage: 'nope',
    });
    expect(normalized.targets).toHaveLength(4);
    expect(normalized.minCoverage).toBe(0.7);
  });
});
