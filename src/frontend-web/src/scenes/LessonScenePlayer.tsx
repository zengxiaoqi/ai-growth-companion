import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActivityResult, LaunchActivityInteraction, LessonSceneDocument, TracePathInteraction } from '@/types';
import { Button, Card } from '@/components/ui';
import GameRenderer from '@/components/games/GameRenderer';
import { Check, CheckCircle, ChevronLeft, ChevronRight, Pause, Play, Volume2 } from '@/icons';
import { useGameVoice } from '@/hooks/useGameVoice';
import SceneRenderer from './SceneRenderer';
import TracePathCanvas from './TracePathCanvas';

interface LessonScenePlayerProps {
  document: LessonSceneDocument;
  isCompleted: boolean;
  onComplete: (score?: number, data?: Record<string, any>) => void;
  previewMode?: boolean;
}

export default function LessonScenePlayer({
  document,
  isCompleted,
  onComplete,
  previewMode = false,
}: LessonScenePlayerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [traceResults, setTraceResults] = useState<Record<string, { coverage: number; attempts: number; score: number }>>({});
  const [activityResult, setActivityResult] = useState<ActivityResult | null>(null);
  const [shellReady, setShellReady] = useState(false);
  const { speak: voiceSpeak, stop: voiceStop, isPlaying: voiceIsPlaying } = useGameVoice();
  // Keep refs to voice functions so effects can use them without them being dependencies
  const voiceSpeakRef = useRef(voiceSpeak);
  voiceSpeakRef.current = voiceSpeak;
  const voiceStopRef = useRef(voiceStop);
  voiceStopRef.current = voiceStop;
  // Keep a ref to voiceIsPlaying so interval callbacks see the latest value
  const voiceIsPlayingRef = useRef(voiceIsPlaying);
  voiceIsPlayingRef.current = voiceIsPlaying;

  const scenes = document.scenes || [];
  const currentScene = scenes[currentIndex] || null;
  const isLastScene = currentIndex >= scenes.length - 1;
  const completionPolicy = document.completionPolicy;

  const averageTraceScore = useMemo(() => {
    const values = Object.values(traceResults);
    if (values.length === 0) return 0;
    return Math.round(values.reduce((sum, item) => sum + item.score, 0) / values.length);
  }, [traceResults]);

  const canFinishGuidedTrace = document.mode === 'guided_trace'
    && Object.keys(traceResults).length >= scenes.length
    && averageTraceScore > 0;

  const canFinishPractice = document.mode === 'activity_shell' && !!activityResult && isLastScene;
  const canFinishPlayback = document.mode === 'playback' && hasStarted && isLastScene;

  const nextScene = useCallback(() => {
    setCurrentIndex((prev) => Math.min(prev + 1, scenes.length - 1));
  }, [scenes.length]);

  const prevScene = useCallback(() => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const startPlayback = useCallback(() => {
    setHasStarted(true);
    setIsPlaying(true);
  }, []);

  const speakCurrentScene = useCallback(() => {
    if (currentScene?.narration) {
      voiceSpeakRef.current(currentScene.narration);
    }
  }, [currentScene?.narration]);

  // Playback auto-advance: wait for the longer of (durationSec) or (TTS audio)
  // Cleanup is tracked via a ref so inner polls are always cancelled on unmount or scene change.
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voicePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advancedRef = useRef(false);

  // Cleanup helpers
  const clearAllTimers = useCallback(() => {
    if (advanceTimerRef.current) { clearTimeout(advanceTimerRef.current); advanceTimerRef.current = null; }
    if (voicePollRef.current) { clearInterval(voicePollRef.current); voicePollRef.current = null; }
    if (safetyTimerRef.current) { clearTimeout(safetyTimerRef.current); safetyTimerRef.current = null; }
  }, []);

  useEffect(() => {
    if (document.mode !== 'playback' || !isPlaying || !currentScene) return;

    // Stop previous TTS before starting new one to prevent overlap
    voiceStopRef.current();
    speakCurrentScene();

    advancedRef.current = false;
    const durationMs = currentScene.durationSec * 1000;

    const doAdvance = () => {
      if (advancedRef.current) return;
      advancedRef.current = true;
      clearAllTimers();
      if (isLastScene) {
        setIsPlaying(false);
      } else {
        setCurrentIndex((ci) => ci + 1);
      }
    };

    // Timer for the visual duration
    advanceTimerRef.current = window.setTimeout(() => {
      // If TTS is still playing, wait for it to finish before advancing
      if (voiceIsPlayingRef.current) {
        voicePollRef.current = setInterval(() => {
          if (!voiceIsPlayingRef.current) {
            doAdvance();
          }
        }, 150);
        // Safety: max 8s extra wait
        safetyTimerRef.current = window.setTimeout(doAdvance, 8000);
      } else {
        doAdvance();
      }
    }, durationMs);

    return clearAllTimers;
  }, [currentScene, document.mode, isLastScene, isPlaying, speakCurrentScene, clearAllTimers]);

  useEffect(() => {
    if (document.mode === 'activity_shell') {
      setShellReady(false);
    }
  }, [currentIndex, document.mode]);

  const handleTraceSolved = useCallback((result: { coverage: number; attempts: number; score: number }) => {
    if (!currentScene) return;
    setTraceResults((prev) => ({ ...prev, [currentScene.id]: result }));
  }, [currentScene]);

  const handleActivityComplete = useCallback((result: ActivityResult) => {
    setActivityResult(result);
    setShellReady(true);
    if (!isLastScene) {
      window.setTimeout(() => {
        setCurrentIndex((prev) => Math.min(prev + 1, scenes.length - 1));
      }, 500);
    }
  }, [isLastScene, scenes.length]);

  const handleFinish = useCallback(() => {
    if (document.mode === 'guided_trace') {
      onComplete(averageTraceScore || 80, {
        sceneMode: 'guided_trace',
        traceResults,
      });
      return;
    }

    if (document.mode === 'activity_shell') {
      onComplete(activityResult?.score || completionPolicy?.passingScore || 85, {
        sceneMode: 'activity_shell',
        activityResult,
      });
      return;
    }

    onComplete(completionPolicy?.passingScore || 90, {
      sceneMode: 'playback',
      viewedScenes: scenes.map((scene) => scene.id),
    });
  }, [activityResult, averageTraceScore, completionPolicy?.passingScore, document.mode, onComplete, scenes, traceResults]);

  if (!currentScene) {
    return (
      <Card className="p-6 text-center">
        <p className="text-on-surface-variant">暂无场景内容</p>
        {!isCompleted && !previewMode && (
          <Button className="mt-4" onClick={() => onComplete(80)}>
            完成此步骤
          </Button>
        )}
      </Card>
    );
  }

  const traceInteraction = currentScene.interaction?.type === 'trace_path'
    ? currentScene.interaction as TracePathInteraction
    : null;
  const activityInteraction = currentScene.interaction?.type === 'launch_activity'
    ? currentScene.interaction as LaunchActivityInteraction
    : null;

  return (
    <div className="space-y-4">
      {document.mode === 'playback' && !hasStarted ? (
        <Card
          className="cursor-pointer overflow-hidden border-outline-variant/20 p-0"
          onClick={startPlayback}
        >
          <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 bg-gradient-to-br from-primary-container/30 to-tertiary-container/25 px-6 py-10 text-center">
            <div className="rounded-full bg-primary/15 p-4">
              <Play className="h-8 w-8 text-primary" />
            </div>
            <p className="text-sm font-semibold text-on-surface">点击开始播放场景</p>
            <p className="text-xl font-black text-on-surface">{currentScene.onScreenText || currentScene.title}</p>
          </div>
        </Card>
      ) : (
        <>
          <SceneRenderer scene={currentScene} isPlaying={document.mode === 'playback' ? isPlaying : true} />

          {traceInteraction?.targets?.[0] && (
            <TracePathCanvas
              target={traceInteraction.targets[0]}
              minCoverage={traceInteraction.minCoverage || completionPolicy?.minCoverage || 0.7}
              onSolved={handleTraceSolved}
            />
          )}

          {activityInteraction && (
            <Card className="space-y-4 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-on-surface">{activityInteraction.prompt || '互动练习'}</p>
                  <p className="text-xs text-on-surface-variant">完成小游戏后会自动进入反馈场景</p>
                </div>
                <button
                  type="button"
                  onClick={speakCurrentScene}
                  className="rounded-full bg-primary/10 p-2 text-primary"
                >
                  <Volume2 className="h-4 w-4" />
                </button>
              </div>
              <GameRenderer
                type={activityInteraction.activityType}
                data={activityInteraction.activityData}
                onComplete={handleActivityComplete}
              />
              {shellReady && (
                <div className="rounded-2xl bg-primary-container/20 px-4 py-3 text-sm font-medium text-primary">
                  练习完成，正在进入反馈场景
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {document.mode !== 'activity_shell' && currentScene.narration && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={speakCurrentScene}
            className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"
          >
            <Volume2 className="h-3.5 w-3.5" />
            朗读提示
          </button>
        </div>
      )}

      {document.mode === 'playback' && hasStarted && (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={prevScene}
            disabled={currentIndex === 0}
            className="inline-flex items-center gap-1 rounded-full bg-surface-container px-3 py-2 text-xs text-on-surface-variant disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            上一幕
          </button>
          <button
            type="button"
            onClick={() => setIsPlaying((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-on-primary"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {isPlaying ? '暂停' : '播放'}
          </button>
          <button
            type="button"
            onClick={nextScene}
            disabled={isLastScene}
            className="inline-flex items-center gap-1 rounded-full bg-surface-container px-3 py-2 text-xs text-on-surface-variant disabled:opacity-40"
          >
            下一幕
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {document.mode !== 'playback' && !activityInteraction && (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={prevScene}
            disabled={currentIndex === 0}
            className="inline-flex items-center gap-1 rounded-full bg-surface-container px-3 py-2 text-xs text-on-surface-variant disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            上一步
          </button>
          <span className="text-xs text-on-surface-variant">{currentIndex + 1} / {scenes.length}</span>
          <button
            type="button"
            onClick={nextScene}
            disabled={
              isLastScene
              || (document.mode === 'guided_trace' && !traceResults[currentScene.id])
            }
            className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-on-primary disabled:opacity-40"
          >
            下一步
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex justify-center gap-1">
        {scenes.map((scene, index) => (
          <span
            key={scene.id}
            className={`h-1.5 rounded-full transition-all ${
              index === currentIndex ? 'w-6 bg-primary' : 'w-1.5 bg-surface-container-highest'
            }`}
          />
        ))}
      </div>

      {!previewMode && !isCompleted && (canFinishPlayback || canFinishGuidedTrace || canFinishPractice) && (
        <Button className="w-full" onClick={handleFinish}>
          <Check className="mr-2 h-4 w-4" />
          完成此步骤
        </Button>
      )}

      {!previewMode && isCompleted && (
        <div className="flex items-center justify-center gap-2 text-sm text-primary">
          <CheckCircle className="h-4 w-4" />
          已完成
        </div>
      )}
    </div>
  );
}
