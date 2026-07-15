# SSE Stream Hang — Diagnosis & Fix Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Diagnose and fix the chat SSE stream hanging after "SSE stream starting..." — no events received, chat page appears blank to user.

**Architecture:** Flutter Web → fetch() + ReadableStream → Cloudflare Tunnel (HTTP/2) → nginx → NestJS SSE controller → LLM API (deepseek-v4-pro at openclaw.sany.com.cn). The stream hangs somewhere in this chain. The backend sends `: ping\n\n` heartbeats, but the client may not receive them due to CF HTTP/2 buffering, or may receive them but get no actual SSE events because the LLM is slow/hung.

**Tech Stack:** Flutter Web (dart:js_interop + package:web), NestJS SSE (Express Response), Cloudflare Tunnel (HTTP/2), OpenAI-compatible LLM API

---

## Current Context & Assumptions

### Console log from user (release build, `main.dart.v202607141000.js`):
```
🔍 [ChatProvider] user message added, localMessages=4
🔍 [ChatProvider] AI placeholder added, localMessages=5
🔍 [ChatProvider] frame painted, starting SSE stream
🔍 [ChatProvider] SSE stream starting...
```
Then **nothing**. No tokens, no errors, no fallback.

### Key observations from code analysis:

1. **AppLogger is silenced in release builds** — `app_logger.dart` line 40-43: `kDebugMode ? Level.ALL : Level.WARNING`. The SSE adapter (`sse_adapter_web.dart`) uses `AppLogger` for all its logging (`_log.info`, `_log.warning`). In the release build, `_log.info(...)` calls are **suppressed**. Only `_log.warning` and above are printed. This means we have **zero visibility** into what the SSE adapter is doing in production.

2. **5-second first-chunk timeout exists but only for the FIRST chunk** — `sse_adapter_web.dart` line 100-105: After `gotFirstChunk = true`, there is **no timeout** on `reader.read()`. If the first ping is received but subsequent events never arrive, the reader blocks forever.

3. **Backend heartbeat should keep stream alive** — `ai.controller.ts` line 88-95: sends `: ping\n\n` immediately + every 10s. But if CF HTTP/2 buffers these, the client never receives them.

4. **Non-streaming fallback exists** — `sse_adapter_web.dart` line 174-228: If `_fetchSseStream` throws (e.g., 5s timeout), falls back to dio POST `/ai/chat`. But this fallback's logs are also silenced in release.

5. **Provider's `await for` loop has no timeout** — `chat_session_provider.dart` line 565: `await for (final event in stream)` blocks indefinitely if no events arrive.

6. **LLM API** — `http://openclaw.sany.com.cn/v1`, model `deepseek-v4-pro`. If this API is slow or unresponsive, the backend's `for await (const event of this.frameworkOrchestrator.routeStream(...))` loop would hang, waiting for the first event from the LLM. The backend heartbeat would still send pings, but no actual SSE events would flow.

### Root cause hypothesis (most likely → least likely):

1. **CF HTTP/2 buffering of the initial ping** — The `: ping\n\n` is buffered by CF and not delivered within 5 seconds. The first-chunk timeout fires, `_fetchSseStream` throws, the fallback is triggered. But the fallback's dio POST also goes through CF and may be slow (LLM response time). The user sees nothing for 5s + LLM response time.

2. **LLM API is slow or hung** — The ping is received (gotFirstChunk=true), but the LLM takes 30+ seconds to respond. No timeout exists after the first chunk. The user waits forever. The pings keep the connection alive but no actual events flow.

3. **LLM API is down or erroring** — The backend's `chatStream` generator catches an error and yields `{type: 'error', ...}`. But if the error happens in the `for await` loop inside `executeRoutedChatStream`, it might not be caught properly.

---

## Files Likely to Change

