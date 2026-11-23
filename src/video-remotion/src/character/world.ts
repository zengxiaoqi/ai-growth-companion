/**
 * 场地层（world）：整节课共用的一个"地方"
 *
 * 为什么需要它——上一版每一幕都是一个独立的立体模型：
 *
 *   - 取景按"这一幕自己装得下"算缩放，于是滑梯幕的角色被推远、说话幕的角色
 *     被拉近，同一个角色在不同幕里忽大忽小；滑梯与小熊的比例也跟着幕变化。
 *   - 布景只在需要它的那一幕出现：爬梯子时画一把孤零零的梯子，梯子后面
 *     没有平台、没有滑道、没有公园——因为"梯子"是这一幕的道具，不是世界里的东西。
 *   - 背景是按 habitat 画的一张屏保（太阳、云、一排树），它不跟着镜头动，
 *     也不参与世界坐标，所以永远只是"贴在后面的图"。
 *
 * 这里的做法是把"世界"和"镜头"分开：
 *
 *   世界：一处场地 + 一组固定装置（滑梯含爬梯与平台、沙坑、长椅、围栏、树、
 *         远处的摩天轮）。位置是绝对的，整节课不变。
 *   镜头：**一个基准缩放 + 有限变焦 + 平移**。基准缩放由"整个世界里最高的
 *         装置"算出，整节课只算一次；变焦只允许 1.0~1.5 倍，所有世界物体
 *         一起缩放，所以任何一幕里"熊与滑梯的比例"都是同一个值。
 *
 * 这条分工是本次修复的核心：**比例一致性不是靠每幕拟合，而是靠世界只定义一次**。
 * 装不下时不再缩小世界（那会改变比例），而是选择更大的景别或让画面裁掉边缘——
 * 就像真实拍摄里镜头不会因为道具太高就把整个世界缩小。
 *
 * 坐标系与 pose.ts 一致：y 向上、地面 y=0、单位 = 角色身高（1.67）。
 */

import { ACTOR } from './pose';
import { slideBounds, slideLadderX } from './setpiece';
import {
  CAMERA_FOV,
  SAFE_X,
  STAGE,
  SUBJECT_BAND,
  boundsCenterX,
  unionAll,
  type Bounds,
  type Shot,
} from './stage-layout';

export type Tri3 = readonly [number, number, number];

/** 场地类型。决定的不是"讲什么"，而是"这是个什么地方"。 */
export type Venue = 'playground' | 'meadow' | 'riverside' | 'forest' | 'night';

export const VENUES: readonly Venue[] = ['playground', 'meadow', 'riverside', 'forest', 'night'];

/**
 * 世界里的一处滑梯：平台（start）到滑道末端（end）。
 *
 * 爬梯不单独存在——它挂在 platform 后方（见 setpiece.slideLadderX）。
 * 这就是"梯子必须和游乐园结合"的结构性回答：**梯子是滑梯的一部分**，
 * 谁画滑梯谁画梯子，位置由同一个函数给出，不可能分开。
 */
export type WorldSlide = { start: Tri3; end: Tri3 };

export type WorldView = {
  venue: Venue;
  /** 本节课里有滑梯（爬 / 滑 / 提到滑梯）时给出。整节课只定义一次。 */
  slide?: WorldSlide;
};

/* ------------------------------------------------------------------ *
 * 场地配色。装饰元素（树、围栏、长椅）共用一套，颜色随场地换。
 * ------------------------------------------------------------------ */

export type VenueTheme = {
  skyTop: string;
  skyBottom: string;
  sun: string;
  cloud: string;
  hillFar: string;
  hillNear: string;
  ground: string;
  groundTop: string;
  path: string;
  wood: string;
  woodDark: string;
  metal: string;
  leaf: string;
  leafDark: string;
};

