/**
 * 景别层（shot）：把"画什么"和"画多大"分开
 *
 * 这个文件解决的是同一类事故的**结构**问题，不是某一帧好看不好看：
 *
 *   - 梯子顶端被标题胶囊压住（实测：标题白底覆盖 42..121px，梯子顶端 114px）。
 *     根因不是"梯子画高了"，而是缩放系数 265 是个硬编码常量，和"标题占多高"
 *     没有任何关系——只要动作再高一点，画面就会撞上去，而改这个常量又会牵连
 *     所有场景的大小。
 *   - 二维地面 856、三维地面（lookY 反推）约 827。两边各自写死，切镜头时
 *     角色会上下跳一小格，观众说不出哪里不对，但会觉得"闪"。
 *   - 没有"景别"概念：滑梯要装下整个结构、拍球只需要装下熊、头像只需要脸，
 *     三种需求共用一套取景，只能取折中值，谁都不合适。
 *
 * 做法是一条取景定律，而不是一堆特例：
 *
 *   ppu（每世界单位多少像素）
 *     = min( 可用带高 × 该景别占比 ÷ 主体高度,
 *            可用带高 ÷ 内容世界高度 )
 *
 * 前一项决定"主体看起来多大"，后一项决定"布景一次能装多高"。"内容世界高度"
 * 由布景/姿态给出（见 setpiece.ts），"可用带高"由标题与地面给出（本文件）。
 * 于是"主体不能高过标题"不再是需要记得遵守的约定，而是算不出来就越界的量——
 * 内容再高，缩放自动变小。
 *
 * 三维相机不是另一套参数：给定 ppu 与地面线，相机距离与 lookY 由公式反推，
 * 保证 3D 的地面**也**落在 STAGE.groundY。这是"2D/3D 同源"的第一层。
 *
 * 第二层是横向：取景吃的不是"内容多高"，而是**内容包围盒**（Bounds）。有了盒，
 * "内容偏左""内容太宽"才有地方表达，才能靠公式而不是靠逐个调坐标解决：
 *   - ppu 同时被"纵向装得下"和"横向装得下（含两侧留白）"约束；
 *   - 画面按内容中心对齐，而不是把世界原点硬按在画面中线。
 * 所以渲染器只需要回答"这一幕占了世界上哪一块"，不需要知道取景怎么算。
 */

import { ACTOR } from './pose';

/** 画面尺寸。与 Remotion composition 一致，渲染器不做第二次取整 */
export const STAGE = {
  width: 1920,
  height: 1080,
  /** 角色横向锚点（滑梯/梯子/球都围绕它） */
  centerX: 960,
  /**
   * 标题胶囊底边。不是估的：对 1080p 抽帧做像素扫描，中心 700..1250 区间里
   * 连续白底出现在 y=42..121。改标题字号/内边距必须重测这个值。
   */
  titleBandBottom: 121,
  /**
   * 主体与标题之间至少留这么多像素。
   * 30 而不是 20：2D 立杆是 round cap 的描边，**视觉**顶边会比几何顶端高
   * 半个线宽（实测约 7px），只留 20 的话看起来还是贴着标题。
   */
  titleGap: 30,
  /** 地面线：2D 投影与 3D 相机都对齐到这一行，切换渲染器时脚不会跳 */
  groundY: 856,
};

/** 主体可用区域的上边界 */
export const SUBJECT_TOP = STAGE.titleBandBottom + STAGE.titleGap;
/** 主体可用带高（像素） */
export const SUBJECT_BAND = STAGE.groundY - SUBJECT_TOP;

/**
 * 画面左右的安全留白（像素）。
 *
 * 为什么留白要参与**缩放**而不是只做平移：滑梯横跨 7.7 个世界单位，按高度
 * 算出来的 ppu 让它在屏幕上占 1367px，落在 960 中心时左端只剩 115px、右端
 * 剩 437px——左边像被裁掉了，右边空一大块。只平移能居中，但两个边距都会
 * 变小；只有让留白成为 ppu 的上限约束，"装得下且两边都有呼吸"才是算出来的。
 */
export const SAFE_X = 72;

/**
 * 内容包围盒（世界单位）。取景只吃这一个东西，不认识具体是梯子还是滑梯。
 *
 * 引入它之前，取景只有"内容高度"一个数：所以"内容偏左/偏右""横向太宽"
 * 这类问题根本无处表达，只能靠人眼看出来再逐个调坐标——那正是"针对某个
 * 场景特定优化"。有了盒，新增任何布景/道具只要报告自己的范围，取景自动
 * 把它算进去：装不下就后退，偏了就平移。
 */
export type Bounds = { minX: number; maxX: number; minY: number; maxY: number };

