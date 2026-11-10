import { useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type {
  ActivityData,
  ActivityResult,
  ColorFillColor,
  ColorFillRegion,
  ColorFillShape,
} from '@/types';
import { normalizeColorFillData } from '@/components/ai-chat/activity-normalizer';
import GameCompletionScreen from './GameCompletionScreen';
import { buildGameResult } from './gameResult';

interface ColorFillGameProps {
  data: ActivityData;
  onComplete: (result: ActivityResult) => void;
}

/**
 * Fixed color table (Appendix H.3). Both clients must keep identical values.
 */
const COLOR_VALUES: Record<ColorFillColor, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  yellow: '#facc15',
  green: '#22c55e',
  orange: '#f97316',
  purple: '#a855f7',
  pink: '#ec4899',
  brown: '#a16207',
  black: '#27272a',
  white: '#ffffff',
};

const COLOR_LABELS: Record<ColorFillColor, string> = {
  red: '红色',
  blue: '蓝色',
  yellow: '黄色',
  green: '绿色',
  orange: '橙色',
  purple: '紫色',
  pink: '粉色',
  brown: '棕色',
  black: '黑色',
  white: '白色',
};

/**
 * Fixed shape library (Appendix H.3). Rendered as inline SVG constants owned
 * by this component — NOT generated content. Every shape paints with a single
 * `fill` so the child's chosen color applies to the whole silhouette.
 */
