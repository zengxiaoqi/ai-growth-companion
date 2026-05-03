# 动态 Remotion 生成方案

## Summary
现有 `remotion-video-creation` 只是被注入到 agent prompt 里，队列实际渲染时没有让 agent 生成专属 React 组件。当前主链路是：agent 产出分镜，`LessonVideoQueueService` 提取 storyboard，再交给固定的 `RemotionRenderService -> TopicVideo`。所以 Remotion 仍然是固定模板路由，无法根据“认识动物老虎”这类主题临场生成老虎角色、森林场景、奔跑/游泳/吼叫动画。

## Key Changes
- 新增“动态 Remotion composition”链路：storyboard 通过质量检查后，再调用 video-generator agent，让它基于 `skills/remotion-video-creation` 生成每个任务专属的 Remotion TSX 组件和 props。
- 渲染不再只调用固定 `TopicVideo`：为每个任务创建独立 `.generated/remotion-tasks/<taskId>/` 临时入口，包含 `Root.tsx`、`GeneratedLesson.tsx`、`props.json` 和 TTS 音频资源。
- agent 生成内容必须是主题专属动画代码：例如老虎主题要生成老虎 SVG/Canvas/React 动画、森林/河流/夜晚背景、条纹/爪子/游泳/吼叫等分镜元素，而不是套 `science.plant-growth` 之类固定模板。
- 保留现有固定 Remotion 作为降级路径：动态代码生成或渲染失败时，回退到现有 `TopicVideo`，但日志标记 `dynamicRemotion=false`，方便排查质量下降。
- 修复音频链路：渲染前由后端生成每个 scene 的 TTS MP3，校验非空且可解析时长，再传给动态组件用 `<Audio>` 播放；0 字节音频不得进入渲染。

## Implementation Details
- 在 `VideoGenerationAgentService` 增加 `generateRemotionComposition(storyboard, payload)`：
  - 注入 `remotion-video-creation` 及关键规则：animations、audio、assets、images、sequencing、timing、transitions、display-captions。
  - 要求返回结构化 manifest：`compositionId`、`files[]`、`props`、`durationFrames`、`sceneAssetSummary`。
  - 文件内容只允许 React/Remotion/内联 SVG/CSS，不允许 `fs`、`child_process`、网络请求、动态 eval。
- 在 `RemotionRenderService` 增加 `renderGeneratedComposition(manifest, audioFiles)`：
  - 将 manifest 写入 `.generated/remotion-tasks/<taskId>/`。
  - 使用该临时 `Root.tsx` 作为 Remotion entry 渲染 `GeneratedLesson`。
  - 渲染完成后读取 MP4 buffer，并清理临时任务目录。
- 在 `LessonVideoQueueService` 调整 engine 策略：
  - `ageGroup=5-6` 或 `domain=science/art/math复杂内容` 默认走 `dynamic-remotion`。
  - `auto` 顺序改为：dynamic Remotion -> fixed Remotion -> HyperFrames -> local fallback。
- 扩展质量检查：
  - 日志输出每个 scene 的 `title/template/generatedVisual/audioBytes`。
  - 新增验收：生成代码中必须包含主题关键词对应的视觉资产声明，例如“老虎/tiger/stripe/forest/river”等。
  - 可选抽帧检查：至少 3 个时间点截图不应是纯文本画面。

## Test Plan
- 单元测试：agent storyboard 后会触发 `generateRemotionComposition`，不再只传给固定 `TopicVideo`。
- 单元测试：动态 manifest 缺少主题视觉资产时拒绝渲染并降级。
- 单元测试：TTS 返回 0 字节时不生成 `narrationSrc`，并记录失败。
- 集成测试：“认识动物老虎”应生成 `dynamicRemotion=true`，日志包含老虎视觉元素和 `narration audio generated 5/5`。
- 产物测试：用 `ffprobe` 确认 MP4 有 audio stream；抽帧确认画面包含主题动画而非纯文字。

## Assumptions
- 第一版动态内容优先使用代码生成的 SVG/Canvas/React 动画，不依赖外部图片生成服务。
- 动态 Remotion 文件只写入 `.generated/` 临时目录，并加入 gitignore，不污染源码。
- 固定模板保留为稳定降级，但不作为高质量教学视频的首选路径。
