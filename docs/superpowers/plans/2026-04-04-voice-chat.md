# Voice Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add voice input (STT via Web Speech API) and voice output (TTS via Edge-TTS) to the AI Chat component.

**Architecture:** Backend integrates `@andresaya/edge-tts` npm package to stream MP3 audio from Microsoft Edge TTS service. Frontend uses browser-native `webkitSpeechRecognition` for voice input and HTML5 `Audio` API for playback. Two playback modes: per-message manual play and auto-read toggle.

**Tech Stack:** @andresaya/edge-tts (backend TTS), Web Speech API (frontend STT), HTML5 Audio API (playback), lucide-react icons (Mic, Volume2, VolumeX)

---

### Task 1: Install Edge-TTS and Update Backend TTS Endpoint

**Files:**
- Modify: `src/backend/package.json` (add dependency)
- Modify: `src/backend/src/modules/voice/voice.service.ts` (real TTS)
- Modify: `src/backend/src/modules/voice/voice.controller.ts` (stream audio)

- [ ] **Step 1: Install edge-tts package**

Run:
```bash
cd src/backend && npm install @andresaya/edge-tts
```

Expected: Package added to `package.json` dependencies.

- [ ] **Step 2: Rewrite VoiceService with real Edge-TTS**

Replace the entire content of `src/backend/src/modules/voice/voice.service.ts` with:

