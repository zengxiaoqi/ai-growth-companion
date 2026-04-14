import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  Clock,
  Loader2,
  Star,
} from '@/icons';
import { cn } from '@/lib/utils';
import api from '@/services/api';
import type { Content, StructuredLessonContent, StructuredLessonStep, LessonProgress, ActivityResult } from '@/types';
import GameRenderer from './games/GameRenderer';
import { Button, Card } from './ui';
import { normalizeActivityType, normalizeActivityData } from './ai-chat/activity-normalizer';
import LessonScenePlayer from '@/scenes/LessonScenePlayer';
import { resolveLessonSceneDocument } from '@/scenes/scene-helpers';

interface StructuredLessonViewProps {
  contentId: number;
  childId?: number;
  onBack: () => void;
}

const STEP_META: Record<string, { emoji: string; label: string; color: string }> = {
  watch: { emoji: '\u{1F441}', label: '看', color: 'bg-blue-100 text-blue-700' },
  read: { emoji: '\u{1F4D6}', label: '读', color: 'bg-yellow-100 text-yellow-700' },
  write: { emoji: '\u{270D}', label: '写', color: 'bg-purple-100 text-purple-700' },
  practice: { emoji: '\u{1F3AE}', label: '练', color: 'bg-orange-100 text-orange-700' },
};

