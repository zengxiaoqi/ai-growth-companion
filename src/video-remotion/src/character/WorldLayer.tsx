/**
 * 场地渲染（WorldLayer）：**只负责"每一层怎么画"，不管"这个场地有什么"**。
 *
 * 场地内容全在 `venue-recipes.ts`（数据），装饰细节全在 `venue-assets.tsx`
 * （组件）。这里是一台很笨的放映机：按配方给的顺序，逐层调对应分支画出来。
 *
 * 为什么这么分——加一处场地、加一件装饰都不该改这个文件。以前这里既有"层"
 * 又有"具体场地"（摩天轮只在 playground），于是每加一处场地都要改 4 个文件，
 * 而且没有任何东西会提醒你"漏了一层"。
 *
 * 与上一版背景的区别仍然成立，而且现在由配方结构保证：
 *  - `sky` 是屏幕空间（云不跟着镜头跑，那是"天"）；
 *  - 其余全部是世界坐标，跟角色同一把尺（camera 的 ppu / originX）；
 *  - 所以镜头一变焦，树、滑梯、熊一起变大；角色走过去，树不会"贴着他平移"。
 *
 * 绘制顺序 = 配方 `layers` 的顺序 = 遮挡关系。`decor` 允许出现多次，
 * 因为"摩天轮在围栏之前、树在围栏之后"这件事没法在一个 decor 层里表达。
 */

import React from 'react';
import { LADDER, SLIDE, ladderRungYs, slideDeckAngle } from './setpiece';
import { slideLadderTop, worldLadderX, type WorldCamera, type WorldView } from './world';
import { DECOR_RENDERERS } from './venue-assets';
import {
  venueRecipe,
  type DecorLayer,
  type FenceLayer,
  type GroundLayer,
  type HorizonLayer,
  type LayerSpec,
  type SkyLayer,
  type VenueTheme,
  type WaterLayer,
} from './venue-recipes';

/** 滑梯配色与三维 SlideRig 同一组：切换渲染器时道具不能"换了个颜色" */
const SLIDE_DECK = '#ffb347';
const SLIDE_RAIL = '#ff8f4d';
const SLIDE_POST = '#cf9a63';

type RenderCtx = {
  frame: number;
  theme: VenueTheme;
  world: WorldView;
  px: (x: number) => number;
  py: (y: number) => number;
  u: (n: number) => number;
};

/* ------------------------------------------------------------------ *
 * 六个稳定分支。**以后不会再长**：新场地是数据，新装饰是资产组件。
 * ------------------------------------------------------------------ */

function renderLayer(layer: LayerSpec, ctx: RenderCtx): React.ReactNode {
  switch (layer.kind) {
    case 'sky':
      return renderSky(layer, ctx);
    case 'horizon':
      return renderHorizon(layer, ctx);
    case 'ground':
      return renderGround(layer, ctx);
    case 'water':
      return renderWater(layer, ctx);
    case 'fence':
      return renderFence(layer, ctx);
    case 'decor':
      return renderDecor(layer, ctx);
    default:
      return null;
  }
}

/**
 * 天空：屏幕空间，永不随平移移动——它们是"天"，不属于地面世界。
 *
 * `fill: 'solid'` 是室内用的：没有太阳云，这一层就是一块纯色背景。
 * 所以它叫 sky 只是一种历史命名，实际语义是"背景层"。
 */
function renderSky(layer: SkyLayer, { frame, theme }: RenderCtx) {
  const drift = Math.sin(frame / 220) * 18;
  const sun = layer.sun;
  return (
    <>
      <rect
        x={0}
        y={0}
        width={1920}
        height={1080}
        fill={layer.fill === 'solid' ? theme.skyTop : 'url(#world-sky)'}
      />
      {sun ? (
        <>
          <circle cx={sun.x + drift * 0.3} cy={sun.y} r={sun.glowR} fill="url(#world-sun-glow)" />
          <circle cx={sun.x + drift * 0.3} cy={sun.y} r={sun.r} fill={theme.sun} />
        </>
      ) : null}
      {(layer.clouds ?? []).map((c, i) => (
        <g key={`cloud-${i}`} transform={`translate(${c.x + drift * (0.6 + i * 0.2)} ${c.y}) scale(${c.s})`}>
          <ellipse cx={0} cy={0} rx={96} ry={44} fill={theme.cloud} opacity={0.92} />
          <ellipse cx={78} cy={10} rx={70} ry={34} fill={theme.cloud} opacity={0.92} />
          <ellipse cx={-72} cy={14} rx={58} ry={28} fill={theme.cloud} opacity={0.92} />
        </g>
      ))}
    </>
  );
}

/** 远山：世界坐标，落在同一个地平线上。用大圆挖出弧顶 */
function renderHorizon(layer: HorizonLayer, { theme, px, py, u }: RenderCtx) {
  return (
    <>
      {layer.hills.map((h, i) => (
        <circle
          key={`hill-${i}`}
          cx={px(h.x)}
          cy={py(0) + u(h.r) * 0.86}
          r={u(h.r)}
          fill={h.tone === 'far' ? theme.hillFar : theme.hillNear}
          opacity={0.75}
        />
      ))}
    </>
  );
}

/**
 * 地面：从地平线铺到底。上沿一条浅色边，把"地面"和"空气"分开。
 *
 * 层内顺序有意义：铺面 → 滑梯脚下的沙地椭圆 → 草簇。草簇贴在地上、沙地压在地面
 * 上，顺序反了草就"浮在沙上"。
 */
