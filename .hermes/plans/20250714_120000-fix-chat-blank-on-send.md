# Fix: Chat Goes Blank After Sending Message

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** When the user presses send, the user's message bubble and AI typing indicator must be immediately visible — the chat area must NOT go blank while waiting for the AI response.

**Architecture:** The root cause is that `ChatSessionProvider.sendMessage()` calls `notifyListeners()` (which schedules a frame) but then immediately enters a network request via `Future.delayed(50ms)` → SSE stream. On Flutter Web (mobile Safari), 50ms is not a reliable guarantee that the frame has been painted. The fix replaces `Future.delayed` with `WidgetsBinding.instance.addPostFrameCallback`, which fires only after the frame is built, and adds a second frame wait for paint completion. Additionally, `_sendMessage()` in the screen uses `setState(() => _isLoading = true)` which triggers a parent rebuild that can interfere with the Consumer's rebuild — the fix separates the send flow so `notifyListeners()` from the provider is the primary trigger for the message list update.

**Tech Stack:** Flutter 3.41.x (Web), Provider, SSE (fetch + ReadableStream), Cloudflare Tunnel (HTTP/2)

---

## Root Cause Analysis

### Symptom
After typing a message and pressing send:
1. Send button goes grey (loading state) ✓
2. Chat area goes **completely blank** — no user message, no greeting, no typing indicator ✗
3. When AI response arrives, everything appears at once (user message + AI response)

### Call Flow (current, broken)
```
_sendMessage() [ai_chat_screen.dart:567]
  ├─ _controller.clear()
  ├─ setState(() => _isLoading = true)     ← marks _AIChatScreenState dirty
  ├─ _scrollToBottom()
  └─ provider.sendMessage(message)          ← NOT awaited, runs synchronously to first await
       ├─ _localMessages.add(userMessage)
       ├─ notifyListeners()                 ← marks Consumer dirty, schedules frame
       ├─ _localMessages.add(aiPlaceholder)
       ├─ notifyListeners()                 ← marks Consumer dirty again
       └─ await Future.delayed(50ms)        ← yields, but frame may not be painted yet
            └─ SSE stream starts
                 └─ await for (event in stream)  ← blocks until first SSE chunk
                      ↑ If CF buffers SSE, this could be seconds
                        Frame is scheduled but may not be painted yet
```

### Why 50ms is Not Enough
On Flutter Web (mobile Safari):
1. `notifyListeners()` → Consumer `markNeedsBuild()` → `scheduleFrame()` → `requestAnimationFrame()`
2. `Future.delayed(50ms)` → timer fires after 50ms
3. Browser fires `requestAnimationFrame` → frame built + painted

Step 3 should happen before step 2 (rAF fires at ~16ms). BUT on mobile Safari:
- Keyboard dismissal causes layout recalculation, delaying rAF
- Under load, rAF can be delayed beyond 50ms
- If the timer fires before the frame is painted, the SSE `await for` loop starts, and if it doesn't yield properly (JS interop quirk), the frame never gets painted

### Fix Strategy
Replace `Future.delayed(50ms)` with a two-step frame wait:
1. `addPostFrameCallback` — fires after the next frame is **built** (widgets reconciled)
2. A second `addPostFrameCallback` — fires after the next frame is **painted** (committed to screen)

This guarantees the user message is painted before the network request starts.

Additionally, move the `setState(() => _isLoading = true)` to AFTER the provider has added the messages, so the parent rebuild and the Consumer rebuild happen in the same frame, avoiding a stale intermediate state.

---

## Task 1: Replace Future.delayed with Frame Callback in sendMessage

**Objective:** Ensure the frame containing the user message is painted before starting the SSE network request.

**Files:**
- Modify: `src/frontend/lib/providers/chat_session_provider.dart:519-522`

**Step 1: Replace the delay**

Find this code in `sendMessage()` (around line 519):

```dart
    // 等待 UI 渲染用户消息后再开始网络请求
    // 否则在 Flutter Web 上，网络请求会阻塞事件循环，
    // 导致 notifyListeners() 触发的帧渲染来不及执行，消息显示空白
    await Future.delayed(const Duration(milliseconds: 50));
```

Replace with:

