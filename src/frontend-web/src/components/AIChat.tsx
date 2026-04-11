import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { MessageCircle, X, Send, Loader2, Bot, User, ChevronDown, ChevronRight, Brain, Wrench, Maximize2, Minimize2, GripVertical, ArrowLeft, Play, Mic, MicOff, Volume2, VolumeX, ArrowDown } from '@/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import api from '@/services/api';
import { getAudioVolume } from '@/lib/app-settings';
import { resolveChatAvatarSettings } from '@/lib/app-settings';
import { useAuth } from '@/contexts/AuthContext';
import type {
  ActivityType,
  ActivityData,
  ActivityResult,
  ActivityFeedback,
  LearningPoint,
  WrongQuestion,
  StudyPlanRecord,
  ConversationSession,
  ConversationMessageHistory,
} from '@/types';
import GameRenderer from './games/GameRenderer';
import { normalizeActivityData, normalizeActivityType } from './ai-chat/activity-normalizer';

interface ToolStep {
  id: string;
  toolName: string;
  args: Record<string, any>;
  result?: string;
  status: 'running' | 'done';
}

interface ThinkingStep {
  id: string;
  content: string;
}

interface GameData {
  activityType: ActivityType;
  gameData: string;
  parsed?: ActivityData;
  domain?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  thinkingSteps: ThinkingStep[];
  toolSteps: ToolStep[];
  gameData?: GameData;
  gameDataList?: GameData[];
  completedGameIndexes?: number[];
}

