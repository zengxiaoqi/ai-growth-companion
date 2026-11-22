/**
 * 布景注册表（setpiece）：角色能接触的东西，几何只有一份
 *
 * 为什么要有这个文件：
 *
 *   - 二维的梯子写在 Puppet2D 里、三维的滑梯写在 ThreeActionStage 里，同一个
 *     "梯子"两处各有一套立杆间距、横档起点、顶端余量。改一处另一处不知道，
 *     于是"爬"和"滑"看起来像两个世界的规则。
 *   - 更直接的后果是取景：要保证"主体不越界"，渲染层必须知道"这一幕最高的
 *     东西有多高"。以前这个高度是各自估的（2D 写死 1.55 上限、3D 写死 z=8），
 *     估错的直接表现就是梯子顶进标题胶囊。
 *
 * 这里的职责边界很窄：**只回答几何问题**（多高、横档多密、接触面在哪、
 * 占世界上哪一块）。不画东西、不读 frame、不做插值——渲染器各自把数字翻译
 * 成 SVG 或 mesh。
 *
 * 两条规则，新增布景必须遵守（测试里有守卫）：
 *  1. **尺寸从 ACTOR 导出**，不写"看起来合适"的独立数字。梯子宽度来自攀爬
 *     握距，握距来自身宽——同一套数字既决定手摆在哪，也决定杆立在哪。
 *  2. **必须提供 bounds()**。取景只吃包围盒，漏报的布景会被裁掉或压在边上。
 *
 * 坐标系与 pose.ts 一致：y 向上、地面 y=0、单位是"角色高度"的归一化世界单位。
 */

import { ACTOR, CLIMB, SPEC, SLIDE_SEAT_LIFT } from './pose';
import type { Bounds } from './stage-layout';

/* ------------------------------------------------------------------ *
 * 梯子（2D climb 的布景；3D 滑梯自带的爬梯也从这里取参数）
 * ------------------------------------------------------------------ */

export const LADDER = {
  /**
   * 两根立杆到中心的距离。**由攀爬握距反推**，两个渲染器共用同一个宽度：
   * 以前 2D 用 0.46、3D 用 0.28，同一个梯子两种宽度，因为两组数字各自凭
   * 手感定；0.92 的世界宽度是角色身宽的 1.5 倍，画出来是一面格子墙。
   * 现在宽度 = 握距，手刚好落在立杆内侧，比例跟着角色走。
   */
  railHalf: ACTOR.gripWidth / 2,
  /** 首根横档离地：脚底 -0.64、髋部 0.66 时，最下面那根正好在脚下方 0.06 */
  rungStart: 0.04,
  /** 横档再密就成了实心板：两倍杆粗是下限，再小手脚塞不进去 */
  minRungSpacing: 0.058 * 2,
  /**
   * 立杆顶端高出"最后一次握杆"的距离：至少还要留两阶，否则爬到顶就没有
   * 可抓的了。由 CLIMB.gripY 导出，不再是一个孤立的 1.25。
   */
  topHeadroom: CLIMB.gripY + 2 * CLIMB.step,
  /** 立杆粗细（世界单位），2D 按缩放乘 */
  railWidth: 0.058,
  rungWidthRatio: 0.78,
  /** 3D 侧视爬梯：横档根数、杆径、横档长（= 两杆间距，同一把梯子） */
  sideRungs: 5,
  sideRungStart: 0.28,
  sidePostRadius: 0.05,
  sideRungRadius: 0.04,
  sideRungLength: ACTOR.gripWidth,
} as const;

/**
 * 梯子顶端的世界高度。
 *
 * 注意这里是"布景高度"，不是"角色到达高度"——两者差 topHeadroom，正是这个差
 * 把梯子顶送进了标题带（角色 1.5 + 头顶 1.01 = 2.51 没事，梯子 2.76 撞上）。
 */
export function ladderTopY(climbEndY: number): number {
  return climbEndY + LADDER.topHeadroom;
}

/** 梯子在某处立起来时占据的世界范围（含描边，round cap 多出半个线宽） */
export function ladderBounds(x: number, topY: number): Bounds {
  const half = LADDER.railHalf + LADDER.railWidth / 2;
  return {
    minX: x - half,
    maxX: x + half,
    minY: 0,
    maxY: topY + LADDER.railWidth / 2,
  };
}

/* ------------------------------------------------------------------ *
 * 滑梯（3D slide 的布景）
 * ------------------------------------------------------------------ */

