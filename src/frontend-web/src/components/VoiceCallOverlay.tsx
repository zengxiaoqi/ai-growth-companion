import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, Bot } from '@/icons';
import { cn } from '@/lib/utils';
import api from '@/services/api';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export interface VoiceCallTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface VoiceCallOverlayProps {
  open: boolean;
  onClose: () => void;
  /** 挂断时回传整段通话记录（写回聊天消息） */
  onEnd?: (turns: VoiceCallTurn[]) => void;
  childId?: number;
  parentId?: number;
  sessionId?: string;
  avatarSrc?: string;
}

type CallPhase = 'connecting' | 'listening' | 'thinking' | 'speaking' | 'muted' | 'error';

const GREETING = '喂？我在呢！今天有什么好玩的事呀，快说给我听听～';

const PHASE_TEXT: Record<CallPhase, string> = {
  connecting: '正在接通…',
  listening: '正在聆听…',
  thinking: '对方思考中…',
  speaking: '对方正在说话…',
  muted: '已静音',
  error: '麦克风不可用，请检查权限',
};

/**
 * 豆包式语音通话界面：连续「听 → 识别 → AI 短回复(casual) → TTS 播报」循环。
 * - 语音识别用浏览器 Web Speech API（Chrome 走 Google 服务、Edge 走微软服务）
 * - TTS 走后端 Edge TTS（/voice/tts 返回 MP3）
 * - AI 回复固定走碎碎念(casual)模式：1~2 句口语短句，适合语音来回
 * - 识别失败(网络/权限)会在界面明示，并提供打字兜底输入
 */
