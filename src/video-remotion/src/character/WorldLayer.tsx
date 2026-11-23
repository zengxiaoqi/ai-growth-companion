/**
 * 场地渲染（WorldLayer）
 *
 * 这是"同一处公园"的可见部分：天空、远山、草地、围栏、树、长椅、沙坑、
 * 远处的摩天轮，以及**作为一整个结构的滑梯**（平台 + 立柱 + 滑道 + 爬梯）。
 *
 * 与上一版背景的区别不是"画得更多"，而是**坐标系统一**：
 *  - 所有东西都在世界坐标里，跟着同一个 camera 的 ppu 与 originX 投影；
 *  - 所以镜头一变焦，树、滑梯、熊一起变大；角色走过去，树不会"贴着他平移"；
 *  - 滑梯在每一幕都在同一个位置——爬梯子的那一幕，梯子后面就是平台和滑道，
 *    因为梯子本来就是滑梯的一部分，不是这一幕临时摆出来的道具。
 *
 * 上一版把这些画在屏幕像素上（背景一张屏保、梯子一段独立 SVG），于是
 * "梯子"和"熊"从来没有共处过同一个空间，比例自然对不上。
 */

import React from 'react';
import { LADDER, SLIDE, ladderRungYs, slideDeckAngle } from './setpiece';
import {
  VENUE_THEMES,
  WHEEL,
  slideLadderTop,
  venueDecor,
  worldLadderX,
  type VenueTheme,
  type WorldCamera,
  type WorldView,
} from './world';

/** 滑梯配色与三维 SlideRig 同一组：切换渲染器时道具不能"换了个颜色" */
const SLIDE_DECK = '#ffb347';
const SLIDE_RAIL = '#ff8f4d';
const SLIDE_POST = '#cf9a63';


