# 从「碎碎念」移植优秀能力到灵犀伴学

> 状态：**路线图 + 落地记录**。第一至九节是设计；第十节起是 2026-11-07～08 的实际实现与验证，代码已在工作区，尚未提交 git。
> 创建日期：2026-11-07 · 修订 v2（2026-11-07 18:50）· 落地完成（2026-11-08）
> 关联讨论：2026-11-07 两项目整合评估（全量重写方案 230–330 人日，已搁置）

## v2 修订摘要

按用户两条修正重写了记忆架构：

1. **记忆不再每轮自动抽取 / 自动召回**，改为注册成 AI Agent 的**工具**，由 LLM 自己判断要不要调用。取消异步抽取队列与每轮 embed，成本大幅下降。
2. **能力本身与年龄完全解耦**，话术统一交给灵犀已有的 `age-adaptive` 层，不再写死「3-4 / 5-6 两套重写」。

连带影响：安全熔断**不工具化**（仍为同步前置，理由见 3.1）；总估算从 25–38 降到 **16–26 人日**。

## 一、目标与原则

把「碎碎念」（`../碎碎念/suinian`，Python 无屏语音陪伴机器人）里做得扎实的**算法与策略**搬进灵犀，**不搬运行时、不搬硬件链路、不合并仓库**。

| 原则 | 说明 |
|------|------|
| 单仓库单运行时 | 全部用 NestJS / TypeScript 实现，灵犀不需要 Python、不需要 WebSocket、不需要 ESP32 协议 |
| 不动碎碎念仓库 | 只读取其设计与测试用例作为参考，碎碎念继续独立演进 |
| 搬「代码事实」，不搬概念 | 碎碎念的安全与隐私承诺是靠测试钉死的实现（SQL 层排除、逐字引用校验），不能退化成一句 system prompt 约束 |
| **记忆按需工具化** | 记忆是 Agent 的一个工具，不是每轮自动跑的管道；LLM 判断要不要查 / 要不要记，不调就零额外开销 |
| **能力与年龄解耦** | 记忆结构、四闸门、RRF、安全词表、L2 分级都不按年龄分叉；只有输出话术由当前 `ageGroup` 的 prompt 生成 |
| 可独立回滚 | 每批 feature flag 控制，默认行为与现在一致，出问题关开关即可 |

对比：全量整合方案 230–330 人日；v1 移植方案 25–38；**v2 工具化方案约 16–26 人日**，第一批 4–6 人日即可上线见效。

## 二、灵犀现状缺口（核查依据）

| 能力 | 灵犀现状 | 依据 |
|------|---------|------|
| 跨会话记忆 | **无**。`conversations` + `conversation_messages` 只存当前会话；`SUMMARY_THRESHOLD = 50` 生成会话摘要，不跨会话；`toolDefinitions` 里没有任何 recall / remember 类工具 | `agent-framework/conversation/conversation.service.ts`、`database/entities/conversation.entity.ts`、`modules/ai/agent/prompts/tool-definitions.ts` |
| 内容安全检测 | **无代码级检测**。`emergency` 是孩子主动触发按钮后发短信/打电话；`system-prompts.ts` 的「禁止事项」只是自然语言约束 | `modules/emergency/emergency.service.ts`、`system-prompts.ts` |
| 家长报告 | 只有学习数据（学习记录、五维能力、成就、连续天数、LLM insights），没有「孩子今天聊了什么 / 在想什么」 | `modules/report/report.service.ts` |
| 主动关心 | `notification` 是被动通知，没有基于记忆事件的定时回访 | `modules/notification/` |
| **年龄自动适配** | **已有完整机制，无需移植，也不要绕开**：`classifyAge()` → `selectPrompt()` → `PromptProviderService.registerTemplate(ageGroup, role, template)`，运行时模板可注册覆盖；`buildToolInstructions()` 还会按可用工具自动拼提示段 | `agent-framework/core/types/age-group.ts`、`agent-framework/prompts/age-adaptive.ts`、`prompt-provider.service.ts` |
| LLM 多 Provider | **已有** `LlmClientService` + retry 策略，无需移植 `suinian/llm/` | `agent-framework/llm/` |

> **核查时的现状**（不是阻塞项，记录的是移植开工前的快照）：`AgeGroup` 类型当时是 `'3-4' | '5-6'`；`agent-framework` 的 `classifyAge()` 对 7 岁以上回落 `'5-6'`，`modules/ai/agent/agent-executor.ts` 另有一份实现返回 `'unknown'` 后由 `buildSystemPrompt` 兜底到 5-6 话术。即**自动适配的架构与扩展点齐备，当时落地档位只有两档**。
>
> **2026-11-08 已更新**：这段描述已不再成立。`AgeGroup` 扩为四档、两份 `classifyAge` 已统一、新话术模板已接入两条执行路径，详见第十三节。

**重要产品判断**：孩子主动问「你还记得我说过什么吗」是低频场景。长期记忆的主要受益者是**家长报告与内容推荐个性化**（「他最近迷恐龙，推荐点相关的」）。因此日报生成和 `recommend` 侧应**直接调用 recall 服务**，不依赖 LLM 是否判断出要查记忆 —— 见 3.3 的绕过机制。

## 三、移植清单

| 批次 | 能力 | 源路径 / 规模 | 灵犀落点 | 人日 |
|------|------|--------------|---------|------|
| P0-1 | **儿童安全熔断** | `agent/safety/classifier.py` 125、`detector.py` 149、`agent/tools/policy.py` 127、`config/safety_rules.yaml` | 新增 `modules/safety/`；接 `ai.service.ts` 入口；复用 `emergency` + `notification` | 4–6 |
| P0-2 | **记忆工具 · 写入** | `memory/extract.py` 804、`vectors.py` 71 | `saveMemory` 工具；四闸门落在工具实现里；**不做异步抽取队列** | 4–6 |
| P0-3 | **记忆工具 · 读取** | `memory/recall.py` 489、`degrade.py` 136、`base.py` 71 | `recallMemory` 工具；三通道 RRF + 四出口作为结构化返回 | 4–6 |
| P0-4 | **工具触发策略与可观测** | 新增 | `tool-definitions.ts` / `tool-registry.ts` + 各年龄 prompt 的触发说明 + 调用率日志 | 2–3 |
| P1-1 | **家长日报「报话题不告状」** | `memory/digest.py` 298 | 扩展 `report.service.ts` `generateReport()` L28；定时任务直接查 `memories` | 3–5 |
| P1-2 | **主动关心调度** | `care/scheduler.py` 187、`care/base.py` 26 | 扩展 `notification/`，新增 `care_cues` 表 | 3–5 |
| — | ~~用量预算~~ | `observability/budget.py` 238 | 灵犀已有 usage / token 追踪，**建议不搬** | — |

前置（批次 0）：关 `synchronize` + 建迁移基线，约 1 人日。

### 3.1 工具化的边界：安全熔断绝不工具化

用户提出的「由 LLM 判断要不要调用」**只适用于记忆**。安全熔断必须留在链路最前面：本地词表同步匹配 <10ms、**不经 LLM、不受 LLM 判断影响**。把安全交给被保护的模型自己决定，等于没有保护，且违反 fail-closed。两条链路互不干扰：

```
孩子消息
  → [必经] 同步词表熔断（本地，<10ms，命中即短路 + 通知家长）
  → [可选] 异步分类器（不阻塞回复）
  → LLM 主循环 + tool calling
       ├─ 普通闲聊 → 直接回复（0 次记忆调用、0 次 embed）
       ├─ 需要回忆 → recallMemory 工具（三通道 RRF，含 embed）
       └─ 值得记住 → saveMemory 工具（四闸门，纯字符串/SQL，无额外 LLM）
  → 按当前 ageGroup 的 prompt 生成话术

旁路（定时任务，不经 LLM 判断）：日报 / 推荐 / 主动关心 → 直接调 recall 服务
```

