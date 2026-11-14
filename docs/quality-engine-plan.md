# 游戏题目 & 课程质量引擎 — 详细设计

> 状态：设计评审中（未实施）
> 日期：2026-11-14
> 范围：P0 基础设施修复 → P1 题目质量引擎 → P2 课程质量引擎；P3 视频表现力仅列方向。

## 0. 现状诊断摘要（代码证据）

### 游戏题目：三条链路并存

| 链路 | 入口 | 现状 | 核心问题 |
|---|---|---|---|
| A 游戏中心 | `/api/game` → `game.service.ts` | 8 个游戏纯硬编码静态池 | 池子极小（6 色/5 形/6 动物/5 字/4 规律/5 谜语）；谜语病句+错误干扰项（:420）；减法可出负数（:349）；数数选项恒为 count±1 可猜（:281）；闯关假数据（:166） |
| B AI 出题 | `generateQuiz`（两套实现）+ `ai.service.ts:1434` | 笼统 prompt，无答案校验 | correctIndex 越界静默归 0（`generate-quiz.ts:50`）；失败兜底返回「选项A/B/C」占位题（`ai.service.ts:1469`） |
| C 课程配套 | `generateActivity`（`generate-activity.ts`） | 13 题型 + 6 个 playtest 校验器 + 主题对齐 + 3 次重试 | 答案仍靠 LLM 自报（`resolveCorrectIndex` 兜底 0，:1130）；难度只是一个数字；主题规则硬编码仅覆盖动物/数字 |

另有 trivia 游戏（`child_home_screen.dart:217` 可达）直接代理 Open Trivia DB 英文成人题库，无翻译（`public-api.service.ts:257`）。

Flutter 侧事实：`getGameList` / `generateQuiz`（api_service）在页面层**无调用方**；游戏统一经 `GameRenderer` 渲染，数据来自 AI 对话 / 作业 / 课程 pack 的 `activityType + activityData`；`gameId` 远程拉题仅是静态课程 game block 的兜底路径。

### 课程：生成链路

流程：`lesson-content.service.ts:349 runGeneration` → course pack + 练习游戏并行 → 组装「看读写练」→ draft → 家长确认 → 视频队列。

1. **`generateJson` 死代码**：`generate-course-pack.ts:144` 检查 `client.generateJson`，该方法全仓库不存在 → 永远走 `generate()` 兜底，temp 0.2 / 12000 tokens / 严格 JSON system prompt 全部失效；实际 temp 0.7 + 4096 起步（`llm-client.service.ts:735` 递增 4096→8192→16384）。
2. 一次性生成超大 JSON（听说读写 + 4 场景 + 4 分镜 + 家长指南），质量稀释、截断风险高。
3. 弱内容正则检测后整体替换为通用模板（`buildTopicSceneFallback` :934），只填 topic → 空话课程。
4. grounding 靠关键词打分匹配 `src/content/` 38 个静态 JSON（`course-curriculum-fallback.ts:69`），匹配不上即无事实约束。
5. 年龄适配只是 prompt 一行字，无认知约束。
6. `reviewVideoQuality`（五维 LLM 评分）存在但只用于 HyperFrames 视频 agent，课程主链路无评审。
7. 视频 = emoji + 标题 + 字幕弹簧动画（`SlideScene.tsx`）+ 15 个 p5/three 模板；`imagePrompt` 仅用于搜库存图（`visual-asset.service.ts`），不生成图像。
8. outcomes 与练习题分链路生成，无对齐校验。

## 1. 目标架构

两条链路共用一个质量底座，取代现在的「各自为战 + 正则兜底」：

```
知识卡 (grounding)
   │ 注入事实约束
   ▼
生成引擎 (generateActivity / 拆分式 course pack)
   │
   ▼
分层校验：L1 确定性校验(代码) → L2 答案评审(LLM judge) → L3 课程评审(五维评分)
   │ 不合格带 issues 重试
   ▼
题库沉淀 (去重入库 / 抽题复用)
   │
   ▼
答题数据回流 (逐题正确率 → 标记坏题 → 难度校准)
```

质量指标（上线后跟踪）：
- 题目答案错误率（人工抽检 50 题）< 2%
- 课程 JSON 一次解析成功率 > 95%（当前因截断重试，日志可统计）
- 课程「空话场景」占比（命中通用模板兜底的比例）< 10%
- 同一孩子同一主题题目重复率显著下降（题库上线后）

