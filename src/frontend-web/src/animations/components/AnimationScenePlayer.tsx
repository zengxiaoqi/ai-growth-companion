/**
 * AnimationScenePlayer: Orchestrates scene-by-scene animation playback with TTS sync.
 * This replaces the video generation polling in WatchStep.
 */
import { useCallback, useEffect, useState } from 'react';
import type { AnimationSceneConfig } from '../types';
import { useAnimationPlayback } from '../hooks/useAnimationPlayback';
import { useTTSSync } from '../hooks/useTTSSync';
import AnimationRenderer from '../renderers/AnimationRenderer';
import SceneOverlay from './SceneOverlay';
import PlaybackControls from './PlaybackControls';
import { Card } from '@/components/ui';
import { Check, CheckCircle, Play } from '@/icons';

interface AnimationScenePlayerProps {
  scenes: AnimationSceneConfig[];
  isCompleted: boolean;
  onComplete: (score?: number) => void;
}

export default function AnimationScenePlayer({
  scenes,
  isCompleted,
  onComplete,
}: AnimationScenePlayerProps) {
  const tts = useTTSSync();
  const [showNarration, setShowNarration] = useState(true);
  const [allWatched, setAllWatched] = useState(false);

  // Expose TTS playing state so the playback hook can wait for it before advancing
  const isTTSAudioPlayingFn = useCallback(() => tts.isPlaying, [tts.isPlaying]);

  const playback = useAnimationPlayback({
    scenes,
    onAllScenesComplete: () => {},
    isTTSAudioPlaying: isTTSAudioPlayingFn,
  });

  const currentScene = playback.currentScene;

  // Preload TTS when scene changes
  useEffect(() => {
    if (currentScene?.narration) {
      tts.preload(currentScene.narration);
    }
  }, [playback.currentSceneIndex, currentScene?.narration]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-play TTS when playback starts
  useEffect(() => {
    if (playback.playbackState === 'playing' && tts.isLoaded) {
      tts.play();
    }
    if (playback.playbackState === 'paused') {
      tts.pause();
    }
  }, [playback.playbackState, tts.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track if all scenes have been watched
  useEffect(() => {
    if (playback.currentSceneIndex >= scenes.length - 1 && playback.playbackState === 'done') {
      setAllWatched(true);
    }
  }, [playback.currentSceneIndex, playback.playbackState, scenes.length]);

  const handlePlayPause = useCallback(() => {
    if (playback.playbackState === 'playing') {
      playback.pause();
    } else {
      playback.play();
    }
  }, [playback]);

  const handleToggleTTS = useCallback(() => {
    if (tts.isPlaying) {
      tts.pause();
      setShowNarration(false);
    } else {
      tts.play();
      setShowNarration(true);
    }
  }, [tts]);

  // Tap-to-start overlay for mobile autoplay restriction
  if (playback.needsUserTap) {
    return (
      <div className="space-y-3">
        <Card
          className="relative flex h-56 cursor-pointer items-center justify-center overflow-hidden bg-gradient-to-br from-primary-container/30 to-tertiary-container/30"
          onClick={() => playback.play()}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-full bg-primary/20 p-4">
              <Play className="h-8 w-8 text-primary" />
            </div>
            <span className="text-sm font-medium text-on-surface">点击开始播放动画</span>
            {currentScene?.onScreenText && (
              <span className="text-lg font-bold text-on-surface">{currentScene.onScreenText}</span>
            )}
          </div>
        </Card>
        {isCompleted && (
          <div className="flex items-center justify-center gap-1 text-sm text-primary">
            <CheckCircle className="h-4 w-4" /> 已完成
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Animation canvas */}
      <div className="relative">
        {currentScene && (
          <AnimationRenderer
            config={currentScene}
            isPlaying={playback.playbackState === 'playing'}
            onSceneComplete={playback.onSceneComplete}
          />
        )}
        <SceneOverlay
          onScreenText={currentScene?.onScreenText}
          narration={currentScene?.narration}
          showNarration={showNarration && tts.isPlaying}
        />
      </div>

      {/* Playback controls */}
      <PlaybackControls
        isPlaying={playback.playbackState === 'playing'}
        onPlayPause={handlePlayPause}
        onPrev={playback.prevScene}
        onNext={playback.nextScene}
        hasPrev={playback.currentSceneIndex > 0}
        hasNext={playback.currentSceneIndex < scenes.length - 1}
        currentScene={playback.currentSceneIndex}
        totalScenes={scenes.length}
        ttsPlaying={tts.isPlaying}
        onToggleTTS={handleToggleTTS}
      />

      {/* Progress dots */}
      <div className="flex justify-center gap-1">
        {scenes.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === playback.currentSceneIndex
                ? 'w-6 bg-primary'
                : i < playback.currentSceneIndex
                  ? 'w-1.5 bg-primary/40'
                  : 'w-1.5 bg-surface-container-highest'
            }`}
          />
        ))}
      </div>

      {/* Complete button */}
      {!isCompleted && allWatched && (
        <button
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-on-primary"
          onClick={() => onComplete(95)}
        >
          <Check className="h-4 w-4" />
          看完了，进入下一步
        </button>
      )}

      {/* Allow skip even without watching all */}
      {!isCompleted && !allWatched && playback.currentSceneIndex >= scenes.length - 1 && (
        <button
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-on-primary"
          onClick={() => onComplete(85)}
        >
          <Check className="h-4 w-4" />
          看完了，进入下一步
        </button>
      )}

      {isCompleted && (
        <div className="flex items-center justify-center gap-1 text-sm text-primary">
          <CheckCircle className="h-4 w-4" /> 已完成
        </div>
      )}
    </div>
  );
}
