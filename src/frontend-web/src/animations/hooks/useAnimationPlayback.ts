/**
 * Animation playback state machine.
 * Manages scene sequencing, timing, and auto-advance logic.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import type { AnimationSceneConfig, PlaybackState } from '../types';

interface UseAnimationPlaybackOptions {
  scenes: AnimationSceneConfig[];
  onAllScenesComplete?: () => void;
}

export interface AnimationPlayback {
  currentSceneIndex: number;
  playbackState: PlaybackState;
  currentScene: AnimationSceneConfig | null;
  sceneProgress: number; // 0-1
  play: () => void;
  pause: () => void;
  nextScene: () => void;
  prevScene: () => void;
  goToScene: (index: number) => void;
  onSceneComplete: () => void;
  needsUserTap: boolean;
}

export function useAnimationPlayback({
  scenes,
  onAllScenesComplete,
}: UseAnimationPlaybackOptions): AnimationPlayback {
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [playbackState, setPlaybackState] = useState<PlaybackState>('loading');
  const [sceneProgress, setSceneProgress] = useState(0);
  const [needsUserTap, setNeedsUserTap] = useState(true);
  const sceneCompleteRef = useRef(false);

  const currentScene = scenes[currentSceneIndex] || null;

  // Mark as ready once we have scenes
  useEffect(() => {
    if (scenes.length > 0 && playbackState === 'loading') {
      setPlaybackState('ready');
      setNeedsUserTap(true);
    }
  }, [scenes.length, playbackState]);

  const play = useCallback(() => {
    setPlaybackState('playing');
    setNeedsUserTap(false);
    sceneCompleteRef.current = false;
    setSceneProgress(0);
  }, []);

  const pause = useCallback(() => {
    setPlaybackState('paused');
  }, []);

  const advanceToScene = useCallback((index: number) => {
    if (index >= scenes.length) {
      setPlaybackState('done');
      onAllScenesComplete?.();
      return;
    }
    setCurrentSceneIndex(index);
    setPlaybackState('ready');
    setSceneProgress(0);
    sceneCompleteRef.current = false;
    setNeedsUserTap(false); // Auto-advance after first user tap
  }, [scenes.length, onAllScenesComplete]);

  const onSceneComplete = useCallback(() => {
    if (sceneCompleteRef.current) return;
    sceneCompleteRef.current = true;
    setSceneProgress(1);
    // Auto advance after a short delay
    setTimeout(() => {
      advanceToScene(currentSceneIndex + 1);
    }, 500);
  }, [currentSceneIndex, advanceToScene]);

  const nextScene = useCallback(() => {
    advanceToScene(Math.min(currentSceneIndex + 1, scenes.length));
  }, [currentSceneIndex, advanceToScene]);

  const prevScene = useCallback(() => {
    advanceToScene(Math.max(currentSceneIndex - 1, 0));
  }, [currentSceneIndex, advanceToScene]);

  const goToScene = useCallback((index: number) => {
    if (index >= 0 && index < scenes.length) {
      advanceToScene(index);
    }
  }, [scenes.length, advanceToScene]);

  return {
    currentSceneIndex,
    playbackState,
    currentScene,
    sceneProgress,
    play,
    pause,
    nextScene,
    prevScene,
    goToScene,
    onSceneComplete,
    needsUserTap,
  };
}