export function VoiceCallOverlay({
  open,
  onClose,
  onEnd,
  childId,
  parentId,
  sessionId,
  avatarSrc,
}: VoiceCallOverlayProps) {
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<CallPhase>('connecting');
  const [muted, setMuted] = useState(false);
  const [turns, setTurns] = useState<VoiceCallTurn[]>([]);
  const [interim, setInterim] = useState('');
  const [elapsed, setElapsed] = useState(0);
  /** 识别服务连续失败提示（网络不通/浏览器不支持） */
  const [asrIssue, setAsrIssue] = useState<string | null>(null);
  const [typedText, setTypedText] = useState('');
  /** 实时麦克风输入电平 0~1（诊断「收不到语音」用） */
  const [micLevel, setMicLevel] = useState(0);

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeRef = useRef(false);
  const mutedRef = useRef(false);
  const utteranceBufRef = useRef('');
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnsRef = useRef<VoiceCallTurn[]>([]);
  const sessionIdRef = useRef(sessionId);
  const networkFailRef = useRef(0);
  const asrPausedRef = useRef(false);
  // 麦克风诊断
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const micLevelRef = useRef(0);
  const lastVoiceAtRef = useRef(0);
  const listeningSinceRef = useRef(0);
  const lastResultAtRef = useRef(0);
  const engineStateRef = useRef<'off' | 'starting' | 'on'>('off');
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceHintRef = useRef(false);

  const pushTurn = useCallback((turn: VoiceCallTurn) => {
    turnsRef.current = [...turnsRef.current, turn];
    setTurns(turnsRef.current);
  }, []);

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.onended = null;
      try {
        audioRef.current.pause();
        audioRef.current.src = '';
      } catch {
        // ignore
      }
      audioRef.current = null;
    }
  }, []);

  const stopMicMonitor = useCallback(() => {
    if (micTimerRef.current) {
      clearInterval(micTimerRef.current);
      micTimerRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch {
        // ignore
      }
      audioCtxRef.current = null;
    }
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    micLevelRef.current = 0;
    setMicLevel(0);
  }, []);

  /**
   * 打开独立于识别引擎的麦克风电平监测：
   * 音量条不动 = 系统层就没采到声音（设备/静音/被占用）；
   * 音量条动但无识别结果 = 声音进来了，是识别引擎/服务的问题。
   */
  const startMicMonitor = useCallback(async () => {
    stopMicMonitor();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      micTimerRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        const level = Math.min(1, rms * 4);
        micLevelRef.current = level;
        setMicLevel(level);
        if (level > 0.08) {
          lastVoiceAtRef.current = Date.now();
          if (silenceHintRef.current) {
            silenceHintRef.current = false;
            setAsrIssue(null);
          }
        }
      }, 200);
    } catch {
      setAsrIssue('无法读取麦克风音频：请检查系统录音输入设备，或是否被其他程序占用');
    }
  }, [stopMicMonitor]);

  /** 开始一轮对话：发送用户语音转写，拿 casual 短回复并播报 */
  const runTurn = useCallback(
    async (text: string) => {
      if (!activeRef.current || !text.trim()) return;
      stopRecognition();
      setInterim('');
      pushTurn({ role: 'user', content: text.trim() });
      setPhase('thinking');

      let reply = '';
      try {
        const response = await api.sendChatMessageStream({
          message: text.trim(),
          childId,
          parentId,
          sessionId: sessionIdRef.current,
          mode: 'casual',
        });
        if (!response.ok || !response.body) throw new Error('stream failed');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done || !activeRef.current) break;
          buffer += decoder.decode(value, { stream: true });
          while (true) {
            const eventEnd = buffer.indexOf('\n\n');
            if (eventEnd === -1) break;
            const eventBlock = buffer.slice(0, eventEnd);
            buffer = buffer.slice(eventEnd + 2);
            let currentEvent = '';
            let dataStr = '';
            for (const line of eventBlock.split('\n')) {
              const trimmed = line.replace(/\r$/, '');
              if (trimmed.startsWith('event:')) currentEvent = trimmed.slice(6).trim();
              else if (trimmed.startsWith('data:')) dataStr = trimmed.slice(5).trim();
            }
            if (!dataStr) continue;
            try {
              const data = JSON.parse(dataStr);
              if (currentEvent === 'token' && data.content) {
                reply += data.content;
              } else if (currentEvent === 'done') {
                if (data.sessionId) sessionIdRef.current = data.sessionId;
              }
            } catch {
              // skip malformed event
            }
          }
        }
      } catch {
        // 网络/流失败：口头带过，继续听
        reply = '哎呀，我这边信号不太好，你再说一遍好吗？';
      }

      if (!activeRef.current) return;
      reply = reply.trim() || '嗯嗯，我在听呢～';
      pushTurn({ role: 'assistant', content: reply });
      setPhase('speaking');

      // TTS 播报，播完自动继续听
      stopAudio();
      const audio = new Audio(api.getTTSUrl(reply));
      audioRef.current = audio;
      audio.onended = () => {
        if (!activeRef.current) return;
        audioRef.current = null;
        setPhase('listening');
        startListening();
      };
      audio.onerror = () => {
        if (!activeRef.current) return;
        audioRef.current = null;
        setPhase('listening');
        startListening();
      };
      try {
        await audio.play();
      } catch {
        // 自动播放被拦：跳过播报直接继续听
        if (activeRef.current) {
          setPhase('listening');
          startListening();
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [childId, parentId, pushTurn, stopAudio, stopRecognition],
  );

  /** 提交一段完整语音（final result 汇总 + 短暂静默判定） */
  const commitUtterance = useCallback(() => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    const text = utteranceBufRef.current;
    utteranceBufRef.current = '';
    if (text.trim()) {
      runTurn(text);
    }
  }, [runTurn]);

  const startListening = useCallback(() => {
    if (!activeRef.current || mutedRef.current || asrPausedRef.current) return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      asrPausedRef.current = true;
      setAsrIssue(
        '当前浏览器不支持语音识别，请用 Chrome 或 Edge 打开，或直接在下方打字和我聊',
      );
      setPhase('listening');
      return;
    }
    stopRecognition();
    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      networkFailRef.current = 0;
      lastResultAtRef.current = Date.now();
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          utteranceBufRef.current += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }
      setInterim(interimText);
      // final 后等一小段再提交，吸收连续的 final 分段
      if (utteranceBufRef.current.trim()) {
        if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
        commitTimerRef.current = setTimeout(commitUtterance, 700);
      }
    };

    recognition.onerror = (event: any) => {
      const errType = event?.error;
      if (errType === 'not-allowed' || errType === 'service-not-allowed') {
        asrPausedRef.current = true;
        setPhase('error');
        mutedRef.current = true;
        setMuted(true);
        setAsrIssue('麦克风权限被拒绝：请在浏览器地址栏的权限设置里允许麦克风后重试');
      } else if (errType === 'audio-capture') {
        asrPausedRef.current = true;
        setPhase('error');
        setAsrIssue('检测不到麦克风设备，请检查系统录音设备后重试');
      } else if (errType === 'network') {
        // Chrome 的语音识别要把录音传到 Google 服务器，国内直连不通会持续报这个错
        networkFailRef.current += 1;
        if (networkFailRef.current >= 3) {
          asrPausedRef.current = true;
          setAsrIssue(
            '语音识别服务连不上（Chrome 需访问 Google 服务）：建议改用 Edge 浏览器，或开启系统代理后刷新重试；也可以直接在下方打字和我聊',
          );
          setPhase('listening');
        }
      }
      // 'no-speech' / 'aborted' 等由 onend 自动重启兜底
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      engineStateRef.current = 'off';
      // Chrome 会周期性自动断开 continuous 识别，只要还在通话中就续上
      if (activeRef.current && !mutedRef.current && !audioRef.current && !asrPausedRef.current) {
        setPhase((p) => (p === 'listening' || p === 'muted' ? 'listening' : p));
        setTimeout(() => {
          if (activeRef.current && !mutedRef.current && !audioRef.current && !asrPausedRef.current) {
            startListening();
          }
        }, 300);
      }
    };

    recognitionRef.current = recognition;
    engineStateRef.current = 'starting';
    listeningSinceRef.current = Date.now();
    lastResultAtRef.current = Date.now();
    try {
      recognition.start();
    } catch {
      // start() 在已运行时会抛 InvalidStateError，忽略即可
    }
  }, [commitUtterance, stopRecognition]);

  // 打开：接通 → AI 先开口打招呼 → 进入聆听
  useEffect(() => {
    if (!open) return;
    activeRef.current = true;
    mutedRef.current = false;
    asrPausedRef.current = false;
    networkFailRef.current = 0;
    turnsRef.current = [];
    setTurns([]);
    setInterim('');
    setMuted(false);
    setAsrIssue(null);
    setElapsed(0);
    setPhase('connecting');

    const connectTimer = setTimeout(() => {
      if (!activeRef.current) return;
      pushTurn({ role: 'assistant', content: GREETING });
      setPhase('speaking');
      const audio = new Audio(api.getTTSUrl(GREETING));
      audioRef.current = audio;
      audio.onended = () => {
        if (!activeRef.current) return;
        audioRef.current = null;
        setPhase('listening');
        startListening();
      };
      audio.onerror = () => {
        if (!activeRef.current) return;
        audioRef.current = null;
        setPhase('listening');
        startListening();
      };
      audio.play().catch(() => {
        if (activeRef.current) {
          setPhase('listening');
          startListening();
        }
      });
    }, 500);

    const tick = setInterval(() => {
      setElapsed((s) => s + 1);
    }, 1000);

    // 麦克风电平监测（独立于识别引擎）
    startMicMonitor();

    // 看门狗：区分「麦克风静音」与「引擎无响应」两类故障
    watchdogRef.current = setInterval(() => {
      if (!activeRef.current || mutedRef.current || asrPausedRef.current) return;
      const now = Date.now();
      const hasVoice = now - lastVoiceAtRef.current < 3000;
      const listeningFor = now - listeningSinceRef.current;

      // 麦克风长时间完全无声（从接通起就没动过）
      if (!hasVoice && lastVoiceAtRef.current === 0 && listeningFor > 10000 && !silenceHintRef.current) {
        silenceHintRef.current = true;
        setAsrIssue(
          '麦克风没有采集到任何声音：请检查系统录音输入设备是否正确、麦克风是否被静音、或是否被其他程序占用',
        );
      }

      // 有声音但识别引擎 15 秒无结果 → 引擎/服务无响应，强制重启一次
      if (
        hasVoice &&
        !audioRef.current &&
        engineStateRef.current === 'on' &&
        now - lastResultAtRef.current > 15000
      ) {
        lastResultAtRef.current = now;
        stopRecognition();
        startListening();
      }
    }, 3000);

    return () => {
      activeRef.current = false;
      clearTimeout(connectTimer);
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      clearInterval(tick);
      if (watchdogRef.current) {
        clearInterval(watchdogRef.current);
        watchdogRef.current = null;
      }
      stopRecognition();
      stopAudio();
      stopMicMonitor();
      silenceHintRef.current = false;
      lastVoiceAtRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      if (next) {
        stopRecognition();
        utteranceBufRef.current = '';
        setInterim('');
        setPhase('muted');
      } else {
        // 取消静音：清掉之前的失败记录，重新尝试识别
        asrPausedRef.current = false;
        networkFailRef.current = 0;
        setAsrIssue(null);
        if (phase !== 'error') setPhase('listening');
        startListening();
      }
      return next;
    });
  }, [phase, startListening, stopRecognition]);

  /** 打字兜底：直接走 casual 对话 + TTS 播报，与语音轮完全一致 */
  const handleSendTyped = useCallback(() => {
    const text = typedText.trim();
    if (!text || !activeRef.current) return;
    setTypedText('');
    runTurn(text);
  }, [runTurn, typedText]);

  const handleHangUp = useCallback(() => {
    activeRef.current = false;
    stopRecognition();
    stopAudio();
    onEnd?.(turnsRef.current);
    onClose();
  }, [onClose, onEnd, stopAudio, stopRecognition]);

  if (!open) return null;

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  const showRings = !reducedMotion && (phase === 'listening' || phase === 'speaking');

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900 text-white">
      {/* 顶部：名称 + 状态 + 时长 */}
      <div className="flex flex-col items-center pt-8 pb-2">
        <div className="text-sm font-bold tracking-wide">AI 学习伙伴 · 小犀</div>
        <div
          className={cn(
            'mt-1 text-xs',
            phase === 'error' ? 'text-red-300' : 'text-white/70',
          )}
        >
          {PHASE_TEXT[phase]} {elapsed > 0 && phase !== 'error' && `· ${mm}:${ss}`}
        </div>
        {/* 麦克风实时电平：条不动 = 系统没采到声音 */}
        {!muted && phase !== 'error' && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <Mic
              className={cn(
                'w-3.5 h-3.5',
                micLevel > 0.08 ? 'text-emerald-300' : 'text-white/35',
              )}
            />
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/15">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-150',
                  micLevel > 0.08 ? 'bg-emerald-300' : 'bg-white/30',
                )}
                style={{ width: `${Math.max(4, Math.round(micLevel * 100))}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 中部：头像 + 呼吸环 */}
      <div className="flex flex-1 items-center justify-center">
        <div className="relative flex items-center justify-center">
          {showRings && (
            <>
              <span
                className={cn(
                  'absolute h-36 w-36 rounded-full bg-white/10',
                  phase === 'listening' ? 'animate-ping' : 'animate-pulse',
                )}
                style={{ animationDuration: phase === 'listening' ? '1.6s' : '2.4s' }}
              />
              <span
                className={cn(
                  'absolute h-36 w-36 rounded-full bg-white/5',
                  phase === 'listening' ? 'animate-ping' : 'animate-pulse',
                )}
                style={{ animationDuration: phase === 'listening' ? '2.4s' : '3.2s' }}
              />
            </>
          )}
          <div className="h-32 w-32 rounded-full bg-white/15 border border-white/20 flex items-center justify-center overflow-hidden shadow-2xl">
            {avatarSrc ? (
              <img src={avatarSrc} alt="AI头像" className="h-full w-full object-cover" />
            ) : (
              <Bot className="w-16 h-16 text-white/90" />
            )}
          </div>
        </div>
      </div>

      {/* 实时识别中的文字 */}
      <div className="px-6 h-8 flex items-center justify-center">
        {interim && phase === 'listening' && (
          <p className="text-sm text-white/60 italic truncate max-w-md">{interim}…</p>
        )}
      </div>

      {/* 识别故障提示（权限/网络/不支持） */}
      {asrIssue && (
        <div className="mx-auto max-w-xl px-4">
          <div className="rounded-xl bg-red-500/15 border border-red-400/30 px-3.5 py-2.5 text-xs leading-relaxed text-red-200">
            ⚠️ {asrIssue}
            {!muted && phase !== 'error' && (
              <button
                onClick={() => {
                  asrPausedRef.current = false;
                  networkFailRef.current = 0;
                  setAsrIssue(null);
                  startListening();
                }}
                className="ml-2 underline underline-offset-2 hover:text-white"
              >
                重试
              </button>
            )}
          </div>
        </div>
      )}

      {/* 通话记录（最近几轮） */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 space-y-2 pb-2 max-w-2xl w-full mx-auto">
        {turns.slice(-6).map((turn, i) => (
          <div
            key={`${turns.length}-${i}`}
            className={cn('flex', turn.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
                turn.role === 'user'
                  ? 'bg-white/20 text-white rounded-br-sm'
                  : 'bg-white/10 text-white/90 rounded-bl-sm',
              )}
            >
              {turn.content}
            </div>
          </div>
        ))}
      </div>

      {/* 底部控制：打字兜底 + 静音 / 挂断 */}
      <div className="w-full max-w-md mx-auto px-6 pb-3">
        <div className="flex items-center gap-2">
          <input
            value={typedText}
            onChange={(e) => setTypedText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSendTyped();
            }}
            placeholder="说话不便？打字帮我说…"
            className="min-w-0 flex-1 rounded-full bg-white/10 border border-white/15 px-4 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-white/40"
          />
          <button
            onClick={handleSendTyped}
            disabled={!typedText.trim()}
            className="shrink-0 rounded-full bg-white/15 px-4 py-2 text-sm font-bold text-white hover:bg-white/25 disabled:opacity-40"
            aria-label="发送"
          >
            发送
          </button>
        </div>
      </div>
      <div className="flex items-center justify-center gap-10 pb-8 pt-1">
        <button
          onClick={handleToggleMute}
          className={cn(
            'w-14 h-14 rounded-full flex items-center justify-center transition-colors',
            muted ? 'bg-white text-slate-900' : 'bg-white/15 text-white hover:bg-white/25',
          )}
          aria-label={muted ? '取消静音（重试麦克风）' : '静音'}
          title={muted ? '取消静音（重试麦克风）' : '静音'}
        >
          {muted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>
        <button
          onClick={handleHangUp}
          className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center shadow-lg shadow-red-500/30 transition-colors"
          aria-label="挂断"
          title="挂断"
        >
          <PhoneOff className="w-7 h-7 text-white" />
        </button>
        {/* 占位保持挂断按钮居中 */}
        <div className="w-14 h-14" />
      </div>
    </div>
  );
}

export default VoiceCallOverlay;