```typescript
import { Injectable } from '@nestjs/common';
import { EdgeTTS } from '@andresaya/edge-tts';

@Injectable()
export class VoiceService {
  /**
   * 文字转语音 - 使用 Edge-TTS
   * 返回 MP3 音频 Buffer
   */
  async textToSpeech(text: string, voice: string = 'zh-CN-XiaoxiaoNeural'): Promise<Buffer> {
    const tts = new EdgeTTS();
    await tts.synthesize(text, voice, {
      outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
    });
    return tts.toBuffer();
  }

  // ============ 以下保留原有功能，TTS 部分改用 Edge-TTS ============

  async speechToText(audioUrl: string) {
    return '模拟识别结果：你好';
  }

  async voiceChat(userId: number, audioUrl: string) {
    const text = await this.speechToText(audioUrl);
    const intent = this.parseIntent(text);
    const reply = this.generateReply(intent, text);
    const audioBuffer = await this.textToSpeech(reply.text);
    return {
      query: text,
      intent,
      reply: reply.text,
      suggestions: reply.suggestions,
      audioBuffer: audioBuffer.toString('base64'),
      duration: Math.ceil(reply.text.length / 3),
    };
  }

  async generateStory(userId: number, theme: string, ageRange: string) {
    const storyLength = ageRange === '3-4' ? '短' : '中';
    const story = this.generateStoryContent(theme, storyLength);
    const audioBuffer = await this.textToSpeech(story.content);
    return {
      title: story.title,
      content: story.content,
      duration: Math.ceil(story.content.length / 3),
      audioBuffer: audioBuffer.toString('base64'),
      keywords: story.keywords,
    };
  }

  async getNurseryRhyme(rhymeId?: string) {
    const rhymes = [
      { id: '1', title: '小星星', content: '一闪一闪亮晶晶，满天都是小星星。挂在天上放光明，好像许多小眼睛。', emoji: '⭐' },
      { id: '2', title: '小白船', content: '蓝蓝的天空银河里，有只小白船。船上有棵桂花树，白兔在游玩。', emoji: '🌙' },
      { id: '3', title: '小燕子', content: '小燕子穿花衣，年年春天来这里。我问燕子你为啥来，燕子说这里的春天最美丽。', emoji: '🐦' },
      { id: '4', title: '数鸭子', content: '门前大桥下，游过一群鸭。快来快来数一数，二四六七八。', emoji: '🦆' },
      { id: '5', title: '拔萝卜', content: '拔萝卜拔萝卜，嗨哟嗨哟拔不动。老婆婆快来帮我们拔萝卜。', emoji: '🥕' },
    ];

    if (rhymeId) {
      const rhyme = rhymes.find(r => r.id === rhymeId);
      if (rhyme) {
        const buf = await this.textToSpeech(rhyme.content);
        return { ...rhyme, audioBuffer: buf.toString('base64'), duration: Math.ceil(rhyme.content.length / 3) };
      }
    }

    const selected = await Promise.all(rhymes.map(async r => {
      const buf = await this.textToSpeech(r.content);
      return { ...r, audioBuffer: buf.toString('base64'), duration: Math.ceil(r.content.length / 3) };
    }));
    return selected;
  }

  async voiceQuiz(userId: number, question: string) {
    const quizzes = this.getVoiceQuizzes();
    const matched = quizzes.find(q =>
      question.includes(q.keywords[0]) || question.includes(q.keywords[1])
    );

    const reply = matched ? matched.answer : '这个问题真有趣！让我想想怎么回答你...';
    const buf = await this.textToSpeech(reply);
    return {
      question: matched?.question || question,
      answer: reply,
      audioBuffer: buf.toString('base64'),
      duration: Math.ceil(reply.length / 3),
    };
  }

  private parseIntent(text: string): string {
    const intents = [
      { keywords: ['什么', '谁', '哪里', '为什么'], type: 'question' },
      { keywords: ['故事', '讲', '听'], type: 'story' },
      { keywords: ['歌', '唱', '儿歌'], type: 'song' },
      { keywords: ['游戏', '玩'], type: 'game' },
    ];
    for (const intent of intents) {
      if (intent.keywords.some(k => text.includes(k))) return intent.type;
    }
    return 'chat';
  }

  private generateReply(intent: string, text: string) {
    const replies: Record<string, { text: string; suggestions: string[] }> = {
      question: { text: '你问的问题真棒！让我来告诉你...', suggestions: ['给我讲个故事吧', '唱首儿歌', '我们玩游戏'] },
      story: { text: '好的，我来给你讲一个有趣的故事...', suggestions: ['再讲一个', '我想听儿歌', '玩游戏'] },
      song: { text: '让我为你唱一首好听的儿歌...', suggestions: ['小星星', '小白船', '讲故事'] },
      game: { text: '我们来玩一个有趣的游戏吧！', suggestions: ['颜色配对', '数学问答', '找规律'] },
      chat: { text: '和你聊天真开心！', suggestions: ['讲故事', '唱儿歌', '玩游戏'] },
    };
    return replies[intent] || replies.chat;
  }

  private generateStoryContent(theme: string, length: string) {
    const stories: Record<string, { title: string; content: string; keywords: string[] }> = {
      '动物': { title: '小兔子的冒险', content: '有一天，小兔子蹦蹦跳跳地去森林里玩。它遇到了小鸟，小鸟说："你好呀！"小兔子说："你好！"它们一起玩耍，成为了好朋友。天黑了，它们依依不舍地告别，约好明天再来玩。', keywords: ['兔子', '森林', '朋友'] },
      '自然': { title: '春天的故事', content: '春天来了，花儿开了，草儿绿了。小燕子从南方飞回来了。小熊从冬眠中醒来，伸了个懒腰，开心地说："春天真好！"', keywords: ['春天', '花', '燕子'] },
      '亲情': { title: '妈妈的爱', content: '小熊醒来，发现妈妈不在身边。它找呀找，看见妈妈在厨房做饭。妈妈说："快来吃早餐啦！"小熊抱住妈妈说："妈妈，我爱你！"', keywords: ['妈妈', '爱', '早餐'] },
    };
    return stories[theme] || stories['动物'];
  }

  private getVoiceQuizzes() {
    return [
      { keywords: ['狗', '小狗'], question: '小狗怎么叫？', answer: '小狗汪汪叫！' },
      { keywords: ['猫', '小猫'], question: '小猫怎么叫？', answer: '小猫喵喵叫！' },
      { keywords: ['太阳', '白天'], question: '什么时候有太阳？', answer: '白天有太阳！' },
      { keywords: ['月亮', '晚上'], question: '什么时候有月亮？', answer: '晚上有月亮！' },
      { keywords: ['一加一', '1+1'], question: '一加一等于几？', answer: '一加一等于二！' },
    ];
  }
}
```

