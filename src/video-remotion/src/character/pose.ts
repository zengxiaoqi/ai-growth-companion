/**
 * 姿态中枢：与渲染器无关的动作解算
 *
 * 这个文件是"角色怎么动"的唯一真源。它只输出关节目标点，不碰任何渲染 API：
 *  - 3D 舞台（three/ThreeActionStage.tsx）把目标点映射到圆柱与四元数；
 *  - 2D 角色（character/Puppet2D.tsx）把目标点投影到 SVG 分片；
 *  - 以后要加渲染器，只写投影，不写动作。
 *
 * 坐标系（两个渲染器共用，2D 只取 x/y 并翻转 y）：
 *  - 原点在髋部中心，y 向上，单位是"角色高度"的归一化世界单位；
 *  - 站立时髋部在 y=0.66，脚底约 -0.64；
 *  - z 只影响景深与遮挡顺序，2D 用它做左右/前后的小幅错位。
 *
 * 为什么动作写死在代码里、而参数开放给模型：
 * pose() 每帧都要算、必须确定、出错必须可降级——这类东西交给模型现算，
 * 换来的是不确定的渲染结果和静默失败。模型该做的是选原语、给参数、给关键帧，
 * 那是"编排"；这里提供的是"运动学词汇表"。新增原语 = 在这个文件加一个函数。
 */

export type Tri = [number, number, number];

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => t * t * (3 - 2 * t);

/** 角色尺寸（局部坐标，原点在髋部中心） */
export const SPEC = {
  hipY: 0,
  torsoR: 0.3,
  shoulder: [0.28, 0.42, 0.02] as Tri,
  hipJoint: [0.14, -0.12, 0] as Tri,
  /** 手臂/腿的最大伸展（站姿距离约 0.45 / 0.50，留一点余量，否则会被钳制） */
  armLen: 0.54,
  legLen: 0.52,
  headY: 0.72,
  headR: 0.29,
  /** 站立时髋部离地高度：脚底 -0.64 + 0.02 间隙 */
  standHipY: 0.66,
};

/** 球半径（注册表是权威值，这里只给渲染兜底） */
export const BALL_RADIUS = 0.26;

/**
 * 坐滑梯时髋部沿滑面法线抬起的距离（躯干底 -0.28 刚好压在滑面上）。
 * 布景注册表要算"坐在平台上的角色头顶有多高"，必须用同一个数，
 * 所以从这里导出，不在 setpiece.ts 里另抄一份。
 */
export const SLIDE_SEAT_LIFT = 0.27;

/** 角色造型参数：两个渲染器共用同一份，造型改一次两边一起变 */
export type ActorRig = {
  fur: string;
  belly: string;
  ears: 'round' | 'long' | 'pointy' | 'flap' | 'none';
  tail: 'stub' | 'long' | 'bushy';
  scale: number;
};

export type Pose = {
  root: Tri;
  /** 躯干倾角（弧度），正数为前倾 */
  rotZ: number;
  /** 朝向：0 正对镜头，±π 背对；2D 用它决定左右翻转 */
  rotY: number;
  /** 以下四点都是相对髋部的局部坐标 */
  handL: Tri;
  handR: Tri;
  footL: Tri;
  footR: Tri;
  tailSwing: number;
  headTilt: number;
  squash: number;
};

/** 静止站姿的四肢位置，所有动作都以它为基准混合 */
export const STAND_POSE: Omit<Pose, "root"> = {
  rotZ: 0,
  rotY: 0,
  handL: [-0.36, -0.02, 0.06],
  handR: [0.36, -0.02, 0.06],
  footL: [-0.16, -0.62, 0.02],
  footR: [0.16, -0.62, 0.02],
  tailSwing: 0,
  headTilt: 0,
  squash: 1,
};

/**
 * 两个姿态之间的线性混合（t=0 取 a，t=1 取 b）。
 *
 * 用途是一幕多动作的**段落接缝**：走路末帧手臂在体侧，point 首帧手臂已平举，
 * 硬切会"啪"地跳一下。混合的是关节目标点，不是渲染结果——所以 2D 的两段肢体
 * 求解、3D 的圆柱朝向都会自动跟上，不需要各自再写一份过渡。
 *
 * 不做弧线插值、不处理重心偏移：姿态差本来就是给人看的过渡，8 帧内线性足够；
 * 弧线会让"抬手"变成"绕身体划一圈"，反而更假。
 */
