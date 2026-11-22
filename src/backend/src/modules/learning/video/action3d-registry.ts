/**
 * 三维动作资产注册表（Action3D Registry）
 *
 * 为什么要有这一层：
 * 分镜只说"谁在什么道具上做什么"（scene-interaction.ts 的 Action3D），但渲染层
 * 需要的是确定的几何与坐标——滑梯从哪滑到哪、球弹多高、一个动作多少帧。
 * 把这些数字交给 LLM 会得到 NaN、越界值和"不存在的模型路径"；交给渲染组件又会让
 * 每次出片都得重新猜。所以集中在这里：**LLM 只选动作，注册表决定数字与资产**。
 *
 * 两条硬规则：
 *  1. 白名单。渲染层只认这里登记过的 actorId / propId / motion，别的 id 一律回落
 *     到默认形象，绝不拼出 staticFile 指向不存在的文件的路径。
 *  2. 确定性。所有默认值都是常量，不含随机与时间，同一份输入永远解析出同一组数字。
 */

import {
  PUPPET_MOTIONS,
  type Action3D,
  type Action3DBounce,
  type Action3DMotion,
  type Action3DRenderer,
  type PuppetMotion,
  type Vec3,
} from './scene-interaction';

/** 程序化角色的外形参数：几何体拼装用，不含任何美术资产 */
export interface ProceduralActorRig {
  /** 主体毛色 */
  fur: string;
  /** 肚皮/口鼻颜色 */
  belly: string;
  /** 耳朵造型：round=熊/猫圆耳，long=兔长耳，pointy=狐/虎尖耳，flap=象耳，none=无耳 */
  ears: 'round' | 'long' | 'pointy' | 'flap' | 'none';
  /** 尾巴：stub=短尾，long=细长，bushy=蓬松 */
  tail: 'stub' | 'long' | 'bushy';
  /** 整体缩放：小动物矮一点，长颈鹿这类不在此列 */
  scale: number;
}

/**
 * 已登记的程序化角色。id 与 animal-subjects.config.ts 的 VECTOR_ANIMAL_IDS 对齐，
 * 这样 2D 分支（SVG）和 3D 分支（几何体）能用同一个 id，切换渲染器不用改分镜。
 */
export const ACTOR_RIGS: Record<string, ProceduralActorRig> = {
  bear: { fur: '#a9744f', belly: '#f0d3b2', ears: 'round', tail: 'stub', scale: 1 },
  rabbit: { fur: '#f2efe9', belly: '#ffffff', ears: 'long', tail: 'stub', scale: 0.92 },
  cat: { fur: '#f0a94c', belly: '#fff3dd', ears: 'pointy', tail: 'long', scale: 0.9 },
  dog: { fur: '#c67b30', belly: '#f7e2c4', ears: 'flap', tail: 'bushy', scale: 0.95 },
  tiger: { fur: '#e8912f', belly: '#fff0d6', ears: 'round', tail: 'long', scale: 0.98 },
  lion: { fur: '#d9a441', belly: '#f9e8c4', ears: 'round', tail: 'long', scale: 1.02 },
  panda: { fur: '#efece7', belly: '#ffffff', ears: 'round', tail: 'stub', scale: 1 },
  monkey: { fur: '#9b6b43', belly: '#e8c9a5', ears: 'round', tail: 'long', scale: 0.9 },
  fox: { fur: '#df6c2a', belly: '#fbe8d6', ears: 'pointy', tail: 'bushy', scale: 0.9 },
  mouse: { fur: '#b9b4ae', belly: '#f2eee9', ears: 'round', tail: 'long', scale: 0.75 },
  elephant: { fur: '#9aa3ae', belly: '#cfd6de', ears: 'flap', tail: 'long', scale: 1.05 },
  penguin: { fur: '#3d4b5a', belly: '#f6f2ea', ears: 'none', tail: 'stub', scale: 0.88 },
  squirrel: { fur: '#a9764a', belly: '#f0d8bc', ears: 'round', tail: 'bushy', scale: 0.82 },
  giraffe: { fur: '#e3b34a', belly: '#f8e9c6', ears: 'round', tail: 'long', scale: 1.1 },
  deer: { fur: '#b08b63', belly: '#f3e3cd', ears: 'long', tail: 'stub', scale: 0.95 },
};

