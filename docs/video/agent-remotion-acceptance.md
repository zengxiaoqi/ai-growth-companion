# agent-remotion 创作引擎验收结论（Phase 2/3，2026-11-16）

跑批：`scripts/accept-agent-remotion.ts`（POLL_IDS=18,20,21,22,23），报告落
`src/backend/storage/agent-remotion-acceptance.json`，QA 帧在 `storage/qa/<taskId>/round-0/`。
创作模型 deepseek-v4.1-flash（`LLM_AUTHOR_MODEL`），视觉评审 deepseek-v4-pro。
后端为含治理修复的构建（toolGuard 闸 + 历史截断注入 + LLM 启动就绪闸）。

## 五主题结果

| task | 主题 | 实际引擎 | QA 分 | 修复轮 | 延迟(s) | 说明 |
|---|---|---|---|---|---|---|
| 18 | 大树的样子 | agent-remotion | 78 | 3 | 1145 | 主体在、bespoke 场景；blocker=树枝被树冠遮挡 |
| 20 | 小蝌蚪找妈妈 | dynamic-remotion | 53 | 1 | 1126 | agent 契约 thrash loud-fail → 兜底；蝌蚪/鸭子主体在 |
| 21 | 认识时钟 | agent-remotion | 82 | 2 | 934 | 钟面+时针焦点环正确；装饰素材与主题弱相关 |
| 22 | 彩虹 | agent-remotion | 76 | 3 | 851 | 各场景主体独立（无错位）；blocker=蓝莓破图占位 |
| 23 | 认识汉字 | agent-remotion | 73 | 3 | 775 | 就绪闸修复后重跑（替换被启动竞态污染的 19） |

4/5 走 agent-remotion 出片；1/5（蝌蚪）创作模型反复契约违例（未定义名/未闭 svg/空写），
toolGuard 拒空写与连续重写后仍超预算 → **loud fail 落 dynamic-remotion**，原因落日志。

`qaPassed=false` 并非分数低：`passed = score>=70 && !hasBlocker`。78/82/76/73 均过分数线，
但各含 blocker（破图占位、主体遮挡）→ 不达标**放行但记录**（不静默），符合红线。

## 历史病理复查（已解决）

- **场景错位**（旧 task 11 彩虹 scene3/4 渲染 scene1/2 内容）：22 的 perScene 摘要与抽帧确认
  六个场景主体各自独立（色点→水珠分色→彩虹标签→水果彩虹→水盆实验→太阳入水珠），无重复。
- **主体缺失**（旧 task 14 蝌蚪）：20 兜底帧确认小蝌蚪/鸭子/青蛙主体均在、关系箭头与字幕对齐。

## 治理修复（本轮根因）

1. **网关截断**：tool 消息与历史 assistant tool_calls 大参数 ~4096 截尾 → 历史 writeFile 压缩成
   摘要 + 磁盘全文经 `[author-file-state]` user 消息注入（只留最新）。探针 probe-assistant-args.ts。
2. **迭代预算病理**（task 17 连续 writeFile 10 次烧光预算）：executor 加通用 `toolGuard` 钩子；
   agent-remotion 用其强制 write→renderStills 交替、拒空写。task 18/20 日志可见拒写生效。
3. **启动竞态**（task 19 队列早于 onModuleInit 认领 → `this.client` undefined → "reading 'chat'"
   落 remotion）：LlmClientService 加就绪闸（`await this.ready`，onModuleInit finally 释放），
   覆盖 chatCompletion/Stream/WithTokenLimit；回归测试锁住"init 前不发请求"。23 重跑不再竞态。

## 端到端播放（Phase 3）

`scripts/verify-player-web.cjs`：无头 Chrome（font 拦截 msyh + 本地 canvaskit）登录家长端 →
生成视频 → 历史记录 → 查看视频×2，两个不同视频 `currentTime` 推进、readyState=4，exit 0。
此前"启动卡住"实为诊断探针未穿 shadow DOM（canvas 在 flt-glass-pane shadowRoot 内），非真 stall。

## 结论与剩余差距

引擎四要素（自由创作/看见/修复/按需素材）齐备且闭环有界、失败响、可观测。剩余质量差距集中在
**素材 blocker**（个别破图占位、标签遮挡）与**创作模型在大 TSX 上的契约稳定性**（蝌蚪 thrash），
属素材库/模型能力问题，非管道工程缺陷；已由 QA 记录并兜底，不静默。