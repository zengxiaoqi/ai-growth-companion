/**
 * 二维全身角色（Puppet2D）
 *
 * 它解决的是"头像徽章演不了动作"这个断层：徽章是一个圆里放一张图，没有躯干、
 * 没有腿、没有可动关节，所以"走进来""爬上去"在物理上就画不出来。
 *
 * 这里的分片与三维舞台完全同构，因为它们消费的是同一份 Pose（character/pose.ts）：
 *  3D 把关节目标点映射成圆柱 + 四元数，2D 映射成 SVG 线段 + 两段肢体求解。
 * 因此"新增一个动作"不需要碰这个文件——动作在 pose 层写一次，两个渲染器都能演。
 *
 * 唯一的投影约定（踩过坑）：**躯干旋转必须作用在四肢上**。
 * 如果只给躯干椭圆加 rotate()、四肢各自按世界坐标算，爬/滑时身体转了腿没转，
 * 画面上就是"上身扭过去、下身留在原地"。所以所有部件都先转成"相对髋部的
 * 局部坐标"，由同一个 project() 统一施加 rotZ，再翻 y、缩放。
 *
 * 确定性：只用传入的 frame，不读 useCurrentFrame、不用 Math.random。
 */

import React from 'react';
import {
  BALL_RADIUS,
  SPEC,
  blendPose,
  clamp,
  dribblePose,
  poseAt,
  type ActorRig,
  type MotionInput,
  type MotionOp,
  type Pose,
  type Tri,
} from './pose';
import { framingFor, shotForMotion, type Shot } from './stage-layout';
import { LADDER, actorHeadTop, ladderTopY } from './setpiece';

/* ------------------------------------------------------------------ *
 * 取景
 *
 * 这里**没有** PPU / GROUND_Y 常量了。以前写死 PPU=265、GROUND_Y=856，
 * 与"标题占多高、布景有多高"毫无关系：梯子顶到 2.75 世界单位时，
 * 856 − 2.75×265 = 114px，正好钻进标题胶囊（底边 121）。
 *
 * 现在缩放由 stage-layout 的取景定律算出来：先问"这一幕最高的东西有多高"
 * （布景注册表回答），再和"角色该画多大"取小者。内容再高，缩放自动变小，
 * 撞标题这件事在算术上不成立。
 * ------------------------------------------------------------------ */
/** climb 的角色最高点：动作设计值（4 阶 × 0.21），不再承担"别撞标题"的职责 */
const MAX_STAND_Y = 1.55;

/** 一幕多动作里的一节。帧数由后端的注册表按"动作自然时长"分配，渲染层不重算。 */
export type PuppetSegment = {
  motion: MotionOp;
  durationFrames: number;
  start?: Tri;
  end?: Tri;
  steps?: number;
};

export type Puppet2DScene = {
  motion: MotionOp;
  rig: ActorRig;
  start?: Tri;
  end?: Tri;
  steps?: number;
  bounce?: { periodFrames: number; height: number };
  ballRestY?: number;
  durationFrames: number;
  /**
   * 一幕多动作的播放表，按顺序播放。长度大于 1 时 `motion` 只作为兜底
   * （例如序列为空的那一帧），实际姿态由当前所在的段落决定。
   */
  sequence?: PuppetSegment[];
  accent: string;
  label?: string;
  /**
   * 布景道具。坐标是屏幕像素（1920×1080 画布），node 由调用方预先渲染成
   * SVG 片段——组件本身不认识"滑梯""皮球"这些业务道具，只负责把它们按
   * 场景需要摆到位。这样新增道具不用改这个文件。
   */
  props?: Array<{ x: number; y: number; size: number; label?: string; node: React.ReactNode }>;
  /** 漂浮在角色之上的覆盖层（对话气泡等 HTML 元素，不能塞进 SVG） */
  overlay?: React.ReactNode;
  /**
   * overlay 的出场时刻（0..1，按场景进度）。用于一幕多动作：台词气泡要等到
   * 说话那一段再出现，否则"走过去→指一下→说话"的顺序在第一帧就被剧透了。
   */
  overlayFrom?: number;
  /**
   * 景别覆盖。不给就按动作自动判定（climb → wide，其余 → medium）。
   * 只影响取景，不影响动作本身：动作的世界坐标由后端定死。
   */
  shot?: Shot;
};