### 3.2 成本对比

假设每孩子每天 20 轮对话、公网 10000 活跃用户：

| | v1 每轮自动 | v2 工具化 |
|---|---|---|
| 召回 | 20 次（每轮 embed + 三通道检索） | 约 3 次（按 15% 轮次触发） |
| 写入 | 每天 1 次批量 LLM 抽取 | 约 1 次，且复用主对话的 tool call，四闸门不调 LLM |
| 额外模型 / 检索调用 | ≈ 21 次 / 孩子 / 天 | ≈ 4 次 / 孩子 / 天 |

省约 80% 的 embedding 与抽取调用，同时**完全去掉** `extract_jobs` 队列、worker 与定时批量 LLM。代价是工具定义常驻 system prompt（约 +200–400 token/轮）和一次 tool round-trip，比 embedding + 抽取便宜一到两个数量级。若还想省，可只在命中本地正则 hint 的轮次注入工具定义（见 3.4）。

### 3.3 两个工具的契约（设计，非实现）

| | `recallMemory` | `saveMemory` |
|---|---|---|
| 入参 | `query: string`, `limit?: number`, `since?: string` | `content: string`, `verbatimQuote: string`, `kind?: 'fact'\|'event'\|'preference'`, `occurredAt?: string` |
| 内部 | 三通道 RRF（字面 FTS / 向量 / 时间衰减）；向量通道独立 deadline；`WHERE sensitivity IN ('L0','L1')` | 四闸门（见下）；从当前会话 `conversation_messages` 取孩子原话做子串校验 |
| 返回 | `{ outcome, hits: [{verbatimQuote, content, occurredAt, kind}], hint }` | `{ stored: boolean, reason?, memoryId? }` |
| 异常 | 捕获后返回 `outcome: 'SERVICE_DOWN'`，**不抛错** | 校验不通过返回 `stored: false` + 原因，不抛错 |

**四闸门仍全部保留，只是搬进 `saveMemory` 工具内部**（`extract.py` 文件头写明每个闸门对应的失败）：

| 闸门 | 规则 | 为什么 |
|------|------|--------|
| Confidence | < 0.75 丢弃 | 产品承诺是「每句引用都对」，不是「记得多」 |
| Verbatim | `verbatimQuote` 必须是孩子原话的子串，三层匹配 exact / normalized / fuzzy(0.95)；模糊匹配也只返回原文切片 | 机器强制逐字一致，杜绝模型编造 |
| Secrets | 孩子要求保密的内容由**代码**强制置 L2，不信任模型自报的 sensitivity | 碎碎念「双面信任」的核心代码事实 |
| Dedupe | 同一孩子当天同内容只留一条 | 防止重复回忆 |

工具化后校验反而更严格：原文直接取自当前会话落库的消息，不需要按天批量拼接 turns。

**三通道 RRF**（`recall.py`）：一次读取、各自排名、倒数排名加权融合。RRF 只用于排序，**不能当作「该不该注入」的绝对分数**，每个通道自带出口阈值；向量超时只让该通道缺席，不能把整次召回降级成 `SERVICE_DOWN`；时间通道读 `memories` 不读 `events`。

**四出口**（`base.py`）：`HIT` / `MISS`（诚实说「我不记得了」，一等分支不是失败）/ `SERVICE_DOWN`（「我脑袋一片空白」，不让 DB 超时变成孩子听到的技术错误）/ `FIRST_DAY`（空状态话术）。**工具只返回 `outcome` 与素材，不返回成品句子** —— 话术由 LLM 依据当前 `ageGroup` 的 system prompt 生成，这正是与年龄解耦的关键：扩展新年龄段不需要改记忆代码。

**L2 处理**：`memories.sensitivity` 取 `L0 / L1 / L2`，L2 在 **SQL 查询层**排除，不进任何召回结果、不进家长日报素材、摘要与推送不复述。按用户判断可放宽家长查看权限，但建议保留字段与过滤作为可配置开关。

### 3.4 触发策略与漏召回兜底

让 LLM 判断会带来漏触发，用四层兜底，全部不增加每轮固定成本：

1. **工具 description + 各年龄 prompt 的触发说明**：孩子提到「上次 / 以前 / 还记得 / 又 / 还是 / 说过 / 答应过」、主动要求记住、说出偏好、提到带日期的未来事件、家长问孩子近况、需要个性化推荐时应调工具。这段说明通过现有 `age-adaptive` 模板注入，**不写死年龄**。
2. **本地正则 hint（零 LLM 成本）**：命中上述词时，在 `Runtime Context` 插一句 `hint: 本轮可能需要 recallMemory`，只提示不强制。
3. **旁路直接调用**：日报、`recommend`、`care` 不经 LLM 判断，直接调 recall 服务，保证记忆的主要受益场景不受模型判断影响。
4. **可观测 + 调优**：记录 `recallMemory` / `saveMemory` 调用率、MISS 率、`saveMemory` 被闸门拒绝的原因分布，用真实日志调 prompt 与阈值。

> 写入侧的取舍：纯工具化依赖 LLM 记得调 `saveMemory`，早期可能记忆稀疏。默认**不加**后台兜底抽取（那就退回每轮成本了）；先用日志观察覆盖率，确实不足时再考虑「会话结束时按本地规则提示下一轮补写」这类零 LLM 方案。

### 3.5 P0-1 安全熔断（最独立，建议第一批）

搬三件事，缺一不可：

1. **同步词表熔断**：`safety_rules.yaml` 的 `self_harm / violence / danger` 三类短语，本地字符串匹配 <10ms，**不经 LLM**、不与 LLM 并发。命中即同步短路，走安全话术 + 通知家长。词表原则照抄：短语优先于单字（「死」会命中「想吃」的 ASR 错误）、宁可漏报不放高误报词、删配置文件时回退代码内建默认表（fail-closed）。
2. **异步分类器**：词表只能抓显式求救；「我不想去上学了」「我是多余的」这类真实危机表达由第二层 LLM 分类器异步判定，不阻塞回复。
3. **工具风险分级**：`tools/policy.py` 的按风险决定是否需家长确认的策略，映射到 `tool-registry.ts`（记忆工具默认低风险，不需家长确认）。

> 词表与阈值**不按年龄分叉**：儿童安全是底线。只有熔断后的安抚话术走当前年龄的 prompt。能力边界要对家长说清：词表只保证「显式求救能被秒级拦截」，不等于危机识别全覆盖。

### 3.6 P1-1 家长日报 / P1-2 主动关心

`digest.py`：素材查询在 SQL 层已过滤 L2，产出**话题**而非告状记录，接进 `generateReport()`。日报生成是定时任务，每天每孩子一次 LLM，与对话轮次无关。

`care/scheduler.py` 的 `due_cue()`：一次对话最多一个 cue；时间窗按家庭时区（Asia/Shanghai）；24 小时双率闸门（全局 metric 维度兜底，防事件表 bug 导致重复询问）；延期上限与生命周期自动过期。场景：孩子说「下周春游」→ 到期主动问一句，话术同样由当前年龄 prompt 生成。

## 四、数据模型草案（设计，非实现）

