# Quick Video Generate API — 一键生成视频技术方案

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 新增 `POST /learning/video/quick-generate` 端点，用户只需提供 `topic` + `ageGroup`，系统自动生成课程内容 → 分镜 → 旁白 → 视频，返回 taskId 供轮询

**Architecture:** 新增 `QuickVideoService` 作为编排层，串联「AI 内容生成 → Content 实体创建 → 视频任务入队」。复用现有 `LessonVideoQueueService.enqueue()` 和 `VideoGenerationAgentService` 管线，无需修改渲染链路。

**Tech Stack:** NestJS + TypeORM + 现有 AI 管线（AiService） + 现有 Remotion 渲染

**约束:** 
- 必须复用现有 `VideoGenerationTask` 实体和队列系统
- 不引入新的外部依赖
- 生成的 Content 实体标记 `source: 'quick_generate'` 以区分手动创建的课程
- 同一个 topic+ageGroup 组合使用缓存（Content 实体去重），避免重复生成

---

### Task 1: 创建 `QuickVideoGenerateDto`

**Objective:** 定义一键生成视频的请求体 DTO

**Files:**
- Modify: `src/backend/src/modules/learning/learning.dto.ts`

**Step 1: 添加 DTO 类**

在文件末尾追加：

```typescript
export class QuickVideoGenerateDto {
  topic: string;          // 课程主题，如 "海洋动物", "数字1-10"
  ageGroup: string;       // 年龄段，如 "3-4", "5-6"
  durationSec?: number;   // 目标视频时长（秒），默认 60
  style?: string;         // 风格，可选 "story" | "science" | "song"
  childId?: number;       // 孩子 ID（parent 必须传）
}
```

**Step 2: 验证编译**

```bash
cd /home/zxq/ai-growth-companion/src/backend && npx tsc --noEmit --project tsconfig.json 2>&1 | head -20
```

Expected: 无新增错误

---

### Task 2: 创建 `QuickVideoService` — AI 内容生成

**Objective:** 编写核心编排服务，根据 topic+ageGroup 调用 AI 生成结构化课程内容

**Files:**
- Create: `src/backend/src/modules/learning/quick-video.service.ts`

**Step 1: 创建服务骨架**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Content } from '../../database/entities/content.entity';
import { AiService } from '../ai/ai.service';

@Injectable()
export class QuickVideoService {
  private readonly logger = new Logger(QuickVideoService.name);

  constructor(
    @InjectRepository(Content)
    private readonly contentRepo: Repository<Content>,
    private readonly aiService: AiService,
  ) {}

  /**
   * 根据 topic + ageGroup 生成完整课程内容
   * 返回可直接用于 VideoGenerationAgent 的 payload
   */
  async generateLessonContent(params: {
    topic: string;
    ageGroup: string;
    durationSec?: number;
    style?: string;
  }): Promise<Record<string, any>> {
    const duration = params.durationSec || 60;
    const targetScenes = Math.max(3, Math.min(8, Math.floor(duration / 8)));
    
    const prompt = this.buildContentPrompt(params.topic, params.ageGroup, targetScenes, params.style);
    
    const result = await this.aiService.chat({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      maxTokens: 2000,
    });
    
    return this.parseAiResult(result);
  }

  private buildContentPrompt(
    topic: string,
    ageGroup: string,
    targetScenes: number,
    style?: string,
  ): string {
    // 提示词引导 AI 输出结构化的 videoLesson + visualStory
    return `你是一个儿童教育内容创作专家。请为 ${ageGroup} 岁的孩子创作一个关于「${topic}」的教学视频内容。

要求：
- 生成 ${targetScenes} 个场景（shots）
- 每个场景包含：标题、旁白文字（中文，适合儿童，每段30-60字）、视觉描述（英文，用于生成动画场景图）、屏幕文字
- 整体时长约 ${targetScenes * 8} 秒
- 风格：${style || '活泼有趣的卡通风格'}

请严格按照以下 JSON 格式输出（不要包含其他文字）：

{
  "title": "课程标题（中文，10字以内）",
  "summary": "课程简介（30字以内）",
  "domain": "${style === 'science' ? 'science' : style === 'song' ? 'music' : 'language'}",
  "videoLesson": {
    "shots": [
      {
        "title": "场景标题",
        "narration": "旁白文字（中文）",
        "visualDescription": "visual description in English for animation scene",
        "onScreenText": "屏幕显示文字",
        "durationSec": 8
      }
    ]
  },
  "visualStory": {
    "scenes": [
      {
        "title": "场景标题（同 shots）",
        "narration": "旁白文字",
        "visualDescription": "visual description for animation",
        "onScreenText": "屏幕文字",
        "durationSec": 8,
        "animationTemplate": { "id": "dynamic.story-scene" }
      }
    ]
  }
}`;
  }