function renderGround(layer: GroundLayer, { frame, theme, world, px, py, u }: RenderCtx) {
  const slide = world.slide;
  const sway = Math.sin(frame / 46) * u(0.02);
  return (
    <>
      <rect x={0} y={py(0)} width={1920} height={1080 - py(0)} fill={theme.ground} />
      {layer.topBand > 0 ? (
        <rect x={0} y={py(0)} width={1920} height={u(layer.topBand)} fill={theme.groundTop} />
      ) : null}
      {(layer.patches ?? []).map((patch, i) => {
        if (patch.asset === 'dirtPatch') {
          // 沙地属于滑梯，不属于场地：没有滑梯就没人踩出这块地
          if (!slide) return null;
          return (
            <ellipse
              key={`patch-${i}`}
              cx={px((slide.start[0] + slide.end[0]) / 2)}
              cy={py(0)}
              rx={u(patch.rx)}
              ry={u(patch.ry)}
              fill={theme.path}
              opacity={patch.opacity}
            />
          );
        }
        // 草簇：确定性地按索引摆，重渲逐像素一致
        return (
          <React.Fragment key={`tuft-${i}`}>
            {Array.from({ length: patch.count }).map((_, j) => {
              const x = patch.from + j * patch.step;
              const h = 0.12 + ((j * 7) % 5) * 0.02;
              return (
                <path
                  key={`tuft-${i}-${j}`}
                  d={`M ${px(x)} ${py(0)} q ${u(0.04) + sway * 0.2} ${-u(h) * 0.6} ${u(0.02)} ${-u(h)}`}
                  stroke={theme.leafDark}
                  strokeWidth={Math.max(1.5, u(0.014))}
                  fill="none"
                  opacity={0.35}
                  strokeLinecap="round"
                />
              );
            })}
          </React.Fragment>
        );
      })}
    </>
  );
}

/**
 * 水面：世界坐标的一条水带。
 *
 * 这是**新的渲染原语**，不是新场地：今后"湖""水池""海边"都复用它，只改
 * `from/to/surfaceY/depth`。这正是"原语可枚举、内容不可枚举"的收益。
 */
function renderWater(layer: WaterLayer, { theme, px, py, u }: RenderCtx) {
  const fill = theme.water ?? theme.hillNear;
  return (
    <>
      <rect
        x={px(layer.from)}
        y={py(layer.surfaceY)}
        width={u(layer.to - layer.from)}
        height={u(layer.depth)}
        fill={fill}
        opacity={layer.opacity ?? 0.85}
      />
      {/* 水面上沿一道亮边：没有它，水带和草地只是两块颜色不同的矩形 */}
      <rect
        x={px(layer.from)}
        y={py(layer.surfaceY)}
        width={u(layer.to - layer.from)}
        height={Math.max(1.5, u(0.03))}
        fill={theme.cloud}
        opacity={0.55}
      />
    </>
  );
}

/**
 * 围栏：**按场地给**。它是游乐园/牧场的语汇，森林里画一条横贯全画面的
 * 木栅栏就变成了"一个有围栏的空地"。
 */
function renderFence(layer: FenceLayer, { theme, px, py, u }: RenderCtx) {
  return (
    <g opacity={0.9}>
      {Array.from({ length: layer.posts }).map((_, i) => {
        const x = layer.from + i * layer.spacing;
        return (
          <rect
            key={`fence-post-${i}`}
            x={px(x) - u(layer.postWidth / 2)}
            y={py(layer.postHeight)}
            width={u(layer.postWidth)}
            height={u(layer.postHeight)}
            rx={u(0.03)}
            fill={theme.wood}
          />
        );
      })}
      {layer.railYs.map((y) => (
        <rect
          key={`fence-rail-${y}`}
          x={px(layer.from)}
          y={py(y)}
          width={u(layer.railSpan)}
          height={u(layer.railHeight)}
          fill={theme.woodDark}
          opacity={0.85}
        />
      ))}
    </g>
  );
}

/** 装饰：数组顺序即绘制顺序，资产自己知道怎么画 */
function renderDecor(layer: DecorLayer, { frame, theme, px, py, u }: RenderCtx) {
  return (
    <>
      {layer.items.map((item, i) => {
        const Asset = DECOR_RENDERERS[item.asset];
        if (!Asset) return null;
        return (
          <Asset key={`${item.asset}-${i}`} item={item} theme={theme} frame={frame} px={px} py={py} u={u} />
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * 世界层
 * ------------------------------------------------------------------ */

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
  const recipe = venueRecipe(world.venue);
  const theme = recipe.theme;
  const { ppu, originX, groundY } = camera;
  /** 世界 → 屏幕 */
  const px = (x: number) => originX + x * ppu;
  const py = (y: number) => groundY - y * ppu;
  const u = (n: number) => n * ppu;

  const slide = withSlide ? world.slide : undefined;
  const ladderX = slide ? worldLadderX(world) : null;

  const ctx: RenderCtx = { frame, theme, world, px, py, u };

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

        {recipe.layers.map((layer, i) => (
          <React.Fragment key={i}>{renderLayer(layer, ctx)}</React.Fragment>
        ))}

        {/* 滑梯：平台 + 立柱 + 滑道 + 爬梯，一个整体。它是装置槽，不进入配方 */}
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
 * 滑梯（装置槽）
 * ------------------------------------------------------------------ */

type Proj = {
  px: (x: number) => number;
  py: (y: number) => number;
  u: (n: number) => number;
};

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
