/**
 * 场地装饰资产。
 *
 * 每个资产是一个**纯绘制组件**：给世界坐标、配色、帧号，画自己。它们不知道
 * "这是哪个场地"，也不知道自己排第几——那属于配方（`venue-recipes.ts`）。
 *
 * 为什么要单独一个文件：加一件装饰只应该改这里（写组件 + 注册一行）和配方
 * （摆位置），**不该打开 `WorldLayer.tsx`**。渲染器只认 `DECOR_RENDERERS`
 * 这张表，所以"加资产"和"加场地"是两条互不干扰的路。
 *
 * 所有动画都由 `frame` 推，不用 `Math.random` / `Date.now`：同一帧重渲必须
 * 逐像素一致，这是 Remotion 的硬要求。
 */

import React from 'react';
import type { DecorItem, VenueTheme } from './venue-recipes';

export type AssetProj = {
  px: (x: number) => number;
  py: (y: number) => number;
  u: (n: number) => number;
};

export type AssetProps = AssetProj & {
  item: DecorItem;
  theme: VenueTheme;
  frame: number;
};

export type DecorRenderer = React.FC<AssetProps>;

/** 统一的"被风吹"位移。树与灌木共用，才有"同一阵风"的感觉 */
export const swayOf = (frame: number, u: (n: number) => number) => Math.sin(frame / 46) * u(0.02);

/**
 * 摩天轮尺寸。写在世界单位里而不是像素里：半径 2.2 个世界单位 ≈ 4 米，
 * 与滑梯（平台 2.6）是同一处公园的量级。换成像素写死的话，镜头一变焦它就
 * 和滑梯对不上，又回到"贴图背景"。
 */
export const WHEEL = { radius: 2.2, centerY: 1.35 } as const;

const Tree: DecorRenderer = ({ item, theme, frame, px, py, u }) => {
  const x = item.x;
  const sway = swayOf(frame, u);
  return (
    <g>
      <rect x={px(x) - u(0.075)} y={py(1.45)} width={u(0.15)} height={u(1.45)} rx={u(0.05)} fill={theme.woodDark} />
      <circle cx={px(x) - u(0.42) + sway} cy={py(1.9)} r={u(0.56)} fill={theme.leaf} />
      <circle cx={px(x) + u(0.44) + sway} cy={py(1.98)} r={u(0.5)} fill={theme.leaf} />
      <circle cx={px(x) + sway} cy={py(2.32)} r={u(0.62)} fill={theme.leaf} />
      <circle cx={px(x) - u(0.16) + sway} cy={py(2.16)} r={u(0.4)} fill={theme.leafDark} opacity={0.55} />
    </g>
  );
};

/**
 * 灌木：没有围栏的场地（森林、夜）用它填两侧。
 * 尺寸比树小一档、贴地，作用是"视线尽头不是一块空草地"。
 */
const Bush: DecorRenderer = ({ item, theme, frame, px, py, u }) => {
  const x = item.x;
  const sway = swayOf(frame, u);
  return (
    <g>
      <ellipse cx={px(x) - u(0.22) + sway} cy={py(0.2)} rx={u(0.32)} ry={u(0.24)} fill={theme.leafDark} />
      <ellipse cx={px(x) + u(0.24) + sway} cy={py(0.18)} rx={u(0.3)} ry={u(0.22)} fill={theme.leaf} />
      <ellipse cx={px(x) + sway} cy={py(0.26)} rx={u(0.34)} ry={u(0.26)} fill={theme.leaf} />
    </g>
  );
};