  private parseAiResult(result: any): Record<string, any> {
    // 处理 AI 可能返回 markdown 代码块包装的 JSON
    const text = result?.content || JSON.stringify(result);
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const raw = jsonMatch ? jsonMatch[1] : text;
    try {
      return JSON.parse(raw);
    } catch (e) {
      this.logger.warn('AI content parse failed, using fallback structure');
      return this.buildFallbackPayload(result);
    }
  }

  private buildFallbackPayload(aiResult: any): Record<string, any> {
    // fallback: 最小可用的 payload
    return {
      title: '教学视频',
      summary: aiResult?.content?.slice(0, 30) || '自动生成的教学视频',
      domain: 'language',
      videoLesson: {
        shots: [{ title: '教学场景', narration: '让我们一起学习吧！', visualDescription: 'fun education animation', onScreenText: '学习时间', durationSec: 6 }],
      },
      visualStory: {
        scenes: [{ title: '教学场景', narration: '让我们一起学习吧！', visualDescription: 'fun education animation', onScreenText: '学习时间', durationSec: 6, animationTemplate: { id: 'dynamic.story-scene' } }],
      },
    };
  }
}
```

**Step 2: 验证编译**

```bash
cd /home/zxq/ai-growth-companion/src/backend && npx tsc --noEmit --project tsconfig.json 2>&1 | grep -i "quick-video" | head -5
```

Expected: 无报错

---

### Task 3: 扩展 `QuickVideoService` — Content 实体持久化

**Objective:** 将 AI 生成的内容保存为 Content 实体，支持去重缓存

**Files:**
- Modify: `src/backend/src/modules/learning/quick-video.service.ts`

**Step 1: 添加 `createContentAndEnqueue` 方法**

在 `QuickVideoService` 类中添加：

```typescript
import { LessonVideoQueueService } from './lesson-video-queue.service';
import type { VideoRenderEngine } from '../../database/entities/video-generation-task.entity';

// 在 constructor 中注入:
// private readonly lessonVideoQueue: LessonVideoQueueService,

async createContentAndEnqueue(params: {
  topic: string;
  ageGroup: string;
  childId: number;
  durationSec?: number;
  style?: string;
  force?: boolean;
  renderEngine?: VideoRenderEngine;
}) {
  // 1. 检查缓存：同一 topic+ageGroup 只生成一次 Content
  const existingContent = await this.contentRepo.findOne({
    where: {
      topic: params.topic,
      ageGroup: params.ageGroup,
      source: 'quick_generate',
    },
    order: { id: 'DESC' },
  });

  let contentId: number;

  if (existingContent && !params.force) {
    this.logger.log(`Reusing existing quick_generate content: id=${existingContent.id}`);
    contentId = existingContent.id;
  } else {
    // 2. AI 生成内容
    const lessonData = await this.generateLessonContent({
      topic: params.topic,
      ageGroup: params.ageGroup,
      durationSec: params.durationSec,
      style: params.style,
    });

    // 3. 创建 Content 实体
    const content = this.contentRepo.create({
      title: lessonData.title || params.topic,
      topic: params.topic,
      ageGroup: params.ageGroup,
      domain: lessonData.domain || 'language',
      summary: lessonData.summary || '',
      source: 'quick_generate',
      // 将 AI 生成的完整数据存入 content 字段（JSON 类型）
      content: lessonData,
      contentStatus: 'published',
      // 其他 Content 实体必需字段
      type: 'video_lesson',
      difficulty: 'beginner',
      durationMinutes: Math.ceil((params.durationSec || 60) / 60),
      tags: [params.topic],
      childId: params.childId,
    } as any);

    const saved = await this.contentRepo.save(content);
    contentId = saved.id;
    this.logger.log(`Created quick_generate content: id=${contentId}, title="${saved.title}"`);
  }

  // 4. 入队视频任务（复用现有队列）
  const task = await this.lessonVideoQueue.enqueue(
    contentId,
    params.childId,
    params.force || false,
    params.renderEngine || 'dynamic-remotion',
  );

  return {
    taskId: task.id,
    contentId,
    status: task.status,
  };
}
```

**Step 2: 验证编译**

```bash
cd /home/zxq/ai-growth-companion/src/backend && npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "quick-video|error" | head -10
```

Expected: 无 `quick-video` 相关错误

---

### Task 4: 添加 Controller 端点

**Objective:** 在 `LearningController` 中添加 `POST /learning/video/quick-generate`

**Files:**
- Modify: `src/backend/src/modules/learning/learning.controller.ts`

**Step 1: 添加导入和注入**

在 import 区域添加：
```typescript
import { QuickVideoService } from './quick-video.service';
import { QuickVideoGenerateDto } from './learning.dto';
```

在 constructor 参数中添加：
```typescript
private readonly quickVideoService: QuickVideoService,
```

**Step 2: 添加端点方法**

在类的适当位置（视频相关端点区域）添加：

```typescript
@Post('video/quick-generate')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiOperation({ summary: '一键生成教学视频：输入主题+年龄段，自动生成内容并渲染视频' })
async quickGenerateVideo(
  @Request() req: any,
  @Body() body: QuickVideoGenerateDto,
) {
  const resolvedChildId = this.resolveChildId(
    req,
    body?.childId != null ? String(body.childId) : undefined,
  );
  await this.assertAccessToChild(req, resolvedChildId);

  const result = await this.quickVideoService.createContentAndEnqueue({
    topic: body.topic,
    ageGroup: body.ageGroup,
    childId: resolvedChildId,
    durationSec: body.durationSec,
    style: body.style,
  });

  return result;
}
```

**Step 3: 验证编译**

```bash
cd /home/zxq/ai-growth-companion/src/backend && npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "quick|error" | head -10
```

Expected: 无错误

---

### Task 5: 注册 `QuickVideoService` 到 Module

**Objective:** 确保 NestJS 依赖注入能找到 QuickVideoService

**Files:**
- Modify: `src/backend/src/modules/learning/learning.module.ts`

**Step 1: 查看并修改 module**

找到 `LearningModule` 的 `providers` 数组，添加 `QuickVideoService`。

先查看当前 providers 配置：
```bash
grep -n "providers" src/backend/src/modules/learning/learning.module.ts
```

然后添加 `QuickVideoService` 到 providers 数组。

**Step 2: 验证编译**

```bash
cd /home/zxq/ai-growth-companion/src/backend && npx tsc --noEmit --project tsconfig.json 2>&1 | head -10
```

Expected: 编译通过

---

### Task 6: 编写测试

**Objective:** 编写 `quick-video.service.spec.ts` 确保核心逻辑正确

**Files:**
- Create: `src/backend/test/unit/quick-video.service.spec.ts`

**覆盖用例（~8 个）：**
1. `generateLessonContent` 正常生成内容
2. `generateLessonContent` AI 返回 markdown 代码块包裹的 JSON → 正确解析
3. `generateLessonContent` AI 返回非法 JSON → fallback payload
4. `createContentAndEnqueue` 首次调用 → 新建 Content + 入队
5. `createContentAndEnqueue` 同一 topic+ageGroup 二次调用 → 复用 Content
6. `createContentAndEnqueue` force=true → 强制重新生成
7. `parseAiResult` 处理裸 JSON
8. `buildContentPrompt` 包含关键参数

**Mock 策略：** 沿用现有测试的 mock 模式 — mock AiService、Repository、LessonVideoQueueService，不实际调用外部 API。

---

### Task 7: 端到端验证

**Objective:** 启动后端，用 curl 测试完整链路

```bash
# 1. 确保后端运行
curl -s http://localhost:3001/health | head -20