```
memories        id, childId, kind, content, verbatimQuote, confidence,
                sensitivity(L0/L1/L2), occurredAt, sourceMessageIds(JSON),
                createdAt
care_cues       id, childId, memoryId, dueAt, status, postponeCount, sentAt
safety_events   id, childId, category, source(wordlist|classifier),
                excerpt, action, notifiedAt, createdAt
recall_audit    id, childId, tool(recall|save), outcome, latencyMs,
                createdAt            ← 可选，用于 3.4 的可观测
```

**v2 移除了 `extract_jobs`**：不再有异步抽取队列、worker、重试与定时任务。`memories.sourceMessageIds` 直接指向 `conversation_messages.id`。

索引：`memories(childId, sensitivity, occurredAt)`、FTS（SQLite FTS5 / PostgreSQL tsvector）、向量列（可选，云 embed）。

## 五、必须先做的两件事（阻塞项）

1. **锁 `synchronize`**：`app.module.ts` 有 3 处 `synchronize: true`，且后端**没有 migrations 目录**。新增任何实体前必须先建立迁移基线并关闭自动同步，否则线上一次启动可能抹掉表。约 1 人日。
2. **数据库双跑验证**：`app.module.ts` 的 `resolveSqliteDriver()` 会在 `better-sqlite3` 与纯 JS `sql.js` 间回退；生产另有 PostgreSQL。FTS / 向量 / JSON 列写法要在两条路径都验过。

> 碎碎念仓库侧的保全动作（75 个未提交改动、无 remote）已与「整合方案」绑定；**本方案不依赖它**，不需要先动碎碎念仓库。

## 六、接入点（精确到文件）

| 挂载点 | 位置 | 改动 |
|--------|------|------|
| 对话入口 | `modules/ai/ai.service.ts` `chat()` L73 / `chatStream()` L204 | 同步词表熔断前置；异步分类入队（**仅安全，记忆不在这里**） |
| 工具定义 | `modules/ai/agent/prompts/tool-definitions.ts` | 新增 `recallMemory` / `saveMemory` 两个 `ChatCompletionTool` |
| 工具注册 | `modules/ai/agent/tool-registry.ts` L1–L70 | `handlers` Map 注册两个 handler；新工具类放 `modules/ai/agent/tools/` |
| 触发说明 | `agent-framework/prompts/age-adaptive.ts` + `templates/*.system.ts`；或 `PromptProviderService.buildToolInstructions()` | 按 `ageGroup` 注入「何时使用记忆工具」，不改年龄枚举、不写死话术 |
| 正则 hint | `modules/ai/agent/agent-executor.ts` `buildSystemPrompt()` L113–140 的 `contextHints` | 命中记忆触发词时插一行 hint（本地计算，不调 LLM） |
| 日报 | `modules/report/report.service.ts` `generateReport()` L28 | 新增「今日聊了什么」段；直接查 `memories`（旁路，不经 LLM 判断） |
| 推荐 | `modules/recommend/recommend.service.ts` | 可选：用 recall 结果做个性化 |
| 通知 | `modules/notification/notification.service.ts` | 安全事件、care cue 推送 |
| 模块注册 | `app.module.ts` | 注册 `SafetyModule` / `MemoryModule` |

`ToolRegistry.execute()` 已有 `try/catch` + 结构化字符串返回的现成范式，两个工具直接沿用；注意 `SERVICE_DOWN` 要在工具内部消化成正常返回值，不要走进 `catch` 变成错误字符串。

## 七、批次顺序与验收

| 批次 | 内容 | 交付判据 |
|------|------|---------|
| 0 | 迁移基线：关 synchronize、生成首个 migration | 本地 + PostgreSQL 启动后表结构不变、数据不丢 |
| 1 | P0-1 安全熔断 | 词表命中 <10ms 且不调用 LLM；删配置文件仍走内建词表；误报用例（「想吃」）不命中；通知到家长 |
| 2 | P0-2 `saveMemory` | 编造的引用 100% 被逐字闸门丢弃；保密内容强制 L2；同日重复不入库；**普通闲聊一轮下来零额外 LLM 调用** |
| 3 | P0-3 `recallMemory` | 四出口各自可表达；向量超时时字面通道仍能命中；L2 在 SQL 层不可达；工具异常不抛到孩子面前 |
| 4 | P0-4 触发策略 | 「上次那只霸王龙」能触发 recall；日志能看到调用率与 MISS 率；换任意 `ageGroup` 话术随之变化而工具返回值不变 |
| 5 | P1 日报 + 主动关心 | 日报只出话题不复述秘密；24h 内不会重复问同一件事；日报成本与对话轮次无关 |

**测试策略**：把碎碎念 `tests/` 中 `memory / safety / care` 相关用例逐条翻成 Jest（项目已有 Jest 29 + 94 个 spec），断言按原文对齐：逐字闸门三层、L2 SQL 排除、24h 双率闸、四出口、RRF 排序。新增工具层用例：不调用时零额外开销、`SERVICE_DOWN` 不抛错、hint 命中率。

## 八、明确不搬

| 模块 | 行数 | 不搬原因 |
|------|------|---------|
| `agent/runtime.py` 等 | 11567 | 为语音半双工、VAD、打断设计的状态机；灵犀有自己的 `agent-executor.ts`（552 行）与 `ToolRegistry` |
| `gateway/` | 4185 | ESP32 WebSocket、60ms Opus 帧、OTA，与有屏 App 无关 |
| `web/` | 5146 | 独立家长控制台；灵犀已有 React Web 家长端 |
| `storage/` | 3587 | SQLite DAO；灵犀用 TypeORM |
| `voiceprint/` `asr/` `tts/` `music/` | 3976 | 声纹、本地 ASR、流式 TTS、音乐生成，均绑定设备与本地模型 |
| `llm/` | 1314 | 灵犀已有 `LlmClientService` |
| `memory/extract.py` 的队列部分 | — | `ExtractionWorker` / `extract_jobs` 被工具化取代，只搬四闸门逻辑 |

## 九、风险

1. **把策略退化成提示词**：L2 排除、逐字引用、urgent 无开关这类承诺一旦只写在 system prompt 里就等于丢失。必须落在 SQL / 工具实现里并有测试。
2. **LLM 漏判触发**：见 3.4 的四层兜底。旁路（日报 / 推荐 / care）直接调服务是关键保险，不能省。
3. **工具定义常驻 token**：约 +200–400 token/轮，比省下的 embedding 便宜；若仍要压，用本地 hint 控制注入。
4. **年龄扩展的一致性**：核查发现后端存在两份 `classifyAge` 实现（`agent-framework` 与 `modules/ai/agent`），扩龄时需统一，否则新增年龄段在一处生效、另一处回落。移植代码不依赖年龄，风险被隔离在这两处。
5. **不做实时音频**：本方案不需要 WebSocket、不需要 Opus、不需要 nginx Upgrade 反代，部署形态与现在完全一致。

## 十、落地状态（2026-11-07 实现）

批次 0–5 已按清单顺序实现，全部为 NestJS / TypeScript，未引入 Python、WebSocket 或新运行时。新增 7 个 spec 文件、72 个用例（`verbatim-gate` / `safety-detector` / `safety-service` / `memory-write` / `memory-recall` / `care-service` / `new-entities`）。