/** 颜色压暗：给每个形状描一圈同色深边，角色不会糊进背景 */
const shade = (hex: string, k = 0.72): string => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
};

/* ------------------------------------------------------------------ *
 * 两段肢体求解
 *
 * 给定根关节和末端目标点，求中间关节（肘/膝）。做法是"中点 + 法向偏移"，
 * 偏移方向由 bend 的符号决定：膝盖朝前（+x），手肘朝后（-x）。
 * 不用真正的 IK：2D 画面上多余的自由度只会带来抖动，固定弯向才稳定。
 * ------------------------------------------------------------------ */
function jointPoint(from: Tri, to: Tri, bend: number): Tri {
  const mx = (from[0] + to[0]) / 2;
  const my = (from[1] + to[1]) / 2;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.sqrt(dx * dx + dy * dy) || 0.0001;
  // 法向（-dy, dx）在"末端在下方"时指向 +x
  const nx = -dy / len;
  const ny = dx / len;
  return [mx + nx * bend * len, my + ny * bend * len, (from[2] + to[2]) / 2];
}

type Projector = (p: Tri) => [number, number];

/** 上限钳制：模型/参数给的目标点再离谱，肢体也不会被拉成面条 */
function clampReach(from: Tri, to: Tri, maxLen: number): Tri {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len <= maxLen) return to;
  const k = maxLen / len;
  return [from[0] + dx * k, from[1] + dy * k, from[2] + dz * k];
}

/* ------------------------------------------------------------------ *
 * 部件
 * ------------------------------------------------------------------ */

const Limb2D: React.FC<{
  pivot: Tri;
  target: Tri;
  bend: number;
  maxLen: number;
  width: number;
  color: string;
  capColor?: string;
  capRadius?: number;
  project: Projector;
  /** 末端压扁比例：脚掌画扁椭圆，手掌画圆 */
  capFlat?: number;
}> = ({ pivot, target, bend, maxLen, width, color, capColor, capRadius, project, capFlat }) => {
  const to = clampReach(pivot, target, maxLen);
  const joint = jointPoint(pivot, to, bend);
  const cap = capRadius ?? width * 0.62;
  const capP = project(to);
  const a = project(pivot);
  const b = project(joint);
  const c = project(to);
  return (
    <g>
      <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth={width} strokeLinecap="round" />
      <line x1={b[0]} y1={b[1]} x2={c[0]} y2={c[1]} stroke={color} strokeWidth={width * 0.9} strokeLinecap="round" />
      {capColor ? (
        capFlat ? (
          <ellipse
            cx={capP[0]}
            cy={capP[1]}
            rx={cap * 1.15}
            ry={cap * capFlat}
            fill={capColor}
            stroke={shade(capColor)}
            strokeWidth={3}
          />
        ) : (
          <circle
            cx={capP[0]}
            cy={capP[1]}
            r={cap}
            fill={capColor}
            stroke={shade(capColor)}
            strokeWidth={3}
          />
        )
      ) : null}
    </g>
  );
};

