import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { MessageCircle, X, Send, Loader2, Bot, User, ChevronDown, ChevronRight, Brain, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/services/api';

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

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  // Collapsible process steps
  thinkingSteps: ThinkingStep[];
  toolSteps: ToolStep[];
}

interface AIChatProps {
  childId?: number;
}

export default function AIChat({ childId }: AIChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  // Track which process sections are expanded per message
  const [expandedSections, setExpandedSections] = useState<Record<string, { thinking: boolean; tools: boolean }>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dragControls = useDragControls();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          id: '1',
          role: 'assistant',
          content: '你好呀！我是你的AI学习伙伴！有什么问题都可以问我哦~',
          timestamp: new Date(),
          thinkingSteps: [],
          toolSteps: [],
        },
      ]);
    }
  }, [isOpen, messages.length]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const toggleSection = (msgId: string, section: 'thinking' | 'tools') => {
    setExpandedSections((prev) => ({
      ...prev,
      [msgId]: {
        thinking: prev[msgId]?.thinking ?? false,
        tools: prev[msgId]?.tools ?? false,
        [section]: !(prev[msgId]?.[section] ?? false),
      },
    }));
  };

  const handleSendStream = useCallback(async (overrideMessage?: string) => {
    const messageText = overrideMessage || input.trim();
    if (!messageText || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText,
      timestamp: new Date(),
      thinkingSteps: [],
      toolSteps: [],
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!overrideMessage) setInput('');
    setIsLoading(true);
    setSuggestions([]);

    const assistantId = (Date.now() + 1).toString();

    try {
      const response = await api.sendChatMessageStream({
        message: messageText,
        childId,
        sessionId,
      });

      if (!response.ok || !response.body) {
        throw new Error('Stream failed');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      // Create placeholder assistant message
      setMessages((prev) => [
        ...prev,
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
                // Add thinking step
                thinkingCounter++;
                const thinkingId = `thinking-${assistantId}-${thinkingCounter}`;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, thinkingSteps: [...m.thinkingSteps, { id: thinkingId, content: data.content || data }] }
                      : m
                  )
                );
              } else if (currentEvent === 'tool_start') {
                // Add running tool step
                toolStepCounter++;
                const toolStepId = `tool-${assistantId}-${toolStepCounter}`;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, toolSteps: [...m.toolSteps, { id: toolStepId, toolName: data.toolName || data.content, args: data.toolArgs || {}, status: 'running' }] }
                      : m
                  )
                );
              } else if (currentEvent === 'tool_result') {
                // Update last running tool step with result
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== assistantId) return m;
                    const steps = [...m.toolSteps];
                    // Find last running step with matching name
                    for (let j = steps.length - 1; j >= 0; j--) {
                      if (steps[j].status === 'running' && steps[j].toolName === (data.toolName || data.content)) {
                        steps[j] = { ...steps[j], status: 'done', result: data.toolResult };
                        break;
                      }
                    }
                    return { ...m, toolSteps: steps };
                  })
                );
              } else if (currentEvent === 'token' && data.content) {
                fullContent += data.content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: fullContent }
                      : m
                  )
                );
              }
            } catch {}
            currentEvent = '';
          }
        }
      }

      // Finalize
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: fullContent || '抱歉，我暂时无法回答这个问题。', isStreaming: false }
            : m
        )
      );
    } catch {
      try {
        const response = await api.sendChatMessage({
          message: messageText,
          childId,
          sessionId,
        });

        if (response.sessionId) setSessionId(response.sessionId);
        if (response.suggestions?.length) setSuggestions(response.suggestions);

        setMessages((prev) => [
          ...prev.filter((m) => m.id !== assistantId),
          {
            id: assistantId,
            role: 'assistant',
            content: response.reply || '抱歉，我暂时无法回答这个问题。',
            timestamp: new Date(),
            thinkingSteps: [],
            toolSteps: [],
          },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== assistantId),
          {
            id: assistantId,
            role: 'assistant',
            content: '抱歉，网络好像有点问题，请稍后再试~',
            timestamp: new Date(),
            thinkingSteps: [],
            toolSteps: [],
          },
        ]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, childId, sessionId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendStream();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    handleSendStream(suggestion);
  };

  const hasProcessSteps = (msg: Message) => msg.thinkingSteps.length > 0 || msg.toolSteps.length > 0;

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(true)}
        aria-label="打开AI学习伙伴"
        className={cn(
          "fixed right-6 bottom-24 w-16 h-16 bg-tertiary rounded-full flex items-center justify-center shadow-2xl text-white tactile-press z-40 border-b-4 border-tertiary-dim transition-all hover:scale-110",
          isOpen && "opacity-0 pointer-events-none"
        )}
      >
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
            drag="y"
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.3}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100) {
                setIsOpen(false);
              }
            }}
            className="fixed right-4 bottom-20 w-[calc(100%-2rem)] sm:w-96 h-[70vh] max-h-[500px] bg-surface-container-lowest rounded-3xl shadow-2xl z-50 flex flex-col overflow-hidden border border-outline-variant/20"
            role="dialog"
            aria-label="AI学习伙伴对话"
            aria-modal="true"
          >
            {/* Header */}
            <div
              className="bg-tertiary px-5 py-4 flex items-center justify-between cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="absolute left-1/2 -translate-x-1/2 top-2 w-8 h-1 bg-white/30 rounded-full sm:hidden" />
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <Bot className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-bold">AI 学习伙伴</h3>
                  <p className="text-white/70 text-xs">随时为你解答问题</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                aria-label="关闭AI对话"
                className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div
              className="flex-1 overflow-y-auto p-4 space-y-4"
              aria-live="polite"
              aria-label="对话消息"
            >
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-2",
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-tertiary-container flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="w-5 h-5 text-on-tertiary-container" />
                    </div>
                  )}
                  <div className={cn("max-w-[80%] min-w-0")}>
                    {/* Collapsible process section */}
                    {message.role === 'assistant' && hasProcessSteps(message) && (
                      <div className="mb-1.5">
                        {/* Thinking section */}
                        {message.thinkingSteps.length > 0 && (
                          <div className="rounded-lg overflow-hidden border border-outline-variant/30 mb-1">
                            <button
                              onClick={() => toggleSection(message.id, 'thinking')}
                              className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-on-surface-variant hover:bg-surface-container-high transition-colors"
                            >
                              <Brain className="w-3.5 h-3.5" />
                              <span className="flex-1 text-left">
                                思考过程 {message.isStreaming && <Loader2 className="w-3 h-3 inline animate-spin" />}
                              </span>
                              {expandedSections[message.id]?.thinking ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <AnimatePresence>
                              {expandedSections[message.id]?.thinking && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="px-2.5 py-2 text-xs text-on-surface-variant bg-surface-container/50 border-t border-outline-variant/20 max-h-32 overflow-y-auto whitespace-pre-wrap">
                                    {message.thinkingSteps.map((ts) => (
                                      <div key={ts.id}>{ts.content}</div>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}

                        {/* Tool calls section */}
                        {message.toolSteps.length > 0 && (
                          <div className="rounded-lg overflow-hidden border border-outline-variant/30">
                            <button
                              onClick={() => toggleSection(message.id, 'tools')}
                              className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-on-surface-variant hover:bg-surface-container-high transition-colors"
                            >
                              <Wrench className="w-3.5 h-3.5" />
                              <span className="flex-1 text-left">
                                工具调用 ({message.toolSteps.filter(t => t.status === 'done').length}/{message.toolSteps.length})
                                {message.toolSteps.some(t => t.status === 'running') && <Loader2 className="w-3 h-3 inline animate-spin ml-1" />}
                              </span>
                              {expandedSections[message.id]?.tools ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <AnimatePresence>
                              {expandedSections[message.id]?.tools && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
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
                                            {(() => {
                                              try {
                                                const parsed = JSON.parse(step.result);
                                                return parsed.error || parsed.message || parsed.content || step.result.slice(0, 60);
                                              } catch {
                                                return step.result.slice(0, 60);
                                              }
                                            })()}
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
                    )}

                    {/* Main message content */}
                    <div
                      className={cn(
                        "px-4 py-2.5 rounded-2xl text-sm",
                        message.role === 'user'
                          ? 'bg-primary text-on-primary rounded-br-sm'
                          : 'bg-surface-container text-on-surface rounded-bl-sm'
                      )}
                    >
                      {message.content}
                      {message.isStreaming && !message.content && (
                        <span className="inline-block w-1.5 h-4 bg-on-surface animate-pulse" />
                      )}
                    </div>
                  </div>
                  {message.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="w-5 h-5 text-on-primary-container" />
                    </div>
                  )}
                </div>
              ))}

              {/* Typing Indicator */}
              {isLoading && !messages.some(m => m.isStreaming) && (
                <div className="flex gap-2 justify-start" role="status" aria-label="AI正在输入">
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

            {/* Suggestion chips */}
            {suggestions.length > 0 && !isLoading && (
              <div className="px-4 pb-2 flex gap-2 overflow-x-auto">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestionClick(s)}
                    className="whitespace-nowrap px-3 py-1.5 rounded-full bg-tertiary-container text-on-tertiary-container text-xs font-medium hover:bg-tertiary-container/80 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="p-4 border-t border-outline-variant/20">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入你的问题..."
                  aria-label="输入消息"
                  className="flex-1 bg-surface-container border border-outline-variant/30 rounded-full px-4 py-2.5 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 transition-colors"
                  disabled={isLoading}
                />
                <button
                  onClick={() => handleSendStream()}
                  disabled={!input.trim() || isLoading}
                  aria-label="发送消息"
                  className="w-10 h-10 bg-tertiary rounded-full flex items-center justify-center text-white disabled:opacity-50 disabled:cursor-not-allowed tactile-press"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlay for mobile */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/20 z-40 sm:hidden"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>
    </>
  );
}
