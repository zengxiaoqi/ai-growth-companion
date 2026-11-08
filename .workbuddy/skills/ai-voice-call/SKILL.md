---
name: ai-voice-call
description: 为 AI 对话应用（NestJS 后端 + React Web + Flutter App）实现「碎碎念闲聊模式」与「豆包式全屏实时语音通话」。当用户要求给 AI 对话增加语音通话、实时连续语音对话、电话图标按钮、闲聊/碎碎念模式（casual chat），或排查语音识别无声、TTS 播报失败等问题时使用。包含完整的三端实现路径、诊断方法与踩坑清单。
---

# AI 语音通话与碎碎念模式

## Overview

本技能提供在 AI 对话应用中落地两类功能的完整方案：

1. **碎碎念（casual）模式**：孩子/用户随口说、AI 用 1~2 句口语短句回复，不走教案/工具流程、不进智能体路由。
2. **豆包式语音通话**：电话图标按钮 → 全屏通话界面 → 「听 → 识别 → AI 短回复 → TTS 播报 → 续听」无限循环，Web 端与 Flutter App 端一致体验。

核心链路：`SpeechRecognition（ASR）→ /ai/chat/stream（casual 模式 SSE）→ getTTSUrl → Audio 播报 → 自动续听`。

## Workflow

### Step 1: 后端 casual 模式（先行，三端共用）

1. 在 `ChatRequest` 类型中加 `mode?: 'default' | 'casual'`（`ai.types.ts`）。
2. 三个 chat 入口（POST /chat、GET /chat/stream、POST /chat/stream）接收并透传 `mode` 到 service。
3. service 的 `buildAgentContext` 把 mode 写入 `AgentContext.metadata.chatMode`。
4. orchestrator 中按 `metadata.chatMode === 'casual'` 分支：跳过智能体路由、禁用全部工具、`maxIterations = 1`，使用专用系统提示词（口语化、1~2 句、不超过 40 字、禁止列点与教案腔），仍走 `filterContent` 与会话持久化。
5. 用 `scripts/test_casual_stream.sh` 验证 SSE：应只出 `token` 事件、无 `tool` 事件、回复 ≤2 句。

### Step 2: Web 端（React）

1. `AIChat.tsx` 增加「碎碎念」开关（header 与 full-page 两种布局都要有），流式请求 query 加 `mode=casual`。
2. 电话按钮 → 挂载全屏 `VoiceCallOverlay` 组件。**注意：若 AIChat 有悬浮/全页两个分支，Overlay 必须两个分支都挂载**（否则某分支点击无反应——本项目踩过的坑）。
3. `VoiceCallOverlay` 核心状态机：`idle → listening → recognizing → speaking → listening`（循环）+ `paused`（异常看门狗）。
4. ASR 用浏览器 `webkitSpeechRecognition`（zh-CN, continuous, interimResults）；TTS 用后端 `/ai/tts?url=...` 返回的音频 URL 播报。
5. 必备诊断能力（缺一不可，否则无法定位"收不到语音"类反馈）：
   - `getUserMedia` + `AnalyserNode` 实时音量条 → 区分「系统没采到声（麦克风静音）」vs「引擎无响应」。
   - 错误横幅区分 `not-allowed` / `audio-capture` / `network` 三类。
   - network 错误连续 3 次失败 → 暂停自动重启，显示打字兜底输入框（Chrome 的 SpeechRecognition 走 Google 服务器，国内网络常 network 失败且**错误会被静默吞掉导致无限重启**）。
   - `onend` 且未暂停且未在播报 → 自动 restart 续听；`onresult` final 结果才发起对话。
6. Chrome 走 Google ASR、Edge 走微软 ASR——国内环境下优先建议用户用 Edge。

### Step 3: Flutter 端

1. `api_service.dart` 的 send 方法加 `mode` 参数；`chat_session_provider` 加 `casualMode` / `toggleCasualMode` / `sendVoiceTurn`（强制 casual + 持久化）。
2. `ai_chat_screen.dart` 加开关行 + 电话按钮。
3. 新建 `voice_call_screen.dart`：`speech_to_text` 包（走系统 RecognitionService）+ `tts_service`（或后端 TTS）+ `sendVoiceTurn`，同样的状态机循环。
4. 构建与安装（国内网络）：
   - `FLUTTER_STORAGE_BASE_URL=https://storage.flutter-io.cn` 必设（否则 `:app:compileDebugKotlin` 卡死，真相是 storage.googleapis.com 下载引擎 jar 停滞）。
   - 本机后端调试：`--dart-define=API_BASE_URL=http://<宿主机IP>:3000/api`（App 默认连生产域名）。
   - MuMu 模拟器：`adb connect 192.168.1.x:5555`，`input tap` 必须按 `wm size` 真实分辨率坐标（screencap 截图宽 ≠ 设备宽，差 1.5 倍缩放）。
5. **MuMu 模拟器无 `android.speech.RecognitionService`，语音输入无法在模拟器验证，必须真机测试**；UI / TTS / 流程状态机可在模拟器验证。

### Step 4: 排障顺序（用户报告"没有语音输入"时）

1. 先问/看浏览器与权限：是否 Edge（国内 Chrome ASR 常挂）、麦克风权限是否给了站点。
2. 看音量条：有波动 → 采集正常，问题在 ASR 引擎（多为 network）；无波动 → 系统级静音或选错麦克风设备。
3. 看错误横幅类型，按 `not-allowed`（去浏览器设置开权限）/ `audio-capture`（换麦克风设备）/ `network`（换浏览器或换网络）处理。
4. 服务端无可用 ASR 兜底时（LLM 网关无 `/v1/audio/transcriptions`），打字兜底输入框是最后的可用路径，务必保留。

## Resources

### scripts/

- `test_casual_stream.sh` — 冒烟测试 casual 模式 SSE 流：验证只出 token 事件、无工具调用、回复短句。用法见脚本头部注释。

### references/

- `references/implementation.md` — 三端各文件改动点清单、状态机细节、看门狗逻辑、关键代码骨架。
- `references/pitfalls.md` — 完整踩坑清单（edge-tts 403、SpeechRecognition 静默失败、overlay 分支漏挂、Flutter 构建卡死、adb 坐标缩放、login 字段名等）。

实现任何一端前先读 implementation.md；遇到异常表现先查 pitfalls.md 再动手。