export default function StructuredLessonView({ contentId, childId, onBack }: StructuredLessonViewProps) {
  const [content, setContent] = useState<Content | null>(null);
  const [lesson, setLesson] = useState<StructuredLessonContent | null>(null);
  const [progress, setProgress] = useState<LessonProgress | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [showCompleteScreen, setShowCompleteScreen] = useState(false);
  const stepStartTime = useRef(Date.now());

  useEffect(() => {
    const loadContent = async () => {
      try {
        const c = await api.getContent(contentId);
        setContent(c);
        const lessonData = typeof c.content === 'string' ? JSON.parse(c.content) : c.content;
        setLesson(lessonData);

        if (childId) {
          try {
            const p = await api.getLessonProgress(contentId, childId);
            setProgress(p);
            // Find first incomplete step
            if (p.completedSteps.length > 0 && lessonData.steps) {
              const firstIncomplete = lessonData.steps.findIndex(
                (s: StructuredLessonStep) => !p.completedSteps.includes(s.id)
              );
              if (firstIncomplete >= 0) setCurrentStepIndex(firstIncomplete);
            }
          } catch {
            // Progress not available yet, start from step 0
          }
        }
      } catch (err: any) {
        setError(err?.message || '加载课程失败');
      } finally {
        setIsLoading(false);
      }
    };
    loadContent();
  }, [contentId, childId]);

  const steps = lesson?.steps || [];
  const currentStep = steps[currentStepIndex];
  const completedSteps = useMemo(() => new Set(progress?.completedSteps || []), [progress]);
  const allCompleted = steps.length > 0 && steps.every((s) => completedSteps.has(s.id));

  useEffect(() => {
    stepStartTime.current = Date.now();
  }, [currentStepIndex]);

  const handleCompleteStep = useCallback(async (score: number = 100, interactionData?: Record<string, any>) => {
    if (!childId || !currentStep) return;

    setIsCompleting(true);
    const durationSeconds = Math.max(1, Math.floor((Date.now() - stepStartTime.current) / 1000));

    try {
      await api.completeLessonStep(contentId, currentStep.id, childId, {
        score,
        durationSeconds,
        interactionData,
      });

      setProgress((prev) => {
        const newCompleted = [...(prev?.completedSteps || []), currentStep.id];
        const newStepResults = {
          ...(prev?.stepResults || {}),
          [currentStep.id]: { status: 'completed', score },
        };
        return {
          contentId,
          childId,
          completedSteps: newCompleted,
          overallScore: prev?.overallScore || 0,
          stepResults: newStepResults,
        };
      });

      // Check if all steps completed
      const updatedCompleted = new Set([...completedSteps, currentStep.id]);
      if (steps.every((s) => updatedCompleted.has(s.id))) {
        setShowCompleteScreen(true);
      } else {
        // Move to next step
        const nextIndex = currentStepIndex + 1;
        if (nextIndex < steps.length) {
          setCurrentStepIndex(nextIndex);
        }
      }
    } catch (err: any) {
      setError(err?.message || '记录步骤失败');
    } finally {
      setIsCompleting(false);
    }
  }, [childId, contentId, currentStep, currentStepIndex, steps, completedSteps]);

  if (isLoading) {
    return (
      <div className="min-h-app flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-on-surface-variant">正在加载课程...</p>
        </div>
      </div>
    );
  }

  if (error && !content) {
    return (
      <div className="min-h-app flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-error">{error}</p>
          <Button onClick={onBack}>返回</Button>
        </div>
      </div>
    );
  }

  // Completion screen
  if (showCompleteScreen || allCompleted) {
    return (
      <div className="min-h-app bg-background">
        <div className="sticky top-0 z-10 border-b border-outline-variant/15 bg-surface/95 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="touch-target rounded-full p-2 hover:bg-surface-container-high" aria-label="返回">
              <ArrowLeft className="h-5 w-5 text-on-surface" />
            </button>
            <h2 className="text-sm font-bold text-on-surface">课程完成</h2>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center px-6 py-12">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200 }}
            className="text-6xl"
          >
            {'\u{1F389}'}
          </motion.div>
          <h2 className="mt-4 text-xl font-bold text-on-surface">太棒了！</h2>
          <p className="mt-2 text-center text-sm text-on-surface-variant">
            你已经完成了「{content?.title}」的全部学习步骤
          </p>
          {progress && (
            <div className="mt-4 flex items-center gap-2 rounded-full bg-primary-container/20 px-4 py-2">
              <Star className="h-5 w-5 text-primary" />
              <span className="text-sm font-bold text-primary">总分: {progress.overallScore || 0} 分</span>
            </div>
          )}
          <div className="mt-6 flex gap-3">
            <Button onClick={onBack}>返回课程</Button>
            <Button variant="secondary" onClick={() => setCurrentStepIndex(0)}>
              重新学习
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-app bg-background">
      {/* Top Bar */}
      <div className="sticky top-0 z-10 border-b border-outline-variant/15 bg-surface/95 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="touch-target rounded-full p-2 hover:bg-surface-container-high"
            aria-label="返回"
          >
            <ArrowLeft className="h-5 w-5 text-on-surface" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-bold text-on-surface">{content?.title}</h2>
            <div className="flex items-center gap-2 text-xs text-on-surface-variant">
              <span>{completedSteps.size}/{steps.length} 步骤完成</span>
              <span className="text-on-surface-variant/30">|</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {lesson?.ageGroup}岁
              </span>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-surface-container-highest">
          {steps.map((step, i) => (
            <div
              key={step.id}
              className={cn(
                'h-full transition-all duration-300',
                i > 0 && 'ml-0.5',
                completedSteps.has(step.id)
                  ? 'bg-primary'
                  : i === currentStepIndex
                    ? 'bg-primary/40'
                    : 'bg-surface-container-high',
              )}
              style={{ flex: 1 }}
            />
          ))}
        </div>
      </div>

      {/* Step Navigation */}
      <div className="flex gap-1 overflow-x-auto px-4 py-3 scrollbar-hide">
        {steps.map((step, i) => {
          const meta = STEP_META[step.id] || { emoji: '\u{1F4DD}', label: step.label, color: 'bg-gray-100 text-gray-700' };
          const isDone = completedSteps.has(step.id);
          const isCurrent = i === currentStepIndex;
          return (
            <button
              key={step.id}
              onClick={() => {
                setCurrentStepIndex(i);
                stepStartTime.current = Date.now();
              }}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
                isCurrent ? 'bg-primary text-on-primary shadow-tactile' :
                isDone ? 'bg-primary-container/30 text-primary' :
                'bg-surface-container text-on-surface-variant',
              )}
            >
              <span>{meta.emoji}</span>
              <span>{meta.label}</span>
              {isDone && <Check className="h-3 w-3" />}
            </button>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-2 rounded-lg bg-error-container/10 px-4 py-2 text-sm text-error">
          {error}
          <button className="ml-2 underline" onClick={() => setError(null)}>关闭</button>
        </div>
      )}

      {/* Step Content */}
      <div className="px-4 pb-24">
        {currentStep && (
          <StepContent
            step={currentStep}
            contentId={contentId}
            childId={childId}
            isCompleting={isCompleting}
            onComplete={handleCompleteStep}
            isCompleted={completedSteps.has(currentStep.id)}
          />
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-outline-variant/15 bg-surface px-4 py-3 pb-safe">
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              if (currentStepIndex > 0) {
                setCurrentStepIndex(currentStepIndex - 1);
                stepStartTime.current = Date.now();
              }
            }}
            disabled={currentStepIndex === 0}
            className={cn(
              'flex items-center gap-1 rounded-full px-4 py-2 text-sm font-medium transition-all',
              currentStepIndex === 0
                ? 'text-on-surface-variant/30'
                : 'text-primary hover:bg-primary-container/10',
            )}
          >
            <ArrowLeft className="h-4 w-4" />
            上一步
          </button>

          <span className="text-xs text-on-surface-variant">
            {currentStepIndex + 1} / {steps.length}
          </span>

          <button
            onClick={() => {
              if (currentStepIndex < steps.length - 1) {
                setCurrentStepIndex(currentStepIndex + 1);
                stepStartTime.current = Date.now();
              }
            }}
            disabled={currentStepIndex === steps.length - 1}
            className={cn(
              'flex items-center gap-1 rounded-full px-4 py-2 text-sm font-medium transition-all',
              currentStepIndex === steps.length - 1
                ? 'text-on-surface-variant/30'
                : 'text-primary hover:bg-primary-container/10',
            )}
          >
            下一步
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Step Content Renderer ────────────────────────────────────────────

interface StepContentProps {
  step: StructuredLessonStep;
  contentId: number;
  childId?: number;
  isCompleting: boolean;
  onComplete: (score?: number, interactionData?: Record<string, any>) => void;
  isCompleted: boolean;
}

function StepContent({ step, contentId, childId, isCompleting, onComplete, isCompleted }: StepContentProps) {
  const m = step.module;
  const meta = STEP_META[step.id] || { emoji: '\u{1F4DD}', label: step.label, color: '' };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={step.id}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.2 }}
        className="space-y-4"
      >
        <div className="flex items-center gap-2">
          <span className="text-2xl">{meta.emoji}</span>
          <h3 className="text-lg font-bold text-on-surface">{step.label} - {getStepTitle(step)}</h3>
        </div>

        {m.type === 'video' && (
          <WatchStep
            module={m}
            contentId={contentId}
            childId={childId}
            onComplete={onComplete}
            isCompleted={isCompleted}
          />
        )}
        {m.type === 'reading' && <ReadStep module={m} onComplete={onComplete} isCompleted={isCompleted} />}
        {m.type === 'writing' && <WriteStep module={m} onComplete={onComplete} isCompleted={isCompleted} />}
        {m.type === 'game' && <PracticeStep module={m} onComplete={onComplete} isCompleted={isCompleted} />}

        {isCompleting && (
          <div className="flex items-center justify-center gap-2 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-on-surface-variant">记录中...</span>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function getStepTitle(step: StructuredLessonStep): string {
  const m = step.module;
  if (m.type === 'video') return '观看动画讲解';
  if (m.type === 'reading') return '阅读学习';
  if (m.type === 'writing') return '书写练习';
  if (m.type === 'game') return '互动练习';
  return '';
}

// ─── Watch Step ────────────────────────────────────────────────────────

/** Check if scenes contain animation template data */
function scenesHaveAnimationTemplates(scenes: any[]): boolean {
  return scenes.some((s) => s?.animationTemplate);
}

function normalizeWordRevealWords(scene: any): string[] {
  const rawWords = scene?.animationParams?.words;
  if (!Array.isArray(rawWords)) return [];

  return rawWords
    .map((word) => (typeof word === 'string' ? word.trim() : ''))
    .filter(Boolean);
}

function shouldFallbackToLegacyWatch(scenes: any[]): boolean {
  if (scenes.length < 2) return false;
  if (!scenes.every((scene) => scene?.animationTemplate === 'language.word-reveal')) return false;

  const uniqueWordSets = new Set(
    scenes
      .map((scene) => normalizeWordRevealWords(scene).join('|'))
      .filter(Boolean),
  );

  if (uniqueWordSets.size !== 1) return false;
  const [onlyWordSet = ''] = Array.from(uniqueWordSets);
  return onlyWordSet.split('|').filter(Boolean).length <= 1;
}

function inferStorySceneBgType(scene: any): 'day' | 'night' | 'indoor' {
  const source = [scene?.scene, scene?.imagePrompt, scene?.narration, scene?.onScreenText].join(' ');
  if (/(夜|晚上|星星|月亮|黑夜)/.test(source)) return 'night';
  if (/(教室|课堂|室内|老师)/.test(source)) return 'indoor';
  return 'day';
}

function createStorySceneParams(scene: any): Record<string, unknown> {
  const source = [scene?.scene, scene?.imagePrompt, scene?.narration, scene?.onScreenText].join(' ');
  const items = Array.from(new Set((source.match(/春|夏|秋|冬|花|太阳|树叶|雪花/g) || []))).slice(0, 4);

  return {
    bgType: inferStorySceneBgType(scene),
    characters: ['老师', '小朋友'],
    items,
  };
}

function repairLowInformationAnimationScenes(scenes: any[]): any[] {
  if (!shouldFallbackToLegacyWatch(scenes)) return scenes;

  const source = scenes
    .map((scene) => [scene?.scene, scene?.imagePrompt, scene?.narration, scene?.onScreenText].join(' '))
    .join(' ');
  const isSeasonTopic = /(四季|季节|春夏秋冬)/.test(source);

  return scenes.map((scene, index) => ({
    ...scene,
    animationTemplate: isSeasonTopic ? 'science.seasons-cycle' : 'language.story-scene',
    animationParams: isSeasonTopic
      ? { seasonNames: ['春', '夏', '秋', '冬'], focusSeason: index % 4, showLabels: true }
      : createStorySceneParams(scene),
  }));
}

function WatchStep({
  module: m,
  contentId,
  childId,
  onComplete,
  isCompleted,
}: {
  module: any;
  contentId: number;
  childId?: number;
  onComplete: (score?: number, data?: Record<string, any>) => void;
  isCompleted: boolean;
}) {
  const sceneDocument = useMemo(() => resolveLessonSceneDocument('watch', m), [m]);
  if (sceneDocument) {
    return (
      <LessonScenePlayer
        document={sceneDocument}
        isCompleted={isCompleted}
        onComplete={(score, data) => onComplete(score || 90, data)}
      />
    );
  }

  // ── Video-first strategy: try pre-rendered video, fallback to animation ──
  // This ensures visual consistency between parent preview (Remotion SVG)
  // and student playback (same Remotion-rendered MP4 video).
  // Only falls back to p5.js animation if video is unavailable.
  return (
    <VideoFirstWatchStep
      module={m}
      contentId={contentId}
      childId={childId}
      onComplete={onComplete}
      isCompleted={isCompleted}
    />
  );
}

// ─── Video-First Watch Step ──────────────────────────────────────────
// Strategy: try pre-rendered Remotion video → fallback to p5.js animation → fallback to text cards
function VideoFirstWatchStep({
  module: m,
  contentId,
  childId,
  onComplete,
  isCompleted,
}: {
  module: any;
  contentId: number;
  childId?: number;
  onComplete: (score?: number) => void;
  isCompleted: boolean;
}) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(true);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoTaskId, setVideoTaskId] = useState<number | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [fallbackMode, setFallbackMode] = useState<'animation' | 'text' | null>(null);
  const [videoReloadKey, setVideoReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let localUrl: string | null = null;

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const loadVideo = async () => {
      setVideoLoading(true);
      setVideoProgress(0);
      setVideoTaskId(null);
      setVideoUrl(null);
      setFallbackMode(null);

      try {
        const task = await api.createLessonTeachingVideoTask(contentId, childId);
        if (cancelled) return;

        setVideoTaskId(task.taskId);
        setVideoProgress(Math.max(0, task.progress || 0));

        // If task already completed, download immediately
        if (task.status === 'completed' && task.ready) {
          const blob = await api.downloadLessonTeachingVideo(contentId, childId, task.taskId);
          if (cancelled) return;
          localUrl = URL.createObjectURL(blob);
          setVideoUrl(localUrl);
          setVideoProgress(100);
          setVideoLoading(false);
          return;
        }

        let status = task.status;
        let progress = task.progress || 0;
        let errorMessage = task.errorMessage || '';
        let pollCount = 0;

        while (!cancelled && status !== 'completed' && status !== 'failed' && pollCount < 120) {
          await sleep(2000);
          const next = await api.getLessonTeachingVideoTask(contentId, task.taskId, childId);
          status = next.status;
          progress = next.progress || 0;
          errorMessage = next.errorMessage || '';
          if (cancelled) return;
          setVideoProgress(Math.max(5, Math.min(99, progress)));
          pollCount += 1;
        }

        if (cancelled) return;

        if (status === 'completed') {
          const blob = await api.downloadLessonTeachingVideo(contentId, childId, task.taskId);
          if (cancelled) return;
          localUrl = URL.createObjectURL(blob);
          setVideoUrl(localUrl);
          setVideoProgress(100);
        } else {
          // Video generation failed or timed out, fallback to animation
          console.warn(`[VideoFirstWatchStep] Video failed: ${errorMessage || status}, falling back to animation`);
          setFallbackMode('animation');
        }
      } catch (err: any) {
        const msg = err?.message || '';
        // If video is pending approval, still show it if available
        if (msg.includes('尚未通过审批') || msg.includes('审批')) {
          // Try downloading anyway - might work for child if approved
          setFallbackMode('animation');
        } else {
          console.warn(`[VideoFirstWatchStep] Video load error: ${msg}, falling back to animation`);
          setFallbackMode('animation');
        }
      } finally {
        if (!cancelled) setVideoLoading(false);
      }
    };

    loadVideo();

    return () => {
      cancelled = true;
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [contentId, childId, videoReloadKey]);

  // ── Video ready: play it ──
  if (videoUrl) {
    return (
      <div className="space-y-3">
        <Card className="overflow-hidden">
          <video
            className="h-auto w-full bg-black"
            src={videoUrl}
            controls
            playsInline
            onEnded={() => setVideoReady(true)}
          />
        </Card>

        {!isCompleted && (
          <Button className="w-full" onClick={() => onComplete(videoReady ? 95 : 85)}>
            <Check className="mr-2 h-4 w-4" />
            看完了，进入下一步
          </Button>
        )}
        {isCompleted && (
          <div className="flex items-center justify-center gap-1 text-sm text-primary">
            <CheckCircle className="h-4 w-4" /> 已完成
          </div>
        )}
      </div>
    );
  }

  // ── Video loading: show progress ──
  if (videoLoading && !fallbackMode) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-on-surface-variant">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm">正在生成教学视频...</span>
          <span className="text-xs text-on-surface-variant">
            {videoTaskId ? `任务 #${videoTaskId}` : '任务创建中'} · {Math.max(0, Math.min(99, videoProgress))}%
          </span>
        </div>
      </Card>
    );
  }

  // ── Fallback to animation ──
  if (fallbackMode === 'animation') {
    const scenes = m.visualStory?.scenes || m.videoLesson?.shots || [];
    const repairedScenes = repairLowInformationAnimationScenes(scenes);
    const canUseAnimationTemplates = scenesHaveAnimationTemplates(repairedScenes);

    if (canUseAnimationTemplates) {
      return (
        <div className="space-y-3">
          <Card className="p-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-on-surface-variant">视频暂不可用，使用动画模式</p>
              <button
                onClick={() => setVideoReloadKey((v) => v + 1)}
                className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
              >
                重试视频
              </button>
            </div>
          </Card>
          <AnimationWatchStep
            scenes={repairedScenes}
            isCompleted={isCompleted}
            onComplete={onComplete}
          />
        </div>
      );
    }
  }

  // ── Final fallback: text cards ──
  const scenes = m.visualStory?.scenes || m.videoLesson?.shots || [];
  return (
    <LegacyFallbackCards
      scenes={scenes}
      isCompleted={isCompleted}
      onComplete={onComplete}
      onRetryVideo={() => setVideoReloadKey((v) => v + 1)}
    />
  );
}
function AnimationWatchStep({
  scenes,
  isCompleted,
  onComplete,
}: {
  scenes: any[];
  isCompleted: boolean;
  onComplete: (score?: number) => void;
}) {
  // Lazy load AnimationScenePlayer to avoid loading p5/three.js upfront
  const [AnimationScenePlayer, setPlayer] = useState<React.ComponentType<{
    scenes: any[];
    isCompleted: boolean;
    onComplete: (score?: number) => void;
  }> | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);

  const mappedScenes = useMemo(
    () =>
      scenes.map((s: any) => ({
        templateId: s.animationTemplate || '',
        params: s.animationParams || {},
        narration: s.narration || '',
        onScreenText: s.onScreenText || '',
        durationSec: s.durationSec || 10,
      })),
    [scenes],
  );

  useEffect(() => {
    let cancelled = false;
    import('@/animations/components/AnimationScenePlayer').then((mod) => {
      if (!cancelled) setPlayer(() => mod.default);
    }).catch((err) => {
      console.error('[AnimationWatchStep] Failed to load AnimationScenePlayer:', err);
      if (!cancelled) {
        setLoadError(err instanceof Error ? err.message : String(err));
        setPlayer(() => () => null);
      }
    });
    return () => { cancelled = true; };
  }, []);

  if (loadError) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-on-surface-variant">
          <span className="text-sm text-error">动画加载失败: {loadError}</span>
          <span className="text-xs text-on-surface-variant">请刷新页面重试</span>
        </div>
      </Card>
    );
  }

  if (!AnimationScenePlayer) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-on-surface-variant">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm">正在加载动画引擎...</span>
        </div>
      </Card>
    );
  }

  return <AnimationScenePlayer scenes={mappedScenes} isCompleted={isCompleted} onComplete={onComplete} />;
}