- `src/frontend/lib/services/sse_adapter_web.dart` — Add debugPrint logging, add total event timeout
- `src/frontend/lib/providers/chat_session_provider.dart` — Add stream timeout, improve logging
- `src/frontend/lib/utils/app_logger.dart` — Consider adding a `debugPrint`-backed method that works in release
- `src/backend/src/modules/ai/ai.controller.ts` — Add more logging to SSE endpoint
- `src/backend/src/modules/ai/ai.service.ts` — Add logging to chatStream generator

---

### Task 1: Test SSE endpoint directly with curl (diagnostic, no code change)

**Objective:** Verify whether the backend SSE endpoint actually sends events, and measure LLM response time.

**Step 1: Get a JWT token**

```bash
TOKEN=$(curl -s http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"phone":"13800000001","password":"password123"}' | jq -r '.token')
echo "Token: ${TOKEN:0:20}..."
```

**Step 2: Test SSE stream directly (bypass CF)**

```bash
curl -N -X POST http://localhost:3001/api/ai/chat/stream \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"你好"}' 2>&1 | head -50
```

Expected: Should see `: ping` immediately, then `event: thinking` or `event: token` events within a few seconds. If nothing comes after the ping, the LLM is the bottleneck.

**Step 3: Test SSE through CF tunnel (production)**

```bash
curl -N -X POST https://lingxi.chataifree.eu.org/api/ai/chat/stream \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"你好"}' 2>&1 | head -50
```

Expected: If this hangs or is delayed compared to Step 2, CF is the bottleneck.

**Step 4: Test non-streaming endpoint (the fallback path)**

```bash
time curl -s -X POST http://localhost:3001/api/ai/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"你好"}' | jq '.content'
```

Expected: Should return within a few seconds. If this hangs, the LLM is down.

**Step 5: Test LLM API directly**

```bash
time curl -s http://openclaw.sany.com.cn/v1/chat/completions \
  -H "Authorization: Bearer ayQrTrVxJJpXH6d0" \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-v4-pro","messages":[{"role":"user","content":"你好"}],"max_tokens":100}' | jq '.choices[0].message.content'
```

Expected: Should return within 5-15 seconds. If this hangs or errors, the LLM API is the root cause.

---

### Task 2: Add debugPrint logging to SSE Web adapter (frontend)

**Objective:** Make SSE adapter logging visible in release builds by using `debugPrint` instead of `AppLogger`.

**Files:**
- Modify: `src/frontend/lib/services/sse_adapter_web.dart`

**Step 1: Replace AppLogger with debugPrint in critical paths**

In `sse_adapter_web.dart`, add `import 'package:flutter/foundation.dart';` and replace key `_log.info(...)` / `_log.warning(...)` calls with `debugPrint(...)`.

Critical points to add logging:

```dart
// At the start of platformFetchSseStream:
debugPrint('🔍 [SSE] platformFetchSseStream called, url=$url, method=$method');

// Before fetch:
debugPrint('🔍 [SSE] _fetchSseStream: calling fetch...');

// After fetch resolves:
debugPrint('🔍 [SSE] fetch resolved, status=${response.status}');

// After getting reader:
debugPrint('🔍 [SSE] reader created, entering read loop');

// On first chunk received:
debugPrint('🔍 [SSE] first chunk received, gotFirstChunk=true');

// On each parsed event:
debugPrint('🔍 [SSE] parsed event: type=$eventName, data=${dataLine?.substring(0, 50)}...');

// On timeout:
debugPrint('⚠️ [SSE] first chunk timeout (5s), CF buffering suspected');

// On fallback:
debugPrint('🔍 [SSE] falling back to non-streaming, url=$nonStreamUrl');

// On fallback success:
debugPrint('🔍 [SSE] fallback response received, content length=${content.length}');

// On fallback error:
debugPrint('⚠️ [SSE] fallback failed: $e');

// On stream done:
debugPrint('🔍 [SSE] stream done, total events: ...');

// On any error:
debugPrint('⚠️ [SSE] error: $e');
```

**Step 2: Add a "no events" timeout in the read loop**

After `gotFirstChunk = true`, add a secondary timeout: if no actual SSE event with a `data:` line is received within 30 seconds, log a warning and yield an error event.

