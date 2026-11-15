# 创作模型对比裁决（2026-11-15）

跑分脚本：`src/backend/scripts/bench-authoring-models.ts`
链路：生产创作 prompt → 契约校验 → Remotion stills 抽帧 → VisualQaService（vision）打分 + blocker 一票否决。
画廊：`storage/bench-gallery/<model>__<topic>/`；verdict：`storage/qa/bench-<model>__<topic>/verdict.json`；
原始输出：`storage/bench-raw/`；汇总：`storage/bench-authoring-report.json`。

## 结果（3 主题 × 3 模型）

| 模型 | 彩虹是怎么形成的 (5-6) | 大树的样子 (3-4) | 认识汉字"山" (5-6) | 延迟 | 输出 tokens |
|---|---|---|---|---|---|
| deepseek-v4.1-flash | 68 / 2 blocker | 84 / 1 blocker | 76 / 2 blocker | 20-27s | ~5.0-6.0k |
| deepseek-v4-flash | 83 / 1 blocker | 81 / 2 blocker | **82 / 0 blocker（passed）** | 22-76s | ~5.2-5.9k |
| deepseek-v4-pro | 创作成功但 QA 调用断连 | 创作 3 次重试仍 fetch failed | 同左 | 59s（仅成功一次） | 6.8k |

## 人工画廊复核

- **v4-flash**：扁平矢量画风干净、主体完整、配色统一；blocker 集中在"讲解主体被遮挡/缺失"
  （树枝被树冠圆和标签横幅盖住、树根被字幕条压住、收尾场景没画彩虹）。这类问题正是
  stills-first 修复闭环（Phase 2）与 QA gate（Phase 1）的目标面，verdict 给出的定位准确可信。
- **v4.1-flash**：单帧质量不差（彩虹色散光路画得清楚），但分数波动大（68→84），
  blocker 命中率更高，稳定性不如 v4-flash。
- **v4-pro**：网关对长创作请求不稳定（keep-alive 断连，退避重试 3 次仍失败）；
  但**带图的 vision QA 请求稳定**，且 verdict 细节质量高（能指出"光束止于水滴表面未穿入"
  "橙黄文字与浅底对比不足"这类具体问题）。

## 裁决

- **创作模型 = `deepseek-v4-flash`**（分数均值 82、唯一零 blocker 通过、延迟可接受）。
- **vision QA 模型 = `deepseek-v4-pro`**（`LLM_VISION_MODEL`，verdict 质量高且带图请求稳定）。
- v4-pro 暂不进入创作候选：网关长连接问题未解决前重试成本不可控；若后续网关修复可复跑对比。

## 复跑

```bash
cd src/backend
npx ts-node -T scripts/bench-authoring-models.ts --models=deepseek-v4-flash --topics=彩虹,大树,山
```

报告按 model+topic 增量合并（upsert），重跑只覆盖对应单元格。

## Phase 1 复跑：figure 几何通道（20 主题，2026-11-15）

口径：`totals.figure` = 通过 `normalizeFigureSpec` 的场景数，`totals.figureRejected` = 被拒数；
拒绝率 = 被拒 / (通过 + 被拒)。报告：`storage/figure-channel-report-phase1*.json`。

| 跑次 | 模型 | prompt | 通过/总场景 | 被拒/提交 | 拒绝率 | 主因 |
|---|---|---|---|---|---|---|
| 基线（旧校验） | MiniMax-M3 | 旧 | 15/95 | 7/22 | 32% | no-main-shape 6、tiny-arc 1 |
| 回放（当前校验） | M3 旧输出 | 旧 | 22/95 | 0/22 | **0%** | — |
| phase1 | deepseek-v4-flash | 当前 | 18/100 | 18/36 | **50%** | coverage 10、label-cover 7、off-center 1 |
| phase1 | deepseek-v4.1-flash | 当前 | 17/100 | 12/29 | 41% | label-cover 8、coverage 3、no-main-shape 1 |
| phase1 | MiniMax-M3 | 当前 | 未测成 | — | — | 网关 404，0/20 |

归因：

- 回放（`figure-channel-replay-phase1.json`）证明当前阈值对 M3 旧输出 100% 接受 →
  回退**不是阈值变严**造成的。
- 被拒 spec 形态（dump 自 phase1 报告 raw）：coverage = 一排小圆（r20–60）纵向占比不足；
  off-center = 主体聚偏一侧；label-cover = 标签放图形内部（地幔标签落在棕环上、内核标签在圆心）。
  全是空间布局习惯，与 beats 语法无关；且每条都属于"喂回拒绝原因即可重画"的可修复面。
- **缺失单元格**：M3 当前 prompt 跑被 404 重跑覆盖、无存活报告；flash 旧 prompt 未跑。
  故"prompt 无影响"是推断（拒绝形态与 beats 无关 + 同阈值接受 M3 输出），不是实测结论。
- M3 网关可用性波动：QA bench 与 figure 复跑期间 404 `Model "MiniMax-M3" is not available
  for this group`（直连 probe 确认），而数分钟前仍可用。M3 的 QA 分数至今未测成。

## 画廊逐帧审（18 张，v4-flash phase1 通过 spec，frame 140）

图：`storage/figure-gallery-phase1/Fig01–18.png`（`scripts/export-figure-gallery.ts --report
storage/figure-channel-report-phase1.json` 导出后 remotion still 逐张渲染）。

