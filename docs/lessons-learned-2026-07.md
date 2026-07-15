# 灵犀伴学 经验教训集 — 2026年7月

> 整理自实际调试会话，记录根因、排查路径和最终修复方案，避免重复踩坑。

---

## 一、Flutter Web Release 模式空白页问题（7月14日）

### 症状
用户在手机 Safari 上打开 AI 聊天页面，主内容区**完全空白**——连用户消息和欢迎语都看不到。

### 排查过程（约 4 小时，13+ 次构建迭代）

#### 第一步：怀疑 SSE 流式响应挂起
- 后端 AI 对"你好"调用 `generateActivity` 工具而非直接回复，每轮 13-19 秒，多轮迭代
- 前端无任何反馈，用户以为白屏
- **修复**：添加"思考进度"Timer，每 3 秒轮播消息（🦄 正在思考...）

#### 第二步：怀疑 SSE 适配器代码损坏
- `sse_adapter_web.dart` 经过多次 patch 后逻辑混乱
- **修复**：完全重写 278 行

#### 第三步：怀疑 null check 异常
- 日志：`Null check operator used on a null value`
- `thinkingContent` 经 `?.trim()` 后类型为 `String?`，直接调用 `.replaceAll()` 和传给 `MarkdownBody(data:)`
- Profile 构建启用 `--native-null-assertions`，可空类型直接调用方法触发 null check
- **修复**：两处加 `?? ''`

#### 第四步：发现 ErrorWidget 在 release 模式不可见
- `debugPrint` 日志没出现 → `_buildMessageBubble` 根本没被调用
- Release 模式下 `ErrorWidget` 渲染为 **0×0 像素不可见框**
- 异常在更上层抛出，build 函数崩溃后聊天区域就是空白
- **修复**：覆盖 `ErrorWidget.builder` 让错误在 release 模式可见（红框+堆栈）

#### 第五步（最终根因）：LinearGradient 在 CanvasKit Release 模式 Crash
- null check 修复后出现新异常：`Instance of 'minified:ka<void>'`
- 通过读取 minified JS 堆栈，定位到 `WP.ajp` → Flutter Web CanvasKit 的 `Gradient.linear` Shader 方法
- Skia shader 的内部指针（`this.a`）为 null → 触发 null check 错误
- **这是 Flutter Web 在 Safari 移动端渲染 `LinearGradient` 的已知 bug**
- **修复**：将 `ai_chat_screen.dart` 中所有 7 处 `LinearGradient` 替换为纯色 `color`

### 教训

1. **Flutter Web Release 模式 ≠ Debug 模式**：`ErrorWidget` 默认 0×0 不可见，必须 override `ErrorWidget.builder` 才能看到崩溃信息
2. **`LinearGradient` 在 CanvasKit Release 模式可能 crash**：Safari 移动端尤其脆弱，用纯色替代
3. **Profile 模式 `--native-null-assertions` 严格**：`String?` 直接调方法会报错，必须加 `?? ''` 或 `?.`
4. **try-catch 只捕获 build 函数错误，不捕获 framework inflate 错误**：ErrorWidget.builder 才是兜底
5. **逐步 debugPrint 定位**：在每一层加日志（provider → builder → bubble inner），缩小范围
6. **读 minified JS 堆栈**：虽然变量名被混淆，但方法名和类名仍可辨识，能定位到 Flutter framework 层面的 crash
7. **缓存破坏要在 build 后做**：Flutter build 重新生成 bootstrap → cache-bust 必须在 build 完成后执行

---

## 二、ConversationManager "LLM not configured" 警告（7月15日）

### 症状
后端日志反复出现：`[WARN] [ConversationManager] Cannot generate summary: LLM not configured`

### 根因
`ConversationManager` 类有一个 `setLlmClient()` 方法（手动 setter 注入模式），但**全代码库中无任何地方调用它**。

```typescript
// 旧代码 — setter 从未被调用
private llmClient: LlmClientService;

constructor(
  @InjectRepository(Conversation) conversationRepo,
  @InjectRepository(ConversationMessage) messageRepo,
) {}

setLlmClient(llmClient: LlmClientService) {
  this.llmClient = llmClient;  // ← 永远不会被调用
}
```

`AiService` 同时注入了 `LlmClientService` 和 `ConversationManager`，却在构造函数里没有把前者传给后者。`this.llmClient` 永远是 `undefined`。

### 修复
将手动 setter 模式改为 NestJS 标准的构造函数注入。`LlmClientService` 由 `@Global()` 模块导出，`ConversationManager` 可直接构造注入，无循环依赖风险。

```typescript
// 新代码 — 标准构造函数注入
constructor(
  @InjectRepository(Conversation) conversationRepo,
  @InjectRepository(ConversationMessage) messageRepo,
  private readonly llmClient: LlmClientService,  // ← NestJS 自动注入
) {}
```

### 教训

1. **手动 setter 注入是反模式**：在 NestJS 中，如果一个服务依赖另一个 `@Global()` 导出的服务，应该直接用构造函数注入，而不是写一个 `setXxx()` 等别人来调
2. **setter 没被调用时不会有编译错误**：TypeScript 不会报错，运行时才发现 `undefined`，这种 bug 非常隐蔽
3. **全局搜索验证**：写完 setter 后，grep 一下 `.setLlmClient(` 看有没有调用方——如果没有，说明设计有问题
4. **NestJS DI 优先**：框架提供了完善的依赖注入机制，应该充分利用，而不是手动传递依赖
5. **Warning 不应忽视**：虽然只是 warn 不是 error，但意味着对话摘要功能完全失效，长期会导致上下文窗口溢出

---

## 三、跨会话通用教训

### 3.1 调试方法论
- **先确认症状再假设根因**：用户说"空白"时，先问清楚是哪种空白（全白？有框架无内容？有内容但不渲染？），避免在错误的方向上浪费 3+ 次迭代
- **分层加日志缩小范围**：provider → builder → widget inner，每层加 debugPrint，看哪一层断掉
- **Release 模式的错误不可见**：Flutter Web release 模式会吞掉大量错误信息，必须主动暴露

### 3.2 Flutter Web 特有坑
- `LinearGradient` → CanvasKit crash（用纯色替代）
- `ErrorWidget.builder` → release 模式默认 0×0（必须 override）
- Service Worker 缓存 → 旧 JS 永久缓存（需要 SW unregister + 版本化文件名）
- Profile 模式 `--native-null-assertions` → `String?` 直接调方法 crash（加 `?? ''`）

### 3.3 NestJS 依赖注入
- `@Global()` 模块导出的服务可以直接构造注入，不需要手动 setter
- 手动 setter 模式容易遗漏调用，且不会有编译错误
- 用 grep 验证 setter 是否被调用：`search_files pattern="\.setXxx\("`

### 3.4 部署流程
- Flutter Web build → 版本化 JS 文件名 → 更新 bootstrap 引用 → 添加 Cache-Control → 清理旧版本
- 后端改代码后：`npm run build` → `systemctl --user restart lingxi-backend` → 检查日志确认无 warning
- Cloudflare 缓存：CF 会覆盖 nginx 缓存头（4h），版本化文件名是唯一可靠的 cache-bust 方案
