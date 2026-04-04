import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Calculator,
  CheckCircle,
  Clock,
  Loader2,
  MessageCircle,
  Microscope,
  Palette,
  Pause,
  Play,
  Sparkles,
  Star,
  Users,
  Volume2,
} from '@/icons';
import { cn } from '../lib/utils';
import api from '../services/api';
import { getAudioVolume } from '@/lib/app-settings';
import type { Content, LearningRecord } from '@/types';
import QuizEngine, { type QuizSection } from './quiz/QuizEngine';
import { Button, Card, EmptyState, IconButton, TopBar } from './ui';

interface ContentDetailProps {
  contentId: number;
  childId?: number;
  onBack: () => void;
  onComplete?: (record: LearningRecord) => void;
}

interface DomainMeta {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeClass: string;
}

const DOMAIN_META: Record<string, DomainMeta> = {
  language: {
    label: '语言',
    icon: MessageCircle,
    badgeClass: 'bg-secondary-container text-on-secondary-container',
  },
  math: {
    label: '数学',
    icon: Calculator,
    badgeClass: 'bg-tertiary-container text-on-tertiary-container',
  },
  science: {
    label: '科学',
    icon: Microscope,
    badgeClass: 'bg-primary-container text-on-primary-container',
  },
  art: {
    label: '艺术',
    icon: Palette,
    badgeClass: 'bg-surface-container-high text-on-surface',
  },
  social: {
    label: '社会',
    icon: Users,
    badgeClass: 'bg-error-container/20 text-error',
  },
};

function parseSections(raw?: string): QuizSection[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => Array.isArray((item as Record<string, unknown>).questions)) as QuizSection[];
  } catch {
    return [];
  }
}

function resolveDisplayText(raw?: string): string {
  if (!raw) return '';

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return raw;

    const blocks = parsed
      .map((item) => {
        if (!item || typeof item !== 'object') return '';
        const section = item as Record<string, unknown>;
        const title = typeof section.title === 'string' ? section.title.trim() : '';
        const text = typeof section.text === 'string' ? section.text.trim() : '';

        if (title && text) return `${title}\n${text}`;
        return title || text || '';
      })
      .filter(Boolean);

    return blocks.join('\n\n') || raw;
  } catch {
    return raw;
  }
}