- **可读性通道零失败**：无白底白图、无字幕条压图、标签白描边全部可读、主体不出界。
- **语义缺陷（几何校验拦不住，vision 才能拦）**：
  - Fig3/4/5 凸透镜画成双凹：spec 里两条 curve 的控制点写在内侧（左弧 c1x=800 > 端点 740），
    渲染器忠实画 Bézier → **模型错，非渲染错**。
  - Fig4 "倒立像"蜡烛正立；光线未连接物与像。Fig3 中间光线止于透镜前 40px，缺直穿段。
  - Fig15 卵主体仅 ~40px、叶子是两条开放曲线，主体存在感弱（几何阈值放行）。
  - 小疵：Fig2 土星环开口、Fig12 支点与木棍有间隙、Fig14 标签压石头（白描边仍可读）。
  - 好样张：Fig1/6/8/9/10/11/13/16/17（轨道整圈、七色弧、色散、三层同心圆、力臂对比）。
- 结论：几何校验必要但不充分；语义层靠已建的 vision QA gate 与 Phase 2 stills 闭环。
  Phase 1 参数修复面（beats/backgroundStyle/accentColor）修不了 figure 几何/语义。

## 年龄 A/B 验收（同主题 3-4 vs 5-6）

同一段旁白、同一份 raw beats，只换 ageGroup（`scripts/preview-age-ab.js` 用生产
sanitizeBeats → beatWindows → enforceAgeProfile 生成窗口）：
3-4 = 2 拍（≥2.5s）、1 次焦点转移、幅度 1.25；5-6 = 4 拍（≥1.6s）、3 次转移、幅度 1.12、按拍揭示。
帧证据：`storage/beat-stills/ab-f3640/3720/3820/3880.png`（3-4 焦点太阳→雨滴一大跳；
5-6 同进度焦点已在白云且后续还有两跳）。未改场景回归 6 帧 0 差异。

## 裁决（Phase 1 收尾，2026-11-15，用户选定）

冲突：Phase 0 的 QA 裁决选 v4-flash（83/81/82、唯一零 blocker），但 figure 几何通道
拒绝率 50%（M3 旧输出同阈值 0%）。候选：
A. 保持 v4-flash + ≤1 轮 figure 几何修复（拒绝原因喂回重画）；
B. 回退 M3（几何强但网关 404、QA 未测）；
C. 双模型路由（分镜 v4-flash、figure 重场景 M3）；
D. 维持 .env 现状 v4.1-flash（两通道都最弱）。

**选定 A**：拒绝原因全是空间布局习惯（coverage 10 / label-cover 7 / off-center 1），
属于"说清楚就能改对"的面，用一轮有界修复换回 QA 最优模型，比换模型便宜。
**配置落地选 scoped override**：新增 `LLM_AUTHOR_MODEL`，只影响分镜生成与 figure
修复轮；聊天/测验/推荐仍走 `LLM_MODEL`（保持 v4.1-flash）。留空 = 跟随全局。

实现（单代码路径，生产与跑分共用）：
- `video/figure-repair.ts`：`repairFigures()` 纯函数，一次 generateJson 调用
  （temperature 0.2 / maxTokens 6000），prompt = figure 语法 + 拒绝原因中文提示
  + 原 figure；产物逐条过 `normalizeFigureSpec` 才接受，index 必须对上原拒绝；
  任何失败收敛为 null，调用方记日志（不静默）。
- `generate-video-content.ts`：分镜 generate 带 `model: authorModel`；
  sanitize 后对被拒 figure 跑 ≤1 轮修复（不随 attempt 循环重试）。
- `measure-figure-channel.ts`：同一 repairFigures + OpenAI adapter，
  报告新增 `repair: {rejected, fixed}` 与 totals.repairRuns/repairRejected/repairFixed。
- `llm-client.service.ts`：`authorModel` 读取 + provider entry（LLM_AUTHOR_MAX_TOKENS
  默认 32000）+ chatCompletion/generateJson 的 options.model 透传（pi-ai 与 OpenAI 双路径）。
- 单测 `test/unit/figure-repair.spec.ts` 8 条：空列表不烧 token、产物过校验、
  假 index 丢弃、仍不合格丢弃、多拒绝单次调用、LLM 抛错/非 JSON 收敛 null、输入不变。

### 修复轮复跑（20 主题，deepseek-v4-flash + ≤1 轮修复，2026-11-15）

报告：`storage/figure-channel-report-phase1-repair.json`（raw 为修复后版本，可 replay 复核）。

| 指标 | 无修复基线 | +≤1 轮修复 |
|---|---|---|
| figure 通过 | 18/100 | **35/100** |
| figure 被拒 | 18（提交 36，拒绝率 50%） | **9（提交 44，拒绝率 20%）** |
| graph 通过 | 55 | 55（另 1 份 graph-invalid） |
| 含 figure 的课节 | — | 12/20 |
| 修复轮触发 | — | 8 份分镜，修好 15/24 个被拒 figure（62.5%） |

残余拒绝分布：label-cover 4 / coverage 3 / off-center 1 / no-main-shape 1。
注意两次跑是独立采样（figure 提交 36 vs 44），拒绝率对比有效、绝对通过数含采样差。
修复轮把拒绝率压到方案硬指标（<20%）的边界上；残余的 label-cover 是下一轮
prompt/修复提示的改进面，不阻塞 Phase 2。平均 completion 3049 tokens/次（max 4669），
v4-flash 不思考，预算压力远小于 M3。

修复产物抽查（frame 140，`storage/figure-gallery-phase1-repair/`）：
Fig7 光线汇聚（平行光→焦点，语义保留）、Fig15 地球三层（同心圆+标签外移）、
Fig29 太阳照一半（亮半弧/暗半圆+白天黑夜标签）、Fig35 数字好朋友（1-5 排布铺满）。
四张均"只改布局、不改知识"，无新语义缺陷。