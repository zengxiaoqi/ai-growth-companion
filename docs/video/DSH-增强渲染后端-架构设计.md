# DSH 作为灵犀增强渲染后端 — 架构与开发设计

> 状态：草案 v2（已按裁决更新）
> 决策已定：产物终态 Mode-1（DSH 渲染）；DSH 使用自身配置的模型；并发纳入设计范围。
> 关联文档：
> - `docs/video/让 Agent 管道充分利用 Skills 能力生成高质量视频.md`（根因分析）
> - `docs/video/动态 Remotion 生成方案.md`
> - `.lingxi/plans/quick-video-generate-api.md`
> - `docs/视频生成质量问题.md`

---

## 1. 背景与目标

### 1.1 要解决的问题

灵犀现行的教学视频生成"能力太弱"：同一套模板渲染出所有主题的"幻灯片 + 旁白"，缺乏逐主题专属动画。根因已在前序文档定位——**LLM 生成的 TSX 是死代码**，渲染管道始终走 `buildGeneratedLessonTsx()` 硬编码模板，而非 LLM 编写的自定义组件。

`docs/video/让 Agent 管道充分利用 Skills 能力生成高质量视频.md` 已把目标明确为：

> 直接 Claude Code 的流程（高质量）：**Claude Code 读取 Skill → LLM 编写自定义 TSX 组件 → Remotion 渲染**

DSH（DeepSeek Harness）正是这类 coding harness：携带 bash/write/run_code 工具 + 可热加载的 Skill 目录 + Remotion 规则库，能为每个主题**现写 React 组合、抽帧自检、重渲染**。本方案把 DSH 定位为灵犀的**增强渲染后端**，替换当前"Agent 管道"里最弱的一段。

### 1.2 目标与非目标

**目标**
1. 灵犀保留产品面（REST API / 队列 / TTS / 鉴权 / 缓存 / 静态托管），新增 `renderEngine: 'dsh'` 渲染引擎。
2. DSH 作为独立子进程，接收结构化主题信息，输出逐主题专属的高质量 mp4。
3. 复用仓库已存在的 `skills/remotion-video-creation` 与 `skills/hyperframes` 技能资产。
4. 覆盖并发：多任务可并行进入 DSH 渲染，且受资源上限约束、相互隔离。

**非目标**
- 不改造灵犀现有前端与家长/儿童交互流程。
- 不重写灵犀的分镜/TTS/质检；DSH 只负责"分镜落地为视觉 + 渲染"。
- 不做多机器横向扩容（渲染池仍在本机，见 §4.5）。

---

## 2. 现状盘点（代码级证据）

### 2.1 灵犀现有视频管线

```
HTTP 层  POST /learning/video/quick-generate  (quick-video.service.ts)
             │  调 generateLessonContent()  (单次 chat → 分镜 JSON)
             ▼
       LessonVideoQueueService.enqueue()   (lesson-video-queue.service.ts)
             │  cacheKey = sha1(contentId+updatedAt+payload)
             ▼
       processQueue()  每 3s 轮询，单 worker，CAS 领取 pending→processing
             ▼
       generateVideoBufferWithEngines()   (lesson-video-queue.service.ts:623)
             │  engineOrder = resolveEngineOrder(normalizeRenderEngine(task.renderEngine))
             ├─ 'dynamic-remotion' → generateByDynamicRemotion()  ← 硬编码 buildGeneratedLessonTsx()
             ├─ 'remotion'        → generateByRemotion()          ← 固定 TopicVideo/NumbersVideo 组合
             ├─ 'hyperframes'     → generateByHyperframes()
             └─ 第三方 provider（可选，off/local_only 时不走）
```

**引擎枚举**（`database/entities/video-generation-task.entity.ts:13`）：
```ts
export type VideoRenderEngine = 'auto' | 'hyperframes' | 'remotion';
```

**引擎分发扩展点**（`lesson-video-queue.service.ts`）：`normalizeRenderEngine()`(:1695)、`resolveEngineOrder()`(:1704)、`resolveProviderName()`(:1682)、`generateVideoBufferWithEngines()` 循环(:640)。新增一个 `dsh` 引擎只需在这 4 处各加分支（见 §4.4）。

