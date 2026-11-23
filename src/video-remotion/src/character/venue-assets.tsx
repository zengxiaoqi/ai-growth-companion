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

/**
 * 树。
 *
 * `params.scale` 是世界单位里的等比缩放（0.7 = 一棵小一号的树），不是像素。
 *
 * 为什么非要有这个旋钮：整棵树高 2.94 个世界单位 ≈ 1.76 个角色高，而 wide 景别
 * 能看见的世界半宽只有 3.35（见 `worldScale`）。森林要在一个人身边读出"这是林子"，
 * 只能靠大小错落——两棵大树 + 几棵小树；六棵一样大的树挤在 ±3.3 里就成了绿墙，
 * 而且越靠近画面边缘越像柱子。
 */
const Tree: DecorRenderer = ({ item, theme, frame, px, py, u }) => {
  const x = item.x;
  const s = Number(item.params?.scale ?? 1);
  const sway = swayOf(frame, u);
  return (
    <g>
      <rect
        x={px(x) - u(0.075 * s)}
        y={py(1.45 * s)}
        width={u(0.15 * s)}
        height={u(1.45 * s)}
        rx={u(0.05 * s)}
        fill={theme.woodDark}
      />
      <circle cx={px(x) - u(0.42 * s) + sway} cy={py(1.9 * s)} r={u(0.56 * s)} fill={theme.leaf} />
      <circle cx={px(x) + u(0.44 * s) + sway} cy={py(1.98 * s)} r={u(0.5 * s)} fill={theme.leaf} />
      <circle cx={px(x) + sway} cy={py(2.32 * s)} r={u(0.62 * s)} fill={theme.leaf} />
      <circle cx={px(x) - u(0.16 * s) + sway} cy={py(2.16 * s)} r={u(0.4 * s)} fill={theme.leafDark} opacity={0.55} />
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

/* ------------------------------------------------------------------ *
 * 室内资产
 *
 * 它们与树、长椅是同一类东西：拿到世界坐标、配色、帧号就画自己。室内没有
 * 新的渲染原语，只是换了资产——这正是"原语可枚举、内容不可枚举"的意思。
 * ------------------------------------------------------------------ */

/**
 * 墙：横向铺满 + 指定高度。
 *
 * 参数走 `params`（`from/to/height`），因为"墙有多宽"不是它自己的属性，
 * 是配方的构图决定。分缝每 2.4 个世界单位一条，让整面墙不是一整块色块。
 */
const Wall: DecorRenderer = ({ item, theme, px, py, u }) => {
  const from = Number(item.params?.from ?? -12);
  const to = Number(item.params?.to ?? 12);
  const height = Number(item.params?.height ?? 3);
  const seams = Math.max(1, Math.round((to - from) / 2.4));
  return (
    <g>
      <rect x={px(from)} y={py(height)} width={u(to - from)} height={u(height)} fill={theme.hillFar} />
      {Array.from({ length: seams }).map((_, i) => (
        <line
          key={`seam-${i}`}
          x1={px(from + i * 2.4)}
          y1={py(height)}
          x2={px(from + i * 2.4)}
          y2={py(0)}
          stroke={theme.woodDark}
          strokeWidth={Math.max(1, u(0.012))}
          opacity={0.16}
        />
      ))}
      {/* 吊顶线：没有它，墙顶和画面顶会连成一片，房间没有"高度" */}
      <rect x={px(from)} y={py(height)} width={u(to - from)} height={u(0.1)} fill={theme.wood} opacity={0.55} />
    </g>
  );
};

/** 课桌：桌面 0.66（≈1.1 米）——比角色膝盖略高，孩子才像"站在桌边" */
const Desk: DecorRenderer = ({ item, theme, px, py, u }) => {
  const x = item.x;
  return (
    <g>
      <rect x={px(x) - u(0.62)} y={py(0.66)} width={u(1.24)} height={u(0.07)} rx={u(0.02)} fill={theme.wood} />
      {[-0.52, 0.52].map((dx) => (
        <rect
          key={dx}
          x={px(x) + u(dx) - u(0.035)}
          y={py(0.66)}
          width={u(0.07)}
          height={u(0.66)}
          fill={theme.woodDark}
        />
      ))}
      {/* 侧挂的书包格 */}
      <rect x={px(x) + u(0.16)} y={py(0.52)} width={u(0.36)} height={u(0.22)} rx={u(0.02)} fill={theme.woodDark} opacity={0.85} />
    </g>
  );
};

/** 落地灯：灯杆 + 灯罩 + 一圈很淡的光晕（不发光就只是一根棍子） */
const Lamp: DecorRenderer = ({ item, theme, px, py, u }) => {
  const x = item.x;
  const height = Number(item.params?.height ?? 2);
  return (
    <g>
      <circle cx={px(x)} cy={py(height - 0.1)} r={u(0.55)} fill={theme.sun} opacity={0.18} />
      <rect x={px(x) - u(0.025)} y={py(height)} width={u(0.05)} height={u(height)} fill={theme.metal} />
      <rect x={px(x) - u(0.22)} y={py(0.04)} width={u(0.44)} height={u(0.04)} rx={u(0.02)} fill={theme.metal} />
      <path
        d={`M ${px(x) - u(0.26)} ${py(height)} L ${px(x) + u(0.26)} ${py(height)} L ${px(x) + u(0.16)} ${py(height - 0.22)} L ${px(x) - u(0.16)} ${py(height - 0.22)} Z`}
        fill={theme.wood}
      />
    </g>
  );
};

/** 书架：三层隔板 + 一排书脊。书脊颜色从配色里取，跟着场地色调走 */
const Shelf: DecorRenderer = ({ item, theme, px, py, u }) => {
  const x = item.x;
  const boards = [1.12, 0.72, 0.32];
  const spines = [theme.leaf, theme.hillNear, theme.metal, theme.path];
  return (
    <g>
      <rect x={px(x) - u(0.62)} y={py(1.22)} width={u(1.24)} height={u(1.22)} fill={theme.woodDark} opacity={0.32} />
      {boards.map((y) => (
        <rect
          key={`board-${y}`}
          x={px(x) - u(0.66)}
          y={py(y)}
          width={u(1.32)}
          height={u(0.05)}
          rx={u(0.02)}
          fill={theme.wood}
        />
      ))}
      {[0.32, 0.72].flatMap((y, row) =>
        [0, 1, 2, 3].map((i) => (
          <rect
            key={`book-${row}-${i}`}
            x={px(x) - u(0.56) + u(i * 0.26)}
            y={py(y) - u(0.26)}
            width={u(0.18)}
            height={u(0.26)}
            rx={u(0.02)}
            fill={spines[(row * 4 + i) % 4]}
            opacity={0.85}
          />
        )),
      )}
    </g>
  );
};

/**
 * 窗：室内最强的识别符号。
 *
 * 玻璃用资产私有的浅蓝，不取场地配色——窗外的天不该跟着墙面变。
 * 窗框走 `theme.wood`，这样它和课桌、书架是同一套木头。
 */
const Window: DecorRenderer = ({ item, theme, px, py, u }) => {
  const x = item.x;
  const width = Number(item.params?.width ?? 1.6);
  const height = Number(item.params?.height ?? 1.4);
  const sill = Number(item.params?.sill ?? 0.9);
  const left = px(x) - u(width / 2);
  const top = py(sill + height);
  return (
    <g>
      <rect x={left} y={top} width={u(width)} height={u(height)} fill="#cfe8f5" />
      {/* 玻璃上的一道斜光，让"外面是白天"读得出来 */}
      <path
        d={`M ${left + u(width * 0.55)} ${top} L ${left + u(width)} ${top} L ${left + u(width)} ${top + u(height * 0.45)} Z`}
        fill="#ffffff"
        opacity={0.45}
      />
      <rect
        x={left}
        y={top}
        width={u(width)}
        height={u(height)}
        fill="none"
        stroke={theme.wood}
        strokeWidth={u(0.06)}
      />
      <line
        x1={px(x)}
        y1={top}
        x2={px(x)}
        y2={py(sill)}
        stroke={theme.wood}
        strokeWidth={u(0.045)}
      />
      <line
        x1={left}
        y1={py(sill + height / 2)}
        x2={left + u(width)}
        y2={py(sill + height / 2)}
        stroke={theme.wood}
        strokeWidth={u(0.045)}
      />
      <rect x={left - u(0.08)} y={py(sill)} width={u(width + 0.16)} height={u(0.07)} rx={u(0.02)} fill={theme.wood} />
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
  wall: Wall,
  window: Window,
  desk: Desk,
  lamp: Lamp,
  shelf: Shelf,
};