| 批次 | 状态 | 主要文件 |
|------|------|---------|
| 0 迁移基线 | 完成 | `src/app.module.ts`（`DB_SYNCHRONIZE` 开关）、`src/database/migrations/1700000000000-CreateMemoryAndSafetyTables.ts` |
| 1 安全熔断 | 完成 | `src/modules/safety/`（`safety-rules.ts`、`safety-detector.service.ts`、`safety-classifier.service.ts`、`safety.service.ts`、`safety.controller.ts`）、接入 `ai.service.ts` 的 `chat()` / `chatStream()` |
| 2 saveMemory | 完成 | `src/modules/memory/`（`verbatim.ts`、`memory-write.service.ts`、`memory.entity.ts`）、`src/modules/ai/agent/tools/save-memory.ts` |
| 3 recallMemory | 完成 | `memory-recall.service.ts`、`memory-vector.service.ts`、`recall-audit.entity.ts`、`src/modules/ai/agent/tools/recall-memory.ts` |
| 4 触发策略 | 完成 | `tool-definitions.ts`、`tool-registry.ts`、`agent-executor.ts` 的 `memoryTriggerHint()`、`tools/tool-risk.ts`、`recall_audits` |
| 5 日报 + 主动关心 | 完成 | `report.service.ts` 的 `getConversationTopics()`、`src/modules/care/` |

### 与设计的两处有意偏离

1. **模糊层的窗口宽度改为 `w-1 / w / w+1`。** 原实现窗口宽度恒等于引用长度，而等长字符串的 `2·LCS/(|a|+|b|)` 等于 `LCS/长度`，只有完全相同才到 0.95 —— 精确层与归一化层已经先命中了，模糊层在自己的阈值下永远不可能触发。改为允许 ±1 之后，"模型少打一个字"（13 vs 14 字 ≈ 0.963）能命中，"改写"仍然被拒。
2. **召回通过条件去掉 `hits >= 2`。** 两个重叠的虚词边界二字组（「我的」+「的鞋」）就能满足它，而这正是注释里说要拦的误报场景（「我的鞋放在哪里了」召回咬鞋带的故事）。改为要求至少一个不含虚词的实词片段命中，语义不变、漏洞关闭，并有用例钉住。

### 环境变量

见 `src/backend/.env.example` 的 `DB_SYNCHRONIZE` / `SAFETY_*` / `MEMORY_*` / `CARE_*` 四段，全部有安全默认值：不配置时行为与接入前一致（记忆工具只是多两个低风险工具，语义通道因无 embed 后端而缺席，召回走字面 + 时间通道）。

### 遗留清单现状（2026-11-08 更新）

下面四条曾经列在这里，其中前三条已于 2026-11-08 收口，详见第十三节：

| 原遗留项 | 现状 | 落地位置 |
|---------|------|---------|
| `PARENT_APPROVAL_REQUIRED` 为空集 | **已解决** | `common/policy/tool-risk.ts`，策略表派生名单，legacy + framework 双路径执行 |
| `recall_audits` 只写不读 | **已解决（后端）** | `RecallAuditService` 聚合 + `GET /memory/audit/:childId`，家长归属校验；**前端看板仍未做** |
| `AgeGroup` 只有两档 | **已解决** | 四档 `'3-4' \| '5-6' \| '7-9' \| '10-12'`，学龄话术模板，分类单一真源 |
| 迁移不补外键 | **保留为已知边界** | SQLite 无法在不重建表的前提下加约束，见第十一节「已知边界」 |

生产部署也不再需要**显式**设 `DB_SYNCHRONIZE=false`：`NODE_ENV=production` 即默认关闭，见第十三节。

> 原先这里还列着「care 的定时任务未挂调度器」和「`conversations.summary` 没有读取方」。这两条已在第十二节接通，其中 care 的实际问题比当时记录的更严重：`dueCue()` 当时**全仓零调用方**，主动关心是数据只进不出的死功能。

## 十一、存量表迁移基线（2026-11-07 补充）

`1600000000000-CreateBaselineSchema.ts` 补上了 29 张存量表，加上第十节的 4 张，共 33 张，覆盖全部实体。`DB_SYNCHRONIZE=false` 现在有了意义：空库也能从零建起完整 schema。

### 设计取舍

- **对已有库是空操作**：每张表都用 `ifNotExists` 创建。线上库的表早已被 `synchronize` 建好，迁移只会被记为已执行，不改任何东西。
- **类型按方言生成**：`synchronize` 在 SQLite 上产出 `datetime` + `datetime('now')`，在 PostgreSQL 上产出 `timestamp` + `now()`。基线必须跟着驱动走，否则两边永远差一点。
- **默认值手动加引号**：`Table` 的列默认值是原样拼进 `DEFAULT (...)` 的，不做转义也不做归一化。字符串要自带引号，布尔值要按驱动写成 `0/1`（SQLite）或 `false/true`（PostgreSQL）。
- **索引名沿用 TypeORM 生成的哈希名**：改成可读名字会让 `synchronize` 认为索引不同、重建一遍。可读性让位于"翻回 `synchronize: true` 时零变更"。

### 顺带修掉的两个既有缺陷

基线要成立，前提是"实体 → schema"是确定的。核查时发现两处同一张表被两个实体声明，`synchronize` 每次启动都在来回重建：

1. **`poems`**：`database/entities/poem.entity.ts` 与 `modules/poetry/entities/poem.entity.ts` 都映射这张表。前者**全仓零引用**（无 import、无 raw SQL、seed 也不用），只因为实体 glob 会扫到它才被加载。两个定义互不相容，`synchronize` 无法收敛——这不是基线能编码的状态，所以删掉了这个死文件，并由 `reconcilePoems()` 清掉它曾加到已有库上的 6 个列（`author`/`dynasty`/`translation`/`appreciation`/`popularity`/`firstChar`，其中两个是 `NOT NULL` 且无任何写入方能满足）。
2. **`conversations` / `conversation_messages`**：`agent-framework/conversation/entities/` 与 `modules/ai/conversation/` 各声明一次。

### `conversations` 双声明的彻底消除（2026-11-07 追加）

上一版只是把漏掉的三列补进 `agent-framework` 那份、让两个定义一致，并注明"以后加列要两处同时加"。那仍然是个靠自觉维持的约定，所以这一轮直接消掉了重复：

- **唯一声明**：`src/database/entities/conversation.entity.ts`。放在共享实体目录，因为它本来就被三层映射（AI 模块的会话管理器、agent-framework 的通用会话服务、memory 模块的原文校验），任何一层独占都会让依赖方向更糟。
- **删掉两份重复**：`agent-framework/conversation/entities/`（含 barrel）与 `modules/ai/conversation/conversation.entity.ts`。6 处导入改到新路径，`role` 字段从 `string` 收紧为 `MessageRole`（`ConversationService.addMessage` 的入参同步收紧）。
- **守卫测试**：`test/unit/entity-declarations.spec.ts` 扫描全部 `*.entity.ts`（先剥注释，否则解释规则的文档注释会匹配到规则本身），断言没有任何表被声明两次，并显式钉住 `conversations` / `conversation_messages` / `poems` 各只有一处。

### `ConversationService` 接管会话层（2026-11-07 追加）

上一轮发现 `agent-framework` 的 `ConversationService` 是 `ConversationManager` 的未接线重构版，且漏了摘要生成。这一轮把摘要补齐，并由它正式替掉管理器：

- **补齐的行为**：`actorType` 校验（父子会话不串）、无 `sessionId` 时永不复用旧会话、`SUMMARY_THRESHOLD = 50` 的滚动摘要、`listSessions` 的 `actorType` 过滤与首条用户消息（列表标题）、`buildMessageArray` 默认 50 条。
- **删除**：`modules/ai/conversation/conversation-manager.ts`（440 行）及整个 `modules/ai/conversation/` 目录。消费方改为注入 `ConversationService`：`ai.service.ts`、`agent-executor.ts`、两个 `assign-activity.ts`；`AiModule` 不再提供它，改由 `AgentFrameworkModule` 导出，同时移除已无人使用的 `TypeOrmModule.forFeature`。
- **两处有意收紧**：
  1. **缓存真的只是缓存**。`SessionCache` 有 30 分钟 TTL，而管理器的裸 `Map` 永不过期。照搬的话，空闲 31 分钟后发来的消息会被 `addMessage` 静默丢弃。所有读路径现在都回落到数据库并回填，TTL 只是优化。
  2. **`actorType` 在缓存路径上也校验**。管理器只在数据库路径校验，缓存命中时直接返回，等于绕过了自己的注释意图。
