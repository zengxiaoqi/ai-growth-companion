# Plan: AI-Driven Video Generation Agent (全流程自主)

## Context

当前视频生成系统依赖大量正则匹配（500+ 行）来推断模板、背景、角色/物品，导致内容与主题不匹配（如"认识动物兔子"生成了四季内容）。目标是创建一个**全流程自主的视频生成 Agent**，拥有自己的工具集（命令执行、文件读写、LLM 内容生成等），能自主完成从主题分析到视频渲染的全过程，并进行质量把控。

---

## Architecture: Video Generation Agent

```
用户/其他Agent 请求
      │
      ▼
OrchestratorService (路由)
      │  ← 自动路由 或 sub-agent 调用
      ▼
┌─────────────────────────────────────────────────┐
│  video-generator Agent                          │
│  type: "video-generator"                        │
│  maxIterations: 15                              │
│  canSpawnSubAgents: false                       │
│                                                 │
│  Tools:                                         │
│  ├─ generateVideoContent (LLM 生成视频内容)      │
│  ├─ executeCommand (执行CLI命令)                 │
│  ├─ readFile / writeFile (文件操作)              │
│  ├─ renderHyperframes (hyperframes 渲染)         │
│  ├─ renderRemotion (remotion 渲染)               │
│  └─ reviewVideoQuality (LLM 质量检查)            │
│                                                 │
│  Skills:                                        │
│  ├─ video-generation-orchestrator               │
│  ├─ hyperframes                                 │
│  ├─ hyperframes-cli                             │
│  ├─ hyperframes-video-creation                  │
│  ├─ remotion-video-creation                     │
│  └─ gsap / css-animations / three               │
└─────────────────────────────────────────────────┘
      │
      ▼
  渲染输出 MP4/HTML → 返回结果
```

### Agent 执行流程

```
1. 接收任务 (topic, ageGroup, domain, engine?)
2. 调用 generateVideoContent → LLM 生成分镜脚本+内容
3. 根据技能选择渲染引擎 (HyperFrames/Remotion/第三方)
4. 调用 writeFile → 写入 HTML/React 组合文件
5. 调用 executeCommand → 执行渲染命令
6. 调用 reviewVideoQuality → LLM 检查质量
7. 不合格? → 修改内容 → 重新渲染 (回到步骤2/4)
8. 合格 → 返回视频路径/Buffer
```

---

## Phase 1: Agent 定义 + 基础工具

### New Files

#### 1.1 Agent Definition

**`src/backend/src/agent-framework/agents/definitions/video-generator.agent.ts`**

```typescript
type: "video-generator"
name: "视频生成专家"
description: "专业视频生成专家，能根据主题和年龄要求，自主完成视频分镜设计、内容生成、HTML/React组合编写、渲染执行和质量检查的全流程"
maxIterations: 15  // 需要多轮: 生成→写文件→渲染→检查→可能重试
canSpawnSubAgents: false
defaultAgeGroup: "5-6"

allowedTools: [
  "generateVideoContent",
  "executeCommand",
  "readFile",
  "writeFile",
  "renderHyperframes",
  "renderRemotion",
  "reviewVideoQuality",
]

allowedSkills: [
  "video-generation-orchestrator",
  "hyperframes",
  "hyperframes-cli",
  "hyperframes-video-creation",
  "remotion-video-creation",
  "remotion-video-creation-agent",
  "gsap",
  "css-animations",
  "three",
]
```

System prompt 要点:
- 你是视频生成专家，自主完成视频制作全流程
- 先分析主题，确定领域和关键概念
- 根据技能指导生成 HTML+GSAP 组合（HyperFrames）或 React 组件（Remotion）
- 渲染后检查质量，不合格要修改重试
- 输出视频文件路径

#### 1.2 工具: `generateVideoContent`

**`src/backend/src/agent-framework/tools/impl/generate-video-content.ts`**

Agent 可调用的 LLM 内容生成工具:
- Input: `{ topic, domain, ageGroup, sceneCount?, style?, narration? }`
- Output: `VideoStoryboard` 包含:
  - scenes: [{ id, sequence, title, concept, narration, onScreenText, visualDescription, durationSec, transitionToNext, emphasis }]
  - visualTheme: { primaryPalette, accentColor, mood }
  - narrativeArc
- 内部调用 `LlmClientService.generate()` 生成结构化 JSON
- Prompt 包含 16 个动画模板定义 + 分镜脚本要求
- 3 次重试，含失败反馈

#### 1.3 工具: `executeCommand`

