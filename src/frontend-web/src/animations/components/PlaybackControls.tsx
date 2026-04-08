/**
 * Playback controls for animation scenes.
 */
import { Play, Pause, ChevronLeft, ChevronRight, Volume2, VolumeX } from '@/icons';

interface PlaybackControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  currentScene: number;
  totalScenes: number;
  ttsPlaying: boolean;
  onToggleTTS: () => void;
}

export default function PlaybackControls({
  isPlaying,
  onPlayPause,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  currentScene,
  totalScenes,
  ttsPlaying,
  onToggleTTS,
}: PlaybackControlsProps) {
  return (
    <div className="flex items-center justify-between bg-surface-container-low rounded-xl px-4 py-2">
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleTTS}
          className="flex items-center gap-1 rounded-full bg-surface-container px-3 py-1.5 text-xs text-on-surface-variant transition-colors hover:bg-surface-container-high"
        >
          {ttsPlaying ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          {ttsPlaying ? '朗读中' : '朗读'}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          disabled={!hasPrev}
          className="rounded-full bg-surface-container p-1.5 text-on-surface-variant disabled:opacity-30 transition-colors hover:bg-surface-container-high"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <button
          onClick={onPlayPause}
          className="rounded-full bg-primary px-4 py-1.5 text-on-primary transition-colors hover:bg-primary/90"
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>

        <button
          onClick={onNext}
          disabled={!hasNext}
          className="rounded-full bg-surface-container p-1.5 text-on-surface-variant disabled:opacity-30 transition-colors hover:bg-surface-container-high"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <span className="text-xs text-on-surface-variant">
        {currentScene + 1} / {totalScenes}
      </span>
    </div>
  );
}