- **一个数据修正**：摘要写回 `messageCount` 时，管理器存的是"读了多少条"（恒等于阈值 50），现在存真实总数。
- **测试**：`test/unit/conversation.service.spec.ts`（21 个用例，真 SQLite）覆盖父子会话隔离、新会话不复用、摘要触发/不重复/LLM 异常不拖垮对话、缓存冷启动不丢消息、列表标题、工具调用块不被拆开。

顺带修掉一个挡住验证的既有 bug：`app.module.ts` 的 sql.js 回退分支把文件路径传给了 `database`（该参数要 `Uint8Array`）又没给 `location`，导致**没有 better-sqlite3 原生绑定的机器根本起不来**——正是这个回退存在的场景。改为 `location: dbPath` 后，`test/smoke.spec.ts` 才第一次真正跑通，并顺带改成使用临时库、不再写开发者的 `lingxi.db`。

### 摘要生成移出请求路径（2026-11-07 追加）

上一节的摘要是在 `addMessage` 里同步做的：写库 → `COUNT(*)` → 调 LLM 要摘要。这意味着会话到第 50 条消息时，**那一轮回复要等第二次模型往返**才返回，而摘要本身在请求路径上没有任何消费者。

现在拆成三步：

- **写路径只记账**：`addMessage` 落库后只往内存 `Set` 里记一个 `summaryPending` 标记，零 IO、零模型调用。
- **回合结束才干活**：`agent-executor` 在 `execute()` 的两处 return 前、`executeStream()` 的 `done` 之前调 `scheduleSummary(sessionId)`，它是同步返回的 fire-and-forget。摘要失败不会影响已经发出的回复。
- **可等待的版本**：`summarizeIfDue(sessionId)` 是同一份逻辑的 `async` 形态，给测试（以及以后可能的关闭钩子）用，避免测试去 racing 一个后台任务。

两个并发保护，各自解决一个真实场景：

1. **先删标记再干活**。一轮对话里 `addMessage` 会被调用多次（用户消息、每轮工具调用、工具结果、最终回复），如果标记只在生成成功后才清，同一轮里最后几个 `addMessage` 之后的 `scheduleSummary` 会重复触发。`Set.delete` 返回布尔值，天然做到"只有第一次调用开工"。
2. **`summaryInFlight`**。两个请求并发写同一个会话时，阻止两次摘要同时跑——否则后一次会用旧内容覆盖新摘要。

失败补偿是有意的：标记在开工前就被删了，所以本次失败不会在同一轮里重试；但**下一轮 `addMessage` 会重新置位**，于是下一轮再试一次。成功之后 `session.summary` 直接短路，连 `COUNT(*)` 都不再执行。

边界：`summaryPending` 上限 500 条（`addMessage` 有多个调用方，只有 `agent-executor` 会调 `scheduleSummary`，无界增长是真实风险）；`endSession` 时清掉该会话的标记。

**测试**：`conversation.service.spec.ts` 的 `summaries` 从 5 个用例扩到 8 个，新增的三条针对这次拆分——「写路径不调模型」「回合结束后生成」「失败后下一轮重试」，其余按新入口改写。

**当时留下的待决问题**：`conversations.summary` 没有任何读取方，这次改动只是把一次"写了没人读"的模型调用挪出了关键路径——省下延迟，但摘要仍不产生价值。已在第十二节解决：历史被截断时把摘要注入上下文。

### 已有库的列补齐

`createTable(..., ifNotExists)` 是"全有或全无"：表已存在就整段跳过，**包括后来新增的列**。所以基线新增 `reconcileConversations()`，为老库补上 `actorType` / `summary` / `messageCount`（三者都有默认值或可空，加在有数据的表上安全），与 `reconcilePoems()` 同构。

这一条直接来自真实库演练：开发库的 `conversations` 恰好缺 `actorType`，补列前 `synchronize` 仍要重建表。补列后待执行变更从 4 条降到 **0 条**。

### 验证

`test/unit/migration-baseline.spec.ts`（6 个用例）把承诺钉成断言：

- 从迁移建出的库包含实体声明的每一张表；
- 建完之后 `synchronize` 的差异为 **0 条**（这是"基线可信"的实质含义，不是"表存在"）；
- 两份迁移都被记为已执行；
- 对已有 schema + 已有数据的库是空操作，数据不丢；
- 遗留 `poems` 列被清理，诗歌列被补齐；
- 缺 `actorType`/`summary`/`messageCount` 的老库，迁移后列被补齐、已有行的默认值正确、且差异回到 0 条。

另外在真实开发库副本上演练过：两份迁移正常应用，`users` 2 行 / `contents` 68 行原样保留，表从 20 张补到 34 张，待执行变更 **0 条**。

### 上线顺序

基线现在既能从空库建起完整 schema，也能把老库补齐到实体形状（`reconcilePoems()` + `reconcileConversations()`），所以**两种顺序都成立**：

1. `NODE_ENV=production` 部署、不设 `DB_SYNCHRONIZE` —— 推荐，`resolveSynchronize()` 默认返回 `false`，schema 从第一天就归迁移管，不会再有未审计的 `ALTER`；显式值仍可覆盖（见第十三节）。
2. 或者先按现状部署一次（本地 `synchronize` 默认 `true`），再切到生产默认。

上一版文档说"必须先部署一次"是基于当时缺列未补齐的事实，现已不适用。

### 已知边界

- **不补外键**：SQLite 无法在不重建表的前提下加约束。`synchronize` 建过的库本来就有外键，所以只在"表存在但缺外键"的极端情况下会有差异。
- **`conversations` 的双声明已消除**，只剩 `database/entities/conversation.entity.ts` 一处，并有守卫测试兜底。会话层也已统一到 `ConversationService`，`ConversationManager` 不再存在。

## 十二、接通两个"写了没人读"的功能（2026-11-08）

上一轮收尾时做了一次全仓调用方核查，发现两处功能虽然实现完整、单测齐全，但在运行时**根本不可达**。这一轮把它们接进主链路，并修掉一个会静默吞掉结果的 provider 差异。

### 主动关心：从死功能到可触发

核查结果比第十节记录的更严重：`CareService.dueCue()` 和 `expireStale()` 在 `src` 里**零调用方**。只有 `MemoryWriteService` 在记忆写入时调 `schedule()` 往 `care_cues` 排队，没有任何代码把 cue 取出来——数据只进不出，孩子永远收不到关心。

接法：