/** Hook to manage TTS audio playback across messages */
function useVoicePlayback() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);

  const play = useCallback((msgId: string, text: string) => {
    const plainText = text
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[([^\]]*)\]\(.*?\)/g, '$1')
      .replace(/[#*`_~>|]/g, '')
      .replace(/\n+/g, '。')
      .trim()
      .slice(0, 2000);
    if (!plainText) return;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    const audio = new Audio(api.getTTSUrl(plainText));
    audio.volume = getAudioVolume();
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

interface AIChatSharedProps {
  childId?: number;
  parentId?: number;
}

interface AIChatImplProps extends AIChatSharedProps {
  layout: 'floating' | 'full-page';
  onBack?: () => void;
}

interface AIChatPageProps extends AIChatSharedProps {
  /** Back navigation for full-page mode */
  onBack?: () => void;
}

function AIChatImpl({ childId, parentId, layout, onBack }: AIChatImplProps) {
  const isFullPage = layout === 'full-page';
  const isParentMode = Boolean(parentId);
  const FAB_SIZE = 64;
  const FAB_EDGE_MARGIN = 12;
  const FAB_DEFAULT_RIGHT = 24;
  const FAB_DEFAULT_BOTTOM = 220;

  const starterPrompts = isParentMode
    ? [
        '看看孩子这周学得怎么样',
        '根据学情调整下周学习计划',
        '给孩子安排今天的学习任务',
      ]
    : [
        '帮我安排今天的学习计划',
        '出3道数学小游戏',
        '讲一个简短睡前故事',
      ];
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [isMaximized, setIsMaximized] = useState(false);
  const [size, setSize] = useState({ w: 384, h: 500 });
  const [expandedSections, setExpandedSections] = useState<Record<string, { thinking: boolean; tools: boolean }>>({});
  const [activeGameKey, setActiveGameKey] = useState<string | null>(null);
  const [activityFeedback, setActivityFeedback] = useState<ActivityFeedback | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [autoRead, setAutoRead] = useState(true);
  const [showJumpButton, setShowJumpButton] = useState(false);
  const [fabPosition, setFabPosition] = useState<{ x: number; y: number }>(() => {
    if (typeof window === 'undefined') return { x: FAB_EDGE_MARGIN, y: FAB_EDGE_MARGIN };
    return {
      x: Math.max(FAB_EDGE_MARGIN, window.innerWidth - FAB_SIZE - FAB_DEFAULT_RIGHT),
      y: Math.max(FAB_EDGE_MARGIN, window.innerHeight - FAB_SIZE - FAB_DEFAULT_BOTTOM),
    };
  });
  const [isFabDragging, setIsFabDragging] = useState(false);
  const [viewMode, setViewMode] = useState<'chat' | 'archive'>('chat');
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [learningPoints, setLearningPoints] = useState<LearningPoint[]>([]);
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestion[]>([]);
  const [studyPlans, setStudyPlans] = useState<StudyPlanRecord[]>([]);
  const [conversationSessions, setConversationSessions] = useState<ConversationSession[]>([]);
  const [selectedHistorySessionId, setSelectedHistorySessionId] = useState<string | null>(null);
  const [historyMessages, setHistoryMessages] = useState<ConversationMessageHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [avatarState, setAvatarState] = useState<{ userAvatar?: string; aiAvatar?: string }>({});
  const { user } = useAuth();
  const { playingMsgId, play: playMessage, stop: stopPlayback, toggle: togglePlayback } = useVoicePlayback();
  const recognitionRef = useRef<any>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fabDragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    offsetX: number;
    offsetY: number;
    dragged: boolean;
  } | null>(null);
  const suppressFabClickRef = useRef(false);
  const dragControls = useDragControls();
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);
  const hasVoiceInput = typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const resolveAvatars = useCallback(() => {
    const contextUser = user as { id?: number; avatar?: string; settings?: Record<string, unknown> } | null;
    let localUser: { id?: number; avatar?: string; settings?: Record<string, unknown> } | null = null;

    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('auth_user');
        if (raw) localUser = JSON.parse(raw);
      } catch {
        localUser = null;
      }
    }

    const baseUser =
      localUser && contextUser?.id && localUser.id === contextUser.id
        ? localUser
        : (contextUser || localUser);
    const avatarPrefs = resolveChatAvatarSettings(baseUser?.settings);

    return {
      userAvatar: avatarPrefs.userAvatar || baseUser?.avatar,
      aiAvatar: avatarPrefs.aiAvatar,
    };
  }, [user]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const handleMessagesScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setShowJumpButton(distanceToBottom > 140);
  }, []);

  const clampFabPosition = useCallback((x: number, y: number) => {
    if (typeof window === 'undefined') return { x, y };
    const maxX = Math.max(FAB_EDGE_MARGIN, window.innerWidth - FAB_SIZE - FAB_EDGE_MARGIN);
    const maxY = Math.max(FAB_EDGE_MARGIN, window.innerHeight - FAB_SIZE - FAB_EDGE_MARGIN);
    return {
      x: Math.min(Math.max(x, FAB_EDGE_MARGIN), maxX),
      y: Math.min(Math.max(y, FAB_EDGE_MARGIN), maxY),
    };
  }, [FAB_EDGE_MARGIN, FAB_SIZE]);

  const resizeInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);
  useEffect(() => { resizeInput(); }, [input, resizeInput, isOpen, isFullPage]);
  useEffect(() => { setAvatarState(resolveAvatars()); }, [resolveAvatars]);

  useEffect(() => {
    const syncAvatars = () => setAvatarState(resolveAvatars());
    window.addEventListener('user-settings-updated', syncAvatars as EventListener);
    window.addEventListener('storage', syncAvatars);
    return () => {
      window.removeEventListener('user-settings-updated', syncAvatars as EventListener);
      window.removeEventListener('storage', syncAvatars);
    };
  }, [resolveAvatars]);

  useEffect(() => {
    if (isFullPage) return;
    const syncFabPosition = () => {
      setFabPosition((prev) => {
        const clamped = clampFabPosition(prev.x, prev.y);
        if (clamped.x === prev.x && clamped.y === prev.y) return prev;
        return clamped;
      });
    };
    syncFabPosition();
    window.addEventListener('resize', syncFabPosition);
    return () => window.removeEventListener('resize', syncFabPosition);
  }, [isFullPage, clampFabPosition]);

  useEffect(() => {
    if ((isOpen || isFullPage) && messages.length === 0) {
      setMessages([{
        id: '1', role: 'assistant',
        content: isParentMode
          ? '你好，我是你的 AI 家庭学习助手。我可以帮你查看孩子学习情况，分析薄弱点，并一起调整学习计划和任务安排。'
          : '你好，我是你的 AI 学习伙伴。你可以让我出题、讲故事、解释知识点，或一起做练习。',
        timestamp: new Date(), thinkingSteps: [], toolSteps: [],
      }]);
    }
  }, [isOpen, isFullPage, isParentMode, messages.length]);

  useEffect(() => {
    if (isOpen || isFullPage) setTimeout(() => inputRef.current?.focus(), 300);
  }, [isOpen, isFullPage]);

  const activeChildId = childId;
  const userAvatarSrc = avatarState.userAvatar;
  const aiAvatarSrc = avatarState.aiAvatar;

  const loadArchiveData = useCallback(async () => {
    if (!activeChildId) return;
    setArchiveLoading(true);
    try {
      const [pointsRes, wrongRes, planRes, sessionRes] = await Promise.allSettled([
        api.getLearningPoints(activeChildId, { limit: 20 }),
        api.getWrongQuestions(activeChildId, { limit: 20 }),
        api.getStudyPlans(activeChildId, { limit: 20 }),
        api.getConversationSessions(activeChildId, { limit: 20 }),
      ]);

      if (pointsRes.status === 'fulfilled') setLearningPoints(pointsRes.value.list || []);
      if (wrongRes.status === 'fulfilled') setWrongQuestions(wrongRes.value.list || []);
      if (planRes.status === 'fulfilled') setStudyPlans(planRes.value.list || []);
      if (sessionRes.status === 'fulfilled') setConversationSessions(sessionRes.value.list || []);
    } finally {
      setArchiveLoading(false);
    }
  }, [activeChildId]);

  const loadHistoryMessages = useCallback(async (targetSessionId: string) => {
    setHistoryLoading(true);
    try {
      const result = await api.getConversationMessages(targetSessionId, { limit: 100 });
      setHistoryMessages(result.list || []);
    } catch {
      setHistoryMessages([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode === 'archive' && (isOpen || isFullPage)) {
      loadArchiveData().catch(() => {});
    }
  }, [viewMode, isOpen, isFullPage, loadArchiveData]);

  useEffect(() => {
    if (!selectedHistorySessionId) return;
    loadHistoryMessages(selectedHistorySessionId).catch(() => {});
  }, [selectedHistorySessionId, loadHistoryMessages]);

  // Resize handler (pointer-based for mouse + touch + pen)
  const handleResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    e.preventDefault();
    const activePointerId = e.pointerId;
    const handleEl = e.currentTarget;
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startW: size.w, startH: size.h };
    handleEl.setPointerCapture(activePointerId);

    const handleMove = (ev: PointerEvent) => {
      if (ev.pointerId !== activePointerId || !resizeRef.current) return;
      const dx = resizeRef.current.startX - ev.clientX; // drag left edge to widen
      const dy = ev.clientY - resizeRef.current.startY; // drag bottom to heighten
      setSize({
        w: Math.min(Math.max(resizeRef.current.startW + dx, 320), window.innerWidth - 40),
        h: Math.min(Math.max(resizeRef.current.startH + dy, 400), window.innerHeight - 100),
      });
    };

    const handleUp = (ev: PointerEvent) => {
      if (ev.pointerId !== activePointerId) return;
      if (handleEl.hasPointerCapture(activePointerId)) {
        handleEl.releasePointerCapture(activePointerId);
      }
      resizeRef.current = null;
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
      document.removeEventListener('pointercancel', handleUp);
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
    document.addEventListener('pointercancel', handleUp);
  }, [size]);

  const toggleSection = (msgId: string, section: 'thinking' | 'tools') => {
    setExpandedSections((prev) => ({
      ...prev,
      [msgId]: { thinking: prev[msgId]?.thinking ?? false, tools: prev[msgId]?.tools ?? false, [section]: !(prev[msgId]?.[section] ?? false) },
    }));
  };

  const handleFabPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    fabDragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      dragged: false,
    };
    setIsFabDragging(false);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handleFabPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const dragState = fabDragRef.current;
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - dragState.startClientX, e.clientY - dragState.startClientY);
    if (!dragState.dragged && moved < 4) return;
    dragState.dragged = true;
    setIsFabDragging(true);
    setFabPosition(clampFabPosition(e.clientX - dragState.offsetX, e.clientY - dragState.offsetY));
  }, [clampFabPosition]);

  const endFabDrag = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const dragState = fabDragRef.current;
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    if (dragState.dragged) suppressFabClickRef.current = true;
    fabDragRef.current = null;
    setIsFabDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  const handleFabClick = useCallback(() => {
    if (suppressFabClickRef.current) {
      suppressFabClickRef.current = false;
      return;
    }
    setIsOpen(true);
  }, []);

  const handleSendStream = useCallback(async (overrideMessage?: string) => {
    const messageText = overrideMessage || input.trim();
    if (!messageText || isLoading) return;
    if (viewMode !== 'chat') setViewMode('chat');

    const userMessage: Message = {
      id: Date.now().toString(), role: 'user', content: messageText,
      timestamp: new Date(), thinkingSteps: [], toolSteps: [],
    };
    setMessages((prev) => [...prev, userMessage]);
    if (!overrideMessage) setInput('');
    setIsLoading(true);
    setSuggestions([]);
    const assistantId = (Date.now() + 1).toString();

    try {
      const response = await api.sendChatMessageStream({ message: messageText, childId, parentId, sessionId });
      if (!response.ok || !response.body) throw new Error('Stream failed');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      setMessages((prev) => [...prev,
        { id: assistantId, role: 'assistant', content: '', timestamp: new Date(), isStreaming: true, thinkingSteps: [], toolSteps: [] },
      ]);

      let buffer = '';
      let toolStepCounter = 0;
      let thinkingCounter = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        let currentEvent = '';

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === 'done') {
                if (data.sessionId) setSessionId(data.sessionId);
                if (data.suggestions?.length) setSuggestions(data.suggestions);
              } else if (currentEvent === 'thinking') {
                thinkingCounter++;
                const tid = `thinking-${assistantId}-${thinkingCounter}`;
                setMessages((prev) => prev.map((m) =>
                  m.id === assistantId ? { ...m, thinkingSteps: [...m.thinkingSteps, { id: tid, content: data.content }] } : m
                ));
              } else if (currentEvent === 'tool_start') {
                toolStepCounter++;
                const tsid = `tool-${assistantId}-${toolStepCounter}`;
                setMessages((prev) => prev.map((m) =>
                  m.id === assistantId ? { ...m, toolSteps: [...m.toolSteps, { id: tsid, toolName: data.toolName || data.content, args: data.toolArgs || {}, status: 'running' }] } : m
                ));
              } else if (currentEvent === 'tool_result') {
                setMessages((prev) => prev.map((m) => {
                  if (m.id !== assistantId) return m;
                  const steps = [...m.toolSteps];
                  for (let j = steps.length - 1; j >= 0; j--) {
                    if (steps[j].status === 'running' && steps[j].toolName === (data.toolName || data.content)) {
                      steps[j] = { ...steps[j], status: 'done', result: data.toolResult };
                      break;
                    }
                  }
                  return { ...m, toolSteps: steps };
                }));
              } else if (currentEvent === 'game_data') {
                // Store game data for interactive rendering
                try {
                  const rawParsed = typeof data.gameData === 'string' ? JSON.parse(data.gameData) : data.gameData;
                  const activityType = normalizeActivityType(data.activityType, rawParsed);
                  const parsed = normalizeActivityData(activityType, rawParsed);
                  const normalizedGameData: GameData = {
                    activityType,
                    gameData: typeof data.gameData === 'string' ? data.gameData : JSON.stringify(data.gameData),
                    parsed,
                    domain: data.domain,
                  };
                  setMessages((prev) => prev.map((m) =>
                    m.id === assistantId
                      ? {
                        ...m,
                        gameData: normalizedGameData,
                        gameDataList: [
                          ...(m.gameDataList?.length
                            ? m.gameDataList
                            : m.gameData
                              ? [m.gameData]
                              : []),
                          normalizedGameData,
                        ],
                      }
                      : m
                  ));
                } catch {}
              } else if (currentEvent === 'token' && data.content) {
                fullContent += data.content;
                setMessages((prev) => prev.map((m) =>
                  m.id === assistantId ? { ...m, content: fullContent } : m
                ));
              }
            } catch {}
            currentEvent = '';
          }
        }
      }

      setMessages((prev) => prev.map((m) =>
        m.id === assistantId ? { ...m, content: fullContent || '抱歉，我暂时无法回答这个问题。', isStreaming: false } : m
      ));
    } catch {
      try {
        const response = await api.sendChatMessage({ message: messageText, childId, parentId, sessionId });
        if (response.sessionId) setSessionId(response.sessionId);
        if (response.suggestions?.length) setSuggestions(response.suggestions);
        setMessages((prev) => [...prev.filter((m) => m.id !== assistantId), {
          id: assistantId, role: 'assistant', content: response.reply || '抱歉，我暂时无法回答这个问题。',
          timestamp: new Date(), thinkingSteps: [], toolSteps: [],
        }]);
      } catch {
        setMessages((prev) => [...prev.filter((m) => m.id !== assistantId), {
          id: assistantId, role: 'assistant', content: '抱歉，网络好像有点问题，请稍后再试。',
          timestamp: new Date(), thinkingSteps: [], toolSteps: [],
        }]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, childId, parentId, sessionId, viewMode]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendStream(); }
  };

  const getMessageGames = useCallback((msg: Message): GameData[] => {
    if (msg.gameDataList?.length) return msg.gameDataList;
    return msg.gameData ? [msg.gameData] : [];
  }, []);

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

  // Auto-read: when a new assistant message finishes streaming, play it
  useEffect(() => {
    if (!autoRead) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'assistant' && !lastMsg.isStreaming && getMessageGames(lastMsg).length === 0 && lastMsg.content) {
      playMessage(lastMsg.id, lastMsg.content);
    }
  }, [messages, autoRead, playMessage, getMessageGames]);

  const hasProcessSteps = (msg: Message) => msg.thinkingSteps.length > 0 || msg.toolSteps.length > 0;

  const isSimpleGame = (type: ActivityType) => ['quiz', 'true_false', 'fill_blank'].includes(type);
  const showStarterPrompts = messages.length <= 1 && suggestions.length === 0 && !isLoading;
  const isFormalContentReady = useCallback((msg: Message, games: GameData[]) => {
    if (games.length === 0) return true;
    const completed = new Set(msg.completedGameIndexes || []);
    return games.every((_, idx) => completed.has(idx));
  }, []);

  const formatFormalContent = useCallback((raw: string) => {
    const source = (raw || '').trim();
    if (!source) return '';

    return source
      .replace(/\s*\|\|\s*/g, '\n')
      .replace(/\s*[-]{2,}\s*/g, '\n\n')
      .replace(/(?:\n\s*){3,}/g, '\n\n')
      .trim();
  }, []);

  const handleGameComplete = useCallback((msgId: string, gameIndex: number, result: ActivityResult, gameDomain?: string) => {
    setMessages((prev) => prev.map((m) => {
      if (m.id !== msgId) return m;
      const completed = Array.isArray(m.completedGameIndexes) ? m.completedGameIndexes : [];
      if (completed.includes(gameIndex)) return m;
      return { ...m, completedGameIndexes: [...completed, gameIndex].sort((a, b) => a - b) };
    }));
    setActiveGameKey(null);
    // Show feedback overlay
    const scorePercent = result.totalQuestions > 0 ? (result.correctAnswers / result.totalQuestions) * 100 : result.score;
    const domain = gameDomain || 'language';
    const gameMessage = messages.find((item) => item.id === msgId);
    const game = gameMessage ? getMessageGames(gameMessage)[gameIndex] : undefined;
    const topic = game?.parsed?.title || '';
    const activityType = game?.activityType;
    const reviewItems = result.interactionData?.reviewData || result.interactionData?.reviewItems;
    const feedback: ActivityFeedback = {
      score: Math.round(scorePercent),
      total: result.totalQuestions,
      correct: result.correctAnswers,
      domain,
      message: scorePercent >= 60
        ? `太棒了！你答对了 ${result.correctAnswers}/${result.totalQuestions} 题！`
        : '加油！继续努力！',
    };
    setActivityFeedback(feedback);
    // Auto-dismiss after 5 seconds
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setActivityFeedback(null), 5000);

    // Record activity to backend for learning tracking & achievements
    if (activeChildId) {
      api.recordActivity({
        childId: activeChildId,
        domain,
        score: Math.round(scorePercent),
        sessionId,
        activityType,
        interactionData: result.interactionData,
        reviewItems,
        topic,
      }).then(() => {
        window.dispatchEvent(new CustomEvent('achievements-updated'));
        if (viewMode === 'archive') {
          loadArchiveData().catch(() => {});
        }
      }).catch(() => {});
    }
  }, [messages, activeChildId, sessionId, viewMode, loadArchiveData, getMessageGames]);

  // Full-page mode: no floating button, just the chat UI directly
  if (isFullPage) {
    return (
      <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-surface-container-lowest">
        {/* Header */}
        <div className="sticky top-0 z-20 bg-tertiary px-5 py-4 flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} aria-label="返回" className="touch-target w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center overflow-hidden">
            {aiAvatarSrc ? (
              <img src={aiAvatarSrc} alt="AI头像" className="h-full w-full object-cover" />
            ) : (
              <Bot className="w-6 h-6 text-white" />
            )}
          </div>
          <div className="flex-1">
            <h3 className="text-white font-bold text-lg">AI 学习伙伴</h3>
            <p className="text-white/70 text-xs">随时回答问题，也能出题陪练</p>
          </div>
          <div className="mr-1 flex items-center gap-1 rounded-full bg-white/15 p-1">
            <button
              onClick={() => setViewMode('chat')}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-bold transition-colors',
                viewMode === 'chat' ? 'bg-white text-tertiary' : 'text-white/75 hover:text-white',
              )}
            >
              对话
            </button>
            <button
              onClick={() => setViewMode('archive')}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-bold transition-colors',
                viewMode === 'archive' ? 'bg-white text-tertiary' : 'text-white/75 hover:text-white',
              )}
            >
              学习记录
            </button>
          </div>
          <button
            onClick={() => { setAutoRead(!autoRead); if (autoRead) stopPlayback(); }}
            className={cn(
              "touch-target w-9 h-9 rounded-full flex items-center justify-center transition-colors",
              autoRead ? "bg-white/30 text-white" : "bg-white/10 text-white/60 hover:text-white"
            )}
            aria-label={autoRead ? '关闭自动朗读' : '开启自动朗读'}
            title={autoRead ? '关闭自动朗读' : '开启自动朗读'}
          >
            <Volume2 className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="relative min-h-0 flex-1">
          {viewMode === 'archive' ? (
            <LearningArchivePanel
              childId={activeChildId}
              loading={archiveLoading}
              learningPoints={learningPoints}
              wrongQuestions={wrongQuestions}
              studyPlans={studyPlans}
              conversationSessions={conversationSessions}
              selectedSessionId={selectedHistorySessionId}
              historyMessages={historyMessages}
              historyLoading={historyLoading}
              onSelectSession={setSelectedHistorySessionId}
              onRefresh={() => loadArchiveData()}
            />
          ) : (
            <>
          <div
            ref={messagesContainerRef}
            onScroll={handleMessagesScroll}
            className="h-full overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-surface-container-lowest via-surface-container-lowest to-surface-container/25"
            aria-live="polite"
          >
            {showStarterPrompts && (
              <div className="panel-card p-3.5">
                <p className="mb-2 text-xs font-bold text-on-surface-variant">快速开始</p>
                <div className="flex flex-wrap gap-2">
                  {starterPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => handleSendStream(prompt)}
                      className="rounded-full bg-primary-container/45 px-3 py-1.5 text-xs font-semibold text-on-primary-container hover:bg-primary-container/60"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => {
              const messageGames = getMessageGames(message);
              const showFormalContent = isFormalContentReady(message, messageGames);
              const formattedContent = formatFormalContent(message.content);
              return (
              <div key={message.id} className={cn('flex gap-2', message.role === 'user' ? 'justify-end' : 'justify-start')}>
                {message.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-tertiary-container flex items-center justify-center flex-shrink-0 mt-0.5 overflow-hidden">
                    {aiAvatarSrc ? (
                      <img src={aiAvatarSrc} alt="AI头像" className="h-full w-full object-cover" />
                    ) : (
                      <Bot className="w-5 h-5 text-on-tertiary-container" />
                    )}
                  </div>
                )}
                <div className={cn('max-w-[80%] min-w-0')}>
                  {message.role === 'assistant' && hasProcessSteps(message) && (
                    <ProcessSection message={message} expandedSections={expandedSections} toggleSection={toggleSection} />
                  )}
                  <div className={cn(
                    'px-4 py-2.5 rounded-2xl text-sm',
                    message.role === 'user' ? 'bg-primary text-on-primary rounded-br-sm' : 'bg-surface-container text-on-surface rounded-bl-sm',
                  )}>
                    {message.role === 'assistant' ? (
                      <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-hr:my-2 prose-strong:text-on-surface">
                        {messageGames.length > 0 && !showFormalContent ? (
                          <p>请先完成题目，完成后会显示格式化的总结与讲解。</p>
                        ) : (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {messageGames.length > 0
                              ? (formattedContent || '练习已完成，继续加油。')
                              : message.content}
                          </ReactMarkdown>
                        )}
                      </div>
                    ) : message.content}
                    {message.isStreaming && !message.content && (
                      <span className="inline-block w-1.5 h-4 bg-on-surface animate-pulse" />
                    )}
                  </div>
                  {message.role === 'assistant' && messageGames.length === 0 && message.content && !message.isStreaming && (
                    <SpeakerButton msgId={message.id} content={message.content} playingMsgId={playingMsgId} onToggle={togglePlayback} />
                  )}
                  {message.role === 'assistant' && messageGames.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {messageGames.map((game, gameIndex) => {
                        if (!game.parsed) return null;
                        const gameKey = `${message.id}-${gameIndex}`;
                        const isCompleted = message.completedGameIndexes?.includes(gameIndex);
                        return activeGameKey === gameKey ? (
                          <div key={gameKey} className="bg-surface-container-lowest rounded-2xl p-3 border border-outline-variant/20">
                            <GameRenderer
                              type={game.activityType}
                              data={game.parsed}
                              onComplete={(result) => handleGameComplete(message.id, gameIndex, result, game.domain)}
                            />
                          </div>
                        ) : (
                          <button
                            key={gameKey}
                            onClick={() => setActiveGameKey(gameKey)}
                            className="flex items-center gap-2 bg-tertiary-container text-on-tertiary-container px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-tertiary-container/80 transition-colors tactile-press w-full"
                          >
                            <Play className="w-4 h-4 fill-current" />
                            <span>{isCompleted
                              ? `查看 ${game.parsed.title || '练习'}`
                              : (isSimpleGame(game.activityType) ? `开始 ${game.parsed.title || '练习'}` : `开始 ${game.parsed.title || '游戏'}`)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {message.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center flex-shrink-0 mt-0.5 overflow-hidden">
                    {userAvatarSrc ? (
                      <img src={userAvatarSrc} alt="我的头像" className="h-full w-full object-cover" />
                    ) : (
                      <User className="w-5 h-5 text-on-primary-container" />
                    )}
                  </div>
                )}
              </div>
            );})}
            {isLoading && !messages.some((m) => m.isStreaming) && (
              <div className="flex gap-2 justify-start">
                <div className="w-8 h-8 rounded-full bg-tertiary-container flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {aiAvatarSrc ? (
                    <img src={aiAvatarSrc} alt="AI头像" className="h-full w-full object-cover" />
                  ) : (
                    <Bot className="w-5 h-5 text-on-tertiary-container" />
                  )}
                </div>
                <div className="bg-surface-container px-4 py-2.5 rounded-2xl rounded-bl-sm">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-on-surface-variant rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-on-surface-variant rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-on-surface-variant rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {showJumpButton && (
            <button
              onClick={() => scrollToBottom()}
              className="touch-target absolute bottom-3 right-3 h-9 w-9 rounded-full bg-on-secondary-container text-white shadow-lg hover:brightness-110"
              aria-label="回到底部"
            >
              <ArrowDown className="mx-auto h-4 w-4" />
            </button>
          )}
            </>
          )}
        </div>

        {/* Suggestions */}
        {viewMode === 'chat' && suggestions.length > 0 && !isLoading && (
          <div className="px-4 pb-2 pt-1 flex gap-2 overflow-x-auto">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => handleSendStream(s)}
                className="whitespace-nowrap px-3 py-1.5 rounded-full bg-tertiary-container text-on-tertiary-container text-xs font-medium hover:bg-tertiary-container/80 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        {viewMode === 'chat' && (
        <div className="p-4 border-t border-outline-variant/20 bg-surface-container-lowest/95">
          <div className="flex gap-2 items-end">
            {hasVoiceInput && (
              <button
                onClick={handleToggleRecording}
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center transition-colors tactile-press flex-shrink-0',
                  isRecording ? 'bg-red-500 text-white animate-voice-pulse' : 'bg-surface-container text-on-surface-variant hover:text-on-surface',
                )}
                aria-label={isRecording ? '停止录音' : '开始录音'}
              >
                {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
            )}
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isRecording ? '正在听你说...' : '输入问题，按 Enter 发送，Shift+Enter 换行'}
              className="flex-1 resize-none bg-surface-container border border-outline-variant/30 rounded-2xl px-4 py-2.5 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 transition-colors leading-5 max-h-[120px]"
              disabled={isLoading}
            />
            <button
              onClick={() => handleSendStream()}
              disabled={!input.trim() || isLoading}
              className="w-10 h-10 bg-tertiary rounded-full flex items-center justify-center text-white disabled:opacity-50 disabled:cursor-not-allowed tactile-press"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
        </div>
        )}

        {/* Activity Feedback Overlay (full-page mode) */}
        <AnimatePresence>
          {activityFeedback && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              onClick={() => setActivityFeedback(null)}
              className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 p-6"
            >
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 30 }}
                className="bg-surface-container-lowest rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-outline-variant/20 text-center"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-5xl mb-4">
                  {activityFeedback.score >= 80 ? '\u{1F389}' : activityFeedback.score >= 60 ? '\u{1F44D}' : '\u{1F4AA}'}
                </div>
                <h3 className="text-xl font-bold text-on-surface mb-2">{activityFeedback.message}</h3>
                <div className="w-full h-4 bg-surface-container rounded-full overflow-hidden my-4">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${activityFeedback.score}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className="h-full rounded-full"
                    style={{
                      backgroundColor:
                        activityFeedback.score >= 80 ? 'var(--color-success)' :
                        activityFeedback.score >= 60 ? 'var(--color-warning)' : 'var(--color-danger)',
                    }}
                  />
                </div>
                <p className="text-on-surface-variant text-sm">
                  得分: <span className="font-bold text-on-surface">{activityFeedback.score}</span>
                  {activityFeedback.total > 0 && (
                    <> · 正确 {activityFeedback.correct}/{activityFeedback.total} 题</>
                  )}
                </p>
                <button
                  onClick={() => setActivityFeedback(null)}
                  className="mt-6 bg-primary text-on-primary px-6 py-2.5 rounded-full font-bold text-sm tactile-press"
                >
                  继续学习
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Floating widget mode
  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={handleFabClick}
        onPointerDown={handleFabPointerDown}
        onPointerMove={handleFabPointerMove}
        onPointerUp={endFabDrag}
        onPointerCancel={endFabDrag}
        aria-label="打开 AI 学习伙伴"
        style={{ left: fabPosition.x, top: fabPosition.y }}
        className={cn(
          "fixed w-16 h-16 bg-tertiary rounded-full flex items-center justify-center shadow-2xl text-white tactile-press z-[100] border-b-4 border-tertiary-dim touch-none select-none transition-all",
          !isFabDragging && "hover:scale-110",
          isOpen && "opacity-0 pointer-events-none"
        )}>
        <MessageCircle className="w-8 h-8 fill-current" />
      </button>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.9 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={cn(
              "fixed right-4 bottom-20 bg-surface-container-lowest rounded-3xl shadow-2xl z-[100] flex h-[min(78vh,680px)] flex-col overflow-hidden border border-outline-variant/20",
              isMaximized
                ? "inset-4 bottom-20 rounded-3xl"
                : ""
            )}
            style={!isMaximized ? { width: size.w, height: size.h, maxHeight: 'calc(100dvh - 96px)' } : undefined}
            role="dialog" aria-label="AI 学习伙伴对话" aria-modal="true"
          >
            {/* Header */}
            <div className="sticky top-0 z-20 bg-tertiary px-5 py-3 flex items-center justify-between flex-shrink-0"
              onPointerDown={(e) => !isMaximized && dragControls.start(e)}>
              <div className="flex items-center gap-3">
                <div className="touch-target w-9 h-9 rounded-full bg-white/20 flex items-center justify-center overflow-hidden">
                  {aiAvatarSrc ? (
                    <img src={aiAvatarSrc} alt="AI头像" className="h-full w-full object-cover" />
                  ) : (
                    <Bot className="w-5 h-5 text-white" />
                  )}
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm">AI 学习伙伴</h3>
                  <p className="text-white/70 text-[10px]">随时问，随时答</p>
                </div>
              </div>
              <div className="mr-1 flex items-center gap-1 rounded-full bg-white/15 p-1">
                <button
                  onClick={() => setViewMode('chat')}
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors',
                    viewMode === 'chat' ? 'bg-white text-tertiary' : 'text-white/75 hover:text-white',
                  )}
                >
                  对话
                </button>
                <button
                  onClick={() => setViewMode('archive')}
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors',
                    viewMode === 'archive' ? 'bg-white text-tertiary' : 'text-white/75 hover:text-white',
                  )}
                >
                  记录
                </button>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => { setAutoRead(!autoRead); if (autoRead) stopPlayback(); }}
                  className={cn(
                    "touch-target w-7 h-7 rounded-full flex items-center justify-center transition-colors",
                    autoRead ? "bg-white/30 text-white" : "bg-white/10 text-white/60 hover:text-white"
                  )}
                  aria-label={autoRead ? '关闭自动朗读' : '开启自动朗读'}>
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setIsMaximized(!isMaximized)} aria-label={isMaximized ? '还原' : '最大化'}
                  className="touch-target w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors">
                  {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button onClick={() => { setIsOpen(false); setIsMaximized(false); }} aria-label="关闭 AI 对话"
                  className="touch-target w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Resize handle */}
            {!isMaximized && (
              <div className="absolute top-0 left-0 bottom-0 z-10 flex w-3 cursor-ew-resize touch-none items-center justify-center opacity-0 transition-opacity hover:opacity-100"
                onPointerDown={handleResizePointerDown}>
                <GripVertical className="w-2 h-8 text-on-surface-variant/30" />
              </div>
            )}

            {/* Messages */}
            <div className="relative min-h-0 flex-1">
              {viewMode === 'archive' ? (
                <LearningArchivePanel
                  childId={activeChildId}
                  loading={archiveLoading}
                  learningPoints={learningPoints}
                  wrongQuestions={wrongQuestions}
                  studyPlans={studyPlans}
                  conversationSessions={conversationSessions}
                  selectedSessionId={selectedHistorySessionId}
                  historyMessages={historyMessages}
                  historyLoading={historyLoading}
                  onSelectSession={setSelectedHistorySessionId}
                  onRefresh={() => loadArchiveData()}
                />
              ) : (
                <>
              <div
                ref={messagesContainerRef}
                onScroll={handleMessagesScroll}
                className="h-full overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-surface-container-lowest via-surface-container-lowest to-surface-container/25"
                aria-live="polite"
              >
                {showStarterPrompts && (
                  <div className="panel-card p-3">
                    <p className="mb-2 text-[11px] font-bold text-on-surface-variant">快速开始</p>
                    <div className="flex flex-wrap gap-1.5">
                      {starterPrompts.map((prompt) => (
                        <button
                          key={prompt}
                          onClick={() => handleSendStream(prompt)}
                          className="rounded-full bg-primary-container/45 px-2.5 py-1 text-[11px] font-semibold text-on-primary-container hover:bg-primary-container/60"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((message) => {
                  const messageGames = getMessageGames(message);
                  const showFormalContent = isFormalContentReady(message, messageGames);
                  const formattedContent = formatFormalContent(message.content);
                  return (
                  <div key={message.id} className={cn('flex gap-2', message.role === 'user' ? 'justify-end' : 'justify-start')}>
                    {message.role === 'assistant' && (
                      <div className="w-7 h-7 rounded-full bg-tertiary-container flex items-center justify-center flex-shrink-0 mt-0.5 overflow-hidden">
                        {aiAvatarSrc ? (
                          <img src={aiAvatarSrc} alt="AI头像" className="h-full w-full object-cover" />
                        ) : (
                          <Bot className="w-4 h-4 text-on-tertiary-container" />
                        )}
                      </div>
                    )}
                    <div className={cn('max-w-[80%] min-w-0')}>
                      {message.role === 'assistant' && hasProcessSteps(message) && (
                        <ProcessSection message={message} expandedSections={expandedSections} toggleSection={toggleSection} />
                      )}
                      <div className={cn(
                        'px-3.5 py-2 rounded-2xl text-sm',
                        message.role === 'user' ? 'bg-primary text-on-primary rounded-br-sm' : 'bg-surface-container text-on-surface rounded-bl-sm',
                      )}>
                        {message.role === 'assistant' ? (
                          <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-hr:my-2 prose-strong:text-on-surface">
                            {messageGames.length > 0 && !showFormalContent ? (
                              <p>请先完成题目，完成后会显示格式化的总结与讲解。</p>
                            ) : (
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {messageGames.length > 0
                                  ? (formattedContent || '练习已完成，继续加油。')
                                  : message.content}
                              </ReactMarkdown>
                            )}
                          </div>
                        ) : message.content}
                        {message.isStreaming && !message.content && (
                          <span className="inline-block w-1.5 h-4 bg-on-surface animate-pulse" />
                        )}
                      </div>
                      {message.role === 'assistant' && messageGames.length === 0 && message.content && !message.isStreaming && (
                        <SpeakerButton msgId={message.id} content={message.content} playingMsgId={playingMsgId} onToggle={togglePlayback} />
                      )}
                      {message.role === 'assistant' && messageGames.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {messageGames.map((game, gameIndex) => {
                            if (!game.parsed) return null;
                            const gameKey = `${message.id}-${gameIndex}`;
                            const isCompleted = message.completedGameIndexes?.includes(gameIndex);
                            return activeGameKey === gameKey ? (
                              <div key={gameKey} className="bg-surface-container-lowest rounded-2xl p-3 border border-outline-variant/20">
                                <GameRenderer
                                  type={game.activityType}
                                  data={game.parsed}
                                  onComplete={(result) => handleGameComplete(message.id, gameIndex, result, game.domain)}
                                />
                              </div>
                            ) : (
                              <button
                                key={gameKey}
                                onClick={() => setActiveGameKey(gameKey)}
                                className="flex items-center gap-2 bg-tertiary-container text-on-tertiary-container px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-tertiary-container/80 transition-colors tactile-press w-full"
                              >
                                <Play className="w-4 h-4 fill-current" />
                                <span>{isCompleted
                                  ? `查看 ${game.parsed.title || '练习'}`
                                  : (isSimpleGame(game.activityType) ? `开始 ${game.parsed.title || '练习'}` : `开始 ${game.parsed.title || '游戏'}`)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {message.role === 'user' && (
                      <div className="w-7 h-7 rounded-full bg-primary-container flex items-center justify-center flex-shrink-0 mt-0.5 overflow-hidden">
                        {userAvatarSrc ? (
                          <img src={userAvatarSrc} alt="我的头像" className="h-full w-full object-cover" />
                        ) : (
                          <User className="w-4 h-4 text-on-primary-container" />
                        )}
                      </div>
                    )}
                  </div>
                );})}

                {isLoading && !messages.some((m) => m.isStreaming) && (
                  <div className="flex gap-2 justify-start">
                    <div className="w-7 h-7 rounded-full bg-tertiary-container flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {aiAvatarSrc ? (
                        <img src={aiAvatarSrc} alt="AI头像" className="h-full w-full object-cover" />
                      ) : (
                        <Bot className="w-4 h-4 text-on-tertiary-container" />
                      )}
                    </div>
                    <div className="bg-surface-container px-3.5 py-2.5 rounded-2xl rounded-bl-sm">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-on-surface-variant rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-on-surface-variant rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-on-surface-variant rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {showJumpButton && (
                <button
                  onClick={() => scrollToBottom()}
                  className="touch-target absolute bottom-3 right-3 h-8 w-8 rounded-full bg-on-secondary-container text-white shadow-lg hover:brightness-110"
                  aria-label="回到底部"
                >
                  <ArrowDown className="mx-auto h-4 w-4" />
                </button>
              )}
                </>
              )}
            </div>

            {/* Suggestions */}
            {viewMode === 'chat' && suggestions.length > 0 && !isLoading && (
              <div className="px-4 pb-2 pt-1 flex gap-2 overflow-x-auto flex-shrink-0">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSendStream(s)}
                    className="whitespace-nowrap px-3 py-1.5 rounded-full bg-tertiary-container text-on-tertiary-container text-xs font-medium hover:bg-tertiary-container/80 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            {viewMode === 'chat' && (
            <div className="p-3 border-t border-outline-variant/20 flex-shrink-0 bg-surface-container-lowest/95">
              <div className="flex gap-2 items-end">
                {hasVoiceInput && (
                  <button
                    onClick={handleToggleRecording}
                    className={cn(
                      'touch-target w-8 h-8 rounded-full flex items-center justify-center transition-colors tactile-press flex-shrink-0',
                      isRecording ? 'bg-red-500 text-white animate-voice-pulse' : 'bg-surface-container text-on-surface-variant hover:text-on-surface',
                    )}
                    aria-label={isRecording ? '停止录音' : '开始录音'}
                  >
                    {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                )}
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isRecording ? '正在听你说...' : '输入问题，Enter 发送'}
                  className="flex-1 resize-none bg-surface-container border border-outline-variant/30 rounded-2xl px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 transition-colors leading-5 max-h-[110px]"
                  disabled={isLoading}
                />
                <button
                  onClick={() => handleSendStream()}
                  disabled={!input.trim() || isLoading}
                  className="touch-target w-9 h-9 bg-tertiary rounded-full flex items-center justify-center text-white disabled:opacity-50 disabled:cursor-not-allowed tactile-press flex-shrink-0"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => { setIsOpen(false); setIsMaximized(false); }}
            className="fixed inset-0 bg-black/20 z-[99] sm:hidden" aria-hidden="true" />
        )}
      </AnimatePresence>

      {/* Activity Feedback Overlay */}
      <AnimatePresence>
        {activityFeedback && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            onClick={() => setActivityFeedback(null)}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 p-6"
          >
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              className="bg-surface-container-lowest rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-outline-variant/20 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-5xl mb-4">
                {activityFeedback.score >= 80 ? '\u{1F389}' : activityFeedback.score >= 60 ? '\u{1F44D}' : '\u{1F4AA}'}
              </div>
              <h3 className="text-xl font-bold text-on-surface mb-2">{activityFeedback.message}</h3>
              {/* Score bar */}
              <div className="w-full h-4 bg-surface-container rounded-full overflow-hidden my-4">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${activityFeedback.score}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className="h-full rounded-full"
                  style={{
                    backgroundColor:
                      activityFeedback.score >= 80 ? '#4CAF50' :
                      activityFeedback.score >= 60 ? '#FFC107' : '#FF5722',
                  }}
                />
              </div>
              <p className="text-on-surface-variant text-sm">
                得分: <span className="font-bold text-on-surface">{activityFeedback.score}</span>
                {activityFeedback.total > 0 && (
                  <> · 正确 {activityFeedback.correct}/{activityFeedback.total} 题</>
                )}
              </p>
              <button
                onClick={() => setActivityFeedback(null)}
                className="mt-6 bg-primary text-on-primary px-6 py-2.5 rounded-full font-bold text-sm tactile-press"
              >
                继续学习
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default function AIChat(props: AIChatSharedProps) {
  return <AIChatImpl {...props} layout="floating" />;
}

export function AIChatPage(props: AIChatPageProps) {
  return <AIChatImpl {...props} layout="full-page" />;
}

function LearningArchivePanel({
  childId,
  loading,
  learningPoints,
  wrongQuestions,
  studyPlans,
  conversationSessions,
  selectedSessionId,
  historyMessages,
  historyLoading,
  onSelectSession,
  onRefresh,
}: {
  childId?: number;
  loading: boolean;
  learningPoints: LearningPoint[];
  wrongQuestions: WrongQuestion[];
  studyPlans: StudyPlanRecord[];
  conversationSessions: ConversationSession[];
  selectedSessionId: string | null;
  historyMessages: ConversationMessageHistory[];
  historyLoading: boolean;
  onSelectSession: (sessionId: string | null) => void;
  onRefresh: () => void;
}) {
  if (!childId) {
    return (
      <div className="h-full overflow-y-auto p-4">
        <div className="panel-card p-4 text-sm text-on-surface-variant">
          当前没有绑定学生账号，无法查看学习记录。
        </div>
      </div>
    );
  }

  const wrongCount = wrongQuestions.filter((item) => item.status !== 'mastered').length;
  const masteredCount = wrongQuestions.filter((item) => item.status === 'mastered').length;
  const now = Date.now();

  return (
    <div className="h-full overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-surface-container-lowest via-surface-container-lowest to-surface-container/20">
      <div className="panel-card flex items-center justify-between px-3 py-2">
        <div className="text-xs font-bold text-on-surface-variant">学习记录总览</div>
        <button
          onClick={onRefresh}
          className="rounded-full bg-primary-container/40 px-3 py-1 text-xs font-semibold text-on-primary-container hover:bg-primary-container/60"
        >
          刷新
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="panel-card p-2 text-center">
          <p className="text-lg font-black text-on-surface">{learningPoints.length}</p>
          <p className="text-[10px] text-on-surface-variant">学习点</p>
        </div>
        <div className="panel-card p-2 text-center">
          <p className="text-lg font-black text-on-surface">{wrongCount}</p>
          <p className="text-[10px] text-on-surface-variant">待巩固</p>
        </div>
        <div className="panel-card p-2 text-center">
          <p className="text-lg font-black text-on-surface">{masteredCount}</p>
          <p className="text-[10px] text-on-surface-variant">已掌握</p>
        </div>
      </div>

      <div className="panel-card p-3">
        <h4 className="mb-2 text-sm font-bold text-on-surface">学到的内容</h4>
        {loading ? (
          <p className="text-xs text-on-surface-variant">加载中...</p>
        ) : learningPoints.length === 0 ? (
          <p className="text-xs text-on-surface-variant">暂无学习点记录</p>
        ) : (
          <div className="space-y-2">
            {learningPoints.slice(0, 8).map((point) => {
              const cooling = new Date(point.cooldownUntil).getTime() > now;
              return (
                <div key={point.id} className="rounded-xl bg-surface-container px-3 py-2">
                  <p className="text-xs font-semibold text-on-surface">{point.pointLabel}</p>
                  <p className="mt-0.5 text-[10px] text-on-surface-variant">
                    {point.domain || '综合'} · {cooling ? '冷却中' : '可推荐'} · {new Date(point.lastLearnedAt).toLocaleString('zh-CN')}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="panel-card p-3">
        <h4 className="mb-2 text-sm font-bold text-on-surface">错题本</h4>
        {wrongQuestions.length === 0 ? (
          <p className="text-xs text-on-surface-variant">暂无错题记录</p>
        ) : (
          <div className="space-y-2">
            {wrongQuestions.slice(0, 8).map((wrong) => (
              <div key={wrong.id} className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2">
                <p className="text-xs font-semibold text-on-surface">{wrong.questionText}</p>
                <p className="mt-1 text-[10px] text-on-surface-variant">
                  你的答案: {wrong.userAnswer || '未作答'} · 正确答案: {wrong.correctAnswer || '-'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel-card p-3">
        <h4 className="mb-2 text-sm font-bold text-on-surface">历史计划</h4>
        {studyPlans.length === 0 ? (
          <p className="text-xs text-on-surface-variant">暂无历史计划</p>
        ) : (
          <div className="space-y-2">
            {studyPlans.slice(0, 8).map((plan) => (
              <div key={plan.id} className="rounded-xl bg-surface-container px-3 py-2">
                <p className="text-xs font-semibold text-on-surface">{plan.title}</p>
                <p className="mt-0.5 text-[10px] text-on-surface-variant">
                  {plan.sourceType === 'ai_generated' ? 'AI计划' : '家长作业'} · {new Date(plan.createdAt).toLocaleString('zh-CN')}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel-card p-3">
        <h4 className="mb-2 text-sm font-bold text-on-surface">历史对话</h4>
        {conversationSessions.length === 0 ? (
          <p className="text-xs text-on-surface-variant">暂无历史会话</p>
        ) : (
          <div className="space-y-2">
            {conversationSessions.slice(0, 8).map((session) => (
              <button
                key={session.uuid}
                onClick={() => onSelectSession(selectedSessionId === session.uuid ? null : session.uuid)}
                className={cn(
                  'w-full rounded-xl px-3 py-2 text-left transition-colors',
                  selectedSessionId === session.uuid
                    ? 'bg-primary-container/35 text-on-primary-container'
                    : 'bg-surface-container text-on-surface hover:bg-surface-container-high',
                )}
              >
                <p className="text-xs font-semibold">会话 {session.uuid.slice(0, 8)}</p>
                <p className="text-[10px] opacity-80">
                  {session.messageCount} 条消息 · {new Date(session.updatedAt).toLocaleString('zh-CN')}
                </p>
              </button>
            ))}
          </div>
        )}

        {selectedSessionId && (
          <div className="mt-3 rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-2">
            <p className="mb-2 text-[11px] font-bold text-on-surface-variant">会话详情</p>
            {historyLoading ? (
              <p className="text-xs text-on-surface-variant">加载中...</p>
            ) : historyMessages.length === 0 ? (
              <p className="text-xs text-on-surface-variant">暂无消息</p>
            ) : (
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {historyMessages.map((msg) => (
                  <div key={msg.id} className="rounded-lg bg-surface-container px-2 py-1.5">
                    <p className="text-[10px] font-bold text-on-surface-variant">{msg.role}</p>
                    <p className="text-xs text-on-surface line-clamp-3">{msg.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Collapsible process section for thinking & tool calls */
function ProcessSection({ message, expandedSections, toggleSection }: {
  message: Message;
  expandedSections: Record<string, { thinking: boolean; tools: boolean }>;
  toggleSection: (id: string, section: 'thinking' | 'tools') => void;
}) {
  return (
    <div className="mb-1.5">
      {message.thinkingSteps.length > 0 && (
        <div className="rounded-lg overflow-hidden border border-outline-variant/30 mb-1">
          <button onClick={() => toggleSection(message.id, 'thinking')}
            className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-on-surface-variant hover:bg-surface-container-high transition-colors">
            <Brain className="w-3.5 h-3.5" />
            <span className="flex-1 text-left">思考过程 {message.isStreaming && <Loader2 className="w-3 h-3 inline animate-spin" />}</span>
            {expandedSections[message.id]?.thinking ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
          <AnimatePresence>
            {expandedSections[message.id]?.thinking && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                <div className="px-2.5 py-2 text-xs text-on-surface-variant bg-surface-container/50 border-t border-outline-variant/20 max-h-32 overflow-y-auto whitespace-pre-wrap">
                  {message.thinkingSteps.map((ts) => <div key={ts.id}>{ts.content}</div>)}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
      {message.toolSteps.length > 0 && (
        <div className="rounded-lg overflow-hidden border border-outline-variant/30">
          <button onClick={() => toggleSection(message.id, 'tools')}
            className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-on-surface-variant hover:bg-surface-container-high transition-colors">
            <Wrench className="w-3.5 h-3.5" />
            <span className="flex-1 text-left">
              工具调用 ({message.toolSteps.filter(t => t.status === 'done').length}/{message.toolSteps.length})
              {message.toolSteps.some(t => t.status === 'running') && <Loader2 className="w-3 h-3 inline animate-spin ml-1" />}
            </span>
            {expandedSections[message.id]?.tools ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
          <AnimatePresence>
            {expandedSections[message.id]?.tools && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                <div className="px-2.5 py-2 text-xs text-on-surface-variant bg-surface-container/50 border-t border-outline-variant/20 max-h-40 overflow-y-auto space-y-1.5">
                  {message.toolSteps.map((step) => (
                    <div key={step.id} className="flex items-start gap-1.5">
                      {step.status === 'running' ? (
                        <Loader2 className="w-3 h-3 mt-0.5 animate-spin text-primary flex-shrink-0" />
                      ) : (
                        <span className="w-3 h-3 mt-0.5 rounded-full bg-primary-container flex-shrink-0 flex items-center justify-center text-[8px] text-on-primary-container">&#10003;</span>
                      )}
                      <span className="font-medium text-on-surface">{step.toolName}</span>
                      {step.result && (
                        <span className="text-on-surface-variant truncate">
                          {(() => { try { const p = JSON.parse(step.result); return p.error || p.message || p.content || step.result.slice(0, 60); } catch { return step.result.slice(0, 60); } })()}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