- [ ] **Step 3: Update VoiceController to stream audio for TTS endpoint**

Replace `src/backend/src/modules/voice/voice.controller.ts` with:

```typescript
import { Controller, Get, Post, Body, Query, UseGuards, Res } from '@nestjs/common';
import { Response } from 'express';
import { VoiceService } from './voice.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('voice')
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  /**
   * 文字转语音 - 返回 MP3 音频流
   */
  @Get('tts')
  async textToSpeech(
    @Query('text') text: string,
    @Query('voice') voice: string = 'zh-CN-XiaoxiaoNeural',
    @Res() res: Response,
  ) {
    if (!text) {
      res.status(400).json({ message: 'text parameter is required' });
      return;
    }

    const audioBuffer = await this.voiceService.textToSpeech(decodeURIComponent(text), voice);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(audioBuffer);
  }

  /**
   * 语音对话
   */
  @UseGuards(JwtAuthGuard)
  @Post('chat')
  async voiceChat(@Body() body: { userId: number; audioUrl: string }) {
    return this.voiceService.voiceChat(body.userId, body.audioUrl);
  }

  /**
   * 生成故事
   */
  @UseGuards(JwtAuthGuard)
  @Get('story')
  async generateStory(
    @Query('userId') userId: string,
    @Query('theme') theme: string = '动物',
    @Query('ageRange') ageRange: string = '3-4',
  ) {
    return this.voiceService.generateStory(+userId, theme, ageRange);
  }

  /**
   * 儿歌列表
   */
  @Get('rhyme')
  async getNurseryRhyme(@Query('id') id?: string) {
    return this.voiceService.getNurseryRhyme(id);
  }

  /**
   * 语音问答
   */
  @UseGuards(JwtAuthGuard)
  @Get('quiz')
  async voiceQuiz(
    @Query('userId') userId: string,
    @Query('question') question: string,
  ) {
    return this.voiceService.voiceQuiz(+userId, decodeURIComponent(question));
  }
}
```

- [ ] **Step 4: Verify backend compiles**

Run:
```bash
cd src/backend && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit backend changes**

```bash
git add src/backend/package.json src/backend/package-lock.json src/backend/src/modules/voice/voice.service.ts src/backend/src/modules/voice/voice.controller.ts
git commit -m "feat: integrate Edge-TTS for real text-to-speech audio streaming"
```

---

### Task 2: Add Voice-Related CSS Animations

**Files:**
- Modify: `src/frontend-web/src/index.css` (add animations)

- [ ] **Step 1: Add voice pulse and sound wave animations**

In `src/frontend-web/src/index.css`, append the following after the existing `animate-gentle-float` utility (after line 106):

```css
@keyframes voice-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(var(--color-tertiary), 0.4); }
  70%  { box-shadow: 0 0 0 10px rgba(88, 96, 0, 0); }
  100% { box-shadow: 0 0 0 0 rgba(88, 96, 0, 0); }
}

@keyframes sound-bar {
  0%, 100% { height: 3px; }
  50%      { height: 12px; }
}

@utility animate-voice-pulse {
  animation: voice-pulse 1.5s ease-in-out infinite;
}