---

## 2. P0 — 基础设施修复（先做，1-2 天）

### P0-1 修复 `generateJson` 死代码

**根因**：`LlmClientService` 没有 `generateJson`；且 temperature 固化在 `ProviderEntry.config`，调用链不支持 per-call 覆盖。

**设计**：

1. `llm-client.service.ts` 新增调用选项并透传（全部可选参数，向后兼容）：

```ts
export interface LlmCallOptions {
  temperature?: number;
  maxTokens?: number;
}

// 签名变更（追加可选参数）：
chatCompletion(messages, tools?, maxTokensOverride?, forceToolChoice?, modelOverride?, options?: LlmCallOptions)
private piAiChatCompletion(..., options?)
private legacyChatCompletion(..., options?)
private callProvider(entry, messages, tools?, maxTokensOverride?, options?)
// callProvider 内：temperature: options?.temperature ?? entry.config.temperature
// legacy 路径同样处理（:857 附近）
```

2. 新增 `generateJson`，复用 `generate()` 的截断递增 + JSON salvage 逻辑：

```ts
async generateJson(
  prompt: string,
  systemPrompt = 'You output strict JSON only. No markdown, no explanations.',
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<string>
// 内部走与 generate() 相同的 ESCALATING_TOKEN_LIMITS 循环，
// 但 temperature = opts.temperature ?? 0.2，maxTokens 起点 = opts.maxTokens ?? 12000
```

实现方式：把 `generate()` 主体抽成 `private generateWithOptions(prompt, systemPrompt?, options?)`，`generate()` 与 `generateJson()` 都是薄封装，避免复制递增/ salvage 逻辑。

3. `generate-course-pack.ts:142` 的 `generateCoursePackJson` 删除 `as any` 探测，直接调用 `this.llmClient.generateJson(prompt, ..., { temperature: 0.2, maxTokens: ... })`。

**改动文件**：`agent-framework/llm/llm-client.service.ts`、`modules/ai/agent/tools/generate-course-pack.ts`。

**验收**：日志确认课程生成请求 temp=0.2、maxTokens=12000；跑 5 个不同主题，JSON 一次成功率明显提升；现有 `generate()` 调用方行为不变（回归 ai 对话）。

### P0-2 出题链路收敛

**决策**：`generateActivity` 是唯一 LLM 出题引擎；其余链路委托或清理，不写 legacy 格式 adapter。

1. **两套 `GenerateQuizTool`**（`modules/ai/agent/tools/generate-quiz.ts`、`agent-framework/tools/impl/generate-quiz.ts`）：内部改为委托 `GenerateActivityTool.execute({ type: 'quiz', topic, difficulty, ageGroup })`，把返回的 activity 映射回 `{ questions, topic, ageGroup }` 旧格式（字段一一对应，仅外壳不同）。对外契约不变，agent 注册表不动。
2. **`ai.service.ts:1434 generateQuiz`**：同样委托；**删除「选项A/B/C」占位题兜底**，失败抛明确错误（前端已有错误处理）。
3. **`/api/game` 硬编码**：`getGameList` 前端无调用方 → 端点标记 deprecated 保留；`generateGame` 只修致命伤（减法保证 `a >= b`；删除/重写 5 条病句谜语；数数选项改为非恒 ±1 的干扰项），不做 LLM 化（该路径只剩静态课程兜底，不值得投入）。
4. **trivia 游戏**：从 `child_home_screen.dart` 移除入口（英文成人题库不适合 3-6 岁）；`TriviaQuizGame` 文件保留但不可达，P1 题库上线后用自建中文题库替换复活。

**改动文件**：两个 generate-quiz.ts、`ai.service.ts`、`game.service.ts`、`child_home_screen.dart`。

**验收**：AI 对话「考考我」走统一引擎（日志可见 generateActivity runId）；失败不再出现占位题；游戏中心不再出负数/病句题；孩子端看不到 trivia 入口。

### P0-3 答案正确性分层校验

**新文件**：`src/backend/src/common/activity/answer-validation.ts`（与现有 6 个 playtest 校验器同目录同风格）。

