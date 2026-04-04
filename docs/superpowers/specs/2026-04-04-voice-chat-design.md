# AI Chat Voice Input/Output Design

## Overview

Add voice input (STT) and voice output (TTS) to the AI Chat component, enabling children to speak to the AI companion and hear responses read aloud.

## Technology Stack

| Feature | Technology | Why |
|---------|-----------|-----|
| STT (Speech-to-Text) | Browser `webkitSpeechRecognition` | Free, real-time, good Chinese support, zero backend cost |
| TTS (Text-to-Speech) | Edge-TTS via backend | High-quality Chinese voices (near-human), free, stable |

## Backend Changes

### VoiceService Refactor (`src/backend/src/modules/voice/voice.service.ts`)

Replace the simulated TTS stub with real Edge-TTS integration:

- Install `edge-tts` npm package (Node.js native wrapper for Microsoft Edge TTS, no Python dependency)
- `textToSpeech(text, voice)` streams MP3 audio back instead of returning a fake URL
- Default voice: `zh-CN-XiaoxiaoNeural` (warm, child-friendly)
- Alternative voices: `zh-CN-XiaoyiNeural` (lively, for ages 3-4), `zh-CN-YunyangNeural` (calm narrator)

### VoiceController Update (`src/backend/src/modules/voice/voice.controller.ts`)

- `GET /voice/tts` endpoint returns audio stream (`Content-Type: audio/mpeg`) instead of JSON
- Query params: `text` (required), `voice` (optional, defaults to `zh-CN-XiaoxiaoNeural`)
- Add streaming headers for progressive playback

## Frontend Changes

### Voice Input — STT Microphone Button

Location: Inside the chat input area, left side of the text input.

Behavior:
1. User clicks microphone icon to start recording
2. Pulsing animation indicates active recording state
3. `webkitSpeechRecognition` with `lang: 'zh-CN'`, `continuous: false`, `interimResults: true`
4. Interim results show in the input field as user speaks (real-time preview)
5. Final result replaces input field content — user can edit before sending
6. 60-second timeout auto-stops recording
7. Second click or timeout stops recording

Fallback: If `webkitSpeechRecognition` is unavailable, hide the microphone button and show a tooltip saying the browser doesn't support voice input.

### Voice Output — TTS Playback

Two modes:

**Manual mode (default):**
- Each AI message shows a speaker icon (bottom-right of message bubble)
- Click to play that message's text via TTS
- Click again to stop playback
- Currently playing message shows a sound-wave animation

**Auto-read mode (toggle):**
- Toggle switch in the chat header toolbar (speaker icon with "A" badge)
- When enabled, every new AI response automatically plays via TTS
- New message interrupts previous audio (no queuing)
- User can click stop on any message to halt auto-read

Playback implementation:
- Create audio via `new Audio(api.getTTSUrl(text, voice))`
- Play/pause/stop controlled via Audio API
- Track currently playing message ID to show animation state

### UI Elements

1. **Microphone button** — input area left side, mic icon with pulse animation when active
2. **Speaker button** — per-message, bottom-right of AI message bubbles, small icon
3. **Auto-read toggle** — chat header toolbar, compact toggle with speaker icon
4. **Sound wave animation** — CSS keyframe animation on the speaker icon when playing

### New CSS (`src/frontend-web/src/index.css`)

- `@keyframes voice-pulse` — pulsing circle for active microphone
- `@keyframes sound-wave` — animated bars for playing state
- Utility classes: `animate-voice-pulse`, `animate-sound-wave`

## Data Flow

### Voice Input Flow
```
User clicks mic → webkitSpeechRecognition starts →
interim results shown in input → final result fills input →
user edits (optional) → user sends → existing chat flow
```

### Voice Output Flow
```
AI response arrives → (if auto-read) automatically / (if manual) user clicks speaker →
GET /voice/tts?text=...&voice=... → backend Edge-TTS streams MP3 →
frontend Audio plays → animation on message → playback ends / user stops
```

## Edge Cases

- **Browser compatibility:** Hide mic button if `webkitSpeechRecognition` not available
- **Long messages:** TTS handles up to ~5000 chars per request; longer messages can be split or truncated
- **Network failure:** Show toast error if TTS request fails, fall back to text-only
- **Multiple messages playing:** Only one audio at a time — new play stops previous
- **Game data messages:** Messages with `gameData` should not auto-read (they launch games, not text)

## Files to Modify

| File | Change |
|------|--------|
| `src/backend/src/modules/voice/voice.service.ts` | Replace stub TTS with Edge-TTS |
| `src/backend/src/modules/voice/voice.controller.ts` | Stream audio response |
| `src/backend/package.json` | Add edge-tts dependency |
| `src/frontend-web/src/components/AIChat.tsx` | Add mic button, speaker buttons, auto-read toggle, audio playback logic |
| `src/frontend-web/src/services/api.ts` | Update `getTTSUrl` to return audio stream URL |
| `src/frontend-web/src/index.css` | Add voice-related animations |

## Out of Scope

- Real STT backend (e.g., cloud ASR) — browser API is sufficient
- Voice cloning or custom voice training
- Audio recording and storage
- Voice commands (e.g., "navigate to...")
- Multi-language TTS (Chinese only for now)
