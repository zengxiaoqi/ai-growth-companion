# 修复课程/视频生成走 Agent 且主题相关

## Summary

当前问题有三条根因：

- `/api/learning/lessons/generate` 实际走的是 legacy `GenerateCoursePackTool`，没有经过 `course-designer` agent；LLM 连续返回非 JSON 后回退模板。
- `/api/learning/lessons/:id/teaching-video/tasks` 代码里虽有 agent-first 分支，但 `LessonVideoQueueService` 用了 `import type { VideoGenerationAgentService }`，Nest 无法用运行时类型注入，`@Optional()` 让它静默变成 `undefined`，所以直接走 legacy HyperFrames/Remotion。
- fallback 课程种子匹配把 `认识动物老虎` 错配成“四季变化”：当前评分只靠 `domain=science` 就能达标，且 `认识动物老虎` 没被拆成 `动物/老虎` 等关键词，导致第一个 science 课程种子被选中。

## Key Changes

- 修复视频 agent 注入：
  - 将 `lesson-video-queue.service.ts` 中 `VideoGenerationAgentService` 改为运行时 import，并用显式 `@Inject(VideoGenerationAgentService)` 注入。
  - 启动时打印 `agent pipeline enabled/disabled`，避免以后静默回退。
  - 注册 `generateVideoContent`、`reviewVideoQuality`、`executeCommand`、`readFile/writeFile`、`renderHyperframes/renderRemotion` 等 video-generator 允许工具。

- 修复课程走专门 agent：
  - 新增一个课程生成桥接服务，使用 `courseDesignerDefinition + AgentExecutorService` 调 `generateCoursePack`，从 tool call 中提取课程包。
  - `LessonContentService` 先走 `course-designer` agent；agent 不可用或失败时才显式 warn 并回退 legacy tool。
  - 修复 `ToolRegistryService` 对 factory provider 的发现逻辑，让 `FwGenerateCoursePack` 这类包装工具能被 auto-register。

- 修复主题错配和 domain 丢失：
  - `course-curriculum-fallback.ts` 改为“主题词命中是必要条件，domain 只做加分”，禁止仅凭 `science` 选中四季。
  - 增强 topic terms：`认识动物老虎` 至少拆出 `动物`、`老虎`，并给 `老虎` 增加动物类 alias。
  - `assembleLesson` 写入 `domain`，`buildPayloadFromSteps` 从 `lesson.domain || content.domain` 带到视频 payload。
  - 渲染前增加轻量主题对齐保护：若 shots 明显不含 topic 关键词且 visualStory/watchScene 更相关，优先使用相关内容；否则用修正后的课程种子重建 shots。

- 降低课程包 JSON 失败率：
  - 给 `GenerateCoursePackTool` 增加 request/response preview 日志。
  - 课程包生成改用低温度 JSON 模式/`generateJson`，provider 不支持时自动退回普通 `generate`。
  - 保留最终 fallback，但 fallback 必须使用修正后的主题种子，不能产生跨主题内容。

## Test Plan

- 单元测试：
  - `getCoursePackCurriculumSeed({ topic: "认识动物老虎", ageGroup: "5-6", domain: "science" })` 返回动物相关 seed，不返回春夏秋冬。
  - `LessonVideoQueueService.generateVideoBuffer` 在传入 mock `VideoGenerationAgentService` 时先调用 agent，并把 agent storyboard 传给 HyperFrames。
  - 无 agent 时仍保持 legacy engine fallback。
  - structured lesson payload 包含 `domain: "science"`。
  - `course-designer` agent 桥接服务能调用 `generateCoursePack` 并返回课程包。

- 回归验证：
  - 运行 `cd src/backend && npm run test -- --runInBand test/unit/generate-course-pack.tool.spec.ts test/unit/lesson-video-queue.service.spec.ts`。
  - 运行一次 `POST /api/learning/lessons/generate`，主题 `认识动物老虎`，日志应出现 `course-designer`/`generateCoursePack` agent tool call，且不再出现四季 shots。
  - 运行一次 `POST /api/learning/lessons/62/teaching-video/tasks`，日志应出现 `using agent pipeline`、`generateViaAgent`、`generateVideoContent`、`reviewVideoQuality`。

## Assumptions

- 保持现有 API response shape 不变，不改前端调用。
- Agent 失败时允许兼容性 fallback，但必须写清楚 warn 日志。
- 视频最终仍可复用现有 HyperFrames/Remotion 渲染器；本次重点是让专门 agent 负责主题分镜和质量检查。