function ShapeGlyph({ shape, fill }: { shape: ColorFillShape; fill: string }) {
  const common = { fill, stroke: 'rgba(80,80,90,0.45)', strokeWidth: 2 } as const;
  switch (shape) {
    case 'circle':
      return (
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <circle cx="50" cy="50" r="36" {...common} />
        </svg>
      );
    case 'square':
      return (
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <rect x="15" y="15" width="70" height="70" rx="10" {...common} />
        </svg>
      );
    case 'triangle':
      return (
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <polygon points="50,12 92,86 8,86" {...common} strokeLinejoin="round" />
        </svg>
      );
    case 'star':
      return (
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <polygon
            points="50,6 61,38 95,38 67,58 78,92 50,71 22,92 33,58 5,38 39,38"
            {...common}
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'heart':
      return (
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <path
            d="M50 88 C 22 64, 8 44, 19 27 C 28 13, 45 15, 50 29 C 55 15, 72 13, 81 27 C 92 44, 78 64, 50 88 Z"
            {...common}
          />
        </svg>
      );
    case 'flower': {
      const petals = [0, 60, 120, 180, 240, 300].map((angle) => {
        const rad = (angle * Math.PI) / 180;
        return { cx: 50 + 22 * Math.cos(rad), cy: 50 + 22 * Math.sin(rad) };
      });
      return (
        <svg viewBox="0 0 100 100" className="h-full w-full">
          {petals.map((petal, i) => (
            <circle key={i} cx={petal.cx} cy={petal.cy} r="15" {...common} />
          ))}
          <circle cx="50" cy="50" r="13" {...common} />
        </svg>
      );
    }
    case 'sun': {
      const rays = [0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
        const rad = (angle * Math.PI) / 180;
        return {
          x1: 50 + 26 * Math.cos(rad),
          y1: 50 + 26 * Math.sin(rad),
          x2: 50 + 42 * Math.cos(rad),
          y2: 50 + 42 * Math.sin(rad),
        };
      });
      return (
        <svg viewBox="0 0 100 100" className="h-full w-full">
          {rays.map((ray, i) => (
            <line
              key={i}
              x1={ray.x1}
              y1={ray.y1}
              x2={ray.x2}
              y2={ray.y2}
              stroke={fill}
              strokeWidth="7"
              strokeLinecap="round"
            />
          ))}
          <circle cx="50" cy="50" r="22" {...common} />
        </svg>
      );
    }
    case 'moon':
      return (
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <path
            d="M62 10 A 42 42 0 1 0 62 90 A 34 34 0 1 1 62 10 Z"
            {...common}
          />
        </svg>
      );
    case 'cloud':
      return (
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <path
            d="M24 74 A 17 17 0 0 1 26 41 A 22 22 0 0 1 67 32 A 17 17 0 0 1 78 74 Z"
            {...common}
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'fish':
      return (
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <path
            d="M14 52 C 26 32, 56 30, 70 46 L 90 34 L 86 52 L 90 70 L 70 58 C 56 74, 26 72, 14 52 Z"
            {...common}
            strokeLinejoin="round"
          />
          <circle cx="30" cy="48" r="4" fill="#ffffff" opacity="0.9" />
        </svg>
      );
    default:
      return null;
  }
}

/**
 * color_fill — color-by-number activity type (plan B, Appendix H.3).
 *
 * Rendering logic is fixed and owned by the client; `data` only carries JSON
 * parameters produced by generateActivity (shape/color enums, zero
 * coordinates). The child picks a swatch and taps regions; regions can be
 * repainted (last state wins) and only regions colored correctly on their
 * first coloring count towards the score (identical on Web and Flutter).
 */
export default function ColorFillGame({ data, onComplete }: ColorFillGameProps) {
  const params = useMemo(() => normalizeColorFillData(data), [data]);
  const { regions, palette, prompt, passingScore, timeLimitSec } = params;

  const [selectedColor, setSelectedColor] = useState<ColorFillColor | null>(null);
  const [fills, setFills] = useState<Record<string, ColorFillColor | null>>({});
  const firstTryRef = useRef<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [finalCorrect, setFinalCorrect] = useState(0);
  const startedAt = useRef(Date.now());
  const completedRef = useRef(false);

  const correctCount = regions.filter((r) => fills[r.id] === r.colorKey).length;

  const tapRegion = (region: ColorFillRegion) => {
    if (finished || completedRef.current) return;
    if (!selectedColor) {
      setFeedback('先在下面选一个颜色吧！');
      return;
    }
    if (fills[region.id] === selectedColor) return;

    // First coloring of a region decides its firstTry status; repaints keep
    // the original verdict (last state wins for the visible fill).
    if (fills[region.id] == null) {
      firstTryRef.current[region.id] = selectedColor === region.colorKey;
    }
    const nextFills = { ...fills, [region.id]: selectedColor };
    setFills(nextFills);

    const nextCorrect = regions.filter((r) => nextFills[r.id] === r.colorKey).length;
    if (nextCorrect === regions.length) {
      if (completedRef.current) return;
      completedRef.current = true;
      const perTarget = regions.map((r) => ({
        id: r.id,
        colorKey: r.colorKey,
        firstTry: firstTryRef.current[r.id] === true,
      }));
      const firstTryCount = perTarget.filter((entry) => entry.firstTry).length;
      setFinalCorrect(firstTryCount);
      setFinished(true);
      onComplete(
        buildGameResult({
          correctAnswers: firstTryCount,
          totalQuestions: regions.length,
          startedAt: startedAt.current,
          interactionData: {
            activityType: 'color_fill',
            engine: 'parameterized',
            passingScore,
            timeLimitSec,
            regionResults: perTarget,
          },
        }),
      );
      return;
    }

    setFeedback(
      selectedColor === region.colorKey
        ? `涂对啦！${COLOR_LABELS[selectedColor]}正合适！`
        : `${COLOR_LABELS[selectedColor]}好像不太对，可以再换个颜色涂。`,
    );
  };

  if (regions.length < 2 || palette.length < 2) {
    return <div className="p-4 text-on-surface-variant">暂无涂色题目</div>;
  }

  if (finished) {
    return <GameCompletionScreen score={finalCorrect} total={regions.length} />;
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="font-medium text-on-surface text-lg">{data.title || '涂色游戏'}</h3>
        <p className="text-sm text-on-surface-variant">
          {prompt || '选一个颜色，给每个图形涂上正确的颜色吧！'}
        </p>
        <p className="text-xs text-on-surface-variant mt-1">
          建议在 {timeLimitSec} 秒内完成 · 已涂对 {correctCount} / {regions.length}
        </p>
      </div>

      <div
        className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-3 flex flex-wrap items-center justify-center gap-3"
        aria-label="涂色区域"
      >
        {regions.map((region) => {
          const fill = fills[region.id];
          const isCorrect = fill === region.colorKey;
          return (
            <button
              key={region.id}
              type="button"
              aria-label={`涂色 ${region.shape}`}
              onClick={() => tapRegion(region)}
              className={cn(
                'h-24 w-24 rounded-2xl border-2 p-1.5 transition-tactile active:translate-y-0.5',
                'bg-surface-container',
                isCorrect
                  ? 'border-success/70'
                  : fill
                    ? 'border-error/50'
                    : 'border-outline-variant/30 border-dashed',
              )}
            >
              <ShapeGlyph shape={region.shape} fill={fill ? COLOR_VALUES[fill] : '#e7e5e4'} />
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3" aria-label="色盘">
        {palette.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`选择${COLOR_LABELS[color]}`}
            onClick={() => {
              setSelectedColor(color);
              setFeedback(null);
            }}
            className={cn(
              'h-11 w-11 rounded-full border-2 transition-tactile active:translate-y-0.5',
              selectedColor === color
                ? 'border-primary ring-2 ring-primary/40 scale-110'
                : 'border-outline-variant/40',
            )}
            style={{ backgroundColor: COLOR_VALUES[color] }}
          />
        ))}
      </div>

      {feedback ? (
        <p role="status" className="text-center text-sm font-bold text-on-surface-variant">
          {feedback}
        </p>
      ) : null}
    </div>
  );
}