/** 未登记角色的中立形象：颜色由场景 accent 覆盖，形状按常见四足/直立卡通走 */
export const DEFAULT_ACTOR_RIG: ProceduralActorRig = {
  fur: '#b98a63',
  belly: '#f3ddc4',
  ears: 'round',
  tail: 'stub',
  scale: 1,
};

export function resolveActorRig(actorId: string | undefined): ProceduralActorRig {
  const id = String(actorId || '').toLowerCase();
  return ACTOR_RIGS[id] || DEFAULT_ACTOR_RIG;
}

/** 已登记的道具：滑梯、球。别的 id 不会进 3D 舞台 */
export const PROP_KINDS = ['slide', 'ball'] as const;
export type PropKind = (typeof PROP_KINDS)[number];

export function resolvePropKind(propId: string | undefined): PropKind | null {
  const id = String(propId || '').toLowerCase();
  return (PROP_KINDS as readonly string[]).includes(id) ? (id as PropKind) : null;
}

/**
 * 每个动作的默认时长与轨迹。
 *
 * 坐标沿用渲染场景单位（小熊身高约 1，画面 16:9，相机在 z 轴正前方）：
 *  - slide：从滑梯顶端左上滑到右下，末端贴近地面；
 *  - dribble：球静置高度 ballRestY，弹起幅度 bounce.height。
 * 接触帧由这里唯一定义，骨骼片段 / 手部角度都对齐它，不让两边各自算时间。
 */
export interface MotionDefaults {
  /** 动作片段建议时长（帧，@30fps）；场景时长更短时按场景压缩 */
  durationFrames: number;
  start: Vec3;
  end: Vec3;
  bounce?: Action3DBounce;
  /** 球静置时圆心离地高度（球半径 + 微小间隙） */
  ballRestY?: number;
}

export const MOTION_DEFAULTS: Record<Action3DMotion, MotionDefaults> = {
  slide: {
    durationFrames: 90,
    start: [-3.1, 2.7, 0],
    end: [2.9, 0.3, 0],
  },
  dribble: {
    durationFrames: 96,
    start: [0.9, 0.95, 0.35],
    end: [0.9, 0.95, 0.35],
    // 球静置时圆心离地 = 球半径 + 间隙；弹起高度让最高点落在小熊胸口，
    // 这样熊掌在最高点正好搭在球顶，接触关系成立（见 ThreeActionStage 的手部 IK）
    bounce: { periodFrames: 18, height: 0.62 },
    ballRestY: 0.27,
  },
};

/* ------------------------------------------------------------------ *
 * 二维原语（Puppet2D）的默认轨迹
 *
 * 与 MOTION_DEFAULTS 同样的职责：坐标由注册表定，LLM 只写意图。
 * 但这里的单位是"角色局部世界单位"（髋部为原点、身高约 1.65），
 * 地面 y=0、站立髋部 0.66——与 video-remotion/src/character/pose.ts 同一套。
 *
 * climb 的终点取 1.5 是**动作设计值**（4 阶 × 每阶 0.21），不是画面约束。
 * 早先这里写着"再高角色头就顶到标题胶囊"，那条约束已经上移到渲染层的景别层
 * （character/stage-layout.ts）：取景按"这一幕最高的是梯子顶端"算缩放，
 * 内容再高也只会自动退远。改这个数字不需要再考虑标题。
 * ------------------------------------------------------------------ */
export interface PuppetDefaults {
  start?: Vec3;
  end?: Vec3;
  steps?: number;
}

export const PUPPET_DEFAULTS: Record<PuppetMotion, PuppetDefaults> = {
  idle: {},
  speak: {},
  point: {},
  cheer: {},
  sit: {},
  walk: { start: [-1.6, 0.66, 0], end: [0, 0.66, 0] },
  enter: { start: [-1.9, 0.66, 0], end: [0.15, 0.66, 0] },
  climb: { start: [-0.55, 0.66, 0], end: [-0.55, 1.5, 0], steps: 4 },
};

