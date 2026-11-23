# 动作关键帧表：把"动作"从代码变成数据

> 状态：**待审查，未实施**
> 前置阅读：`docs/lesson-video-venue-recipes.md`（同一范式的第二次应用）
> 本文只解决一件事：**新增一个动作，不改渲染代码。**

## 1. 现在加一个动作要改五处

"挥手"这种最普通的动作，当前要动：

| # | 文件 | 改什么 |
|---|---|---|
| 1 | `character/pose.ts` | 写一个 `wavePose(frame)` 函数，再在 `MOTION_OPS` 加 `'wave'`、在 `poseAt` 加 `case`、在 `MOTION_REQUIRES` 加一行 |
| 2 | `video/scene-interaction.ts` | `PUPPET_MOTIONS` 加 `'wave'`，`VERB_AS_MOTION` 加 `wave: 'wave'`，若要新动词还得动 `INTERACTION_VERBS` |
| 3 | `video/action3d-registry.ts` | `MOTION_DEFAULTS` 补轨迹（即使 2D 用不到） |
| 4 | `scripts/check-generated-lesson-tsx.js` | 可能补 token |
| 5 | 模板 | `sync:three-stage` 重新打包 |

这和"加一处场地要改四个文件"是同一个病：**内容是开放的，代码却当它是封闭的**。
场地那一半已经治好了，动作这一半没有。

## 2. 边界：只有"原地动作"能变成数据

这条必须先划清，否则方案会过度承诺。

| 类别 | 例子 | 需要什么 | 结论 |
|---|---|---|---|
| **原地动作** | 挥手、点头、鞠躬、拍手、叉腰、挠头、耸肩、抱臂、跳一下 | 只动关节通道，与世界无关 | **改成数据（关键帧）** |
| **轨迹 / 接触动作** | `climb`（手要落在梯子横档上）、`slide`（身体贴滑面）、`dribble`（掌球同帧接触）、`walk`（起终点） | 要读世界几何（`ladderRungYs`、滑梯坐标、球半径），并与接触帧对齐 | **保持函数** |

所以"动作表化"不是把所有动作重写一遍。真正的判据是一句话：

> **动作里出现"贴到世界里的某个东西上"，它就是轨迹类，必须函数。**
> 只动自己身体的，就是数据。

数据表表达不了 `climb` 的手要落在第 3 根横档上——那不是姿态，是**约束**。
硬把它塞进关键帧，等于把梯子坐标抄进数据里，梯子一改动作就错位，比现在更糟。

## 3. 数据模型

`Pose` 已经是十个通道（`root / rotZ / rotY / handL / handR / footL / footR /
tailSwing / headTilt / squash`），这套通道对"原地动作"是完备的——挥手和鞠躬的
差别只在通道取值，不在拓扑。

```ts
// character/motion-clips.ts —— 纯数据，只 import type，零运行时依赖

export type PoseDelta = {
  handL?: Tri; handR?: Tri;
  footL?: Tri; footR?: Tri;
  rotZ?: number; rotY?: number;
  tailSwing?: number; headTilt?: number; squash?: number;
  /** 相对默认髋高的上下位移（蹲下为负、跳起为正），单位世界单位 */
  dy?: number;
};

export type Keyframe = {
  /** 归一化时间 0..1，**必含 0 与 1** */
  at: number;
  pose: PoseDelta;
  /** 到下一帧的缓动，缺省 inOut */
  ease?: 'linear' | 'in' | 'out' | 'inOut';
};

export type MotionClip = {
  /** 与 `MotionOp` 同一个命名空间：渲染层用它查表 */
  id: string;
  /** 后端动词直接命中：一个 clip 可以有多个说法 */
  verbs: string[];
  /** 这个 clip 需要哪些运动学参数（替代 MOTION_REQUIRES） */
  requires?: Array<'start' | 'end' | 'steps' | 'bounce'>;
  keys: Keyframe[];
};
```

**为什么 `at` 要归一化到 0..1**：这一条决定了后端不必再知道动作时长。
现在 `MOTION_DEFAULTS.durationFrames` 是"建议时长"，一幕 30 帧和 300 帧的挥手
需要完全不同的帧数配置；归一化之后，同一份关键帧在 1 秒幕和 6 秒幕里都成立
（表现是摆臂快慢不同，语义不变）。这是数据表比函数强的地方，也是真正减掉
一处耦合的地方。

**为什么不需要"周期"机制**：`idle` 的呼吸、`speak` 的点头是无限循环的，它们
继续留在函数里（见 §2 的表格，它们本来就是原地类，但已存在且工作正常，不动）。
数据式只做"一次性动作"；要摆三下就写六帧，行数换简单。等以后真的出现"整幕
持续抖"的需求，再加 `cycle` 字段——**现在不加，避免猜需求**。

一个完整例子（挥手）：