export const VENUE_THEMES: Record<Venue, VenueTheme> = {
  playground: {
    skyTop: '#a9e4ff',
    skyBottom: '#e8f7ff',
    sun: '#ffd76a',
    cloud: '#ffffff',
    hillFar: '#b7e3c6',
    hillNear: '#96d6ae',
    ground: '#8ed47a',
    groundTop: '#a6df8e',
    path: '#e9d3a8',
    wood: '#c98a5a',
    woodDark: '#8d5524',
    metal: '#9fb3c8',
    leaf: '#57b96a',
    leafDark: '#3e8f52',
  },
  meadow: {
    skyTop: '#bfeaff',
    skyBottom: '#f0f9ff',
    sun: '#ffe08a',
    cloud: '#ffffff',
    hillFar: '#c6e8c9',
    hillNear: '#a4d9ab',
    ground: '#8ed47a',
    groundTop: '#a9e094',
    path: '#e6d2ac',
    wood: '#c08b5c',
    woodDark: '#8a5a2f',
    metal: '#a8b8c6',
    leaf: '#5bbb6c',
    leafDark: '#41904f',
  },
  riverside: {
    skyTop: '#a7e8ff',
    skyBottom: '#eaf9ff',
    sun: '#ffdf85',
    cloud: '#ffffff',
    hillFar: '#a9dcc2',
    hillNear: '#8ecfae',
    ground: '#7fc97a',
    groundTop: '#95d78c',
    path: '#d9c39b',
    wood: '#bb8a5e',
    woodDark: '#84562f',
    metal: '#9fb3c8',
    leaf: '#55b46a',
    leafDark: '#3d8a4e',
  },
  forest: {
    skyTop: '#bfe6ff',
    skyBottom: '#eef9ff',
    sun: '#ffe08a',
    cloud: '#ffffff',
    hillFar: '#a8d6bd',
    hillNear: '#87c4a1',
    ground: '#79c073',
    groundTop: '#8ed083',
    path: '#cdb894',
    wood: '#b98456',
    woodDark: '#7d5029',
    metal: '#9aa9b8',
    leaf: '#4faf63',
    leafDark: '#357a46',
  },
  night: {
    skyTop: '#13233f',
    skyBottom: '#29456f',
    sun: '#f2f0d8',
    cloud: '#3a5170',
    hillFar: '#22384f',
    hillNear: '#1b2d40',
    ground: '#2c4636',
    groundTop: '#35533f',
    path: '#3d4a3f',
    wood: '#6f523c',
    woodDark: '#4a3527',
    metal: '#7d8b99',
    leaf: '#2f5c41',
    leafDark: '#234631',
  },
};

export function venueFromHabitat(habitat?: string): Venue {
  const value = String(habitat || '').trim().toLowerCase();
  return (VENUES as readonly string[]).includes(value) ? (value as Venue) : 'meadow';
}

/**
 * 渲染层对 world 的校验。
 *
 * props 来自 JSON（后端生成 / 旧任务缓存），可能整份缺失、坐标可能是字符串。
 * 任一必需项不合法就返回 null，让调用方退回"按幕取景"的旧路径——
 * 宁可画面普通，也不要带着 NaN 去投影（整块 transform 变 NaN 的画面是空白的）。
 */
export function normalizeWorld(raw: unknown): WorldView | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const venue = venueFromHabitat(String(source.venue ?? ''));
  const slideRaw = source.slide as Record<string, unknown> | undefined;
  const slide = slideRaw ? toSlide(slideRaw) : null;
  if (!slide) return { venue };
  return { venue, slide };
}

function toSlide(raw: Record<string, unknown>): WorldSlide | null {
  const start = toTri(raw.start);
  const end = toTri(raw.end);
  if (!start || !end) return null;
  // 滑梯必须向下向右：方向反了会让滑面朝天、支撑柱穿到地面以上
  if (end[1] >= start[1]) return null;
  return { start, end };
}

function toTri(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const nums = value.map((n) => Number(n));
  if (nums.some((n) => !Number.isFinite(n) || Math.abs(n) > 100)) return null;
  return [nums[0], nums[1], nums[2]];
}

/* ------------------------------------------------------------------ *
 * 可演区域
 *
 * 取景只需要一个盒：这个世界里"必须完整可见"的范围。刻意**不含**装饰
 * （围栏、树、摩天轮）——它们是远景，允许被裁。把它们算进来会让基准缩放
 * 被一整座公园拉到很小，角色变成米粒。
 * ------------------------------------------------------------------ */

/** 没有滑梯的场地：一段可走的草地 + 一个站在里面的人 */
const OPEN_VENUE_BOUNDS: Bounds = {
  minX: -3.1,
  maxX: 3.1,
  minY: 0,
  maxY: (ACTOR.standHeight * 1.24),
};

export function worldBounds(world: WorldView): Bounds {
  if (!world.slide) return OPEN_VENUE_BOUNDS;
  return unionAll([slideBounds(world.slide.start, world.slide.end, 1), OPEN_VENUE_BOUNDS]);
}