**L1 确定性校验（代码，零成本）**：
- quiz：`correctIndex` 必须在 bounds 内，**越界不再归 0，直接判失败**；options 去重后 ≥ 3；题干非空。
- 数学类 quiz：题干匹配 `a + b = ?` / `a - b = ?` 时直接验算，答案不符 → 失败；减法结果 < 0 → 失败。
- fill_blank：`answer ∈ options`、含空标记（已有部分，归拢）。
- true_false：`isCorrect` 必须是 boolean。

**L2 LLM-as-judge（事实题，批量一次调用）**：
- 触发：quiz / true_false / fill_blank 且 L1 通过。一次调用校验整批（3-5 题），控制成本。
- 输入：题目 + 选项 + 标注答案 + explanation + 年龄组 + （P1 后）知识卡 facts。
- prompt 要点（独立上下文，不复用生成 prompt，避免自我确认偏差）：

```
你是幼儿内容审核员。逐题判断标注答案是否正确、干扰项是否成立。
判定标准：
- correct：答案事实正确，且其他选项都明确错误（无歧义）
- incorrect：答案事实错误 → 给出 correctedIndex
- ambiguous：多个选项都可成立（如"什么球是圆的"配足球/篮球）→ 必须拒绝
- inappropriate：超出该年龄段认知（负数、抽象概念、识字量超标）
只返回 JSON：{"results":[{"i":0,"verdict":"correct|incorrect|ambiguous|inappropriate","correctedIndex":1,"reason":"..."}]}
```

- temp 0（用 P0-1 的 options），主模型。
- 处理：incorrect → 有 correctedIndex 则修正后重过 L1，否则整批重试；ambiguous/inappropriate → 丢弃该题；有效题 < 3 → 触发重试。
- judge 调用失败（超时/解析失败）：降级为仅 L1 + warn 日志，不阻塞出题。

**集成点**：`generate-activity.ts` 的 `sanitizeActivity` 之后、`validateTopicAlignment` 之后插入 `validateAnswers`；失败原因写入现有 `failures[]` 重试反馈（重试 prompt 会带上「上一批第 2 题答案错误」这类具体 issue，比现在的笼统 reflection 更有效）。

**改动文件**：新增 answer-validation.ts；`generate-activity.ts` 接入；`generate-quiz.ts`（委托后自动获得）。

**验收**：构造 10 道已知坏题（错误答案/歧义干扰项/负数）单测全部拦截；抽检 50 道生成题答案错误率 < 2%；judge 失败时出题仍可用。

---

## 3. P1 — 题目质量引擎（3-5 天）

### P1-1 难度模型具体化

**新文件**：`src/backend/src/common/learning/difficulty-profiles.ts`。

把 `difficulty 1-3` 翻译成可执行约束（代码常量，非 LLM 自由发挥）：

| 年龄 | d1 | d2 | d3 |
|---|---|---|---|
| 3-4 数学 | 5 以内数数/一一对应 | 10 以内数数/比大小 | 10 以内、ABAB 规律 |
| 3-4 语言 | 常见名词、单字认读 | 简单短句、2-3 字词语 | 完整单句表达 |
| 5-6 数学 | 10 以内加减 | 20 以内加减、两步规律 | 50 以内、ABC/递增规律、简单推理 |
| 5-6 语言 | 常见字、看图说话 | 短句阅读、连词成句 | 段落理解、因果表达 |

profile 结构：`{ maxNumber, allowedOps, patternComplexity, vocabLevel, sentenceLength, cognitiveNotes }`。

**两个消费点**：
1. prompt：替换 `Difficulty: 2` 为具体约束文本（`generate-activity.ts buildPrompt`、course pack prompt）。
2. L1 校验：数学题数值范围/运算类型超出 profile → 拒绝（与 P0-3 合并实现）。

### P1-2 题库沉淀与数据回流

**新实体** `question-item.entity.ts`（遵循 assignment.entity 约定：自增 id + uuid + simple-json）：

```ts
@Entity('question_items')
class QuestionItem {
  id; uuid;
  topic: string;            // 归一化主题
  ageGroup: string;         // '3-4' | '5-6'
  domain: string;
  difficulty: number;
  activityType: string;     // quiz / fill_blank / ...
  questionHash: string;     // sha1(题干+选项归一化)，unique 约束去重
  payload: any;             // 单题完整数据（含 correctIndex/explanation）
  source: string;           // 'llm' | 'curriculum' | 'manual'
  status: string;           // 'active' | 'flagged' | 'retired'
  qualityScore: number;     // judge/评审分
  timesServed: number;
  timesCorrect: number;
  createdAt; lastServedAt;
}
```

