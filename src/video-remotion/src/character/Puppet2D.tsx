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
  ACTOR,
  BALL_RADIUS,
  SPEC,
  blendPose,
  clamp,
  dribblePose,
  gripLocal,
  poseAt,
  smooth,
  type ActorRig,
  type MotionInput,
  type MotionOp,
  type Pose,
  type Tri,
} from './pose';
import {
  framingFor,
  propBounds,
  shotForMotion,
  unionAll,
  type Bounds,
  type Shot,
} from './stage-layout';
import { LADDER, actorHeadTop, ladderBounds, ladderTopY, slideBounds } from './setpiece';
import { WorldLayer } from './WorldLayer';
import { cameraForWorld, duoStations, normalizeWorld, worldLadderX } from './world';

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

/**
 * 同场的第二个角色。
 *
 * 它不是"再画一个人"那么简单：递给与一起抬的语义是**两个身体之间的接触**，
 * 单角色骨架演不了，所以这两种动词以前被挡在徽章分支里。给一个人配一份
 * 独立的播放表、共用一个相机之后，双人幕与单人幕用的是同一套人物语言。
 */
export type PuppetCoStar = {
  rig: ActorRig;
  motion: MotionOp;
  sequence?: PuppetSegment[];
  durationFrames?: number;
  start?: Tri;
  end?: Tri;
  steps?: number;
  /**
   * 朝向。不给就默认"面对主角色"——双人动作的语义是对着那个人做事；
   * 按位移方向推会在双方都不动时取 +1，画出来是背对着对方递东西。
   */
  facing?: 1 | -1;
};