```dart
    // 等待 UI 渲染（paint）用户消息后再开始网络请求
    // 使用 addPostFrameCallback 确保帧不仅被构建(build)还被绘制(paint)到屏幕
    // Future.delayed(50ms) 在 Flutter Web mobile Safari 上不可靠——
    // 键盘收起等操作会延迟 requestAnimationFrame，导致帧未绘制就开始网络请求
    await _waitForFramePaint();
```

**Step 2: Add the _waitForFramePaint helper**

Add this method to the `ChatSessionProvider` class (before the `sendMessage` method, around line 495):

```dart
  /// 等待 Flutter 完成一帧的构建和绘制
  /// 用于确保 notifyListeners() 触发的 UI 更新在屏幕上可见后再继续
  Future<void> _waitForFramePaint() async {
    // 第一帧：build 阶段（widget tree 重建）
    await _nextFrame();
    // 第二帧：paint 阶段（光栅化到屏幕）
    // 两个帧确保 build→layout→paint→composite 全部完成
    await _nextFrame();
  }

  static Future<void> _nextFrame() {
    final completer = Completer<void>();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      completer.complete();
    });
    return completer.future;
  }
```

**Step 3: Add required imports**

At the top of `chat_session_provider.dart`, ensure these imports exist:

```dart
import 'dart:async';
import 'package:flutter/widgets.dart';
```

(`dart:async` for `Completer`, `package:flutter/widgets.dart` for `WidgetsBinding`)

**Step 4: Verify build**

Run: `cd src/frontend && flutter build web --no-tree-shake-icons`
Expected: Build succeeds with no errors

**Step 5: Commit**

```bash
git add src/frontend/lib/providers/chat_session_provider.dart
git commit -m "fix: use addPostFrameCallback instead of Future.delayed for UI render wait

Future.delayed(50ms) is unreliable on Flutter Web mobile Safari.
Two-frame wait (build + paint) ensures user message is visible
before SSE network request starts."
```

---

## Task 2: Reorder setState in _sendMessage to Avoid Stale Intermediate State

**Objective:** Ensure `setState(() => _isLoading = true)` doesn't cause a parent rebuild that races with the Consumer rebuild.

**Files:**
- Modify: `src/frontend/lib/screens/ai_chat_screen.dart:567-591`

**Step 1: Reorder the send flow**

Find `_sendMessage()` in `ai_chat_screen.dart` (around line 567):

```dart
  Future<void> _sendMessage({String? text}) async {
    final message = (text ?? _controller.text).trim();
    if (message.isEmpty) return;

    _controller.clear();
    setState(() => _isLoading = true);
    _scrollToBottom();

    final provider = context.read<ChatSessionProvider>();
    // 不 await，让用户消息立即显示，AI 回复通过 notifyListeners 流式更新
    provider.sendMessage(message).then((msgIndex) {
      if (mounted) {
        setState(() => _isLoading = false);
        _scrollToBottom();
        // 自动朗读
        if (_autoPlay) {
          _autoSpeakMessage(msgIndex);
        }
      }
    }).catchError((e) {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    });
  }
```

Replace with:

```dart
  Future<void> _sendMessage({String? text}) async {
    final message = (text ?? _controller.text).trim();
    if (message.isEmpty) return;

    _controller.clear();

    final provider = context.read<ChatSessionProvider>();
    // 先让 provider 添加用户消息+AI占位符到 localMessages
    // sendMessage 内部会调用 notifyListeners() 触发 Consumer 重建
    // 然后 sendMessage 会在 _waitForFramePaint() 处等待帧绘制完成
    provider.sendMessage(message).then((msgIndex) {
      if (mounted) {
        setState(() => _isLoading = false);
        _scrollToBottom();
        if (_autoPlay) {
          _autoSpeakMessage(msgIndex);
        }
      }
    }).catchError((e) {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    });

    // setState 在 provider.sendMessage 之后调用
    // sendMessage 同步执行到 await _waitForFramePaint() 才 yield
    // 此时 localMessages 已更新，_isLoading=true 会让发送按钮变灰
    // 二者在同一帧内处理，避免中间空白状态
    setState(() => _isLoading = true);
    _scrollToBottom();
  }
```

**Key change:** `setState` is called AFTER `provider.sendMessage()` (which runs synchronously up to the `await _waitForFramePaint()`). This ensures:
1. The provider has already added the user message and AI placeholder
2. `notifyListeners()` has already been called (Consumer is dirty)
3. `setState` marks the parent state dirty
4. Both dirty marks are processed in the same frame → single rebuild with both the new messages AND the loading state