export function blendPose(a: Pose, b: Pose, t: number): Pose {
  const k = clamp(t, 0, 1);
  const mix = (x: number, y: number) => x + (y - x) * k;
  const mixPoint = (x: Tri, y: Tri): Tri => [mix(x[0], y[0]), mix(x[1], y[1]), mix(x[2], y[2])];
  return {
    root: mixPoint(a.root, b.root),
    rotZ: mix(a.rotZ, b.rotZ),
    rotY: mix(a.rotY, b.rotY),
    handL: mixPoint(a.handL, b.handL),
    handR: mixPoint(a.handR, b.handR),
    footL: mixPoint(a.footL, b.footL),
    footR: mixPoint(a.footR, b.footR),
    tailSwing: mix(a.tailSwing, b.tailSwing),
    headTilt: mix(a.headTilt, b.headTilt),
    squash: mix(a.squash, b.squash),
  };
}

/**
 * 动作原语。这是有限集，也是"字母表"：
 * 位移 5 个、操作 5 个、手势 4 个、状态 4 个，约 18 个足以覆盖儿童教学场景。
 * 新动作优先走"组合 + 参数 + 关键帧"，只有真正新的运动学拓扑才加到这里。
 */
export const MOTION_OPS = [
  'idle',
  'speak',
  'point',
  'walk',
  'enter',
  'climb',
  'slide',
  'dribble',
  'cheer',
  'sit',
] as const;
export type MotionOp = (typeof MOTION_OPS)[number];

/** 动作输入：只含运动学需要的字段，渲染相关的（配色/名条/素材）不在这里 */
export type MotionInput = {
  motion: MotionOp;
  durationFrames: number;
  /** 世界坐标轨迹端点，y 向上 */
  start?: Tri;
  end?: Tri;
  bounce?: { periodFrames: number; height: number };
  ballRestY?: number;
  /** climb：阶梯数量 */
  steps?: number;
};

const mixTri = (a: Tri, b: Tri, t: number): Tri => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

/** 把一段位移曲线（0..1）映射到起终点之间 */
const alongPath = (start: Tri, end: Tri, t: number): Tri => mixTri(start, end, t);

/* ------------------------------------------------------------------ *
 * 状态类：站着、说话、欢呼、坐下
 * ------------------------------------------------------------------ */

function idlePose(frame: number, amp = 1): Pose {
  // 呼吸：4 秒一个来回，起伏 1.2cm，肉眼刚好能看出"活着"
  const breath = Math.sin(frame / 14) * 0.012 * amp;
  return {
    root: [0, SPEC.standHipY + breath, 0],
    rotZ: 0,
    rotY: 0,
    handL: [STAND_POSE.handL[0], STAND_POSE.handL[1] + breath * 0.5, STAND_POSE.handL[2]],
    handR: [STAND_POSE.handR[0], STAND_POSE.handR[1] + breath * 0.5, STAND_POSE.handR[2]],
    footL: STAND_POSE.footL,
    footR: STAND_POSE.footR,
    tailSwing: Math.sin(frame / 11) * 0.25,
    headTilt: Math.sin(frame / 20) * 0.03,
    squash: 1,
  };
}

function speakPose(frame: number): Pose {
  const base = idlePose(frame, 0.8);
  // 说话的手势：右手抬起做强调，跟着语气分句起伏（不是匀速摆）
  const beat = Math.sin(frame / 6);
  const lift = Math.max(0, Math.sin(frame / 9));
  return {
    ...base,
    handR: [0.4, -0.02 + lift * 0.26, 0.14 + beat * 0.03],
    // 点头幅度比 idle 大：说话时头部是最先被注意到的地方
    headTilt: Math.sin(frame / 8) * 0.06,
  };
}

/**
 * 指认：右臂向侧前方平伸，指尖略高于肩，手腕有细小抖动。
 *
 * 单独一个原语而不是复用 speak 的抬手，因为两者在孩子眼里是两件事：
 * speak 是"我在说"，手在身前比划；point 是"看那个"，手臂明确指向画面另一侧
 * 的道具。合成一个动作会让"指着滑梯"看起来像"在滑梯旁边自言自语"。
 */
