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
  const isPlayingRef = useRef(isPlaying);
  const sceneCompleteFiredRef = useRef(false);

  // Keep ref in sync so the init callback reads the latest value
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Create p5 instance and immediately apply play/pause state
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

      // p5 starts with loop() by default. If we're not playing, pause it.
      if (!isPlayingRef.current) {
        instance.noLoop();
      } else {
        startPlayback(instance);
      }
    };

    initP5();

    return () => {
      cancelled = true;
      stopPlayback();
      if (p5Ref.current) {
        p5Ref.current.remove();
        p5Ref.current = null;
      }
    };
    // Only re-create on sketch/params change, not on playing state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sketch, JSON.stringify(params)]);

  // Handle play/pause changes after initial mount
  useEffect(() => {
    const p = p5Ref.current;
    if (!p) return;

    if (isPlaying) {
      startPlayback(p);
    } else {
      stopPlayback();
      p.noLoop();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  function startPlayback(p: p5) {
    p.loop();
    startTimeRef.current = Date.now();
    sceneCompleteFiredRef.current = false;
    const duration = durationRef.current * 1000;

    const tick = () => {
      if (!p5Ref.current || sceneCompleteFiredRef.current) return;
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      onDurationTick?.(elapsed);
      if (elapsed * 1000 >= duration) {
        sceneCompleteFiredRef.current = true;
        onSceneComplete?.();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function stopPlayback() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }

  return <div ref={containerRef} className={className} />;
}