@utility animate-sound-bar {
  animation: sound-bar 0.6s ease-in-out infinite;
}
```

- [ ] **Step 2: Verify frontend builds**

Run:
```bash
cd src/frontend-web && npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/frontend-web/src/index.css
git commit -m "feat: add voice pulse and sound wave CSS animations"
```

---

### Task 3: Update API Service for TTS Audio URL

**Files:**
- Modify: `src/frontend-web/src/services/api.ts` (update getTTSUrl)

- [ ] **Step 1: Update getTTSUrl to support voice parameter**

In `src/frontend-web/src/services/api.ts`, replace the existing `getTTSUrl` method (lines 256-258):

```typescript
  // Voice TTS - returns audio stream URL
  getTTSUrl(text: string, voice: string = 'zh-CN-XiaoxiaoNeural'): string {
    return `${API_BASE_URL}/voice/tts?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(voice)}`;
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/frontend-web/src/services/api.ts
git commit -m "feat: update TTS URL builder with voice parameter"
```

---

### Task 4: Add Voice Input (STT) and Voice Output (TTS) to AIChat

**Files:**
- Modify: `src/frontend-web/src/components/AIChat.tsx`

This is the main task. We add:
1. A `useVoicePlayback` hook for TTS playback management
2. A microphone button in the input area for STT
3. A speaker button per AI message for manual TTS playback
4. An auto-read toggle in the chat header
5. Sound wave animation when audio is playing

- [ ] **Step 1: Add new imports**

In `src/frontend-web/src/components/AIChat.tsx`, replace line 3 (the lucide-react import):

```typescript
import { MessageCircle, X, Send, Loader2, Bot, User, ChevronDown, ChevronRight, Brain, Wrench, Maximize2, Minimize2, GripVertical, ArrowLeft, Play, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
```

- [ ] **Step 2: Add voice playback hook after the AIChatProps interface (after line 49)**

Insert before `export default function AIChat`:

```typescript
/** Hook to manage TTS audio playback across messages */
function useVoicePlayback() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);

  const play = useCallback((msgId: string, text: string) => {
    // Strip markdown for TTS - remove *, #, `, [], ()
    const plainText = text
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[([^\]]*)\]\(.*?\)/g, '$1')
      .replace(/[#*`_~>|]/g, '')
      .replace(/\n+/g, '。')
      .trim()
      .slice(0, 2000);
    if (!plainText) return;

    // Stop current audio if playing
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    const audio = new Audio(api.getTTSUrl(plainText));
    audioRef.current = audio;
    setPlayingMsgId(msgId);

    audio.onended = () => { setPlayingMsgId(null); audioRef.current = null; };
    audio.onerror = () => { setPlayingMsgId(null); audioRef.current = null; };
    audio.play().catch(() => { setPlayingMsgId(null); audioRef.current = null; });
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingMsgId(null);
  }, []);

  const toggle = useCallback((msgId: string, text: string) => {
    if (playingMsgId === msgId) {
      stop();
    } else {
      play(msgId, text);
    }
  }, [playingMsgId, play, stop]);

  return { playingMsgId, play, stop, toggle };
}
```

- [ ] **Step 3: Add voice state variables inside AIChat component**

After line 62 (`const [activityFeedback, setActivityFeedback]...`), add:

```typescript
  const [isRecording, setIsRecording] = useState(false);
  const [autoRead, setAutoRead] = useState(false);
  const { playingMsgId, play: playMessage, stop: stopPlayback, toggle: togglePlayback } = useVoicePlayback();
  const recognitionRef = useRef<any>(null);
```

- [ ] **Step 4: Add STT (speech-to-text) handler**

After the `handleKeyDown` function (after line 236), add:

```typescript
  const handleToggleRecording = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setIsRecording(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
    };

    recognition.onend = () => {
      setIsRecording(false);
      recognitionRef.current = null;
    };

    recognition.onerror = () => {
      setIsRecording(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, [isRecording]);
```

- [ ] **Step 5: Add auto-read effect for new AI messages**

After the STT handler, add:

```typescript
  // Auto-read: when a new assistant message finishes streaming, play it
  useEffect(() => {
    if (!autoRead) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'assistant' && !lastMsg.isStreaming && !lastMsg.gameData?.parsed && lastMsg.content) {
      playMessage(lastMsg.id, lastMsg.content);
    }
  }, [messages, autoRead, playMessage]);