/** 头：圆 + 耳 + 口鼻 + 鼻头 + 眼睛，按 headTilt 绕脖子旋转 */
const Head2D: React.FC<{ rig: ActorRig; head: [number, number]; r: number; tilt: number }> = ({
  rig,
  head,
  r,
  tilt,
}) => {
  const fur = rig.fur;
  const belly = rig.belly;
  const stroke = shade(fur);
  // headTilt 是弧度，绕脖子（头底部）转，不是绕头心——绕头心转会让整颗头平移
  const pivotY = head[1] + r;
  const transform = `rotate(${(tilt * 180) / Math.PI} ${head[0]} ${pivotY})`;
  const earY = head[1] - r * 0.74;
  return (
    <g transform={transform}>
      {rig.ears === 'round' ? (
        <>
          {[-1, 1].map((side) => (
            <circle
              key={side}
              cx={head[0] + side * r * 0.62}
              cy={earY}
              r={r * 0.38}
              fill={fur}
              stroke={stroke}
              strokeWidth={3}
            />
          ))}
          {[-1, 1].map((side) => (
            <circle
              key={`in-${side}`}
              cx={head[0] + side * r * 0.62}
              cy={earY}
              r={r * 0.19}
              fill={belly}
              opacity={0.85}
            />
          ))}
        </>
      ) : null}
      {rig.ears === 'long' ? (
        <>
          {[-1, 1].map((side) => (
            <ellipse
              key={side}
              cx={head[0] + side * r * 0.4}
              cy={earY - r * 0.6}
              rx={r * 0.2}
              ry={r * 0.62}
              fill={fur}
              stroke={stroke}
              strokeWidth={3}
            />
          ))}
        </>
      ) : null}
      {rig.ears === 'pointy' ? (
        <>
          {[-1, 1].map((side) => (
            <path
              key={side}
              d={`M ${head[0] + side * r * 0.42} ${earY + r * 0.12} L ${head[0] + side * r * 0.78} ${earY - r * 0.52} L ${head[0] + side * r * 0.9} ${earY + r * 0.2} Z`}
              fill={fur}
              stroke={stroke}
              strokeWidth={3}
              strokeLinejoin="round"
            />
          ))}
        </>
      ) : null}
      {rig.ears === 'flap' ? (
        <>
          {[-1, 1].map((side) => (
            <ellipse
              key={side}
              cx={head[0] + side * r * 1.14}
              cy={head[1] + r * 0.06}
              rx={r * 0.34}
              ry={r * 0.5}
              fill={fur}
              stroke={stroke}
              strokeWidth={3}
            />
          ))}
        </>
      ) : null}

      <circle cx={head[0]} cy={head[1]} r={r} fill={fur} stroke={stroke} strokeWidth={4} />
      {/* 口鼻 */}
      <ellipse cx={head[0]} cy={head[1] + r * 0.34} rx={r * 0.46} ry={r * 0.34} fill={belly} />
      <ellipse cx={head[0]} cy={head[1] + r * 0.18} rx={r * 0.15} ry={r * 0.11} fill="#3b2a20" />
      {/* 眼睛：略微内倾，比正圆更有神 */}
      {[-1, 1].map((side) => (
        <ellipse
          key={side}
          cx={head[0] + side * r * 0.36}
          cy={head[1] - r * 0.12}
          rx={r * 0.1}
          ry={r * 0.13}
          fill="#241812"
        />
      ))}
    </g>
  );
};

/**
 * 梯子（climb 的布景）
 *
 * 没有它，"爬"在画面上就是一只浮在半空的熊——手脚找不到落点，观众读不出
 * 高度变化是在爬。这也是布景锚点的最小形态：道具不只是旁边摆一个图标，
 * 它要提供角色能够接触的表面。
 *
 * 所有几何都来自 setpiece.ts 的 LADDER：横档间距、首根位置、立杆间距。
 * 组件只做投影，不持有任何"这个梯子长什么样"的数字。
 */