export const SLIDE = {
  /** 滑面厚度 */
  deckThickness: 0.12,
  /** 滑面宽度（z 方向） */
  deckWidth: 1.4,
  /** 两侧护边 */
  railHalf: 0.72,
  railHeight: 0.18,
  railThickness: 0.1,
  railLift: 0.09,
  /** 顶端平台 */
  platformWidth: 1.6,
  platformThickness: 0.12,
  platformInset: 0.75,
  /** 顶端支柱：只留两根，四根会把左侧糊成栅栏 */
  topPostRadius: 0.08,
  topPostInset: 1.2,
  topPostHalfZ: 0.6,
  topPostFoot: 0.1,
  /** 支柱中心下移一点，柱底才不会悬空 */
  postLift: 0.06,
  /** 底端支柱：滑道末端离地 0.3，不撑起来就是一块悬空的板 */
  endPostRadius: 0.07,
  endPostInset: 0.3,
  endPostHalfZ: 0.5,
  endPostFoot: 0.06,
  /** 爬梯（挂在平台后侧） */
  ladderInset: 1.5,
  ladderFoot: 0.12,
} as const;

/**
 * 滑梯结构的最高点：平台面 + 护边。
 * 平台中心在 start[1] + platformThickness/2，护边再高出 railHeight。
 */
export function slideTopY(startY: number): number {
  return startY + SLIDE.platformThickness + SLIDE.railHeight;
}

/* ------------------------------------------------------------------ *
 * 内容包围盒
 *
 * 取景唯一需要的东西。算错的后果不是"画面丑一点"，而是主体被标题盖住、
 * 布景被切掉半截，所以这里逐项写清楚来源，不留魔法数字。
 *
 * 横向也必须算：滑梯从平台到落点横跨 7.7 个世界单位，只报高度的话取景
 * 会把两侧切掉——这正是"滑梯贴边"那次的根因。
 * ------------------------------------------------------------------ */

/** 角色头顶的时间点高度（髋部 + 头顶，含造型缩放） */
export function actorHeadTop(rootY: number, scale: number): number {
  return rootY + (SPEC.headY + SPEC.headR) * scale;
}

type Vec3 = readonly [number, number, number];

/**
 * 滑梯整组（滑面 + 护边 + 平台 + 支柱 + 爬梯 + 滑下来的人）占据的世界范围。
 *
 * 每一项都对应渲染器里真实画出来的 mesh，不是估算：护栏的 railLift、支柱
 * 从地面立起到平台、爬梯宽 = 两杆间距。少算一项，取景就会把它裁在边上。
 */
export function slideBounds(start: Vec3, end: Vec3, scale = 1): Bounds {
  const [sx, sy] = start;
  const [ex, ey] = end;
  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const cos = dx / len;
  const sin = dy / len;

  // 滑面是旋转过的盒子：轴向投影要带上厚度
  const midX = (sx + ex) / 2;
  const midY = (sy + ey) / 2;
  const halfX = (len / 2) * Math.abs(cos) + (SLIDE.deckThickness / 2) * Math.abs(sin);
  const halfY = (len / 2) * Math.abs(sin) + (SLIDE.deckThickness / 2) * Math.abs(cos);

  let minX = midX - halfX;
  let maxX = midX + halfX;
  let minY = 0;
  let maxY = Math.max(midY + halfY, slideTopY(sy));

  const addBox = (cx: number, cy: number, hx: number, hy: number) => {
    minX = Math.min(minX, cx - hx);
    maxX = Math.max(maxX, cx + hx);
    minY = Math.min(minY, cy - hy);
    maxY = Math.max(maxY, cy + hy);
  };

  // 两侧护边：抬高 railLift，自身还高 railHeight
  addBox(midX, midY + SLIDE.railLift, halfX, halfY + SLIDE.railHeight / 2);
  // 顶端平台
  addBox(
    sx - cos * SLIDE.platformInset,
    sy + SLIDE.platformThickness / 2,
    SLIDE.platformWidth / 2,
    SLIDE.platformThickness / 2,
  );
  // 顶端支柱：从地面立起到平台
  addBox(sx - cos * SLIDE.topPostInset, sy / 2, SLIDE.topPostRadius, sy / 2);
  // 底端支柱
  addBox(
    ex - SLIDE.endPostInset,
    ey / 2,
    SLIDE.endPostRadius,
    Math.max(0.12, ey - SLIDE.endPostFoot) / 2,
  );
  // 爬梯：横向半宽 = 横档长的一半（两杆正立在这两个位置）
  addBox(sx - cos * SLIDE.ladderInset, sy / 2, LADDER.sideRungLength / 2, sy / 2);

  // 平台上坐着的角色比结构还高；滑到底站起来还要往前迈一步
  const seated = actorHeadTop(sy + SLIDE_SEAT_LIFT, scale);
  const standing = actorHeadTop(Math.max(ey, SPEC.standHipY), scale);
  maxY = Math.max(maxY, seated, standing);
  const standX = ex + 0.8;
  maxX = Math.max(maxX, standX + (ACTOR.bodyWidth / 2) * scale);
  minX = Math.min(minX, standX - (ACTOR.bodyWidth / 2) * scale);

  return { minX, maxX, minY, maxY };
}

/** 滑梯幕：必须完整可见的世界高度（= 包围盒高度） */
export function slideWorldHeight(start: Vec3, end: Vec3, scale: number): number {
  return slideBounds(start, end, scale).maxY;
}
