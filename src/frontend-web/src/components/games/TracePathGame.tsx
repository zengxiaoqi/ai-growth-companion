import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActivityData, ActivityResult, TracePathTarget } from '@/types';
import { normalizeTracePathData } from '@/components/ai-chat/activity-normalizer';
import GameCompletionScreen from './GameCompletionScreen';
import { buildGameResult } from './gameResult';

interface TracePathGameProps {
  data: ActivityData;
  onComplete: (result: ActivityResult) => void;
}

const CANVAS_SIZE = 300;
const BRUSH_RADIUS = 16;
const SAMPLE_STEP = 6;
/** Guide + stroke drawing share this font stack. */
const GLYPH_FONT = (size: number) =>
  `900 ${size}px "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif`;
const GLYPH_FONT_SIZE_RATIO = 0.58;
/** After this much inactivity below the threshold the attempt fails and the board resets. */
const EVALUATE_DELAY_MS = 1000;

interface Point {
  x: number;
  y: number;
}

function glyphFontCanvas(
  text: string,
  size: number,
): { canvas: HTMLCanvasElement; offset: Point } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const fontSize = Math.round(size * GLYPH_FONT_SIZE_RATIO);
  if (ctx) {
    ctx.font = GLYPH_FONT(fontSize);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, size / 2, size / 2 + fontSize * 0.05);
  }
  return { canvas, offset: { x: 0, y: 0 } };
}

/**
 * trace_path — glyph-tracing activity type (plan B, Appendix H.2).
 *
 * Rendering logic is fixed and owned by the client; `data` only carries JSON
 * parameters produced by generateActivity. The LLM never provides coordinates:
 * sample points are derived from the glyph itself by rendering it offscreen
 * (mirroring the Flutter TextPainter sampling of trace_path_canvas.dart).
 *
 * Semantics (identical on Web and Flutter): the child traces the light guide
 * glyph; when the pointer rests for a moment, coverage is evaluated — reaching
 * `minCoverage` locks the glyph, otherwise strokes are cleared and the attempt
 * count increments. A glyph passed on the first evaluation scores towards the
 * result (firstTryCorrect per glyph, consistent with the other engines).
 */