注意：题库按**单题**粒度存储（一个 activity 拆成多题），`matching/connection` 等整组题型按整组 payload 存一条。

**新服务** `question-bank.service.ts`（放 `modules/game/` 或新 `modules/question-bank/`）：
- `ingest(activity)`：generateActivity 成功后异步入库，hash 去重；失败只记日志。
- `select({topic, ageGroup, difficulty, type, childId, count})`：优先 active 题，排除该孩子最近 20 次已出（见下），按 `timesServed` 升序 + 随机抖动；不足部分走新生成。
- `recordResult(childId, servedItems, answers)`：逐题更新 timesServed/timesCorrect；样本 ≥ 10 且正确率 < 30% 或 > 95% → `flagged`（人工复核队列）。

**出题混合策略**：对话/课程出题时先 `select`，缺口才 LLM 生成（比例可配，默认题库优先）。`/api/game/:gameId` 兜底路径也可改为从题库抽（替代硬编码，P0 只修硬伤后的进一步收敛，可选）。

**逐题结果回流**：
- Flutter `quiz_game.dart:203` 已上报 `interactionData.answers`（选项 index 数组），后端知道题目顺序与 correctIndex → 可推导逐题对错，**前端无需改动**。
- 关键：出题时把「本次出题目 hash 列表」随 activity 一起下发/记录（`activityData.servedQuestionIds`），结果回来时按 index 对齐。其他题型（drag_sort 等）按整组对错统计。
- 接入点：`game.service.saveGameResult`、`lesson-content.service.completeStep`、assignment 完成回调。

**冷启动**：离线脚本 `scripts/seed-question-bank.ts`：① 导入 38 个静态 JSON 的 quizItems（`course-curriculum-fallback.extractQuizItems` 已有提取逻辑可复用）；② 对每个主题 × 年龄 × 难度批量调 generateActivity 预生成（走完整校验），目标每格 ≥ 10 题。

**验收**：同一孩子同主题连续出题不重复；坏题自动 flagged；断网/LLM 失败时题库仍可出题。

### P1-3 主题知识卡（grounding 升级）

**新实体** `knowledge-card.entity.ts`：

```ts
{
  topic, aliases: string[], ageGroup, domain,
  facts: [{ unit: '兔子', fact: '兔子爱吃胡萝卜和青草', source: 'curriculum|llm|manual' }],
  misconceptions: ['兔子不是啮齿类...'],   // 常见错误，judge 用
  vocabulary: ['胡萝卜', '青草'],          // 该年龄可接受词汇
  quizSeeds: [...],                        // 可选
  status: 'active' | 'draft',
}
```

**来源**：
1. 一次性脚本：38 个静态 JSON → 知识卡（复用现有 extractExampleFacts/extractInlineFacts，LLM 辅助补全 facts，人工抽检）。
2. 新主题：课程生成时若未命中知识卡，先让 LLM 产出知识卡草稿 → judge 评审事实 → 入库（draft → active 需评审通过）。

**检索升级**：alias 精确匹配优先，关键词打分兜底（保留现有评分逻辑作 fallback）。**替换 `course-curriculum-fallback.ts` 内部实现，保持 `getCoursePackCurriculumSeed` 返回接口兼容**，调用方零改动。

**消费点**：generateActivity prompt 注入 facts + vocabulary；course pack prompt 注入 facts；P0-3 judge 输入附 facts 作为事实依据；P2 评审比对事实一致性。

**验收**：动物/数字之外的主题（如「四季」「情绪」）出题有事实约束；知识卡未命中时日志可见且走建卡流程。

---

## 4. P2 — 课程质量引擎（1-2 周）

### P2-1 拆分生成

**现状**：一次 12000 token 大 JSON。**新流程**（编排放在 `CourseGenerationAgentService`，`generateCoursePack` 工具对外契约不变）：

```
Step 1  generateOutline        小 JSON，temp 0.3
        → { title, summary, outcomes[3], teachingUnits[2-4], knowledgeCardTopic }
        校验：outcomes 具体可测、units 有知识卡 fact 支撑
Step 2  并行生成（各自独立 schema，temp 0.4）：
        ├─ listening 模块（audioScript + questions）
        ├─ speaking 模块（prompts）
        ├─ reading 模块（text + keywords + questions）
        ├─ writing 模块（tracingItems + practiceTasks）
        └─ visualStory + videoLesson（4 场景 + 4 分镜，temp 0.5）
        每模块独立 sanitize + 校验 + 重试（≤2 次），失败只重试该模块
Step 3  assembleCoursePack     复用现有 sanitizeCoursePack 组装逻辑
```