export default function ContentDetail({ contentId, childId, onBack, onComplete }: ContentDetailProps) {
  const [content, setContent] = useState<Content | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [startError, setStartError] = useState<string | null>(null);

  const [learningRecord, setLearningRecord] = useState<LearningRecord | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const [score, setScore] = useState(85);
  const [showEvaluation, setShowEvaluation] = useState(false);

  const [isQuizMode, setIsQuizMode] = useState(false);
  const [quizCompleted, setQuizCompleted] = useState(false);

  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);

  useEffect(() => {
    const fetchContent = async () => {
      setIsLoading(true);
      try {
        const data = await api.getContent(contentId);
        setContent(data);
      } catch (error) {
        console.error('Failed to fetch content detail:', error);
        setContent(null);
      } finally {
        setIsLoading(false);
      }
    };

    if (contentId) fetchContent();
  }, [contentId]);

  useEffect(() => () => window.speechSynthesis.cancel(), []);

  const quizSections = useMemo(() => parseSections(content?.content), [content?.content]);
  const hasInteractiveContent = quizSections.length > 0;
  const displayText = useMemo(() => resolveDisplayText(content?.content), [content?.content]);

  const domainMeta = useMemo(() => {
    if (!content) return null;
    return DOMAIN_META[content.domain] || {
      label: '学习',
      icon: Sparkles,
      badgeClass: 'bg-surface-container text-on-surface',
    };
  }, [content]);

  const handleToggleAudio = useCallback(() => {
    if (!displayText) return;

    if (isPlayingAudio) {
      window.speechSynthesis.cancel();
      setIsPlayingAudio(false);
      setAudioLoading(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(displayText);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.9;
    utterance.pitch = 1.05;
    utterance.volume = getAudioVolume();

    utterance.onstart = () => {
      setAudioLoading(false);
      setIsPlayingAudio(true);
    };

    utterance.onend = () => setIsPlayingAudio(false);
    utterance.onerror = () => {
      setAudioLoading(false);
      setIsPlayingAudio(false);
    };

    setAudioLoading(true);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [displayText, isPlayingAudio]);

  const handleStartLearning = useCallback(async () => {
    if (!childId) {
      setStartError('请使用孩子账号开始学习。');
      return;
    }

    if (!contentId) {
      setStartError('内容 ID 无效，请返回后重试。');
      return;
    }

    try {
      setIsStarting(true);
      setStartError(null);

      const record = await api.startLearning({ childId, contentId });
      setLearningRecord(record);

      if (hasInteractiveContent) {
        setIsQuizMode(true);
      }
    } catch (error: any) {
      setStartError(error?.message || '开始学习失败，请稍后再试。');
    } finally {
      setIsStarting(false);
    }
  }, [childId, contentId, hasInteractiveContent]);

  const completeLearning = useCallback(
    async (nextScore: number, feedback: string) => {
      if (!learningRecord) return;

      try {
        setIsCompleting(true);

        const record = await api.completeLearning({
          recordId: learningRecord.id,
          score: nextScore,
          feedback,
        });

        setLearningRecord(record);
        setShowEvaluation(true);
        onComplete?.(record);
      } catch (error) {
        console.error('Failed to complete learning:', error);
      } finally {
        setIsCompleting(false);
      }
    },
    [learningRecord, onComplete],
  );

  const handleQuizComplete = useCallback(
    async (correctCount: number, totalQuestions: number) => {
      const quizScore = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 85;
      setScore(quizScore);
      setQuizCompleted(true);
      setIsQuizMode(false);
      await completeLearning(quizScore, `答对 ${correctCount}/${totalQuestions} 题`);
    },
    [completeLearning],
  );

  const handleCompleteReading = useCallback(async () => {
    await completeLearning(score, '完成学习内容');
  }, [completeLearning, score]);

  if (isLoading) {
    return (
      <div className="min-h-app pb-safe">
        <TopBar
          title="学习详情"
          subtitle="正在加载内容..."
          leftSlot={(
            <IconButton aria-label="返回" onClick={onBack}>
              <ArrowLeft className="h-5 w-5" />
            </IconButton>
          )}
        />
        <main className="mx-auto w-full max-w-4xl space-y-4 px-4 py-6 md:px-6">
          <Card className="h-52 animate-shimmer" />
          <Card className="h-24 animate-shimmer" />
          <Card className="h-44 animate-shimmer" />
        </main>
      </div>
    );
  }

  if (!content || !domainMeta) {
    return (
      <div className="min-h-app pb-safe">
        <TopBar
          title="学习详情"
          subtitle="未找到内容"
          leftSlot={(
            <IconButton aria-label="返回" onClick={onBack}>
              <ArrowLeft className="h-5 w-5" />
            </IconButton>
          )}
        />
        <main className="mx-auto w-full max-w-4xl px-4 py-8 md:px-6">
          <EmptyState
            title="内容不存在或已下线"
            description="你可以返回学习主页，选择其他课程。"
            actionLabel="返回"
            onAction={onBack}
            icon={<BookOpen className="h-6 w-6 text-primary" />}
          />
        </main>
      </div>
    );
  }

  const DomainIcon = domainMeta.icon;

  return (
    <div className="min-h-app pb-[calc(10rem+var(--safe-area-bottom))]">
      <TopBar
        title={content.title}
        subtitle={`${domainMeta.label} · ${content.ageRange} 岁`}
        leftSlot={(
          <IconButton aria-label="返回" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </IconButton>
        )}
      />

      <main className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6 md:px-6">
        {content.thumbnail ? (
          <Card className="relative overflow-hidden p-0">
            <img src={content.thumbnail} alt={content.title} className="h-56 w-full object-cover md:h-72" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            <div className={cn('absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black', domainMeta.badgeClass)}>
              <DomainIcon className="h-4 w-4" />
              {domainMeta.label}
            </div>
          </Card>
        ) : null}

        <Card className="space-y-4 p-5">
          <div>
            <h2 className="text-2xl font-black text-on-surface">{content.title}</h2>
            {content.subtitle ? <p className="mt-1 text-sm text-on-surface-variant">{content.subtitle}</p> : null}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="flex items-center gap-2 rounded-xl bg-surface-container px-3 py-2 text-sm font-semibold text-on-surface">
              <Clock className="h-4 w-4 text-primary" />
              {content.durationMinutes} 分钟
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-surface-container px-3 py-2 text-sm font-semibold text-on-surface">
              <Star className="h-4 w-4 text-tertiary" />
              难度 {content.difficulty}
            </div>
            <div className={cn('flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold', domainMeta.badgeClass)}>
              <DomainIcon className="h-4 w-4" />
              {domainMeta.label}
            </div>
          </div>
        </Card>

        {displayText && !isQuizMode && !quizCompleted ? (
          <Card className="space-y-3 p-5">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-black text-on-surface">学习内容</h3>
              {hasInteractiveContent ? (
                <span className="ml-auto rounded-full bg-primary-container px-3 py-1 text-xs font-black text-on-primary-container">
                  含互动练习
                </span>
              ) : null}
            </div>
            <div className="max-h-[48vh] overflow-y-auto whitespace-pre-line rounded-xl bg-surface p-4 text-sm leading-7 text-on-surface-variant">
              {displayText}
            </div>
          </Card>
        ) : null}

        {isQuizMode && hasInteractiveContent ? (
          <Card className="p-4 md:p-5">
            <QuizEngine sections={quizSections} onComplete={handleQuizComplete} />
          </Card>
        ) : null}

        {displayText ? (
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleToggleAudio}
                disabled={audioLoading}
                className="touch-target flex h-11 w-11 items-center justify-center rounded-full bg-primary text-on-primary shadow-tactile transition-all active:translate-y-0.5 active:shadow-tactile-active disabled:opacity-60"
                aria-label={isPlayingAudio ? '暂停语音播放' : '播放语音'}
              >
                {audioLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : isPlayingAudio ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
              </button>
              <div>
                <p className="text-sm font-black text-on-surface">{isPlayingAudio ? '语音朗读中...' : '语音朗读'}</p>
                <p className="text-xs text-on-surface-variant">点击可播放或暂停当前学习内容</p>
              </div>
            </div>
          </Card>
        ) : null}

        {content.mediaUrls && content.mediaUrls.length > 0 ? (
          <Card className="space-y-3 p-5">
            <h3 className="text-lg font-black text-on-surface">媒体资源</h3>
            <div className="grid grid-cols-2 gap-3">
              {content.mediaUrls.map((url, index) => (
                <div key={index} className="overflow-hidden rounded-xl border border-outline-variant/20 bg-surface">
                  <img src={url} alt={`学习资源 ${index + 1}`} className="h-28 w-full object-cover md:h-36" />
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {showEvaluation ? (
          <Card className="relative overflow-hidden border-secondary-container/25 bg-on-secondary-container p-6 text-on-secondary">
            <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-primary-container/25 blur-2xl" />
            <div className="relative z-10">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary-container/20 px-3 py-1 text-xs font-black">
                <Sparkles className="h-4 w-4" />
                AI 评估
              </div>
              <h3 className="text-2xl font-black">太棒了！</h3>
              <p className="mt-2 text-sm leading-6 opacity-95">
                你已经完成《{content.title}》学习，获得 {score} 分。继续保持，下一次会更出色！
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <div className="inline-flex items-center gap-1 rounded-full bg-primary-container/25 px-3 py-1.5 text-sm font-bold">
                  <CheckCircle className="h-4 w-4" />
                  +{score} 积分
                </div>
                <div className="inline-flex items-center gap-1 rounded-full bg-primary-container/25 px-3 py-1.5 text-sm font-bold">
                  <Star className="h-4 w-4" />
                  +1 星星
                </div>
              </div>
            </div>
          </Card>
        ) : null}
      </main>

      <div className="fixed bottom-safe left-0 right-0 z-40 border-t border-outline-variant/15 bg-surface-container-low/95 px-4 pb-safe pt-3 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-4xl">
          {!learningRecord ? (
            <div className="space-y-2">
              {(startError || !childId) && (
                <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-error" role="alert">
                  <AlertCircle className="h-4 w-4" />
                  {startError || '请使用孩子账号开始学习。'}
                </p>
              )}
              <Button
                size="lg"
                className="w-full rounded-full text-base"
                disabled={isStarting || !childId}
                onClick={handleStartLearning}
              >
                {isStarting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    正在开始...
                  </>
                ) : (
                  <>
                    <Play className="h-5 w-5" />
                    {hasInteractiveContent ? '开始学习与练习' : '开始学习'}
                  </>
                )}
              </Button>
            </div>
          ) : !showEvaluation && !isQuizMode ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2.5">
                <span className="text-sm font-bold text-on-surface-variant">学习评分</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={score}
                  onChange={(event) => setScore(Number(event.target.value))}
                  className="h-2 flex-1 cursor-pointer accent-primary"
                  aria-label="调整学习评分"
                />
                <span className="w-10 text-right text-base font-black text-primary">{score}</span>
              </div>
              <Button
                size="lg"
                className="w-full rounded-full text-base"
                variant="secondary"
                onClick={handleCompleteReading}
                disabled={isCompleting}
              >
                {isCompleting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    提交中...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-5 w-5" />
                    完成学习
                  </>
                )}
              </Button>
            </div>
          ) : isQuizMode ? null : (
            <Button size="lg" className="w-full rounded-full text-base" variant="secondary" onClick={onBack}>
              <ArrowLeft className="h-5 w-5" />
              返回主页
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
