/**
 * Animation template engine types.
 * Defines the contract between LLM output, backend validation, and frontend rendering.
 */

export type AnimationEngine = 'p5' | 'three';
export type AgeGroup = '3-4' | '5-6' | 'all';

export interface AnimationParamDef {
  name: string;
  type: 'string' | 'number' | 'color' | 'string[]' | 'number[]' | 'boolean';
  required: boolean;
  defaultValue: unknown;
  label: string; // Chinese label for LLM prompt
}

export interface AnimationTemplateDef {
  id: string;
  domain: string;
  subcategory: string;
  engine: AnimationEngine;
  ageGroups: AgeGroup[];
  params: AnimationParamDef[];
  defaultDurationSec: number;
  description: string; // Chinese description for LLM context
}

/** Per-scene config embedded in lesson data */
export interface AnimationSceneConfig {
  templateId: string;
  params: Record<string, unknown>;
  narration: string;
  onScreenText?: string;
  durationSec: number;
}

/** Callbacks from renderer to player */
export interface AnimationCallbacks {
  onDurationTick: (elapsed: number) => void;
  onSceneComplete: () => void;
}

/** Playback state */
export type PlaybackState = 'loading' | 'ready' | 'playing' | 'paused' | 'done';

export interface PlaybackControls {
  play: () => void;
  pause: () => void;
  seek: (progress: number) => void;
}
