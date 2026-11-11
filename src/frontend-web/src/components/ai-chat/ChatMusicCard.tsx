import { Music, Pause, Play } from '@/icons';
import type { MusicTrack } from '@/types';
import { cn } from '@/lib/utils';

interface ChatMusicCardProps {
  tracks: MusicTrack[];
  activeTrackIndex: number;
  isPlaying: boolean;
  hasError: boolean;
  onPlayTrack: (index: number) => void;
}

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ChatMusicCard({
  tracks,
  activeTrackIndex,
  isPlaying,
  hasError,
  onPlayTrack,
}: ChatMusicCardProps) {
  if (tracks.length === 0) return null;
  return (
    <div className="mt-2 rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-on-surface-variant">
        <Music className="h-4 w-4 text-primary" />
        <span>点歌</span>
      </div>
      <ul className="space-y-1.5">
        {tracks.map((track, i) => {
          const isActive = i === activeTrackIndex;
          return (
            <li key={`${track.url}-${i}`}>
              <button
                onClick={() => onPlayTrack(i)}
                className={cn(
                  'flex min-h-[44px] w-full items-center gap-2.5 rounded-xl p-2 text-left tactile-press transition-colors',
                  isActive ? 'bg-primary-container/40' : 'hover:bg-surface-container',
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary-container text-on-secondary-container">
                  <Music className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-on-surface">
                    {track.title}
                  </span>
                  <span className="block truncate text-xs text-on-surface-variant">
                    {track.artist}
                  </span>
                </span>
                {track.duration_s ? (
                  <span className="shrink-0 text-xs tabular-nums text-on-surface-variant">
                    {fmt(track.duration_s)}
                  </span>
                ) : null}
                {isActive && isPlaying ? (
                  <Pause className="h-6 w-6 shrink-0 text-primary" />
                ) : (
                  <Play className="h-6 w-6 shrink-0 text-primary" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {hasError && (
        <p className="mt-2 text-center text-xs font-semibold text-error">播放失败，换一首试试</p>
      )}
    </div>
  );
}