### 2.2 DSH 侧能力与技能资产

仓库根 `skills/` 是"双格式技能库"：

| 技能目录 | frontmatter 格式 | 归宿 |
|---|---|---|
| `skills/remotion-video-creation/`（29 条 rule） | `name`+`description`（DSH 格式） | DSH 可加载 |
| `skills/hyperframes/`（GSAP/CSS/p5.js 动效） | `name`+`description`（DSH 格式） | DSH 可加载 |
| `skills/gsap/`、`skills/three/`、`skills/css-animations/` | DSH 格式 | DSH 可加载 |
| `skills/video-generation-orchestrator/` | `id`+`triggers`+`requiredTools`（灵犀 agent 格式） | 灵犀 agent-framework 加载 |
| `skills/video-content-gen/` | 灵犀 agent 格式 | 灵犀加载 |

**DSH 技能发现根**（`@deepseek-ai/dsh-skill-filesystem`）：

| Rank | 路径 |
|---|---|
| 100 | `<projectRoot>/.dsh/skills` |
| 200 | `<projectRoot>/.agents/skills` |
| 400 | `~/.dsh/skills` |
| 500 | `~/.agents/skills`（本机已存在） |

**DSH 机器可调用入口**（关键事实）：
```bash
dsh --profile headless "the task"   # 答一个任务、打印结果、退出
dsh --profile web                   # 当前运行的 Web GUI
```
本机 `~/.dsh/profiles/` 已存在 `headless` 与 `web`。`headless` 即灵犀调 DSH 的子进程入口。

### 2.3 关键结论

1. 灵犀把 `dsh` 做成引擎，只需在 4 个分发点加分支（§4.4）。
2. DSH 侧技能已齐全，软链到 `~/.dsh/skills/` 即可被发现。
3. DSH 已有 headless 一次性入口，无需新增 RPC/HTTP 服务。
4. DSH 渲染会话使用 **DSH 自身配置的模型**（`~/.dsh` 下 profile 的模型/凭据），与灵犀 `.env` 的 `LLM_PROVIDER` 无关，二者不共享密钥、不共享额度账本。

---

## 3. 总体架构

### 3.1 拓扑

```
┌────────────────────────────────────────────────────────────────────┐
│                     灵犀后端（NestJS :3001）                          │
│  POST /learning/video/quick-generate  (renderEngine: 'dsh')         │
│      │                                                              │
│      ▼                                                              │
│  QuickVideoService.createContentAndEnqueue()  建 Content + 入队      │
│      │                                                              │
│      ▼                                                              │
│  LessonVideoQueueService —— 队列/缓存/轮询/重试/降级（多 worker）    │
│      │          engine='dsh' 命中                                   │
│      ▼                                                              │
│  DshBridgeService.renderWithDsh(task, payload)   ★新增              │
│      │  (1) 写 input.json 到隔离工作目录                              │
│      │  (2) 经并发信号量 → spawn 'dsh --profile headless "<prompt>"'│
│      │  (3) 解析 stdout 末行 JSON 工件清单                            │
│      │  (4) 校验/读入 mp4 → 返回 Buffer                              │
└──────┼──────────────────────────────────────────────────────────────┘
       │  子进程（本机 CPU/内存，共享文件系统）
       ▼
┌────────────────────────────────────────────────────────────────────┐
│                 DSH headless（生成脑，子进程生命周期）                  │
│  用 DSH 自身模型；加载 skills:                                        │
│    teaching-video(编排) + remotion-video-creation(29 rule)           │
│    + hyperframes(动效)                                               │
│      │                                                              │
│      ▼                                                              │
│  1. 读 input.json → 分镜（专属逐主题）                                │
│  2. write 组合 TSX 到 src/video-remotion 动态目录（按 cacheKey 隔离） │
│  3. bash: npx remotion render <CompositionId> --props=…            │
│  4. extract-frames 抽帧自检 → 修复 → 重渲染（≤2 轮）                 │
│  5. 写 artifact manifest.json；stdout 末行打印一行 JSON               │
└────────────────────────────────────────────────────────────────────┘
       │  共享产物目录（mp4 + manifest.json）
       ▼
  storage/lesson-videos/ ← 灵犀缓存并服务（复用 TTL/过期清理）
```