**`src/backend/src/agent-framework/tools/impl/execute-command.ts`**

安全的命令执行工具:
- Input: `{ command: string, args?: string[], cwd?: string, timeout?: number }`
- Output: `{ exitCode, stdout, stderr, duration }`
- 安全限制:
  - 白名单命令: `npx hyperframes`, `npx remotion`, `node`, `npm`, `ls`, `cat`, `mkdir`, `cp`, `mv`
  - 禁止: `rm -rf /`, `sudo`, 危险操作
  - 超时默认 120 秒，最大 300 秒
  - 在临时工作目录执行
- 使用 `child_process.spawn()` 执行

#### 1.4 工具: `readFile` / `writeFile`

**`src/backend/src/agent-framework/tools/impl/file-operations.ts`**

文件读写工具:
- `readFile`: `{ path: string }` → `{ content: string, exists: boolean }`
- `writeFile`: `{ path: string, content: string }` → `{ path: string, size: number }`
- 安全限制:
  - 路径必须在允许的工作目录下 (temp dir + video-remotion dir)
  - 路径遍历防护 (`..` 检测)
  - 文件大小限制 (writeFile: 2MB max)

#### 1.5 工具: `renderHyperframes`

**`src/backend/src/agent-framework/tools/impl/render-hyperframes.ts`**

HyperFrames 渲染工具:
- Input: `{ compositionHtml: string, outputDir?: string, quality?: string }`
- Output: `{ videoPath: string, fileSize: number, duration: number }`
- 执行流程:
  1. 将 `compositionHtml` 写入临时文件
  2. 执行 `npx hyperframes render --input <html> --output <mp4>`
  3. 检查输出文件
  4. 返回视频路径

#### 1.6 工具: `renderRemotion`

**`src/backend/src/agent-framework/tools/impl/render-remotion.ts`**

Remotion 渲染工具:
- Input: `{ compositionId: string, props?: object, outputDir?: string }`
- Output: `{ videoPath: string, fileSize: number, duration: number }`
- 执行流程:
  1. 将 props 写入 Remotion 项目
  2. 执行 `npx remotion render <compositionId> <output>`
  3. 检查输出文件

#### 1.7 工具: `reviewVideoQuality`

**`src/backend/src/agent-framework/tools/impl/review-video-content.ts`**

LLM 质量检查工具:
- Input: `{ topic: string, scenes: object[], narrations: string[] }`
- Output: `{ passed: boolean, score: number, issues: string[], suggestions: string[] }`
- LLM 检查:
  - 主题相关性 (narration 是否与 topic 相关)
  - 年龄适配性 (词汇复杂度)
  - 内容完整性 (场景是否覆盖关键概念)
  - 叙事连贯性 (场景间的逻辑流)

---

## Phase 2: Orchestrator 集成

### Modified Files

#### 2.1 OrchestratorService — 路由集成

**`src/backend/src/agent-framework/agents/orchestrator.service.ts`**

添加视频生成意图信号:
- 在 `INTENT_SIGNALS` 中添加 video 相关关键词: `生成视频|制作视频|教学视频|video|render`
- 权重: video=3
- 路由规则:
  - parent context + video≥3 → 单独路由到 video-generator
  - parent context + course≥3 + video≥3 → 协调: parent-advisor + course-designer + video-generator
  - child context + video≥3 → 路由到 child-companion（由其决定是否调用 video-generator 作为 sub-agent）

#### 2.2 Agent Registry — 注册

**`src/backend/src/agent-framework/agents/agent-registry.service.ts`**

注册 `video-generator` agent:
- 关键词 boost: "视频" +2, "渲染" +2, "视频生成" +3
- 与 course-designer 和 activity-generator 并列

#### 2.3 Agent Definitions — Sub-agent 支持

**`src/backend/src/agent-framework/agents/definitions/course-designer.agent.ts`**
- 添加 video-generator 到 sub-agent 可调用列表（通过 maxSubAgentDepth: 1）
- 更新 allowedTools: 移除 `enqueueTeachingVideo`，改为在需要视频时 spawn video-generator

**`src/backend/src/agent-framework/agents/definitions/parent-advisor.agent.ts`**
- canSpawnSubAgents 已为 true，maxSubAgentDepth: 1
- 更新 system prompt: 当需要视频时 spawn video-generator sub-agent

#### 2.4 Agent Executor — 增加迭代上限

**`src/backend/src/agent-framework/agents/agent-executor.service.ts`**
- 无需修改: maxIterations 由 agent definition 传入，video-generator 定义为 15

---