```ts
export const WAVE: MotionClip = {
  id: 'wave',
  verbs: ['wave', '挥手', '打招呼'],
  keys: [
    { at: 0,    pose: { handR: [0.36, -0.02, 0.06] } },                     // 体侧
    { at: 0.18, pose: { handR: [0.30, 0.46, 0.16], headTilt: 0.05 } },      // 举到肩上方
    { at: 0.36, pose: { handR: [0.16, 0.48, 0.12] } },                      // 向外摆
    { at: 0.54, pose: { handR: [0.34, 0.44, 0.18] } },                      // 摆回
    { at: 0.72, pose: { handR: [0.16, 0.48, 0.12] } },
    { at: 0.88, pose: { handR: [0.32, 0.46, 0.16], headTilt: 0.05 } },
    { at: 1,    pose: { handR: [0.36, -0.02, 0.06] } },                     // 放下
  ],
};
```

## 4. 渲染：一个纯插值函数

```ts
export function poseFromClip(clip: MotionClip, t01: number): Pose {
  // 1) 找 t 落在哪两帧之间，按 ease 求权重
  // 2) 逐通道插值：Tri 插三个分量，标量直接 lerp
  // 3) 缺省值取 STAND_POSE；root = [0, SPEC.standHipY + dy, 0]
}
```

关键点：

- **基准是 `STAND_POSE`**，不是空白。没写的通道自动取"站着"，所以一个只写
  `handR` 的 clip 不需要把十个通道抄一遍。
- **不碰 `root` 的 x/z**：原地动作的定义就是脚不动。要位移请用 `walk`。
- `dy` 走 `root` 的 y，让"跳一下""蹲下"能用同一个机制表达。
- 缓动默认 `inOut`：三个关键帧的抬手如果全线性，起停会有"机器人感"，这是
  动画里最常见的手感问题，不该让每个写数据的人都记着配。

接进 `poseAt` 只需在 switch **之前**查一次表：

```ts
export function poseAt(input: MotionInput, frame: number): Pose {
  const clip = MOTION_CLIPS[input.motion];
  if (clip) {
    const t = input.durationFrames > 1 ? frame / (input.durationFrames - 1) : 1;
    return poseFromClip(clip, clamp(t, 0, 1));
  }
  switch (input.motion) { /* 原有 11 个 case 不动 */ }
}
```

**已有 11 个原语的行为必须逐像素不变**——这是验收标准里最硬的一条（§8）。

## 5. 词汇开放

```ts
// 以前：联合类型，加动作 = 改类型
export const MOTION_OPS = ['idle', ...] as const;
export type MotionOp = (typeof MOTION_OPS)[number];

// 以后：字符串 + 已知清单（清单只用于测试与文档，不参与类型）
export type MotionOp = string;
export const MOTION_OPS: readonly string[] = [
  ...FUNCTION_MOTIONS,      // 11 个函数式（idle/speak/point/walk/enter/climb/slide/dribble/cheer/sit/hold）
  ...Object.keys(MOTION_CLIPS), // 数据式，自动出现
];
```

和 `Venue` 那次一样，丢掉的编译期穷举用**测试全量遍历**补：遍历 `MOTION_CLIPS`
每个 clip 跑 `normalizeClip`，并抽帧渲染确认能出画面。

## 6. 后端怎么知道"渲染器会不会演"

这是本方案唯一有真分歧的地方。后端有 `/api` 侧的**可演性校验**：模型写了一个
动词，要先判断渲染器认不认识，不认识就降级，而不是等出片时静默变 idle。

三个选择：

| | A. 镜像清单 + 守卫测试 | B. `sync:three-stage` 生成 manifest | C. 后端直接 import 渲染层 |
|---|---|---|---|
| 做法 | `PUPPET_MOTIONS` 手写，jest 里 import `motion-clips.ts` 断言两者一致 | 同步时把 ids/verbs 写成 `motion-manifest.json` | Nest 运行时 import `../../../video-remotion/...` |
| 漂移风险 | 有，但测试会红 | 无 | 无 |
| 构建侵入 | 零 | 多个生成物 + 后端读 json | **破坏产物路径**，不能做 |
| 成本 | 20 行 | ~40 行 | — |

**推荐 A**。C 不可行：后端 `tsconfig` 是 `include: ["src"]` 且没写 `rootDir`，
一旦 import 仓库外的源码，TS 把推断的 rootDir 抬到仓库根，产物就变成
`dist/src/backend/...` 而 `start` 脚本指向 `dist/main.js`——构建能过、启动会挂。
B 更彻底，但它引入"生成物与源码必须同步"的第二类负担（和 `stage-template`
一样），而这份清单只有十来个字符串，收益不值这个价。等哪天要把能力表喂给
LLM 当提示词（"你只能从这些动作里选"），再升到 B 也不迟。

守卫测试的形状：

