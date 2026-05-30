# 快速视频生成 — 前后端一体化方案

> 创建日期: 2026-05-28
> 状态: ✅ 已完成 — 前后端全部就绪

## 方案概览

**核心思路**：不改造现有管线，新增一个「薄编排层」—— `QuickVideoService`，串联 4 步：

```
topic + ageGroup → AI生成内容 → Content实体 → 入队 → 轮询
```

**复用而非重写**：现有 `LessonVideoQueueService.enqueue()` 和 `VideoGenerationAgentService` 保持不变，只在前面加一个「自动生成 Content」的步骤。

## 关键设计决策

| 决定 | 原因 |
|------|------|
| **新端点** `POST /learning/video/quick-generate` | 不和现有 `POST /learning/lessons/:id/teaching-video/tasks` 耦合 |
| **AI 生成内容用单次 `chat()` 调用** | Agent 循环（分镜→审查→修复）太重，快速生成优先速度 |
| **自动创建 Content 实体** | `domain = 'quick_generate_marker'` 标记，可复用（同一 topic+ageRange 缓存） |
| **返回 `{ taskId, contentId, status }`** | 前端用现有 `GET /lessons/:id/teaching-video/tasks/:taskId` 轮询 |
| **默认 `renderEngine = 'remotion'`** | 快速生成跳过 HyperFrames，直接用 Remotion |

## 后端实现 (✅ 已完成)

### 新增文件
- `src/modules/learning/quick-video.service.ts` — `QuickVideoService`
- `src/modules/learning/learning.dto.ts` — `QuickVideoGenerateDto`

### 修改文件
- `src/modules/learning/learning.controller.ts` — 新增 `quickGenerateVideo()` 方法
- `src/modules/learning/learning.module.ts` — 注册 `QuickVideoService`

### API 规格

```
POST /api/learning/video/quick-generate
Authorization: Bearer <token>
Content-Type: application/json

{
  "topic": "海洋动物",        // required
  "ageGroup": "3-4",         // required
  "childId": 2,              // optional (parent传)
  "durationSec": 60,         // optional, 默认60
  "style": "story",          // optional: story | science | song
  "force": false,            // optional, 绕过缓存
  "renderEngine": "remotion" // optional: auto | hyperframes | remotion
}

Response: {
  "taskId": 123,
  "contentId": 456,
  "status": "pending"
}
```

## 前端集成 (🔧 进行中)

### 需要新增/修改

| 文件 | 变更 |
|------|------|
| `src/frontend-web/src/types/index.ts` | 新增 `QuickVideoGenerateRequest`, `QuickVideoGenerateResponse` |
| `src/frontend-web/src/services/api.ts` | 新增 `quickGenerateVideo()` 方法 |
| `src/frontend-web/src/components/parent/QuickVideoGenerator.tsx` | **新建** — 表单组件 + 进度轮询 |
| `src/frontend-web/src/components/parent/ParentDashboard.tsx` | 新增 tab 或 section |

### 组件设计

QuickVideoGenerator 组件：

```
┌──────────────────────────────┐
│  🎬 快速生成教学视频           │
│  输入主题，AI 自动生成内容并制作视频 │
│                              │
│  ┌─────────────────────────┐ │
│  │ 主题: [海洋动物________]   │ │
│  │ 年龄: [3-4岁 ▼]          │ │
│  │ 风格: [故事 ▼]            │ │
│  │ [⏳ 生成视频]             │ │
│  └─────────────────────────┘ │
│                              │
│  ┌─ 生成进度 ──────────────┐ │
│  │ AI生成内容... ✓          │ │
│  │ 制作视频... ⏳ 45%       │ │
│  │ ██████░░░░░             │ │
│  └─────────────────────────┘ │
│                              │
│  ┌─ 生成完成 ──────────────┐ │
│  │ 课程: 探索海洋动物         │ │
│  │ [▶ 预览视频]  [✅ 确认]   │ │
│  └─────────────────────────┘ │
└──────────────────────────────┘
```

**状态机**:
```
idle → generating (AI生成内容) → enqueued (视频入队) → polling (轮询进度) → completed | failed
  ↑                                                              │
  └────────────────── 失败后可重试 ──────────────────────────────┘
```

### 轮询策略

- 复用现有 `getLessonTeachingVideoTask()` API
- 每 3 秒轮询一次，10 分钟超时
- 与 `LessonGenerator` 的视频轮询逻辑一致

## 测试要点

- [ ] quick-video.service.spec.ts 已通过
- [ ] quick-video-dto.spec.ts 已通过
- [ ] 前端 typecheck 零错误
- [ ] 前端 lint 零错误
- [ ] E2E: 提交表单 → Content 创建 → 视频任务入队 → 轮询完成