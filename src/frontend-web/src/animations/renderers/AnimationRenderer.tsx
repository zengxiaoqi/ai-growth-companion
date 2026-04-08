/**
 * AnimationRenderer: routes templateId to the correct engine renderer.
 * Falls back to a simple text display if template is not found.
 */
import { lazy, Suspense } from 'react';
import type { AnimationSceneConfig, AnimationCallbacks } from '../types';
import { getTemplate } from '../registry';

const P5Canvas = lazy(() => import('./P5Canvas'));
const ThreeCanvas = lazy(() => import('./ThreeCanvas'));

interface AnimationRendererProps {
  config: AnimationSceneConfig;
  isPlaying: boolean;
  onSceneComplete?: () => void;
}

import type p5Module from 'p5';

// Map template IDs to their sketch/setup functions
const p5Sketches: Record<string, (p: p5Module, params: Record<string, unknown>) => void> = {};
const threeScenes: Record<string, import('./ThreeCanvas').ThreeSceneSetup> = {};

export function registerP5Sketch(templateId: string, sketch: (p: p5Module, params: Record<string, unknown>) => void) {
  p5Sketches[templateId] = sketch;
}

export function registerThreeScene(templateId: string, setup: import('./ThreeCanvas').ThreeSceneSetup) {
  threeScenes[templateId] = setup;
}

function LoadingFallback() {
  return (
    <div className="flex h-48 items-center justify-center bg-surface-container-low rounded-xl">
      <span className="text-sm text-on-surface-variant">加载动画引擎...</span>
    </div>
  );
}

export default function AnimationRenderer({ config, isPlaying, onSceneComplete }: AnimationRendererProps) {
  const template = getTemplate(config.templateId);

  if (!template) {
    return (
      <div className="flex h-48 items-center justify-center bg-surface-container-low rounded-xl p-4">
        <p className="text-sm text-on-surface-variant text-center">
          {config.onScreenText || config.narration || '动画加载中...'}
        </p>
      </div>
    );
  }

  const callbacks: AnimationCallbacks = {
    onDurationTick: () => {},
    onSceneComplete: onSceneComplete || (() => {}),
  };

  if (template.engine === 'p5') {
    const sketch = p5Sketches[config.templateId];
    if (!sketch) return <LoadingFallback />;

    return (
      <Suspense fallback={<LoadingFallback />}>
        <P5Canvas
          sketch={sketch}
          params={config.params}
          isPlaying={isPlaying}
          onDurationTick={callbacks.onDurationTick}
          onSceneComplete={callbacks.onSceneComplete}
          className="w-full rounded-xl overflow-hidden [&_canvas]:w-full! [&_canvas]:h-auto!"
        />
      </Suspense>
    );
  }

  if (template.engine === 'three') {
    const setupScene = threeScenes[config.templateId];
    if (!setupScene) return <LoadingFallback />;

    return (
      <Suspense fallback={<LoadingFallback />}>
        <ThreeCanvas
          setupScene={setupScene}
          params={config.params}
          isPlaying={isPlaying}
          onDurationTick={callbacks.onDurationTick}
          onSceneComplete={callbacks.onSceneComplete}
          className="w-full rounded-xl overflow-hidden"
        />
      </Suspense>
    );
  }

  return <LoadingFallback />;
}