- 每个子 prompt 只带本模块 schema + 知识卡 facts + outline，不再背全量 schema。
- 现有 `isWeakTeachingContent` 正则保留为 L1，但**兜底策略改变**：单场景弱 → 只重写该场景（带 issue 反馈），不再整体替换成通用模板；整模块弱 → 重试该模块。
- 单次生成保留为内部 fallback（编排整体失败时），不暴露开关。

**验收**：单主题生成总耗时不显著上升（并行）；空话场景占比 < 10%；单模块失败不再拖垮整课。

### P2-2 教学法结构 + 目标对齐

- outline prompt 写入结构约束：导入（激活先验）→ 逐 unit 讲解（每 unit 一个知识卡 fact）→ 示范 → 练习 → 总结。
- **对齐校验**（代码，组装后）：outcomes 中的关键词必须出现在 reading 文本或 practice 题目中；不满足 → 带 issue 重试 practice/reading 模块（≤1 次）。
- 每个 teachingUnit 必须有知识卡 fact 支撑；无卡主题先走 P1-3 建卡。

### P2-3 评审闭环接入主链路

**新工具** `review-course-pack.ts`（复制 `review-video-content.ts` 模式，注册进 ToolRegistry）：
- 五维评分（各 0-20）：目标对齐 / 年龄适配 / 事实准确（对照知识卡）/ 内容具体性 / 结构完整。
- temp 0，输出 `{ score, passed(≥70), issues[], suggestions[], breakdown }`。
- 规则兜底（LLM 失败时）：复用现有正则 + 知识卡 fact 覆盖率。

**接入** `runGeneration`（`lesson-content.service.ts:421` assemble 之后）：
```
assemble → review → score ≥ 70 ? 存 draft
                  : 带 issues 重试弱模块一次 → 再评审 → 仍 < 70 存 draft 但标 qualityWarning
```
- `qualityScore / qualityIssues` 存入 `Content.content.quality`。
- **家长确认页**展示质量分 + issues 摘要（前端：draft 详情/确认组件，小改动），让家长知情决策。

**验收**：低质课程在家长确认页可见警示；评审重试后平均分提升（日志统计）。

---

## 5. P3 — 视频表现力（方向，另行设计）

- 动画模板库扩充（当前 15 个，`animation-templates.ts`）：按主题覆盖率缺口排优先级。
- `imagePrompt` 接图像生成（当前仅搜库存图）：成本/风格一致性/缓存策略需单独评估。
- HyperFrames 生成式 composition 路径与 Remotion 模板路径的取舍。

## 6. 落地顺序

| 步骤 | 内容 | 依赖 | 前端改动 |
|---|---|---|---|
| Step 1 | P0-1 generateJson + P0-3 答案校验 | 无 | 无 |
| Step 2 | P0-2 链路收敛 + trivia 下架 | Step 1 | 移除入口 |
| Step 3 | P1-1 难度模型 + P1-3 知识卡 | Step 1 | 无 |
| Step 4 | P1-2 题库 + 数据回流 | Step 3 | 无（answers 已上报） |
| Step 5 | P2-1/2/3 课程引擎 + 评审闭环 | Step 3 | 确认页质量分 |

每步独立可验收、可回滚；Step 1 收益最直接（课程稳定性 + 答案致命伤）。

## 7. 风险与开放问题

- **judge 成本**：每次出题多一次 LLM 调用（批量校验控制）；题库命中率上升后调用量下降。
- **题库冷启动质量**：预生成题同样过 L1+L2；人工抽检后再放量。
- **知识卡事实准确性**：LLM 建卡必须过评审 + 人工抽检，错误事实会污染出题和课程两条链路——这是整个底座最值得人工投入的地方。
- **`/api/game` 废弃影响面**：静态课程 game block 的 gameId 兜底仍依赖它，P0 只修硬伤不删端点。
- **评审主观性**：LLM 评分有噪声，阈值 70 先跑数据再校准；家长确认页始终保留人工决策。