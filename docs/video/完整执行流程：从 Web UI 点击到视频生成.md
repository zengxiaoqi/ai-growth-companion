## 完整执行流程：从 Web UI 点击到视频生成

### 全局时序图

```
家长操作                      NestJS 后台                        外部/进程
─────────────────────────────────────────────────────────────────────────────

① 点击"一键生成课程"
   │
   ├─ POST /api/learning/lessons/generate ──→ Controller.generateLesson()
   │   { topic, childId, ageGroup, domain }        │
   │                                                  │
   │                                          lessonContentService.generateDraft()
   │                                                  │
   │                                          startGeneration()
   │                                            │
   │                                            ├─ 创建 Content 记录 (status='generating')
   │                                            │   ↓ 立即返回给前端（带 contentId）
   │  ← 返回 { id, status:'generating' } ←──────┘
   │
   │  前端开始轮询 GET /api/learning/lessons/drafts
   │
   │                                    ② 后台异步执行 runGeneration()
   │                                        │
   │                                        ├─ Step 1/3: GenerateCoursePackTool.execute()
   │                                        │   ├─ LlmClientService.generate(prompt) ──→ LLM API
   │                                        │   │   prompt 包含:
   │                                        │   │   - 主题、年龄段、领域
   │                                        │   │   - 可用 animationTemplate 列表
   │                                        │   │   - 强制要求 visual 场景描述
   │                                        │   │   - JSON schema
   │                                        │   │   ← 返回 JSON {
   │                                        │   │       title, summary,
   │                                        │   │       watch: { visualStory, videoLesson },
   │                                        │   │       reading: { ... },
   │                                        │   │       writing: { ... },
   │                                        │   │       parentGuide: { ... }
   │                                        │   │     }
   │                                        │   │
   │                                        │   └─ sanitize/validate JSON
   │                                        │      ├─ validateAnimationTemplate()
   │                                        │      └─ injectAnimationTemplates()
   │                                        │
   │                                        ├─ Step 2/3: GenerateActivityTool.execute()
   │                                        │   └─ LLM 生成练习游戏 (quiz/matching/...)
   │                                        │
   │                                        └─ Step 3/3: assembleLesson()
   │                                            ├─ 4 个 step: watch, read, write, practice
   │                                            ├─ deriveWatchSceneDocument() → scene JSON
   │                                            ├─ deriveWriteSceneDocument() → scene JSON
   │                                            ├─ derivePracticeSceneDocument() → scene JSON
   │                                            └─ UPDATE content SET status='draft'
   │
   │  前端轮询检测到 status='draft'
   │  展示课程预览（4步）
   │
③ 家长预览/修改/确认
   │
   ├─ PATCH /api/learning/lessons/:id ──→ modifyDraft() ──→ LLM 修改
   │
   ├─ POST /api/learning/lessons/:id/confirm ──→ confirmAndPublish()
   │     status='published'
   │
④ 家长点击"生成教学视频"
   │
   ├─ POST /api/learning/lessons/:id/teaching-video/tasks
   │                                        │
   │                                 lessonVideoQueue.enqueue()
   │                                   ├─ buildPackPayloadFromContent(content)
   │                                   │   提取 lesson 中的 watch 场景数据
   │                                   ├─ computeCacheKey() (SHA256 去重)
   │                                   ├─ 检查可复用的已完成任务
   │                                   └─ INSERT VideoGenerationTask (status='pending')
   │
   │  ← 返回 { taskId, status:'pending' }
   │
   │  前端开始轮询 GET .../tasks/:taskId
   │
   │                                    ⑤ 队列轮询器 (每 3 秒)
   │                                        processQueue()
   │                                          │
   │                                          └─ processNextTask()
   │                                              ├─ SELECT WHERE status='pending' ORDER BY createdAt
   │                                              ├─ UPDATE status='processing'
   │                                              │
   │                                              └─ generateVideoBuffer()
   │                                                  │
   │                                     ┌─── 优先路径: Remotion 本地渲染 ───┐
   │                                     │                                    │
   │                                     │  generateByRemotion()              │
   │                                     │    │                               │
   │                                     │    ├─ remotionRender               │
   │                                     │    │   .resolveComposition()       │
   │                                     │    │   ├─ buildVideoDataFromLesson()
   │                                     │    │   │   提取 watch scenes
   │                                     │    │   │   合并 listening slides
   │                                     │    │   │   构建 supplement slides
   │                                     │    │   │   (reading/writing/practice/quiz)
   │                                     │    │   │   返回 TeachingVideoData
   │                                     │    │   │
   │                                     │    │   └─ TTS 语音合成
   │                                     │    │       VoiceService.textToSpeech()
   │                                     │    │       为每张 slide 生成旁白 MP3
   │                                     │    │       保存到 video-remotion/public/
   │                                     │    │
   │                                     │    ├─ remotionRender               ──→ 子进程
   │                                     │    │   .renderComposition()         npx remotion render
   │                                     │    │   ├─ npx remotion render       TopicVideo \
   │                                     │    │   │  TopicVideo \                out/video.mp4 \
   │                                     │    │   │  out/xxx.mp4 \              --input-props='{...}'
   │                                     │    │   │  --input-props='{...}'     --codec=h264
   │                                     │    │   │  --codec=h264
   │                                     │    │   │
   │                                     │    │   │  Remotion 内部:
   │                                     │    │   │  ├─ Root.tsx 注册 TopicVideo composition
   │                                     │    │   │  ├─ TopicVideo 组合:
   │                                     │    │   │  │   ├─ IntroScene (3s)
   │                                     │    │   │  │   ├─ <Sequence> per slide:
   │                                     │    │   │  │   │   ├─ AnimatedSceneRouter
   │                                     │    │   │  │   │   │   根据 animationTemplate.id
   │                                     │   │   │   │   │   │   路由到对应的 SVG 场景组件
   │                                     │    │   │  │   │   │   (WaterCycle/CharacterStroke/...)
   │                                     │    │   │  │   │   └─ SlideScene (fallback)
   │                                     │    │   │  │   │       hero/grid/list 布局
   │                                     │    │   │  │   └─ OutroScene (3s)
   │                                     │    │   │  │
   │                                     │    │   │  └─ 30fps × 总帧数 = MP4
   │                                     │    │   │
   │                                     │    │   └─ 进度回调 → UPDATE progress=10..95
   │                                     │    │
   │                                     │    ├─ readFile(output.mp4) → Buffer
   │                                     │    └─ cleanupNarrationFiles() 删除临时 MP3
   │                                     │
   │                                     │  返回 Buffer ──────────────────────┘
   │                                     │
   │                                     ├── 备选路径: 第三方视频 API ────────→ 外部 API
   │                                     │   generateByThirdParty()
   │                                     │   POST 创建任务 → 轮询状态 → 下载 MP4
   │                                     │
   │                                     └── 最终 fallback: AiService
   │                                         renderTeachingVideoFromPack()
   │                                         ──────────────────────────────────→
   │
   │                                              ├─ writeVideoToCache() 保存 MP4
   │                                              └─ UPDATE task SET
   │                                                   status='completed',
   │                                                   progress=100,
   │                                                   localVideoPath='...',
   │                                                   approvalStatus='pending_approval'
   │
   │  前端轮询检测到 status='completed'
   │  展示视频预览 + 审批按钮
   │
⑥ 家长审批视频
   │
   ├─ PATCH .../video-status ──→ approvalStatus='approved'
   │
⑦ 学生观看
   │
   ├─ GET /api/learning/lessons/:id/teaching-video ──→ 流式返回 MP4
   │
   └─ 或学生在 StructuredLessonView 中
      进入"观看动画讲解"步骤
      → AnimationScenePlayer 实时播放 SVG 动画 + TTS
```