```dart
// Add after the gotFirstChunk = true line:
DateTime firstChunkTime = DateTime.now();
bool gotFirstEvent = false;

// Inside the while loop, after parsing events:
if (!gotFirstEvent) {
  final elapsed = DateTime.now().difference(firstChunkTime);
  if (elapsed.inSeconds > 30) {
    debugPrint('⚠️ [SSE] no events received in 30s after first chunk, aborting');
    yield {'type': 'error', 'message': 'AI响应超时，请稍后重试'};
    return;
  }
}
```

Set `gotFirstEvent = true` when the first event with `dataLine != null` is successfully parsed.

**Step 3: Rebuild and deploy**

```bash
cd src/frontend
flutter build web
# Rename main.dart.js → main.dart.v202607141100.js
# Update flutter_bootstrap.js reference
```

---

### Task 3: Add stream-level timeout in ChatSessionProvider

**Objective:** Add a safety timeout in the provider's `await for` loop so the user is never stuck waiting forever.

**Files:**
- Modify: `src/frontend/lib/providers/chat_session_provider.dart`

**Step 1: Add a 60-second total stream timeout**

In `sendMessage()`, after creating the stream (line 552), wrap the `await for` in a timeout:

```dart
final stream = _apiService.sendAIChatMessageStream(
  trimmed,
  childId: _childId,
  sessionId: sessionUuid,
).timeout(
  const Duration(seconds: 60),
  onTimeout: (sink) {
    sink.add({'type': 'error', 'message': 'AI响应超时（60秒），请稍后重试~'});
    sink.close();
  },
);
```

This ensures that even if the SSE stream hangs completely, the user gets an error message within 60 seconds.

**Step 2: Add debugPrint for each event received**

```dart
await for (final event in stream) {
  final type = event['type'] as String?;
  debugPrint('🔍 [ChatProvider] event received: type=$type');
  // ... existing handling ...
}
```

**Step 3: Add debugPrint in the catch block**

```dart
} catch (e) {
  debugPrint('⚠️ [ChatProvider] SSE stream error: $e, falling back to non-streaming');
  // ... existing fallback ...
}
```

---

### Task 4: Add backend-side logging for SSE stream events

**Objective:** Add server-side logging to see if events are being generated and sent.

**Files:**
- Modify: `src/backend/src/modules/ai/ai.controller.ts` — Add logging in `chatStreamPost()`
- Modify: `src/backend/src/modules/ai/ai.service.ts` — Add logging in `chatStream()` and `executeRoutedChatStream()`

**Step 1: Add logging in chatStreamPost controller**

```typescript
// In chatStreamPost, before the for await loop:
this.logger.log(`SSE stream starting for viewer=${viewerId}, child=${targetChildId}, message="${message.substring(0, 50)}..."`);

// In the for await loop, for each event type:
this.logger.debug(`SSE event: type=${event.type}, content=${event.content?.substring(0, 50)}`);

// After the loop:
this.logger.log(`SSE stream completed for viewer=${viewerId}`);
```

**Step 2: Add logging in ai.service.ts chatStream**

```typescript
// At the start of chatStream:
this.logger.log(`chatStream called: viewerId=${viewerId}, viewerType=${viewerType}, message="${message.substring(0, 50)}..."`);

// Before calling executeRoutedChatStream:
this.logger.log(`Starting routed chat stream: sessionId=${session.uuid}, ageGroup=${ageGroup}`);

// After the for await loop:
this.logger.log(`chatStream done: ${finalReply.length} chars`);
```

**Step 3: Add logging in executeRoutedChatStream**

```typescript
// Log which path is taken:
this.logger.log(`executeRoutedChatStream: using ${this.frameworkOrchestrator ? 'framework' : 'legacy'} executor`);

// Log each event yielded:
// (inside the for await loop)
this.logger.debug(`yielding event: type=${event.type}`);
```

**Step 4: Restart backend and test**

```bash
systemctl --user restart lingxi-backend.service
journalctl --user -u lingxi-backend -f | grep -E 'SSE|chatStream|executeRouted'
```