/** 手里拿着的道具：位置由手算，不是屏幕坐标 */
export type PuppetCarry = {
  node: React.ReactNode;
  /** 世界单位的尺寸（与 props.size 同一套：换算成像素时乘 ppu） */
  size: number;
  label?: string;
  /**
   * 在谁手里：
   *  - `self`：主角色一直拿着；
   *  - `coStar`：副角色拿着；
   *  - `shared`：两人一起托着，停在两手之间（一起抬）；
   *  - `handover`：沿弧线从主角色的手移到副角色的手（递给）。
   * 缺省：有副角色就 `shared`，否则 `self`。
   */
  by?: 'self' | 'coStar' | 'shared' | 'handover';
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
   * 布景道具。坐标是**世界单位**（与角色、布景同一套坐标），node 由调用方
   * 预先渲染成 SVG 片段——组件本身不认识"滑梯""皮球"这些业务道具，只负责
   * 把它们按场景需要摆到位。这样新增道具不用改这个文件。
   *
   * 用世界坐标而不是屏幕坐标，是为了让道具跟着取景一起缩放/平移，并且能
   * 参与内容包围盒——否则"被指着的东西"会被摆到画面外，或者平板地贴在
   * 背景上不随角色变大。
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
  /**
   * 场地。整节课共用同一个世界（滑梯在哪、公园长什么样），由后端在每一幕
   * 写同一份数据。给了它就走"世界 + 镜头"的取景，没给（旧缓存分镜）仍按
   * 这一幕自己拟合——两条路径的画面不可能一样，但旧任务不会因此崩掉。
   */
  world?: unknown;
  /**
   * 这一幕用到的那件**世界装置**（目前只有滑梯）。
   * 不是"道具"：滑梯在场地里本来就在，这一幕要拍的是"角色与它互动"，
   * 所以取景要把整座滑梯框进来，而不是在旁边摆一个滑梯图标。
   */
  setpiece?: string;
  /** 同场的第二个角色（双人幕）。缺省时这个文件的行为与只有一个人时完全一致 */
  coStar?: PuppetCoStar;
  /** 手里的道具（递给 / 一起抬）。位置由两个角色的手算出来 */
  carry?: PuppetCarry;
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
 * 播放表：一个角色一条
 *
 * 上一版这段写在组件体里，等于"这个文件只可能有一个角色"。后果不是少画一个人，
 * 而是"两个身体之间的动作"（递给 / 一起抬）被迫留在徽章分支：同一节课里，
 * 同一个角色在双人幕是圆形头像、在单人幕是全身，切幕时人物语言就跳了。
 *
 * 播放表抽出来之后，第二个角色不是特例，只是**同一个函数被调用第二次**。
 * ------------------------------------------------------------------ */

type Slice = {
  input: MotionInput;
  motion: MotionOp;
  from: number;
  durationFrames: number;
  carry: Tri;
};

/** 一个角色的动作输入。主角色与副角色共用，不为"第二个人"另写一份解析 */
type ActorPart = {
  motion: MotionOp;
  sequence?: PuppetSegment[];
  durationFrames: number;
  start?: Tri;
  end?: Tri;
  steps?: number;
  bounce?: { periodFrames: number; height: number };
  ballRestY?: number;
};

function buildPlan(part: ActorPart): Slice[] {
  const single: Slice = {
    input: {
      motion: part.motion,
      durationFrames: Math.max(1, part.durationFrames),
      start: part.start,
      end: part.end,
      steps: part.steps,
      bounce: part.bounce,
      ballRestY: part.ballRestY,
    },
    motion: part.motion,
    from: 0,
    durationFrames: Math.max(1, part.durationFrames),
    carry: [0, 0, 0],
  };

  const plan: Slice[] = [];
  if (part.sequence && part.sequence.length > 1) {
    /**
     * 拉伸系数：分镜给的时长是"这一幕该演多久"，而最终场景长度由**旁白音频**
     * 决定（实测 8s 的幕会被拉到 8.8s）。不拉伸的后果很具体：动作在第 8 秒
     * 演完，剩下的 0.8 秒角色僵在那里，而旁白还在说——观众看到的是"卡住了"。
     * 只拉不压：场景比动作串短时宁可截掉尾巴，也不把动作挤到走形。
     */
    const planned = part.sequence.reduce((sum, seg) => sum + Math.max(1, seg.durationFrames), 0);
    const stretch = part.durationFrames > planned ? part.durationFrames / planned : 1;

    let cursor: Tri | null = null;
    let from = 0;
    for (const seg of part.sequence) {
      const input: MotionInput = {
        motion: seg.motion,
        durationFrames: Math.max(1, Math.round(Math.max(1, seg.durationFrames) * stretch)),
        start: seg.start,
        end: seg.end,
        steps: seg.steps,
      };
      /**
       * 入场偏移 carry：walk 的默认轨迹是"从画面左侧走到正中"（-1.6 → 0）。
       * 如果第二段 point 仍按自己的绝对原点（0）播放，角色会瞬移回原点；
       * 反过来，如果第二段 walk 也按 -1.6 起，角色会瞬移回左侧重走一遍。
       * 所以每段的**起点被安放到上一段的终点**。
       */
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
  return plan;
}

/** 取某一帧的姿态：定位当前段、做段落接缝混合、叠加入场偏移 */
function playAt(plan: Slice[], frame: number) {
  const active = plan.find((slice) => frame < slice.from + slice.durationFrames) ?? plan[plan.length - 1];
  const localFrame = clamp(frame - active.from, 0, active.durationFrames);
  const index = plan.indexOf(active);
  const shift = (p: Pose, carry: Tri): Pose => ({
    ...p,
    root: [p.root[0] + carry[0], p.root[1] + carry[1], p.root[2] + carry[2]],
  });

  let pose: Pose = shift(poseAt(active.input, localFrame), active.carry);
  /**
   * 段落接缝混合。硬切的现象很具体：走路末帧手臂在体侧、point 首帧手臂已平举，
   * 一帧内跳过去，看起来像掉帧。8 帧线性混合后是"走两步，抬手指过去"。
   * 只混姿态不混位置——位置已在 carry 里保证了连续。
   */
  const BLEND_FRAMES = 8;
  if (index > 0 && localFrame < BLEND_FRAMES) {
    const prev = plan[index - 1];
    const prevPose = shift(poseAt(prev.input, prev.durationFrames), prev.carry);
    const t = localFrame / BLEND_FRAMES;
    pose = blendPose(prevPose, pose, t * t * (3 - 2 * t));
  }
  return { active, localFrame, index, pose };
}

/**
 * 轨迹包围盒：每段取 5 个采样点。
 * 不能只看段落端点——`alongPath` 现在是线性的，但动作原语随时可能改成
 * 带弧线/弹跳的轨迹，那时端点就不再是极值，漏采样就会把角色裁掉半截。
 */
function planBounds(plan: Slice[], drawScale: number): Bounds {
  const half = (ACTOR.bodyWidth / 2) * drawScale;
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const slice of plan) {
    const n = 4;
    for (let i = 0; i <= n; i++) {
      const p = poseAt(slice.input, (slice.durationFrames * i) / n);
      const x = p.root[0] + slice.carry[0];
      const y = p.root[1] + slice.carry[1];
      minX = Math.min(minX, x - half);
      maxX = Math.max(maxX, x + half);
      maxY = Math.max(maxY, actorHeadTop(y, drawScale));
    }
  }
  return { minX, maxX, minY: 0, maxY };
}

/* ------------------------------------------------------------------ *
 * 一个角色
 *
 * 角色之间**只共享相机**，不共享姿态、不共享缩放基准以外的任何东西。
 * 造型缩放（rig.scale）作用在角色自己身上：小松鼠比小熊矮，但两者的世界
 * 位置、与滑梯的比例都由同一个 ppu 决定——这正是"比例一致"的含义。
 * ------------------------------------------------------------------ */

const Figure2D: React.FC<{
  rig: ActorRig;
  pose: Pose;
  facing: 1 | -1;
  /** 统一相机：画面中心 x、地面行、每世界单位多少像素 */
  camera: { cx: number; groundY: number; ppu: number };
  /** 造型缩放（rig.scale） */
  scale: number;
  accent: string;
  dribble: { ball: Tri; squash: number } | null;
  /** 远景角色压暗一点，前后关系不用描边也读得出来 */
  dim?: number;
}> = ({ rig, pose, facing, camera, scale, accent, dribble, dim = 1 }) => {
  const { cx, groundY, ppu } = camera;
  const s = ppu * scale;
  const root = pose.root;

  /**
   * 局部坐标（相对髋部）→ 屏幕。
   *
   * 两步张开的写法是必要的：**世界位置不镜像，只有角色自身的左右镜像**。
   * 以前写成 `(root[0] + lx) * facing`，位置和形状一起翻——后果不是角色走反，
   * 而是"取景按世界坐标算、画面按镜像后的坐标画"：
   *   - 向左走的幕，包围盒算在左半边（平移把左半边让出来），角色却画在右半边，
   *     半个身子出画；
   *   - 布景和道具摆在角色旁边时，角色一转身它们就跳到另一侧。
   * 现在 root 走世界坐标、local 走 facing，取景与绘制用的是同一套坐标。
   */
  const cosL = Math.cos(pose.rotZ);
  const sinL = Math.sin(pose.rotZ);
  const project: Projector = (p) => {
    const lx = p[0] * cosL - p[1] * sinL;
    const ly = p[0] * sinL + p[1] * cosL;
    /**
     * 横向：世界位置走 ppu，身体尺寸走 s。**两者不能混**。
     *
     * 上一版写的是 `root[0] * s`（s = ppu × rig.scale），于是"体型缩小"顺带把
     * 站位也搬了：松鼠（0.82）站在世界 x=−1.6 时，画面上出现在 −1.31——离
     * 画面中心近了 18%。单角色幕看不出来（root[0]=0），双人幕一眼就露馅：
     * 站位是算出来的，两个人体型的差异却把间距压缩了。
     */
    return [cx + root[0] * ppu + lx * s * facing, groundY - (root[1] + ly) * s];
  };

  /**
   * 世界物体（球、地上的影子）只做"世界 → 屏幕"，**不乘角色造型缩放**。
   * 球不会因为拍球的是松鼠就变小：它不属于角色，属于世界。
   */
  const projectWorld: Projector = (p) => [cx + p[0] * ppu, groundY - p[1] * ppu];

  const head = project([0, SPEC.headY, 0.02]);
  const headR = SPEC.headR * s;
  const bodyCenter = project([0, 0.15, 0]);
  const bodyW = SPEC.torsoR * s * 0.95;
  const bodyH = 0.33 * s;
  const lean = (pose.rotZ * 180) / Math.PI;
  const hipPoint = project([0, 0, 0]);
  const torsoTransform = `rotate(${lean} ${hipPoint[0]} ${hipPoint[1]})`;
  // 阴影永远在地面上，不参与角色旋转，也不参与镜像（它标的是世界里的落点）
  const shadowX = cx + root[0] * ppu;

  const legColor = shade(rig.fur, 0.84);
  const armColor = rig.fur;

  return (
    <g opacity={dim}>
      {/* 贴地假阴影：跟着髋部走，离地越高越淡（climb 时才明显） */}
      <ellipse
        cx={shadowX}
        cy={groundY}
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
            const bp = projectWorld(dribble.ball);
            const r = BALL_RADIUS * ppu;
            const groundP = projectWorld([dribble.ball[0], 0, dribble.ball[2]]);
            return (
              <g>
                <ellipse
                  cx={groundP[0]}
                  cy={groundY}
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
    </g>
  );
};

/* ------------------------------------------------------------------ *
 * 主组件
 * ------------------------------------------------------------------ */

export const Puppet2D: React.FC<{ scene: Puppet2DScene; frame: number }> = ({ scene, frame }) => {
  const mainRig = scene.rig;
  const accent = scene.accent || '#4d96ff';
  const mainScale = mainRig.scale || 1;
  const world = normalizeWorld(scene.world);

  const coSpec = scene.coStar ?? null;
  const coRig = coSpec ? coSpec.rig : null;
  const coScale = coRig ? coRig.scale || 1 : 1;

  // overlayFrom 是"场景进度的比例"，所以分母用场景帧数而不是动作串总帧数
  const totalFrames = Math.max(1, scene.durationFrames);

  /**
   * 站位。双人幕的两个人不是"各站各的"：间距由手臂够得着决定，
   * 有滑梯时整对挪到爬梯左侧的空地（见 world.duoStations）。
   *
   * 站位只依赖场地几何，与"这一节课讲什么"无关；算在渲染层是因为**场地几何
   * 在渲染层**（后端的注册表只有滑梯坐标，没有"空地"这个概念）。
   */
  const stations = coSpec ? duoStations(world ?? { venue: 'meadow' }) : null;

  const mainPlan = buildPlan({
    motion: scene.motion,
    sequence: scene.sequence,
    durationFrames: totalFrames,
    start: scene.start,
    end: scene.end,
    steps: scene.steps,
    bounce: scene.bounce,
    ballRestY: scene.ballRestY,
  });
  const coPlan = coSpec
    ? buildPlan({
        motion: coSpec.motion,
        sequence: coSpec.sequence,
        durationFrames: coSpec.durationFrames ?? totalFrames,
        start: coSpec.start,
        end: coSpec.end,
        steps: coSpec.steps,
      })
    : null;

  // 站位是"整条播放表的平移"：位置写在世界坐标里，不写进每个动作的默认轨迹
  if (stations && coPlan) {
    for (const slice of mainPlan) slice.carry[0] += stations[0];
    for (const slice of coPlan) slice.carry[0] += stations[1];
  }

  /**
   * 场地与"梯子落点"。
   *
   * 有了世界之后，爬梯的横向落点不再由动作注册表单独决定：梯子长在滑梯上，
   * 位置由滑梯几何算（worldLadderX）。所以整条动作串被整体平移，让爬梯段
   * 正好落在世界里的那把梯子上——平移量很可能只有 0.05 个单位，但它是
   * **算式**，不是"刚好差不多"：改滑梯尺寸时手不会突然悬在梯子外面。
   *
   * 只对主角色做：梯子是这一幕主角色在用的装置，副角色不该被拽到梯子旁边。
   */
  const climbSlice = mainPlan.find((slice) => slice.motion === 'climb') ?? null;
  const worldLadder = world ? worldLadderX(world) : null;
  if (worldLadder !== null && climbSlice) {
    const climbStartX = (climbSlice.input.start?.[0] ?? 0) + climbSlice.carry[0];
    const dx = worldLadder - climbStartX;
    for (const slice of mainPlan) slice.carry[0] += dx;
  }

  const main = playAt(mainPlan, frame);
  const co = coPlan ? playAt(coPlan, frame) : null;
  const pose = main.pose;
  const activeMotion: MotionOp = main.active.motion;
  const root = pose.root;

  // 拍球需要球本体：球心由同一个 dribblePose 算出，所以"掌搭球顶"和 3D 一样
  // 是同一个变量决定的，不靠两条时间线对齐。串演序列里不会有 dribble。
  const dribble =
    activeMotion === 'dribble'
      ? dribblePose(main.active.input, main.localFrame)
      : null;

  // 朝向：向右走时镜像。没有 rotY 的动作按起点→终点决定，避免"倒着走"
  const dirX = (main.active.input.end?.[0] ?? 0) - (main.active.input.start?.[0] ?? 0);
  const facing: 1 | -1 =
    pose.rotY > 0.2 ? 1 : pose.rotY < -0.2 ? -1 : dirX < -0.05 ? -1 : 1;
  /**
   * 副角色的朝向：默认**面对主角色**。
   * 双人动作的语义是"对着那个人做事"，而双方都不动时（hold）位移方向为 0，
   * 按位移推会取 +1——画出来是"背对着对方递东西"。
   */
  const coFacing: 1 | -1 = coSpec?.facing ?? (facing === 1 ? -1 : 1);

  /** 串演里的攀爬段：哪怕不是当前段，取景与梯子也要按它算 */
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
   * 兜底路径（没有世界数据的旧分镜）的梯子位置：挂在爬梯段落点上。
   * 有世界时梯子长在滑梯上，位置由 worldLadderX 给出，这里不参与。
   */
  const fallbackLadderX = climbSlice
    ? (climbSlice.input.start?.[0] ?? 0) + climbSlice.carry[0]
    : root[0];

  /**
   * 取景：分两条路。
   *
   * **有世界（新路径）**：缩放由 worldScale 决定，整节课一个值；景别只做
   * 1.0~1.5 倍变焦，镜头按内容平移。于是熊在每一幕都是同一个大小，
   * 熊与滑梯的比例永远是同一个比例——比例一致性来自"世界只定义一次"，
   * 不来自"每一幕都拟合一遍"。
   *
   * **没有世界（旧分镜缓存）**：仍按这一幕自己的包围盒拟合。这条路只为
   * 不崩而保留，画面与改动前一致。
   *
   * subjectHeight 只在旧路径里用：动作终点的头顶高度会把"爬得高"误当成
   * "角色很大"，全景被无谓推远（实测梯子会缩到 365px，画面空一半）。
   */
  const subjectHeight = Math.max(
    actorHeadTop(SPEC.standHipY, Math.max(1, mainScale)),
    coRig ? actorHeadTop(SPEC.standHipY, Math.max(1, coScale)) : 0,
  );

  /** 两个人 + 道具 + 正在使用的装置，全都进焦点盒：谁都不能被裁 */
  const actorBox = unionAll(
    [
      planBounds(mainPlan, Math.max(1, mainScale)),
      ...(coPlan ? [planBounds(coPlan, Math.max(1, coScale))] : []),
    ],
  );

  const shot = scene.shot ?? (coSpec ? 'medium' : shotForMotion(climb ? 'climb' : activeMotion));

  /**
   * 这一幕要装进画面的东西：角色轨迹 + 道具 + （如果这一幕在用滑梯）整座滑梯。
   *
   * 用滑梯时把滑梯框进来，是"爬/指/滑"这类幕的语义要求：孩子要同时看到
   * "他在哪"和"他在对什么做动作"。其余幕只框角色，镜头就能稍微推近。
   * 两者的缩放都夹在 [基准缩放, 基准缩放 × 焦距] 之间（见 cameraForWorld），
   * 所以不存在"这一幕为了装下滑梯把熊缩小"那种比例漂移。
   */
  const focusBox = unionAll([
    actorBox,
    ...(scene.props || []).map(propBounds),
    ...(world && world.slide && scene.setpiece === 'slide'
      ? [slideBounds(world.slide.start, world.slide.end, Math.max(1, mainScale))]
      : []),
  ]);

  const ladderX = worldLadder ?? fallbackLadderX;
  const worldCamera = world ? cameraForWorld(world, shot, focusBox) : null;
  const framing = worldCamera
    ? worldCamera
    : framingFor(
        {
          bounds: unionAll([
            actorBox,
            ...(climb ? [ladderBounds(fallbackLadderX, ladderTop)] : []),
            ...(scene.props || []).map(propBounds),
          ]),
          subjectHeight,
        },
        shot,
      );

  const camera = {
    cx: framing.originX,
    groundY: framing.groundY,
    ppu: framing.ppu,
  };
  const GROUND_Y = framing.groundY;
  const s = framing.ppu * mainScale;

  /**
   * 布景投影：只做"世界 → 屏幕"，不施加躯干倾角、也不施加朝向镜像。
   * 梯子如果跟着角色前倾，就成了"整个梯子被推歪"；跟着镜像，就成了
   * "角色一转身梯子瞬移到另一边"。物理世界不会因为角色转向而重排。
   *
   * 用 ppu 而不是 s：布景属于世界，不随角色体型缩放（松鼠爬梯时梯子
   * 不该跟着缩 18%）。
   */
  const ppu = framing.ppu;
  const projectWorld: Projector = (p) => [camera.cx + p[0] * ppu, GROUND_Y - p[1] * ppu];

  const mainTop = GROUND_Y - (root[1] + (SPEC.headY + SPEC.headR) * Math.cos(pose.rotZ)) * s;

  /* ---------------- 手里的东西 ---------------- */

  /**
   * 递到对方手里 / 两人一起托着的道具。
   *
   * 挂点用的是**手**（pose.gripLocal），但算到最后一步是屏幕坐标，而且复用
   * 绘制身体时的那条投影——不是"先换成世界坐标、再投一次"。原因是体型缩放：
   * 身体的纵向按 s 画（小动物矮一点）、横向按 ppu 放（站位必须准），两次投影
   * 差的那一点落在道具上就是"苹果悬在掌心外半寸"。
   */
  const pawOnScreen = (p: Pose, f: 1 | -1, scale: number): [number, number] => {
    const g = gripLocal(p);
    const c = Math.cos(p.rotZ);
    const sn = Math.sin(p.rotZ);
    const sx = camera.ppu * scale;
    const lx = g[0] * c - g[1] * sn;
    const ly = g[0] * sn + g[1] * c;
    return [camera.cx + p.root[0] * camera.ppu + lx * sx * f, camera.groundY - (p.root[1] + ly) * sx];
  };
  const mainGrip = pawOnScreen(pose, facing, mainScale);
  const coGrip = co && coRig ? pawOnScreen(co.pose, coFacing, coScale) : null;

  let carryPos: [number, number] | null = null;
  if (scene.carry) {
    const by = scene.carry.by ?? (coGrip ? 'shared' : 'self');
    if (by === 'self' || !coGrip) {
      carryPos = mainGrip;
    } else if (by === 'coStar') {
      carryPos = coGrip;
    } else if (by === 'shared') {
      // 两人各托一侧：停在两手之间，随呼吸微微起伏（两只手是同一个姿态函数，所以是同步的）
      carryPos = [
        (mainGrip[0] + coGrip[0]) / 2,
        (mainGrip[1] + coGrip[1]) / 2 + Math.sin(frame / 15) * 0.012 * camera.ppu,
      ];
    } else {
      /**
       * 递给：沿一条很浅的弧线从主角色的手移到副角色的手。
       * 起点与终点都是**当帧的手**，所以两个人一边呼吸一边递，道具也不会脱手。
       *
       * 弧高只有 0.07：抬手 0.22（第一版）时，苹果在两人手之间飞到高处，
       * 画面上是"东西悬在半空"——两只手都够不着它，读者就读不出"在递"。
       * 递东西本来就是贴着手背过去，弧线只需要破掉直线平移的死板。
       */
      const t = smooth(clamp((frame / totalFrames - 0.18) / 0.46, 0, 1));
      carryPos = [
        mainGrip[0] + (coGrip[0] - mainGrip[0]) * t,
        mainGrip[1] + (coGrip[1] - mainGrip[1]) * t + Math.sin(Math.PI * t) * 0.07 * camera.ppu,
      ];
    }
  }

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* 场地：天、地、围栏、树、长椅、沙坑、摩天轮，以及整座滑梯（含爬梯）。
          它用与角色同一个相机投影，所以放大缩小时"熊和滑梯的比例"不会变。 */}
      {world && worldCamera ? <WorldLayer world={world} camera={worldCamera} frame={frame} /> : null}
      <svg
        width={1920}
        height={1080}
        viewBox="0 0 1920 1080"
        style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
      >
        {/* 道具画在角色之前：被手指着的东西应该在身体后面，不然会挡住脸。
            坐标是世界单位，和角色/布景走同一条投影——取景一旦平移（内容偏左
            就整体右移），屏幕坐标的道具不会跟着动，角色和道具就会错位。 */}
        {(scene.props || []).map((p, i) => {
          const [px, py] = projectWorld([p.x, p.y, 0]);
          const sizePx = p.size * ppu;
          return (
            <g key={`prop-${i}`} transform={`translate(${px} ${py})`}>
              {/* node 的绘制盒子是 -80..80，按目标尺寸缩放 */}
              <g transform={`scale(${sizePx / 160})`}>{p.node}</g>
              {p.label ? (
                // 标签放道具上方：地面线以下是字幕区，写在下面会被字幕压住
                <text
                  y={-sizePx / 2 - 14}
                  textAnchor="middle"
                  fontSize={34}
                  fontWeight={900}
                  fill={accent}
                  stroke="#ffffff"
                  strokeWidth={6}
                  paintOrder="stroke"
                >
                  {p.label}
                </text>
              ) : null}
            </g>
          );
        })}

        {/* 梯子必须在角色之前画（背景层），否则会盖住手脚。
            有世界时梯子由 WorldLayer 画——它是滑梯的一部分，不是这一幕的道具；
            这里只保留旧分镜（没有世界数据）的兜底。 */}
        {climb && !worldCamera ? (
          <Ladder
            x={ladderX}
            baseY={0}
            topY={ladderTop}
            spacing={Math.max(LADDER.minRungSpacing, climbStep)}
            project={projectWorld}
            s={ppu}
          />
        ) : null}

        {/* 第二个人先画：双人幕的主角色是"接受动作"的那一侧，压在上面更清楚 */}
        {co && coRig ? (
          <Figure2D
            rig={coRig}
            pose={co.pose}
            facing={coFacing}
            camera={camera}
            scale={coScale}
            accent={accent}
            dribble={null}
            dim={0.97}
          />
        ) : null}

        <Figure2D
          rig={mainRig}
          pose={pose}
          facing={facing}
          camera={camera}
          scale={mainScale}
          accent={accent}
          dribble={dribble ? { ball: dribble.ball, squash: dribble.squash } : null}
        />

        {/* 手里的东西画在角色之后：捧在身前的东西压住肚皮才像"拿着" */}
        {scene.carry && carryPos
          ? (() => {
              const [px, py] = carryPos;
              const sizePx = scene.carry.size * ppu;
              return (
                <g transform={`translate(${px} ${py})`}>
                  <g transform={`scale(${sizePx / 160})`}>{scene.carry.node}</g>
                  {scene.carry.label ? (
                    <text
                      y={-sizePx / 2 - 14}
                      textAnchor="middle"
                      fontSize={34}
                      fontWeight={900}
                      fill={accent}
                      stroke="#ffffff"
                      strokeWidth={6}
                      paintOrder="stroke"
                    >
                      {scene.carry.label}
                    </text>
                  ) : null}
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
      {mainTop < 90 ? <div data-puppet-warning="head-cropped" style={{ display: 'none' }} /> : null}
    </div>
  );
};