### 关键节点说明

| 节点 | 服务 | 存储 | 耗时 |
|------|------|------|------|
| ① 创建占位记录 | `lessonContentService` | `content` 表, status=`generating` | <100ms |
| ② LLM 生成课程 | `GenerateCoursePackTool` → LLM API | 内存 → `content` 表 | 10-30s |
| ③ 家长确认 | `lessonContentService` | `content` 表, status=`published` | <100ms |
| ④ 入队视频任务 | `lessonVideoQueue` | `video_generation_task` 表 | <100ms |
| ⑤ Remotion 渲染 | `remotionRender` → 子进程 `npx remotion render` | 临时 MP4 → 缓存目录 | **1-5 分钟** |
| ⑤-a TTS 合成 | `VoiceService` | `video-remotion/public/narration-*.mp3` | 5-15s |
| ⑤-b Remotion 帧渲染 | `npx remotion render` | `video-remotion/out/*.mp4` | 30s-4min |
| ⑥ 审批 | `lessonVideoQueue` | task.`approvalStatus`=`approved` | <100ms |
| ⑦ 学生播放 | 直接 HTTP 流 | 读缓存 MP4 | 即时 |

### 三层视频生成降级策略

```
generateVideoBuffer()
  │
  ├─ 1️⃣ generateByRemotion()    ← 本地 Remotion 渲染（最高质量）
  │     ├─ 成功 → 返回 Buffer
  │     └─ 失败 ↓
  │
  ├─ 2️⃣ generateByThirdParty()  ← 外部视频生成 API（需配置）
  │     ├─ 成功 → 返回 Buffer
  │     └─ 失败 ↓
  │
  └─ 3️⃣ aiService.renderTeachingVideoFromPack()  ← 最终 fallback
        └─ 兜底渲染
```

### 队列轮询机制

`LessonVideoQueueService` 实现了 `OnModuleInit`，在 NestJS 启动时自动开始：

```typescript
onModuleInit() {
  this.queueTimer = setInterval(() => this.processQueue(), this.pollIntervalMs);
  //                    每 3 秒扫描一次 pending 任务 ──────────────────↑
}
```

- 单 worker 模式（`workerBusy` 锁防止并发）
- 失败自动重试（最多 2 次，`maxRetries=2`）
- 缓存去重（相同内容 hash → 复用已完成的视频）
- 72 小时自动过期清理