function pointPose(frame: number): Pose {
  const base = idlePose(frame, 0.7);
  // 持续平举会像假人，加一个幅度很小、周期较慢的呼吸式浮动
  const drift = Math.sin(frame / 16) * 0.025;
  const wobble = Math.sin(frame / 9) * 0.012;
  return {
    ...base,
    // 手臂要接近水平（肩在 y=0.42），并且 x 伸到躯干轮廓之外（半径 0.3），
    // 否则手掌会被躯干吃掉，画面上只剩躯干侧面鼓出一个疙瘩。
    handR: [0.78, 0.34 + drift, 0.2 + wobble],
    // 左臂自然下垂略后摆：x 不能收到 -0.26 以内，那会让上臂折进身体
    handL: [-0.34, -0.06, 0.04],
    // 上半身朝指向侧轻微侧倾：孩子读"指着那边"主要看身体朝向，不看手指
    rotZ: -0.04 + drift * 0.4,
    headTilt: -0.04,
  };
}

function cheerPose(frame: number): Pose {
  const base = idlePose(frame, 0.6);
  // 双手举高 + 弹跳，庆祝类分镜用
  const hop = Math.abs(Math.sin(frame / 7));
  return {
    ...base,
    root: [0, SPEC.standHipY + hop * 0.12, 0],
    handL: [-0.42, 0.5 + hop * 0.08, 0.1],
    handR: [0.42, 0.5 + hop * 0.08, 0.1],
    footL: [-0.18, -0.62 + hop * 0.1, 0.02],
    footR: [0.18, -0.62 + hop * 0.1, 0.02],
    headTilt: -0.1,
    tailSwing: Math.sin(frame / 6) * 0.5,
  };
}

function sitPose(frame: number): Pose {
  const swing = Math.sin(frame / 9) * 0.05;
  return {
    root: [0, SPEC.standHipY - 0.26, 0],
    rotZ: 0,
    rotY: 0,
    handL: [-0.34, 0.06 + swing * 0.4, 0.18],
    handR: [0.34, 0.06 - swing * 0.4, 0.18],
    // 坐着时腿向前伸，脚落在身体前方
    footL: [0.24, -0.3, -0.12],
    footR: [0.24, -0.3, 0.12],
    tailSwing: Math.sin(frame / 10) * 0.3,
    headTilt: 0,
    squash: 1,
  };
}

/* ------------------------------------------------------------------ *
 * 位移类：走、入场、爬
 * ------------------------------------------------------------------ */

/**
 * 走路：双腿反相摆动，双臂与对侧腿同相。
 * 关键不是"位移多少"，而是"支撑脚在地面不动、摆动脚离地"——
 * 前者决定看起来像不像滑行，后者决定有没有"一步一步"的节奏。
 */
function walkPose(input: MotionInput, frame: number, cycles = 2.4): Pose {
  const dur = Math.max(12, input.durationFrames || 90);
  const u = clamp(frame / dur, 0, 1);
  const start = input.start ?? [0, SPEC.standHipY, 0];
  const end = input.end ?? [0, SPEC.standHipY, 0];
  // 起止各留 12% 做加减速：匀速走像传送带
  const travel = smooth(clamp((u - 0.06) / 0.86, 0, 1));
  const root = alongPath(start, end, travel);

  const legPhase = 2 * Math.PI * cycles * u;
  const swingL = Math.sin(legPhase);
  const swingR = Math.sin(legPhase + Math.PI);
  // 抬脚只取正半周：脚在地面时不上下飘
  const liftL = Math.max(0, swingL) * 0.15;
  const liftR = Math.max(0, swingR) * 0.15;
  // 身体上下：一个步幅两次起伏（双脚各一次支撑）
  const bob = Math.abs(Math.sin(legPhase)) * 0.022;

  return {
    root: [root[0], root[1] + bob, root[2]],
    rotZ: 0.04,
    rotY: 0,
    handL: [-0.36 + swingR * 0.12, -0.02 + Math.abs(swingR) * 0.03, 0.06],
    handR: [0.36 + swingL * 0.12, -0.02 + Math.abs(swingL) * 0.03, 0.06],
    // 2D 是正面视角，"前后"没有第三个维度可表现：脚如果左右摆到 ±0.2，
    // 会和 ±0.16 的基础站距抵消、两腿交叉成一坨。所以横向几乎不动，
    // 走路全靠"抬脚交替"与身体起伏来读——这是正面视角唯一诚实的手段。
    footL: [-0.17, -0.62 + liftL, 0.02],
    footR: [0.17, -0.62 + liftR, 0.02],
    tailSwing: Math.sin(legPhase * 0.5) * 0.35,
    headTilt: Math.sin(legPhase) * 0.04,
    squash: 1,
  };
}

