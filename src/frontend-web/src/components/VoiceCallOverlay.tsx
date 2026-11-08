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
 * - 语音识别用浏览器 Web Speech API（Chrome/Edge）
 * - TTS 走后端 Edge TTS（/voice/tts 返回 MP3）
 * - AI 回复固定走碎碎念(casual)模式：1~2 句口语短句，适合语音来回
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

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeRef = useRef(false);
  const mutedRef = useRef(false);
  const utteranceBufRef = useRef('');
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnsRef = useRef<VoiceCallTurn[]>([]);
  const sessionIdRef = useRef(sessionId);

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
    if (!activeRef.current || mutedRef.current) return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setPhase('error');
      return;
    }
    stopRecognition();
    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
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
      if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
        setPhase('error');
        mutedRef.current = true;
        setMuted(true);
      }
      // 'no-speech' / 'aborted' 等由 onend 自动重启兜底
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      // Chrome 会周期性自动断开 continuous 识别，只要还在通话中就续上
      if (activeRef.current && !mutedRef.current && !audioRef.current) {
        setPhase((p) => (p === 'listening' || p === 'muted' ? 'listening' : p));
        setTimeout(() => {
          if (activeRef.current && !mutedRef.current && !audioRef.current) {
            startListening();
          }
        }, 300);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [commitUtterance, stopRecognition]);

  // 打开：接通 → AI 先开口打招呼 → 进入聆听
  useEffect(() => {
    if (!open) return;
    activeRef.current = true;
    mutedRef.current = false;
    turnsRef.current = [];
    setTurns([]);
    setInterim('');
    setMuted(false);
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

    return () => {
      activeRef.current = false;
      clearTimeout(connectTimer);
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      clearInterval(tick);
      stopRecognition();
      stopAudio();
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
        setPhase('listening');
        startListening();
      }
      return next;
    });
  }, [startListening, stopRecognition]);

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

      {/* 底部控制：静音 / 挂断 */}
      <div className="flex items-center justify-center gap-10 pb-10 pt-2">
        <button
          onClick={handleToggleMute}
          disabled={phase === 'error'}
          className={cn(
            'w-14 h-14 rounded-full flex items-center justify-center transition-colors',
            muted ? 'bg-white text-slate-900' : 'bg-white/15 text-white hover:bg-white/25',
          )}
          aria-label={muted ? '取消静音' : '静音'}
          title={muted ? '取消静音' : '静音'}
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
