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
 */

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
  centerX: number;
  /** 三维相机参数：由 ppu/groundY 反推，保证地面落在同一行 */
  camera: { fov: number; z: number; lookY: number };
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export type FramingInput = {
  /**
   * 必须完整可见的内容高度（从地面 y=0 往上），例如"梯子顶端""平台上的坐姿头顶"。
   * 这一项就是"标题压角色"那次事故的关键：当时只有角色高度，没有布景高度。
   */
  contentHeight: number;
  /** 主体的世界高度（角色站高）。不给就与 contentHeight 相同 */
  subjectHeight?: number;
};

/**
 * 取景：ppu = min(带高 × 景别占比 ÷ 主体高度, 带高 ÷ 内容高度)
 *
 * 两个约束分别对应两件事：
 *  - 前一项是"主体看起来多大"（景别意图）；
 *  - 后一项是"不许裁掉布景"（物理约束）。
 * 取小者，于是"远景"永远不会比"中景"更近，而"内容太高"时全景会自然后退。
 */
export function framingFor(input: FramingInput, shot: Shot): Framing {
  const content = Math.max(0.2, input.contentHeight);
  const subject = Math.max(0.2, input.subjectHeight ?? content);
  const ppu = clamp(Math.min((SUBJECT_BAND * SHOT_FILL[shot]) / subject, SUBJECT_BAND / content), PPU_LIMIT.min, PPU_LIMIT.max);
  const tanHalf = Math.tan((CAMERA_FOV * Math.PI) / 360);
  // 屏幕Y = H/2 + lookY * ppu ⇒ lookY = (地面行 - H/2) / ppu
  return {
    shot,
    ppu,
    groundY: STAGE.groundY,
    centerX: STAGE.centerX,
    camera: {
      fov: CAMERA_FOV,
      z: STAGE.height / (2 * ppu * tanHalf),
      lookY: (STAGE.groundY - STAGE.height / 2) / ppu,
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
 * 道具槽位：被指着的东西摆在哪、画多大。
 *
 * 以前这三个数写死在模板里（x:1430 / y:690 / size:280），与角色大小、地面线
 * 都没有关系：换景别后角色变高，道具还停在半空，看起来像贴在背景上的图标。
 * 现在道具底边贴地、尺寸随可用带高走，角色变大它也变大。
 *
 * side: -1 放左侧，+1 放右侧。调用方按"角色走/站的方向"决定，别把道具摆在
 * 角色脸前。
 */
export function propSlot(side: 1 | -1): { x: number; y: number; size: number } {
  const size = SUBJECT_BAND * 0.4;
  return { x: STAGE.centerX + side * 470, y: STAGE.groundY - size / 2, size };
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