/** 解析后的二维动作：坐标就位，渲染层直接按帧取值 */
export interface ResolvedPuppet {
  motion: PuppetMotion;
  actorId: string;
  start?: Vec3;
  end?: Vec3;
  steps?: number;
  durationFrames: number;
}

export function resolvePuppet(
  motion: unknown,
  context: { actorId?: string; sceneDurationFrames?: number; steps?: number } = {},
): ResolvedPuppet | null {
  const op = String(motion ?? '').toLowerCase();
  if (!(PUPPET_MOTIONS as readonly string[]).includes(op)) return null;
  const key = op as PuppetMotion;
  const defaults = PUPPET_DEFAULTS[key];
  const sceneFrames = context.sceneDurationFrames && context.sceneDurationFrames > 0
    ? context.sceneDurationFrames
    : 120;
  return {
    motion: key,
    actorId: (context.actorId || 'bear').toLowerCase(),
    ...(defaults.start ? { start: clampVec3(defaults.start, [0, 0, 0]) } : {}),
    ...(defaults.end ? { end: clampVec3(defaults.end, [0, 0, 0]) } : {}),
    steps: context.steps ?? defaults.steps,
    durationFrames: sceneFrames,
  };
}

/**
 * 二维原语的"自然时长"（帧，@30fps）。
 *
 * 用途只有一个：一幕里串多个动作时，按这个比例分配帧数。
 * 为什么不平均分：走路和举手在观众眼里的"该给多久"差一倍，
 * 平均分会让走路像赶时间、指认像发呆。
 */
export const PUPPET_MOTION_FRAMES: Record<PuppetMotion, number> = {
  idle: 60,
  speak: 60,
  point: 54,
  cheer: 45,
  sit: 60,
  walk: 90,
  enter: 75,
  climb: 120,
};

/** 单段最短帧数：再短就看不出是一个动作，只剩关节抖动 */
const MIN_SEGMENT_FRAMES = 24;

/**
 * 把一串动作分帧。
 *
 * 关键取舍：**宁可整串丢掉，也不给某一段 0 帧**。0 帧段在渲染层等于
 * "瞬间切换姿态"，比不演更糟——观众看到的是抽帧式跳变。
 * 所以分不下去（场景时长 < 段数×最小时长）就返回 null，让上层退回单动作。
 */
export function resolvePuppetSequence(
  motions: unknown[],
  context: { actorId?: string; sceneDurationFrames?: number; steps?: number } = {},
): ResolvedPuppet[] | null {
  const resolved = motions
    .map((motion) => resolvePuppet(motion, { actorId: context.actorId, steps: context.steps }))
    .filter((item): item is ResolvedPuppet => !!item);
  if (resolved.length < 2) return null;

  const sceneFrames =
    context.sceneDurationFrames && context.sceneDurationFrames > 0 ? context.sceneDurationFrames : 120;
  if (sceneFrames < resolved.length * MIN_SEGMENT_FRAMES) return null;

  const weights = resolved.map((item) => PUPPET_MOTION_FRAMES[item.motion] || 60);
  const total = weights.reduce((sum, w) => sum + w, 0);
  const frames = weights.map((w) =>
    Math.max(MIN_SEGMENT_FRAMES, Math.round((sceneFrames * w) / total)),
  );

  // 取整误差落在最长的段上：它的相对误差最小，多/少几帧看不出来
  const longest = frames.reduce((best, value, index) => (value > frames[best] ? index : best), 0);
  let diff = sceneFrames - frames.reduce((sum, value) => sum + value, 0);
  if (diff < 0) {
    // 只能是"减到最小时长为止"，减不动的部分无法满足，整串作废
    for (const index of frames.map((_, i) => i).sort((a, b) => frames[b] - frames[a])) {
      if (diff === 0) break;
      const take = Math.min(-diff, frames[index] - MIN_SEGMENT_FRAMES);
      frames[index] -= take;
      diff += take;
    }
  }
  if (diff !== 0) {
    if (diff > 0) frames[longest] += diff;
    else return null;
  }

  return resolved.map((item, index) => ({ ...item, durationFrames: frames[index] }));
}