---

### Task 5: Add "AI正在思考..." progress indicator

**Objective:** Give the user visual feedback that the AI is processing, so the page doesn't appear "blank" during long waits.

**Files:**
- Modify: `src/frontend/lib/providers/chat_session_provider.dart` — Add a timer to update the placeholder message
- Modify: `src/frontend/lib/screens/ai_chat_screen.dart` — Show progress text in the typing indicator

**Step 1: Add a thinking timer in ChatSessionProvider.sendMessage**

After adding the AI placeholder (line 536), start a timer that updates the displayText with progress messages:

```dart
// After adding aiMsg placeholder:
Timer? thinkingTimer;
int thinkingSeconds = 0;
thinkingTimer = Timer.periodic(const Duration(seconds: 3), (timer) {
  thinkingSeconds += 3;
  if (aiMsg.isStreaming && aiMsg.displayText!.isEmpty) {
    final messages = [
      '🦄 正在思考...',
      '🦄 想得更仔细一些...',
      '🦄 马上就好...',
      '🦄 让我想想...',
    ];
    aiMsg.displayText = messages[(thinkingSeconds ~/ 3 - 1) % messages.length];
    notifyListeners();
  } else {
    timer.cancel();
  }
});
```

Remember to cancel the timer when the first token is received:

```dart
// In the token handler:
if (fullReply.isEmpty) {
  thinkingTimer?.cancel();
  debugPrint('🔍 [ChatProvider] first token received: "$chunk"');
}
```

And in the finally / done / error paths:
```dart
thinkingTimer?.cancel();
```

---

### Task 6: Verify and improve the non-streaming fallback

**Objective:** Ensure the fallback path actually works and provides feedback to the user.

**Files:**
- Modify: `src/frontend/lib/services/sse_adapter_web.dart` — Improve fallback with logging and timeout

**Step 1: Add debugPrint to the fallback path**

In `_nonStreamingFallback()`:
```dart
debugPrint('🔍 [SSE] fallback: POST to $nonStreamUrl');
// ... after response ...
debugPrint('🔍 [SSE] fallback response: status=${response.statusCode}, hasContent=${content.isNotEmpty}');
```

**Step 2: Add a shorter timeout to the fallback**

The current fallback has `receiveTimeout: Duration(minutes: 5)`. Reduce to 30 seconds:

```dart
options: Options(
  headers: headers,
  receiveTimeout: const Duration(seconds: 30),
),
```

**Step 3: Ensure the fallback URL is correct**

The current code does `url.replaceAll('/chat/stream', '/chat')`. The URL is `$baseUrl/ai/chat/stream` = `/api/ai/chat/stream`. After replaceAll, it becomes `/api/ai/chat`. But `dio.post` needs the full URL (since dio is configured with `baseUrl: getApiBaseUrl()` which is `/api` for web). So the URL should be just `/ai/chat`, not `/api/ai/chat`.

Actually wait — `dio` is configured with `baseUrl: getApiBaseUrl()` which is `/api`. And the `url` parameter is `$baseUrl/ai/chat/stream` = `/api/ai/chat/stream`. After `replaceAll('/chat/stream', '/chat')`, it becomes `/api/ai/chat`. But since dio's baseUrl is already `/api`, the final URL would be `/api/api/ai/chat` — a double prefix!

**This is a bug!** The fallback URL has a double `/api` prefix.

Verify: In `sendAIChatMessageStream()`:
```dart
final url = kIsWeb
    ? '$baseUrl/ai/chat/stream'  // = '/api/ai/chat/stream'
    : '/ai/chat/stream';           // = '/ai/chat/stream'
```

In `_nonStreamingFallback()`:
```dart
final nonStreamUrl = url.replaceAll('/chat/stream', '/chat');
// For web: '/api/ai/chat/stream'.replaceAll('/chat/stream', '/chat') = '/api/ai/chat'
// Then dio.post('/api/ai/chat') with baseUrl='/api' → '/api/api/ai/chat' ← WRONG!
```

**Fix:** Strip the baseUrl prefix before passing to dio:

