export const SPRING_CONFIGS = {
  bouncy: { damping: 8 },
  snappy: { damping: 20, stiffness: 200 },
  smooth: { damping: 200 },
  gentle: { damping: 15, stiffness: 80, mass: 2 },
} as const;

export const FPS = 30;
export const INTRO_DURATION = 90; // 3s
export const OUTRO_DURATION = 90; // 3s
export const NUMBER_SCENE_DURATION = 210; // 7s
export const TRANSITION_DURATION = 12;