# 2. 获取 JWT token（使用测试账户）
curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800000002","password":"password123"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken','NO TOKEN'))"

# 3. 调用 quick-generate
curl -s -X POST http://localhost:3001/learning/video/quick-generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"topic":"海洋动物","ageGroup":"4-5","durationSec":60}'

# 4. 轮询任务状态
curl -s "http://localhost:3001/learning/lessons/<CONTENT_ID>/teaching-video/tasks/<TASK_ID>?childId=2" \
  -H "Authorization: Bearer <TOKEN>"
```

Expected: 步骤3返回 `{ taskId, contentId, status: "pending" }`，步骤4可轮询到 `status: "completed"`

---

### 模块关系图

```
POST /learning/video/quick-generate
  ↓
LearningController.quickGenerateVideo()
  ↓
QuickVideoService.createContentAndEnqueue()
  ├─ 1. 查缓存（topic+ageGroup → Content 实体）
  ├─ 2. AI 生成内容（AiService.chat）
  ├─ 3. 创建 Content 实体（contentRepo.save）
  └─ 4. 视频任务入队（LessonVideoQueueService.enqueue）
       ↓
   [现有队列管线 — 无需改动]
    pollIntervalMs=3000ms → processCurrentTask()
      ├─ Remotion 路径: resolveComposition → TTS → npx remotion render
      └─ HyperFrames 路径: 外部 API
       ↓
   task.status = 'completed' → 视频文件写入 storage/lesson-videos/
```

### 边界与权衡

| 项目 | 决定 | 理由 |
|------|------|------|
| Content 实体必需字段 | 使用 `as any` 绕过 | Content 字段太多（~40列），仅填必需字段；后续可补全 |
| AI 内容质量 | 基础 prompt，不引入 Agent 循环 | 减少复杂度；Agent 循环在渲染阶段由 `VideoGenerationAgentService` 完成 |
| 缓存策略 | topic+ageGroup 去重 | 简单有效；force=true 可绕过 |
| 视频轮询 | 复用现有 `GET /learning/lessons/:id/teaching-video/tasks/:taskId` | 无需新端点 |
| 审批流程 | quick_generate 内容跳过审批 | 教师/家长场景的审批由 lesson 创建流程处理 |