```dart
final nonStreamUrl = url
    .replaceAll('/chat/stream', '/chat')
    .replaceAll('$baseUrl', '');  // Remove the baseUrl prefix for dio
// For web: '/api/ai/chat' → '/ai/chat' (dio adds '/api' prefix)
// For non-web: '/ai/chat' (no change, dio adds baseUrl if configured)
```

Or more simply, since dio already has the baseUrl configured:
```dart
// For web, url = '/api/ai/chat/stream', but dio baseUrl = '/api'
// We need just '/ai/chat' for dio
final nonStreamUrl = '/ai/chat';  // Always relative to dio's baseUrl
```

But wait — on web, dio is not used for the fetch SSE (the fetch uses the full URL). The fallback uses `dio.post(nonStreamUrl)`. Dio's baseUrl for web is `/api`. So `dio.post('/ai/chat')` would resolve to `/api/ai/chat`. That's correct!

But the current code passes `url.replaceAll('/chat/stream', '/chat')` which is `/api/ai/chat`. Dio would resolve this to `/api/api/ai/chat`. **This is the bug!**

**Fix the fallback URL:**

```dart
final nonStreamUrl = url.replaceAll('/chat/stream', '/chat').replaceFirst(baseUrl, '');
// Or simply:
final nonStreamUrl = '/ai/chat';
```

---

### Task 7: Build, deploy, and test end-to-end

**Objective:** Deploy the fixes and verify the chat works.

**Step 1: Build Flutter Web**

```bash
cd /home/zxq/ai-growth-companion/src/frontend
export PUB_HOSTED_URL=https://pub.flutter-io.cn
export FLUTTER_STORAGE_BASE_URL=https://storage.flutter-io.cn
~/flutter/bin/flutter build web --release
```

**Step 2: Cache-bust the JS file**

```bash
# In src/frontend/build/web/
cp main.dart.js main.dart.v202607141100.js
# Update flutter_bootstrap.js to reference the new version
# Delete old main.dart.v202607141000.js
```

**Step 3: Restart backend**

```bash
systemctl --user restart lingxi-backend.service
```

**Step 4: Test on phone Safari**

Open `https://lingxi.chataifree.eu.org/`, navigate to AI chat, send a message. Check:
- User message appears immediately
- Typing indicator shows in AI bubble
- After 3s, "🦄 正在思考..." appears
- Within 15s, AI response starts streaming
- If no response in 60s, error message appears
- Console shows full diagnostic log

**Step 5: Check backend logs**

```bash
journalctl --user -u lingxi-backend --since "5 min ago" | grep -E 'SSE|chatStream|executeRouted|LLM'
```

---

## Risks & Tradeoffs

1. **debugPrint in release builds** — `debugPrint` works in release builds on Flutter Web (it calls `print` which goes to console.log). But it adds a small overhead per message. The volume is low (a few lines per chat message), so this is acceptable.

2. **60-second stream timeout** — If the LLM legitimately takes >60s for a complex response, the timeout would cut it off. But 60s is already very long for a children's chatbot; better to show an error and let the user retry.

3. **Fallback URL fix** — The `replaceAll` approach is fragile. Better to use a fixed `/ai/chat` path. But need to verify this works for both web and non-web platforms.

4. **Thinking timer** — The timer updates `displayText` which might interfere with the streaming token display. Need to ensure the timer is cancelled before the first token arrives.

5. **CF HTTP/2 buffering** — This is a known, recurring issue. The heartbeat fix helps, but CF may still buffer. The timeout is the ultimate safeguard.

## Open Questions

1. Is the LLM API (`openclaw.sany.com.cn`) actually responding? Task 1 will answer this.
2. Is the fallback URL double-prefix bug actually causing the fallback to fail? If so, fixing it (Task 6) would make the fallback work, giving users a response even when SSE fails.
3. Is the "blank" page actually missing the user message, or is it just missing the AI response? The screenshot suggests the former, but the console log suggests messages are in the list. Need to verify with the diagnostic logging.
