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
import { BUILTIN_VENUES, DEFAULT_VENUE, VENUE_RECIPES, venueRecipe } from './venue-recipes';
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

/**
 * 场地 id。
 *
 * **开放字符串，不是字面量联合**。场地是内容，会无限增长；用联合类型等于让
 * 类型系统替内容做白名单——每加一处场地都要改类型定义，"零改代码"就断了。
 * 换来的类型安全由 `normalizeRecipe` + 遍历 `Object.keys(VENUE_RECIPES)` 的
 * 全量测试补，覆盖面比编译期穷举更全。
 */
export type Venue = string;

/**
 * 内置场地清单。**不再是类型来源**，只是"回归基线"：测试要求这里每一个都有
 * 配方，反过来不要求——加新场地不需要动这个数组。
 */
export const VENUES: readonly Venue[] = BUILTIN_VENUES;

/**
 * 世界里的一处滑梯：平台（start）到滑道末端（end）。
 *
 * 爬梯不单独存在——它挂在 platform 后方（见 setpiece.slideLadderX）。
 * 这就是"梯子必须和游乐园结合"的结构性回答：**梯子是滑梯的一部分**，
 * 谁画滑梯谁画梯子，位置由同一个函数给出，不可能分开。
 */
export type WorldSlide = { start: Tri3; end: Tri3 };

export type WorldView = {
  /** 场地 id：**幕级**（§6）。第 1 幕森林、第 2 幕家里，都是合法的。 */
  venue: Venue;
  /**
   * 这一幕场地的装置。滑梯属于 "playground 这个场地"，不属于"某一幕"：
   * 本课有滑梯时，所有 playground 幕都带同一份几何；切到别的场地才缺席。
   */
  slide?: WorldSlide;
  /**
   * 整课的滑梯几何，**只用于算基准缩放**（不用于绘制）。
   *
   * 为什么需要它：基准缩放必须整课一致，否则同一只熊在有滑梯幕与室内幕里高矮
   * 不同——那正是前两轮修掉的 bug。而"整课有没有滑梯"只有后端知道，所以后端
   * 把这份几何下发给每一幕，渲染层拿它算包围盒即可，不需要后端懂 ppu 怎么算。
   */
  scaleSlide?: WorldSlide;
  /**
   * 直接指定基准缩放（px / 世界单位）。缺省时由 `worldScale(world)` 算。
   * 旧任务缓存的 props 没有这个字段，所以它是可选的。
   */
  scaleRef?: number;
};

/* ------------------------------------------------------------------ *
 * 场地配色与配方
 *
 * 数据全部在 `venue-recipes.ts`：这里只做转发，保持旧调用点（测试、模板）
 * 的 import 路径不变。加场地不需要动这个文件。
 * ------------------------------------------------------------------ */

export { VENUE_THEMES } from './venue-recipes';
export type { VenueRecipe, VenueTheme } from './venue-recipes';
export { VENUE_RECIPES };

export function venueFromHabitat(habitat?: string): Venue {
  const value = String(habitat || '').trim().toLowerCase();
  if (!value) return DEFAULT_VENUE;
  if (VENUE_RECIPES[value]) return value;
  // 拼错的场地名不能悄悄变成草地：留一条日志，否则"为什么这课是草地"无从查起
  if (!WARNED_VENUES.has(value)) {
    WARNED_VENUES.add(value);
    // eslint-disable-next-line no-console
    console.warn(`[world] 未登记的场地 "${value}"，回落到 ${DEFAULT_VENUE}`);
  }
  return DEFAULT_VENUE;
}

