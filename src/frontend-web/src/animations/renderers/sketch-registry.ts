/**
 * Sketch registry for p5.js and Three.js scene setups.
 * Separated from AnimationRenderer.tsx to avoid TDZ circular dependency:
 *   AnimationRenderer imports register-all-templates
 *   → templates call registerP5Sketch/registerThreeScene
 *   → which needs p5Sketches/threeScenes Maps (TDZ if in same file)
 */
import type p5Module from 'p5';

export const p5Sketches: Record<string, (p: p5Module, params: Record<string, unknown>) => void> = {};
export const threeScenes: Record<string, import('./ThreeCanvas').ThreeSceneSetup> = {};

export function registerP5Sketch(templateId: string, sketch: (p: p5Module, params: Record<string, unknown>) => void) {
  p5Sketches[templateId] = sketch;
}

export function registerThreeScene(templateId: string, setup: import('./ThreeCanvas').ThreeSceneSetup) {
  threeScenes[templateId] = setup;
}