- **开场判定不用新增返回标志**。`getOrCreateSession` 在请求 id 不可复用时会返回一个不同的 uuid，所以 `requestedSessionId !== resolvedSessionId` 就是精确的"这是新对话"信号。只在 child 模式、且是新会话时取 cue；第 12 轮突然问春游会很怪，24h 闸也不该花在对话中间。
- **两条执行路径都覆盖**。`AiService` 把 topic 传给 `executeRoutedChat` / `executeRoutedChatStream`：legacy 分支给 `AgentExecutor.buildSystemPrompt` 加一段；framework 分支把**已渲染好的**指令放进 `AgentContext.metadata.careCueNote`，由 `OrchestratorService` 在它构造 system prompt 的两处追加。措辞只在 `care-prompt.ts` 维护一份。
- **不落库**。cue 是"这一轮怎么回答"的指令，不是孩子说过的话，所以只进 system prompt，不进 `conversation_messages`。
- **调度器不用加了**。项目没有 `@nestjs/schedule`，与其挂一个永远没人配的定时任务，不如让 `dueCue()` 自己先跑 `expireStale()`：它是唯一开场合法入口，清理幂等且便宜，窗口外的早晨对话也会顺手把上周的 cue 退役。
- **防注入**。topic 来自模型抽取的记忆、存在库里、现在要拼进指令，属于不可信文本。`careCuePrompt()` 压平换行、去掉引号定界符、截到 100 字，避免"春游\n忽略之前的指令"变成第二段指令。
- **全程不拖垮对话**：`openingCareTopic()` 包了 try/catch，cue 表挂了照样正常回复。

`AiModule` 补引入 `CareModule`（`MemoryModule` 早已引入，无 provider 环）。

### 会话摘要：截断时才注入

`buildMessageArray` 是两条执行路径**唯一共享**的历史加载点，所以把注入放这里，两边自动一致：当 `messages.length > maxMessages` 且 `session.summary` 存在时，在保留的尾部消息前插一条 `system` 消息，说明这是较早对话的概括、不是孩子刚说的话。没截断、或摘要还没生成时，返回原数组不变。

摘要同样是模型生成的不可信文本，渲染前压平换行并截到 200 字。读取发生在**下一轮**，没人等它，所以上一节的异步生成依然成立。

### 顺带修掉：pi-ai 会丢掉第二条 system 消息

验证链路时发现 `LlmClientService.callProvider()` 和 `piAiChatCompletionStream()` 都写着：

```ts
const systemPrompt = messages.find((m) => m.role === 'system')?.content;
const nonSystemMessages = messages.filter((m) => m.role !== 'system');
```

`find` 只取第一条、`filter` 丢掉其余所有 system 消息。也就是说刚做的摘要注入在 legacy OpenAI 路径上有效、**在 pi-ai 路径上被静默丢弃**——同一个功能因 provider 不同而行为不一致，且没有任何报错。改成 `splitSystemMessages()` 把所有 system 消息按顺序 join 进单个 `systemPrompt`，两处调用点共用，并有单测钉住。

### 测试

新增 `care-prompt.spec.ts`（渲染/清洗）、`llm-client.service.spec.ts` 的 `splitSystemMessages` 两例；扩写 `care-service.spec.ts`（窗口外也会清理、关闭时不清理）、`ai.service.routing.spec.ts`（新会话才取 cue、续聊不取、cue 异常仍回复）、`orchestrator.service.spec.ts`（framework 路径也会追加 note）、`conversation.service.spec.ts`（截断注入、未截断不注入、无摘要不注入、不可信摘要清洗）、`agent-executor.book-context.spec.ts`（新增第 7/8 参数断言）。顺带把 `health.controller.spec.ts` 里硬编码的 `toBe('linux')` 改成 `toBe(process.platform)`——那是 Windows 上唯一一条红色用例，与本方案无关但一直挡着全绿。

## 十三、收口遗留清单：同步开关 / 审计读取 / 家长确认 / 扩龄（2026-11-08）

第十节「仍未完成」里列的四条，本轮做掉三条、保留一条为已知边界。四项都遵循同一条原则：**不为移植引入新运行时、不改 3-4 / 5-6 的既有行为**。

### 1. 生产默认关闭 `synchronize`

原先 `DB_SYNCHRONIZE` 不配置时，无论什么环境都会 auto-sync；生产部署靠运维记得显式写 `false`，漏配就是未审计的 `ALTER`。

`resolve-synchronize.ts` 把判定从 `app.module.ts` 抽成纯函数：

- `NODE_ENV=production` 且未显式配置 → `false`，`migrationsRun=true`，schema 归迁移管；
- 非 production 且未显式配置 → `true`，本地开发照旧；
- 显式 `true/false/1/0/yes/no/on/off` 始终优先（逃生舱）；
- **拼错的值被忽略而不是当成 `true`** —— `DB_SYNCHRONIZE=flase` 不该意外打开 auto-sync。

`.env.example` 改为推荐「留空」，并补 `MEMORY_AUDIT_RETENTION_DAYS=30`。启动日志同时打印 `synchronize` 与 `migrationsRun`。`resolve-synchronize.spec.ts` 14 个用例锁定行为。

### 2. `recall_audits` 从只写不读到可读

`MemoryService.audit()` 每个 `recallMemory` / `saveMemory` 调用写一行，但此前 `auditRepo` 只有 `save()`，没有任何读取方。

新增：

- `RecallAuditService.summarize(childId, windowDays)`：读有限行、在 JS 侧聚合（避开 SQLite / PG 日期函数差异），产出调用数、`byTool`、outcome 分布、`hitRate` / `missRate`、保存被拒原因 Top N、每日分布、延迟 avg/p95；调用时顺带 `purgeExpired()` 清理超过保留期的样本，清理失败不影响读。
- `GET /memory/audit/:childId?days=14`：`JwtAuthGuard` + **家长归属校验**（`UsersService.canAccessChild`），孩子账号、跨家长、非法 id 一律 403。
- **不返回 `query` 原文**：审计看的是指标，不该把孩子说过的话再暴露一遍。

`recall-audit.spec.ts` 10 个用例覆盖聚合、脱敏、空数据、窗口 clamp、清理与三类拒绝。前端看板仍未做，接口先可用。

### 3. 家长确认名单与确认链路

原 `PARENT_APPROVAL_REQUIRED` 是空 `Set`，`POLICIES` 里的 `requiresParentApproval: true` 是死字段；更糟的是 `ToolRegistry.execute()` 从**模型参数**读 `args.__parentApproved`，等于允许 prompt injection 自授权。

改法：

- 策略表从 `modules/ai/agent/tools/tool-risk.ts` 迁到中立的 `common/policy/tool-risk.ts`（framework registry 不能反向依赖 `modules/ai`），名单由 `POLICIES` **派生**：`updateParentControl` / `createGift` / `createBehaviorTemplate`。
- **两条执行路径都执行同一闸门**：legacy `ToolRegistry.execute()` 与 framework `ToolRegistryService.execute()` 都调 `requiresParentApproval(toolName, actor)`，并都 `delete safeArgs.__parentApproved`。
- `actor` 是服务端 `ToolActorContext`，由 `AiService` / `agent-executor.ts` 按登录角色填；家长直通，孩子账号对 parent-side 配置工具返回结构化拒绝。
- 特意**不** gate `redeemGift`：还没有前端审批状态机，拦了会把孩子正常的兑换功能整体废掉。

`tool-risk.spec.ts` + `tool-registry.service.spec.ts` 覆盖名单非空、缺省从严、parent 直通、服务端 `parentApproved` 放行、模型伪造参数不能绕过。

> 边界：当前落地的是「角色隔离 + parent-only 工具拦截」，**不是**完整的「请求 → 家长确认 → 工具重放」状态机。后者需要前端审批 UI 与待办持久化，属于产品改动。

### 4. 扩龄：单一真源 + 内容层兼容映射

这是本轮改动面最大的一块。原先 `AgeGroup` 只有 `'3-4' | '5-6'`，7 岁以上一律回落 `'5-6'`，9 岁孩子会被用学龄前叠词对话；而且 `AiService.normalizeAgentAgeGroup()` 会把任何非 `'3-4'` 的值压回 `'5-6'`，`classifyAge()` 还有 legacy / framework 两份实现。

