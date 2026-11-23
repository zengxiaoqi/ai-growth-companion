/**
 * 动作片段（motion clips）：**原地动作是数据，不是代码**。
 *
 * 和 `venue-recipes.ts` 同一个范式：可枚举的是**渲染原语**（十个姿态通道），
 * 不是内容（动作会一直长）。加"挥手"不该写函数、改联合类型、补模板 token。
 *
 * 边界（重要，别在这里加 `climb` / `slide`）：
 *   只有"只动自己身体"的动作才能用关键帧表达。
 *   一旦动作里出现"贴到世界里的某个东西上"——手要落在第 3 根梯子横档、
 *   身体贴着滑面、掌球同帧接触、从 A 点走到 B 点——它就是**约束**，
 *   必须留在 `pose.ts` 的函数里。硬塞进数据表等于把梯子坐标抄进数据，
 *   梯子一改动作就错位，比不做更糟。
 *
 * 本文件刻意只 `import type`：没有运行时依赖，所以后端测试可以直接 import
 * 它来给"后端能演 == 渲染层能演"做守卫，不会把 React/three 拖进 Nest。
 */

import type { Tri } from './pose';

/**
 * 一帧的姿态增量。**没写的通道自动取站姿**，所以一个只动右手的动作
 * 不需要把十个通道抄一遍。
 */
export type PoseDelta = {
  handL?: Tri;
  handR?: Tri;
  footL?: Tri;
  footR?: Tri;
  rotZ?: number;
  rotY?: number;
  tailSwing?: number;
  headTilt?: number;
  squash?: number;
  /**
   * 相对默认髋高的上下位移（蹲下为负、跳起为正），单位世界单位。
   *
   * 注意：`dy` 只动**根节点**，脚是相对根节点的局部坐标，所以蹲下时必须
   * 同时抬高脚的局部 y（`-0.62 - dy`），否则脚会插进地面。
   * `normalizeClip` 会把"脚穿地"算出来报错，不靠人眼。
   */
  dy?: number;
};

export type EaseName = 'linear' | 'in' | 'out' | 'inOut';

export type Keyframe = {
  /** 归一化时间 0..1。**必须含 0 与 1**，且严格递增 */
  at: number;
  pose: PoseDelta;
  /** 到下一帧的缓动，缺省 inOut（线性起停会有机器人感） */
  ease?: EaseName;
};

export type MotionClip = {
  /** 与 `MotionOp` 同一个命名空间：渲染层拿它查表 */
  id: string;
  /**
   * 后端动词直接命中。一个 clip 可以有多个说法，
   * 中文也放这里——模型写"挥手"和写 `wave` 应该演同一件事。
   */
  verbs: string[];
  /** 这个 clip 需要哪些运动学参数（原地动作一律为空） */
  requires?: Array<'start' | 'end' | 'steps' | 'bounce'>;
  keys: Keyframe[];
};

/** 站姿的手/脚位置，写 clip 时当基准用（与 pose.ts 的 STAND_POSE 同值） */
const HAND_L: Tri = [-0.36, -0.02, 0.06];
const HAND_R: Tri = [0.36, -0.02, 0.06];

/**
 * 挥手：右手举到脸侧，左右摆三下，再放下。
 *
 * 为什么手的 x 要有 0.24↔0.54 的摆幅而不是"手举高就行"：
 * 正面视角里，静止举手的剪影和"举着不动"完全一样，孩子读不出在打招呼。
 * 摆幅取 0.3 个世界单位（约半个躯干宽），既明显又不会被 clampReach 钳住。
 */
const WAVE: MotionClip = {
  id: 'wave',
  verbs: ['wave', '挥手', '打招呼', '招手'],
  keys: [
    { at: 0, pose: { handR: HAND_R } },
    { at: 0.16, pose: { handR: [0.34, 0.86, 0.14], headTilt: 0.05, tailSwing: 0.2 } },
    { at: 0.34, pose: { handR: [0.54, 0.8, 0.12], headTilt: 0.06, tailSwing: 0.3 } },
    { at: 0.5, pose: { handR: [0.24, 0.88, 0.16], headTilt: 0.05, tailSwing: 0.2 } },
    { at: 0.66, pose: { handR: [0.54, 0.8, 0.12], headTilt: 0.06, tailSwing: 0.3 } },
    { at: 0.82, pose: { handR: [0.3, 0.86, 0.14], headTilt: 0.05, tailSwing: 0.2 } },
    { at: 1, pose: { handR: HAND_R } },
  ],
};