// ─── Text-based Fallback Cards ───────────────────────────────────────
function LegacyFallbackCards({
  scenes,
  isCompleted,
  onComplete,
  onRetryVideo,
}: {
  scenes: any[];
  isCompleted: boolean;
  onComplete: (score?: number) => void;
  onRetryVideo: () => void;
}) {
  const [currentScene, setCurrentScene] = useState(0);

  const speakScene = useCallback((text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.rate = 0.85;
      window.speechSynthesis.speak(utterance);
    }
  }, []);

  const scene = scenes[currentScene];

  return (
    <div className="space-y-3">
      <Card className="p-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-on-surface-variant">使用文字讲解模式</p>
          <button
            onClick={onRetryVideo}
            className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
          >
            重试视频
          </button>
        </div>
      </Card>

      {scenes.length > 0 ? (
        <Card className="relative overflow-hidden">
          <div className="flex min-h-[200px] items-center justify-center bg-gradient-to-br from-primary-container/20 to-tertiary-container/20 p-6">
            <div className="text-center">
              <p className="text-lg font-medium text-on-surface">{scene?.caption || scene?.scene || `场景 ${currentScene + 1}`}</p>
              <p className="mt-2 text-sm text-on-surface-variant">{scene?.narration || ''}</p>
            </div>
          </div>
          <div className="flex items-center justify-between bg-surface-container-low px-4 py-2">
            <button
              onClick={() => speakScene(scene?.narration || '')}
              className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
            >
              🔊 朗读
            </button>
            <span className="text-xs text-on-surface-variant">{currentScene + 1} / {scenes.length}</span>
          </div>
          {scenes.length > 1 && (
            <div className="flex gap-2 p-3">
              <Button
                size="sm"
                className="flex-1 border border-primary/30"
                disabled={currentScene === 0}
                onClick={() => setCurrentScene((v) => v - 1)}
              >
                上一个
              </Button>
              <Button
                size="sm"
                className="flex-1"
                disabled={currentScene >= scenes.length - 1}
                onClick={() => setCurrentScene((v) => v + 1)}
              >
                下一个
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <Card className="p-6 text-center">
          <p className="text-on-surface-variant">暂无动画内容</p>
        </Card>
      )}

      {!isCompleted && (
        <Button className="w-full" onClick={() => onComplete(80)}>
          <Check className="mr-2 h-4 w-4" />
          看完了，进入下一步
        </Button>
      )}
    </div>
  );
}

// ─── Read Step ──────────────────────────────────────────────────────────

function ReadStep({ module: m, onComplete, isCompleted }: { module: any; onComplete: (score?: number) => void; isCompleted: boolean }) {
  const reading = m.reading || {};
  const keywords: string[] = reading.keywords || [];

  return (
    <div className="space-y-3">
      {reading.goal && (
        <p className="text-sm text-on-surface-variant">目标: {reading.goal}</p>
      )}

      <Card className="p-4">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-on-surface">
          {reading.text || '暂无阅读内容'}
        </p>
      </Card>

      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-on-surface-variant">关键词:</span>
          {keywords.map((kw, i) => (
            <span key={i} className="rounded-full bg-secondary-container/20 px-2 py-0.5 text-xs font-medium text-secondary">
              {kw}
            </span>
          ))}
        </div>
      )}

      {reading.questions?.length > 0 && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-medium text-on-surface">理解问题:</p>
          <ul className="space-y-1">
            {reading.questions.map((q: string, i: number) => (
              <li key={i} className="text-sm text-on-surface-variant">{i + 1}. {q}</li>
            ))}
          </ul>
        </Card>
      )}

      {!isCompleted && (
        <Button className="w-full" onClick={() => onComplete(85)}>
          <Check className="mr-2 h-4 w-4" />
          读完了，进入下一步
        </Button>
      )}
      {isCompleted && (
        <div className="flex items-center justify-center gap-1 text-sm text-primary">
          <CheckCircle className="h-4 w-4" /> 已完成
        </div>
      )}
    </div>
  );
}

