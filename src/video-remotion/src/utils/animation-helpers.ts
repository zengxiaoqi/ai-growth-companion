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

// ---------------------------------------------------------------------------
// SVG Item Descriptors — used by StorySceneScene for SVG-based rendering
// ---------------------------------------------------------------------------

export type SvgItemShape =
  | "tree"
  | "house"
  | "flower"
  | "book"
  | "sun"
  | "moon"
  | "cloud"
  | "star"
  | "bird"
  | "fish"
  | "cat"
  | "dog"
  | "mountain"
  | "river"
  | "circle"
  | "rect"
  | "generic";

export type SvgItemDescriptor = {
  shape: SvgItemShape;
  primaryColor: string;
  secondaryColor: string;
  label: string;
};

const SVG_ITEM_MAP: Record<string, SvgItemDescriptor> = {
  tree: { shape: "tree", primaryColor: "#388E3C", secondaryColor: "#5D4037", label: "树" },
  flower: { shape: "flower", primaryColor: "#E91E63", secondaryColor: "#4CAF50", label: "花" },
  house: { shape: "house", primaryColor: "#FF8A65", secondaryColor: "#5D4037", label: "房子" },
  book: { shape: "book", primaryColor: "#42A5F5", secondaryColor: "#1A237E", label: "书" },
  sun: { shape: "sun", primaryColor: "#FFD54F", secondaryColor: "#FF8F00", label: "太阳" },
  moon: { shape: "moon", primaryColor: "#FFF9C4", secondaryColor: "#F9A825", label: "月亮" },
  cloud: { shape: "cloud", primaryColor: "#ECEFF1", secondaryColor: "#B0BEC5", label: "云" },
  star: { shape: "star", primaryColor: "#FFD54F", secondaryColor: "#FFC107", label: "星星" },
  bird: { shape: "bird", primaryColor: "#78909C", secondaryColor: "#546E7A", label: "鸟" },
  fish: { shape: "fish", primaryColor: "#26C6DA", secondaryColor: "#00838F", label: "鱼" },
  cat: { shape: "cat", primaryColor: "#FF8A65", secondaryColor: "#BF360C", label: "猫" },
  dog: { shape: "dog", primaryColor: "#A1887F", secondaryColor: "#4E342E", label: "狗" },
  mountain: { shape: "mountain", primaryColor: "#78909C", secondaryColor: "#546E7A", label: "山" },
  river: { shape: "river", primaryColor: "#42A5F5", secondaryColor: "#1565C0", label: "河" },
  apple: { shape: "circle", primaryColor: "#E53935", secondaryColor: "#C62828", label: "苹果" },
  ball: { shape: "circle", primaryColor: "#FDD835", secondaryColor: "#F9A825", label: "球" },
  heart: { shape: "circle", primaryColor: "#E91E63", secondaryColor: "#AD1457", label: "爱心" },
  seed: { shape: "circle", primaryColor: "#8D6E63", secondaryColor: "#4E342E", label: "种子" },
  sprout: { shape: "flower", primaryColor: "#66BB6A", secondaryColor: "#2E7D32", label: "嫩芽" },
  leaf: { shape: "flower", primaryColor: "#4CAF50", secondaryColor: "#1B5E20", label: "树叶" },
  snow: { shape: "circle", primaryColor: "#E3F2FD", secondaryColor: "#90CAF9", label: "雪花" },
  rain: { shape: "circle", primaryColor: "#42A5F5", secondaryColor: "#1565C0", label: "雨" },
  boy: { shape: "circle", primaryColor: "#42A5F5", secondaryColor: "#1565C0", label: "男孩" },
  girl: { shape: "circle", primaryColor: "#EC407A", secondaryColor: "#AD1457", label: "女孩" },
  teacher: { shape: "circle", primaryColor: "#AB47BC", secondaryColor: "#6A1B9A", label: "老师" },
  happy: { shape: "circle", primaryColor: "#FFEE58", secondaryColor: "#F9A825", label: "开心" },
  sad: { shape: "circle", primaryColor: "#42A5F5", secondaryColor: "#1565C0", label: "伤心" },
  angry: { shape: "circle", primaryColor: "#E53935", secondaryColor: "#B71C1C", label: "生气" },
  surprised: { shape: "circle", primaryColor: "#FFB74D", secondaryColor: "#E65100", label: "惊讶" },
};

/**
 * Resolve an item name to an SVG descriptor (shape, colors, label).
 * Falls back to a generic colored circle with the name as label.
 */
export function resolveSvgItem(name: string): SvgItemDescriptor {
  const normalized = name.trim().toLowerCase();
  if (SVG_ITEM_MAP[normalized]) return SVG_ITEM_MAP[normalized];
  // If the name is an emoji, return generic
  if (/[^\x00-\x7F]/.test(name)) {
    return { shape: "generic", primaryColor: "#B0BEC5", secondaryColor: "#78909C", label: "" };
  }
  return { shape: "generic", primaryColor: "#B0BEC5", secondaryColor: "#78909C", label: name };
}
