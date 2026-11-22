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
 * 这里的职责边界很窄：**只回答几何问题**（多高、横档多密、接触面在哪）。
 * 不画东西、不读 frame、不做插值——渲染器各自把数字翻译成 SVG 或 mesh。
 *
 * 坐标系与 pose.ts 一致：y 向上、地面 y=0、单位是"角色高度"的归一化世界单位。
 */

import { SPEC, SLIDE_SEAT_LIFT } from './pose';

/* ------------------------------------------------------------------ *
 * 梯子（2D climb 的布景；3D 滑梯自带的爬梯也从这里取参数）
 * ------------------------------------------------------------------ */

export const LADDER = {
  /**
   * 两根立杆到中心的距离。2D 是正面视角，杆要分得开才看得出是梯子（0.46）；
   * 3D 滑梯的爬梯在侧面，透视下 0.46 会宽得不像话，所以另给 sideRailHalf。
   */
  railHalf: 0.46,
  sideRailHalf: 0.28,
  /** 首根横档离地：脚底 -0.64、髋部 0.66 时，最下面那根正好在脚下方 0.06 */
  rungStart: 0.04,
  /** 横档再密就成了实心板，手脚也放不进去 */
  minRungSpacing: 0.12,
  /** 立杆顶端高出"最后一次举手"的距离：没有这段，爬到顶就没有可抓的了 */
  topHeadroom: 1.25,
  /** 立杆粗细（世界单位），2D 按缩放乘 */
  railWidth: 0.058,
  rungWidthRatio: 0.78,
  /** 3D 侧视爬梯：5 根横档、杆径 0.05、横档长 0.56 */
  sideRungs: 5,
  sideRungStart: 0.28,
  sidePostRadius: 0.05,
  sideRungRadius: 0.04,
  sideRungLength: 0.56,
} as const;

/**
 * 梯子顶端的世界高度。
 *
 * 注意这里是"布景高度"，不是"角色到达高度"——两者差 1.25，正是这个差
 * 把梯子顶送进了标题带（角色 1.5 + 头顶 1.01 = 2.51 没事，梯子 2.75 撞上）。
 */
export function ladderTopY(climbEndY: number): number {
  return climbEndY + LADDER.topHeadroom;
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
 * "必须完整可见"的世界高度
 *
 * 取景唯一需要的一个数。算错它的后果不是"画面丑一点"，而是主体被标题盖住
 * 或角色被裁掉半截，所以这里逐项写清楚来源，不留魔法数字。
 * ------------------------------------------------------------------ */

/** 角色头顶到髋部的高度（含造型缩放） */
export function actorHeadTop(rootY: number, scale: number): number {
  return rootY + (SPEC.headY + SPEC.headR) * scale;
}

/** 滑梯幕：平台上的坐姿角色比结构本身还高，两者取大 */
export function slideWorldHeight(
  start: readonly [number, number, number],
  end: readonly [number, number, number],
  scale: number,
): number {
  const seated = actorHeadTop(start[1] + SLIDE_SEAT_LIFT, scale);
  // 站起身的终点也不能出画（虽然比平台低，但换参数时不受假设保护）
  const standing = actorHeadTop(Math.max(end[1], SPEC.standHipY), scale);
  return Math.max(slideTopY(start[1]), seated, standing);
}
