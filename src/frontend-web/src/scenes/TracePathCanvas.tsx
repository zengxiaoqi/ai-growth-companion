import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TracePathSpec } from '@/types';
import { Button, Card } from '@/components/ui';
import { CheckCircle, RotateCcw } from '@/icons';

type Point = { x: number; y: number };
type Segment = { a: Point; b: Point };

interface TracePathCanvasProps {
  target: TracePathSpec;
  minCoverage?: number;
  onSolved: (result: { coverage: number; attempts: number; score: number }) => void;
}

const CANVAS_SIZE = 320;

function distanceToSegment(point: Point, segment: Segment): number {
  const dx = segment.b.x - segment.a.x;
  const dy = segment.b.y - segment.a.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - segment.a.x, point.y - segment.a.y);
  }
  const t = Math.max(0, Math.min(1, ((point.x - segment.a.x) * dx + (point.y - segment.a.y) * dy) / (dx * dx + dy * dy)));
  const px = segment.a.x + t * dx;
  const py = segment.a.y + t * dy;
  return Math.hypot(point.x - px, point.y - py);
}

function samplePolyline(points: Point[]): Point[] {
  const samples: Point[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const steps = Math.max(8, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 8));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      samples.push({
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
      });
    }
  }
  return samples;
}

function useGlyphTarget(target: Extract<TracePathSpec, { kind: 'glyph' }>) {
  return useMemo(() => {
    const guideCanvas = document.createElement('canvas');
    guideCanvas.width = CANVAS_SIZE;
    guideCanvas.height = CANVAS_SIZE;
    const ctx = guideCanvas.getContext('2d');
    if (!ctx) return { samples: [] as Point[], drawGuide: () => {} };

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.fillStyle = '#CBD5E1';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${target.fontSize || 88}px "Microsoft YaHei", "PingFang SC", sans-serif`;
    ctx.fillText(target.text, CANVAS_SIZE / 2, CANVAS_SIZE / 2 + 8);

    const image = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    const samples: Point[] = [];
    for (let y = 0; y < CANVAS_SIZE; y += 6) {
      for (let x = 0; x < CANVAS_SIZE; x += 6) {
        const alpha = image.data[(y * CANVAS_SIZE + x) * 4 + 3];
        if (alpha > 24) samples.push({ x, y });
      }
    }

    const drawGuide = (renderCtx: CanvasRenderingContext2D) => {
      renderCtx.save();
      renderCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      renderCtx.fillStyle = '#CBD5E1';
      renderCtx.textAlign = 'center';
      renderCtx.textBaseline = 'middle';
      renderCtx.font = `900 ${target.fontSize || 88}px "Microsoft YaHei", "PingFang SC", sans-serif`;
      renderCtx.fillText(target.text, CANVAS_SIZE / 2, CANVAS_SIZE / 2 + 8);
      renderCtx.restore();
    };

    return { samples, drawGuide };
  }, [target]);
}

function usePolylineTarget(target: Extract<TracePathSpec, { kind: 'polyline' }>) {
  return useMemo(() => {
    const points = target.points.map((point) => ({
      x: point.x * CANVAS_SIZE,
      y: point.y * CANVAS_SIZE,
    }));
    const samples = samplePolyline(points);
    const drawGuide = (ctx: CanvasRenderingContext2D) => {
      ctx.save();
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
      ctx.restore();
    };
    return { samples, drawGuide };
  }, [target]);
}

export default function TracePathCanvas({ target, minCoverage = 0.9, onSolved }: TracePathCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const segmentsRef = useRef<Segment[]>([]);
  const coveredRef = useRef<Set<number>>(new Set());
  const activePointRef = useRef<Point | null>(null);
  const attemptsRef = useRef(1);
  const solvedRef = useRef(false);

  const [coverage, setCoverage] = useState(0);
  const [attempts, setAttempts] = useState(1);
  const [warning, setWarning] = useState<string | null>(null);

  const glyphTarget = target.kind === 'glyph' ? target : null;
  const polylineTarget = target.kind === 'polyline' ? target : null;
  const glyphGuide = glyphTarget ? useGlyphTarget(glyphTarget) : null;
  const polylineGuide = polylineTarget ? usePolylineTarget(polylineTarget) : null;

  const samplePoints = glyphGuide?.samples || polylineGuide?.samples || [];

  const redraw = useCallback(() => {
    const baseCanvas = canvasRef.current;
    const overlayCanvas = overlayRef.current;
    if (!baseCanvas || !overlayCanvas) return;
    const baseCtx = baseCanvas.getContext('2d');
    const overlayCtx = overlayCanvas.getContext('2d');
    if (!baseCtx || !overlayCtx) return;

    baseCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    baseCtx.fillStyle = '#F8FAFC';
    baseCtx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    if (glyphGuide) glyphGuide.drawGuide(baseCtx);
    if (polylineGuide) polylineGuide.drawGuide(baseCtx);

    baseCtx.strokeStyle = '#E2E8F0';
    baseCtx.lineWidth = 1;
    for (let step = 0; step <= CANVAS_SIZE; step += 32) {
      baseCtx.beginPath();
      baseCtx.moveTo(step, 0);
      baseCtx.lineTo(step, CANVAS_SIZE);
      baseCtx.stroke();
      baseCtx.beginPath();
      baseCtx.moveTo(0, step);
      baseCtx.lineTo(CANVAS_SIZE, step);
      baseCtx.stroke();
    }

    overlayCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    overlayCtx.strokeStyle = '#0EA5E9';
    overlayCtx.lineWidth = 18;
    overlayCtx.lineCap = 'round';
    overlayCtx.lineJoin = 'round';
    segmentsRef.current.forEach((segment) => {
      overlayCtx.beginPath();
      overlayCtx.moveTo(segment.a.x, segment.a.y);
      overlayCtx.lineTo(segment.b.x, segment.b.y);
      overlayCtx.stroke();
    });
  }, [glyphGuide, polylineGuide]);

  const updateCoverage = useCallback((segment: Segment) => {
    const tolerance = CANVAS_SIZE * 0.035;
    samplePoints.forEach((point, index) => {
      if (coveredRef.current.has(index)) return;
      if (distanceToSegment(point, segment) <= tolerance) {
        coveredRef.current.add(index);
      }
    });

    const nextCoverage = samplePoints.length > 0 ? coveredRef.current.size / samplePoints.length : 0;
    setCoverage(nextCoverage);
  }, [samplePoints]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const pointerPosition = useCallback((event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * CANVAS_SIZE,
      y: ((event.clientY - rect.top) / rect.height) * CANVAS_SIZE,
    };
  }, []);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setWarning(null);
    activePointRef.current = pointerPosition(event);
  }, [pointerPosition]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activePointRef.current || solvedRef.current) return;
    const nextPoint = pointerPosition(event);
    const segment = { a: activePointRef.current, b: nextPoint };
    activePointRef.current = nextPoint;
    segmentsRef.current.push(segment);
    updateCoverage(segment);
    redraw();
  }, [pointerPosition, redraw, updateCoverage]);

  const handlePointerUp = useCallback(() => {
    activePointRef.current = null;
    if (!solvedRef.current && coverage < minCoverage) {
      setWarning('继续沿着浅色路径描一描，尽量覆盖更多位置。');
    }
  }, [coverage, minCoverage]);

  const handleReset = useCallback(() => {
    segmentsRef.current = [];
    coveredRef.current = new Set();
    activePointRef.current = null;
    attemptsRef.current += 1;
    solvedRef.current = false;
    setAttempts(attemptsRef.current);
    setCoverage(0);
    setWarning(null);
    redraw();
  }, [redraw]);

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-on-surface">{target.label}</p>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1 rounded-full bg-surface-container px-3 py-1.5 text-xs font-medium text-on-surface-variant"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          重来
        </button>
      </div>

      <div className="relative mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-2xl border border-outline-variant/30 bg-white">
        <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} className="absolute inset-0 h-full w-full" />
        <canvas
          ref={overlayRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          className="absolute inset-0 h-full w-full touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      </div>

      {solvedRef.current ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-primary-container/20 px-4 py-3 text-sm font-semibold text-primary">
          <CheckCircle className="h-4 w-4" />
          描摹完成
        </div>
      ) : (
        <div className="space-y-3">
          <div className="h-2 overflow-hidden rounded-full bg-surface-container-highest">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round(coverage * 100)}%` }} />
          </div>
          {warning && <p className="text-xs text-on-surface-variant">{warning}</p>}
          <div className="flex items-center justify-between text-xs text-on-surface-variant">
            <span>覆盖率 {Math.round(coverage * 100)}%</span>
            <span>尝试次数: {attempts}</span>
          </div>
          <Button className="w-full" onClick={() => {
            solvedRef.current = true;
            const score = Math.max(70, Math.min(100, Math.round(coverage * 100 - (attemptsRef.current - 1) * 4)));
            onSolved({ coverage, attempts: attemptsRef.current, score });
          }}>
            <CheckCircle className="mr-2 h-4 w-4" />
            写好了，进入下一项
          </Button>
          <Button variant="secondary" className="w-full" onClick={handleReset}>
            再描一次
          </Button>
        </div>
      )}
    </Card>
  );
}
