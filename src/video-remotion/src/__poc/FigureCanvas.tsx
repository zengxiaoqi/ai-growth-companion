import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { FIGURE_HEIGHT, FIGURE_WIDTH, FigureGlyph, FigureSpec, FigureShape } from './figure-spec';

/** 数学角 → 屏幕坐标点（y 轴翻转） */
const pointAt = (cx: number, cy: number, r: number, deg: number) => {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
};

/** 沿逆时针（角度增大）从 from 画到 to 的圆弧路径 */
const arcPath = (s: Extract<FigureShape, { kind: 'arc' }>) => {
  // 允许 from > to（顺时针），统一成"角度增大"的方向
  let from = s.from;
  let to = s.to;
  // 数学角增大 = 屏幕上逆时针，对应 SVG sweep-flag 0。
  // 这里写反过一次：from<to 给了 sweep=1，于是 ∩ 被画成了 ∪ —— 弧顶跑到画面外，
  // 看着像"彩虹埋在地里"。弧的方向只能靠实拍，不能靠脑补。
  let sweep = 0;
  if (to < from) {
    [from, to] = [to, from];
    sweep = 1;
  }
  const start = pointAt(s.cx, s.cy, s.r, from);
  const end = pointAt(s.cx, s.cy, s.r, to);
  const largeArc = to - from > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${s.r} ${s.r} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`;
};

const arcLength = (s: Extract<FigureShape, { kind: 'arc' }>) =>
  s.r * Math.abs(s.to - s.from) * (Math.PI / 180);

/** 贝塞尔弧长没有解析解，用起/中/终三点折线近似足够驱动描边生长 */
const curveLength = (s: Extract<FigureShape, { kind: 'curve' }>) => {
  const midX = (s.x1 + 3 * s.c1x + 3 * s.c2x + s.x2) / 8;
  const midY = (s.y1 + 3 * s.c1y + 3 * s.c2y + s.y2) / 8;
  const legA = Math.hypot(midX - s.x1, midY - s.y1);
  const legB = Math.hypot(s.x2 - midX, s.y2 - midY);
  return (legA + legB) * 1.04;
};

const curvePath = (s: Extract<FigureShape, { kind: 'curve' }>) =>
  `M ${s.x1} ${s.y1} C ${s.c1x} ${s.c1y} ${s.c2x} ${s.c2y} ${s.x2} ${s.y2}`;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * 把一份 FigureSpec 画成画面。
 *
 * 这里刻意不做"怎么画好看"的判断 —— 那是 LLM 交上来的几何本身的质量。
 * 这一层只负责三件事：坐标有界、图元白名单、按 reveal 顺序生长。
 */
export const FigureCanvas: React.FC<{
  spec: FigureSpec;
  duration: number;
  accent: string;
}> = ({ spec, duration, accent }) => {
  const frame = useCurrentFrame();
  useVideoConfig();

  // 扣掉入场和收尾，剩下的就是"讲到哪儿了"，与字幕同一条时间轴
  const progress = clamp01((frame - 10) / Math.max(20, duration - 22));

  const maxReveal = Math.max(0.0001, ...spec.shapes.map((s) => s.reveal));
  // 最后一个图元也要留够生长窗口，所以可用区间只到 0.84
  const revealAt = (reveal: number) => (reveal / maxReveal) * 0.84;
  const shapeProgress = (reveal: number) => clamp01((progress - revealAt(reveal)) / 0.16);

  const renderShape = (shape: FigureShape, p: number, key: string) => {
    if (p <= 0) return null;

    if (shape.kind === 'arc') {
      const len = arcLength(shape);
      return (
        <path
          key={key}
          d={arcPath(shape)}
          fill="none"
          stroke={shape.stroke}
          strokeWidth={shape.width}
          strokeLinecap="round"
          strokeDasharray={len}
          strokeDashoffset={len * (1 - p)}
        />
      );
    }

    if (shape.kind === 'line') {
      const len = Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1);
      return (
        <line
          key={key}
          x1={shape.x1}
          y1={shape.y1}
          x2={shape.x2}
          y2={shape.y2}
          stroke={shape.stroke}
          strokeWidth={shape.width}
          strokeLinecap="round"
          strokeDasharray={len}
          strokeDashoffset={len * (1 - p)}
        />
      );
    }

    if (shape.kind === 'curve') {
      const len = curveLength(shape);
      return (
        <path
          key={key}
          d={curvePath(shape)}
          fill="none"
          stroke={shape.stroke}
          strokeWidth={shape.width}
          strokeLinecap="round"
          strokeDasharray={len}
          strokeDashoffset={len * (1 - p)}
        />
      );
    }

    if (shape.kind === 'circle') {
      // 圆从中心长出来，比淡入更像"画上去的"
      const grow = 0.45 + p * 0.55;
      return (
        <circle
          key={key}
          cx={shape.cx}
          cy={shape.cy}
          r={shape.r * grow}
          fill={shape.fill}
          opacity={Math.min(1, p * 2.2)}
        />
      );
    }

    if (shape.kind === 'rect') {
      const grow = 0.86 + p * 0.14;
      return (
        <rect
          key={key}
          x={shape.x + (shape.w * (1 - grow)) / 2}
          y={shape.y + (shape.h * (1 - grow)) / 2}
          width={shape.w * grow}
          height={shape.h * grow}
          rx={shape.rx}
          fill={shape.fill}
          opacity={Math.min(1, p * 2)}
        />
      );
    }

    return (
      <polygon key={key} points={shape.points} fill={shape.fill} opacity={Math.min(1, p * 2)} />
    );
  };

  return (
    <svg
      width={FIGURE_WIDTH}
      height={FIGURE_HEIGHT}
      viewBox={`0 0 ${FIGURE_WIDTH} ${FIGURE_HEIGHT}`}
      style={{ overflow: 'visible' }}
    >
      {spec.shapes.map((glyph: FigureGlyph, i) =>
        renderShape(glyph, shapeProgress(glyph.reveal), 's' + i),
      )}
      {(spec.labels || []).map((label, i) => {
        const p = clamp01((progress - 0.55) / 0.2);
        if (p <= 0) return null;
        return (
          <text
            key={'l' + i}
            x={label.x}
            y={label.y + (1 - p) * 14}
            textAnchor="middle"
            fontSize={34}
            fontWeight={900}
            fill={label.color || accent}
            opacity={p}
          >
            {label.text}
          </text>
        );
      })}
    </svg>
  );
};