/**
 * 基准缩放（px / 世界单位）：**整节课只算一次，任何一幕都不许改**。
 *
 * 两个约束取小：
 *  - 纵向：可演区域的顶端不能越过标题带（顶部留 10px 给描边）；
 *  - 横向：可演区域要装得下，两侧各留 SAFE_X。
 *
 * 这是"比例一致"的唯一来源。以前这段计算在每一幕里各算一次，输入是"这一幕
 * 自己装了多大东西"，所以同一只熊在滑梯幕 360px、在说话幕 437px。
 */
export function worldScale(world: WorldView): number {
  const box = worldBounds(world);
  const height = Math.max(0.4, box.maxY - box.minY);
  const width = Math.max(0.4, box.maxX - box.minX);
  const byHeight = (SUBJECT_BAND - 10) / height;
  const byWidth = (STAGE.width - 2 * SAFE_X) / width;
  return Math.min(byHeight, byWidth);
}

/**
 * 景别 = 在基准缩放上乘一个镜头焦距系数。
 *
 * 关键：它作用于**整个世界**（角色、滑梯、树、摩天轮一起放大），所以
 * 变焦不会改变任何两个物体的比例——那正是上一版"滑梯和小熊对不上"的成因。
 * 1.5 封顶：再大就只剩一张脸，孩子看不出"他在哪儿"。
 */
export const SHOT_ZOOM: Record<Shot, number> = { wide: 1, medium: 1.18, close: 1.5 };

export type WorldCamera = {
  shot: Shot;
  /** 每世界单位多少像素 */
  ppu: number;
  groundY: number;
  /** 世界原点（x=0）落在屏幕第几列：投影 = originX + x*ppu */
  originX: number;
  /** 镜头对准的世界 x（三维相机 lookX 用同一个值） */
  focusX: number;
  camera: { fov: number; z: number; lookY: number; lookX: number; focal: number };
};

/**
 * 镜头：**基准缩放 × 景别变焦**，按"这一幕要装的东西"取景。
 *
 * 三段取值，顺序就是这条规则的语义：
 *
 *   fit = 让 focusBox（角色 + 他正在用的装置）**完整装进画面**所需的缩放；
 *   ppu = clamp(fit, 基准缩放, 基准缩放 × 景别焦距)
 *
 *  - 下限 = 基准缩放：这是"整个场地装得下"的缩放。低于它就等于把世界缩小，
 *    比例会变——所以永远不越过它。
 *  - 上限 = 基准缩放 × 焦距：不允许为了拍一张脸把镜头推到 3 倍。孩子需要
 *    看清楚"他在公园的哪里"。
 *  - 中间取 fit：一幕里东西多（角色 + 滑梯）就退到基准缩放，只有角色时就
 *    稍微推近一点。两者差 18%~50%，但**所有物体同乘一个 ppu**，
 *    所以熊与滑梯的比例在任何一幕都相同。
 *
 * 焦点按 focusBox 中心，并夹在场地范围内——镜头可以跟着角色走过公园，
 * 但不会走出公园。
 */
export function cameraForWorld(
  world: WorldView,
  shot: Shot,
  focusBox?: Bounds,
): WorldCamera {
  const base = worldScale(world);
  const zoom = SHOT_ZOOM[shot];
  const box = worldBounds(world);
  const focus = isUsableBox(focusBox) ? focusBox : box;

  const height = Math.max(0.4, focus.maxY - focus.minY);
  const width = Math.max(0.4, focus.maxX - focus.minX);
  // 与 worldScale 同一把尺：纵向避开标题带，横向两侧各留 SAFE_X
  const fit = Math.min((SUBJECT_BAND - 10) / height, (STAGE.width - 2 * SAFE_X) / width);
  const ppu = Math.min(base * zoom, Math.max(base, fit));

  const targetX = Math.min(box.maxX, Math.max(box.minX, boundsCenterX(focus)));
  const tanHalf = Math.tan((CAMERA_FOV * Math.PI) / 360);
  return {
    shot,
    ppu,
    groundY: STAGE.groundY,
    originX: STAGE.centerX - targetX * ppu,
    focusX: targetX,
    camera: {
      fov: CAMERA_FOV,
      z: STAGE.height / (2 * ppu * tanHalf),
      lookY: (STAGE.groundY - STAGE.height / 2) / ppu,
      lookX: targetX,
      focal: zoom,
    },
  };
}

/** 包围盒是否可用：空盒（±Infinity）与 NaN 都不能拿去算中心 */
function isUsableBox(box?: Bounds): box is Bounds {
  return (
    !!box &&
    Number.isFinite(box.minX) &&
    Number.isFinite(box.maxX) &&
    Number.isFinite(box.maxY) &&
    box.maxX > box.minX
  );
}