/** 空盒（用于 reduce 起点）。宽高为负，union 任何真盒后即被覆盖 */
export const EMPTY_BOUNDS: Bounds = {
  minX: Infinity,
  maxX: -Infinity,
  minY: Infinity,
  maxY: -Infinity,
};

export function unionBounds(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minY: Math.min(a.minY, b.minY),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function unionAll(boxes: Bounds[]): Bounds {
  return boxes.reduce(unionBounds, EMPTY_BOUNDS);
}

export const boundsWidth = (b: Bounds) => b.maxX - b.minX;
export const boundsHeight = (b: Bounds) => b.maxY - b.minY;
export const boundsCenterX = (b: Bounds) => (b.minX + b.maxX) / 2;

/**
 * 景别。取值不多，因为每多一档就多一组要维护的取舍：
 *  - wide：动作幕。主体仍是"中景大小"，但**必须装下布景**（梯子、滑梯），
 *    装不下就自动往后退——全景是"为布景让路"的结果，不是无条件缩小。
 *  - medium：单角色动作的默认档，角色约占可用带高 62%（与既有成片一致）。
 *  - close：面孔/情绪/说话。角色占满带高，脚仍踩在地面线上。
 */
export type Shot = 'wide' | 'medium' | 'close';

/** 每个景别里"主体占可用带高的比例" */
const SHOT_FILL: Record<Shot, number> = { wide: 0.62, medium: 0.62, close: 0.92 };

/** 缩放安全区：太小看不清，太大等于把角色糊在镜头上 */
const PPU_LIMIT = { min: 110, max: 560 };

/** 三维相机：与 three/ThreeActionStage 共用，勿在别处再写一份 */
export const CAMERA_FOV = 40;

export type Framing = {
  shot: Shot;
  /** 每世界单位对应多少屏幕像素（2D 直接用它当缩放） */
  ppu: number;
  /** 地面在屏幕上的行（像素） */
  groundY: number;
  /** 世界原点（x=0）落在屏幕第几列。投影就是 originX + x*ppu，别再写 960 */
  originX: number;
  /** 内容中心的世界 x（三维持景按它整体平移，与 originX 同源） */
  worldCenterX: number;
  /** 三维相机参数：由 ppu/地面行/内容中心反推，保证与 2D 落在同一位置 */
  camera: { fov: number; z: number; lookY: number; lookX: number };
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export type FramingInput = {
  /** 必须完整可见的内容盒。给了它就能同时管住"装得下"和"居中" */
  bounds?: Bounds;
  /**
   * 只有高度、没有横向要求时的简写（兼容旧调用）。
   * 注意它**不会**约束宽度——不知道内容的横向范围时，假装它很窄反而会让
   * 宽布景被裁，所以宁可不管。
   */
  contentHeight?: number;
  /** 主体的世界高度（角色站高）。不给就与内容高度相同 */
  subjectHeight?: number;
};

/**
 * 取景：ppu = min(带高 × 景别占比 ÷ 主体高度, 带高 ÷ 内容高度, 可用宽 ÷ 内容宽度)
 *
 * 三个约束分别对应三件事：
 *  - 第一项是"主体看起来多大"（景别意图）；
 *  - 第二项是"纵向不许裁掉布景"（物理约束）；
 *  - 第三项是"横向不许裁掉布景，且两边都留出安全留白"。
 * 取小者，于是"内容太宽/太高"时全景会自然后退，而不是把两侧切掉。
 *
 * 平移：内容中心不再被强行按到画面中线。滑梯的几何中心在 x=-0.9，硬按到
 * 中线会让左端贴边、右端空出一大块；现在按内容中心对齐，两边留白相等。
 */
export function framingFor(input: FramingInput, shot: Shot): Framing {
  // 空盒（全是 ±Infinity 或还没并出任何内容）当作"没给"，否则中心会算出 NaN，
  // 整块 transform 变成 NaN 后画面是空白——这种故障比"稍微裁一点"难查得多。
  const box =
    input.bounds && Number.isFinite(input.bounds.minX) && Number.isFinite(input.bounds.maxX)
      ? input.bounds
      : undefined;
  const contentH = Math.max(0.2, box ? boundsHeight(box) : (input.contentHeight ?? 1));
  const subject = Math.max(0.2, input.subjectHeight ?? contentH);
  const ppuFitWidth = box
    ? (STAGE.width - 2 * SAFE_X) / Math.max(0.4, boundsWidth(box))
    : Infinity;
  const ppu = clamp(
    Math.min(
      (SUBJECT_BAND * SHOT_FILL[shot]) / subject,
      SUBJECT_BAND / contentH,
      ppuFitWidth,
    ),
    PPU_LIMIT.min,
    PPU_LIMIT.max,
  );
  const worldCenterX = box ? boundsCenterX(box) : 0;
  const tanHalf = Math.tan((CAMERA_FOV * Math.PI) / 360);
  // 屏幕Y = H/2 + lookY * ppu ⇒ lookY = (地面行 - H/2) / ppu
  // 屏幕X = W/2 - (lookX - x) * ppu ⇒ 世界平移量就是内容中心
  return {
    shot,
    ppu,
    groundY: STAGE.groundY,
    originX: STAGE.centerX - worldCenterX * ppu,
    worldCenterX,
    camera: {
      fov: CAMERA_FOV,
      z: STAGE.height / (2 * ppu * tanHalf),
      lookY: (STAGE.groundY - STAGE.height / 2) / ppu,
      lookX: worldCenterX,
    },
  };
}

/**
 * 动作 → 景别。
 *
 * 判断依据是"这个动作要装下多大的东西"，不是"动作名字眼熟"：
 * 爬（梯子高过角色一倍）与滑（整条滑道）必须 wide，其余单角色动作 medium。
 * 新增动作时**必须**在这里表态，否则会落到 medium——这是刻意的：
 * 默认取"装下角色"，最坏情况是布景被裁一点，而不是压住标题。
 */
const WIDE_MOTIONS: ReadonlySet<string> = new Set(['climb', 'slide']);

export function shotForMotion(motion: string): Shot {
  return WIDE_MOTIONS.has(motion) ? 'wide' : 'medium';
}

/**
 * 道具槽位（**世界单位**，不是屏幕像素）。
 *
 * 以前返回的是屏幕坐标（x = centerX ± 470、size = 带高 × 0.4）。两个后果：
 *   - 取景一旦平移（内容偏左就整体右移），屏幕坐标的道具不会跟着动，
 *     角色和道具会错位；
 *   - 尺寸按"带高比例"给，与角色大小无关，换景别后要么压住角色，要么小得
 *     像贴在背景上的图标。
 * 改成世界单位后，道具与角色、布景在同一套坐标里，由取景统一投影；它也
 * 自动进入内容包围盒，"被指着的东西"永远不会落在画面外。
 *
 * 尺寸不进这里：道具高由"这个道具自己的比例"决定（见 prop-art 的
 * propSizeFor）。这里只按调用方给的 size 算位置——以前那个"道具统一 0.57 身高"
 * 的常量已经删掉，留着它就会有人继续用它，苹果又一次变得和桌子一样高。
 *
 * side: -1 放左侧，+1 放右侧。调用方按"角色走/站的方向"决定，别把道具摆在
 * 角色脸前。y 是道具**中心**离地高度（= 半个高，底边正好贴地），所以间距与
 * 高度必须同源：间距 = 身宽/2 + 道具宽/2 + 一个身宽的呼吸位。
 */
export function propSlotForSize(
  side: 1 | -1,
  size: number,
): { x: number; y: number; size: number } {
  const gap = ACTOR.bodyWidth / 2 + size / 2 + ACTOR.bodyWidth * 0.8;
  return { x: side * gap, y: size / 2, size };
}

/** 道具的包围盒：底边贴地，宽度等于绘制尺寸 */
export function propBounds(slot: { x: number; y: number; size: number }): Bounds {
  return {
    minX: slot.x - slot.size / 2,
    maxX: slot.x + slot.size / 2,
    // y 是道具中心离地高度。普通道具 y=size/2 时结果仍是 [0,size]；
    // 被叶片托高的蜗牛则必须把真实上沿算进取景，否则标题带会裁掉它的壳。
    minY: Math.max(0, slot.y - slot.size / 2),
    maxY: slot.y + slot.size / 2,
  };
}

/**
 * 头像/徽章分支的取景。
 *
 * 徽章不是世界坐标里的角色（没有脚、没有地面），所以不吃 ppu；但它同样不能
 * 侵入标题带。返回的是**布局盒**（未缩放）的位置与缩放系数：
 * 盒子底边贴地，缩放原点在底边中点，于是放大只会往上长，下沿永远在地面线上，
 * 上沿由"带高 × 92%"决定。模板按这个摆，别再写 top:330 / scale:1.4。
 */
export function portraitFraming(): {
  /** 布局盒的上边（**缩放前**的 CSS top） */
  top: number;
  /** 缩放后的视觉高度 */
  height: number;
  /** 缩放系数，配合 transform-origin: 50% 100% */
  scale: number;
  centerY: number;
} {
  // 徽章容器的设计尺寸（Template 里 TopicVisual 的外框高度）
  const BOX = 470;
  const height = SUBJECT_BAND * SHOT_FILL.close;
  return {
    top: STAGE.groundY - BOX,
    height,
    scale: height / BOX,
    centerY: STAGE.groundY - height / 2,
  };
}
