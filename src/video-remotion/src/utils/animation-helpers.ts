import { interpolate } from "remotion";

/**
 * Calculate staggered entrance frame for the N-th item.
 */
export function staggerDelay(
  index: number,
  baseDelay: number,
  perItemDelay: number,
): number {
  return baseDelay + index * perItemDelay;
}

/**
 * Cubic ease-in-out curve (0→1).
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Clamp a frame value to a safe range.
 */
export function clampFrame(frame: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, frame));
}

/**
 * Gentle pulsing scale for holding attention.
 * Returns a scale multiplier oscillating around `base`.
 */
export function pulseScale(
  frame: number,
  fps: number,
  frequency = 2,
  amplitude = 0.06,
  base = 1,
): number {
  const t = frame / fps;
  return base + Math.sin(t * frequency * Math.PI * 2) * amplitude;
}

/**
 * Returns how many characters should be visible for a typewriter effect.
 */
export function typewriterProgress(
  frame: number,
  totalChars: number,
  startFrame: number,
  framesPerChar: number,
): number {
  if (frame < startFrame) return 0;
  const elapsed = frame - startFrame;
  return Math.min(totalChars, Math.floor(elapsed / framesPerChar));
}

/**
 * Calculate grid position for items.
 * Single row for count <= 5, two rows for count > 5.
 */
export function getGridPosition(
  index: number,
  total: number,
  centerX: number,
  startY: number,
): { x: number; y: number; size: number } {
  const itemSize = total <= 5 ? 90 : 72;
  const gap = total <= 5 ? 20 : 16;

  if (total <= 5) {
    const totalWidth = total * itemSize + (total - 1) * gap;
    const startX = centerX - totalWidth / 2 + itemSize / 2;
    return { x: startX + index * (itemSize + gap), y: startY, size: itemSize };
  }

  const firstRow = Math.ceil(total / 2);
  const secondRow = total - firstRow;
  const row = index < firstRow ? 0 : 1;
  const col = row === 0 ? index : index - firstRow;
  const rowCount = row === 0 ? firstRow : secondRow;

  const rowWidth = rowCount * itemSize + (rowCount - 1) * gap;
  const startX = centerX - rowWidth / 2 + itemSize / 2;
  const rowY = startY + row * (itemSize + gap + 8);

  return { x: startX + col * (itemSize + gap), y: rowY, size: itemSize };
}

/**
 * Convert a progress value (0-1) to a parabolic arc Y offset.
 * Useful for hopping/bouncing animations.
 */
export function hopArc(
  progress: number,
  maxHeight: number,
): number {
  return -4 * maxHeight * progress * (progress - 1);
}

/**
 * Remotion-interpolate wrapper that maps frame range to 0-1 progress.
 */
export function frameToProgress(
  frame: number,
  startFrame: number,
  endFrame: number,
): number {
  return interpolate(frame, [startFrame, endFrame], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/**
 * Map an emoji name to an actual emoji character.
 */
const EMOJI_MAP: Record<string, string> = {
  apple: "🍎",
  star: "⭐",
  ball: "⚽",
  heart: "❤️",
  flower: "🌸",
  cat: "🐱",
  dog: "🐶",
  bird: "🐦",
  fish: "🐟",
  sun: "☀️",
  moon: "🌙",
  rain: "🌧️",
  cloud: "☁️",
  tree: "🌳",
  seed: "🌰",
  sprout: "🌱",
  leaf: "🍃",
  snow: "❄️",
  happy: "😊",
  sad: "😢",
  angry: "😠",
  surprised: "😲",
  boy: "👦",
  girl: "👧",
  teacher: "👩‍🏫",
};

export function resolveEmoji(name: string, fallback = "⭐"): string {
  const normalized = name.trim().toLowerCase();
  if (EMOJI_MAP[normalized]) return EMOJI_MAP[normalized];
  // If it's already an emoji (contains non-ASCII), return as-is
  if (/[^\x00-\x7F]/.test(name)) return name;
  return fallback;
}