**核心取舍**：真实档位只用于**对话话术**，工具与内容库仍归一到现有两个 bucket。内容目录、课程包、动画标签约 30 处都按 `'3-4' / '5-6'` 索引，铺开一套新 bucket 需要新内容，不是改个标签就能上线。所以 `contentAgeGroup()` 是全仓唯一的内容映射点。

| 层 | 改动 |
|----|------|
| 单一真源 | `agent-framework/core/types/age-group.ts`：`AgeGroup` 四档、`ContentAgeGroup` 两档、`ALL_AGE_GROUPS` / `SCHOOL_AGE_GROUPS`、`classifyAge()` 边界、`normalizeAgeGroup()`、`contentAgeGroup()`、`difficultyForAge()`、`ageGroupLabel()` |
| 分类统一 | legacy `AgentExecutor.classifyAge()` 委托 framework，只保留 `'unknown'` 哨兵；`AiService.normalizeAgentAgeGroup()` 不再压缩 7+，`executeRoutedChat*` / `buildAgentContext()` 参数改为 `AgeGroupOrParent` |
| 话术 | 新建 `child-school-age.system.ts`，7-9 / 10-12 两种风格（不用叠词、不哄小孩、少 emoji、解释「为什么」、不直接给作业答案）； preschool 两套模板**一字未改** |
| 两条 prompt 路径 | framework `selectPrompt()` + `childCompanionDefinition.buildSystemPrompt()`（orchestrator 实际调的是后者）、legacy `buildSystemPrompt()` 都加新档位分支 |
| 工具参数 | `AgentExecutorService` / `BaseAgent` / legacy `AgentExecutor` 的 `normalizeToolArgs()` 都注入 `contentAgeGroup(ageGroup)`；`BaseAgent` 改为**覆盖**模型传值，防止模型把 `'7-9'` 塞给内容工具 |
| 周边适配 | `generateSuggestions()` 学龄引导语、`comfortLine()` 学龄安抚话术、`generateCoursePack()` 对 7+ 孩子改取内容桶而不是留空 |

`age-group-expansion.spec.ts`（32 例）把整条链路钉住：年龄边界、四档/两桶、两套 prompt selector、两条工具归一化路径、安抚话术；`ai.service.routing.spec.ts` 新增两例确认 `AiService` 真的把 `'7-9' / '10-12'` 传到 executor 与会话元数据。3-4 / 5-6 的原行为有独立断言，防止扩档顺手改坏老用户。

### 验证

- `npx tsc --noEmit -p tsconfig.json`：干净；
- 全量 Jest（108 suites / **1597 用例**）：全绿，退出码 0；
- `npm run build`：通过。

新增 / 扩写的测试：`age-group-expansion.spec.ts`（扩龄全链路）、`resolve-synchronize.spec.ts`（14 例）、`recall-audit.spec.ts`（10 例）、`tool-risk.spec.ts`、`tool-registry.service.spec.ts`（framework 侧闸门）、`ai.service.routing.spec.ts`（学龄档位不被压回 5-6）。

> 本机按默认顺序跑全量 Jest 偶发挂起（进程空转、无输出），用 `--runTestsByPath` 显式列出全部 108 个 spec 后稳定在 ~72s 跑完，两次结果一致。这是既有环境的 Jest 顺序相关问题，不是用例失败。

### 仍保留的边界

- **迁移不补外键**：SQLite 无法在不重建表的前提下加约束（第十一节）。
- **审计看板未做**：接口与指标已可读，前端页面未接。
- **家长审批状态机未做**：见 3 的边界说明，`parentApproved` 目前只接受服务端上下文赋值。
- **内容层仍是两桶**：7-12 岁用 5-6 的内容 bucket，只是话术更成熟；要真正按学龄给内容，需要补课程/动画/题库数据，属于内容侧改动。

## 十四、音乐源播放能力移植（music-bridge）—— 已落地（2026-11-10）

> 状态：**三步全部落地**（后端 API + Flutter 音乐页 + React Web 入口），落地记录见 14.7。源对象是 `../碎碎念/music-bridge/`（独立 Node 服务，v0.2.0），
> 不是第八节「明确不搬」里的 Python `music/`（那是绑定设备与本地模型的音乐生成，仍然不搬）。
> 本次搬的是**音乐源搜索聚合 + 音频代理播放**：孩子搜「两只老虎」→ 多音源聚合去重 → 点一条直接播放。

### 14.1 源侧事实（核查依据）

music-bridge 是碎碎念为「http-json 音乐 provider」契约写的独立桥接服务，三个入口：
`GET /?q=` 搜索、`GET /audio/<token>` 回音频字节、`GET /healthz`。核心代码全部只用 Node 内置模块
（fetch / http / https / dns / crypto），npm 依赖（axios@0.27、cheerio 等 7 个）**只给 MusicFree 第三方插件用**。

| 部件 | 规模 | 干什么 | 搬不搬 |
|------|------|--------|--------|
| `src/sources/`（itunes/audius/netease/kuwo/kugou + http/loose-json） | ~700 行 | 5 个原生音源适配器：官方公开接口（iTunes 试听、Audius 完整曲）+ 非官方网页接口（网易云/酷我/酷狗）；硬超时、字节上限、HTML 错误页识别 | **搬**，零新依赖 |
| `src/tracks.js` | 277 行 | 多源结果按「标题\|歌手」分组、归一化二次合并、完整版优先（iTunes 30 秒试听排后）、查询相关性过滤、TokenRegistry（TTL+限次） | **搬**，这是「孩子点到的那条能放完」的全部策略 |
| `src/upstream.js` | 302 行 | 出网纪律：仅 http(s)、拒 URL 内嵌凭据、拒私网/loopback、DNS pin 防 rebinding、重定向 ≤2、20MB 上限、m3u8 播放列表识别、防盗链 headers 代理 | **搬**，安全承诺靠它成立 |
| `src/server.js` 的链路 | 220 行 | 搜索→分组→发 token→`/audio` 按候选顺序多源兜底；**响应头未发才允许换源** | **搬**逻辑，外壳换成 NestJS controller |
| `src/plugin-host.js` + MusicFree 插件 | 240 行 + 7 个 npm 依赖 | 第三方 CommonJS 插件宿主：NODE_PATH 注入、全局 console 包装、进程级 unhandledRejection 抑制 | **不搬**（见 14.4） |
| `bridge.bat/sh`、`scripts/ctl.js`、独立进程形态 | — | 为 Python 主程序配的独立进程运维 | **不搬**：灵犀后端本身就是 Node，不需要第二进程 |

### 14.2 落点：NestJS `modules/music/`，进程内、零新依赖

遵循第一节「单仓库单运行时」：全部 TypeScript 化进主后端，不起独立进程、不加 npm 包。

```
GET /api/music/search?q=两只老虎&limit=10     [JwtAuthGuard]
  → 并发 search 所有白名单音源（各自硬超时，单源失败只缺席）
  → 交错合并 → 分组去重 → 完整版优先 → 相关性过滤
  → 每首歌发一个 token（内存注册表，真实音源 URL/防盗链头不出后端）
  → { tracks: [{ title, artist, duration_s, url: "/api/music/audio/<token>" }] }

GET /api/music/audio/:token                   [无守卫，token 即能力]
  → consume token → 按候选顺序 resolveMedia → SSRF 校验 + DNS pin → 流式代理
  → 一个源失败且响应头未发 → 换下一个源；全灭 → 502
```

