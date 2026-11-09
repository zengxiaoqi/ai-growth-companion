# 游戏桥接 P0 PoC

> 对应方案文档：`docs/ohmygame-integration-plan.md`（v1.1，附录 D）
> **零 npm 依赖、零生产代码改动**。这里只验证「审核过的静态游戏包 → sandbox iframe → postMessage → 回写学习记录」这条链路是否可行。

## 1. 快速开始

```bash
# 一键自动化验证（会自动寻找本机 headless Chromium 做真实 iframe 闭环）
node poc/game-bridge/verify.mjs

# 只跑 Node 层（无浏览器环境时）
node poc/game-bridge/verify.mjs --no-browser

# 人工演示：启动后打开 http://127.0.0.1:4173/host.html
node poc/game-bridge/server.mjs

# 自动通关（无需点击），用于观察完整回写
# http://127.0.0.1:4173/host.html?autoplay=1
```

`verify.mjs` 会打印分组结果并覆盖生成 `verification-report.md`；有任一 FAIL 时退出码为 1。
当前基线：**31 PASS / 0 FAIL / 0 SKIP**。

单独使用审核器：

```bash
node poc/game-bridge/audit-game-build.mjs poc/game-bridge/games/count-bubbles
node poc/game-bridge/audit-game-build.mjs kids-brain-training --json   # 预期 DENY
```

## 2. 目录结构

| 文件 | 作用 |
| --- | --- |
| `verify.mjs` | 一键验证：A 审核 / B 托管响应头 / C 会话 / D 消息校验 / E 回写 / F 防伪造 / G 真实浏览器 |
| `audit-game-build.mjs` | 静态审核扫描器（导出 `auditDirectory()`、`sha256()`，也可 CLI 运行） |
| `host-validator.mjs` | 父页 `postMessage` 校验器，浏览器与 Node 验证共用 |
| `server.mjs` | 零依赖静态服务器：两套 CSP、session 签发、模拟 `/assignments/:id/complete` |
| `host.html` / `host.css` / `host.js` | 模拟儿童端父页面中的 `HtmlGame` 组件 |
| `bridge/lingxi-bridge.js` | **固定桥接源文件**，注入产物时逐字节复制，其 sha256 登记在 `GameBuild.bridgeHash` |
| `games/count-bubbles/` | 审核通过的样例产物：3 关数数游戏 + 注入的 bridge 副本 |
| `verification-report.md` | 自动生成的最新验证报告 |

## 3. 链路

```
audit-game-build.mjs   ── 放行/拒绝静态包，记录 bridge sha256
        ↓
server.mjs             ── /games/ 下发显式 origin CSP + 5min 缓存；父页另行下发 frame-ancestors
        ↓
host.html              ── <iframe sandbox="allow-scripts">（无 allow-same-origin）
        ↓  INIT(targetOrigin='*', sessionId, bridgeHash, ...)
lingxi-bridge.js       ── READY / HEARTBEAT / PROGRESS / ERROR / COMPLETE（targetOrigin='*'）
        ↓
host-validator.mjs     ── source / origin / channel / session / bridgeHash / 分数 clamp / 一次性 COMPLETE
        ↓
toAssignmentCompletion ── { score, resultData{...session 字段覆盖游戏自报值} }
        ↓
POST /api/assignments/42/complete ── assignment.completed + learningRecord(contentId 来自 GameBuild)
```

## 4. 实证结论（已回写方案文档 v1.1）

1. **`event.origin === "null"`**：`sandbox` 不授予 `allow-same-origin` 时 iframe 是 opaque origin。真实 headless Chromium 中父页收到的 `event.origin` 就是字符串 `"null"`，**不是**父页 origin。原方案里「校验 `event.origin` 与 `window.location.origin` 一致」会误拒全部消息，已修正。
2. **双向 `postMessage` 都必须用 `targetOrigin='*'`**：子页无法用父页 origin 精确寻址，父页也无法给 opaque origin 精确投递。安全性改由 `event.source === iframe.contentWindow` + 一次性 `sessionId` + `channel` + `bridgeHash` + 服务端会话绑定保证。
3. **CSP 的 `'self'` 不匹配 opaque origin**：给 `/games/` 下发的 CSP 必须写显式部署 origin（PoC 用 `http://127.0.0.1:<port>`；nginx 侧建议 `map` 白名单 + `${scheme}://${http_host}`），`img-src` / `media-src` 同理。`connect-src 'none'` 仍可禁止网络请求，且不影响 `postMessage`。
4. **`resolveContentId` 的修复可验证**：把 `contentId` 显式放在 `GameBuild` 上（PoC 为 `9001`），回写的 `learningRecord.contentId` 正确落为该值，不再静默 fallback 到 `1`。
5. **缓存必须覆盖 `expires 1y`**：`/games/` 使用 `public, max-age=300`，避免产物更新不生效。
6. **既有 HTML 原型不能直接收编**：`kids-brain-training/index.html` 被审核器拒绝 14 处（Google Fonts 外链、`<input>`、`localStorage`），正好作为反面样本。

## 5. 安全模型要点

- 游戏 iframe 无 `allow-same-origin`、无 `allow-forms`、无 `allow-popups`、无 `allow-top-navigation`，`allow=""` 关闭全部 Permissions Policy，`referrerpolicy="no-referrer"`。
- 游戏产物内**没有**网络请求、存储、cookie、动态代码执行、嵌套 iframe、表单输入；唯一出口是固定的 `window.LingxiGame`。
- 会话：后端签发、一次性、5 分钟过期，绑定 `buildUuid` 与 `bridgeHash`；服务端拒绝重复提交（409）、伪造（404）、过期（410）、绑定不一致（400）、分数越界（400）。
- 分数在父页 clamp 到 `[0,100]`，`correctAnswers <= totalQuestions`，`timeSpent` 非负；会话字段覆盖游戏自报的 `buildUuid` 等，防止产物伪造归属。

## 6. 局限（不要据此直接上线）

- `server.mjs` 用内存 Map 模拟数据库与鉴权，**没有** JWT、`childId` 归属校验、TypeORM 实体与 migration。
- 审核器是**静态正则**：拦得住明文 `fetch` / `localStorage` / `eval` / 外链，拦不住 `document.createElement('input')`、字符串拼接与混淆。生产需叠加 AST 检查、人工试玩与运行时 CSP。
- 样例游戏是手写的，不是 ohmygame 生成的多文件产物（后者可能含内联脚本、WebGL、外部字体），尚未跑过本管线。
- 只在 Chromium 145 headless 验证；Flutter Web `HtmlElementView`、Flutter 原生、双域名生产 nginx 均未验证。
- 方案 B（扩展自有题型 / 参数化引擎）未实现；本 PoC 只验证方案 A 的运行时承载链路。

## 7. 环境备注

本机 Chromium 的 `--dump-dom` 在加载带子资源的页面时会挂起，因此 G 组改用 **CDP**（`--remote-debugging-port=0` + `DevToolsActivePort` + 内置 WebSocket）主动轮询 DOM。驱动进程用异步 `spawn`：若用 `spawnSync` 会阻塞 Node 事件循环，导致同进程内的 PoC HTTP server 无法响应浏览器请求。找不到 Chromium 时 G 组自动标记为 SKIP，不影响其余验证。
