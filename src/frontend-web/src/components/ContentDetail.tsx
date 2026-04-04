import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Play,
  CheckCircle,
  Loader2,
  Clock,
  Star,
  MessageCircle,
  Calculator,
  Microscope,
  Palette,
  Users,
  Sparkles,
  Volume2,
  Pause,
  BookOpen,
  AlertCircle,
} from 'lucide-react';
import { cn } from '../lib/utils';
import api from '../services/api';
import { getAudioVolume } from '@/lib/app-settings';
import type { Content, LearningRecord } from '@/types';
import QuizEngine, { type QuizSection } from './quiz/QuizEngine';

interface ContentDetailProps {
  contentId: number;
  childId?: number;
  onBack: () => void;
  onComplete?: (record: LearningRecord) => void;
}

export default function ContentDetail({ contentId, childId, onBack, onComplete }: ContentDetailProps) {
  const [content, setContent] = useState<Content | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [learningRecord, setLearningRecord] = useState<LearningRecord | null>(null);
  const [score, setScore] = useState<number>(85);
  const [showEvaluation, setShowEvaluation] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [isQuizMode, setIsQuizMode] = useState(false);
  const [quizCompleted, setQuizCompleted] = useState(false);

  // Parse interactive content from JSON
  const quizSections: QuizSection[] = useMemo(() => {
    if (!content?.content) return [];
    try {
      const parsed = JSON.parse(content.content);
      if (Array.isArray(parsed)) {
        const sectionsWithQuestions = parsed.filter(
          (item: Record<string, unknown>) =>
            Array.isArray(item.questions) && item.questions.length > 0
        );
        if (sectionsWithQuestions.length > 0) {
          return sectionsWithQuestions as QuizSection[];
        }
      }
    } catch {
      // Not JSON - plain text content
    }
    return [];
  }, [content?.content]);

  const hasInteractiveContent = quizSections.length > 0;

  // Plain text to display (for non-JSON or story text)
  const displayText = useMemo(() => {
    if (!content?.content) return null;
    try {
      const parsed = JSON.parse(content.content);
      if (Array.isArray(parsed)) {
        // Extract story text from sections
        return parsed
          .filter((item: Record<string, unknown>) => typeof item.text === 'string')
          .map((item: Record<string, unknown>) => item.text as string)
          .join('\n\n');
      }
    } catch {
      return content.content;
    }
    return null;
  }, [content?.content]);

  // Fetch content on mount
  useEffect(() => {
    const fetchContent = async () => {
      try {
        setIsLoading(true);
        const data = await api.getContent(contentId);
        setContent(data);
      } catch (err) {
        console.error('Failed to fetch content:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (contentId) {
      fetchContent();
    }
  }, [contentId]);

  // Cleanup speech on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  // Toggle audio playback using Web Speech API
  const handleToggleAudio = useCallback(() => {
    if (!content?.content) return;

    if (isPlayingAudio) {
      window.speechSynthesis.cancel();
      setIsPlayingAudio(false);
      return;
    }

    const textToSpeak = displayText || content.content;
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.85;
    utterance.pitch = 1.1;
    utterance.volume = getAudioVolume();

    utterance.onstart = () => {
      setAudioLoading(false);
      setIsPlayingAudio(true);
    };

    utterance.onend = () => {
      setIsPlayingAudio(false);
    };

    utterance.onerror = () => {
      setAudioLoading(false);
      setIsPlayingAudio(false);
      console.error('TTS audio playback error');
    };

    setAudioLoading(true);
    window.speechSynthesis.speak(utterance);
  }, [content?.content, displayText, isPlayingAudio]);

  // Handle start learning
  const [startError, setStartError] = useState<string | null>(null);

  const handleStartLearning = async () => {
    if (!childId || !contentId) {
      setStartError(childId ? '内容ID无效' : '请以孩子身份登录后开始学习');
      return;
    }

    try {
      setIsStarting(true);
      setStartError(null);
      const record = await api.startLearning({ childId, contentId });
      setLearningRecord(record);
      // If content has interactive quiz sections, enter quiz mode
      if (hasInteractiveContent) {
        setIsQuizMode(true);
      }
    } catch (err: any) {
      console.error('Failed to start learning:', err);
      setStartError(err?.message || '开始学习失败，请稍后重试');
    } finally {
      setIsStarting(false);
    }
  };

  // Handle quiz completion
  const handleQuizComplete = useCallback(
    async (correctCount: number, totalQuestions: number) => {
      if (!learningRecord) return;

      const quizScore =
        totalQuestions > 0
          ? Math.round((correctCount / totalQuestions) * 100)
          : 85;
      setScore(quizScore);
      setQuizCompleted(true);
      setIsQuizMode(false);

      try {
        setIsCompleting(true);
        const record = await api.completeLearning({
          recordId: learningRecord.id,
          score: quizScore,
          feedback: `答对 ${correctCount}/${totalQuestions} 题`,
        });
        setLearningRecord(record);
        setShowEvaluation(true);
        onComplete?.(record);
      } catch (err) {
        console.error('Failed to complete learning:', err);
      } finally {
        setIsCompleting(false);
      }
    },
    [learningRecord, onComplete]
  );

  // Handle complete learning
  const handleComplete = async () => {
    if (!learningRecord) return;
    
    try {
      setIsCompleting(true);
      const record = await api.completeLearning({
        recordId: learningRecord.id,
        score,
        feedback: '完成学习',
      });
      setLearningRecord(record);
      setShowEvaluation(true);
      onComplete?.(record);
    } catch (err) {
      console.error('Failed to complete learning:', err);
    } finally {
      setIsCompleting(false);
    }
  };

  // Domain icons
  const getDomainIcon = (domain: string) => {
    switch (domain) {
      case 'language': return MessageCircle;
      case 'math': return Calculator;
      case 'science': return Microscope;
      case 'art': return Palette;
      case 'social': return Users;
      default: return Sparkles;
    }
  };

  // Domain colors
  const getDomainColor = (domain: string) => {
    switch (domain) {
      case 'language': return { bg: 'bg-secondary-container', text: 'text-on-secondary-container' };
      case 'math': return { bg: 'bg-tertiary-container', text: 'text-on-tertiary-container' };
      case 'science': return { bg: 'bg-primary-container', text: 'text-on-primary-container' };
      case 'art': return { bg: 'bg-surface-container-highest', text: 'text-outline' };
      case 'social': return { bg: 'bg-[#ffefec]', text: 'text-error' };
      default: return { bg: 'bg-surface-container', text: 'text-on-surface' };
    }
  };

  // Domain labels
  const getDomainLabel = (domain: string) => {
    switch (domain) {
      case 'language': return '语言';
      case 'math': return '数学';
      case 'science': return '科学';
      case 'art': return '艺术';
      case 'social': return '社会';
      default: return '学习';
    }
  };

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 bg-background z-50 flex items-center justify-center"
      >
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
          <p className="text-on-surface-variant font-medium">加载中...</p>
        </div>
      </motion.div>
    );
  }

  if (!content) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 bg-background z-50 flex items-center justify-center"
      >
        <div className="text-center">
          <p className="text-on-surface-variant">内容不存在</p>
          <button 
            onClick={onBack}
            className="mt-4 px-6 py-3 bg-primary text-on-primary rounded-full font-bold"
          >
            返回
          </button>
        </div>
      </motion.div>
    );
  }

  const DomainIcon = getDomainIcon(content.domain);
  const domainColors = getDomainColor(content.domain);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: '100%' }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed inset-0 bg-background z-50 overflow-y-auto"
      >
        {/* Header */}
        <header className="sticky top-0 bg-surface-container-low z-40 border-b border-outline-variant/15">
          <div className="flex items-center gap-4 px-6 py-4 max-w-4xl mx-auto">
            <button
              onClick={onBack}
              aria-label="返回"
              className="p-2.5 hover:bg-surface-container rounded-xl transition-colors"
            >
              <ArrowLeft className="w-6 h-6 text-on-surface" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-on-surface truncate">{content.title}</h1>
              <p className="text-sm text-on-surface-variant">{getDomainLabel(content.domain)} · {content.ageRange}岁</p>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-6 py-8 pb-32">
          {/* Thumbnail */}
          {content.thumbnail && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative rounded-2xl overflow-hidden mb-8 shadow-lg"
            >
              <img 
                src={content.thumbnail} 
                alt={content.title}
                className="w-full h-64 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4">
                <div className={cn(
                  "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold",
                  domainColors.bg, domainColors.text
                )}>
                  <DomainIcon className="w-4 h-4" />
                  {getDomainLabel(content.domain)}
                </div>
              </div>
            </motion.div>
          )}

          {/* Content Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-6"
          >
            {/* Title & Description */}
            <div>
              <h2 className="text-3xl font-black text-on-surface mb-2">{content.title}</h2>
              {content.subtitle && (
                <p className="text-lg text-on-surface-variant">{content.subtitle}</p>
              )}
            </div>

            {/* Meta Info */}
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 px-4 py-2 bg-surface-container-low rounded-xl">
                <Clock className="w-5 h-5 text-primary" />
                <span className="font-bold text-on-surface">{content.durationMinutes} 分钟</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-surface-container-low rounded-xl">
                <Star className="w-5 h-5 text-tertiary" />
                <span className="font-bold text-on-surface">难度 {content.difficulty}</span>
              </div>
              <div className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl",
                domainColors.bg
              )}>
                <DomainIcon className={cn("w-5 h-5", domainColors.text)} />
                <span className={cn("font-bold", domainColors.text)}>{getDomainLabel(content.domain)}</span>
              </div>
            </div>

            {/* Content Body */}
            {content.content && !isQuizMode && !quizCompleted && (
              <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/15">
                <div className="flex items-center gap-2 mb-4">
                  <BookOpen className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-bold text-on-surface">学习内容</h3>
                  {hasInteractiveContent && (
                    <span className="ml-auto bg-primary-container text-on-primary-container text-xs font-black px-3 py-1 rounded-full">
                      含互动练习
                    </span>
                  )}
                </div>
                <div className="prose prose-sm max-w-none text-on-surface-variant whitespace-pre-line">
                  {displayText || content.content}
                </div>
              </div>
            )}

            {/* Interactive Quiz Mode */}
            {isQuizMode && hasInteractiveContent && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              >
                <QuizEngine
                  sections={quizSections}
                  onComplete={handleQuizComplete}
                />
              </motion.div>
            )}

            {/* Voice Player */}
            {content.content && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/15"
              >
                <div className="flex items-center gap-4">
                  {/* Play/Pause Button */}
                  <button
                    onClick={handleToggleAudio}
                    disabled={audioLoading}
                    aria-label={isPlayingAudio ? '暂停播放' : audioLoading ? '加载中' : '播放语音'}
                    className="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center flex-shrink-0 tactile-press shadow-tactile active:shadow-tactile-active active:translate-y-0.5 transition-all disabled:opacity-60"
                  >
                    {audioLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : isPlayingAudio ? (
                      <Pause className="w-5 h-5 fill-current" />
                    ) : (
                      <Volume2 className="w-5 h-5" />
                    )}
                  </button>

                  {/* Waveform + Label */}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-bold text-on-surface block mb-2">
                      {isPlayingAudio ? '正在播放语音...' : '播放语音'}
                    </span>
                    {/* Waveform Animation */}
                    <div className="flex items-center gap-[3px] h-5">
                      {Array.from({ length: 24 }).map((_, i) => (
                        <motion.div
                          key={i}
                          className={cn(
                            "w-[3px] rounded-full",
                            isPlayingAudio ? "bg-primary" : "bg-outline-variant/40"
                          )}
                          animate={isPlayingAudio ? {
                            height: [4, 12 + Math.random() * 12, 4],
                          } : { height: 4 }}
                          transition={isPlayingAudio ? {
                            duration: 0.6 + Math.random() * 0.4,
                            repeat: Infinity,
                            repeatType: 'reverse',
                            delay: i * 0.05,
                            ease: 'easeInOut',
                          } : {}}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Media */}
            {content.mediaUrls && content.mediaUrls.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-on-surface">媒体资源</h3>
                <div className="grid grid-cols-2 gap-4">
                  {content.mediaUrls.map((url, idx) => (
                    <div key={idx} className="rounded-xl overflow-hidden bg-surface-container">
                      <img src={url} alt={`Media ${idx + 1}`} className="w-full h-32 object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>

          {/* AI Evaluation */}
          <AnimatePresence>
            {showEvaluation && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="mt-8 bg-on-secondary-container text-on-secondary rounded-2xl p-6 relative overflow-hidden"
              >
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="w-5 h-5 text-primary-container" />
                    <span className="text-sm font-bold uppercase tracking-wider opacity-80">AI 评估</span>
                  </div>
                  <h3 className="text-2xl font-black mb-2">太棒了！</h3>
                  <p className="opacity-90 mb-4">
                    你完成了「{content.title}」的学习，获得了 {score} 分！
                    继续保持，你正在成为学习小达人！
                  </p>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-primary-container" />
                      <span className="font-bold">+{score} 积分</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Star className="w-5 h-5 text-primary-container fill-current" />
                      <span className="font-bold">+1 星星</span>
                    </div>
                  </div>
                </div>
                <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-primary-container/20 rounded-full blur-2xl"></div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Bottom Action Bar */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="fixed bottom-0 left-0 right-0 bg-surface-container-low/95 backdrop-blur-xl border-t border-outline-variant/15 p-6 z-40"
        >
          <div className="max-w-4xl mx-auto flex items-center gap-4">
            {!learningRecord ? (
              // Start Learning Button
              <div className="flex-1 space-y-2">
                {(startError || !childId) && (
                  <p className="text-sm text-error text-center font-medium flex items-center justify-center gap-1.5">
                    <AlertCircle className="w-4 h-4" />
                    {startError || '请以孩子身份登录后开始学习'}
                  </p>
                )}
                <button
                  onClick={handleStartLearning}
                  disabled={isStarting || !childId}
                  className="w-full bg-primary text-on-primary py-5 rounded-full text-xl font-black shadow-tactile active:shadow-tactile-active active:translate-y-1 transition-all flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isStarting ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin" />
                      开始中...
                    </>
                  ) : (
                    <>
                      <Play className="w-6 h-6 fill-current" />
                      {hasInteractiveContent ? '开始学习' : '开始学习'}
                    </>
                  )}
                </button>
              </div>
            ) : !showEvaluation && !isQuizMode ? (
              // Complete Learning Section (manual scoring for non-interactive content)
              <div className="flex-1 space-y-4">
                <div className="flex items-center gap-4">
                  <span className="text-on-surface-variant font-bold">评分:</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={score}
                    onChange={(e) => setScore(Number(e.target.value))}
                    className="flex-1 accent-primary"
                  />
                  <span className="font-black text-primary text-xl w-12">{score}</span>
                </div>
                <button
                  onClick={handleComplete}
                  disabled={isCompleting}
                  className="w-full bg-tertiary text-on-tertiary py-5 rounded-full text-xl font-black shadow-tactile active:shadow-tactile-active active:translate-y-1 transition-all flex items-center justify-center gap-3 disabled:opacity-60"
                >
                  {isCompleting ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin" />
                      提交中...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-6 h-6" />
                      完成学习
                    </>
                  )}
                </button>
              </div>
            ) : isQuizMode ? null : (
              // Completed - Back Button
              <button
                onClick={onBack}
                className="flex-1 bg-secondary text-on-secondary py-5 rounded-full text-xl font-black shadow-tactile active:shadow-tactile-active active:translate-y-1 transition-all flex items-center justify-center gap-3"
              >
                <ArrowLeft className="w-6 h-6" />
                返回首页
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
