# P0 游戏桥接 PoC · 自动化验证报告

- 生成时间：2026-11-09T17:53:03.990Z
- Node：v22.22.2
- 结论：**PASS**（通过 31 / 失败 0 / 跳过 0）
- 命令：`node poc/game-bridge/verify.mjs`

## A 静态审核

| 结果 | 检查项 | 说明 |
| --- | --- | --- |
| PASS | A1 审核通过样例包，bridge sha256 与固定源一致 | 4 files / 9083 bytes, hash 3efa07912f3e… |
| PASS | A2 拒绝既有 kids-brain-training 原型（外链字体 + localStorage + input） | 14 hits: external-url, external-style, form-input, client-storage |
| PASS | A3 造恶意包，8 类禁用能力全部命中 | 20 hits across 9 rules |
| PASS | A4 W3C SVG namespace 白名单不误报 | allowlisted namespace URLs accepted |
| PASS | A5 超过 5MB 的产物被体积上限拒绝 | 5244461 / 5242880 bytes |
## B 静态托管与响应头

| 结果 | 检查项 | 说明 |
| --- | --- | --- |
| PASS | B1 宿主页下发父页 CSP（含 frame-ancestors） | CSP 8 directives, cache no-cache |
| PASS | B2 游戏产物 CSP 使用显式 origin + connect-src none | CSP default-src http://127.0.0.1:52861, cache public, max-age=300 |
| PASS | B3 游戏内 bridge 与样式可正常加载 | 3 assets served with correct MIME |
| PASS | B4 /games/ 目录穿越被拒绝 | encoded ../ traversal -> 403 |
| PASS | B5 根路径重定向到宿主页 | 302 -> /host.html |
| PASS | B6 未发布 / 未知 build 无法签发会话 | build not published |
## C 会话签发

| 结果 | 检查项 | 说明 |
| --- | --- | --- |
| PASS | C1 签发会话，字段齐全且 bridgeHash 与磁盘一致 | session 79195558…, bridge 3efa07912f3e… |
| PASS | C2 两次签发得到不同 sessionId | sessionIds are unique |
## D postMessage 校验器

| 结果 | 检查项 | 说明 |
| --- | --- | --- |
| PASS | D1 READY 校验 bridgeHash 后放行 | READY accepted |
| PASS | D2 拒绝伪造 source / origin / channel / session | 4 identity checks rejected |
| PASS | D3 拒绝 bridgeHash 不匹配 / 子页发 INIT / 未知类型 / 非对象消息 | 4 protocol violations rejected |
| PASS | D4 HEARTBEAT / PROGRESS / ERROR 均放行且不记分 | heartbeats=1, completed=false |
| PASS | D5 COMPLETE 分数 clamp 到 [0,100]，时长不为负 | 150 -> 100, -20 -> 0, NaN -> 0, negative time -> 0 |
| PASS | D6 拒绝非法题目数与正确数 | 4 invalid result shapes rejected |
| PASS | D7 COMPLETE 只接受一次 | session already completed |
| PASS | D8 会话超时判定可用（注入时钟） | maxAgeMs=5000, clock advanced by 6s -> expired |
| PASS | D9 toAssignmentCompletion 合并交互数据且会话字段优先 | score/resultData preserved, spoofed buildUuid overridden |
## E 端到端回写闭环

| 结果 | 检查项 | 说明 |
| --- | --- | --- |
| PASS | E1 完整消息序列 READY/PROGRESS/COMPLETE 通过，重放 COMPLETE 被拒 | session already completed |
| PASS | E2 真实提交：contentId 取显式值 9001，不 fallback 到 1 | assignment 42 -> score 67, learningRecord.contentId=9001 |
| PASS | E3 学习记录可从查询接口读回 | 1 record(s) readable |
## F 服务端防伪造

| 结果 | 检查项 | 说明 |
| --- | --- | --- |
| PASS | F1 同一 sessionId 重复提交 -> 409 | session already used |
| PASS | F2 伪造 / 缺失 sessionId -> 404 / 400 | unknown -> 404, missing -> 400 |
| PASS | F3 过期会话 -> 410 | session expired |
| PASS | F4 buildUuid / bridgeHash 与会话不一致 -> 400 | both bindings enforced |
| PASS | F5 分数越界 -> 400 | 101 / -1 rejected |
## G 真实浏览器 iframe 闭环

| 结果 | 检查项 | 说明 |
| --- | --- | --- |
| PASS | G1 headless Chromium 自动通关并回写（CDP 实证 event.origin） | event.origin="null", 自动通关后回写成功, contentId=9001 |

## 说明

- 本报告由 `verify.mjs` 自动生成，随验证脚本一起提交；重跑会覆盖本文件。
- G 组使用本机已有的 headless Chromium 真实加载 sandbox iframe，用于实证 `event.origin` 的取值。
- 全流程不改动任何生产代码，所有文件位于 `poc/game-bridge/`。
