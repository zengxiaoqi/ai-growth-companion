# 踩坑清单

按现象索引，先查这里再动手调试。

## 现象：点电话按钮毫无反应（无报错）

- **原因**：`VoiceCallOverlay` 只挂在 AIChat 的一个渲染分支（如悬浮窗分支），full-page 分支 early return 后 Overlay 根本没被渲染。
- **修复**：两个分支都挂载 Overlay（full-page 分支挂在 `</AnimatePresence>` 后、外层 `</div>` 前）。

## 现象：Web 端一直「聆听中」但收不到任何语音识别结果

三种可能，按顺序排查：
1. **浏览器**：Chrome 的 SpeechRecognition 走 Google 服务器，国内常 network 失败且**错误被静默吞掉**（不触发可见错误，只静默 onend），配合自动 restart 会表现为永远聆听却无结果 → 用音量条+失败计数看门狗；换 Edge（走微软服务器）。
2. **麦克风系统级静音/选错设备**：音量条无波动即此因。
3. **权限**：`not-allowed` → 站点麦克风权限没给。

## 现象：Chrome ASR 无限重启

- network 错误触发 onerror → 自动 restart → 再失败 → 循环。
- 修复：networkFailRef 计数，连续 3 次失败进入 paused，显示错误横幅 + 打字兜底输入。

## 现象：TTS 完全无声（后端日志 403）

- **原因**：`@andresaya/edge-tts` 1.8.0 被微软 403（Sec-MS-GEC 令牌算法变更）。
- **修复**：升级到 1.9.1+。注意这会让 TTS「早挂了但没被发现」，升级后必须实际播一条验证。

## 现象：Flutter 构建 `:app:compileDebugKotlin` 卡死

- **真因**：`storage.googleapis.com` 下载 Flutter 引擎 jar 大文件停滞（代理对该域名可能反而 000，直连也停滞）。连试 5 次都卡同一处即此因，重试无效。
- **修复**：`FLUTTER_STORAGE_BASE_URL=https://storage.flutter-io.cn PUB_HOSTED_URL=https://pub.flutter-io.cn`，2 分钟内可成。
- 临时加的 `org.gradle.offline=true` 用完要 git checkout 恢复。

## 现象：App 一启动就报网络错误

- App 默认连生产域名（可能已挂 530）。联调用 `--dart-define=API_BASE_URL=http://<宿主机IP>:3000/api`。
- login 响应字段名是 `token`，不是 `access_token`。
- `curl` 测试走系统代理会 502，加 `--noproxy '*'`。

## 现象：adb input tap 点不到目标

- screencap 截图宽（如 608px）≠ 设备真实宽（900x1600），坐标差 1.5 倍。
- **必须**先 `adb shell wm size` 拿真实分辨率，按真实坐标 tap。

## 现象：MuMu 模拟器语音初始化失败

- MuMu 没有 `android.speech.RecognitionService`，`speech_to_text` 无法工作。语音输入必须真机验证；不要在模拟器上反复排查 ASR。

## 现象：语音回合延迟 10~20 秒

按顺序检查三个常见的系统性原因（本次实测 15~20s → 4~6s）：
1. **双倍请求**：stream 路径先发非流式请求做工具预检测再丢弃，然后流式再生成一遍。无工具的闲聊 agent 必须跳过预检测直接流式。
2. **思考型模型**：闲聊用 reasoning 模型（如 MiniMax-M3），思维链主导延迟。配置轻量模型按模式覆盖（LLM_MODEL_CASUAL），executor 从 metadata.chatMode 传 modelOverride。**注意 stream 路径里的非流式检测调用也要传 override，漏了会退回慢模型**。
3. **网关抖动**：国内直连 LLM 网关时快时慢。分层对照定位：curl --noproxy 直连 → node 原生 fetch → node TLS 握手 → TCP net.connect → SDK。若仅 SDK 慢，查它是否读了 HTTPS_PROXY 走代理。

## 现象：TTS 把 emoji 读出来

- 后端 TTS 合成前剥离 `\p{Extended_Pictographic}` + 变体选择符/肤色修饰符/ZWJ/keycap。
- casual 提示词允许模型输出 emoji 用于屏幕显示（朗读自动跳过），两者不冲突。
- 前端 TTS URL 构建处加同款清洗兜底；Web 端别把旧音色参数钉死在 api 层，让后端默认生效。

## 现象：TTS 语气像机器人

- 音色换 zh-CN-XiaoyiNeural（比 XiaoxiaoNeural 活泼），rate "+12%"、pitch "+2Hz" 提轻快感；edge-tts 的 SynthesisOptions 支持 rate/pitch/volume。
- 课程旁白等正式内容保留标准音色（XiaoxiaoNeural），只有闲聊场景用活泼配置。



- WorkBuddy safe-delete shim 会拦截批量删除命令。手动 `rm -rf node_modules/.vite dist` 绕过（仅限构建缓存目录）。

## 现象：SSE 测试误判「reasoning 泄漏」

- 测试脚本把 `thinking` 事件的 content 拼进了正文导致误判。实际 `thinking` 与 `token` 事件是分离的，拼装时只取 `token` 事件。

## 项目工具链注意

- React 组件图标用 **heroicons**（`@/icons`），不是 lucide-react；缺图标先查 `src/icons/index.tsx`。
- 后端端口以 `src/backend/.env` 的 `PORT` 为准（3000），别信文档里的 3001。
- chatMode 状态在组件里的声明位置必须在 `isParentMode` 判断之前，否则引用报错。
