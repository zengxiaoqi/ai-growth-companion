# 计划：让 Agent 管道充分利用 Skills 能力生成高质量视频

## 背景

Agent 管道已正确加载 `remotion-video-creation` 等 Skills（无截断），且 Agent 配置了 `writeFile`、`renderRemotion`、`loadSkill` 等工具。但视频质量远低于直接使用 Claude Code + 同样 Skills 的效果。根本原因是：**Agent LLM 生成的 TSX 代码从未被渲染管道使用**。

## 根因分析

### 核心差距：LLM 生成的 TSX 是死代码

追踪完整管道后的关键发现：

| 阶段 | LLM 生成 | 实际使用 |
|------|---------|---------|
| 分镜 JSON (`VideoStoryboard`) | ✅ 通过 `generateVideoContent` 工具 | ✅ 传递给下游 |
| **TSX 视觉组件** | ❌ 从未生成 | ✅ 使用 `buildGeneratedLessonTsx()` 硬编码模板 |
| 动画模板选择 | ✅ LLM 在分镜中指定 `animationTemplate.id` | ❌ 被 `buildDynamicSceneProps()` 的关键词匹配覆盖 |
| Remotion 渲染 | Agent 有 `renderRemotion` 工具 | ❌ 服务层直接调用硬编码模板渲染 |

**管道流程（现状）：**
```
Agent 循环 → LLM 生成分镜 JSON → 提取分镜结果
    ↓
服务层 generateByDynamicRemotion()
    → buildDynamicSceneProps()  ← 关键词推断（非 LLM）
    → buildGeneratedLessonTsx() ← 400 行硬编码 String.raw 模板
    → renderGeneratedComposition() ← 渲染硬编码模板
```

**直接 Claude Code 的流程（高质量）：**
```
Claude Code 读取 Skill → LLM 编写自定义 TSX 组件 → Remotion 渲染
```

**差距根源：** `lesson-video-queue.service.ts` 的 `generateVideoBufferWithEngines()` 完全绕过了 Agent 的 `writeFile` + `renderRemotion` 路径，直接使用硬编码模板。

### 次要问题

1. **验证关卡过于严格**：`validateGeneratedManifest()` 要求每个动物场景有 `characterAssetSrc` 或在内联 SVG 列表中，否则拒绝整个管道
2. **TopicVisual 回退是圆圈+文字**：非 tiger/rabbit/monkey 动物只显示 `<circle>` + `<text>`
3. **搜索查询质量低**：`queryForRole()` 对非配置动物只做 `role.replace(/-/g, " ")` 生成模糊查询
4. **许可证限制过严**：只接受 CC0/PDM，排除大量 CC-BY 优质图片

## 实施计划

### 阶段 1：让 Agent 管道使用 LLM 生成的 TSX（核心修复）

**目标：** 消除"分镜是 LLM 生成的，但视觉组件是硬编码模板"的断裂，让所有主题都能充分利用 Skills。

#### 步骤 1.1：新增 Agent 输出提取逻辑
**文件：** `src/backend/src/modules/learning/lesson-video-queue.service.ts`

- 在 `generateViaAgent()` 完成后，除了提取分镜和质量评审结果外，还提取 Agent 写入的文件
- 从 Agent 工具调用日志中，提取所有 `writeFile` 调用及其内容
- 返回结构扩展为 `{ storyboard, quality, agentFiles: Map<path, content> }`

#### 步骤 1.2：修改 generateByDynamicRemotion 使用 Agent 生成的 TSX
**文件：** `src/backend/src/modules/learning/video-generation-agent.service.ts`

- 修改 `generateRemotionComposition()` 方法签名，新增可选参数 `agentFiles?: Map<string, string>`
- 如果 `agentFiles` 包含 `GeneratedLesson.tsx`（或类似文件名），使用 Agent 生成的内容替代 `buildGeneratedLessonTsx()` 硬编码模板
- 如果 `agentFiles` 包含 `Root.tsx` 或 `index.ts`，同样优先使用 Agent 版本
- 保留硬编码模板作为 fallback（Agent 未生成 TSX 时使用）

#### 步骤 1.3：修改 Agent 系统提示词，引导 LLM 生成 TSX
**文件：** `src/backend/src/agent-framework/agents/definitions/video-generator.agent.ts`

- 更新系统提示词，明确指示 Agent 在生成分镜后：
  1. 调用 `loadSkill("remotion-video-creation")` 获取 Remotion 技能
  2. 基于分镜和技能指导，通过 `writeFile` 生成自定义 `GeneratedLesson.tsx` 组件
  3. 组件应包含针对具体主题的视觉表现（动物 SVG、科学图解、数学动画等）
  4. 遵循 Remotion 动画规则（`useCurrentFrame()`、`interpolate()`，禁用 CSS 动画）