/** 入场：和走路同一套腿部节奏，但带淡入感——前 8 帧重心略低，像刚迈进来 */
function enterPose(input: MotionInput, frame: number): Pose {
  const walk = walkPose(input, frame, 2.0);
  const settle = smooth(clamp(frame / 18, 0, 1));
  return {
    ...walk,
    root: [walk.root[0], walk.root[1] - (1 - settle) * 0.05, walk.root[2]],
    headTilt: walk.headTilt - (1 - settle) * 0.1,
  };
}

/**
 * 爬梯子：这是"爬上滑梯"需要的那个动作，也是 2D 之前完全缺失的表达。
 *
 * 三条规则让它读起来像"爬"而不是"向上飘"：
 *  1. 上升是离散的——重心按阶跳，每阶内部用 smooth 过渡，视觉上有停顿；
 *  2. 手脚交替——一侧脚抬起时，对侧手在向上够（同手同脚会像僵尸）；
 *  3. 身体前倾——贴着梯子，不是直立在旁边。
 */
function climbPose(input: MotionInput, frame: number): Pose {
  const dur = Math.max(24, input.durationFrames || 120);
  const u = clamp(frame / dur, 0, 1);
  const steps = Math.max(1, Math.round(input.steps ?? 4));
  // 末 12% 停在顶端站稳，不然最后一帧还在动
  const p = clamp(u / 0.88, 0, 1) * steps;
  const k = Math.min(steps - 1, Math.floor(p));
  const phase = clamp(p - k, 0, 1);
  const progress = clamp((k + smooth(phase)) / steps, 0, 1);

  const start = input.start ?? [-0.55, SPEC.standHipY, 0];
  const end = input.end ?? [-0.55, SPEC.standHipY + 0.84, 0];
  const root = alongPath(start, end, progress);
  const stepH = Math.max(0.05, (end[1] - start[1]) / steps);

  // 每阶换主导侧：同手同脚看起来像僵尸
  const lead = k % 2 === 0 ? 1 : -1;
  // 两只手脚各有相位，副侧落后半阶，形成"抓—拉—换"的交替
  const phaseLead = phase;
  const phaseTrail = (phase + 0.5) % 1;

  /**
   * 手为什么不是"相对髋部固定"：
   * 手抓住横档之后，横档在世界里不动，身体往上走 → 手相对髋部越来越低，
   * 手臂从伸直变成弯曲；跨到下一阶时手跳到上一根横档，重新伸直。
   * 如果让 hand 相对髋部恒定，画面上就是"手黏在梯子上跟身体一起滑"，
   * 完全没有"一把一把往上抓"的感觉。这是爬梯最关键的一条。
   */
  const gripY = (ph: number) => 0.88 - ph * stepH;
  // 另一只手在换手：从上一档松手，收到胸前再抓上去
  const reachY = (ph: number) => 0.46 - ph * stepH * 0.6;

  const handLead: Tri = [lead * 0.44, gripY(phaseLead), 0.18];
  const handTrail: Tri = [-lead * 0.44, reachY(phaseTrail), 0.12];

  // 脚：踩住的那只不抬，抬起的那只收到脚踝高度再踩下一档
  const stepLift = (ph: number) => Math.max(0, Math.sin(Math.PI * ph)) * 0.2;
  const footLeadY = -0.62 + stepLift(phaseLead) * (phaseLead < 0.5 ? 1 : 0.2);
  const footTrailY = -0.62 + stepLift(phaseTrail) * (phaseTrail < 0.5 ? 1 : 0.2);

  return {
    root: [root[0], root[1], root[2]],
    // 倾角只能很小：gripY 是按"局部 y 差"算的，而投影会施加 rotZ，
    // 倾 18° 会把手的实际高度抬高 0.065（约两根横档间距的一半），
    // 手脚于是落在横档之间——看起来就是"手悬在半空"。
    // 爬直梯本来也接近直立，前倾由手/脚的前后位置表达，不靠整体旋转。
    rotZ: 0.05 + Math.sin(p * Math.PI) * 0.02,
    rotY: 0,
    handL: lead > 0 ? handLead : handTrail,
    handR: lead > 0 ? handTrail : handLead,
    footL: [-0.17, lead > 0 ? footLeadY : footTrailY, 0.04],
    footR: [0.17, lead > 0 ? footTrailY : footLeadY, 0.04],
    tailSwing: Math.sin(p * Math.PI) * 0.3,
    headTilt: -0.14 + phase * 0.04,
    squash: 1,
  };
}

