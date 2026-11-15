/**
 * 受控画板的数据契约（PoC 版）。
 *
 * 设计目标：让 LLM 能把"这个知识长什么样"直接表达成几何，同时保证
 * 它物理上不可能破坏版式 —— 坐标有界、图元白名单、数量有上限、
 * 不许画文字（文字由模板统一渲染，字体才一致、才读得出）。
 *
 * 坐标系就是 SVG 的 viewBox 用户单位，不是 0..100 归一化。
 * 原因：viewBox 内部坐标空间是等比的，circle 画出来就是正圆；
 * 一旦用 0..100 × 0..100 再拉伸到 2.86:1 的画布，所有圆都会变成椭圆。
 */

export const FIGURE_WIDTH = 1600;
export const FIGURE_HEIGHT = 640;

/** 图元白名单。没有 transform / filter / 外部引用 / text。 */
export type FigureShape =
  | {
      kind: 'arc';
      cx: number;
      cy: number;
      r: number;
      /** 起始角，单位度。0° 在右，逆时针为正（数学约定，y 向上） */
      from: number;
      /** 结束角，单位度。沿逆时针从 from 走到 to */
      to: number;
      stroke: string;
      width: number;
    }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; width: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; rx: number; fill: string; stroke?: string; strokeWidth?: number }
  | { kind: 'circle'; cx: number; cy: number; r: number; fill: string; stroke?: string; strokeWidth?: number }
  | {
      kind: 'curve';
      x1: number;
      y1: number;
      c1x: number;
      c1y: number;
      c2x: number;
      c2y: number;
      x2: number;
      y2: number;
      stroke: string;
      width: number;
    }
  | { kind: 'polygon'; points: string; fill: string; stroke?: string; strokeWidth?: number };

export type FigureGlyph = FigureShape & {
  /** 0..1，按这个先后顺序出现；同一数值同时出现 */
  reveal: number;
};

export type FigureLabel = {
  /** ≤ 6 字，字号与字体由模板锁定 */
  text: string;
  x: number;
  y: number;
  /** 可选：颜色，缺省用主题色 */
  color?: string;
};

export type FigureSpec = {
  shapes: FigureGlyph[];
  labels?: FigureLabel[];
};

export const isFigureSpec = (input: unknown): input is FigureSpec => {
  if (!input || typeof input !== 'object') return false;
  const value = input as Record<string, unknown>;
  if (!Array.isArray(value.shapes) || value.shapes.length === 0) return false;
  return true;
};