export const WorldLayer: React.FC<{
  world: WorldView;
  camera: WorldCamera;
  frame: number;
  /**
   * 是否由这里画滑梯。三维舞台自己用 mesh 画滑梯（要参与光影与遮挡），
   * 这时只画背景，否则会出现两座滑梯叠在一起。
   */
  withSlide?: boolean;
}> = ({ world, camera, frame, withSlide = true }) => {
  const theme = VENUE_THEMES[world.venue];
  const { ppu, originX, groundY } = camera;
  /** 世界 → 屏幕 */
  const px = (x: number) => originX + x * ppu;
  const py = (y: number) => groundY - y * ppu;
  const u = (n: number) => n * ppu;

  // 缓慢的确定性动画：云飘、轮子转、草摇。都用 frame 推，不用随机/时钟。
  const drift = Math.sin(frame / 220) * 18;
  const wheelSpin = (frame / 360) * Math.PI * 2;
  const sway = Math.sin(frame / 46) * u(0.02);

  const slide = withSlide ? world.slide : undefined;
  const ladderX = slide ? worldLadderX(world) : null;
  const decor = venueDecor(world);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id="world-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.skyTop} />
            <stop offset="100%" stopColor={theme.skyBottom} />
          </linearGradient>
          <radialGradient id="world-sun-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor={theme.sun} stopOpacity="0.55" />
            <stop offset="100%" stopColor={theme.sun} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* 天空与太阳：屏幕空间，永不随平移移动——它们是"天"，不属于地面世界 */}
        <rect x={0} y={0} width={1920} height={1080} fill="url(#world-sky)" />
        <circle cx={1560 + drift * 0.3} cy={230} r={210} fill="url(#world-sun-glow)" />
        <circle cx={1560 + drift * 0.3} cy={230} r={78} fill={theme.sun} />

        {/* 云：屏幕空间，轻微漂移。画在世界里会被镜头平移拉成"追着跑" */}
        {[
          { x: 320, y: 200, s: 1 },
          { x: 980, y: 150, s: 0.75 },
          { x: 1420, y: 300, s: 0.55 },
        ].map((c, i) => (
          <g key={`cloud-${i}`} transform={`translate(${c.x + drift * (0.6 + i * 0.2)} ${c.y}) scale(${c.s})`}>
            <ellipse cx={0} cy={0} rx={96} ry={44} fill={theme.cloud} opacity={0.92} />
            <ellipse cx={78} cy={10} rx={70} ry={34} fill={theme.cloud} opacity={0.92} />
            <ellipse cx={-72} cy={14} rx={58} ry={28} fill={theme.cloud} opacity={0.92} />
          </g>
        ))}

        {/* 远山：世界坐标，落在同一个地平线上。用大圆挖出弧顶 */}
        {[
          { x: -1.5, r: 6.2, color: theme.hillFar },
          { x: 6.5, r: 5.4, color: theme.hillFar },
          { x: 2.4, r: 4.4, color: theme.hillNear },
        ].map((h, i) => (
          <circle
            key={`hill-${i}`}
            cx={px(h.x)}
            cy={py(0) + u(h.r) * 0.86}
            r={u(h.r)}
            fill={h.color}
            opacity={0.75}
          />
        ))}

        {/* 地面：从地平线铺到底。上沿一条浅色草边，把"地面"和"空气"分开 */}
        <rect x={0} y={py(0)} width={1920} height={1080 - py(0)} fill={theme.ground} />
        <rect x={0} y={py(0)} width={1920} height={u(0.055)} fill={theme.groundTop} />

        {/* 滑梯脚下的土地：给这组装置一个"被踩出来的地面"，不然它会像贴上去的 */}
        {slide ? (
          <ellipse
            cx={px((slide.start[0] + slide.end[0]) / 2)}
            cy={py(0)}
            rx={u(2.9)}
            ry={u(0.3)}
            fill={theme.path}
            opacity={0.55}
          />
        ) : null}

        {/* 草簇：确定性地按索引摆，重渲逐像素一致 */}
        {Array.from({ length: 34 }).map((_, i) => {
          const x = -3.4 + i * 0.42;
          const h = 0.12 + ((i * 7) % 5) * 0.02;
          return (
            <path
              key={`tuft-${i}`}
              d={`M ${px(x)} ${py(0)} q ${u(0.04) + sway * 0.2} ${-u(h) * 0.6} ${u(0.02)} ${-u(h)}`}
              stroke={theme.leafDark}
              strokeWidth={Math.max(1.5, u(0.014))}
              fill="none"
              opacity={0.35}
              strokeLinecap="round"
            />
          );
        })}

        {/* 摩天轮：画在滑梯正后方，低透明度压暗——读作"公园的另一头"，
            而不是前景道具。轮子转得很慢，但它是确定性的（frame 推）。
            注意它画在**围栏之前**：围栏要挡住轮子的底座，否则两根斜撑会
            横在草地上像脚手架，把"远景"读成"前景障碍物"。 */}
        {decor
          .filter((d) => d.kind === 'wheel')
          .map((d) => (
            <g key="wheel" opacity={0.42}>
              <circle cx={px(d.x)} cy={py(WHEEL.centerY)} r={u(WHEEL.radius)} fill="none" stroke={theme.metal} strokeWidth={u(0.07)} />
              <circle cx={px(d.x)} cy={py(WHEEL.centerY)} r={u(WHEEL.radius * 0.78)} fill="none" stroke={theme.metal} strokeWidth={u(0.03)} opacity={0.7} />
              {Array.from({ length: 8 }).map((_, i) => {
                const a = wheelSpin + (Math.PI * 2 * i) / 8;
                const cx = px(d.x) + Math.cos(a) * u(WHEEL.radius);
                const cy = py(WHEEL.centerY) + Math.sin(a) * u(WHEEL.radius);
                return (
                  <g key={`spoke-${i}`}>
                    <line
                      x1={px(d.x)}
                      y1={py(WHEEL.centerY)}
                      x2={cx}
                      y2={cy}
                      stroke={theme.metal}
                      strokeWidth={u(0.025)}
                      opacity={0.7}
                    />
                    <rect
                      x={cx - u(0.12)}
                      y={cy - u(0.1)}
                      width={u(0.24)}
                      height={u(0.2)}
                      rx={u(0.06)}
                      fill={theme.metal}
                      opacity={0.85}
                    />
                  </g>
                );
              })}
              {/* 支架：两根斜柱落地，轮子才不会悬空 */}
              <line x1={px(d.x) - u(0.9)} y1={py(0)} x2={px(d.x)} y2={py(WHEEL.centerY)} stroke={theme.metal} strokeWidth={u(0.06)} />
              <line x1={px(d.x) + u(0.9)} y1={py(0)} x2={px(d.x)} y2={py(WHEEL.centerY)} stroke={theme.metal} strokeWidth={u(0.06)} />
            </g>
          ))}

        {/* 围栏：一直在那儿，任何镜头都能看到"这是公园的边界" */}
        <g opacity={0.9}>
          {Array.from({ length: 34 }).map((_, i) => {
            const x = -9 + i * 0.62;
            return (
              <rect
                key={`fence-post-${i}`}
                x={px(x) - u(0.045)}
                y={py(0.58)}
                width={u(0.09)}
                height={u(0.58)}
                rx={u(0.03)}
                fill={theme.wood}
              />
            );
          })}
          {[0.24, 0.46].map((y) => (
            <rect
              key={`fence-rail-${y}`}
              x={px(-9)}
              y={py(y)}
              width={u(20)}
              height={u(0.07)}
              fill={theme.woodDark}
              opacity={0.85}
            />
          ))}
        </g>

        {decor
          .filter((d) => d.kind === 'tree')
          .map((d) => (
            <Tree key={`tree-${d.x}`} x={d.x} px={px} py={py} u={u} theme={theme} sway={sway} />
          ))}

        {decor
          .filter((d) => d.kind === 'bench')
          .map((d) => (
            <Bench key={`bench-${d.x}`} x={d.x} px={px} py={py} u={u} theme={theme} />
          ))}

        {decor
          .filter((d) => d.kind === 'sandbox')
          .map((d) => (
            <Sandbox key={`sandbox-${d.x}`} x={d.x} px={px} py={py} u={u} theme={theme} />
          ))}

        {/* 滑梯：平台 + 立柱 + 滑道 + 爬梯，一个整体 */}
        {slide ? (
          <Slide2D
            start={slide.start}
            end={slide.end}
            px={px}
            py={py}
            u={u}
            ladderX={ladderX ?? slide.start[0]}
            ladderTop={slideLadderTop(slide)}
          />
        ) : null}
      </svg>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * 装置
 * ------------------------------------------------------------------ */

