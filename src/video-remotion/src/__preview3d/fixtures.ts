import type { ThreeStageScene } from "../three/ThreeActionStage";

/** 与 action3d-registry.ts 的 MOTION_DEFAULTS / ACTOR_RIGS 保持一致的两份样例 */
export const SLIDE_PREVIEW: ThreeStageScene = {
  motion: "slide",
  actorId: "bear",
  rig: { fur: "#a9744f", belly: "#f0d3b2", ears: "round", tail: "stub", scale: 1 },
  start: [-3.1, 2.7, 0],
  end: [2.9, 0.3, 0],
  durationFrames: 90,
  accent: "#4d96ff",
  label: "小熊",
};

export const DRIBBLE_PREVIEW: ThreeStageScene = {
  motion: "dribble",
  actorId: "bear",
  rig: { fur: "#a9744f", belly: "#f0d3b2", ears: "round", tail: "stub", scale: 1 },
  start: [0.9, 0.95, 0.35],
  end: [0.9, 0.95, 0.35],
  bounce: { periodFrames: 18, height: 0.62 },
  ballRestY: 0.27,
  durationFrames: 96,
  accent: "#4d96ff",
  label: "小熊",
};