/* ------------------------------------------------------------------ *
 * 滑滑梯（原有 3D 动作，逻辑一字未改，只把入参类型收窄到运动学字段）
 * ------------------------------------------------------------------ */

export function slidePose(input: MotionInput, frame: number): Pose {
  const dur = Math.max(24, input.durationFrames || 90);
  const u = clamp(frame / dur, 0, 1);
  // 加速度曲线：起滑慢、中段快、到底前不再加速（u^1.5 而不是线性）
  const travel = Math.pow(u, 1.5);

  const start = input.start ?? [-3.1, 2.7, 0];
  const end = input.end ?? [2.9, 0.3, 0];
  const sx = start[0];
  const sy = start[1];
  const ex = end[0];
  const ey = end[1];
  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const angle = Math.atan2(dy, dx);

  // 沿滑面 4% → 96%：起点落在平台上，终点停在滑面底端
  const p = lerp(0.04, 0.96, travel);
  const px = sx + dx * p;
  const py = sy + dy * p;

  // 坐姿：髋部沿法线抬起 SLIDE_SEAT_LIFT（躯干底 -0.28 刚好压在滑面上），双腿沿滑面
  // 向前伸出而不是垂到板下面——垂下去会被滑板挡住，看起来像"浮在板上"。
  const slideRoot: Tri = [px + nx * SLIDE_SEAT_LIFT, py + ny * SLIDE_SEAT_LIFT, 0];
  const swing = Math.sin(frame / 5) * 0.06;
  const sitting: Omit<Pose, "root"> = {
    rotZ: angle + 0.1,
    rotY: 0,
    handL: [-0.4, 0.74 + swing, 0.2],
    handR: [0.4, 0.74 - swing, 0.2],
    footL: [0.5, 0.12 + swing * 0.5, -0.14],
    footR: [0.5, 0.12 - swing * 0.5, 0.14],
    tailSwing: Math.sin(frame / 8) * 0.5,
    headTilt: -0.12,
    squash: 1,
  };

  // 最后一程站起来：坐姿 → 站姿，位置从滑面底端落到地面
  const standT = smooth(clamp((u - 0.9) / 0.1, 0, 1));
  // 落地点要离开滑道末端：贴着末端站会和斜板叠在一起，像被插穿
  const standRoot: Tri = [ex + 0.8, SPEC.standHipY, 0];
  const root: Tri = [
    lerp(slideRoot[0], standRoot[0], standT),
    lerp(slideRoot[1], standRoot[1], standT),
    lerp(slideRoot[2], standRoot[2], standT),
  ];

  return {
    root,
    rotZ: lerp(sitting.rotZ, STAND_POSE.rotZ, standT),
    rotY: 0,
    handL: mixTri(sitting.handL, STAND_POSE.handL, standT),
    handR: mixTri(sitting.handR, STAND_POSE.handR, standT),
    footL: mixTri(sitting.footL, STAND_POSE.footL, standT),
    footR: mixTri(sitting.footR, STAND_POSE.footR, standT),
    tailSwing: lerp(sitting.tailSwing, 0, standT),
    headTilt: lerp(sitting.headTilt, 0, standT),
    squash: 1,
  };
}