export default function TracePathGame({ data, onComplete }: TracePathGameProps) {
  const params = useMemo(() => normalizeTracePathData(data), [data]);
  const { targets, minCoverage, prompt, passingScore, timeLimitSec } = params;

  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [finalCorrect, setFinalCorrect] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [passedIds, setPassedIds] = useState<string[]>([]);
  const startedAt = useRef(Date.now());
  const completedRef = useRef(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const samplesRef = useRef<Point[]>([]);
  const coveredRef = useRef<Set<number>>(new Set());
  const drawingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const attemptsRef = useRef(0);
  const evaluateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Per-glyph bookkeeping kept in a ref so the final result can include every glyph.
  const perTargetRef = useRef<Array<{ id: string; coverage: number; attempts: number; firstTry: boolean }>>([]);

  const current: TracePathTarget | undefined = targets[index];

  const clearStrokes = useCallback(() => {
    coveredRef.current = new Set();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      // Redraw only the guide glyph; strokes live on the same canvas.
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(canvas.width / CANVAS_SIZE, canvas.height / CANVAS_SIZE);
      ctx.font = GLYPH_FONT(Math.round(CANVAS_SIZE * GLYPH_FONT_SIZE_RATIO));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(100, 116, 139, 0.28)';
      const fontSize = Math.round(CANVAS_SIZE * GLYPH_FONT_SIZE_RATIO);
      ctx.fillText(current?.text ?? '', CANVAS_SIZE / 2, CANVAS_SIZE / 2 + fontSize * 0.05);
      ctx.restore();
    }
  }, [current?.text]);

  // (Re)build sample points and the guide whenever the active glyph changes.
  useEffect(() => {
    if (finished || !current) return;
    const offscreen = glyphFontCanvas(current.text, CANVAS_SIZE);
    const ctx = offscreen.canvas.getContext('2d');
    const samples: Point[] = [];
    if (ctx) {
      const image = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      for (let y = 0; y < CANVAS_SIZE; y += SAMPLE_STEP) {
        for (let x = 0; x < CANVAS_SIZE; x += SAMPLE_STEP) {
          const alpha = image.data[(y * CANVAS_SIZE + x) * 4 + 3];
          if (alpha > 128) samples.push({ x, y });
        }
      }
    }
    samplesRef.current = samples;
    coveredRef.current = new Set();
    attemptsRef.current = 0;
    setFeedback(null);
    clearStrokes();
    return () => {
      if (evaluateTimerRef.current) {
        clearTimeout(evaluateTimerRef.current);
        evaluateTimerRef.current = null;
      }
    };
  }, [current, finished, clearStrokes]);

  const finish = useCallback(
    (perTarget: Array<{ id: string; coverage: number; attempts: number; firstTry: boolean }>) => {
      if (completedRef.current) return;
      completedRef.current = true;
      const firstTryCount = perTarget.filter((t) => t.firstTry).length;
      setFinalCorrect(firstTryCount);
      setFinished(true);
      onComplete(
        buildGameResult({
          correctAnswers: firstTryCount,
          totalQuestions: targets.length,
          startedAt: startedAt.current,
          interactionData: {
            activityType: 'trace_path',
            engine: 'parameterized',
            passingScore,
            timeLimitSec,
            minCoverage,
            perTarget,
          },
        }),
      );
    },
    [onComplete, targets.length, passingScore, timeLimitSec, minCoverage],
  );

  const evaluate = useCallback(() => {
    const samples = samplesRef.current;
    if (!samples.length || !current) return;
    const coverage = coveredRef.current.size / samples.length;
    // attemptsRef counts failed evaluations so far; the current evaluation is
    // attempt number failures+1, so a glyph passed with zero failures is a
    // first-try glyph (consistent with the other parameterized engines).
    const failures = attemptsRef.current;
    const passed = coverage >= minCoverage;
    if (passed) {
      const record = {
        id: current.id,
        coverage: Math.round(coverage * 100) / 100,
        attempts: failures + 1,
        firstTry: failures === 0,
      };
      const nextPerTarget = [...perTargetRef.current.filter((t) => t.id !== record.id), record];
      perTargetRef.current = nextPerTarget;
      setPassedIds((prev) => (prev.includes(current.id) ? prev : [...prev, current.id]));
      setFeedback('真棒，描得很准！');
      if (index + 1 >= targets.length) {
        finish(nextPerTarget);
      } else {
        window.setTimeout(() => {
          setIndex((prev) => Math.min(prev + 1, targets.length - 1));
        }, 900);
      }
    } else {
      attemptsRef.current = failures + 1;
      setFeedback('没关系，再描一次试试看！');
      window.setTimeout(() => clearStrokes(), 450);
    }
  }, [current, minCoverage, index, targets.length, finish, clearStrokes]);

  const scheduleEvaluate = useCallback(() => {
    if (evaluateTimerRef.current) clearTimeout(evaluateTimerRef.current);
    evaluateTimerRef.current = setTimeout(() => {
      evaluateTimerRef.current = null;
      if (!drawingRef.current) evaluate();
    }, EVALUATE_DELAY_MS);
  }, [evaluate]);

  const toCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * CANVAS_SIZE,
      y: ((event.clientY - rect.top) / rect.height) * CANVAS_SIZE,
    };
  };

  const strokeTo = (point: Point) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const scale = canvas.width / CANVAS_SIZE;
    ctx.save();
    ctx.scale(scale, scale);
    ctx.strokeStyle = '#0ea5e9';
    ctx.lineWidth = BRUSH_RADIUS;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const last = lastPointRef.current;
    ctx.beginPath();
    if (last) {
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    } else {
      ctx.arc(point.x, point.y, BRUSH_RADIUS / 2, 0, Math.PI * 2);
      ctx.fillStyle = '#0ea5e9';
      ctx.fill();
    }
    ctx.restore();
    lastPointRef.current = point;

    const radiusSq = (BRUSH_RADIUS + SAMPLE_STEP * 0.5) * (BRUSH_RADIUS + SAMPLE_STEP * 0.5);
    const samples = samplesRef.current;
    for (let i = 0; i < samples.length; i++) {
      if (coveredRef.current.has(i)) continue;
      const dx = samples[i].x - point.x;
      const dy = samples[i].y - point.y;
      if (dx * dx + dy * dy <= radiusSq) coveredRef.current.add(i);
    }
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (finished || !current || passedIds.includes(current.id)) return;
    // jsdom (tests) has no pointer capture implementation.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (evaluateTimerRef.current) {
      clearTimeout(evaluateTimerRef.current);
      evaluateTimerRef.current = null;
    }
    drawingRef.current = true;
    lastPointRef.current = null;
    const point = toCanvasPoint(event);
    if (point) strokeTo(point);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const point = toCanvasPoint(event);
    if (point) strokeTo(point);
  };

  const onPointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    scheduleEvaluate();
  };

  if (targets.length < 1 || !current) {
    return <div className="p-4 text-on-surface-variant">暂无描红题目</div>;
  }

  if (finished) {
    return <GameCompletionScreen score={finalCorrect} total={targets.length} />;
  }

  const glyphIndex = targets.findIndex((t) => t.id === current.id);

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="font-medium text-on-surface text-lg">{data.title || '描红游戏'}</h3>
        <p className="text-sm text-on-surface-variant">
          {prompt || '用手指沿着浅色的字描一描'}
        </p>
        <p className="text-xs text-on-surface-variant mt-1">
          第 {glyphIndex + 1} / {targets.length} 个 ·
          建议在 {timeLimitSec} 秒内完成
        </p>
      </div>

      <div className="flex justify-center gap-2" aria-label="描红进度">
        {targets.map((target, i) => (
          <span
            key={target.id}
            className={
              'h-2.5 w-2.5 rounded-full ' +
              (passedIds.includes(target.id)
                ? 'bg-primary'
                : i === glyphIndex
                  ? 'bg-primary/40'
                  : 'bg-outline-variant/40')
            }
          />
        ))}
      </div>

      <div className="flex justify-center">
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE * 2}
          height={CANVAS_SIZE * 2}
          style={{ width: CANVAS_SIZE, height: CANVAS_SIZE, touchAction: 'none' }}
          className="rounded-2xl border-2 border-dashed border-outline-variant/40 bg-surface-container-lowest"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          aria-label={`描红 ${current.label}`}
        />
      </div>

      <p className="text-center text-on-surface text-3xl font-black tracking-widest" aria-hidden="true">
        {current.text}
      </p>

      {feedback ? (
        <p role="status" className="text-center text-sm font-bold text-on-surface-variant">
          {feedback}
        </p>
      ) : null}
    </div>
  );
}