## Phase 3: 内容生成增强

### Modified Files

#### 3.1 LlmClientService — 模型路由

**`src/backend/src/agent-framework/llm/llm-client.service.ts`**
- 添加 `generateWithConfig(prompt, systemPrompt?, config?)` 方法
- 支持 per-call model/maxTokens/temperature 覆盖
- 环境变量: `LLM_MODEL_CONTENT_GEN` (视频内容生成用更大模型)

#### 3.2 动画模板清理

**`src/backend/src/animations/animation-templates.ts`**
- 保留 `ANIMATION_TEMPLATES`, `buildTemplatePromptContext()`, `KNOWN_TEMPLATE_IDS`
- 添加 `getTemplateById()` 供 Agent 工具使用
- `suggestTemplateByDomain()` 标记 `@deprecated`，保留为 fallback

---

## Phase 4: Skill 深度集成

### New/Updated Skill Files

#### 4.1 `skills/video-generation-orchestrator/SKILL.md` (更新)

增强现有 skill，增加:
- 全流程指引: 内容生成 → 组合编写 → 渲染 → 质量检查
- 渲染引擎选择决策树
- 质量不达标时的修复策略

#### 4.2 `skills/hyperframes-video-creation/SKILL.md` (更新)

增强:
- 分镜脚本到 HTML 组合的映射规则
- 每种 emphasis 类型对应的视觉处理
- 领域特定的视觉风格指南

#### 4.3 新建 `skills/video-content-gen/SKILL.md`

专门的内容生成 skill:
- 分镜脚本结构要求（按年龄和领域）
- 叙事弧线模板
- 旁白质量标准（避免通用模板语言）
- 关键概念提取规则

---

## 关键文件清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `agents/definitions/video-generator.agent.ts` | 新建 | Agent 定义 |
| `tools/impl/generate-video-content.ts` | 新建 | LLM 内容生成工具 |
| `tools/impl/execute-command.ts` | 新建 | 安全命令执行工具 |
| `tools/impl/file-operations.ts` | 新建 | 文件读写工具 |
| `tools/impl/render-hyperframes.ts` | 新建 | HyperFrames 渲染工具 |
| `tools/impl/render-remotion.ts` | 新建 | Remotion 渲染工具 |
| `tools/impl/review-video-content.ts` | 新建 | LLM 质量检查工具 |
| `agents/orchestrator.service.ts` | 修改 | 添加 video 路由信号 |
| `agents/agent-registry.service.ts` | 修改 | 注册 video-generator |
| `agents/definitions/course-designer.agent.ts` | 修改 | 支持调用 video-generator sub-agent |
| `agents/definitions/parent-advisor.agent.ts` | 修改 | 支持调用 video-generator sub-agent |
| `llm/llm-client.service.ts` | 修改 | 添加 generateWithConfig() |
| `animations/animation-templates.ts` | 修改 | 添加 getTemplateById()，deprecate regex |
| `learning/learning.module.ts` | 修改 | 注册新 providers |
| `skills/video-content-gen/SKILL.md` | 新建 | 内容生成 skill |
| `skills/video-generation-orchestrator/SKILL.md` | 更新 | 增强全流程指引 |
| `skills/hyperframes-video-creation/SKILL.md` | 更新 | 增强分镜到 HTML 映射 |

---

## Verification

1. **单元测试**: 每个新工具独立测试 — generateVideoContent（30+ 主题/领域对）、executeCommand（安全限制）、fileOperations（路径遍历防护）、renderHyperframes、renderRemotion、reviewVideoQuality
2. **集成测试**: "认识动物兔子" → Agent 全流程 → 验证输出视频内容匹配主题
3. **回归测试**: 现有 `enqueueTeachingVideo` 工具和 `LessonVideoQueueService` 不受影响
4. **Sub-agent 测试**: course-designer 在需要视频时能正确 spawn video-generator
5. **质量测试**: reviewVideoQuality 对"认识动物兔子"输出评分 > 75/100
6. **安全测试**: executeCommand 白名单之外的命令被拒绝，路径遍历被阻止
7. **性能测试**: 单视频生成全流程 < 60 秒（不含 LLM 等待时间）

---

## 实施顺序

1. **Phase 1** (基础): Agent 定义 + 7 个工具 → 可独立测试
2. **Phase 2** (集成): Orchestrator 路由 + Agent Registry + sub-agent 支持
3. **Phase 3** (增强): LLM 模型路由 + 模板清理
4. **Phase 4** (技能): Skill 文件更新 → Agent 利用 skills 生成更高质量内容