### 3.2 三个角色

| 角色 | 组件 | 职责 | 改动量 |
|---|---|---|---|
| 产品面 | 灵犀后端 | API/队列/TTS/鉴权/缓存/托管 | 仅引擎分发加分支 + 并发队列 |
| 生成脑 | DSH headless | 分镜落地为专属组合 + 渲染 + 自检 | 新增编排技能 |
| 资产 | `skills/*` | Remotion/HyperFrames 规则 | 软链即用 |

---

## 4. 核心设计

### 4.1 DSH 侧：`teaching-video` 编排技能（新增）

以 DSH 技能格式（`name`+`description`+`whenToUse` frontmatter + body + `rules/` 引用）新建 `<skillRoot>/teaching-video/SKILL.md`，面向 **DSH 的工具面**（bash/write/read/run_code），不再引用灵犀的 `generateVideoContent`/`renderRemotion` 工具。

要点：
- **分镜由 DSH 模型直接推理**，输入来自 `input.json`（灵犀结构化 payload：topic/title/summary/ageGroup/domain/durationSec/style/sceneCount/narrationSrc）。不走灵犀 `generateVideoContent` 的 LLM 工具，避免双重 LLM。
- 复用 `remotion-video-creation`（29 rule）与 `hyperframes` 动效，经 `skill` 工具加载。
- 工作流：读 input → 分镜 → 写组合 TSX → `npx remotion render`（对齐 `render-remotion.ts`）→ 抽帧自检 → 修复（≤2 轮）→ 写 manifest → 打印结果。
- 硬约束：无运行时网络/eval；旁白音频由灵犀先决生成写入 `narrationSrc`，DSH 不重新 TTS。
- **模型归属**：DSH 渲染会话用 DSH 自身 profile 的模型与凭据，灵犀不注入任何 LLM 密钥。

### 4.2 灵犀侧：`DshBridgeService`（新增）

```ts
// src/backend/src/modules/learning/dsh-bridge.service.ts
class DshBridgeService {
  /** 由 DSH headless 渲染教学视频 buffer（受内部并发信号量约束） */
  async renderWithDsh(task: VideoGenerationTask, payload: Record<string, any>): Promise<Buffer>;
}
```

实现要点：
1. **隔离工作目录**：`storage/dsh-video/<task.cacheKey>/`，内含 `input.json` + `narration/*.mp3`（若有）。缓存键唯一 ⇒ 并行任务互不覆盖。
2. **子进程**：`spawn('dsh', ['--profile','headless-video','<task prompt>'])`，`cwd` 指向 repo 根。prompt 为确定性模板：给 input.json 绝对路径、输出目录、要求调用 teaching-video 技能、要求 stdout 末行打印 JSON 结果。
3. **并发门控**：内部 `Semaphore(VIDEO_DSH_MAX_CONCURRENCY)`（默认 2），见 §4.5。
4. **硬超时**：复用 `remotion-render.service.ts` 的 `RENDER_HARD_TIMEOUT_MS`（15 分钟，SIGTERM→SIGKILL 二级升级）。
5. **结果解析**：stdout 末行 `{"status":"ok","manifestPath":"<abs>"}` → 读 manifest 校验 mp4 存在且 size>0 → 读入 Buffer 返回。
6. **失败语义**：返回 `null`（空 buffer）触发上层降级链；抛错记入 `errors[]`（与现有引擎一致）。

### 4.3 工件回传协议（终态 Mode-1）

**已决策：坚持 Mode-1 —— DSH 直接渲染出 mp4 回传。**

| 模式 | DSH 产物 | 灵犀动作 | 状态 |
|---|---|---|---|
| **Mode-1** mp4 直传 | `.mp4` + `manifest.json` | 校验→读入 Buffer→走现有缓存/托管 | ✅ 终态 |
| Mode-2 源码直传 | TSX + 资源清单 + props.json | 交灵犀 `RemotionRenderService` 渲染 | ❌ 否决（暂缓） |