const WARNED_VENUES = new Set<string>();

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
  // 整课滑梯：只影响基准缩放，不影响这一幕画不画滑梯，所以坏数据也只丢它自己
  const scaleRaw = source.scaleSlide as Record<string, unknown> | undefined;
  const scaleSlide = scaleRaw ? toSlide(scaleRaw) : null;
  const scaleRefRaw = Number(source.scaleRef);
  const scaleRef = Number.isFinite(scaleRefRaw) && scaleRefRaw > 0 ? scaleRefRaw : undefined;

  const world: WorldView = { venue };
  if (slide) world.slide = slide;
  if (scaleSlide) world.scaleSlide = scaleSlide;
  if (scaleRef) world.scaleRef = scaleRef;
  return world;
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
  // 显式指定优先：后端算好整课唯一值时走这条，渲染层不再二次推导
  if (Number.isFinite(world.scaleRef) && (world.scaleRef as number) > 0) {
    return world.scaleRef as number;
  }
  const box = boundsForScale(world);
  const height = Math.max(0.4, box.maxY - box.minY);
  const width = Math.max(0.4, box.maxX - box.minX);
  const byHeight = (SUBJECT_BAND - 10) / height;
  const byWidth = (STAGE.width - 2 * SAFE_X) / width;
  return Math.min(byHeight, byWidth);
}

/**
 * 算基准缩放用的包围盒：**这一幕的装置，或整课的装置**。
 *
 * 与 `worldBounds` 的区别必须保留：`worldBounds` 给镜头夹取范围，只能用"这一幕
 * 真实有的东西"——否则室内幕的镜头能平移到一座并不存在的滑梯旁，画面变成空地。
 * 而基准缩放要的是"整课最退远的那一档"，所以允许看 `scaleSlide`。
 */
function boundsForScale(world: WorldView): Bounds {
  const slide = world.slide ?? world.scaleSlide;
  if (!slide) return OPEN_VENUE_BOUNDS;
  return unionAll([slideBounds(slide.start, slide.end, 1), OPEN_VENUE_BOUNDS]);
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
  return venueRecipe(venue).layers.some((layer) => layer.kind === 'fence');
}

/**
 * 装饰布局。
 *
 * **从配方派生**，不再在这里用 if 判断场地。这样"森林没有围栏""游乐园有摩天轮"
 * 这类断言自动变成"对配方的断言"——测试不用重写，而且以后加场地时它会继续守着。
 *
 * 只用固定值，不用随机：同一节课重渲必须逐像素一致（Remotion 的硬要求）。
 */
export function venueDecor(world: WorldView): Decor[] {
  const decor: Decor[] = [];
  for (const layer of venueRecipe(world.venue).layers) {
    if (layer.kind !== 'decor') continue;
    for (const item of layer.items) {
      if ((DECOR_KINDS as readonly string[]).includes(item.asset)) {
        decor.push({ kind: item.asset as Decor['kind'], x: item.x });
      }
    }
  }
  return decor;
}

/** `venueDecor` 认识的资产（室内资产不进这个函数：它是 3D 侧与旧测试的接口） */
const DECOR_KINDS = ['tree', 'bush', 'bench', 'sandbox', 'wheel'] as const;

/* 摩天轮尺寸随资产走（`venue-assets.tsx` 的 `WHEEL`）：它是"画出来的东西"的
 * 参数，不是世界几何。放在这里会让 world.ts 反过来依赖美术层。 */

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

/** 双人站位之间的距离（两人中心间距，世界单位）。约 0.66 个角色身高 */
const DUO_SPAN = 1.75;

/**
 * 两个角色的站位（世界 x）。
 *
 * 双人动作不是"把两个头像摆在画面两端"：递给需要两只手在中缝相遇，
 * 一起抬需要两人各托住东西的一侧。间距由**手臂够得着**决定——1.75 个世界单位
 * 时，两条 0.72 的前伸手臂之间还剩 0.3 左右的空当，正好放一件道具，
 * 而且道具要走的那段距离在画面上看得见（太近就成了"原地换个手"）。
 *
 * 有滑梯时整对平移到爬梯左侧的空地：站着的地方不能落在滑梯的立柱与爬梯里，
 * 否则画面上是"两个人穿在一副铁架子里递苹果"。站位只依赖场地几何，
 * 与"这一节课讲什么"无关。
 */
export function duoStations(world: WorldView): [number, number] {
  const half = DUO_SPAN / 2;
  const ladder = worldLadderX(world);
  if (ladder === null) return [-half, half];
  // 爬梯外侧再留一个身位：1.15 ≈ 身宽的一半 + 一点余地
  const center = Math.max(OPEN_VENUE_BOUNDS.minX + half, ladder - 1.15);
  return [center - half, center + half];
}