const Ladder: React.FC<{
  x: number;
  baseY: number;
  topY: number;
  /** 横档间距：必须等于 climb 每上一阶的高度，手脚才会正好落在横档上 */
  spacing: number;
  project: Projector;
  s: number;
}> = ({ x, baseY, topY, spacing, project, s }) => {
  const railHalf = LADDER.railHalf;
  const wood = '#c98a5a';
  const dark = '#8d5524';
  const left = project([x - railHalf, baseY, 0]);
  const right = project([x + railHalf, baseY, 0]);
  const leftTop = project([x - railHalf, topY, 0]);
  const rightTop = project([x + railHalf, topY, 0]);
  const width = Math.max(9, LADDER.railWidth * s);
  return (
    <g>
      <line x1={left[0]} y1={left[1]} x2={leftTop[0]} y2={leftTop[1]} stroke={dark} strokeWidth={width} strokeLinecap="round" />
      <line x1={right[0]} y1={right[1]} x2={rightTop[0]} y2={rightTop[1]} stroke={dark} strokeWidth={width} strokeLinecap="round" />
      {Array.from({ length: Math.max(2, Math.floor((topY - baseY) / spacing) + 1) }).map((_, i) => {
        const y = baseY + LADDER.rungStart + spacing * i;
        const a = project([x - railHalf, y, 0]);
        const b = project([x + railHalf, y, 0]);
        return (
          <line
            key={i}
            x1={a[0]}
            y1={a[1]}
            x2={b[0]}
            y2={b[1]}
            stroke={wood}
            strokeWidth={width * LADDER.rungWidthRatio}
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
};

/* ------------------------------------------------------------------ *
 * 主组件
 * ------------------------------------------------------------------ */

export const Puppet2D: React.FC<{ scene: Puppet2DScene; frame: number }> = ({ scene, frame }) => {
  const rig = scene.rig;
  const accent = scene.accent || '#4d96ff';
  const scale = rig.scale || 1;

  const toInput = (seg: PuppetSegment): MotionInput => ({
    motion: seg.motion,
    durationFrames: Math.max(1, seg.durationFrames),
    start: seg.start,
    end: seg.end,
    steps: seg.steps,
  });

  /**
   * 播放表：每一段带"入场偏移"carry。
   *
   * 为什么需要 carry：walk 的默认轨迹是"从画面左侧走到正中"（-1.6 → 0）。
   * 如果第二段 point 仍按自己的绝对原点（0）播放，角色会从走到的位置瞬移回原点；
   * 反过来，如果第二段 walk 也按 -1.6 起，角色会瞬移回左侧重走一遍。
   * 所以每段的**起点被安放到上一段的终点**：carry = 上一段终点 − 本段局部起点。
   * 位移量仍由各段自己的 start/end 决定，注册表仍然是唯一真源。
   */
  type Slice = { input: MotionInput; motion: MotionOp; from: number; durationFrames: number; carry: Tri };
  const single: Slice = {
    input: {
      motion: scene.motion,
      durationFrames: Math.max(1, scene.durationFrames),
      start: scene.start,
      end: scene.end,
      steps: scene.steps,
      bounce: scene.bounce,
      ballRestY: scene.ballRestY,
    },
    motion: scene.motion,
    from: 0,
    durationFrames: Math.max(1, scene.durationFrames),
    carry: [0, 0, 0],
  };

  const plan: Slice[] = [];
  if (scene.sequence && scene.sequence.length > 1) {
    /**
     * 拉伸系数：分镜给的时长是"这一幕该演多久"，而最终场景长度由**旁白音频**
     * 决定（实测 8s 的幕会被拉到 8.8s）。不拉伸的后果很具体：动作在第 8 秒
     * 演完，剩下的 0.8 秒角色僵在那里，而旁白还在说——观众看到的是"卡住了"。
     * 只拉不压：场景比动作串短时宁可截掉尾巴，也不把动作挤到走形。
     */
    const planned = scene.sequence.reduce(
      (sum, seg) => sum + Math.max(1, seg.durationFrames),
      0,
    );
    const stretch = scene.durationFrames > planned ? scene.durationFrames / planned : 1;

    let cursor: Tri | null = null;
    let from = 0;
    for (const seg of scene.sequence) {
      const input: MotionInput = {
        ...toInput(seg),
        durationFrames: Math.max(1, Math.round(Math.max(1, seg.durationFrames) * stretch)),
      };
      const startPose = poseAt(input, 0);
      const carry: Tri = cursor
        ? [cursor[0] - startPose.root[0], cursor[1] - startPose.root[1], cursor[2] - startPose.root[2]]
        : [0, 0, 0];
      plan.push({ input, motion: seg.motion, from, durationFrames: input.durationFrames, carry });
      const endPose = poseAt(input, input.durationFrames);
      cursor = [
        endPose.root[0] + carry[0],
        endPose.root[1] + carry[1],
        endPose.root[2] + carry[2],
      ];
      from += input.durationFrames;
    }
  }
  if (!plan.length) plan.push(single);

  const active = plan.find((slice) => frame < slice.from + slice.durationFrames) ?? plan[plan.length - 1];
  // overlayFrom 是"场景进度的比例"，所以分母用场景帧数而不是动作串总帧数
  const totalFrames = Math.max(1, scene.durationFrames);
  const localFrame = clamp(frame - active.from, 0, active.durationFrames);
  const activeIndex = plan.indexOf(active);
  const activeMotion: MotionOp = active.motion;

  const shift = (pose: Pose, carry: Tri): Pose => ({
    ...pose,
    root: [pose.root[0] + carry[0], pose.root[1] + carry[1], pose.root[2] + carry[2]],
  });

  let pose: Pose = shift(poseAt(active.input, localFrame), active.carry);
  /**
   * 段落接缝混合。硬切的现象很具体：走路末帧手臂在体侧、point 首帧手臂已平举，
   * 一帧内跳过去，看起来像掉帧。8 帧线性混合后是"走两步，抬手指过去"。
   * 只混姿态不混位置——位置已在 carry 里保证了连续。
   */
  const BLEND_FRAMES = 8;
  if (activeIndex > 0 && localFrame < BLEND_FRAMES) {
    const prev = plan[activeIndex - 1];
    const prevPose = shift(poseAt(prev.input, prev.durationFrames), prev.carry);
    const t = localFrame / BLEND_FRAMES;
    pose = blendPose(prevPose, pose, t * t * (3 - 2 * t));
  }

  const root = pose.root;
  // 拍球需要球本体：球心由同一个 dribblePose 算出，所以"掌搭球顶"和 3D 一样
  // 是同一个变量决定的，不靠两条时间线对齐。串演序列里不会有 dribble。
  const dribble =
    activeMotion === 'dribble' ? dribblePose({ ...single.input, ...active.input }, localFrame) : null;

  // 朝向：向右走时镜像。没有 rotY 的动作按起点→终点决定，避免"倒着走"
  const dirX = (active.input.end?.[0] ?? 0) - (active.input.start?.[0] ?? 0);
  const facing: 1 | -1 =
    pose.rotY > 0.2 ? 1 : pose.rotY < -0.2 ? -1 : dirX < -0.05 ? -1 : 1;

  /** 串演里的攀爬段：哪怕不是当前段，取景与梯子也要按它算 */
  const climbSlice = plan.find((slice) => slice.motion === 'climb') ?? null;
  const climb = !!climbSlice;
  // 每上一阶的高度：横档间距与它同源，所以手/脚永远落在横档附近
  const climbStep = climbSlice
    ? (poseAt(climbSlice.input, climbSlice.durationFrames).root[1] -
        (climbSlice.input.start?.[1] ?? SPEC.standHipY)) /
      Math.max(1, climbSlice.input.steps ?? 4)
    : 0.21;
  // 梯子要高过举起的手（站地时手在 1.54）：否则爬到一半就没有横档可抓了
  const climbEndY = climbSlice
    ? poseAt(climbSlice.input, climbSlice.durationFrames).root[1] + climbSlice.carry[1]
    : SPEC.standHipY + 0.84;
  const ladderTop = ladderTopY(Math.min(MAX_STAND_Y, climbEndY));
  /**
   * 梯子挂在爬梯段的落点上，不跟当前髋部走。
   * 以前写的是 x={root[0]}——单幕爬梯时两者相等所以看不出问题，
   * 但"走过去再爬"里，走路途中梯子会跟着角色横向平移，像被拖着走。
   */
  const ladderX = climbSlice
    ? (climbSlice.input.start?.[0] ?? 0) + climbSlice.carry[0]
    : root[0];

  /**
   * 取景：两个数分开问。
   *
   *  - contentHeight = 这一幕最高的东西（爬梯时是**梯子顶端**，不是角色头）。
   *    这就是以前漏掉的一项：角色 2.51、梯子 2.75，估低了 0.24 世界单位，
   *    屏幕上就是 60 多像素的越界。
   *  - subjectHeight = **站立身高**，只表示"这个角色该画多大"。用动作终点
   *    的头顶高度会把"爬得高"误当成"角色很大"，全景被无谓地推远
   *    （实测梯子会缩到 365px，画面空一半）。
   *
   * rig.scale 只按"不小于 1"计入：小动物画小一点是造型意图，但取景要给
   * 满尺寸留够空间，否则 giraffe(1.1) 会顶出去。
   */
  const subjectHeight = actorHeadTop(SPEC.standHipY, Math.max(1, scale));
  /**
   * 这一幕最高点：取**所有段落终点**的最大值，而不是只看最后一段。
   * 只看最后一段的话，"爬上去再挥手"这种顺序会把 1.5 的高度算漏。
   */
  const peakY = plan.reduce(
    (top, slice) => Math.max(top, poseAt(slice.input, slice.durationFrames).root[1] + slice.carry[1]),
    SPEC.standHipY,
  );
  const actorTop = actorHeadTop(peakY, Math.max(1, scale));
  const worldHeight = climb ? Math.max(ladderTop, actorTop) : actorTop;
  const shot = scene.shot ?? shotForMotion(climb ? 'climb' : activeMotion);
  const framing = framingFor({ contentHeight: worldHeight, subjectHeight }, shot);

  const cx = framing.centerX;
  const GROUND_Y = framing.groundY;
  // 角色造型缩放仍作用在角色上；取景已经为满尺寸留了空间
  const s = framing.ppu * scale;

  /**
   * 局部坐标（相对髋部）→ 屏幕。
   * 三步：绕髋部施加躯干倾角 → 加髋部世界位置 → 翻 y 并缩放。
   * 所有部件（含四肢）都走这一条路，所以身体倾的时候四肢一定跟着走。
   */
  const cosL = Math.cos(pose.rotZ);
  const sinL = Math.sin(pose.rotZ);
  const project: Projector = (p) => {
    const lx = p[0] * cosL - p[1] * sinL;
    const ly = p[0] * sinL + p[1] * cosL;
    return [cx + (root[0] + lx) * s * facing, GROUND_Y - (root[1] + ly) * s];
  };

  /**
   * 布景投影：只做"世界 → 屏幕"，不施加躯干倾角。
   * 梯子如果跟着角色前倾，就成了"整个梯子被推歪"，而不是"熊贴着梯子"。
   */
  const projectWorld: Projector = (p) => [cx + p[0] * s * facing, GROUND_Y - p[1] * s];

  const head = project([0, SPEC.headY, 0.02]);
  const headR = SPEC.headR * s;
  const top = GROUND_Y - (root[1] + (SPEC.headY + SPEC.headR) * cosL) * s;

  const bodyCenter = project([0, 0.15, 0]);
  const bodyW = SPEC.torsoR * s * 0.95;
  const bodyH = 0.33 * s;
  const lean = (pose.rotZ * 180) / Math.PI;
  const hipPoint = project([0, 0, 0]);
  const torsoTransform = `rotate(${lean} ${hipPoint[0]} ${hipPoint[1]})`;
  // 阴影永远在地面上，不参与角色旋转
  const shadowX = cx + root[0] * s * facing;

  const legColor = shade(rig.fur, 0.84);
  const armColor = rig.fur;

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <svg
        width={1920}
        height={1080}
        viewBox="0 0 1920 1080"
        style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
      >
        {/* 道具画在角色之前：被手指着的东西应该在身体后面，不然会挡住脸 */}
        {(scene.props || []).map((p, i) => (
          <g key={`prop-${i}`} transform={`translate(${p.x} ${p.y})`}>
            {/* node 的绘制盒子是 -80..80，按目标尺寸缩放 */}
            <g transform={`scale(${p.size / 160})`}>{p.node}</g>
            {p.label ? (
              // 标签放道具上方：地面线以下是字幕区，写在下面会被字幕压住
              <text
                y={-p.size / 2 - 14}
                textAnchor="middle"
                fontSize={34}
                fontWeight={900}
                fill={accent}
              >
                {p.label}
              </text>
            ) : null}
          </g>
        ))}

        {/* 梯子必须在角色之前画（背景层），否则会盖住手脚 */}
        {climb ? (
          <Ladder
            x={ladderX}
            baseY={0}
            topY={ladderTop}
            spacing={Math.max(LADDER.minRungSpacing, climbStep)}
            project={projectWorld}
            s={s}
          />
        ) : null}

        {/* 贴地假阴影：跟着髋部走，离地越高越淡（climb 时才明显） */}
        <ellipse
          cx={shadowX}
          cy={GROUND_Y}
          rx={Math.max(40, bodyW * 1.15)}
          ry={Math.max(9, bodyW * 0.2)}
          fill="#1b2a33"
          opacity={clamp(0.2 - (root[1] - SPEC.standHipY) * 0.26, 0.02, 0.2)}
        />

        {/* 远侧：先画 L，躯干与头压在上面，R 侧留到最后 */}
        <Limb2D
          pivot={[-SPEC.hipJoint[0], SPEC.hipJoint[1], SPEC.hipJoint[2]]}
          target={pose.footL}
          bend={0.16}
          maxLen={SPEC.legLen}
          width={0.18 * s}
          color={legColor}
          capColor={legColor}
          capRadius={0.105 * s}
          capFlat={0.72}
          project={project}
        />
        <g transform={torsoTransform}>
          {/* 躯干 + 肚皮 */}
          <ellipse
            cx={bodyCenter[0]}
            cy={bodyCenter[1]}
            rx={bodyW}
            ry={bodyH}
            fill={rig.fur}
            stroke={shade(rig.fur)}
            strokeWidth={4}
          />
          <ellipse
            cx={bodyCenter[0]}
            cy={bodyCenter[1] + bodyH * 0.1}
            rx={bodyW * 0.6}
            ry={bodyH * 0.7}
            fill={rig.belly}
            opacity={0.95}
          />
          {/* 尾巴：从躯干侧后方露出一点，纯装饰但让剪影不平 */}
          <ellipse
            cx={bodyCenter[0] - facing * bodyW * 0.92}
            cy={bodyCenter[1] + bodyH * 0.34 + pose.tailSwing * 10}
            rx={bodyW * (rig.tail === 'bushy' ? 0.32 : 0.2)}
            ry={bodyH * (rig.tail === 'bushy' ? 0.28 : 0.18)}
            fill={rig.tail === 'stub' ? rig.belly : rig.fur}
            stroke={shade(rig.fur)}
            strokeWidth={3}
          />
        </g>

        <Head2D rig={rig} head={head} r={headR} tilt={pose.headTilt} />

        {/* 手臂统一画在头之后：攀爬时手要举过头顶，压在躯干下面等于没举手 */}
        <Limb2D
          pivot={[-SPEC.shoulder[0], SPEC.shoulder[1], SPEC.shoulder[2]]}
          target={pose.handL}
          bend={-0.16}
          maxLen={SPEC.armLen}
          width={0.17 * s}
          color={armColor}
          capColor={rig.belly}
          capRadius={0.082 * s}
          project={project}
        />

        {/* 近侧 */}
        <Limb2D
          pivot={[SPEC.hipJoint[0], SPEC.hipJoint[1], SPEC.hipJoint[2]]}
          target={pose.footR}
          bend={0.16}
          maxLen={SPEC.legLen}
          width={0.18 * s}
          color={legColor}
          capColor={legColor}
          capRadius={0.105 * s}
          capFlat={0.72}
          project={project}
        />
        <Limb2D
          pivot={[SPEC.shoulder[0], SPEC.shoulder[1], SPEC.shoulder[2]]}
          target={pose.handR}
          bend={-0.16}
          maxLen={SPEC.armLen}
          width={0.17 * s}
          color={armColor}
          capColor={rig.belly}
          capRadius={0.082 * s}
          project={project}
        />

        {/* 球：画在近侧肢体之后——球在小熊身前，压住前臂才像"手在球上" */}
        {dribble
          ? (() => {
              // 球是世界坐标，转成相对髋部的局部坐标再投影（dribble 的 rotZ=0，等价直传）
              const bp = project([
                dribble.ball[0] - root[0],
                dribble.ball[1] - root[1],
                dribble.ball[2],
              ]);
              const r = BALL_RADIUS * s;
              const groundP = project([dribble.ball[0] - root[0], -root[1], dribble.ball[2]]);
              return (
                <g>
                  <ellipse
                    cx={groundP[0]}
                    cy={GROUND_Y}
                    rx={r * (0.9 - (dribble.ball[1] - 0.27) * 0.3)}
                    ry={r * 0.26}
                    fill="#1b2a33"
                    opacity={clamp(0.2 - (dribble.ball[1] - 0.27) * 0.18, 0.04, 0.2)}
                  />
                  <g transform={`translate(${bp[0]} ${bp[1]}) scale(${1 / dribble.squash} ${dribble.squash})`}>
                    <circle r={r} fill="#ef5f58" stroke="#c8443e" strokeWidth={5} />
                    {/* 球缝画在球面内部：画成外圈的弧会被读成"红色球带蓝边" */}
                    <path
                      d={`M ${-r * 0.96} ${-r * 0.16} Q 0 ${r * 0.5} ${r * 0.96} ${-r * 0.16}`}
                      fill="none"
                      stroke={accent}
                      strokeWidth={r * 0.13}
                      opacity={0.85}
                    />
                    <path
                      d={`M ${-r * 0.18} ${-r * 0.97} Q ${r * 0.42} 0 ${-r * 0.18} ${r * 0.97}`}
                      fill="none"
                      stroke={accent}
                      strokeWidth={r * 0.13}
                      opacity={0.85}
                    />
                  </g>
                </g>
              );
            })()
          : null}
      </svg>

      {/* 名条：与 3D 舞台同一位置（左上），不压地面也不压字幕 */}
      {scene.label ? (
        <div
          style={{
            position: 'absolute',
            left: 64,
            top: 132,
            padding: '8px 26px',
            borderRadius: 999,
            background: accent,
            color: '#fff',
            fontSize: 34,
            fontWeight: 900,
            whiteSpace: 'nowrap',
            boxShadow: '0 8px 18px rgba(0,0,0,0.16)',
          }}
        >
          {scene.label}
        </div>
      ) : null}

      {/* 覆盖层：对话气泡这类 HTML 元素挂在角色之上。
          出场时刻可延后（overlayFrom）：多动作幕里，气泡从第一帧就挂着等于剧透，
          孩子还没看到"指"，台词已经先出现了。 */}
      {scene.overlay ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity:
              scene.overlayFrom === undefined
                ? 1
                : clamp((frame / totalFrames - scene.overlayFrom) / 0.04, 0, 1),
          }}
        >
          {scene.overlay}
        </div>
      ) : null}

      {/* 越界自检：climb 的参数如果给得太高，角色会顶出画面。
          这里不做自动缩放（那会让同一部片子里角色忽大忽小），
          只把状态暴露给上层——渲染服务的抽帧检查会看到这个标记。 */}
      {top < 90 ? <div data-puppet-warning="head-cropped" style={{ display: 'none' }} /> : null}
    </div>
  );
};