裁决理由：Mode-1 最快验证增益、DSH 本机已具备 Chrome/ffmpeg/node（灵犀每天在此渲染出 `video_N.mp4`）；渲染运维义务留在 DSH 侧，但 DSH 处置技能时天然拥有重试/修复上下文（抽帧自检）。Mode-2 才适合未来多租户收敛，当前不做。

`manifest.json` 最小契约：
```json
{
  "schemaVersion": 1,
  "status": "completed",
  "engine": "remotion",
  "compositionId": "GeneratedLesson-<slug>",
  "output": { "videoPath": "/abs/<cacheKey>.mp4", "durationSec": 60, "width": 1920, "height": 1080 },
  "quality": { "score": 82, "passed": true, "issues": [] },
  "scenes": 5,
  "dschModel": "<dsh-profile-model>",
  "skillVersions": { "remotion-video-creation": "…", "hyperframes": "…" }
}
```

### 4.4 引擎接入（灵犀改动点清单）

1. **实体** `video-generation-task.entity.ts:13`：`VideoRenderEngine` 增 `'dsh'`。
2. **normalizeRenderEngine()**(:1695)：`if (raw === 'dsh') return 'dsh'`。
3. **resolveEngineOrder()**(:1704)：`if (engine === 'dsh') return ['dsh','dynamic-remotion','remotion','hyperframes']`（DSH 失败降级现有模板管线保可用）。
4. **resolveProviderName()**(:1682)：`if (engine === 'dsh') return 'dsh'`。
5. **generateVideoBufferWithEngines()** 循环(:640)：新增 `if (engine === 'dsh')` 分支调 `dshBridge.renderWithDsh`。
6. **quick-generate DTO**：`renderEngine` 枚举加 `dsh`（`learning.dto.ts`）。
7. **Module** `learning.module.ts`：注册 `DshBridgeService`。
8. **队列并行**：`workerBusy: boolean` → 信号量（见 §4.5）。

> `RenderAttemptEngine`(:30) 与 `FALLBACK_RENDER_ENGINES`(:33) 保持兼容；`dsh` 作为显式引擎由 3 单独返回，不塞默认全链路。

### 4.5 并发设计（已纳入范围）

当前队列 `processQueue()` 用 `workerBusy` 单标志串行消费；DSH 渲染是分钟级 I/O+CPU 任务，单 worker 会成瓶颈。并联多 worker 会触发"多个 DSH 子进程 + 多个 Chrome 实例"的资源竞争。设计如下：

1. **队列层**：`workerBusy: boolean` → 带上限 **Semaphore(`VIDEO_QUEUE_MAX_WORKERS`，默认 2)**，允许 2 个任务并行消费（1 个 DSH + 1 个本地模板引擎可并行，互不阻塞）。
2. **DSH 渲染层**：`DshBridgeService` 内部 **Semaphore(`VIDEO_DSH_MAX_CONCURRENCY`，默认 2)** 约束 DSH 子进程数，防止 DSH+Chrome 吃满 CPU/内存。
3. **任务隔离**：每个任务独立 `storage/dsh-video/<cacheKey>/` 工作目录 + 独立 `--output`；props.json / narration 用 cacheKey 天然去重，避免并行互相覆盖。
4. **帧级并发**：`npx remotion render` 显式传 `--concurrency=half-of-cores`，单个渲染内部收敛 CPU 占用。
5. **失败隔离**：并行 Promise 各自失败、各自释放信号量，单任务失败不阻塞其它任务。
6. **多实例**（未来）：现有 `UPDATE ... WHERE status='pending'` 的 CAS 领取已保证同任务单领取方；跨实例 DSH 渲染池需额外约定（DB 锁/租约），**暂按单实例落地**，用 `VIDEO_DSH_MAX_CONCURRENCY` 留出上限开关。

并发上限建议：默认 2（1 DSH + 1 本地引擎），机器充足可调 3~4；需在 P3 压测定档（见 §6）。

---

## 5. 关键数据流 / 时序