type Proj = {
  px: (x: number) => number;
  py: (y: number) => number;
  u: (n: number) => number;
};

const Tree: React.FC<Proj & { x: number; theme: VenueTheme; sway: number }> = ({ x, px, py, u, theme, sway }) => (
  <g>
    <rect x={px(x) - u(0.075)} y={py(1.45)} width={u(0.15)} height={u(1.45)} rx={u(0.05)} fill={theme.woodDark} />
    <circle cx={px(x) - u(0.42) + sway} cy={py(1.9)} r={u(0.56)} fill={theme.leaf} />
    <circle cx={px(x) + u(0.44) + sway} cy={py(1.98)} r={u(0.5)} fill={theme.leaf} />
    <circle cx={px(x) + sway} cy={py(2.32)} r={u(0.62)} fill={theme.leaf} />
    <circle cx={px(x) - u(0.16) + sway} cy={py(2.16)} r={u(0.4)} fill={theme.leafDark} opacity={0.55} />
  </g>
);

const Bench: React.FC<Proj & { x: number; theme: VenueTheme }> = ({ x, px, py, u, theme }) => (
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

const Sandbox: React.FC<Proj & { x: number; theme: VenueTheme }> = ({ x, px, py, u, theme }) => (
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

/**
 * 滑梯（二维侧视）。
 *
 * 所有数字来自 setpiece：平台宽度、护边高度、立柱位置、爬梯间距。
 * 这里不做"看起来差不多"的近似——三维 SlideRig 用的是同一组常量，
 * 所以同一节课里 2D 幕与 3D 幕的滑梯是同一个滑梯。
 */
const Slide2D: React.FC<Proj & {
  start: readonly [number, number, number];
  end: readonly [number, number, number];
  ladderX: number;
  ladderTop: number;
}> = ({ start, end, px, py, u, ladderX, ladderTop }) => {
  const angle = slideDeckAngle(start, end);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const half = SLIDE.deckThickness / 2;
  // 滑道四角：沿法线（-sin, cos）上下各偏移半个厚度
  const quad = [
    [start[0] - sin * half, start[1] + cos * half],
    [start[0] + sin * half, start[1] - cos * half],
    [end[0] + sin * half, end[1] - cos * half],
    [end[0] - sin * half, end[1] + cos * half],
  ];
  const deckPath = quad
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${px(x)} ${py(y)}`)
    .join(' ') + ' Z';

  const platformX = start[0] - cos * SLIDE.platformInset;
  const railOffsetY = SLIDE.railLift + SLIDE.railHeight / 2;

  return (
    <g>
      {/* 平台立柱：从地面到平台面 */}
      {[start[0] - cos * SLIDE.topPostInset, end[0] - SLIDE.endPostInset].map((x, i) => {
        const top = i === 0 ? start[1] : end[1];
        return (
          <rect
            key={`post-${i}`}
            x={px(x) - u(SLIDE.topPostRadius)}
            y={py(top)}
            width={u(SLIDE.topPostRadius * 2)}
            height={u(top)}
            fill={SLIDE_POST}
          />
        );
      })}

      {/* 平台 */}
      <rect
        x={px(platformX - SLIDE.platformWidth / 2)}
        y={py(start[1] + SLIDE.platformThickness)}
        width={u(SLIDE.platformWidth)}
        height={u(SLIDE.platformThickness)}
        rx={u(0.03)}
        fill={SLIDE_DECK}
      />

      {/* 滑道 + 两侧护边（侧视只看得见朝镜头这一侧，所以画一条粗线） */}
      <path d={deckPath} fill={SLIDE_DECK} />
      <line
        x1={px(start[0])}
        y1={py(start[1] + railOffsetY)}
        x2={px(end[0])}
        y2={py(end[1] + railOffsetY)}
        stroke={SLIDE_RAIL}
        strokeWidth={u(SLIDE.railHeight)}
        strokeLinecap="round"
      />

      {/* 爬梯：两根立杆 + 横档，间距 = CLIMB.step（与攀爬动作同源） */}
      <rect x={px(ladderX - LADDER.railHalf) - u(LADDER.railWidth / 2)} y={py(ladderTop)} width={u(LADDER.railWidth)} height={u(ladderTop)} fill={SLIDE_POST} />
      <rect x={px(ladderX + LADDER.railHalf) - u(LADDER.railWidth / 2)} y={py(ladderTop)} width={u(LADDER.railWidth)} height={u(ladderTop)} fill={SLIDE_POST} />
      {ladderRungYs(ladderTop).map((y, i) => (
        <line
          key={`rung-${i}`}
          x1={px(ladderX - LADDER.railHalf)}
          y1={py(y)}
          x2={px(ladderX + LADDER.railHalf)}
          y2={py(y)}
          stroke={SLIDE_POST}
          strokeWidth={u(LADDER.railWidth * 0.8)}
          strokeLinecap="round"
        />
      ))}
    </g>
  );
};