```

- [ ] **Step 6: Add speaker button component helper**

Add this function before `export default function AIChat`:

```typescript
/** Speaker button for AI message bubbles */
function SpeakerButton({ msgId, content, playingMsgId, onToggle }: {
  msgId: string; content: string; playingMsgId: string | null; onToggle: (id: string, text: string) => void;
}) {
  const isPlaying = playingMsgId === msgId;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(msgId, content); }}
      className={cn(
        "mt-1.5 flex items-center gap-1 text-xs transition-colors",
        isPlaying ? "text-primary" : "text-on-surface-variant/60 hover:text-on-surface-variant"
      )}
      aria-label={isPlaying ? '停止播放' : '播放语音'}
    >
      {isPlaying ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
      {isPlaying && (
        <span className="flex items-center gap-0.5 h-3">
          <span className="w-0.5 bg-primary rounded-full animate-sound-bar" style={{ animationDelay: '0ms' }} />
          <span className="w-0.5 bg-primary rounded-full animate-sound-bar" style={{ animationDelay: '150ms' }} />
          <span className="w-0.5 bg-primary rounded-full animate-sound-bar" style={{ animationDelay: '300ms' }} />
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 7: Add mic button to FULL-PAGE input area**

In the full-page mode input area (around line 383-394), replace the input `<div className="flex gap-2">` block with:

```tsx
          <div className="flex gap-2 items-center">
            {(typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) && (
              <button onClick={handleToggleRecording}
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center transition-colors tactile-press",
                  isRecording ? "bg-red-500 text-white animate-voice-pulse" : "bg-surface-container text-on-surface-variant hover:text-on-surface"
                )}
                aria-label={isRecording ? '停止录音' : '开始录音'}>
                {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
            )}
            <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown} placeholder={isRecording ? "正在听你说..." : "输入你的问题..."}
              className="flex-1 bg-surface-container border border-outline-variant/30 rounded-full px-4 py-2.5 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 transition-colors"
              disabled={isLoading} />
            <button onClick={() => handleSendStream()} disabled={!input.trim() || isLoading}
              className="w-10 h-10 bg-tertiary rounded-full flex items-center justify-center text-white disabled:opacity-50 disabled:cursor-not-allowed tactile-press">
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
```

- [ ] **Step 8: Add mic button to FLOATING WIDGET input area**

In the floating widget input area (around line 601-612), replace the input `<div className="flex gap-2">` block with:

```tsx
            <div className="flex gap-2 items-center">
              {(typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) && (
                <button onClick={handleToggleRecording}
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center transition-colors tactile-press flex-shrink-0",
                    isRecording ? "bg-red-500 text-white animate-voice-pulse" : "bg-surface-container text-on-surface-variant hover:text-on-surface"
                  )}
                  aria-label={isRecording ? '停止录音' : '开始录音'}>
                  {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              )}
              <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown} placeholder={isRecording ? "正在听你说..." : "输入你的问题..."}
                className="flex-1 bg-surface-container border border-outline-variant/30 rounded-full px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 transition-colors"
                disabled={isLoading} />
              <button onClick={() => handleSendStream()} disabled={!input.trim() || isLoading}
                className="w-9 h-9 bg-tertiary rounded-full flex items-center justify-center text-white disabled:opacity-50 disabled:cursor-not-allowed tactile-press flex-shrink-0">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
```

- [ ] **Step 9: Add auto-read toggle to FULL-PAGE header**

In the full-page header (around line 280-293), after the `<h3>` and subtitle `<p>`, add the auto-read toggle before the closing `</div>` of the header flex container. Replace the full header block:

```tsx
        <div className="bg-tertiary px-5 py-4 flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} aria-label="返回" className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-white font-bold text-lg">AI 学习伙伴</h3>
            <p className="text-white/70 text-xs">随时为你解答问题</p>
          </div>
          <button
            onClick={() => { setAutoRead(!autoRead); if (autoRead) stopPlayback(); }}
            className={cn(
              "w-9 h-9 rounded-full flex items-center justify-center transition-colors",
              autoRead ? "bg-white/30 text-white" : "bg-white/10 text-white/60 hover:text-white"
            )}
            aria-label={autoRead ? '关闭自动朗读' : '开启自动朗读'}
            title={autoRead ? '关闭自动朗读' : '开启自动朗读'}
          >
            <Volume2 className="w-5 h-5" />
          </button>
        </div>
```

- [ ] **Step 10: Add auto-read toggle to FLOATING WIDGET header**

In the floating widget header (around line 481-502), add auto-read toggle button. Replace the header `<div>` contents:

After `<div className="flex items-center gap-1">` (the right-side buttons area, before the maximize button), add:

```tsx
                <button onClick={() => { setAutoRead(!autoRead); if (autoRead) stopPlayback(); }}
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center transition-colors",
                    autoRead ? "bg-white/30 text-white" : "bg-white/10 text-white/60 hover:text-white"
                  )}
                  aria-label={autoRead ? '关闭自动朗读' : '开启自动朗读'}>
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
```

- [ ] **Step 11: Add SpeakerButton to AI message bubbles in FULL-PAGE mode**

In the full-page message rendering, after the message bubble closing `</div>` and before the game rendering section (around line 325), add a speaker button for assistant messages. Find the section that renders assistant message content and add after the bubble `</div>`:

```tsx
                {/* TTS speaker button for assistant messages */}
                {message.role === 'assistant' && !message.gameData?.parsed && message.content && !message.isStreaming && (
                  <SpeakerButton msgId={message.id} content={message.content} playingMsgId={playingMsgId} onToggle={togglePlayback} />
                )}
```

This goes right after the message bubble `</div>` (the one with `bg-surface-container`) and before the game rendering `{/* Game rendering */}` comment.

- [ ] **Step 12: Add SpeakerButton to AI message bubbles in FLOATING WIDGET mode**

Same as Step 11 but in the floating widget message rendering section. Add the same speaker button block after the message bubble `</div>` and before the game rendering:

```tsx
                {/* TTS speaker button for assistant messages */}
                {message.role === 'assistant' && !message.gameData?.parsed && message.content && !message.isStreaming && (
                  <SpeakerButton msgId={message.id} content={message.content} playingMsgId={playingMsgId} onToggle={togglePlayback} />
                )}
```

- [ ] **Step 13: Verify frontend builds**

Run:
```bash
cd src/frontend-web && npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 14: Commit**

```bash
git add src/frontend-web/src/components/AIChat.tsx
git commit -m "feat: add voice input (STT) and voice output (TTS) to AI chat"
```

---

### Task 5: End-to-End Verification

- [ ] **Step 1: Start backend**

Run:
```bash
cd src/backend && npm run start:dev
```

Expected: Server starts on port 3000.

- [ ] **Step 2: Test TTS endpoint**

Run:
```bash
curl -o test_tts.mp3 "http://localhost:3000/api/voice/tts?text=你好，小朋友！&voice=zh-CN-XiaoxiaoNeural"
```

Expected: `test_tts.mp3` file is created, non-zero size, playable MP3 audio.

- [ ] **Step 3: Start frontend**

Run:
```bash
cd src/frontend-web && npm run dev
```

Expected: Vite dev server starts on port 5173.

- [ ] **Step 4: Manual browser test**

1. Open `http://localhost:5173` in Chrome
2. Log in with test account `13800000001` / `password123`
3. Open the AI chat (floating widget or companion mode)
4. **Test STT:** Click the microphone button, speak in Chinese, verify text appears in input
5. **Test TTS manual:** Send a message, click the speaker icon on the AI reply, verify audio plays
6. **Test TTS auto-read:** Click the Volume2 toggle in the header, send another message, verify it auto-plays
7. **Test stop:** Click the speaker icon again during playback to stop

- [ ] **Step 5: Cleanup test file**

```bash
rm -f test_tts.mp3
```