```text
用户/前端 ── POST quick-generate {topic, ageGroup, renderEngine:'dsh'}
   │
   ▼
QuickVideoService.createContentAndEnqueue()           # 建 Content + 入队
   │
   ▼
Queue.processNextTask()   status: processing          # 多 worker，CAS 领取
   │
   ▼
generateVideoBufferWithEngines()  → engine='dsh'
   │
   ▼
DshBridgeService.renderWithDsh(task, payload)
   │  1. 写 storage/dsh-video/<cacheKey>/input.json     ← 每任务隔离
   │  2. await semaphore.acquire()                       ← 并发门控
   │  3. spawn dsh --profile headless-video "<prompt>"   ← 用 DSH 自身模型
   │        └─ DSH: 读 input → 分镜 → 写 TSX → npx remotion render
   │                  → 抽帧自检 → 修复(≤2) → manifest → print JSON
   │  4. 解析 stdout 末行 JSON → 读 manifest → 校验 mp4
   │  5. semaphore.release() → 读入 Buffer 返回
   ▼
   └─ 成功 → task.localVideoPath + status: completed
      └─ 空/异常 → 降级链条 ['dynamic-remotion','remotion','hyperframes']
```

**进程/并发隔离**：灵犀与 DSH 仅经"共享文件系统 + stdin 参数 + stdout 末行 JSON"通信，无共享内存/端口；DSH 子进程退出即释放资源；并发上限由双侧信号量协同约束。

---

## 6. 分阶段实施计划

| 阶段 | 内容 | 交付物 | 预估 |
|---|---|---|---|
| **P0 资产就位** | 软链 `skills/remotion-video-creation`、`hyperframes` 到 `~/.dsh/skills/`；验证 `skill` 可加载、`resourceBase` 指向规则/脚本 | DSH 可发现的技能 | 0.5d |
| **P1 DSH 原生 MVP** | 先做 headless spike；写 DSH 版 `teaching-video/SKILL.md`；跑通"自然语言→组合→mp4"；2~3 个弱主题 A/B 对比 | 可复现 mp4 + 对比证据 | 1~2d |
| **P2 灵犀接入** | 新增 `DshBridgeService` + `renderEngine:'dsh'` 引擎分支 + DTO 枚举；`quick-generate` 可选 `dsh`；端到端 + 单测（含并发信号量） | 灵犀可经 DSH 渲染 | 2~3d |
| **P3 并发与稳定性** | 队列多 worker + DSH 并发信号量 + 帧级并发调参；超时/并发/降级压测；并发上限定档 | 并发稳定的生产基线 | 1~2d |
| **P4 上线** | 质量对照、监控（任务时长/成功率/资源占用）、`VIDEO_DSH_ENABLED` 灰度开关 | 生产可开关 | 1~2d |

**建议先 P0+P1**（纯增量、不碰生产），用"DSH 版 vs 现行版"实拍视频证明增益，再投 P2/P3。

---

## 7. 风险与缓解

| 风险 | 等级 | 缓解 |
|---|---|---|
| DSH 渲染慢（分钟级）+ 并发 Chrome 内存/CPU 峰值 | 中 | 双侧信号量上限（默认 2）+ 帧级 `--concurrency` 收敛；`VIDEO_DSH_MAX_CONCURRENCY` 可调 |
| DSH 输出不确定（自由写 TSX 可能渲染失败） | 中 | DSH 侧抽帧自检 ≤2 轮；灵犀保留 `['dynamic-remotion','remotion','hyperframes']` 降级链兜底 |
| 并行任务相互覆盖工作目录/中间文件 | 低 | cacheKey 唯一目录 + 独立 `--output`；故障后清理只删本 cacheKey 目录 |
| 技能/规则版本漂移 | 低 | `~/.dsh/skills` 软链回 repo `skills/`；manifest 记录 skill 版本与 `dschModel` |
| headless profile 行为未锁死（工具面/技能加载/stdout 契约） | 中 | P1 先 spike；创建专用 `~/.dsh/profiles/headless-video`（挂 teaching-video + bash/write/run_code，禁交互），不依赖默认 headless 可变配置 |
| DSH 与灵犀模型/额度账本割裂，成本难汇算 | 低 | DSH 用量由其自身账本计；manifest 记 `dschModel`，灵犀侧仅记录任务时长/成功率做对账 |
| 旁白/TTS 双跑不一致 | 低 | 旁白音频由灵犀先决生成写入 payload；DSH 只消费 `narrationSrc` |