**Step 2: Verify build**

Run: `cd src/frontend && flutter build web --no-tree-shake-icons`
Expected: Build succeeds with no errors

**Step 3: Commit**

```bash
git add src/frontend/lib/screens/ai_chat_screen.dart
git commit -m "fix: reorder setState after provider.sendMessage to avoid stale intermediate state

setState before provider.sendMessage causes a parent rebuild that
races with the Consumer rebuild. By calling sendMessage first (which
runs synchronously to the frame wait), both the message list update
and the loading state change happen in the same frame."
```

---

## Task 3: Add Debug Logging for Diagnosis

**Objective:** Add temporary debug prints to verify the fix works correctly during testing. These can be removed after verification.

**Files:**
- Modify: `src/frontend/lib/providers/chat_session_provider.dart:506-522`

**Step 1: Add debug prints**

In `sendMessage()`, after adding user message and before `_waitForFramePaint()`:

```dart
    // 添加用户消息到本地缓存
    _localMessages.add(ChatMessageEntry(role: 'user', content: trimmed));
    notifyListeners();
    debugPrint('🔍 [ChatProvider] user message added, localMessages=${_localMessages.length}');

    // 添加一个空的 AI 消息，用于流式更新
    final aiMsg = ChatMessageEntry(
      role: 'assistant',
      content: '',
      displayText: '',
      isStreaming: true,
    );
    _localMessages.add(aiMsg);
    notifyListeners();
    debugPrint('🔍 [ChatProvider] AI placeholder added, localMessages=${_localMessages.length}');

    // 等待 UI 渲染（paint）用户消息后再开始网络请求
    await _waitForFramePaint();
    debugPrint('🔍 [ChatProvider] frame painted, starting SSE stream');
```

**Step 2: Add debug print at SSE stream start**

Before `await for (final event in stream)` (around line 541):

```dart
      debugPrint('🔍 [ChatProvider] SSE stream starting...');
      await for (final event in stream) {
```

**Step 3: Add debug print at first token**

Inside the `if (type == 'token')` block:

```dart
        if (type == 'token') {
          final chunk = event['content'] as String? ?? '';
          if (fullReply.isEmpty) {
            debugPrint('🔍 [ChatProvider] first token received: "$chunk"');
          }
          fullReply += chunk;
```

**Step 4: Verify build**

Run: `cd src/frontend && flutter build web --no-tree-shake-icons`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/frontend/lib/providers/chat_session_provider.dart
git commit -m "debug: add debug prints to chat send flow for blank screen diagnosis"
```

---

## Task 4: Build, Deploy, and Verify

**Objective:** Build the Flutter Web app, deploy, and verify on the production URL that the chat doesn't go blank after sending.

**Step 1: Build Flutter Web**

Run:
```bash
cd ~/ai-growth-companion/src/frontend
export PUB_HOSTED_URL=https://pub.flutter-io.cn
export FLUTTER_STORAGE_BASE_URL=https://storage.flutter-io.cn
~/flutter/bin/flutter build web --no-tree-shake-icons
```

Expected: `build/web/` directory updated with new `main.dart.js`

**Step 2: Cache-bust (rename main.dart.js)**

Find current version number:
```bash
ls build/web/main.dart.v*.js 2>/dev/null || echo "no versioned files"
```

Bump version (e.g., if v3 exists, create v4):
```bash
cd build/web
# Determine next version
NEXT_VER=4  # adjust based on existing
cp main.dart.js main.dart.v${NEXT_VER}.js
# Update flutter_bootstrap.js to reference the new version
sed -i "s/main\.dart\.v[0-9]*\.js/main.dart.v${NEXT_VER}.js/g" flutter_bootstrap.js
# Delete old versioned files
rm -f main.dart.v$((NEXT_VER - 1)).js
ls main.dart.v*.js
```

**Step 3: Verify backend is running**

```bash
systemctl --user status lingxi-backend
# If not running:
# systemctl --user start lingxi-backend
```

**Step 4: Verify production URL**

```bash
curl -s -o /dev/null -w "%{http_code}" https://lingxi.chataifree.eu.org/
# Expected: 200
```

**Step 5: Test the chat flow**

Open `https://lingxi.chataifree.eu.org/` in browser (or use curl to verify API):
```bash
# Test SSE endpoint directly
curl -N -X POST https://lingxi.chataifree.eu.org/api/ai/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message":"你好"}' \
  --max-time 10 2>&1 | head -20
```

