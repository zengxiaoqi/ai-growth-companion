# 实现细节参考

三端改动点清单与关键实现骨架。文件路径以本项目（NestJS + React Web + Flutter）为例，其他项目按同名职责迁移。

## 1. 后端（NestJS）

### 改动点

| 文件 | 改动 |
|------|------|
| `modules/ai/ai.types.ts` | `ChatRequest` 加 `mode?: 'default' \| 'casual'` |
| `modules/ai/ai.controller.ts` | 三个 chat 入口（POST /chat、GET /chat/stream、POST /chat/stream）接收 `mode` 并透传 |
| `modules/ai/ai.service.ts` | `buildAgentContext` 把 mode 写入 `AgentContext.metadata.chatMode` |
| `agent-framework/agents/orchestrator.service.ts` | casual 分支：跳过路由、禁用工具、maxIterations=1、专用提示词 |

### casual 系统提示词要点

- 口语化短句回复，1~2 句，总共不超过 40 字
- 不用列表、不解释、不给建议清单
- 可以反问一句保持对话流动
- 语气亲切，像朋友聊天

### 关键逻辑

```ts
const isCasual = context.metadata?.chatMode === 'casual';
if (isCasual) {
  // 跳过智能体路由（router）
  // disabledTools = all
  // maxIterations = 1
  // systemPrompt = CASUAL_PROMPT
}
// 结果仍走 filterContent() 与会话持久化
```

### TTS

- 使用 `@andresaya/edge-tts`（**必须 ≥1.9.1**，1.8.0 被微软 403，Sec-MS-GEC 令牌算法变更）
- 对外接口 `GET /ai/tts` 返回音频 URL，前端拿 URL 用 `<audio>` 播放

## 2. Web 端（React）

### 改动点

| 文件 | 改动 |
|------|------|
| `src/types/index.ts` | `ChatMessage` 加 `mode` |
| `src/services/api.ts` | 流式 GET query 加 `mode=casual`；`getTTSUrl(text)` |
| `src/components/AIChat.tsx` | 碎碎念开关（两种 header 布局都要加）、电话按钮、挂载 `VoiceCallOverlay` |
| `src/components/VoiceCallOverlay.tsx` | 全屏通话组件（新建） |
| `src/icons/index.tsx` | 补缺失图标（如 `PhoneOff`），注意项目用 heroicons 不是 lucide-react |

### ⚠️ Overlay 挂载坑

`AIChat` 若有悬浮窗分支和 full-page 分支（early return），`<VoiceCallOverlay>` 必须在**两个分支都挂载**。只挂一处时另一分支点电话按钮毫无反应（无报错）。full-page 分支的正确位置：`</AnimatePresence>` 之后、最外层 `</div>` 之前。

### VoiceCallOverlay 状态机

```
idle → listening ⇄ speaking（循环）
   ↓ (network 连续失败≥3) 
paused（显示打字兜底框，手动恢复）
```

核心 refs（防闭包陷阱）：
- `networkFailRef` — network 错误计数
- `asrPausedRef` — 暂停标记，restart 前必须检查
- `micSilentRef` — 麦克风静音检测标记

诊断三件套：
1. **音量条**：`getUserMedia({audio:true})` → `AudioContext` → `AnalyserNode` → `requestAnimationFrame` 算 RMS，实时显示。区分「系统没采到声」vs「ASR 引擎无响应」。
2. **错误横幅**：`onerror` 事件分类 `not-allowed` / `audio-capture` / `network`，分别给可操作提示。
3. **打字兜底**：paused 或用户主动暂停时，文本输入框直接走 casual 流式接口。

### ASR 循环要点

```ts
rec.continuous = true;
rec.interimResults = true;
rec.lang = 'zh-CN';
rec.onresult: 只取 isFinal 的结果 → 停止识别 → 发 casual 流式请求 → TTS 播报
rec.onend: 若 !asrPausedRef.current && !speaking → rec.start()（自动续听）
rec.onerror: network → failCount++，≥3 → pause；其余 → 横幅提示
```

注意 Chrome 的 SpeechRecognition 请求发往 Google 服务器，国内网络经常 network 失败；**失败事件可能不触发 onerror 而只是静默 onend**，所以要靠计数看门狗而不是只靠 onerror。

## 3. Flutter 端

### 改动点

| 文件 | 改动 |
|------|------|
| `lib/services/api_service.dart` | `sendAIChatMessage` / `Stream` 加 `mode` 参数 |
| `lib/providers/chat_session_provider.dart` | `casualMode`、`toggleCasualMode`、`resetGreeting`、`sendVoiceTurn`（强制 casual + 会话持久化） |
| `lib/screens/ai_chat_screen.dart` | 碎碎念开关行 + 电话按钮 |
| `lib/screens/voice_call_screen.dart` | 全屏通话界面（新建） |

### voice_call_screen 循环

- `speech_to_text` 包（走系统 RecognitionService）`listen()` → final result → `sendVoiceTurn(text)` → 返回文本 → `tts_service` 播报（`await speak()`）→ 继续listen
- Provider 模式注入；通话界面退出时 `stopListening()` + `stopSpeaking()`

### 构建/安装速查

```bash
# 构建（国内必须设镜像，否则卡 :app:compileDebugKotlin）
FLUTTER_STORAGE_BASE_URL=https://storage.flutter-io.cn PUB_HOSTED_URL=https://pub.flutter-io.cn \
  flutter build apk --debug   # 或 --release

# 连 MuMu 模拟器（桥接模式）
adb connect 192.168.1.8:5555

# 安装并指定本机后端
adb install -r build/app/outputs/flutter-apk/app-debug.apk
# 启动后确认 App 端 API_BASE_URL 指向 http://<宿主机IP>:3000/api

# UI 自动化：tap 坐标必须按真实分辨率
adb shell wm size          # 例如 900x1600
adb shell input tap X Y    # 用 wm size 的坐标系，不是截图坐标系
```

### 模拟器限制

MuMu（x86_64, Android 12）**没有 `android.speech.RecognitionService`**，`speech_to_text` 初始化即失败。语音输入只能在真机验证；模拟器可验证 UI、TTS、状态机、发送链路。

## 4. 联调速查

- 后端直连：`VITE_API_BASE_URL=http://localhost:3000/api npx vite --port=5173`（后端 CORS 全开）
- `curl` 测试走系统代理会 502，加 `--noproxy '*'`
- login 接口响应字段是 `token`（不是 `access_token`）
- 端口以 `src/backend/.env` 的 `PORT` 为准（本项目 3000，部分文档写 3001）