- **audio 端点不设 JWT**：对齐 `voice/tts` 的既有做法（`voice.controller.ts` L13 无守卫），
   capability URL 本身（24 字节随机 token + TTL + 限次）就是授权；Flutter Web / `<audio>` / audioplayers
  直接拿 URL 就能播，不用给媒体请求塞 header。
- **url 只指向自己**：第三方真实 URL、Referer/Cookie 防盗链头只留在后端内存，不进响应、不进日志
  日志纪律照搬：只打固定 code，不打歌名、token、上游 URL。
- **Range 透传（新增，原桥没有）**：碎碎念是「下载完再播」，灵犀是播放器直接流播——HTML5 Audio 与
  audioplayers  seek 时会发 `Range` 请求。移植时把客户端 Range 透传给上游，上游回 206 就原样回
  206 + Content-Range；上游忽略 Range 回 200 则整段回（仍能顺序播放）。多源兜底纪律不变：
  响应头未发才换源。相应地 token 默认 TTL 5min→30min、限次 3→20（seek 会多次命中同一 token）。
- **配置 fail-closed**：`MUSIC_SOURCES` 白名单为空 = 功能关闭（search 返回空列表 + 明确提示），
  沿用桥「不默认开启任何外部音源」的设计；`.env.example` 给推荐值。
  酷我音频 URL 是 http，需显式 `MUSIC_ALLOW_HTTP_UPSTREAM=true`（默认拒 http 上游的纪律不变）。
  其余开关：`MUSIC_ITUNES_COUNTRIES=hk,us`、`MUSIC_MAX_TRACK_SECONDS=1800`、`MUSIC_MAX_BYTES`、
  `MUSIC_SEARCH_TIMEOUT_MS` 等，全部有安全默认值，不配置时行为与接入前一致（可独立回滚）。

### 14.3 前端接入点（精确到文件）

| 端 | 位置 | 改动 |
|----|------|------|
| Flutter 儿童主页 | `screens/child/child_home_screen.dart` `_buildFunctionSection`（诗词大卡片 L608–668 之后） | 加「音乐」卡片，仿诗词卡片样式 |
| Flutter 音乐页 | 新增 `screens/child/music_screen.dart`；`app.dart` 注册路由 | 搜索框 + 结果列表 + 底部播放条；用已有 `audioplayers@6.7.1` 的 `UrlSource` 直连 `/api/music/audio/<token>`（同 `tts_service.dart` L92 的既有范式） |
| Flutter API | `services/api_service.dart` | 加 `searchMusic(q)` 一个方法 |
| React Web | `components/StudentDashboard.tsx` 四宫格快捷入口（L692–732） | 加「音乐」项 → 新 `MusicView`：`new Audio(url)` 播放（同 `AIChat.tsx` L102 范式），`api.ts` 加 `searchMusic()` |
| 既有儿歌 | `voice/rhyme`（TTS 合成儿歌，硬编码 5 首） | **不动**；真实音乐是新增能力，TTS 儿歌继续独立存在 |

### 14.4 明确不做（本次）

- **MusicFree 插件宿主**：第三方代码进主进程意味着全局 console 包装、进程级 rejection 抑制和
  7 个额外 npm 依赖，与主后端稳定性冲突；navidrome/webdav 自建曲库随之留作后续可选项。
  5 个原生音源已覆盖「搜儿歌直接播」的主场景。
- **下载/离线缓存、播放列表持久化、收藏**：token 音频是流式代理，不落盘；收藏需要新表，属于后续产品改动。
- **家长控制歌单/收听时长**：后续按家长端既有范式加。
- **替换 voice/rhyme**：见 14.3。

### 14.5 测试策略

把桥的 `test/sources.js`（417 行：各源解析/异常）、`test/ranking.js`（175 行：分组/去重/完整版优先/
相关性过滤）、`test/failover.js`（146 行：多源兜底、headersSent 后不换源）逐条翻成 Jest；
新增 Range 透传（206/200 两条路径）与 token 过期/限次用例。验收：搜「两只老虎」「小星星」能出
完整版优先的聚合结果，点击即播，seek 可用；单源超时/风控不影响其余源出结果。

### 14.6 分步落地（已全部完成）

| 步 | 内容 | 状态 |
|----|------|------|
| 1 | 后端 `modules/music/`（5 音源 + 聚合 + token 代理 + Range）+ Jest + `.env.example` | ✅ |
| 2 | Flutter 音乐页 + 主页入口 + 路由 | ✅ |
| 3 | React Web 音乐入口 + MusicView | ✅ |

### 14.7 落地记录（2026-11-10）

**后端** `src/backend/src/modules/music/`：`music.config.ts`（MUSIC_* 环境变量，fail-closed）、
`sources/`（5 适配器 + http/loose-json）、`tracks.ts`（聚合 + TokenRegistry）、`upstream.ts`
（SSRF/DNS pin/Range 透传/多源兜底）、`music.service/controller/module.ts`。零新 npm 依赖。
`app.module.ts` 注册 `MusicModule`；`.env.example` 推荐值 `MUSIC_SOURCES=netease,kuwo,kugou,itunes,audius`。

**与设计的偏差（落地时定稿）**：
- 未知音源名**丢弃 + warn**，不像原桥那样启动 throw——音乐配置笔误不应拖垮整个后端。
- track.url 返回 `/music/audio/<token>`（相对 API 根），前端拼 baseUrl（已含 `/api`），
  与 14.2 示意写的 `/api/music/audio/<token>` 等效。
- 上游回 `audio/*` content-type 原样转发（原桥强制 octet-stream），播放器能正确识别。
- Flutter 侧 `searchMusic` 落在新 `services/music_service.dart`（`MusicService` 包装共享
  `ApiService` 实例以携带 JWT），而非 14.3 写的 `api_service.dart` 内——与 PoetryService 范式一致。
- React Web 实际已有 react-router（AGENTS.md「无路由库」过时）：音乐页注册为 `/student/music`；
  四宫格改 5 格（`sm:grid-cols-5`），音乐项移动端占满行（`col-span-2 sm:col-span-1`）。

**验证**：
- Jest 43/43（`music-tracks/sources/upstream.spec.ts`：聚合排序、token 限次/过期、5 源解析、
  兜底换源、Range 206/200、SSRF 私网/凭据转换）；`tsc --noEmit`、`npm run build` 通过。
- 真实后端 E2E（临时 :3101 实例）：搜「小星星」出 8 条真实曲目；整段下载 200 / 1.19MB / ID3 头；
  `Range: bytes=0-1023` → 206 + 正确 Content-Range，字节与整段前缀一致。
- React Web 浏览器 E2E（登录 → 学生端 → 音乐乐园 → 搜索 → 播放 → seek → 暂停 → 停止）：
  搜索 200 出 10 条；播放请求 206 audio/mpeg，进度走动、时长来自真实元数据（74.2s）；
  seek 到 40s 生效；暂停进度冻结；停止移除播放条。
- Flutter：`flutter analyze` 0 issue，`flutter build web` 通过。**浏览器可视化验证待补**：
  内嵌浏览器面板隐藏（0x0 视口）导致 Flutter canvas 不布局；打开面板或真机可验。
- 顺带修复阻塞 web build 的两处既有编译错误（games 并行工作引入）：
  `tap_target_game.dart` `Icons hearing_outlined` 缺句点；`pattern_next_game.dart` `_wrongPick` int?→String?。

**部署注意**：音源白名单是 fail-closed——部署环境 `.env` 需显式加 `MUSIC_SOURCES=...` 才开启；
酷我音频是 http，必须同时 `MUSIC_ALLOW_HTTP_UPSTREAM=true`。运行中的后端需重启才加载本模块。