// ─── Write Step ─────────────────────────────────────────────────────────

function WriteStep({ module: m, onComplete, isCompleted }: { module: any; onComplete: (score?: number, data?: Record<string, any>) => void; isCompleted: boolean }) {
  const sceneDocument = useMemo(() => resolveLessonSceneDocument('write', m), [m]);
  if (sceneDocument) {
    return (
      <LessonScenePlayer
        document={sceneDocument}
        isCompleted={isCompleted}
        onComplete={(score, data) => onComplete(score || 80, data)}
      />
    );
  }

  const writing = m.writing || {};
  const tracingItems: string[] = writing.tracingItems || [];
  const tasks: string[] = writing.practiceTasks || [];
  const checklist: string[] = writing.checklist || [];
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());

  return (
    <div className="space-y-3">
      {writing.goal && (
        <p className="text-sm text-on-surface-variant">目标: {writing.goal}</p>
      )}

      {tracingItems.length > 0 && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-medium text-on-surface">描红练习</p>
          <div className="flex flex-wrap gap-3">
            {tracingItems.map((item, i) => (
              <div key={i} className="flex h-12 w-12 items-center justify-center rounded-lg border-2 border-dashed border-outline-variant/30 text-lg font-bold text-on-surface">
                {item}
              </div>
            ))}
          </div>
        </Card>
      )}

      {tasks.length > 0 && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-medium text-on-surface">书写任务</p>
          <ul className="space-y-1">
            {tasks.map((task, i) => (
              <li key={i} className="text-sm text-on-surface-variant">{i + 1}. {task}</li>
            ))}
          </ul>
        </Card>
      )}

      {checklist.length > 0 && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-medium text-on-surface">自检清单</p>
          <div className="space-y-2">
            {checklist.map((item, i) => (
              <label key={i} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={checkedItems.has(i)}
                  onChange={() => {
                    setCheckedItems((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i); else next.add(i);
                      return next;
                    });
                  }}
                  className="h-4 w-4 rounded border-outline text-primary"
                />
                <span className="text-sm text-on-surface-variant">{item}</span>
              </label>
            ))}
          </div>
        </Card>
      )}

      {!isCompleted && (
        <Button className="w-full" onClick={() => onComplete(80, { checkedItems: Array.from(checkedItems) })}>
          <Check className="mr-2 h-4 w-4" />
          写完了，进入下一步
        </Button>
      )}
      {isCompleted && (
        <div className="flex items-center justify-center gap-1 text-sm text-primary">
          <CheckCircle className="h-4 w-4" /> 已完成
        </div>
      )}
    </div>
  );
}

// ─── Practice Step (Game) ───────────────────────────────────────────────

function PracticeStep({ module: m, onComplete, isCompleted }: { module: any; onComplete: (score: number, data?: Record<string, any>) => void; isCompleted: boolean }) {
  const sceneDocument = useMemo(() => resolveLessonSceneDocument('practice', m), [m]);
  if (sceneDocument) {
    return (
      <LessonScenePlayer
        document={sceneDocument}
        isCompleted={isCompleted}
        onComplete={(score, data) => onComplete(score || 85, data)}
      />
    );
  }

  const game = m.game || {};
  const gameType = normalizeActivityType(game.activityType || 'quiz', game.activityData);
  const gameData = normalizeActivityData(
    gameType,
    game.activityData || game || { type: gameType, title: '练习' },
  );

  if (isCompleted) {
    return (
      <div className="flex flex-col items-center gap-2 py-8">
        <CheckCircle className="h-10 w-10 text-primary" />
        <p className="text-sm font-medium text-primary">练习已完成</p>
      </div>
    );
  }

  return (
    <GameRenderer
      type={gameType}
      data={gameData}
      onComplete={(result: ActivityResult) => {
        onComplete(result.score, { gameResult: result });
      }}
    />
  );
}