const Bench: DecorRenderer = ({ item, theme, px, py, u }) => {
  const x = item.x;
  return (
    <g>
      {/* 靠背 */}
      <rect x={px(x) - u(0.8)} y={py(0.86)} width={u(1.6)} height={u(0.12)} rx={u(0.05)} fill={theme.wood} />
      <rect x={px(x) - u(0.8)} y={py(0.72)} width={u(1.6)} height={u(0.1)} rx={u(0.04)} fill={theme.wood} />
      {/* 座面 */}
      <rect x={px(x) - u(0.84)} y={py(0.46)} width={u(1.68)} height={u(0.1)} rx={u(0.04)} fill={theme.woodDark} />
      {/* 腿 */}
      {[-0.66, 0.66].map((dx) => (
        <rect key={dx} x={px(x) + u(dx) - u(0.05)} y={py(0.46)} width={u(0.1)} height={u(0.46)} fill={theme.woodDark} />
      ))}
    </g>
  );
};

const Sandbox: DecorRenderer = ({ item, theme, px, py, u }) => {
  const x = item.x;
  return (
    <g>
      <rect x={px(x) - u(0.85)} y={py(0.3)} width={u(1.7)} height={u(0.3)} rx={u(0.06)} fill={theme.wood} />
      <rect x={px(x) - u(0.74)} y={py(0.3)} width={u(1.48)} height={u(0.22)} fill={theme.path} opacity={0.9} />
      {/* 小桶与铲子：告诉孩子"这里可以玩沙"，比一块空沙子更可读 */}
      <path
        d={`M ${px(x) + u(0.12)} ${py(0.28)} l ${u(0.16)} 0 l ${-u(0.02)} ${u(0.2)} l ${-u(0.12)} 0 Z`}
        fill="#ef5f58"
      />
      <line
        x1={px(x) - u(0.2)}
        y1={py(0.28)}
        x2={px(x) - u(0.34)}
        y2={py(0.5)}
        stroke="#5b8ba6"
        strokeWidth={u(0.035)}
        strokeLinecap="round"
      />
    </g>
  );
};

/**
 * 摩天轮：读作"公园的另一头"，不是前景道具。
 * 轮子转得很慢，但它是确定性的（frame 推）。透明度由配方给（0.42），
 * 压暗之后它才不会抢角色的注意力。
 */
const Wheel: DecorRenderer = ({ item, theme, px, py, u, frame }) => {
  const spin = (frame / 360) * Math.PI * 2;
  const cx = px(item.x);
  const cy = py(WHEEL.centerY);
  return (
    <g opacity={item.opacity ?? 1}>
      <circle cx={cx} cy={cy} r={u(WHEEL.radius)} fill="none" stroke={theme.metal} strokeWidth={u(0.07)} />
      <circle cx={cx} cy={cy} r={u(WHEEL.radius * 0.78)} fill="none" stroke={theme.metal} strokeWidth={u(0.03)} opacity={0.7} />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = spin + (Math.PI * 2 * i) / 8;
        const sx = cx + Math.cos(a) * u(WHEEL.radius);
        const sy = cy + Math.sin(a) * u(WHEEL.radius);
        return (
          <g key={`spoke-${i}`}>
            <line x1={cx} y1={cy} x2={sx} y2={sy} stroke={theme.metal} strokeWidth={u(0.025)} opacity={0.7} />
            <rect x={sx - u(0.12)} y={sy - u(0.1)} width={u(0.24)} height={u(0.2)} rx={u(0.06)} fill={theme.metal} opacity={0.85} />
          </g>
        );
      })}
      {/* 支架：两根斜柱落地，轮子才不会悬空 */}
      <line x1={cx - u(0.9)} y1={py(0)} x2={cx} y2={cy} stroke={theme.metal} strokeWidth={u(0.06)} />
      <line x1={cx + u(0.9)} y1={py(0)} x2={cx} y2={cy} stroke={theme.metal} strokeWidth={u(0.06)} />
    </g>
  );
};

/**
 * 资产注册表。**加资产 = 在这里加一行**，加场地不用碰它，反之亦然。
 * 测试会断言"这张表覆盖 DECOR_ASSET_IDS"，漏注册会红。
 */
export const DECOR_RENDERERS: Record<string, DecorRenderer> = {
  tree: Tree,
  bush: Bush,
  bench: Bench,
  sandbox: Sandbox,
  wheel: Wheel,
};