/* ------------------------------------------------------------------ *
 * 拍球
 *
 * 接触关系是这一段的核心：球的 Y 由周期函数给出，接触帧固定在周期边界；
 * 熊掌目标点 = 球心 + 0.9R（搭在球顶），手臂用"肩→目标"定向自动跟手。
 * 因此"掌球同帧接触"不是靠调参对齐两条时间线，而是同一个变量算出来的。
 * ------------------------------------------------------------------ */

export function dribblePose(
  input: MotionInput,
  frame: number,
): { pose: Pose; ball: Tri; squash: number; spin: number } {
  const period = Math.max(6, input.bounce?.periodFrames ?? 18);
  const height = Math.max(0.2, input.bounce?.height ?? 0.62);
  const rest = input.ballRestY ?? 0.27;
  const radius = BALL_RADIUS;

  const cyclePhase = (((frame % period) + period) % period) / period;
  const lift = Math.abs(Math.sin(Math.PI * cyclePhase));
  const ballY = rest + height * lift;

  // 球在小熊右侧、同一景深平面内：再往前放会让手臂藏在球后面，
  // 孩子看到的是"一颗球悬在耳边"，不是"熊掌在拍球"。
  const ballX = 0.72;
  const ballZ = 0.15;
  const ball: Tri = [ballX, ballY, ballZ];

  // 落地附近压扁，最高点恢复
  const contact = clamp(1 - (ballY - rest) / 0.14, 0, 1);
  const squash = 1 - 0.12 * contact;
  const spin = frame * 0.1;

  // 身体随球起伏：球到手边时微微下蹲，球飞起时站直
  const hipY = SPEC.standHipY - 0.07 * (1 - lift);
  const root: Tri = [0, hipY, 0];

  // 右掌搭在球顶靠前的一侧（z 比球心大 0.11）：既真实接触又不被球挡住。
  // 目标点 = 球心 + 0.9R，臂长 0.54 覆盖得了这个范围，所以不会被拉伸。
  const handR: Tri = [ballX, ballY + radius * 0.9 - hipY, ballZ + 0.11];
  // 左臂自然摆动配平
  const handL: Tri = [-0.38, -0.02 + Math.sin(frame / 7) * 0.05, 0.08];
  // 脚随下蹲略微屈膝
  const kneeDrop = 0.07 * (1 - lift);
  const footL: Tri = [-0.16, -0.62 + kneeDrop, 0.02];
  const footR: Tri = [0.16, -0.62 + kneeDrop, 0.02];

  return {
    pose: {
      root,
      rotZ: 0,
      // 身体正对镜头：转身体会把手臂目标点一起转走，掌心就贴不到球了
      rotY: 0,
      handL,
      handR,
      footL,
      footR,
      tailSwing: Math.sin(frame / 9) * 0.35,
      headTilt: 0.18 + lift * 0.05,
      squash: 1,
    },
    ball,
    squash,
    spin,
  };
}

/* ------------------------------------------------------------------ *
 * 分发：新增原语只在这里加一行，渲染器不动
 * ------------------------------------------------------------------ */

export function poseAt(input: MotionInput, frame: number): Pose {
  switch (input.motion) {
    case 'slide':
      return slidePose(input, frame);
    case 'dribble':
      return dribblePose(input, frame).pose;
    case 'walk':
      return walkPose(input, frame);
    case 'enter':
      return enterPose(input, frame);
    case 'climb':
      return climbPose(input, frame);
    case 'speak':
      return speakPose(frame);
    case 'point':
      return pointPose(frame);
    case 'cheer':
      return cheerPose(frame);
    case 'sit':
      return sitPose(frame);
    case 'idle':
    default:
      return idlePose(frame);
  }
}

/** 这个原语需要哪些运动学参数（给后端做可演性校验用） */
export const MOTION_REQUIRES: Record<MotionOp, Array<keyof MotionInput>> = {
  idle: [],
  speak: [],
  point: [],
  cheer: [],
  sit: [],
  walk: ['start', 'end'],
  enter: ['start', 'end'],
  climb: ['start', 'end'],
  slide: ['start', 'end'],
  dribble: ['bounce'],
};