---

## 8. 决策记录（ADR）

| # | 决策 | 理由 | 代价/权衡 |
|---|---|---|---|
| 1 | DSH 为独立 `renderEngine:'dsh'` | 渐进、可灰度、可回退 | 需在 4 个分发点加分支 |
| 2 | 灵犀经子进程 `dsh --profile headless-video "<task>"` 调 DSH | 复用一次性执行入口，零新增服务 | stdout 契约需严格约定 |
| 3 | **终态 Mode-1**：DSH 渲染 mp4 直传；Mode-2 否决 | 最快验证增益；DSH 处置时自带修复上下文 | Chrome/ffmpeg 运维义务在 DSH 侧 |
| 4 | 技能资产软链进 `~/.dsh/skills`，不复制 | 跟仓库版本走，避免漂移 | 部署机需执行软链步骤 |
| 5 | DSH 模型直接推理分镜，复用灵犀结构化 payload | 避免双重 LLM + 保住灵犀领域内容 | 分镜质量取决于 DSH 模型 |
| 6 | **DSH 渲染用 DSH 自身配置的模型/凭据** | 灵犀不注入密钥，职责边界清晰、无共享额度账本 | 成本需 DSH 侧对账 |
| 7 | **并发纳入设计**：队列 worker 与 DSH 子进程均为 Semaphore 上限（默认 2） | 兼顾吞吐与资源安全 | 需 P3 压测定档 |

---

## 9. 开放问题 / 待 spike

1. **DSH headless 实际行为**（待 P1 spike）：`dsh --profile headless "..."` 是否携带 bash/write 工具、能否按 `~/.dsh/skills` 加载技能、stdout 是否可靠返回 agent 最终回复——决定 P2 子进程契约。→ 已排入 P1 前 0.5d。
2. ~~产物归属~~ ✅ 已定：Mode-1（DSH 渲染）。
3. ~~DSH 模型/密钥~~ ✅ 已定：DSH 自身配置的模型，与灵犀 `LLM_PROVIDER` 无关。
4. ~~并发~~ ✅ 已纳入设计（§4.5），上限参数待 P3 压测定档；多实例横向扩容暂缓。
5. **DSH headless 的模型是否走配额/限流**：需在 spike 确认 DSH 自身 profile 的耗时与限流行为，避免后台渲染任务被限流悬挂（与 #1 同批验证）。

---

## 10. 附录：改动点一键清单

**灵犀后端**
- `src/backend/src/database/entities/video-generation-task.entity.ts` — `VideoRenderEngine` 加 `'dsh'`
- `src/backend/src/modules/learning/dsh-bridge.service.ts` — 新增（含并发信号量）
- `src/backend/src/modules/learning/lesson-video-queue.service.ts` — 4 个分发点加 `dsh` 分支 + 队列 worker 并行化
- `src/backend/src/modules/learning/learning.dto.ts` — `QuickVideoGenerateDto.renderEngine` 加 `'dsh'`
- `src/backend/src/modules/learning/learning.module.ts` — 注册 `DshBridgeService`

**DSH / 技能资产**
- `~/.dsh/skills/remotion-video-creation` — 软链自 `skills/remotion-video-creation`
- `~/.dsh/skills/hyperframes` — 软链自 `skills/hyperframes`
- `~/.dsh/skills/teaching-video/SKILL.md` — 新增 DSH 版编排技能
- `~/.dsh/profiles/headless-video/` — 新增专用渲染 profile

**配置/运维**
- `.env` 增 `VIDEO_DSH_ENABLED`、`VIDEO_DSH_TIMEOUT_MS`、`VIDEO_DSH_MAX_CONCURRENCY`、`VIDEO_QUEUE_MAX_WORKERS`
