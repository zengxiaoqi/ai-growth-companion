import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { MessageCircle, X, Send, Loader2, Bot, User, ChevronDown, ChevronRight, Brain, Wrench, Maximize2, Minimize2, GripVertical, ArrowLeft, Play } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import api from '@/services/api';
import type { ActivityType, ActivityData, ActivityResult, ActivityFeedback } from '@/types';
import GameRenderer from './games/GameRenderer';

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
}

interface AIChatProps {
  childId?: number;
  parentId?: number;
  /** When true, renders as a full-page view instead of a floating widget */
  fullPage?: boolean;
  /** Back navigation for full-page mode */
  onBack?: () => void;
}

export default function AIChat({ childId, parentId, fullPage = false, onBack }: AIChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [isMaximized, setIsMaximized] = useState(false);
  const [size, setSize] = useState({ w: 384, h: 500 });
  const [expandedSections, setExpandedSections] = useState<Record<string, { thinking: boolean; tools: boolean }>>({});
  const [activeGameMsgId, setActiveGameMsgId] = useState<string | null>(null);
  const [activityFeedback, setActivityFeedback] = useState<ActivityFeedback | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragControls = useDragControls();
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        id: '1', role: 'assistant',
        content: '你好呀！我是你的AI学习伙伴！有什么问题都可以问我哦~',
        timestamp: new Date(), thinkingSteps: [], toolSteps: [],
      }]);
    }
  }, [isOpen, messages.length]);

  useEffect(() => {
    if (isOpen || fullPage) setTimeout(() => inputRef.current?.focus(), 300);
  }, [isOpen, fullPage]);

  // Resize handler
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startW: size.w, startH: size.h };

    const handleMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const dx = resizeRef.current.startX - ev.clientX; // drag left edge to widen
      const dy = ev.clientY - resizeRef.current.startY; // drag bottom to heighten
      setSize({
        w: Math.min(Math.max(resizeRef.current.startW + dx, 320), window.innerWidth - 40),
        h: Math.min(Math.max(resizeRef.current.startH + dy, 400), window.innerHeight - 100),
      });
    };
    const handleUp = () => {
      resizeRef.current = null;
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [size]);

  const toggleSection = (msgId: string, section: 'thinking' | 'tools') => {
    setExpandedSections((prev) => ({
      ...prev,
      [msgId]: { thinking: prev[msgId]?.thinking ?? false, tools: prev[msgId]?.tools ?? false, [section]: !(prev[msgId]?.[section] ?? false) },
    }));
  };

  const handleSendStream = useCallback(async (overrideMessage?: string) => {
    const messageText = overrideMessage || input.trim();
    if (!messageText || isLoading) return;

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
                  const parsed = typeof data.gameData === 'string' ? JSON.parse(data.gameData) : data.gameData;
                  setMessages((prev) => prev.map((m) =>
                    m.id === assistantId ? { ...m, gameData: { activityType: data.activityType, gameData: data.gameData, parsed } } : m
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
          id: assistantId, role: 'assistant', content: '抱歉，网络好像有点问题，请稍后再试~',
          timestamp: new Date(), thinkingSteps: [], toolSteps: [],
        }]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, childId, parentId, sessionId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendStream(); }
  };

  const hasProcessSteps = (msg: Message) => msg.thinkingSteps.length > 0 || msg.toolSteps.length > 0;

  const isSimpleGame = (type: ActivityType) => ['quiz', 'true_false', 'fill_blank'].includes(type);

  const handleGameComplete = useCallback((_msgId: string, result: ActivityResult) => {
    setActiveGameMsgId(null);
    // Show feedback overlay
    const scorePercent = result.totalQuestions > 0 ? (result.correctAnswers / result.totalQuestions) * 100 : result.score;
    const feedback: ActivityFeedback = {
      score: Math.round(scorePercent),
      total: result.totalQuestions,
      correct: result.correctAnswers,
      domain: '',
      message: scorePercent >= 60
        ? `太棒了！你答对了 ${result.correctAnswers}/${result.totalQuestions} 题！`
        : '加油！继续努力！',
    };
    setActivityFeedback(feedback);
    // Auto-dismiss after 5 seconds
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setActivityFeedback(null), 5000);
  }, []);

  // Full-page mode: no floating button, just the chat UI directly
  if (fullPage) {
    return (
      <div className="flex flex-col h-full bg-surface-container-lowest">
        {/* Header */}
        <div className="bg-tertiary px-5 py-4 flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} aria-label="返回" className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-white font-bold text-lg">AI 学习伙伴</h3>
            <p className="text-white/70 text-xs">随时为你解答问题</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4" aria-live="polite">
          {messages.map((message) => (
            <div key={message.id} className={cn("flex gap-2", message.role === 'user' ? 'justify-end' : 'justify-start')}>
              {message.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-tertiary-container flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="w-5 h-5 text-on-tertiary-container" />
                </div>
              )}
              <div className={cn("max-w-[80%] min-w-0")}>
                {message.role === 'assistant' && hasProcessSteps(message) && (
                  <ProcessSection message={message} expandedSections={expandedSections} toggleSection={toggleSection} />
                )}
                <div className={cn(
                  "px-4 py-2.5 rounded-2xl text-sm",
                  message.role === 'user' ? 'bg-primary text-on-primary rounded-br-sm' : 'bg-surface-container text-on-surface rounded-bl-sm'
                )}>
                  {message.role === 'assistant' ? (
                    <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-hr:my-2 prose-strong:text-on-surface">
                      {message.gameData?.parsed ? (
                        <p>我为你准备了练习题，点击下方按钮开始挑战吧！ 🎮</p>
                      ) : (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                      )}
                    </div>
                  ) : message.content}
                  {message.isStreaming && !message.content && (
                    <span className="inline-block w-1.5 h-4 bg-on-surface animate-pulse" />
                  )}
                </div>
                {/* Game rendering */}
                {message.role === 'assistant' && message.gameData?.parsed && (
                  activeGameMsgId === message.id ? (
                    <div className="mt-2 bg-surface-container-lowest rounded-2xl p-3 border border-outline-variant/20">
                      <GameRenderer
                        type={message.gameData.activityType}
                        data={message.gameData.parsed}
                        onComplete={(result) => handleGameComplete(message.id, result)}
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setActiveGameMsgId(message.id)}
                      className="mt-2 flex items-center gap-2 bg-tertiary-container text-on-tertiary-container px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-tertiary-container/80 transition-colors tactile-press w-full"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      {isSimpleGame(message.gameData.activityType) ? `开始${message.gameData.parsed.title || '练习'}` : `开始${message.gameData.parsed.title || '游戏'}`}
                    </button>
                  )
                )}
              </div>
              {message.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User className="w-5 h-5 text-on-primary-container" />
                </div>
              )}
            </div>
          ))}
          {isLoading && !messages.some(m => m.isStreaming) && (
            <div className="flex gap-2 justify-start">
              <div className="w-8 h-8 rounded-full bg-tertiary-container flex items-center justify-center flex-shrink-0">
                <Bot className="w-5 h-5 text-on-tertiary-container" />
              </div>
              <div className="bg-surface-container px-4 py-2.5 rounded-2xl rounded-bl-sm">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-on-surface-variant rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-2 h-2 bg-on-surface-variant rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-2 h-2 bg-on-surface-variant rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggestions */}
        {suggestions.length > 0 && !isLoading && (
          <div className="px-4 pb-2 flex gap-2 overflow-x-auto">
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => handleSendStream(s)}
                className="whitespace-nowrap px-3 py-1.5 rounded-full bg-tertiary-container text-on-tertiary-container text-xs font-medium hover:bg-tertiary-container/80 transition-colors">
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-outline-variant/20">
          <div className="flex gap-2">
            <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown} placeholder="输入你的问题..."
              className="flex-1 bg-surface-container border border-outline-variant/30 rounded-full px-4 py-2.5 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 transition-colors"
              disabled={isLoading} />
            <button onClick={() => handleSendStream()} disabled={!input.trim() || isLoading}
              className="w-10 h-10 bg-tertiary rounded-full flex items-center justify-center text-white disabled:opacity-50 disabled:cursor-not-allowed tactile-press">
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
        </div>

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
                        activityFeedback.score >= 80 ? '#4CAF50' :
                        activityFeedback.score >= 60 ? '#FFC107' : '#FF5722',
                    }}
                  />
                </div>
                <p className="text-on-surface-variant text-sm">
                  得分：<span className="font-bold text-on-surface">{activityFeedback.score}</span> 分
                  {activityFeedback.total > 0 && (
                    <> &middot; 正确 {activityFeedback.correct}/{activityFeedback.total} 题</>
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
      <button onClick={() => setIsOpen(true)} aria-label="打开AI学习伙伴"
        className={cn(
          "fixed right-6 bottom-24 w-16 h-16 bg-tertiary rounded-full flex items-center justify-center shadow-2xl text-white tactile-press z-[100] border-b-4 border-tertiary-dim transition-all hover:scale-110",
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
              "fixed right-4 bottom-20 bg-surface-container-lowest rounded-3xl shadow-2xl z-[100] flex flex-col overflow-hidden border border-outline-variant/20",
              isMaximized
                ? "inset-4 bottom-20 rounded-3xl"
                : ""
            )}
            style={!isMaximized ? { width: size.w, height: size.h } : undefined}
            role="dialog" aria-label="AI学习伙伴对话" aria-modal="true"
          >
            {/* Header */}
            <div className="bg-tertiary px-5 py-3 flex items-center justify-between flex-shrink-0"
              onPointerDown={(e) => !isMaximized && dragControls.start(e)}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm">AI 学习伙伴</h3>
                  <p className="text-white/70 text-[10px]">随时为你解答问题</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setIsMaximized(!isMaximized)} aria-label={isMaximized ? '还原' : '最大化'}
                  className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors">
                  {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button onClick={() => { setIsOpen(false); setIsMaximized(false); }} aria-label="关闭AI对话"
                  className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Resize handle */}
            {!isMaximized && (
              <div className="absolute top-0 left-0 bottom-0 w-3 cursor-ew-resize z-10 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                onMouseDown={handleResizeMouseDown}>
                <GripVertical className="w-2 h-8 text-on-surface-variant/30" />
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4" aria-live="polite">
              {messages.map((message) => (
                <div key={message.id} className={cn("flex gap-2", message.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {message.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-full bg-tertiary-container flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="w-4 h-4 text-on-tertiary-container" />
                    </div>
                  )}
                  <div className={cn("max-w-[80%] min-w-0")}>
                    {message.role === 'assistant' && hasProcessSteps(message) && (
                      <ProcessSection message={message} expandedSections={expandedSections} toggleSection={toggleSection} />
                    )}
                    <div className={cn(
                      "px-3.5 py-2 rounded-2xl text-sm",
                      message.role === 'user' ? 'bg-primary text-on-primary rounded-br-sm' : 'bg-surface-container text-on-surface rounded-bl-sm'
                    )}>
                      {message.role === 'assistant' ? (
                        <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-hr:my-2 prose-strong:text-on-surface">
                          {message.gameData?.parsed ? (
                            <p>我为你准备了练习题，点击下方按钮开始吧！ 🎮</p>
                          ) : (
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                          )}
                     </div>
                  ) : message.content}
                  {message.isStreaming && !message.content && (
                    <span className="inline-block w-1.5 h-4 bg-on-surface animate-pulse" />
                  )}
                </div>
                {/* Game rendering */}
                {message.role === 'assistant' && message.gameData?.parsed && (
                  activeGameMsgId === message.id ? (
                    <div className="mt-2 bg-surface-container-lowest rounded-2xl p-3 border border-outline-variant/20">
                      <GameRenderer
                        type={message.gameData.activityType}
                        data={message.gameData.parsed}
                        onComplete={(result) => handleGameComplete(message.id, result)}
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setActiveGameMsgId(message.id)}
                      className="mt-2 flex items-center gap-2 bg-tertiary-container text-on-tertiary-container px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-tertiary-container/80 transition-colors tactile-press w-full"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>开始挑战</span>
                    </button>
                  )
                )}
              </div>
              {message.role === 'user' && (
                    <div className="w-7 h-7 rounded-full bg-primary-container flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="w-4 h-4 text-on-primary-container" />
                    </div>
                  )}
                </div>
              ))}

              {isLoading && !messages.some(m => m.isStreaming) && (
                <div className="flex gap-2 justify-start">
                  <div className="w-7 h-7 rounded-full bg-tertiary-container flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-on-tertiary-container" />
                  </div>
                  <div className="bg-surface-container px-3.5 py-2.5 rounded-2xl rounded-bl-sm">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-on-surface-variant rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="w-2 h-2 bg-on-surface-variant rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="w-2 h-2 bg-on-surface-variant rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Suggestions */}
            {suggestions.length > 0 && !isLoading && (
              <div className="px-4 pb-2 flex gap-2 overflow-x-auto flex-shrink-0">
                {suggestions.map((s, i) => (
                  <button key={i} onClick={() => handleSendStream(s)}
                    className="whitespace-nowrap px-3 py-1.5 rounded-full bg-tertiary-container text-on-tertiary-container text-xs font-medium hover:bg-tertiary-container/80 transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="p-3 border-t border-outline-variant/20 flex-shrink-0">
              <div className="flex gap-2">
                <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown} placeholder="输入你的问题..."
                  className="flex-1 bg-surface-container border border-outline-variant/30 rounded-full px-4 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 transition-colors"
                  disabled={isLoading} />
                <button onClick={() => handleSendStream()} disabled={!input.trim() || isLoading}
                  className="w-9 h-9 bg-tertiary rounded-full flex items-center justify-center text-white disabled:opacity-50 disabled:cursor-not-allowed tactile-press">
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
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
                得分：<span className="font-bold text-on-surface">{activityFeedback.score}</span> 分
                {activityFeedback.total > 0 && (
                  <> &middot; 正确 {activityFeedback.correct}/{activityFeedback.total} 题</>
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