/** 动词到动作的默认映射：LLM 只给 verb 时也能演出 */
const VERB_TO_MOTION: Record<string, Action3DMotion> = {
  slide: 'slide',
  dribble: 'dribble',
};

export interface ResolveAction3DContext {
  /** 交互动词，决定缺省 motion */
  verb?: string;
  /** 交互里的主角 id，action3d 未指定时用它 */
  actorId?: string;
  /** 交互里的道具 id，action3d 未指定时用它 */
  propId?: string;
  /** 场景可用帧数，用于把动作时长压进这一幕 */
  sceneDurationFrames?: number;
}

/** 解析后的动作：所有数字都已就位，渲染层直接按帧取值 */
export interface ResolvedAction3D {
  renderer: Action3DRenderer;
  motion: Action3DMotion;
  actorId: string;
  propId: PropKind;
  clip?: string;
  start: Vec3;
  end: Vec3;
  bounce?: Action3DBounce;
  ballRestY?: number;
  /** 动作实际占用帧数（已按场景时长收窄） */
  durationFrames: number;
  /** 接触帧（相对场景起点）。slide 是落地点，dribble 是第一次拍球 */
  contactFrame: number;
}

function clampVec3(value: Vec3 | undefined, fallback: Vec3): Vec3 {
  if (!value) return fallback;
  return value.map((n) => (Number.isFinite(n) ? Math.max(-20, Math.min(20, Number(n))) : 0)) as Vec3;
}

/**
 * 把分镜里的 Action3D（可能残缺、可能写错 id）解析成渲染可用的确定值。
 * 返回 null 表示这一幕不该进 3D 舞台，调用方退回 2D 演出。
 */
export function resolveAction3D(
  raw: Action3D | undefined,
  context: ResolveAction3DContext = {},
): ResolvedAction3D | null {
  const motion = raw?.motion || VERB_TO_MOTION[String(context.verb || '').toLowerCase()];
  if (!motion || !(motion in MOTION_DEFAULTS)) return null;

  const defaults = MOTION_DEFAULTS[motion];
  // 道具必须与动作匹配：滑梯只能配 slide，球只能配 dribble。
  // 分镜偶尔写成 slide+ball，硬渲染会出现"小熊骑着球滑滑梯"。
  const expectedProp: PropKind = motion === 'slide' ? 'slide' : 'ball';
  const declaredProp = resolvePropKind(raw?.propId || context.propId);
  if (declaredProp && declaredProp !== expectedProp) return null;
  const propId: PropKind = expectedProp;

  const actorId = String(raw?.actorId || context.actorId || 'bear')
    .trim()
    .toLowerCase();
  if (!actorId) return null;

  const sceneFrames = Math.max(0, Number(context.sceneDurationFrames) || 0);
  const durationFrames = sceneFrames
    ? Math.max(24, Math.min(defaults.durationFrames, Math.round(sceneFrames * 0.86)))
    : defaults.durationFrames;

  const start = clampVec3(raw?.start, defaults.start);
  const end = clampVec3(raw?.end, defaults.end);
  const bounce = motion === 'dribble' ? raw?.bounce || defaults.bounce : undefined;

  return {
    renderer: raw?.renderer === '3d-glb' ? '3d-glb' : '3d-procedural',
    motion,
    actorId,
    propId,
    ...(raw?.clip ? { clip: raw.clip } : {}),
    start,
    end,
    ...(bounce ? { bounce } : {}),
    ...(defaults.ballRestY ? { ballRestY: defaults.ballRestY } : {}),
    durationFrames,
    // 滑梯的"接触"是落地那一帧；拍球是周期起点（球在手下方、掌球同一帧）
    contactFrame: motion === 'slide' ? durationFrames : 0,
  };
}

/** 3D 舞台只支持这两个动作；渲染层用它做一次最终闸门 */
export function isSupportedMotion(value: unknown): value is Action3DMotion {
  return (value === 'slide' || value === 'dribble');
}