/**
 * 拍手：双手从体侧收到胸前合拢，开合三次。
 *
 * 这条 clip 专门压测"两只手同时动"：`handL` 与 `handR` 的 x 镜像，
 * 但**肩关节是 ±0.28**，所以两侧的目标点必须各自算，不能简单取反。
 * 合拢点停在 x=±0.07，两手之间留 0.14 的缝——完全重合会画成一只粗手臂。
 */
const CLAP: MotionClip = {
  id: 'clap',
  verbs: ['clap', '拍手', '鼓掌'],
  keys: [
    { at: 0, pose: { handL: HAND_L, handR: HAND_R } },
    { at: 0.18, pose: { handL: [-0.42, 0.24, 0.22], handR: [0.42, 0.24, 0.22], headTilt: 0.04 } },
    { at: 0.32, pose: { handL: [-0.07, 0.22, 0.28], handR: [0.07, 0.22, 0.28], headTilt: 0.06 } },
    { at: 0.46, pose: { handL: [-0.42, 0.24, 0.22], handR: [0.42, 0.24, 0.22], headTilt: 0.04 } },
    { at: 0.6, pose: { handL: [-0.07, 0.22, 0.28], handR: [0.07, 0.22, 0.28], headTilt: 0.06 } },
    { at: 0.74, pose: { handL: [-0.42, 0.24, 0.22], handR: [0.42, 0.24, 0.22], headTilt: 0.04 } },
    { at: 0.88, pose: { handL: [-0.3, 0.1, 0.16], handR: [0.3, 0.1, 0.16] } },
    { at: 1, pose: { handL: HAND_L, handR: HAND_R } },
  ],
};

/**
 * 叉腰：双手收到腰侧、肘部外撑，上身带一点左右晃动（神气 / 生气都演它）。
 *
 * **这条 clip 换过一次语义，原因值得记住**：原本想演"鞠躬"，试了两版都不成立——
 *   1. 给 `rotZ` 前倾角：2D 的 `rotZ` 只旋转躯干椭圆，头和四肢各自独立投影，
 *      正面视角画出来是"身体歪向一边、头还立着"，像落枕；
 *   2. 去掉倾角、改成屈膝下沉 + 低头：画出来只是"缩着肩膀站着"，不像行礼。
 *
 * 根因是**正面视角缺少"前后"这一维**：鞠躬本质是身体向前折，而画面里没有前。
 * 要演鞠躬/点头，需要侧 3/4 视角，或者给头加一条纵向位移通道——那是角色层的
 * 事（见文档 §10），不是关键帧表能绕过去的。所以这里换成正面视角里无歧义的
 * "叉腰"：手在身体轮廓之外、肘部外撑，剪影一眼可辨。
 */
const HIPS: MotionClip = {
  id: 'hips',
  verbs: ['hips', 'hands-on-hips', '叉腰', '神气'],
  keys: [
    { at: 0, pose: {} },
    {
      at: 0.24,
      pose: {
        handL: [-0.33, -0.02, 0.12],
        handR: [0.33, -0.02, 0.12],
        headTilt: 0.04,
        tailSwing: 0.2,
      },
    },
    {
      at: 0.8,
      pose: {
        handL: [-0.35, 0, 0.14],
        handR: [0.35, 0, 0.14],
        headTilt: -0.02,
        tailSwing: -0.2,
      },
    },
    { at: 1, pose: {} },
  ],
};

/**
 * 动作表。**加动作 = 在这里加一条数据**，`pose.ts` 不动、渲染器不动。
 * 键是开放的字符串（和 `VENUE_RECIPES` 同理），所以 `normalizeClip`
 * 与全量遍历测试承担了原来编译期穷举的职责。
 */
export const MOTION_CLIPS: Record<string, MotionClip> = {
  wave: WAVE,
  clap: CLAP,
  hips: HIPS,
};