- 提供输出文件路径约定：`video-remotion/.generated/remotion-tasks/{taskId}/GeneratedLesson.tsx`

#### 步骤 1.4：放宽 validateGeneratedManifest 验证
**文件：** `src/backend/src/modules/learning/video-generation-agent.service.ts`

- 当使用了 Agent 生成的 TSX 时，跳过 `DYNAMIC_REMOTION_MISSING_CHARACTER_ASSET` 检查
- Agent 生成的组件自带视觉逻辑，不依赖外部素材验证
- 保留对硬编码模板路径的严格验证

### 阶段 2：改进硬编码模板的通用回退（兜底方案）

**目标：** 当 Agent 未生成 TSX 时，硬编码模板对所有主题都能提供合理的视觉效果。

#### 步骤 2.1：为所有 cnToAnimalId 动物生成合成配置
**文件：** `src/backend/src/modules/learning/animal-subjects.config.ts`

- 新增 `ANIMAL_VISUAL_TERMS` 映射：每种动物 3-4 个视觉术语（约 40 条）
- 新增 `ANIMAL_EMOJI_MAP` 映射：动物 ID → Unicode emoji
- 新增 `getOrCreateAnimalConfig(id)` — 返回已有配置或生成合成配置
- 更新 `inferAnimalFromText()` 始终返回非 null 配置

#### 步骤 2.2：改进 TopicVisual 回退
**文件：** `src/backend/src/modules/learning/video-generation-agent.service.ts` — `buildGeneratedLessonTsx()`

- 替换圆圈+文字回退为：大号 emoji + 装饰性 SVG 动画 + 副标题
- 遵循 TigerSvg/RabbitSvg 的动画模式

#### 步骤 2.3：改进非动物主题的视觉表现
**文件：** `src/backend/src/modules/learning/video-generation-agent.service.ts` — `buildGeneratedLessonTsx()`

- 当前 `TopicVisual` 对非动物主题（如数学、科学、语言）也只显示圆圈+文字
- 根据 `domain` 字段（language/math/science/art/social）提供不同的视觉模板：
  - **math**: 数字动画、几何图形、计数动画
  - **science**: 实验器皿 SVG、分子结构、自然现象
  - **language**: 字母/汉字动画、发音波形
  - **art**: 画笔/调色板 SVG、颜色混合动画
  - **social**: 人物 SVG、场景图标

### 阶段 3：改进外部素材管道

#### 步骤 3.1：扩大许可证接受范围
**文件：** `src/backend/src/modules/learning/visual-asset.service.ts`

- `isAllowedLicense()` 接受 CC-BY 和 CC-BY-SA
- 跟踪许可证信息用于署名

#### 步骤 3.2：改进搜索查询
**文件：** `src/backend/src/modules/learning/visual-asset.service.ts`

- `queryForRole()` 使用动物配置的 `visualTerms` 构建查询
- 非动物主题使用 `domain` + 场景关键词构建查询

#### 步骤 3.3：降低角色素材最小尺寸
**文件：** `src/backend/src/modules/learning/visual-asset.service.ts`

- 角色素材最小尺寸从 512x360 降至 256x200

## 关键文件

| 文件 | 变更 |
|------|------|
| `src/backend/src/modules/learning/lesson-video-queue.service.ts` | 提取 Agent 写入的文件，传递给渲染管道 |
| `src/backend/src/modules/learning/video-generation-agent.service.ts` | 使用 Agent TSX 替代硬编码模板，改进 TopicVisual 回退 |
| `src/backend/src/agent-framework/agents/definitions/video-generator.agent.ts` | 更新系统提示词引导 LLM 生成 TSX |
| `src/backend/src/modules/learning/animal-subjects.config.ts` | 扩展动物配置、视觉术语、emoji 映射 |
| `src/backend/src/modules/learning/visual-asset.service.ts` | 扩大许可证、改进查询、降低最小尺寸 |

## 验证方法

1. **孔雀视频**：通过 Agent 管道生成孔雀视频 → 验证 LLM 生成自定义 TSX（非圆圈+文字）
2. **数学主题**：生成"认识数字1-10"视频 → 验证使用主题特定视觉（非通用圆圈）
3. **无 Agent TSX 回退**：禁用 Agent TSX 生成 → 验证硬编码模板的 emoji 回退正常工作
4. **回归测试**：验证 tiger/rabbit/monkey 视频仍正常
5. **对比测试**：Agent 生成 vs 直接 Claude Code 生成的视觉质量差距应显著缩小