Expected: SSE events start flowing within 5 seconds (backend sends `: ping` heartbeat)

**Step 6: Visual verification**

Ask the user to test on their phone:
1. Open `lingxi.chataifree.eu.org` in Safari
2. Navigate to AI tab
3. Type a message (e.g., "你好")
4. Press send
5. **Expected:** User message bubble appears immediately, AI typing indicator (three dots) appears below
6. **Expected:** When AI response starts streaming, text appears incrementally

**Step 7: Commit final state**

```bash
cd ~/ai-growth-companion
git add -A
git commit -m "fix: chat blank on send — frame paint wait + state reorder

Root cause: Future.delayed(50ms) doesn't guarantee frame is painted
on Flutter Web mobile Safari before SSE stream starts.

Fix:
- Replace Future.delayed with addPostFrameCallback (two-frame wait)
- Reorder setState after provider.sendMessage to avoid stale state
- Add debug logging for diagnosis

Closes: chat-blank-on-send"
```

---

## Task 5: Remove Debug Logging (Post-Verification)

**Objective:** Clean up debug prints after the fix is verified working.

**Files:**
- Modify: `src/frontend/lib/providers/chat_session_provider.dart`

**Step 1: Remove all debugPrint lines added in Task 3**

Remove these lines:
- `debugPrint('🔍 [ChatProvider] user message added...')`
- `debugPrint('🔍 [ChatProvider] AI placeholder added...')`
- `debugPrint('🔍 [ChatProvider] frame painted...')`
- `debugPrint('🔍 [ChatProvider] SSE stream starting...')`
- `debugPrint('🔍 [ChatProvider] first token received...')`
- And the `if (fullReply.isEmpty)` debug block

**Step 2: Rebuild and redeploy**

```bash
cd ~/ai-growth-companion/src/frontend
export PUB_HOSTED_URL=https://pub.flutter-io.cn
export FLUTTER_STORAGE_BASE_URL=https://storage.flutter-io.cn
~/flutter/bin/flutter build web --no-tree-shake-icons
# Bump version, update bootstrap, delete old
```

**Step 3: Commit**

```bash
git add src/frontend/lib/providers/chat_session_provider.dart
git commit -m "cleanup: remove debug prints from chat send flow"
```

---

## Risks and Tradeoffs

### Risk: Two-frame wait adds ~32ms latency
- **Impact:** Negligible — 32ms is imperceptible to users
- **Mitigation:** None needed; the tradeoff is immediate message visibility

### Risk: addPostFrameCallback might not fire if no frame is scheduled
- **Impact:** sendMessage would hang indefinitely
- **Mitigation:** notifyListeners() schedules a frame, so addPostFrameCallback will fire. Add a timeout fallback:
  ```dart
  await _nextFrame().timeout(const Duration(seconds: 1), onTimeout: () {
    debugPrint('⚠️ Frame wait timed out, proceeding with network request');
  });
  ```

### Risk: SSE stream still blocks after fix
- **Impact:** If the SSE stream's `await for` doesn't yield properly, the screen could still freeze during streaming
- **Mitigation:** The SSE adapter uses `reader.read().toDart` which converts JS Promise to Dart Future — this properly yields. The 5-second timeout on first chunk also handles CF buffering.

### Open Question: Should we add a visible "sending" state?
- Current: AI placeholder shows typing indicator (three dots)
- Enhancement: Could add a subtle "发送中..." text above the input bar
- Decision: Skip for now — the typing indicator + user message bubble should be sufficient

---

## Files Changed Summary

| File | Change |
|------|--------|
| `src/frontend/lib/providers/chat_session_provider.dart` | Replace `Future.delayed(50ms)` with `_waitForFramePaint()` (two-frame `addPostFrameCallback` wait); add imports for `dart:async` and `flutter/widgets.dart`; add debug prints (temporary) |
| `src/frontend/lib/screens/ai_chat_screen.dart` | Reorder `setState(() => _isLoading = true)` to after `provider.sendMessage()` call |