```ts
import { MOTION_CLIPS } from '../../../video-remotion/src/character/motion-clips';
import { PUPPET_MOTIONS } from '../src/modules/learning/video/scene-interaction';

it('后端能演的动作 == 渲染层能演的动作', () => {
  expect([...PUPPET_MOTIONS].sort()).toEqual([...MOTION_OPS].sort());
});
```

## 7. 校验：数据表的错要在这里被抓住

函数式原语出错靠人眼，数据表可以机械校验。`normalizeClip(clip)` 检查：

| 规则 | 挡住的事故 |
|---|---|
| `keys.length >= 2`，首帧 `at=0`、末帧 `at=1` | 动作演到一半停住 / 首帧跳变 |
| `at` 严格递增 | 插值除零、时间倒流 |
| 通道名在 `PoseDelta` 白名单内 | 拼错通道名 → 静默失效（`handL` 写成 `handl`） |
| **手的目标点离肩不超过臂长（0.54）** | 手被 IK 钳制后画在身体里 → "抱胸"而不是"捧东西"（`hold` 第一版就是这个 bug） |
| `squash ∈ [0.8, 1.2]`、`dy ∈ [-0.5, 0.5]` | 压扁/位移夸张到角色变形 |

手长那条最有价值：它把"手感问题"变成"算术问题"，写数据的人不必靠抽帧试错。

## 8. 验收标准

1. **零回归**：现有 11 个原语，每个抽 3 帧（0 / 中 / 末）共 33 帧，迁移前后
   逐像素 diff 必须为 0。
2. **只加数据**：新增 `wave`（挥手）、`nod`（点头）、`bow`（鞠躬）三个动作，
   `git diff` **只允许动 `motion-clips.ts` 与 `scene-interaction.ts` 的动词表**，
   不允许动 `pose.ts` 的插值实现、`Puppet2D.tsx`、`ThreeActionStage.tsx`。
3. **三个动作覆盖三种通道组合**，证明通道表是完备的：
   - `wave`：单手高举 + 侧向摆（`handR` 两轴变化）
   - `nod`：只动 `headTilt`（最小改动，验证"只写一个通道"可用）
   - `bow`：`rotZ` 前倾 + `dy` 下压（验证躯干通道与位移）
4. **任意幕长都成立**：同一份 `wave` 在 1.5 秒幕与 6 秒幕里各渲一次，都读得出
   "在挥手"（不要求帧数相同，要求语义不变）。
5. 守卫测试全绿（§6），两侧 `tsc --noEmit` 干净。

## 9. 迁移顺序

| 步 | 动作 | 可验证 |
|---|---|---|
| 1 | 建 `motion-clips.ts`（类型 + `normalizeClip` + 三个新 clip），`pose.ts` 加 `poseFromClip` 与查表分支 | 单测 |
| 2 | `MotionOp` 改 `string`，`MOTION_OPS` 改为函数清单 + 数据清单合并 | 两侧 tsc |
| 3 | 后端 `PUPPET_MOTIONS` / `VERB_AS_MOTION` 接受新动词，加守卫测试 | 单测 |
| 4 | `sync:three-stage` + `check:lesson-template` token | 脚本 |
| 5 | 抽帧验收：11 个旧原语 33 帧零 diff + 3 个新动作各 3 帧人工看 | 渲染 |

第 5 步的 33 帧零 diff 是**必须在前**的：先把"没改坏"钉死，再看"新东西对不对"。
顺序反了，diff 不为 0 时分不清是回归还是新动作本来就该画面不同。

## 10. 不在本次范围

- 把 `climb` / `slide` / `dribble` 改成数据（见 §2，做不到也不该做）。
- 动作组合语法（"边走边挥手"）。现在一幕一个动作，组合要引入时间轴分段，
  是 `Puppet2D.buildPlan` 那一层的事，另开评估。
- 3D 舞台的动作表（`ThreeActionStage` 用同一份 `poseAt`，自动受益；但它的
  几何体没有「关节」概念，只在需要时单独看）。
- 角色部件（rig 五个旋钮）、道具资产（`PROP_KINDS` 只有 slide/ball）——
  属于另外两层，不在本文。

## 11. 待审查的决策点

1. **边界**：只把"原地动作"数据化，轨迹/接触类保持函数。**我主张采纳**——
   这是"能不能做对"的问题，不是取舍（§2）。
2. **`MotionOp` 改成 `string`**：与 `Venue` 同处理，穷举改测试。**主张采纳**。
3. **后端清单同步方式**：A 镜像 + 守卫测试 / B 生成 manifest / C 直接 import。
   **主张 A**，C 技术上不可行（§6）。
4. **首批三个动作**：`wave` / `nod` / `bow`。**主张这三个**，理由是它们分别
   压测单手、单通道、躯干+位移三种情况（§8.3）。
5. **`MOTION_REQUIRES` 并入 clip 的 `requires`**：**主张并**，少一张平行表。
