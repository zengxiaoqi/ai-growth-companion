/**
 * React wrapper for p5.js in instance mode.
 * Creates and manages a p5 sketch lifecycle within a React component tree.
 */
import { useEffect, useRef } from 'react';
import type p5 from 'p5';

export interface P5CanvasProps {
  sketch: (p: p5, params: Record<string, unknown>) => void;
  params: Record<string, unknown>;
  isPlaying: boolean;
  onDurationTick?: (elapsed: number) => void;
  onSceneComplete?: () => void;
  className?: string;
}

export default function P5Canvas({
  sketch,
  params,
  isPlaying,
  onDurationTick,
  onSceneComplete,
  className,
}: P5CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const p5Ref = useRef<p5 | null>(null);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const durationRef = useRef<number>((params.durationSec as number) || 10);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    const initP5 = async () => {
      const p5Module = await import('p5');
      const P5Constructor = p5Module.default;

      if (cancelled || !containerRef.current) return;

      const instance = new P5Constructor((p: p5) => {
        sketch(p, params);
      }, containerRef.current);

      p5Ref.current = instance;
    };

    initP5();

    return () => {
      cancelled = true;
      if (p5Ref.current) {
        p5Ref.current.remove();
        p5Ref.current = null;
      }
    };
    // Only re-create on sketch/params change, not on playing state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sketch, JSON.stringify(params)]);

  // Handle play/pause via p5 loop control
  useEffect(() => {
    const p = p5Ref.current;
    if (!p) return;

    if (isPlaying) {
      p.loop();
      startTimeRef.current = Date.now();
      const duration = durationRef.current * 1000;

      const tick = () => {
        if (!p5Ref.current) return;
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        onDurationTick?.(elapsed);
        if (elapsed * 1000 >= duration) {
          onSceneComplete?.();
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } else {
      p.noLoop();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, onDurationTick, onSceneComplete]);

  return <div ref={containerRef} className={className} />;
}