/** 与 stage-layout 共用同一个 FOV：相机公式只写一处，2D/3D 才可能落在同一位置 */

/* ------------------------------------------------------------------ *
 * 世界里的固定装置（装饰 + 可交互）
 *
 * 坐标是绝对的。不同幕之间的连续性来自"它们一直在那儿"，而不是来自
 * 每幕重新摆一遍——这正是"局部场景"与"一个地方"的区别。
 * ------------------------------------------------------------------ */

export type Decor = { kind: 'tree' | 'fence' | 'bench' | 'sandbox' | 'wheel' | 'bush'; x: number };

/**
 * 这处场地有没有围栏。
 *
 * 围栏是**游乐园/牧场**的语汇，不是所有户外的语汇。上一版无条件画一条横贯
 * 全画面的木栅栏，于是"森林里的小松鼠"也站在一道公园围栏后面——场地词汇
 * 和主题对不上时，孩子读到的不是"森林"，是"一个有围栏的空地"。
 */
export function venueHasFence(venue: Venue): boolean {
  return venue === 'playground' || venue === 'meadow' || venue === 'riverside';
}

/**
 * 装饰布局。
 *
 * 只用固定值，不用随机：同一节课重渲必须逐像素一致（Remotion 的硬要求）。
 * 位置经过一次实测调整——都要落在"可演区域 + 两侧各 2 个世界单位"内，
 * 否则镜头一平移就只剩空草地。
 *
 * 每种场地填背景的东西不同：没有围栏的场地（森林、夜）就得靠树和灌木把
 * 画面两侧填满，否则镜头一平移就是一块空地。
 */
export function venueDecor(world: WorldView): Decor[] {
  const decor: Decor[] = [
    { kind: 'tree', x: -3.2 },
    { kind: 'bench', x: 5.6 },
    { kind: 'tree', x: 6.6 },
    { kind: 'tree', x: 8.2 },
  ];
  if (world.venue === 'playground') {
    decor.push({ kind: 'sandbox', x: -2.6 });
    // 摩天轮画在滑梯正后方（不是画面边缘）：它是"这是游乐园"的一句话，
    // 放在边缘就有一半在画外，等于没说。
    decor.push({ kind: 'wheel', x: 3.4 });
  }
  if (world.venue === 'riverside') decor.push({ kind: 'sandbox', x: -2.6 });
  if (!venueHasFence(world.venue)) {
    // 没有围栏的场地：靠灌木和更密的树把两侧填住
    decor.push(
      { kind: 'tree', x: -5.4 },
      { kind: 'tree', x: -7.2 },
      { kind: 'bush', x: -1.6 },
      { kind: 'bush', x: 4.4 },
      { kind: 'bush', x: 9.4 },
      { kind: 'tree', x: 10.4 },
    );
  }
  return decor;
}

/**
 * 摩天轮尺寸。写在这里而不是 WorldLayer 里，是因为它同时决定"背景装饰的
 * 尺度"——半径 2.2 个世界单位 ≈ 4 米，与滑梯（平台 2.6）是同一处公园的量级。
 * 换成屏幕像素写死的话，镜头一变焦它就和滑梯对不上，又回到"贴图背景"。
 */
export const WHEEL = { radius: 2.2, centerY: 1.35 } as const;

/* ------------------------------------------------------------------ *
 * 滑梯的二维几何（WorldLayer 用；三维 SlideRig 用同一组参数）
 * ------------------------------------------------------------------ */

/**
 * 爬梯顶端：**平台面**。
 *
 * 不沿用 ladderTopY(climbEndY)——那是"只有一把梯子"时的算法（爬到 1.5 还要
 * 再留两阶）。现在梯子是滑梯的一部分，它的顶端由平台决定：爬梯必须够到平台，
 * 多出来的部分是凭空长在天上的栏杆，三维那边也没有对应的 mesh。
 */
export function slideLadderTop(world: WorldSlide): number {
  return world.start[1];
}

/**
 * 世界里的爬梯 x：与三维 SlideRig 同一个函数，避免"2D 梯子 3D 梯子"两把。
 * 横档高度用 setpiece.ladderRungYs(顶端)，两个渲染器不各自铺密度。
 */
export function worldLadderX(world: WorldView): number | null {
  if (!world.slide) return null;
  return slideLadderX(world.slide.start, world.slide.end);
}
